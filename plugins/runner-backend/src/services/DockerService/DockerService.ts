import { LoggerService } from '@backstage/backend-plugin-api';
import { spawn } from 'child_process';
import { RunnerConfig } from '../RunnerService/types';

export class DockerService {
  constructor(private logger: LoggerService) {}

  async buildImage(
    repoPath: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
    const imageName = `runner-${instanceId}`;
    
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
      dockerBuild.stdout?.on('data', (data) => {
        output += data.toString();
        this.logger.debug(`Docker build: ${data}`);
      });

      dockerBuild.stderr?.on('data', (data) => {
        output += data.toString();
        this.logger.warn(`Docker build error: ${data}`);
      });

      dockerBuild.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`Successfully built image: ${imageName}`);
          resolve(imageName);
        } else {
          this.logger.error(`Docker build failed with code ${code}: ${output}`);
          reject(new Error(`Docker build failed: ${output}`));
        }
      });
    });
  }

  async runContainer(
    imageName: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
    const containerName = `runner-container-${instanceId}`;
    
    const portMappings = config.ports.flatMap(port => ['-p', `${port}:${port}`]);
    const envVars = config.environment 
      ? Object.entries(config.environment).flatMap(([key, value]) => ['-e', `${key}=${value}`])
      : [];

    return new Promise((resolve, reject) => {
      const dockerRun = spawn('docker', [
        'run',
        '--name', containerName,
        '--rm',
        '-d',
        ...portMappings,
        ...envVars,
        imageName
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let containerId = '';
      dockerRun.stdout?.on('data', (data) => {
        containerId += data.toString().trim();
      });

      dockerRun.stderr?.on('data', (data) => {
        this.logger.error(`Docker run error: ${data}`);
      });

      dockerRun.on('close', (code) => {
        if (code === 0 && containerId) {
          this.logger.info(`Container started: ${containerId}`);
          resolve(containerId);
        } else {
          reject(new Error('Failed to start container'));
        }
      });
    });
  }

  async stopContainer(containerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const dockerStop = spawn('docker', ['stop', containerId]);
      
      dockerStop.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`Container stopped: ${containerId}`);
          resolve();
        } else {
          reject(new Error(`Failed to stop container: ${containerId}`));
        }
      });
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
}
