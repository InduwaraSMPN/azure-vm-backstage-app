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
      const errorText = await response.text();
      throw new Error(`Failed to start component: ${response.statusText} - ${errorText}`);
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
      const errorText = await response.text();
      throw new Error(`Failed to stop component: ${response.statusText} - ${errorText}`);
    }
  }

  async getStatus(instanceId: string): Promise<RunnerInstance> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/instances/${instanceId}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get status: ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  async listInstances(): Promise<RunnerInstance[]> {
    const url = await this.discoveryApi.getBaseUrl('runner');
    const response = await this.fetchApi.fetch(`${url}/instances`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list instances: ${response.statusText} - ${errorText}`);
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
      const errorText = await response.text();
      throw new Error(`Failed to get logs: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.logs;
  }
}
