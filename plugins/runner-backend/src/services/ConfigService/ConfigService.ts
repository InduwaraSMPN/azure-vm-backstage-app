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

    const configUrl = this.constructConfigUrl(sourceLocation, configPath);

    try {
      const response = await this.urlReader.readUrl(configUrl);
      const configContent = await response.buffer();
      const config = yaml.parse(configContent.toString());

      return this.validateConfig(config.runner);
    } catch (error) {
      // Enhanced error handling with more specific error messages
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('not allowed')) {
        throw new Error(`Failed to read runner configuration: ${error}. Please ensure the GitHub integration is properly configured and the repository host is allowed in backend.reading.allow configuration.`);
      } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('404')) {
        throw new Error(`Configuration file not found: ${configPath}. Please ensure the file exists in the repository.`);
      } else if (errorMessage.includes('authentication') || errorMessage.includes('401') || errorMessage.includes('403')) {
        throw new Error(`Authentication failed for repository: ${sourceLocation}. Please check the GitHub integration credentials.`);
      } else {
        throw new Error(`Failed to read runner configuration: ${errorMessage}`);
      }
    }
  }

  private constructConfigUrl(sourceLocation: string, configPath: string): string {
    // Remove any trailing slashes and url: prefix
    let baseUrl = sourceLocation.replace(/\/$/, '').replace(/^url:/, '');

    // Extract repository root URL from various GitHub URL formats
    if (baseUrl.includes('/blob/') || baseUrl.includes('/tree/')) {
      // Extract repository root from URLs like:
      // https://github.com/user/repo/blob/main/path/to/file
      // https://github.com/user/repo/tree/main/path/to/dir
      const match = baseUrl.match(/^(https:\/\/github\.com\/[^\/]+\/[^\/]+)/);
      if (match) {
        baseUrl = match[1];
      }
    }

    // Construct the blob URL for the configuration file
    // e.g., https://github.com/user/repo/blob/main/.runner/config.yml
    return `${baseUrl}/blob/main/${configPath}`;
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
