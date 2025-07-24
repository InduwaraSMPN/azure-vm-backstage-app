import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';

export interface DeploymentProgress {
  currentStep: string;
  steps: Array<{
    type: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    title: string;
    description?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
    progress?: number;
  }>;
  overallProgress: number;
  isComplete: boolean;
  hasError: boolean;
  startedAt: string;
  completedAt?: string;
}

export interface RunnerInstance {
  id: string;
  componentRef: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  containerId?: string;
  ports: number[];
  startedAt: string;
  stoppedAt?: string;
  error?: string;
  deploymentProgress?: DeploymentProgress;
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
    entity: Entity
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

  getInstanceStats(instanceId: string): Promise<any>;

  getInstanceHealth(instanceId: string): Promise<any>;

  getInstanceMetrics(instanceId: string, limit?: number): Promise<any>;

  getErrorHistory(limit?: number): Promise<any>;

  getInstanceErrors(instanceId: string): Promise<any>;

  cleanup(): Promise<void>;
}
