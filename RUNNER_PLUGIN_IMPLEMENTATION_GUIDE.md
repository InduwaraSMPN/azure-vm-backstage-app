# Backstage Runner Plugin: Docker-Based Implementation Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture Design](#architecture-design)
4. [Phase 1: Backend Service Implementation](#phase-1-backend-service-implementation)
5. [Phase 2: Frontend Component Development](#phase-2-frontend-component-development)
6. [Phase 3: Docker Integration](#phase-3-docker-integration)
7. [Phase 4: Real-time Status Updates](#phase-4-real-time-status-updates)
8. [Phase 5: Production Deployment](#phase-5-production-deployment)
9. [Testing Strategy](#testing-strategy)
10. [Security Considerations](#security-considerations)
11. [Troubleshooting](#troubleshooting)

## Overview

This guide provides a comprehensive A-Z implementation plan for the Backstage Runner Plugin using a Docker-based approach with **advanced GitHub integration via Octokit**. The plugin enables one-click deployment of components from within Backstage, focusing on running single static frontend applications locally with robust repository management.

### Key Requirements (Wave 1)
- **Single Component Execution**: Only one component running at a time (no port conflicts)
- **Static Frontend Focus**: Primarily for static frontend applications
- **Local Execution**: Components run on the user's local machine
- **Docker-Based**: Uses Docker containers for consistent environments
- **GitHub Integration**: Uses Octokit for robust repository management
- **External Access**: Containers accessible via external IP for VM environments
- **No Persistent Storage**: No database/storage requirements for first wave
- **No Multi-Service Support**: Single service per component for initial implementation

### Answers to Key Questions
- **Port Conflicts**: Handled by allowing only one component at a time
- **Persistent Storage**: Not supported in Wave 1
- **Secrets/Environment Variables**: To be addressed in future iterations
- **Resource Limits**: Not required for local execution
- **Multiple Services**: Not supported in Wave 1

## Prerequisites

### System Requirements
- Docker installed and running on the development machine
- Node.js 18+ and Yarn package manager
- Backstage instance with the runner plugin already scaffolded
- Access to component repositories with appropriate permissions

### Current Plugin Status
Based on the codebase analysis, the runner plugin has:
- ✅ Basic plugin structure created
- ✅ Frontend plugin with LocalhostComponents table
- ✅ Backend plugin with TODO service template
- ✅ Integration with main Backstage backend
- ✅ Catalog integration for component discovery

## Architecture Design

### Component Structure
```
plugins/
├── runner/                          # Frontend Plugin
│   ├── src/
│   │   ├── components/
│   │   │   ├── LocalhostComponents/  # Current component list
│   │   │   ├── RunnerControls/       # New: Start/Stop controls
│   │   │   ├── RunnerStatus/         # New: Status display
│   │   │   └── RunnerLogs/           # New: Log viewer
│   │   ├── api/                      # New: API client
│   │   └── hooks/                    # New: React hooks
└── runner-backend/                   # Backend Plugin
    ├── src/
    │   ├── services/
    │   │   ├── RunnerService/        # New: Core runner logic
    │   │   ├── DockerService/        # New: Docker operations
    │   │   └── ConfigService/        # New: Configuration parsing
    │   ├── router.ts                 # API endpoints
    │   └── plugin.ts                 # Plugin registration
```

### Data Flow
1. **Component Discovery**: Frontend queries catalog for components with runner annotations
2. **Configuration Parsing**: Backend reads `.runner/config.yml` from component repository
3. **Docker Operations**: Backend manages Docker container lifecycle
4. **Status Updates**: Real-time status via WebSocket or polling
5. **Log Streaming**: Container logs streamed to frontend

### Component Configuration Format
```yaml
# .runner/config.yml
runner:
  type: docker
  dockerfile: ./Dockerfile
  ports: [3000]
  environment:
    NODE_ENV: development
  healthCheck:
    path: /health
    interval: 30s
    timeout: 10s
  build:
    context: .
    args:
      BUILD_ENV: development
```

### Catalog Integration
Components must be annotated in their `catalog-info.yaml`:
```yaml
metadata:
  annotations:
    runner.backstage.io/enabled: "true"
    runner.backstage.io/config-path: ".runner/config.yml"
    runner.backstage.io/type: "docker"
```

## Phase 1: Backend Service Implementation

### Step 1.1: Replace TODO Service with Runner Service

First, we'll replace the existing TODO service with our runner-specific service.

#### Create Runner Service Interface
```typescript
// plugins/runner-backend/src/services/RunnerService/types.ts
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';

export interface RunnerInstance {
  id: string;
  componentRef: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  containerId?: string;
  ports: number[];
  startedAt: string;
  stoppedAt?: string;
  error?: string;
}

export interface RunnerConfig {
  type: 'docker';
  dockerfile: string;
  ports: number[];
  environment?: Record<string, string>;
  healthCheck?: {
    path: string;
    interval: string;
    timeout: string;
  };
  build?: {
    context: string;
    args?: Record<string, string>;
  };
}

export interface RunnerService {
  startComponent(
    entity: Entity,
    options: { credentials: BackstageCredentials }
  ): Promise<RunnerInstance>;
  
  stopComponent(
    instanceId: string,
    options: { credentials: BackstageCredentials }
  ): Promise<void>;
  
  getStatus(instanceId: string): Promise<RunnerInstance>;
  
  listInstances(): Promise<RunnerInstance[]>;
  
  getLogs(
    instanceId: string,
    options?: { follow?: boolean; tail?: number }
  ): Promise<string | NodeJS.ReadableStream>;
}
```

#### Implement Docker Service
```typescript
// plugins/runner-backend/src/services/DockerService/DockerService.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { spawn, ChildProcess } from 'child_process';
import { RunnerConfig, RunnerInstance } from '../RunnerService/types';

export class DockerService {
  private processes = new Map<string, ChildProcess>();

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
    } else {
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
```

### Step 1.2: Implement Configuration Service
```typescript
// plugins/runner-backend/src/services/ConfigService/ConfigService.ts
import { UrlReaderService } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { RunnerConfig } from '../RunnerService/types';
import * as yaml from 'yaml';

export class ConfigService {
  constructor(private urlReader: UrlReaderService) {}

  async getRunnerConfig(entity: Entity): Promise<RunnerConfig> {
    const configPath = entity.metadata.annotations?.['runner.backstage.io/config-path'] || '.runner/config.yml';
    const sourceLocation = entity.metadata.annotations?.['backstage.io/source-location'];
    
    if (!sourceLocation) {
      throw new Error('Component missing source location annotation');
    }

    const configUrl = `${sourceLocation}/blob/main/${configPath}`;
    
    try {
      const response = await this.urlReader.readUrl(configUrl);
      const configContent = await response.buffer();
      const config = yaml.parse(configContent.toString());
      
      return this.validateConfig(config.runner);
    } catch (error) {
      throw new Error(`Failed to read runner configuration: ${error}`);
    }
  }

  private validateConfig(config: any): RunnerConfig {
    if (!config || config.type !== 'docker') {
      throw new Error('Invalid runner configuration: type must be "docker"');
    }

    if (!config.dockerfile) {
      throw new Error('Invalid runner configuration: dockerfile is required');
    }

    if (!config.ports || !Array.isArray(config.ports) || config.ports.length === 0) {
      throw new Error('Invalid runner configuration: ports array is required');
    }

    return {
      type: 'docker',
      dockerfile: config.dockerfile,
      ports: config.ports,
      environment: config.environment || {},
      healthCheck: config.healthCheck,
      build: config.build || { context: '.' }
    };
  }
}
```

### Step 1.3: Implement Core Runner Service
```typescript
// plugins/runner-backend/src/services/RunnerService/RunnerService.ts
import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
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
    private configService: ConfigService,
    private urlReader: UrlReaderService
  ) {}

  async startComponent(entity: Entity, options: any): Promise<RunnerInstance> {
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
      this.logger.error(`Failed to start component ${componentRef}:`, error);
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
        this.logger.warn(`Health check failed for instance ${instance.id}:`, error);
      }
    }, interval);
  }

  private parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)(s|m|h)$/);
    if (!match) return 30000; // Default 30 seconds

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 30000;
    }
  }
}
```

### Step 1.4: Update Backend Plugin Registration
```typescript
// plugins/runner-backend/src/services/RunnerService/createRunnerService.ts
import { LoggerService, UrlReaderService } from '@backstage/backend-plugin-api';
import { RunnerService } from './types';
import { RunnerServiceImpl } from './RunnerService';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';

export async function createRunnerService({
  logger,
  urlReader,
}: {
  logger: LoggerService;
  urlReader: UrlReaderService;
}): Promise<RunnerService> {
  logger.info('Initializing RunnerService');

  const dockerService = new DockerService(logger);
  const configService = new ConfigService(urlReader);

  return new RunnerServiceImpl(logger, dockerService, configService, urlReader);
}
```

```typescript
// plugins/runner-backend/src/services/RunnerService/index.ts
export { createRunnerService } from './createRunnerService';
export * from './types';
```

### Step 1.5: Update Router with Runner Endpoints
```typescript
// plugins/runner-backend/src/router.ts
import { HttpAuthService, UrlReaderService } from '@backstage/backend-plugin-api';
import { InputError, NotFoundError } from '@backstage/errors';
import { z } from 'zod';
import express from 'express';
import Router from 'express-promise-router';
import { RunnerService } from './services/RunnerService/types';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';

export async function createRouter({
  httpAuth,
  runnerService,
  catalog,
}: {
  httpAuth: HttpAuthService;
  runnerService: RunnerService;
  catalog: typeof catalogServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  // Schema validation
  const startComponentSchema = z.object({
    entityRef: z.string(),
  });

  const stopComponentSchema = z.object({
    instanceId: z.string(),
  });

  // Start component endpoint
  router.post('/start', async (req, res) => {
    const parsed = startComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });

    // Get entity from catalog
    const entity = await catalog.getEntityByRef(parsed.data.entityRef, { credentials });
    if (!entity) {
      throw new NotFoundError(`Entity not found: ${parsed.data.entityRef}`);
    }

    // Check if entity has runner annotation
    const runnerEnabled = entity.metadata.annotations?.['runner.backstage.io/enabled'];
    if (runnerEnabled !== 'true') {
      throw new InputError('Component is not enabled for runner');
    }

    const instance = await runnerService.startComponent(entity, { credentials });
    res.status(201).json(instance);
  });

  // Stop component endpoint
  router.post('/stop', async (req, res) => {
    const parsed = stopComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }

    await runnerService.stopComponent(parsed.data.instanceId);
    res.status(200).json({ message: 'Component stopped successfully' });
  });

  // Get instance status
  router.get('/instances/:id', async (req, res) => {
    const instance = await runnerService.getStatus(req.params.id);
    res.json(instance);
  });

  // List all instances
  router.get('/instances', async (_req, res) => {
    const instances = await runnerService.listInstances();
    res.json({ items: instances });
  });

  // Get instance logs
  router.get('/instances/:id/logs', async (req, res) => {
    const follow = req.query.follow === 'true';
    const tail = req.query.tail ? parseInt(req.query.tail as string) : undefined;

    const logs = await runnerService.getLogs(req.params.id, { follow, tail });

    if (typeof logs === 'string') {
      res.json({ logs });
    } else {
      // Stream logs for real-time updates
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      logs.pipe(res);
    }
  });

  return router;
}
```

### Step 1.6: Update Plugin Registration
```typescript
// plugins/runner-backend/src/plugin.ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRunnerService } from './services/RunnerService';

export const runnerPlugin = createBackendPlugin({
  pluginId: 'runner',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        urlReader: coreServices.urlReader,
        catalog: catalogServiceRef,
      },
      async init({ logger, httpAuth, httpRouter, urlReader, catalog }) {
        const runnerService = await createRunnerService({
          logger,
          urlReader,
        });

        httpRouter.use(
          await createRouter({
            httpAuth,
            runnerService,
            catalog,
          }),
        );
      },
    });
  },
});
```

## Phase 2: Frontend Component Development

### Step 2.1: Create API Client
```typescript
// plugins/runner/src/api/RunnerApi.ts
import { createApiRef, DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

export interface RunnerInstance {
  id: string;
  componentRef: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  containerId?: string;
  ports: number[];
  startedAt: string;
  stoppedAt?: string;
  error?: string;
}

export interface RunnerApi {
  startComponent(entityRef: string): Promise<RunnerInstance>;
  stopComponent(instanceId: string): Promise<void>;
  getStatus(instanceId: string): Promise<RunnerInstance>;
  listInstances(): Promise<RunnerInstance[]>;
  getLogs(instanceId: string, options?: { follow?: boolean; tail?: number }): Promise<string>;
}

export const runnerApiRef = createApiRef<RunnerApi>({
  id: 'plugin.runner.service',
});

export class RunnerApiClient implements RunnerApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  async startComponent(entityRef: string): Promise<RunnerInstance> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityRef }),
    });

    if (!response.ok) {
      throw new Error(`Failed to start component: ${response.statusText}`);
    }

    return response.json();
  }

  async stopComponent(instanceId: string): Promise<void> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to stop component: ${response.statusText}`);
    }
  }

  async getStatus(instanceId: string): Promise<RunnerInstance> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/instances/${instanceId}`);

    if (!response.ok) {
      throw new Error(`Failed to get status: ${response.statusText}`);
    }

    return response.json();
  }

  async listInstances(): Promise<RunnerInstance[]> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/instances`);

    if (!response.ok) {
      throw new Error(`Failed to list instances: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
  }

  async getLogs(instanceId: string, options?: { follow?: boolean; tail?: number }): Promise<string> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const params = new URLSearchParams();

    if (options?.follow) params.append('follow', 'true');
    if (options?.tail) params.append('tail', options.tail.toString());

    const response = await this.fetchApi.fetch(`${url}/instances/${instanceId}/logs?${params}`);

    if (!response.ok) {
      throw new Error(`Failed to get logs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.logs;
  }
}
```

### Step 2.2: Create React Hooks
```typescript
// plugins/runner/src/hooks/useRunner.ts
import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import { runnerApiRef, RunnerInstance } from '../api/RunnerApi';
import { useState, useCallback } from 'react';

export const useRunner = () => {
  const runnerApi = useApi(runnerApiRef);
  const errorApi = useApi(errorApiRef);
  const [loading, setLoading] = useState(false);

  const startComponent = useCallback(async (entityRef: string): Promise<RunnerInstance | null> => {
    setLoading(true);
    try {
      const instance = await runnerApi.startComponent(entityRef);
      return instance;
    } catch (error) {
      errorApi.post(error as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  const stopComponent = useCallback(async (instanceId: string): Promise<boolean> => {
    setLoading(true);
    try {
      await runnerApi.stopComponent(instanceId);
      return true;
    } catch (error) {
      errorApi.post(error as Error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  return {
    startComponent,
    stopComponent,
    loading,
  };
};
```

```typescript
// plugins/runner/src/hooks/useRunnerInstances.ts
import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import { runnerApiRef, RunnerInstance } from '../api/RunnerApi';
import { useState, useEffect, useCallback } from 'react';

export const useRunnerInstances = (refreshInterval = 5000) => {
  const runnerApi = useApi(runnerApiRef);
  const errorApi = useApi(errorApiRef);
  const [instances, setInstances] = useState<RunnerInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    try {
      const fetchedInstances = await runnerApi.listInstances();
      setInstances(fetchedInstances);
    } catch (error) {
      errorApi.post(error as Error);
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  useEffect(() => {
    fetchInstances();

    const interval = setInterval(fetchInstances, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchInstances, refreshInterval]);

  return {
    instances,
    loading,
    refresh: fetchInstances,
  };
};
```

### Step 2.3: Create Runner Controls Component
```typescript
// plugins/runner/src/components/RunnerControls/RunnerControls.tsx
import React from 'react';
import { Button, Chip, Box, Typography } from '@material-ui/core';
import { PlayArrow, Stop, Refresh } from '@material-ui/icons';
import { Entity } from '@backstage/catalog-model';
import { useRunner } from '../../hooks/useRunner';
import { RunnerInstance } from '../../api/RunnerApi';

interface RunnerControlsProps {
  entity: Entity;
  instance?: RunnerInstance;
  onInstanceChange?: (instance: RunnerInstance | null) => void;
}

export const RunnerControls = ({ entity, instance, onInstanceChange }: RunnerControlsProps) => {
  const { startComponent, stopComponent, loading } = useRunner();
  const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;

  const handleStart = async () => {
    const newInstance = await startComponent(entityRef);
    if (newInstance && onInstanceChange) {
      onInstanceChange(newInstance);
    }
  };

  const handleStop = async () => {
    if (instance) {
      const success = await stopComponent(instance.id);
      if (success && onInstanceChange) {
        onInstanceChange(null);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'primary';
      case 'starting': return 'default';
      case 'stopping': return 'default';
      case 'stopped': return 'default';
      case 'error': return 'secondary';
      default: return 'default';
    }
  };

  const isRunning = instance?.status === 'running';
  const isStarting = instance?.status === 'starting';
  const isStopping = instance?.status === 'stopping';

  return (
    <Box display="flex" alignItems="center" gap={2}>
      <Box>
        {!instance || instance.status === 'stopped' ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrow />}
            onClick={handleStart}
            disabled={loading || isStarting}
          >
            {isStarting ? 'Starting...' : 'Start'}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Stop />}
            onClick={handleStop}
            disabled={loading || isStopping || instance.status === 'stopped'}
          >
            {isStopping ? 'Stopping...' : 'Stop'}
          </Button>
        )}
      </Box>

      {instance && (
        <Box display="flex" alignItems="center" gap={1}>
          <Chip
            label={instance.status.toUpperCase()}
            color={getStatusColor(instance.status)}
            size="small"
          />

          {isRunning && instance.ports.length > 0 && (
            <Box>
              <Typography variant="body2" color="textSecondary">
                Running on:
              </Typography>
              {instance.ports.map(port => (
                <Button
                  key={port}
                  size="small"
                  href={`http://localhost:${port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  localhost:{port}
                </Button>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
```

### Step 2.4: Create Enhanced Component List
```typescript
// plugins/runner/src/components/RunnerComponents/RunnerComponents.tsx
import React, { useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import useAsync from 'react-use/lib/useAsync';
import {
  Table,
  TableColumn,
  Progress,
  ResponseErrorPanel,
  Link,
} from '@backstage/core-components';
import { RunnerControls } from '../RunnerControls/RunnerControls';
import { useRunnerInstances } from '../../hooks/useRunnerInstances';
import { RunnerInstance } from '../../api/RunnerApi';

export const RunnerComponents = () => {
  const catalogApi = useApi(catalogApiRef);
  const { instances, loading: instancesLoading } = useRunnerInstances();
  const [componentInstances, setComponentInstances] = useState<Map<string, RunnerInstance>>(new Map());

  const { value, loading, error } = useAsync(async (): Promise<Entity[]> => {
    const response = await catalogApi.getEntities({
      filter: {
        kind: 'Component',
        'metadata.annotations.runner.backstage.io/enabled': 'true'
      }
    });
    return response.items;
  }, []);

  // Update component instances map when instances change
  React.useEffect(() => {
    const instanceMap = new Map<string, RunnerInstance>();
    instances.forEach(instance => {
      instanceMap.set(instance.componentRef, instance);
    });
    setComponentInstances(instanceMap);
  }, [instances]);

  const handleInstanceChange = (entityRef: string, instance: RunnerInstance | null) => {
    const newMap = new Map(componentInstances);
    if (instance) {
      newMap.set(entityRef, instance);
    } else {
      newMap.delete(entityRef);
    }
    setComponentInstances(newMap);
  };

  if (loading || instancesLoading) {
    return <Progress />;
  } else if (error) {
    return <ResponseErrorPanel error={error} />;
  }

  const columns: TableColumn<Entity>[] = [
    {
      title: 'Name',
      field: 'metadata.name',
      render: (entity: Entity) => (
        <Link to={`/catalog/default/component/${entity.metadata.name}`}>
          {entity.metadata.name}
        </Link>
      ),
    },
    {
      title: 'Description',
      field: 'metadata.description',
      render: (entity: Entity) => entity.metadata.description || 'No description'
    },
    {
      title: 'Runner Controls',
      field: 'runner',
      render: (entity: Entity) => {
        const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;
        const instance = componentInstances.get(entityRef);

        return (
          <RunnerControls
            entity={entity}
            instance={instance}
            onInstanceChange={(newInstance) => handleInstanceChange(entityRef, newInstance)}
          />
        );
      },
    },
  ];

  return (
    <Table
      title="Runner-Enabled Components"
      options={{ search: true, paging: true }}
      columns={columns}
      data={value || []}
    />
  );
};
```

### Step 2.5: Update Plugin Registration
```typescript
// plugins/runner/src/plugin.ts
import {
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';
import { runnerApiRef, RunnerApiClient } from './api/RunnerApi';

export const runnerPlugin = createPlugin({
  id: 'runner',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: runnerApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new RunnerApiClient(discoveryApi, fetchApi),
    }),
  ],
});

export const RunnerPage = runnerPlugin.provide(
  createRoutableExtension({
    name: 'RunnerPage',
    component: () =>
      import('./components/RunnerComponents').then(m => m.RunnerComponents),
    mountPoint: rootRouteRef,
  }),
);
```

## Phase 3: Docker Integration

### Step 3.1: Add Required Dependencies
Update the backend package.json to include Docker-related dependencies:

```json
// plugins/runner-backend/package.json
{
  "dependencies": {
    "@backstage/backend-defaults": "^0.11.1",
    "@backstage/backend-plugin-api": "^1.4.1",
    "@backstage/catalog-client": "^1.9.1",
    "@backstage/errors": "^1.2.7",
    "@backstage/plugin-catalog-node": "^1.17.2",
    "express": "^4.17.1",
    "express-promise-router": "^4.1.0",
    "zod": "^3.22.4",
    "yaml": "^2.3.4"
  }
}
```

### Step 3.2: Create Docker Health Check Utility
```typescript
// plugins/runner-backend/src/utils/dockerUtils.ts
import { spawn } from 'child_process';
import { LoggerService } from '@backstage/backend-plugin-api';

export class DockerUtils {
  static async checkDockerAvailable(logger: LoggerService): Promise<boolean> {
    return new Promise((resolve) => {
      const dockerVersion = spawn('docker', ['--version']);

      dockerVersion.on('close', (code) => {
        if (code === 0) {
          logger.info('Docker is available');
          resolve(true);
        } else {
          logger.error('Docker is not available or not running');
          resolve(false);
        }
      });

      dockerVersion.on('error', () => {
        logger.error('Docker command not found');
        resolve(false);
      });
    });
  }

  static async checkDockerDaemonRunning(logger: LoggerService): Promise<boolean> {
    return new Promise((resolve) => {
      const dockerInfo = spawn('docker', ['info']);

      dockerInfo.on('close', (code) => {
        if (code === 0) {
          logger.info('Docker daemon is running');
          resolve(true);
        } else {
          logger.error('Docker daemon is not running');
          resolve(false);
        }
      });

      dockerInfo.on('error', () => {
        logger.error('Failed to check Docker daemon status');
        resolve(false);
      });
    });
  }

  static async cleanupImage(imageName: string, logger: LoggerService): Promise<void> {
    return new Promise((resolve) => {
      const dockerRmi = spawn('docker', ['rmi', imageName, '--force']);

      dockerRmi.on('close', (code) => {
        if (code === 0) {
          logger.info(`Cleaned up image: ${imageName}`);
        } else {
          logger.warn(`Failed to cleanup image: ${imageName}`);
        }
        resolve();
      });
    });
  }

  static async getContainerStatus(containerId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const dockerInspect = spawn('docker', ['inspect', '--format={{.State.Status}}', containerId]);
      let status = '';

      dockerInspect.stdout?.on('data', (data) => {
        status += data.toString().trim();
      });

      dockerInspect.on('close', (code) => {
        if (code === 0) {
          resolve(status);
        } else {
          resolve(null);
        }
      });
    });
  }
}
```

### Step 3.3: Enhanced Docker Service with Error Handling
```typescript
// plugins/runner-backend/src/services/DockerService/EnhancedDockerService.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { spawn, ChildProcess } from 'child_process';
import { RunnerConfig } from '../RunnerService/types';
import { DockerUtils } from '../../utils/dockerUtils';
import * as fs from 'fs/promises';
import * as path from 'path';

export class EnhancedDockerService {
  private processes = new Map<string, ChildProcess>();
  private buildCache = new Map<string, string>(); // Cache built images

  constructor(private logger: LoggerService) {}

  async initialize(): Promise<void> {
    const dockerAvailable = await DockerUtils.checkDockerAvailable(this.logger);
    if (!dockerAvailable) {
      throw new Error('Docker is not available. Please install Docker and ensure it is in PATH.');
    }

    const daemonRunning = await DockerUtils.checkDockerDaemonRunning(this.logger);
    if (!daemonRunning) {
      throw new Error('Docker daemon is not running. Please start Docker.');
    }

    this.logger.info('Docker service initialized successfully');
  }

  async buildImage(
    repoPath: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
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
          reject(new Error(`Docker build failed: ${errorOutput || output}`));
        }
      });

      dockerBuild.on('error', (error) => {
        this.logger.error(`Docker build process error: ${error.message}`);
        reject(new Error(`Docker build process failed: ${error.message}`));
      });

      // Set timeout for build process (10 minutes)
      setTimeout(() => {
        dockerBuild.kill('SIGTERM');
        reject(new Error('Docker build timed out after 10 minutes'));
      }, 10 * 60 * 1000);
    });
  }

  async runContainer(
    imageName: string,
    config: RunnerConfig,
    instanceId: string
  ): Promise<string> {
    const containerName = `runner-container-${instanceId}`;

    // Check for port conflicts
    await this.checkPortAvailability(config.ports);

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
      let errorOutput = '';

      dockerRun.stdout?.on('data', (data) => {
        containerId += data.toString().trim();
      });

      dockerRun.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        this.logger.error(`Docker run error: ${data}`);
      });

      dockerRun.on('close', (code) => {
        if (code === 0 && containerId) {
          this.logger.info(`Container started: ${containerId}`);
          resolve(containerId);
        } else {
          reject(new Error(`Failed to start container: ${errorOutput}`));
        }
      });

      dockerRun.on('error', (error) => {
        reject(new Error(`Docker run process failed: ${error.message}`));
      });
    });
  }

  private async checkPortAvailability(ports: number[]): Promise<void> {
    const net = await import('net');

    for (const port of ports) {
      const isAvailable = await new Promise<boolean>((resolve) => {
        const server = net.createServer();

        server.listen(port, () => {
          server.close(() => resolve(true));
        });

        server.on('error', () => resolve(false));
      });

      if (!isAvailable) {
        throw new Error(`Port ${port} is already in use`);
      }
    }
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

      dockerStop.on('error', (error) => {
        reject(new Error(`Docker stop process failed: ${error.message}`));
      });

      // Force kill after 30 seconds
      setTimeout(() => {
        spawn('docker', ['kill', containerId]);
      }, 30000);
    });
  }

  async cleanup(): Promise<void> {
    // Cleanup any running containers and images
    const instances = Array.from(this.buildCache.values());

    for (const imageName of instances) {
      await DockerUtils.cleanupImage(imageName, this.logger);
    }

    this.buildCache.clear();
    this.logger.info('Docker service cleanup completed');
  }
}
```

## Phase 4: Real-time Status Updates

### Step 4.1: WebSocket Integration for Real-time Updates
```typescript
// plugins/runner-backend/src/services/WebSocketService/WebSocketService.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';
import { RunnerInstance } from '../RunnerService/types';

export class WebSocketService {
  private io: SocketIOServer;

  constructor(
    private logger: LoggerService,
    server: Server
  ) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      path: '/api/runner/socket.io'
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      this.logger.info(`Client connected: ${socket.id}`);

      socket.on('subscribe-instance', (instanceId: string) => {
        socket.join(`instance-${instanceId}`);
        this.logger.debug(`Client ${socket.id} subscribed to instance ${instanceId}`);
      });

      socket.on('unsubscribe-instance', (instanceId: string) => {
        socket.leave(`instance-${instanceId}`);
        this.logger.debug(`Client ${socket.id} unsubscribed from instance ${instanceId}`);
      });

      socket.on('disconnect', () => {
        this.logger.info(`Client disconnected: ${socket.id}`);
      });
    });
  }

  broadcastInstanceUpdate(instance: RunnerInstance): void {
    this.io.to(`instance-${instance.id}`).emit('instance-update', instance);
    this.logger.debug(`Broadcasted update for instance ${instance.id}`);
  }

  broadcastInstanceLogs(instanceId: string, logs: string): void {
    this.io.to(`instance-${instanceId}`).emit('instance-logs', { instanceId, logs });
  }

  broadcastInstanceList(instances: RunnerInstance[]): void {
    this.io.emit('instances-update', instances);
  }
}
```

### Step 4.2: Enhanced Frontend with Real-time Updates
```typescript
// plugins/runner/src/hooks/useWebSocket.ts
import { useEffect, useRef, useState } from 'react';
import { useApi, configApiRef } from '@backstage/core-plugin-api';
import { io, Socket } from 'socket.io-client';
import { RunnerInstance } from '../api/RunnerApi';

export const useWebSocket = () => {
  const configApi = useApi(configApiRef);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const initSocket = async () => {
      const backendUrl = configApi.getString('backend.baseUrl');

      socketRef.current = io(backendUrl, {
        path: '/api/runner/socket.io',
        transports: ['websocket', 'polling']
      });

      socketRef.current.on('connect', () => {
        setConnected(true);
      });

      socketRef.current.on('disconnect', () => {
        setConnected(false);
      });
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [configApi]);

  const subscribeToInstance = (instanceId: string, callback: (instance: RunnerInstance) => void) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe-instance', instanceId);
      socketRef.current.on('instance-update', callback);
    }
  };

  const unsubscribeFromInstance = (instanceId: string, callback: (instance: RunnerInstance) => void) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe-instance', instanceId);
      socketRef.current.off('instance-update', callback);
    }
  };

  const subscribeToLogs = (instanceId: string, callback: (data: { instanceId: string; logs: string }) => void) => {
    if (socketRef.current) {
      socketRef.current.on('instance-logs', callback);
    }
  };

  return {
    connected,
    subscribeToInstance,
    unsubscribeFromInstance,
    subscribeToLogs,
  };
};
```

### Step 4.3: Real-time Log Viewer Component
```typescript
// plugins/runner/src/components/LogViewer/LogViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Switch,
  FormControlLabel,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { useApi } from '@backstage/core-plugin-api';
import { runnerApiRef } from '../../api/RunnerApi';
import { useWebSocket } from '../../hooks/useWebSocket';

const useStyles = makeStyles((theme) => ({
  logContainer: {
    backgroundColor: '#1e1e1e',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: theme.spacing(1),
    height: '400px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  logLine: {
    marginBottom: '2px',
  },
}));

interface LogViewerProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
}

export const LogViewer = ({ instanceId, open, onClose }: LogViewerProps) => {
  const classes = useStyles();
  const runnerApi = useApi(runnerApiRef);
  const { subscribeToLogs } = useWebSocket();
  const [logs, setLogs] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [realTime, setRealTime] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && instanceId) {
      // Load initial logs
      loadInitialLogs();

      if (realTime) {
        // Subscribe to real-time logs
        subscribeToLogs(instanceId, (data) => {
          if (data.instanceId === instanceId) {
            setLogs(prev => prev + data.logs);
          }
        });
      }
    }
  }, [open, instanceId, realTime]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const loadInitialLogs = async () => {
    try {
      const initialLogs = await runnerApi.getLogs(instanceId, { tail: 100 });
      setLogs(initialLogs);
    } catch (error) {
      setLogs(`Error loading logs: ${error}`);
    }
  };

  const handleRefresh = () => {
    loadInitialLogs();
  };

  const handleClear = () => {
    setLogs('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Container Logs</Typography>
          <Box display="flex" gap={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  size="small"
                />
              }
              label="Auto-scroll"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={realTime}
                  onChange={(e) => setRealTime(e.target.checked)}
                  size="small"
                />
              }
              label="Real-time"
            />
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box
          ref={logContainerRef}
          className={classes.logContainer}
        >
          {logs || 'No logs available'}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClear} color="secondary">
          Clear
        </Button>
        <Button onClick={handleRefresh} color="primary">
          Refresh
        </Button>
        <Button onClick={onClose} color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

## Phase 5: Production Deployment

### Step 5.1: Environment Configuration
```yaml
# app-config.production.yaml
runner:
  docker:
    # Docker daemon configuration
    socketPath: /var/run/docker.sock
    # Build timeout in minutes
    buildTimeout: 10
    # Container resource limits
    resources:
      memory: "512m"
      cpu: "0.5"
  # Cleanup settings
  cleanup:
    # Auto-cleanup stopped containers after (hours)
    autoCleanupAfter: 24
    # Maximum number of concurrent instances
    maxInstances: 5
```

### Step 5.2: Security Hardening
```typescript
// plugins/runner-backend/src/security/SecurityService.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { RunnerConfig } from '../services/RunnerService/types';

export class SecurityService {
  constructor(private logger: LoggerService) {}

  validateDockerfile(dockerfileContent: string): void {
    const dangerousCommands = [
      'rm -rf /',
      'dd if=',
      'mkfs',
      'fdisk',
      'mount',
      'umount',
      'sudo',
      'su -',
    ];

    const lines = dockerfileContent.split('\n');

    for (const line of lines) {
      const normalizedLine = line.toLowerCase().trim();

      for (const dangerous of dangerousCommands) {
        if (normalizedLine.includes(dangerous)) {
          throw new Error(`Dangerous command detected in Dockerfile: ${dangerous}`);
        }
      }
    }
  }

  validateRunnerConfig(config: RunnerConfig): void {
    // Validate ports are in allowed range
    const allowedPortRange = { min: 3000, max: 9999 };

    for (const port of config.ports) {
      if (port < allowedPortRange.min || port > allowedPortRange.max) {
        throw new Error(`Port ${port} is outside allowed range (${allowedPortRange.min}-${allowedPortRange.max})`);
      }
    }

    // Validate environment variables don't contain sensitive data
    if (config.environment) {
      const sensitiveKeys = ['password', 'secret', 'key', 'token', 'credential'];

      for (const [key, value] of Object.entries(config.environment)) {
        const lowerKey = key.toLowerCase();

        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          this.logger.warn(`Potentially sensitive environment variable: ${key}`);
        }
      }
    }

    // Validate Dockerfile path doesn't escape context
    if (config.dockerfile.includes('..')) {
      throw new Error('Dockerfile path cannot contain ".." (path traversal)');
    }
  }

  sanitizeContainerName(name: string): string {
    // Remove any potentially dangerous characters
    return name.replace(/[^a-zA-Z0-9-_]/g, '');
  }
}
```

### Step 5.3: Monitoring and Metrics
```typescript
// plugins/runner-backend/src/monitoring/MetricsService.ts
import { LoggerService } from '@backstage/backend-plugin-api';

interface RunnerMetrics {
  totalStarts: number;
  totalStops: number;
  totalErrors: number;
  activeInstances: number;
  averageBuildTime: number;
  averageStartTime: number;
}

export class MetricsService {
  private metrics: RunnerMetrics = {
    totalStarts: 0,
    totalStops: 0,
    totalErrors: 0,
    activeInstances: 0,
    averageBuildTime: 0,
    averageStartTime: 0,
  };

  private buildTimes: number[] = [];
  private startTimes: number[] = [];

  constructor(private logger: LoggerService) {}

  recordStart(): void {
    this.metrics.totalStarts++;
    this.metrics.activeInstances++;
    this.logMetrics();
  }

  recordStop(): void {
    this.metrics.totalStops++;
    this.metrics.activeInstances = Math.max(0, this.metrics.activeInstances - 1);
    this.logMetrics();
  }

  recordError(): void {
    this.metrics.totalErrors++;
    this.logMetrics();
  }

  recordBuildTime(timeMs: number): void {
    this.buildTimes.push(timeMs);
    if (this.buildTimes.length > 100) {
      this.buildTimes.shift(); // Keep only last 100 measurements
    }
    this.metrics.averageBuildTime = this.buildTimes.reduce((a, b) => a + b, 0) / this.buildTimes.length;
  }

  recordStartTime(timeMs: number): void {
    this.startTimes.push(timeMs);
    if (this.startTimes.length > 100) {
      this.startTimes.shift();
    }
    this.metrics.averageStartTime = this.startTimes.reduce((a, b) => a + b, 0) / this.startTimes.length;
  }

  getMetrics(): RunnerMetrics {
    return { ...this.metrics };
  }

  private logMetrics(): void {
    this.logger.info('Runner metrics updated', this.metrics);
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
// plugins/runner-backend/src/services/RunnerService/RunnerService.test.ts
import { RunnerServiceImpl } from './RunnerService';
import { DockerService } from '../DockerService/DockerService';
import { ConfigService } from '../ConfigService/ConfigService';
import { Entity } from '@backstage/catalog-model';

describe('RunnerService', () => {
  let runnerService: RunnerServiceImpl;
  let mockDockerService: jest.Mocked<DockerService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockLogger: any;
  let mockUrlReader: any;

  beforeEach(() => {
    mockDockerService = {
      buildImage: jest.fn(),
      runContainer: jest.fn(),
      stopContainer: jest.fn(),
      isContainerRunning: jest.fn(),
      getContainerLogs: jest.fn(),
    } as any;

    mockConfigService = {
      getRunnerConfig: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockUrlReader = {};

    runnerService = new RunnerServiceImpl(
      mockLogger,
      mockDockerService,
      mockConfigService,
      mockUrlReader
    );
  });

  describe('startComponent', () => {
    it('should start a component successfully', async () => {
      const entity: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'test-component',
          annotations: {
            'backstage.io/source-location': 'https://github.com/test/repo',
          },
        },
      };

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
        environment: {},
        build: { context: '.' },
      };

      mockConfigService.getRunnerConfig.mockResolvedValue(config);
      mockDockerService.buildImage.mockResolvedValue('test-image');
      mockDockerService.runContainer.mockResolvedValue('container-id');

      const result = await runnerService.startComponent(entity, { credentials: {} as any });

      expect(result.status).toBe('running');
      expect(result.ports).toEqual([3000]);
      expect(result.containerId).toBe('container-id');
    });

    it('should prevent starting multiple components', async () => {
      // First component
      const entity1: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'component1' },
      };

      // Mock successful start
      mockConfigService.getRunnerConfig.mockResolvedValue({
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
        environment: {},
        build: { context: '.' },
      });
      mockDockerService.buildImage.mockResolvedValue('image1');
      mockDockerService.runContainer.mockResolvedValue('container1');

      await runnerService.startComponent(entity1, { credentials: {} as any });

      // Second component should fail
      const entity2: Entity = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: { name: 'component2' },
      };

      await expect(
        runnerService.startComponent(entity2, { credentials: {} as any })
      ).rejects.toThrow('Another component is already running');
    });
  });
});
```

### Integration Tests
```typescript
// plugins/runner-backend/src/router.test.ts
import request from 'supertest';
import express from 'express';
import { createRouter } from './router';
import { RunnerService } from './services/RunnerService/types';

describe('Runner Router', () => {
  let app: express.Express;
  let mockRunnerService: jest.Mocked<RunnerService>;
  let mockCatalog: any;
  let mockHttpAuth: any;

  beforeEach(async () => {
    mockRunnerService = {
      startComponent: jest.fn(),
      stopComponent: jest.fn(),
      getStatus: jest.fn(),
      listInstances: jest.fn(),
      getLogs: jest.fn(),
    };

    mockCatalog = {
      getEntityByRef: jest.fn(),
    };

    mockHttpAuth = {
      credentials: jest.fn().mockResolvedValue({ principal: { userEntityRef: 'user:default/test' } }),
    };

    const router = await createRouter({
      httpAuth: mockHttpAuth,
      runnerService: mockRunnerService,
      catalog: mockCatalog,
    });

    app = express();
    app.use(router);
  });

  describe('POST /start', () => {
    it('should start a component', async () => {
      const entity = {
        kind: 'Component',
        metadata: {
          name: 'test-component',
          annotations: {
            'runner.backstage.io/enabled': 'true',
          },
        },
      };

      const instance = {
        id: 'test-id',
        componentRef: 'component:default/test-component',
        status: 'running',
        ports: [3000],
        startedAt: new Date().toISOString(),
      };

      mockCatalog.getEntityByRef.mockResolvedValue(entity);
      mockRunnerService.startComponent.mockResolvedValue(instance);

      const response = await request(app)
        .post('/start')
        .send({ entityRef: 'component:default/test-component' })
        .expect(201);

      expect(response.body).toEqual(instance);
    });

    it('should reject components without runner annotation', async () => {
      const entity = {
        kind: 'Component',
        metadata: {
          name: 'test-component',
          annotations: {},
        },
      };

      mockCatalog.getEntityByRef.mockResolvedValue(entity);

      await request(app)
        .post('/start')
        .send({ entityRef: 'component:default/test-component' })
        .expect(400);
    });
  });
});
```

### End-to-End Tests
```typescript
// plugins/runner/src/components/RunnerComponents/RunnerComponents.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { runnerApiRef } from '../../api/RunnerApi';
import { RunnerComponents } from './RunnerComponents';

describe('RunnerComponents', () => {
  const mockCatalogApi = {
    getEntities: jest.fn(),
  };

  const mockRunnerApi = {
    startComponent: jest.fn(),
    stopComponent: jest.fn(),
    getStatus: jest.fn(),
    listInstances: jest.fn(),
    getLogs: jest.fn(),
  };

  beforeEach(() => {
    mockCatalogApi.getEntities.mockResolvedValue({
      items: [
        {
          kind: 'Component',
          metadata: {
            name: 'test-component',
            description: 'Test component',
            annotations: {
              'runner.backstage.io/enabled': 'true',
            },
          },
        },
      ],
    });

    mockRunnerApi.listInstances.mockResolvedValue([]);
  });

  it('should render runner-enabled components', async () => {
    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [runnerApiRef, mockRunnerApi],
        ]}
      >
        <RunnerComponents />
      </TestApiProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('test-component')).toBeInTheDocument();
      expect(screen.getByText('Test component')).toBeInTheDocument();
      expect(screen.getByText('Start')).toBeInTheDocument();
    });
  });

  it('should start a component when start button is clicked', async () => {
    const instance = {
      id: 'test-id',
      componentRef: 'component:default/test-component',
      status: 'running',
      ports: [3000],
      startedAt: new Date().toISOString(),
    };

    mockRunnerApi.startComponent.mockResolvedValue(instance);

    render(
      <TestApiProvider
        apis={[
          [catalogApiRef, mockCatalogApi],
          [runnerApiRef, mockRunnerApi],
        ]}
      >
        <RunnerComponents />
      </TestApiProvider>
    );

    await waitFor(() => {
      const startButton = screen.getByText('Start');
      fireEvent.click(startButton);
    });

    await waitFor(() => {
      expect(mockRunnerApi.startComponent).toHaveBeenCalledWith(
        'Component:default/test-component'
      );
    });
  });
});
```

## Security Considerations

### 1. Docker Security
- **Container Isolation**: Containers run with limited privileges
- **Resource Limits**: CPU and memory limits prevent resource exhaustion
- **Network Isolation**: Containers only expose specified ports
- **Image Scanning**: Validate Dockerfiles for dangerous commands

### 2. Access Control
- **Authentication**: All API calls require valid Backstage authentication
- **Authorization**: Users can only manage their own components
- **Component Validation**: Only components with runner annotations can be started

### 3. Input Validation
- **Configuration Validation**: Strict validation of runner configurations
- **Port Range Restrictions**: Only allow ports in safe ranges (3000-9999)
- **Path Traversal Prevention**: Prevent access to files outside component directory

### 4. Secrets Management
For future iterations, consider:
- Integration with Backstage's secret management
- Environment variable encryption
- Secure credential injection

## Troubleshooting

### Common Issues

#### 1. Docker Not Available
**Error**: "Docker is not available"
**Solution**:
- Ensure Docker is installed and running
- Check Docker daemon is accessible
- Verify user has Docker permissions

#### 2. Port Conflicts
**Error**: "Port 3000 is already in use"
**Solution**:
- Stop other services using the port
- Configure component to use different port
- Check for other running runner instances

#### 3. Build Failures
**Error**: "Docker build failed"
**Solution**:
- Check Dockerfile syntax
- Verify all required files are present
- Review build logs for specific errors
- Ensure base images are accessible

#### 4. Container Won't Start
**Error**: "Failed to start container"
**Solution**:
- Check container logs for startup errors
- Verify port mappings are correct
- Ensure environment variables are properly set
- Check resource availability

### Debugging Commands
```bash
# Check Docker status
docker --version
docker info

# List running containers
docker ps

# View container logs
docker logs <container-id>

# Check port usage
netstat -tulpn | grep :3000

# Clean up stopped containers
docker container prune

# Clean up unused images
docker image prune
```

### Log Analysis
Monitor these log patterns:
- `Docker build failed`: Build process issues
- `Port already in use`: Port conflict problems
- `Container stopped unexpectedly`: Runtime failures
- `Failed to clone repository`: Git access issues

## Production Checklist

### Pre-deployment
- [ ] Docker installed and configured on target environment
- [ ] All dependencies installed (`yarn install`)
- [ ] Environment variables configured
- [ ] Security policies reviewed and implemented
- [ ] Resource limits configured
- [ ] Monitoring and logging setup

### Deployment
- [ ] Backend plugin deployed and registered
- [ ] Frontend plugin built and deployed
- [ ] API endpoints accessible
- [ ] WebSocket connections working
- [ ] Health checks passing

### Post-deployment
- [ ] End-to-end testing completed
- [ ] Performance monitoring active
- [ ] Error tracking configured
- [ ] User documentation updated
- [ ] Support team trained

### Monitoring
- [ ] Container resource usage
- [ ] Build success/failure rates
- [ ] API response times
- [ ] Error rates and patterns
- [ ] User adoption metrics

This comprehensive guide provides everything needed to implement the Docker-based Runner Plugin for Backstage, from initial development through production deployment. The modular architecture allows for future enhancements while maintaining the core functionality for Wave 1 requirements.
