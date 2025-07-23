import { LoggerService } from '@backstage/backend-plugin-api';
import { spawn, ChildProcess } from 'child_process';
import { RunnerConfig } from '../RunnerService/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DockerUtils, DockerConfig } from '../../utils/dockerUtils';

export class DockerService {
  private processes = new Map<string, ChildProcess>();
  private buildCache = new Map<string, string>(); // Cache built images
  private initialized = false;
  private config: DockerConfig;

  constructor(private logger: LoggerService, config?: Partial<DockerConfig>) {
    this.config = { ...DockerUtils.getDefaultDockerConfig(), ...config };
  }

  /**
   * Initialize Docker service and verify Docker availability
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing Docker service...');

    const systemInfo = await DockerUtils.getDockerSystemInfo(this.logger);

    if (!systemInfo.available) {
      throw new Error('Docker is not available. Please install Docker and ensure it is in PATH.');
    }

    if (!systemInfo.daemonRunning) {
      throw new Error('Docker daemon is not running. Please start Docker.');
    }

    this.logger.info(`Docker service initialized successfully (version: ${systemInfo.version})`);
    this.initialized = true;
  }

  /**
   * Get Docker configuration
   */
  getConfig(): DockerConfig {
    return { ...this.config };
  }

  /**
   * Update Docker configuration
   */
  updateConfig(newConfig: Partial<DockerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Docker configuration updated');
  }

