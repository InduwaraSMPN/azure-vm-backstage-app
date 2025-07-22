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
