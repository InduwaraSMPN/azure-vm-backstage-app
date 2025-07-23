import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { RunnerService, RunnerInstance, RunnerConfig } from './types';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';
import { ContainerMonitoringService } from '../ContainerMonitoringService';
import { ErrorHandlingService, ErrorContext } from '../ErrorHandlingService';
import { Octokit } from '@octokit/rest';
import { ScmIntegrations } from '@backstage/integration';
import { Config } from '@backstage/config';
import crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as tar from 'tar-fs';
import { createGunzip } from 'zlib';


export class RunnerServiceImpl implements RunnerService {
  private instances = new Map<string, RunnerInstance>();
  private currentInstance: string | null = null; // Only one instance at a time
  private monitoringService: ContainerMonitoringService;
  private errorHandlingService: ErrorHandlingService;
  private scmIntegrations: ScmIntegrations;

  constructor(
    private logger: LoggerService,
    private dockerService: DockerService,
    private configService: ConfigService,
    private config: Config
  ) {
    this.monitoringService = new ContainerMonitoringService(logger, dockerService);
    this.errorHandlingService = new ErrorHandlingService(logger);
    this.scmIntegrations = ScmIntegrations.fromConfig(this.config);
  }

  async startComponent(entity: Entity): Promise<RunnerInstance> {
    // Check if another instance is already running
    if (this.currentInstance) {
      const current = this.instances.get(this.currentInstance);
      if (current && current.status === 'running') {
        throw new Error('Another component is already running. Stop it first.');
      }
    }

    const instanceId = crypto.randomUUID();
    const componentRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;

    // Create initial instance record
    const instance: RunnerInstance = {
      id: instanceId,
      componentRef,
      status: 'starting',
      ports: [],
      startedAt: new Date().toISOString()
    };

    this.instances.set(instanceId, instance);
    this.currentInstance = instanceId;

    try {
      // Get runner configuration
      const config = await this.configService.getRunnerConfig(entity);
      instance.ports = config.ports;

      // Download repository to temporary directory using Backstage's GitHub integration
      const repoPath = await this.cloneRepository(entity);

      // Build Docker image
      const imageName = await this.dockerService.buildImage(repoPath, config, instanceId);

      // Run container
      const containerId = await this.dockerService.runContainer(imageName, config, instanceId);
      instance.containerId = containerId;
      instance.status = 'running';

      this.logger.info(`Started component ${componentRef} with instance ${instanceId}`);

      // Start health check monitoring
      this.startHealthCheck(instance, config);

      // Start container monitoring
      this.monitoringService.startMonitoring(instance);

      return instance;
    } catch (error) {
      const context: ErrorContext = {
        operation: 'startComponent',
        instanceId,
        componentRef,
        timestamp: new Date().toISOString(),
        metadata: { ports: instance.ports }
      };

      const runnerError = this.errorHandlingService.handleError(error instanceof Error ? error : new Error(String(error)), context);

      instance.status = 'error';
      instance.error = runnerError.userMessage;

      this.logger.error(`Failed to start component ${componentRef}:`, {
        error: runnerError.userMessage,
        errorCode: runnerError.code,
        instanceId,
        componentRef
      });

      throw new Error(runnerError.userMessage);
    }
  }

  async stopComponent(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.status = 'stopping';

    try {
      if (instance.containerId) {
        // Stop monitoring first
        this.monitoringService.stopMonitoring(instance.containerId);

        await this.dockerService.stopContainer(instance.containerId, instanceId);
      }

      instance.status = 'stopped';
      instance.stoppedAt = new Date().toISOString();

      if (this.currentInstance === instanceId) {
        this.currentInstance = null;
      }

      this.logger.info(`Stopped component instance ${instanceId}`);
    } catch (error) {
      const context: ErrorContext = {
        operation: 'stopComponent',
        instanceId,
        containerId: instance.containerId,
        componentRef: instance.componentRef,
        timestamp: new Date().toISOString()
      };

      const runnerError = this.errorHandlingService.handleError(error instanceof Error ? error : new Error(String(error)), context);

      instance.status = 'error';
      instance.error = runnerError.userMessage;

      this.logger.error(`Failed to stop component instance ${instanceId}:`, {
        error: runnerError.userMessage,
        errorCode: runnerError.code,
        instanceId,
        containerId: instance.containerId
      });

      throw new Error(runnerError.userMessage);
    }
  }

