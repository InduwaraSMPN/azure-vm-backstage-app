import { DockerService } from './DockerService';
import { DockerUtils } from '../../utils/dockerUtils';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');
jest.mock('../../utils/dockerUtils');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockDockerUtils = DockerUtils as jest.Mocked<typeof DockerUtils>;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

describe('DockerService', () => {
  let service: DockerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DockerService(mockLogger, {
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
    });
  });

  describe('initialize', () => {
    it('should initialize successfully when Docker is available', async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: '20.10.17',
        daemonRunning: true,
        available: true,
      });

      await service.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Initializing Docker service...');
      expect(mockLogger.info).toHaveBeenCalledWith('Docker service initialized successfully (version: 20.10.17)');
    });

    it('should throw error when Docker is not available', async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: 'unknown',
        daemonRunning: false,
        available: false,
      });

      await expect(service.initialize()).rejects.toThrow('Docker is not available. Please install Docker and ensure it is in PATH.');
    });

    it('should throw error when Docker daemon is not running', async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: '20.10.17',
        daemonRunning: false,
        available: true,
      });

      await expect(service.initialize()).rejects.toThrow('Docker daemon is not running. Please start Docker.');
    });

    it('should not reinitialize if already initialized', async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: '20.10.17',
        daemonRunning: true,
        available: true,
      });

      await service.initialize();
      await service.initialize(); // Second call

      expect(mockDockerUtils.getDockerSystemInfo).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildImage', () => {
    beforeEach(async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: '20.10.17',
        daemonRunning: true,
        available: true,
      });
      await service.initialize();
    });

    it('should build image successfully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);
      mockFs.access.mockResolvedValue(undefined);

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
        build: { context: '.' },
      };

      const promise = service.buildImage('/tmp/repo', config, 'test-instance');

      // Simulate successful build
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Build output\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toBe('runner-test-instance');
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully built image: runner-test-instance');
    });

    it('should throw error when Dockerfile not found', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      await expect(service.buildImage('/tmp/repo', config, 'test-instance'))
        .rejects.toThrow('Dockerfile not found at: ./Dockerfile');
    });

    it('should return cached image when available', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      // First build
      const mockProcess1 = new EventEmitter() as any;
      mockProcess1.stdout = new EventEmitter();
      mockProcess1.stderr = new EventEmitter();
      mockProcess1.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess1);

      const promise1 = service.buildImage('/tmp/repo', config, 'test-instance-1');
      setTimeout(() => {
        mockProcess1.stdout.emit('data', 'Build output\n');
        mockProcess1.emit('close', 0);
      }, 10);
      await promise1;

      // Second build with same repo and dockerfile should use cache
      const result = await service.buildImage('/tmp/repo', config, 'test-instance-2');
      expect(result).toBe('runner-test-instance-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Using cached image: runner-test-instance-1');
    });

    it('should handle build failure', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);
      mockFs.access.mockResolvedValue(undefined);
      mockDockerUtils.cleanupImage.mockResolvedValue(undefined);

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      const promise = service.buildImage('/tmp/repo', config, 'test-instance');

      // Simulate build failure
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Build error\n');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(promise).rejects.toThrow('Docker build failed: Build error');
    });

    it('should handle build timeout', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);
      mockFs.access.mockResolvedValue(undefined);

      // Create service with short timeout
      const serviceWithTimeout = new DockerService(mockLogger, { buildTimeout: 100 });
      await serviceWithTimeout.initialize();

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      const promise = serviceWithTimeout.buildImage('/tmp/repo', config, 'test-instance');

      // Don't emit close event to simulate hanging build
      await expect(promise).rejects.toThrow('Docker build timed out after 0.1 seconds');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    }, 1000);
  });

  describe('runContainer', () => {
    beforeEach(async () => {
      mockDockerUtils.getDockerSystemInfo.mockResolvedValue({
        version: '20.10.17',
        daemonRunning: true,
        available: true,
      });
      mockDockerUtils.checkPortsAvailable.mockResolvedValue([
        { port: 3000, available: true },
      ]);
      await service.initialize();
    });

    it('should run container successfully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
        environment: { NODE_ENV: 'development' },
      };

      const promise = service.runContainer('test-image', config, 'test-instance');

      // Simulate successful container start
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'container123\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toBe('container123');
      expect(mockLogger.info).toHaveBeenCalledWith('Container started: container123');
    });

    it('should throw error when port is not available', async () => {
      mockDockerUtils.checkPortsAvailable.mockResolvedValue([
        { port: 3000, available: false },
      ]);

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      await expect(service.runContainer('test-image', config, 'test-instance'))
        .rejects.toThrow('Ports already in use: 3000');
    });

    it('should handle container start failure', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);

      const config = {
        type: 'docker' as const,
        dockerfile: './Dockerfile',
        ports: [3000],
      };

      const promise = service.runContainer('test-image', config, 'test-instance');

      // Simulate container start failure
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Container start error\n');
        mockProcess.emit('close', 1);
      }, 10);

      await expect(promise).rejects.toThrow('Failed to start container: Container start error');
    });
  });

  describe('stopContainer', () => {
    it('should stop container successfully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = service.stopContainer('container123', 'test-instance');

      // Simulate successful container stop
      setTimeout(() => mockProcess.emit('close', 0), 10);

      await promise;
      expect(mockLogger.info).toHaveBeenCalledWith('Container stopped: container123');
    });

    it('should handle stop failure and force kill', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.kill = jest.fn();
      mockSpawn.mockReturnValue(mockProcess);
      mockDockerUtils.killContainer.mockResolvedValue(undefined);

      const promise = service.stopContainer('container123', 'test-instance');

      // Simulate stop failure
      setTimeout(() => mockProcess.emit('close', 1), 10);

      // The promise should reject with the stop failure error
      await expect(promise).rejects.toThrow('Failed to stop container: container123');
    });
  });

  describe('getContainerStats', () => {
    it('should return container stats', async () => {
      const mockStats = { cpu: '10%', memory: '100MB' };
      mockDockerUtils.getContainerStats.mockResolvedValue(mockStats);

      const result = await service.getContainerStats('container123');
      expect(result).toEqual(mockStats);
    });

    it('should return null when stats retrieval fails', async () => {
      mockDockerUtils.getContainerStats.mockRejectedValue(new Error('Stats error'));

      const result = await service.getContainerStats('container123');
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to get container stats for container123:',
        expect.any(Error)
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      mockDockerUtils.cleanupImage.mockResolvedValue(undefined);

      await service.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting Docker service cleanup...');
      expect(mockLogger.info).toHaveBeenCalledWith('Docker service cleanup completed');
    });
  });
});
