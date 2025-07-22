import { LoggerService } from '@backstage/backend-plugin-api';
import { DockerService } from '../DockerService/DockerService';
import { RunnerInstance } from '../RunnerService/types';

export interface ContainerHealth {
  containerId: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'unknown';
  lastCheck: string;
  checks: HealthCheck[];
  uptime: number; // seconds
  restartCount: number;
}

export interface HealthCheck {
  timestamp: string;
  success: boolean;
  responseTime?: number; // milliseconds
  error?: string;
}

export interface ContainerMetrics {
  containerId: string;
  timestamp: string;
  cpu: {
    usage: number; // percentage
    limit?: number;
  };
  memory: {
    usage: number; // bytes
    limit?: number; // bytes
    percentage: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
  };
  io: {
    readBytes: number;
    writeBytes: number;
  };
}

export interface MonitoringConfig {
  healthCheckInterval: number; // milliseconds
  metricsCollectionInterval: number; // milliseconds
  maxHealthCheckHistory: number;
  maxMetricsHistory: number;
  alertThresholds: {
    cpuUsage: number; // percentage
    memoryUsage: number; // percentage
    responseTime: number; // milliseconds
  };
}

export class ContainerMonitoringService {
  private healthChecks = new Map<string, ContainerHealth>();
  private metrics = new Map<string, ContainerMetrics[]>();
  private monitoringIntervals = new Map<string, NodeJS.Timeout>();
  private config: MonitoringConfig;

  constructor(
    private logger: LoggerService,
    private dockerService: DockerService,
    config?: Partial<MonitoringConfig>
  ) {
    this.config = {
      healthCheckInterval: 30000, // 30 seconds
      metricsCollectionInterval: 10000, // 10 seconds
      maxHealthCheckHistory: 100,
      maxMetricsHistory: 288, // 48 hours at 10-second intervals
      alertThresholds: {
        cpuUsage: 80,
        memoryUsage: 85,
        responseTime: 5000,
      },
      ...config,
    };
  }

  /**
   * Start monitoring a container
   */
  startMonitoring(instance: RunnerInstance): void {
    if (!instance.containerId) {
      this.logger.warn(`Cannot monitor instance ${instance.id}: no container ID`);
      return;
    }

    this.logger.info(`Starting monitoring for container ${instance.containerId}`);

    // Initialize health tracking
    this.healthChecks.set(instance.containerId, {
      containerId: instance.containerId,
      status: 'starting',
      lastCheck: new Date().toISOString(),
      checks: [],
      uptime: 0,
      restartCount: 0,
    });

    // Initialize metrics tracking
    this.metrics.set(instance.containerId, []);

    // Start health check interval
    const healthInterval = setInterval(() => {
      this.performHealthCheck(instance).catch(error => {
        this.logger.error(`Health check failed for ${instance.containerId}:`, error);
      });
    }, this.config.healthCheckInterval);

    // Start metrics collection interval
    const metricsInterval = setInterval(() => {
      this.collectMetrics(instance.containerId!).catch(error => {
        this.logger.error(`Metrics collection failed for ${instance.containerId}:`, error);
      });
    }, this.config.metricsCollectionInterval);

    // Store intervals for cleanup
    this.monitoringIntervals.set(instance.containerId, healthInterval);
    this.monitoringIntervals.set(`${instance.containerId}-metrics`, metricsInterval);
  }

  /**
   * Stop monitoring a container
   */
  stopMonitoring(containerId: string): void {
    this.logger.info(`Stopping monitoring for container ${containerId}`);

    // Clear intervals
    const healthInterval = this.monitoringIntervals.get(containerId);
    const metricsInterval = this.monitoringIntervals.get(`${containerId}-metrics`);

    if (healthInterval) {
      clearInterval(healthInterval);
      this.monitoringIntervals.delete(containerId);
    }

    if (metricsInterval) {
      clearInterval(metricsInterval);
      this.monitoringIntervals.delete(`${containerId}-metrics`);
    }

    // Keep historical data but mark as stopped
    const health = this.healthChecks.get(containerId);
    if (health) {
      health.status = 'unknown';
      health.lastCheck = new Date().toISOString();
    }
  }

  /**
   * Get container health status
   */
  getContainerHealth(containerId: string): ContainerHealth | null {
    return this.healthChecks.get(containerId) || null;
  }

  /**
   * Get container metrics
   */
  getContainerMetrics(containerId: string, limit?: number): ContainerMetrics[] {
    const allMetrics = this.metrics.get(containerId) || [];
    return limit ? allMetrics.slice(-limit) : allMetrics;
  }

  /**
   * Get all monitored containers
   */
  getAllMonitoredContainers(): string[] {
    return Array.from(this.healthChecks.keys());
  }

  /**
   * Cleanup monitoring data
   */
  cleanup(): void {
    this.logger.info('Cleaning up container monitoring service');

    // Clear all intervals
    for (const interval of this.monitoringIntervals.values()) {
      clearInterval(interval);
    }

    this.monitoringIntervals.clear();
    this.healthChecks.clear();
    this.metrics.clear();
  }

