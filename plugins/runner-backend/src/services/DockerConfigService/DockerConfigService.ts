import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { DockerConfig, ContainerResourceLimits } from '../../utils/dockerUtils';

export interface DockerConfigOptions {
  connection?: {
    timeout?: number;
    retries?: number;
    host?: string;
    port?: number;
  };
  build?: {
    timeout?: number;
    cacheEnabled?: boolean;
    maxCacheSize?: number;
  };
  runtime?: {
    timeout?: number;
    defaultResourceLimits?: ContainerResourceLimits;
    securityOptions?: string[];
  };
  cleanup?: {
    imagePolicy?: 'always' | 'on-error' | 'never';
    containerPolicy?: 'always' | 'on-error' | 'never';
    maxAge?: number; // seconds
  };
  monitoring?: {
    healthCheckInterval?: number;
    statsCollectionEnabled?: boolean;
    logRetentionDays?: number;
  };
}

export class DockerConfigService {
  private config: DockerConfig;

  constructor(
    private backstageConfig: Config,
    private logger: LoggerService
  ) {
    this.config = this.loadConfiguration();
  }

  /**
   * Get the current Docker configuration
   */
  getConfig(): DockerConfig {
    return { ...this.config };
  }

  /**
   * Update Docker configuration
   */
  updateConfig(updates: Partial<DockerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('Docker configuration updated', { updates: JSON.parse(JSON.stringify(updates)) });
  }

  /**
   * Get configuration for a specific component
   */
  getComponentConfig(componentName: string): DockerConfig {
    const componentOverrides = this.getComponentOverrides(componentName);
    return { ...this.config, ...componentOverrides };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: Partial<DockerConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.connectionTimeout && config.connectionTimeout < 1000) {
      errors.push('Connection timeout must be at least 1000ms');
    }

    if (config.buildTimeout && config.buildTimeout < 10000) {
      errors.push('Build timeout must be at least 10 seconds');
    }

    if (config.runTimeout && config.runTimeout < 5000) {
      errors.push('Run timeout must be at least 5 seconds');
    }

    if (config.resourceLimits?.memory) {
      if (!this.isValidMemoryFormat(config.resourceLimits.memory)) {
        errors.push('Invalid memory format. Use formats like "512m", "1g", "2048m"');
      }
    }

    if (config.resourceLimits?.cpus) {
      const cpus = parseFloat(config.resourceLimits.cpus);
      if (isNaN(cpus) || cpus <= 0 || cpus > 32) {
        errors.push('CPU limit must be a positive number between 0 and 32');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Load configuration from Backstage config
   */
  private loadConfiguration(): DockerConfig {
    const defaultConfig: DockerConfig = {
      connectionTimeout: 30000,
      buildTimeout: 600000,
      runTimeout: 300000,
      resourceLimits: {
        memory: '1g',
        cpus: '1.0',
        timeout: 3600,
      },
      securityOptions: ['--security-opt=no-new-privileges'],
      imageCleanupPolicy: 'on-error',
    };

    try {
      const runnerConfig = this.backstageConfig.getOptionalConfig('runner.docker');
      if (!runnerConfig) {
        this.logger.info('No Docker configuration found, using defaults');
        return defaultConfig;
      }

      const config: DockerConfig = {
        connectionTimeout: runnerConfig.getOptionalNumber('connectionTimeout') ?? defaultConfig.connectionTimeout,
        buildTimeout: runnerConfig.getOptionalNumber('buildTimeout') ?? defaultConfig.buildTimeout,
        runTimeout: runnerConfig.getOptionalNumber('runTimeout') ?? defaultConfig.runTimeout,
        resourceLimits: {
          memory: runnerConfig.getOptionalString('resourceLimits.memory') ?? defaultConfig.resourceLimits.memory,
          cpus: runnerConfig.getOptionalString('resourceLimits.cpus') ?? defaultConfig.resourceLimits.cpus,
          timeout: runnerConfig.getOptionalNumber('resourceLimits.timeout') ?? defaultConfig.resourceLimits.timeout,
        },
        securityOptions: runnerConfig.getOptionalStringArray('securityOptions') ?? defaultConfig.securityOptions,
        imageCleanupPolicy: (runnerConfig.getOptionalString('imageCleanupPolicy') as any) ?? defaultConfig.imageCleanupPolicy,
      };

      const validation = this.validateConfig(config);
      if (!validation.valid) {
        this.logger.warn('Invalid Docker configuration found, using defaults', { errors: validation.errors });
        return defaultConfig;
      }

      this.logger.info('Docker configuration loaded successfully');
      return config;
    } catch (error) {
      this.logger.error('Failed to load Docker configuration, using defaults', { error: error instanceof Error ? error.message : String(error) });
      return defaultConfig;
    }
  }

  /**
   * Get component-specific configuration overrides
   */
  private getComponentOverrides(componentName: string): Partial<DockerConfig> {
    try {
      const componentConfig = this.backstageConfig.getOptionalConfig(`runner.components.${componentName}.docker`);
      if (!componentConfig) {
        return {};
      }

      const overrides: Partial<DockerConfig> = {};

      const buildTimeout = componentConfig.getOptionalNumber('buildTimeout');
      if (buildTimeout) overrides.buildTimeout = buildTimeout;

      const runTimeout = componentConfig.getOptionalNumber('runTimeout');
      if (runTimeout) overrides.runTimeout = runTimeout;

      const memory = componentConfig.getOptionalString('resourceLimits.memory');
      const cpus = componentConfig.getOptionalString('resourceLimits.cpus');
      const timeout = componentConfig.getOptionalNumber('resourceLimits.timeout');

      if (memory || cpus || timeout) {
        overrides.resourceLimits = {
          ...this.config.resourceLimits,
          ...(memory && { memory }),
          ...(cpus && { cpus }),
          ...(timeout && { timeout }),
        };
      }

      const securityOptions = componentConfig.getOptionalStringArray('securityOptions');
      if (securityOptions) overrides.securityOptions = securityOptions;

      const imageCleanupPolicy = componentConfig.getOptionalString('imageCleanupPolicy');
      if (imageCleanupPolicy) overrides.imageCleanupPolicy = imageCleanupPolicy as any;

      return overrides;
    } catch (error) {
      this.logger.warn(`Failed to load component-specific Docker configuration for ${componentName}`, { error: error instanceof Error ? error.message : String(error) });
      return {};
    }
  }

  /**
   * Validate memory format
   */
  private isValidMemoryFormat(memory: string): boolean {
    const memoryRegex = /^\d+[kmgKMG]?$/;
    return memoryRegex.test(memory);
  }

  /**
   * Get configuration as environment variables for debugging
   */
  getConfigAsEnvVars(): Record<string, string> {
    return {
      RUNNER_DOCKER_CONNECTION_TIMEOUT: this.config.connectionTimeout.toString(),
      RUNNER_DOCKER_BUILD_TIMEOUT: this.config.buildTimeout.toString(),
      RUNNER_DOCKER_RUN_TIMEOUT: this.config.runTimeout.toString(),
      RUNNER_DOCKER_MEMORY_LIMIT: this.config.resourceLimits.memory || '',
      RUNNER_DOCKER_CPU_LIMIT: this.config.resourceLimits.cpus || '',
      RUNNER_DOCKER_TIMEOUT: this.config.resourceLimits.timeout?.toString() || '',
      RUNNER_DOCKER_SECURITY_OPTIONS: this.config.securityOptions.join(','),
      RUNNER_DOCKER_CLEANUP_POLICY: this.config.imageCleanupPolicy,
    };
  }
}