  async getStatus(instanceId: string): Promise<RunnerInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Update status if container is running
    if (instance.containerId && instance.status === 'running') {
      const isRunning = await this.dockerService.isContainerRunning(instance.containerId);
      if (!isRunning) {
        instance.status = 'stopped';
        instance.stoppedAt = new Date().toISOString();
        if (this.currentInstance === instanceId) {
          this.currentInstance = null;
        }
      }
    }

    return instance;
  }

  async listInstances(): Promise<RunnerInstance[]> {
    return Array.from(this.instances.values());
  }

  async getLogs(instanceId: string, options?: { follow?: boolean; tail?: number }): Promise<string | NodeJS.ReadableStream> {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.containerId) {
      throw new Error(`Instance ${instanceId} not found or not running`);
    }

    return this.dockerService.getContainerLogs(instance.containerId, options);
  }

  /**
   * Get container statistics for an instance
   */
  async getInstanceStats(instanceId: string): Promise<any> {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.containerId) {
      throw new Error(`Instance ${instanceId} not found or not running`);
    }

    return this.dockerService.getContainerStats(instance.containerId);
  }

  /**
   * Get container health information
   */
  async getInstanceHealth(instanceId: string) {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.containerId) {
      throw new Error(`Instance ${instanceId} not found or not running`);
    }

    return this.monitoringService.getContainerHealth(instance.containerId);
  }

  /**
   * Get container metrics history
   */
  async getInstanceMetrics(instanceId: string, limit?: number) {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.containerId) {
      throw new Error(`Instance ${instanceId} not found or not running`);
    }

    return this.monitoringService.getContainerMetrics(instance.containerId, limit);
  }

  /**
   * Get error history
   */
  async getErrorHistory(limit?: number) {
    return this.errorHandlingService.getErrorHistory(limit);
  }

  /**
   * Get errors for a specific instance
   */
  async getInstanceErrors(instanceId: string) {
    return this.errorHandlingService.getInstanceErrors(instanceId);
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Starting RunnerService cleanup...');

    // Stop all running instances
    const stopPromises = Array.from(this.instances.entries()).map(async ([instanceId, instance]) => {
      if (instance.status === 'running' && instance.containerId) {
        try {
          await this.dockerService.stopContainer(instance.containerId, instanceId);
          instance.status = 'stopped';
          instance.stoppedAt = new Date().toISOString();
        } catch (error) {
          this.logger.warn(`Failed to stop instance ${instanceId} during cleanup:`, error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    await Promise.all(stopPromises);

    // Cleanup monitoring service
    this.monitoringService.cleanup();

    // Cleanup Docker service
    await this.dockerService.cleanup();

    this.instances.clear();
    this.currentInstance = null;
    this.logger.info('RunnerService cleanup completed');
  }

  private async cloneRepository(entity: Entity): Promise<string> {
    const sourceLocation = entity.metadata.annotations?.['backstage.io/source-location'];
    if (!sourceLocation) {
      throw new Error('Component missing source location annotation');
    }

    // Create temporary directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-'));

    try {
      // Parse GitHub repository information from source location
      const { owner, repo, ref } = this.parseGitHubUrl(sourceLocation);

      this.logger.info(`Downloading GitHub repository: ${owner}/${repo} (ref: ${ref})`);
      this.logger.info(`Target directory: ${tempDir}`);

      // Get GitHub integration and create Octokit client
      const githubIntegration = this.scmIntegrations.github.byHost('github.com');
      if (!githubIntegration) {
        throw new Error('GitHub integration not configured. Please configure GitHub integration in app-config.yaml');
      }

      const token = githubIntegration.config.token;

      const octokit = new Octokit({
        auth: token,
      });

      // Download repository archive (tarball)
      this.logger.info(`Downloading archive for ${owner}/${repo}@${ref}`);
      const archiveResponse = await octokit.rest.repos.downloadTarballArchive({
        owner,
        repo,
        ref,
      });

      // Create extraction directory
      const extractDir = path.join(tempDir, 'extracted');
      await fs.mkdir(extractDir, { recursive: true });

      // Extract tarball
      this.logger.info(`Extracting archive to ${extractDir}`);
      await this.extractTarball(Buffer.from(archiveResponse.data as ArrayBuffer), extractDir);

      // Find the extracted repository directory (GitHub archives create a subdirectory)
      const extractedContents = await fs.readdir(extractDir);
      const repoDir = extractedContents.find(name => name.startsWith(`${owner}-${repo}-`));

      if (!repoDir) {
        throw new Error(`Failed to find extracted repository directory in ${extractDir}`);
      }

      const finalPath = path.join(extractDir, repoDir);
      this.logger.info(`Successfully downloaded and extracted repository to ${finalPath}`);
      return finalPath;

    } catch (error) {
      // Clean up temporary directory on failure
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(`Failed to cleanup temporary directory ${tempDir}:`, cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)));
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Provide more specific error messages based on common failure scenarios
      if (errorMessage.includes('Not Found') || errorMessage.includes('404')) {
        throw new Error(`Repository not found: ${sourceLocation}. Please check the repository URL and access permissions.`);
      } else if (errorMessage.includes('Bad credentials') || errorMessage.includes('401') || errorMessage.includes('403')) {
        throw new Error(`Authentication failed for repository: ${sourceLocation}. Please check the GitHub integration credentials in app-config.yaml.`);
      } else if (errorMessage.includes('rate limit')) {
        throw new Error(`GitHub API rate limit exceeded. Please try again later or check your GitHub integration configuration.`);
      } else {
        throw new Error(`Failed to download repository: ${errorMessage}`);
      }
    }
  }

  /**
   * Parse GitHub URL to extract owner, repo, and ref information
   */
  private parseGitHubUrl(sourceLocation: string): { owner: string; repo: string; ref: string } {
    // Remove any trailing slashes and url: prefix
    const url = sourceLocation.replace(/\/$/, '').replace(/^url:/, '');

    // Extract repository information from various GitHub URL formats
    const githubUrlPattern = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/(?:blob|tree)\/([^\/]+))?/;
    const match = url.match(githubUrlPattern);

    if (!match) {
      throw new Error(`Invalid GitHub URL format: ${sourceLocation}`);
    }

    const [, owner, repo, ref = 'main'] = match;

    return { owner, repo, ref };
  }

  /**
   * Extract tarball to specified directory
   */
  private async extractTarball(buffer: Buffer, targetDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const gunzip = createGunzip();
      const extract = tar.extract(targetDir);

      // Handle errors
      gunzip.on('error', reject);
      extract.on('error', reject);
      extract.on('finish', resolve);

      // Create a readable stream from buffer and pipe through gunzip to tar extract
      const { Readable } = require('stream');
      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);

      readable.pipe(gunzip).pipe(extract);
    });
  }

  private startHealthCheck(instance: RunnerInstance, config: RunnerConfig): void {
    if (!config.healthCheck) return;

    const interval = this.parseInterval(config.healthCheck.interval);

    const healthCheckTimer = setInterval(async () => {
      try {
        if (instance.status !== 'running' || !instance.containerId) {
          clearInterval(healthCheckTimer);
          return;
        }

        const isRunning = await this.dockerService.isContainerRunning(instance.containerId);
        if (!isRunning) {
          instance.status = 'stopped';
          instance.stoppedAt = new Date().toISOString();
          if (this.currentInstance === instance.id) {
            this.currentInstance = null;
          }
          clearInterval(healthCheckTimer);
        }
      } catch (error) {
        this.logger.warn(`Health check failed for instance ${instance.id}:`, error instanceof Error ? error : new Error(String(error)));
      }
    }, interval);
  }

  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)(s|m|h)$/);
    if (!match) return 30000; // Default 30 seconds

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 30000;
    }
  }
}
