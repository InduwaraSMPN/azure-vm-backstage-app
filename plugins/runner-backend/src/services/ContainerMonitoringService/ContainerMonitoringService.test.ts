import { ContainerMonitoringService } from './ContainerMonitoringService';
import { DockerService } from '../DockerService/DockerService';
import { RunnerInstance } from '../RunnerService/types';

// Mock DockerService
const mockDockerService = {
  isContainerRunning: jest.fn(),
  getContainerStats: jest.fn(),
} as unknown as DockerService;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

describe('ContainerMonitoringService', () => {
  let service: ContainerMonitoringService;
  let mockInstance: RunnerInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    service = new ContainerMonitoringService(mockLogger, mockDockerService, {
      healthCheckInterval: 1000,
      metricsCollectionInterval: 500,
    });

    mockInstance = {
      id: 'test-instance',
      componentRef: 'Component:default/test-component',
      status: 'running',
      containerId: 'container123',
      ports: [3000],
      startedAt: new Date().toISOString(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    service.cleanup();
  });

  describe('startMonitoring', () => {
    it('should start monitoring a container', () => {
      service.startMonitoring(mockInstance);

      expect(mockLogger.info).toHaveBeenCalledWith('Starting monitoring for container container123');
      
      const health = service.getContainerHealth('container123');
      expect(health).toBeDefined();
      expect(health?.containerId).toBe('container123');
      expect(health?.status).toBe('starting');
    });

    it('should not start monitoring without container ID', () => {
      const instanceWithoutContainer = { ...mockInstance, containerId: undefined };
      service.startMonitoring(instanceWithoutContainer);

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot monitor instance test-instance: no container ID');
    });

    it('should perform health checks at intervals', async () => {
      (mockDockerService.isContainerRunning as jest.Mock).mockResolvedValue(true);
      
      service.startMonitoring(mockInstance);

      // Fast-forward time to trigger health check
      jest.advanceTimersByTime(1000);
      
      // Allow promises to resolve
      await Promise.resolve();

      expect(mockDockerService.isContainerRunning).toHaveBeenCalledWith('container123');
    });

    it('should collect metrics at intervals', async () => {
      const mockStats = {
        CPUPerc: '10.5%',
        MemUsage: '100MB / 1GB',
        MemPerc: '10%',
        NetIO: '1KB / 2KB',
        BlockIO: '10MB / 20MB',
      };
      
      (mockDockerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      service.startMonitoring(mockInstance);

      // Fast-forward time to trigger metrics collection
      jest.advanceTimersByTime(500);
      
      // Allow promises to resolve
      await Promise.resolve();

      expect(mockDockerService.getContainerStats).toHaveBeenCalledWith('container123');
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring a container', () => {
      service.startMonitoring(mockInstance);
      service.stopMonitoring('container123');

      expect(mockLogger.info).toHaveBeenCalledWith('Stopping monitoring for container container123');
      
      const health = service.getContainerHealth('container123');
      expect(health?.status).toBe('unknown');
    });
  });

  describe('getContainerHealth', () => {
    it('should return container health', () => {
      service.startMonitoring(mockInstance);
      
      const health = service.getContainerHealth('container123');
      expect(health).toBeDefined();
      expect(health?.containerId).toBe('container123');
    });

    it('should return null for non-monitored container', () => {
      const health = service.getContainerHealth('non-existent');
      expect(health).toBeNull();
    });
  });

  describe('getContainerMetrics', () => {
    it('should return container metrics', async () => {
      const mockStats = {
        CPUPerc: '10.5%',
        MemUsage: '100MB / 1GB',
        MemPerc: '10%',
        NetIO: '1KB / 2KB',
        BlockIO: '10MB / 20MB',
      };
      
      (mockDockerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      service.startMonitoring(mockInstance);

      // Trigger metrics collection
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      const metrics = service.getContainerMetrics('container123');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].containerId).toBe('container123');
      expect(metrics[0].cpu.usage).toBe(10.5);
    });

    it('should return limited metrics when limit is specified', async () => {
      const mockStats = { CPUPerc: '10%' };
      (mockDockerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      service.startMonitoring(mockInstance);

      // Collect multiple metrics
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      }

      const metrics = service.getContainerMetrics('container123', 3);
      expect(metrics.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getAllMonitoredContainers', () => {
    it('should return all monitored container IDs', () => {
      const instance1 = { ...mockInstance, containerId: 'container1' };
      const instance2 = { ...mockInstance, containerId: 'container2' };
      
      service.startMonitoring(instance1);
      service.startMonitoring(instance2);

      const containers = service.getAllMonitoredContainers();
      expect(containers).toContain('container1');
      expect(containers).toContain('container2');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all monitoring data', () => {
      service.startMonitoring(mockInstance);
      service.cleanup();

      expect(mockLogger.info).toHaveBeenCalledWith('Cleaning up container monitoring service');
      expect(service.getAllMonitoredContainers()).toHaveLength(0);
    });
  });

  describe('health check alerts', () => {
    it('should log alert when container becomes unhealthy', async () => {
      (mockDockerService.isContainerRunning as jest.Mock).mockResolvedValue(false);
      
      service.startMonitoring(mockInstance);

      // Trigger health check
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Container health alert: container123 is unhealthy',
        expect.any(Object)
      );
    });
  });

  describe('metrics parsing', () => {
    it('should parse CPU usage correctly', async () => {
      const mockStats = { CPUPerc: '15.75%' };
      (mockDockerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      service.startMonitoring(mockInstance);

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      const metrics = service.getContainerMetrics('container123');
      expect(metrics[0].cpu.usage).toBe(15.75);
    });

    it('should parse memory usage correctly', async () => {
      const mockStats = { 
        MemUsage: '512MB / 2GB',
        MemPerc: '25%'
      };
      (mockDockerService.getContainerStats as jest.Mock).mockResolvedValue(mockStats);
      
      service.startMonitoring(mockInstance);

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      const metrics = service.getContainerMetrics('container123');
      expect(metrics[0].memory.percentage).toBe(25);
    });
  });
});