  async buildImage(
    repoPath: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
    await this.ensureInitialized();

    const imageName = `runner-${instanceId}`;

    // Check if Dockerfile exists
    const dockerfilePath = path.join(repoPath, config.dockerfile);
    try {
      await fs.access(dockerfilePath);
    } catch {
      throw new Error(`Dockerfile not found at: ${config.dockerfile}`);
    }

    // Check for cached image
    const cacheKey = `${repoPath}-${config.dockerfile}`;
    if (this.buildCache.has(cacheKey)) {
      const cachedImage = this.buildCache.get(cacheKey)!;
      this.logger.info(`Using cached image: ${cachedImage}`);
      return cachedImage;
    }

    return new Promise((resolve, reject) => {
      const buildArgs = config.build?.args
        ? Object.entries(config.build.args).flatMap(([key, value]) => ['--build-arg', `${key}=${value}`])
        : [];

      const dockerBuild = spawn('docker', [
        'build',
        '-t', imageName,
        '-f', config.dockerfile,
        ...buildArgs,
        config.build?.context || '.'
      ], {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      dockerBuild.stdout?.on('data', (data) => {
        const message = data.toString();
        output += message;
        this.logger.debug(`Docker build stdout: ${message.trim()}`);
      });

      dockerBuild.stderr?.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        this.logger.debug(`Docker build stderr: ${message.trim()}`);
      });

      dockerBuild.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`Successfully built image: ${imageName}`);
          this.buildCache.set(cacheKey, imageName);
          resolve(imageName);
        } else {
          this.logger.error(`Docker build failed with code ${code}`);
          this.logger.error(`Build output: ${output}`);
          this.logger.error(`Build errors: ${errorOutput}`);

          // Cleanup on error if configured
          if (this.config.imageCleanupPolicy === 'on-error' || this.config.imageCleanupPolicy === 'always') {
            DockerUtils.cleanupImage(imageName, this.logger).catch(() => {
              // Ignore cleanup errors
            });
          }

          reject(new Error(`Docker build failed: ${errorOutput || output}`));
        }
      });

      dockerBuild.on('error', (error) => {
        this.logger.error(`Docker build process error: ${error.message}`);
        reject(new Error(`Docker build process failed: ${error.message}`));
      });

      // Set timeout for build process
      const buildTimeout = setTimeout(() => {
        dockerBuild.kill('SIGTERM');
        reject(new Error(`Docker build timed out after ${this.config.buildTimeout / 1000} seconds`));
      }, this.config.buildTimeout);

      dockerBuild.on('close', () => {
        clearTimeout(buildTimeout);
      });
    });
  }

  async runContainer(
    imageName: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
    await this.ensureInitialized();

    const containerName = `runner-container-${instanceId}`;

    // Check for port conflicts
    await this.checkPortAvailability(config.ports);

    const portMappings = config.ports.flatMap(port => ['-p', `0.0.0.0:${port}:${port}`]);
    const envVars = config.environment
      ? Object.entries(config.environment).flatMap(([key, value]) => ['-e', `${key}=${value}`])
      : [];

    // Add resource limits
    const resourceArgs = this.buildResourceArgs();

    // Add security options
    const securityArgs = this.config.securityOptions;

    return new Promise((resolve, reject) => {
      const dockerRun = spawn('docker', [
        'run',
        '--name', containerName,
        '--rm',
        '-d',
        ...resourceArgs,
        ...securityArgs,
        ...portMappings,
        ...envVars,
        imageName
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let containerId = '';
      let errorOutput = '';

      // Set timeout for container start
      const runTimeout = setTimeout(() => {
        if (dockerRun.kill) {
          dockerRun.kill('SIGTERM');
        }
        reject(new Error(`Container start timed out after ${this.config.runTimeout / 1000} seconds`));
      }, this.config.runTimeout);

      dockerRun.stdout?.on('data', (data) => {
        containerId += data.toString().trim();
      });

      dockerRun.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        this.logger.error(`Docker run error: ${data}`);
      });

      dockerRun.on('close', (code) => {
        clearTimeout(runTimeout);
        if (code === 0 && containerId) {
          this.logger.info(`Container started: ${containerId}`);
          this.processes.set(instanceId, dockerRun);
          resolve(containerId);
        } else {
          reject(new Error(`Failed to start container: ${errorOutput}`));
        }
      });

      dockerRun.on('error', (error) => {
        clearTimeout(runTimeout);
        reject(new Error(`Docker run process failed: ${error.message}`));
      });
    });
  }

  async stopContainer(containerId: string, instanceId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dockerStop = spawn('docker', ['stop', containerId]);

      dockerStop.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`Container stopped: ${containerId}`);
          if (instanceId) {
            this.processes.delete(instanceId);
          }
          resolve();
        } else {
          reject(new Error(`Failed to stop container: ${containerId}`));
        }
      });

      dockerStop.on('error', (error) => {
        reject(new Error(`Docker stop process failed: ${error.message}`));
      });

      // Force kill after 30 seconds
      setTimeout(() => {
        DockerUtils.killContainer(containerId, this.logger).then(() => {
          if (instanceId) {
            this.processes.delete(instanceId);
          }
          resolve();
        }).catch(() => {
          reject(new Error(`Failed to stop container: ${containerId}`));
        });
      }, 30000);
    });
  }

  async getContainerLogs(
    containerId: string,
    options: { follow?: boolean; tail?: number } = {}
  ): Promise<string | NodeJS.ReadableStream> {
    const args = ['logs'];
    
    if (options.follow) args.push('-f');
    if (options.tail) args.push('--tail', options.tail.toString());
    
    args.push(containerId);

    if (options.follow) {
      // Return stream for real-time logs
      const dockerLogs = spawn('docker', args);
      return dockerLogs.stdout;
    }

    // Return string for static logs
    return new Promise((resolve, reject) => {
      const dockerLogs = spawn('docker', args);
      let logs = '';

      dockerLogs.stdout?.on('data', (data) => {
        logs += data.toString();
      });

      dockerLogs.on('close', (code) => {
        if (code === 0) {
          resolve(logs);
        } else {
          reject(new Error('Failed to get container logs'));
        }
      });
    });
  }

  async isContainerRunning(containerId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const dockerPs = spawn('docker', ['ps', '-q', '--filter', `id=${containerId}`]);
      let output = '';

      dockerPs.stdout?.on('data', (data) => {
        output += data.toString();
      });

      dockerPs.on('close', () => {
        resolve(output.trim().length > 0);
      });
    });
  }

  /**
   * Get container statistics
   */
  async getContainerStats(containerId: string): Promise<any> {
    try {
      return await DockerUtils.getContainerStats(containerId);
    } catch (error) {
      this.logger.warn(`Failed to get container stats for ${containerId}:`, error as any);
      return null;
    }
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Starting Docker service cleanup...');

    // Stop all running processes
    const stopPromises = Array.from(this.processes.entries()).map(async ([instanceId, process]) => {
      try {
        process.kill('SIGTERM');
        this.processes.delete(instanceId);
      } catch (error) {
        this.logger.warn(`Failed to stop process for instance ${instanceId}:`, error as any);
      }
    });

    await Promise.all(stopPromises);

    // Cleanup images if configured
    if (this.config.imageCleanupPolicy === 'always') {
      const cleanupPromises = Array.from(this.buildCache.values()).map(imageName =>
        DockerUtils.cleanupImage(imageName, this.logger)
      );
      await Promise.all(cleanupPromises);
    }

    this.buildCache.clear();
    this.logger.info('Docker service cleanup completed');
  }

  /**
   * Ensure Docker service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Check port availability
   */
  private async checkPortAvailability(ports: number[]): Promise<void> {
    const portResults = await DockerUtils.checkPortsAvailable(ports);
    const unavailablePorts = portResults.filter(result => !result.available);

    if (unavailablePorts.length > 0) {
      const portList = unavailablePorts.map(p => p.port).join(', ');
      throw new Error(`Ports already in use: ${portList}`);
    }
  }

  /**
   * Build resource arguments for Docker run command
   */
  private buildResourceArgs(): string[] {
    const args: string[] = [];
    const limits = this.config.resourceLimits;

    if (limits.memory) {
      args.push('--memory', limits.memory);
    }

    if (limits.cpus) {
      args.push('--cpus', limits.cpus);
    }

    if (limits.timeout) {
      args.push('--stop-timeout', limits.timeout.toString());
    }

    return args;
  }
}
