import { DockerUtils } from './dockerUtils';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

describe('DockerUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDockerAvailable', () => {
    it('should return true when docker is available', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.checkDockerAvailable(mockLogger);
      
      // Simulate successful docker --version command
      setTimeout(() => mockProcess.emit('close', 0), 10);

      const result = await promise;
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Docker is available');
    });

    it('should return false when docker is not available', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.checkDockerAvailable(mockLogger);
      
      // Simulate failed docker --version command
      setTimeout(() => mockProcess.emit('close', 1), 10);

      const result = await promise;
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Docker is not available or not running');
    });

    it('should return false when docker command is not found', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.checkDockerAvailable(mockLogger);
      
      // Simulate command not found error
      setTimeout(() => mockProcess.emit('error', new Error('Command not found')), 10);

      const result = await promise;
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Docker command not found');
    });
  });

  describe('checkDockerDaemonRunning', () => {
    it('should return true when docker daemon is running', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.checkDockerDaemonRunning(mockLogger);
      
      // Simulate successful docker info command
      setTimeout(() => mockProcess.emit('close', 0), 10);

      const result = await promise;
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Docker daemon is running');
    });

    it('should return false when docker daemon is not running', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.checkDockerDaemonRunning(mockLogger);
      
      // Simulate failed docker info command
      setTimeout(() => mockProcess.emit('close', 1), 10);

      const result = await promise;
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith('Docker daemon is not running');
    });
  });

  describe('getDockerVersion', () => {
    it('should return docker version', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.getDockerVersion(mockLogger);
      
      // Simulate docker version output
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Docker version 20.10.17, build 100c701\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toBe('20.10.17');
    });

    it('should return unknown when version cannot be parsed', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.getDockerVersion(mockLogger);
      
      // Simulate invalid docker version output
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Invalid output\n');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toBe('unknown');
    });
  });

  describe('getDockerSystemInfo', () => {
    it('should return complete system info when docker is available and running', async () => {
      // Mock checkDockerAvailable to return true
      jest.spyOn(DockerUtils, 'checkDockerAvailable').mockResolvedValue(true);
      jest.spyOn(DockerUtils, 'checkDockerDaemonRunning').mockResolvedValue(true);
      jest.spyOn(DockerUtils, 'getDockerVersion').mockResolvedValue('20.10.17');

      const result = await DockerUtils.getDockerSystemInfo(mockLogger);

      expect(result).toEqual({
        version: '20.10.17',
        daemonRunning: true,
        available: true,
      });
    });

    it('should return correct info when docker is not available', async () => {
      jest.spyOn(DockerUtils, 'checkDockerAvailable').mockResolvedValue(false);

      const result = await DockerUtils.getDockerSystemInfo(mockLogger);

      expect(result).toEqual({
        version: 'unknown',
        daemonRunning: false,
        available: false,
      });
    });
  });

  describe('cleanupImage', () => {
    it('should successfully cleanup image', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.cleanupImage('test-image', mockLogger);
      
      // Simulate successful docker rmi command
      setTimeout(() => mockProcess.emit('close', 0), 10);

      await promise;
      expect(mockLogger.info).toHaveBeenCalledWith('Cleaned up image: test-image');
    });

    it('should handle cleanup failure gracefully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.cleanupImage('test-image', mockLogger);
      
      // Simulate failed docker rmi command
      setTimeout(() => mockProcess.emit('close', 1), 10);

      await promise;
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to cleanup image: test-image');
    });
  });

  describe('getContainerStatus', () => {
    it('should return container status', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.getContainerStatus('container123');
      
      // Simulate docker inspect output
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'running');
        mockProcess.emit('close', 0);
      }, 10);

      const result = await promise;
      expect(result).toBe('running');
    });

    it('should return null when container not found', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockSpawn.mockReturnValue(mockProcess);

      const promise = DockerUtils.getContainerStatus('container123');
      
      // Simulate failed docker inspect command
      setTimeout(() => mockProcess.emit('close', 1), 10);

      const result = await promise;
      expect(result).toBe(null);
    });
  });

  describe('isPortAvailable', () => {
    it('should return port check results', async () => {
      // Test the port checking logic by checking the structure
      const result = await DockerUtils.checkPortsAvailable([3000]);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty('port', 3000);
      expect(result[0]).toHaveProperty('available');
      expect(typeof result[0].available).toBe('boolean');
    });
  });

  describe('checkPortsAvailable', () => {
    it('should check multiple ports', async () => {
      jest.spyOn(DockerUtils, 'isPortAvailable')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await DockerUtils.checkPortsAvailable([3000, 3001]);
      
      expect(result).toEqual([
        { port: 3000, available: true },
        { port: 3001, available: false },
      ]);
    });
  });

  describe('getDefaultDockerConfig', () => {
    it('should return default configuration', () => {
      const config = DockerUtils.getDefaultDockerConfig();
      
      expect(config).toEqual({
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
  });
});
