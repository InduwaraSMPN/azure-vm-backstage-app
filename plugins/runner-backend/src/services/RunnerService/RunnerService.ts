import { LoggerService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { RunnerService, RunnerInstance, RunnerConfig } from './types';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';
import crypto from 'crypto';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

export class RunnerServiceImpl implements RunnerService {
  private instances = new Map<string, RunnerInstance>();
  private currentInstance: string | null = null; // Only one instance at a time

  constructor(
    private logger: LoggerService,
    private dockerService: DockerService,
    private configService: ConfigService
  ) {}

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

      // Clone repository to temporary directory
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

      return instance;
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start component ${componentRef}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
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
        await this.dockerService.stopContainer(instance.containerId);
      }

      instance.status = 'stopped';
      instance.stoppedAt = new Date().toISOString();

      if (this.currentInstance === instanceId) {
        this.currentInstance = null;
      }

      this.logger.info(`Stopped component instance ${instanceId}`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Failed to stop';
      throw error;
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

  private async cloneRepository(entity: Entity): Promise<string> {
    const sourceLocation = entity.metadata.annotations?.['backstage.io/source-location'];
    if (!sourceLocation) {
      throw new Error('Component missing source location annotation');
    }

    // Create temporary directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runner-'));

    // Extract repository URL from source location
    const repoUrl = sourceLocation.replace('/blob/main', '').replace('/tree/main', '');

    return new Promise((resolve, reject) => {
      const gitClone = spawn('git', ['clone', repoUrl, tempDir], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      gitClone.on('close', (code) => {
        if (code === 0) {
          this.logger.info(`Cloned repository to ${tempDir}`);
          resolve(tempDir);
        } else {
          reject(new Error(`Failed to clone repository: ${repoUrl}`));
        }
      });
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