  /**
   * Perform health check on a container
   */
  private async performHealthCheck(instance: RunnerInstance): Promise<void> {
    if (!instance.containerId) return;

    const startTime = Date.now();
    const health = this.healthChecks.get(instance.containerId);
    if (!health) return;

    try {
      // Check if container is running
      const isRunning = await this.dockerService.isContainerRunning(instance.containerId);
      const responseTime = Date.now() - startTime;

      const check: HealthCheck = {
        timestamp: new Date().toISOString(),
        success: isRunning,
        responseTime,
      };

      if (!isRunning) {
        check.error = 'Container is not running';
        health.status = 'unhealthy';
      } else {
        health.status = 'healthy';
        health.uptime = Math.floor((Date.now() - new Date(instance.startedAt).getTime()) / 1000);
      }

      // Add check to history
      health.checks.push(check);
      if (health.checks.length > this.config.maxHealthCheckHistory) {
        health.checks.shift();
      }

      health.lastCheck = check.timestamp;

      // Check for alerts
      this.checkAlerts(instance.containerId, check);

    } catch (error) {
      const check: HealthCheck = {
        timestamp: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      health.checks.push(check);
      health.status = 'unhealthy';
      health.lastCheck = check.timestamp;

      this.logger.warn(`Health check failed for ${instance.containerId}:`, error as any);
    }
  }

  /**
   * Collect container metrics
   */
  private async collectMetrics(containerId: string): Promise<void> {
    try {
      const stats = await this.dockerService.getContainerStats(containerId);
      if (!stats) return;

      const metrics: ContainerMetrics = {
        containerId,
        timestamp: new Date().toISOString(),
        cpu: {
          usage: this.parseCpuUsage(stats),
        },
        memory: {
          usage: this.parseMemoryUsage(stats),
          limit: this.parseMemoryLimit(stats),
          percentage: this.parseMemoryPercentage(stats),
        },
        network: {
          rxBytes: this.parseNetworkRx(stats),
          txBytes: this.parseNetworkTx(stats),
        },
        io: {
          readBytes: this.parseIoRead(stats),
          writeBytes: this.parseIoWrite(stats),
        },
      };

      // Add to metrics history
      const containerMetrics = this.metrics.get(containerId) || [];
      containerMetrics.push(metrics);

      // Limit history size
      if (containerMetrics.length > this.config.maxMetricsHistory) {
        containerMetrics.shift();
      }

      this.metrics.set(containerId, containerMetrics);

      // Check for metric-based alerts
      this.checkMetricAlerts(containerId, metrics);

    } catch (error) {
      this.logger.warn(`Failed to collect metrics for ${containerId}:`, error as any);
    }
  }

  /**
   * Check for alerts based on health checks
   */
  private checkAlerts(containerId: string, check: HealthCheck): void {
    if (!check.success) {
      this.logger.warn(`Container health alert: ${containerId} is unhealthy`, { check: check as any });
    }

    if (check.responseTime && check.responseTime > this.config.alertThresholds.responseTime) {
      this.logger.warn(`Container response time alert: ${containerId} response time is ${check.responseTime}ms`, { check: check as any });
    }
  }

  /**
   * Check for alerts based on metrics
   */
  private checkMetricAlerts(containerId: string, metrics: ContainerMetrics): void {
    if (metrics.cpu.usage > this.config.alertThresholds.cpuUsage) {
      this.logger.warn(`Container CPU alert: ${containerId} CPU usage is ${metrics.cpu.usage}%`, { metrics: metrics as any });
    }

    if (metrics.memory.percentage > this.config.alertThresholds.memoryUsage) {
      this.logger.warn(`Container memory alert: ${containerId} memory usage is ${metrics.memory.percentage}%`, { metrics: metrics as any });
    }
  }

  // Utility methods for parsing Docker stats
  private parseCpuUsage(stats: any): number {
    // Implementation depends on Docker stats format
    return parseFloat(stats.CPUPerc?.replace('%', '')) || 0;
  }

  private parseMemoryUsage(stats: any): number {
    return parseInt(stats.MemUsage?.split('/')[0]?.replace(/[^\d]/g, ''), 10) || 0;
  }

  private parseMemoryLimit(stats: any): number {
    return parseInt(stats.MemUsage?.split('/')[1]?.replace(/[^\d]/g, ''), 10) || 0;
  }

  private parseMemoryPercentage(stats: any): number {
    return parseFloat(stats.MemPerc?.replace('%', '')) || 0;
  }

  private parseNetworkRx(stats: any): number {
    return parseInt(stats.NetIO?.split('/')[0]?.replace(/[^\d]/g, ''), 10) || 0;
  }

  private parseNetworkTx(stats: any): number {
    return parseInt(stats.NetIO?.split('/')[1]?.replace(/[^\d]/g, ''), 10) || 0;
  }

  private parseIoRead(stats: any): number {
    return parseInt(stats.BlockIO?.split('/')[0]?.replace(/[^\d]/g, ''), 10) || 0;
  }

  private parseIoWrite(stats: any): number {
    return parseInt(stats.BlockIO?.split('/')[1]?.replace(/[^\d]/g, ''), 10) || 0;
  }
}
