import { DockerConfigService } from './DockerConfigService';
import { Config } from '@backstage/config';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

// Mock config
const createMockConfig = (configData: any = {}) => ({
  getOptionalConfig: jest.fn((key: string) => {
    const keys = key.split('.');
    let current = configData;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    return current ? {
      getOptionalNumber: jest.fn((subKey: string) => {
        const subKeys = subKey.split('.');
        let subCurrent = current;
        for (const sk of subKeys) {
          if (subCurrent && typeof subCurrent === 'object' && sk in subCurrent) {
            subCurrent = subCurrent[sk];
          } else {
            return undefined;
          }
        }
        return subCurrent;
      }),
      getOptionalString: jest.fn((subKey: string) => {
        const subKeys = subKey.split('.');
        let subCurrent = current;
        for (const sk of subKeys) {
          if (subCurrent && typeof subCurrent === 'object' && sk in subCurrent) {
            subCurrent = subCurrent[sk];
          } else {
            return undefined;
          }
        }
        return subCurrent;
      }),
      getOptionalStringArray: jest.fn((subKey: string) => {
        const subKeys = subKey.split('.');
        let subCurrent = current;
        for (const sk of subKeys) {
          if (subCurrent && typeof subCurrent === 'object' && sk in subCurrent) {
            subCurrent = subCurrent[sk];
          } else {
            return undefined;
          }
        }
        return subCurrent;
      }),
    } : undefined;
  }),
}) as unknown as Config;

describe('DockerConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should load default configuration when no config is provided', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const config = service.getConfig();
      expect(config.connectionTimeout).toBe(30000);
      expect(config.buildTimeout).toBe(600000);
      expect(config.runTimeout).toBe(300000);
      expect(config.resourceLimits.memory).toBe('1g');
      expect(config.resourceLimits.cpus).toBe('1.0');
      expect(config.imageCleanupPolicy).toBe('on-error');
    });

    it('should load custom configuration when provided', () => {
      const configData = {
        runner: {
          docker: {
            connectionTimeout: 60000,
            buildTimeout: 1200000,
            runTimeout: 600000,
            resourceLimits: {
              memory: '2g',
              cpus: '2.0',
              timeout: 7200,
            },
            securityOptions: ['--security-opt=no-new-privileges', '--read-only'],
            imageCleanupPolicy: 'always',
          },
        },
      };

      const mockConfig = createMockConfig(configData);
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const config = service.getConfig();
      expect(config.connectionTimeout).toBe(60000);
      expect(config.buildTimeout).toBe(1200000);
      expect(config.runTimeout).toBe(600000);
      expect(config.resourceLimits.memory).toBe('2g');
      expect(config.resourceLimits.cpus).toBe('2.0');
      expect(config.imageCleanupPolicy).toBe('always');
    });

    it('should use defaults when configuration is invalid', () => {
      const configData = {
        runner: {
          docker: {
            connectionTimeout: 500, // Invalid - too low
            buildTimeout: 5000,     // Invalid - too low
          },
        },
      };

      const mockConfig = createMockConfig(configData);
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const config = service.getConfig();
      expect(config.connectionTimeout).toBe(30000); // Should use default
      expect(config.buildTimeout).toBe(600000);     // Should use default
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid Docker configuration found, using defaults',
        expect.objectContaining({ errors: expect.any(Array) })
      );
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      service.updateConfig({
        connectionTimeout: 45000,
        resourceLimits: { memory: '2g' },
      });
      
      const config = service.getConfig();
      expect(config.connectionTimeout).toBe(45000);
      expect(config.resourceLimits.memory).toBe('2g');
      expect(mockLogger.info).toHaveBeenCalledWith('Docker configuration updated', expect.any(Object));
    });
  });

  describe('getComponentConfig', () => {
    it('should return component-specific configuration', () => {
      const configData = {
        runner: {
          docker: {
            connectionTimeout: 30000,
            buildTimeout: 600000,
          },
          components: {
            'test-component': {
              docker: {
                buildTimeout: 1200000,
                resourceLimits: {
                  memory: '2g',
                },
              },
            },
          },
        },
      };

      const mockConfig = createMockConfig(configData);
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const componentConfig = service.getComponentConfig('test-component');
      expect(componentConfig.buildTimeout).toBe(1200000);
      expect(componentConfig.resourceLimits.memory).toBe('2g');
      expect(componentConfig.connectionTimeout).toBe(30000); // Should inherit from base
    });

    it('should return base configuration when no component overrides exist', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const componentConfig = service.getComponentConfig('non-existent-component');
      expect(componentConfig.connectionTimeout).toBe(30000);
      expect(componentConfig.buildTimeout).toBe(600000);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const validation = service.validateConfig({
        connectionTimeout: 30000,
        buildTimeout: 600000,
        runTimeout: 300000,
        resourceLimits: {
          memory: '1g',
          cpus: '1.0',
        },
      });
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid connection timeout', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const validation = service.validateConfig({
        connectionTimeout: 500, // Too low
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Connection timeout must be at least 1000ms');
    });

    it('should detect invalid build timeout', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const validation = service.validateConfig({
        buildTimeout: 5000, // Too low
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Build timeout must be at least 10 seconds');
    });

    it('should detect invalid memory format', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const validation = service.validateConfig({
        resourceLimits: {
          memory: 'invalid-format',
        },
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid memory format. Use formats like "512m", "1g", "2048m"');
    });

    it('should detect invalid CPU limit', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const validation = service.validateConfig({
        resourceLimits: {
          cpus: '50.0', // Too high
        },
      });
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('CPU limit must be a positive number between 0 and 32');
    });
  });

  describe('getConfigAsEnvVars', () => {
    it('should return configuration as environment variables', () => {
      const mockConfig = createMockConfig();
      const service = new DockerConfigService(mockConfig, mockLogger);
      
      const envVars = service.getConfigAsEnvVars();
      
      expect(envVars).toEqual({
        RUNNER_DOCKER_CONNECTION_TIMEOUT: '30000',
        RUNNER_DOCKER_BUILD_TIMEOUT: '600000',
        RUNNER_DOCKER_RUN_TIMEOUT: '300000',
        RUNNER_DOCKER_MEMORY_LIMIT: '1g',
        RUNNER_DOCKER_CPU_LIMIT: '1.0',
        RUNNER_DOCKER_TIMEOUT: '3600',
        RUNNER_DOCKER_SECURITY_OPTIONS: '--security-opt=no-new-privileges',
        RUNNER_DOCKER_CLEANUP_POLICY: 'on-error',
      });
    });
  });
});
