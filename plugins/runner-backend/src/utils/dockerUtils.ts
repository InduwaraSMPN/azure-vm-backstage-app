import { spawn } from 'child_process';
import { LoggerService } from '@backstage/backend-plugin-api';
import * as net from 'net';

export interface DockerSystemInfo {
  version: string;
  daemonRunning: boolean;
  available: boolean;
}

export interface ContainerResourceLimits {
  memory?: string; // e.g., "512m", "1g"
  cpus?: string;   // e.g., "0.5", "1.0"
  timeout?: number; // seconds
}

export interface DockerConfig {
  connectionTimeout: number;
  buildTimeout: number;
  runTimeout: number;
  resourceLimits: ContainerResourceLimits;
  securityOptions: string[];
  imageCleanupPolicy: 'always' | 'on-error' | 'never';
}

export class DockerUtils {
  /**
   * Check if Docker is available on the system
   */
  static async checkDockerAvailable(logger: LoggerService): Promise<boolean> {
    return new Promise((resolve) => {
      const dockerVersion = spawn('docker', ['--version']);

      dockerVersion.on('close', (code) => {
        if (code === 0) {
          logger.info('Docker is available');
          resolve(true);
        } else {
          logger.error('Docker is not available or not running');
          resolve(false);
        }
      });

      dockerVersion.on('error', () => {
        logger.error('Docker command not found');
        resolve(false);
      });
    });
  }

  /**
   * Check if Docker daemon is running
   */
  static async checkDockerDaemonRunning(logger: LoggerService): Promise<boolean> {
    return new Promise((resolve) => {
      const dockerInfo = spawn('docker', ['info']);

      dockerInfo.on('close', (code) => {
        if (code === 0) {
          logger.info('Docker daemon is running');
          resolve(true);
        } else {
          logger.error('Docker daemon is not running');
          resolve(false);
        }
      });

      dockerInfo.on('error', () => {
        logger.error('Failed to check Docker daemon status');
        resolve(false);
      });
    });
  }

  /**
   * Get comprehensive Docker system information
   */
  static async getDockerSystemInfo(logger: LoggerService): Promise<DockerSystemInfo> {
    const available = await this.checkDockerAvailable(logger);
    const daemonRunning = available ? await this.checkDockerDaemonRunning(logger) : false;
    
    let version = 'unknown';
    if (available) {
      version = await this.getDockerVersion(logger);
    }

    return {
      version,
      daemonRunning,
      available,
    };
  }

  /**
   * Get Docker version
   */
  static async getDockerVersion(logger: LoggerService): Promise<string> {
    return new Promise((resolve) => {
      const dockerVersion = spawn('docker', ['--version']);
      let output = '';

      dockerVersion.stdout?.on('data', (data) => {
        output += data.toString();
      });

      dockerVersion.on('close', (code) => {
        if (code === 0) {
          // Extract version from output like "Docker version 20.10.17, build 100c701"
          const match = output.match(/Docker version ([^,]+)/);
          resolve(match ? match[1] : 'unknown');
        } else {
          logger.warn('Failed to get Docker version');
          resolve('unknown');
        }
      });
    });
  }

  /**
   * Clean up Docker image
   */
  static async cleanupImage(imageName: string, logger: LoggerService): Promise<void> {
    return new Promise((resolve) => {
      const dockerRmi = spawn('docker', ['rmi', imageName, '--force']);

      dockerRmi.on('close', (code) => {
        if (code === 0) {
          logger.info(`Cleaned up image: ${imageName}`);
        } else {
          logger.warn(`Failed to cleanup image: ${imageName}`);
        }
        resolve();
      });

      dockerRmi.on('error', () => {
        logger.warn(`Error during image cleanup: ${imageName}`);
        resolve();
      });
    });
  }

  /**
   * Get detailed container status
   */
  static async getContainerStatus(containerId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const dockerInspect = spawn('docker', ['inspect', '--format={{.State.Status}}', containerId]);
      let status = '';

      dockerInspect.stdout?.on('data', (data) => {
        status += data.toString().trim();
      });

      dockerInspect.on('close', (code) => {
        if (code === 0) {
          resolve(status);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Get container resource usage
   */
  static async getContainerStats(containerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const dockerStats = spawn('docker', ['stats', '--no-stream', '--format', 'json', containerId]);
      let output = '';

      dockerStats.stdout?.on('data', (data) => {
        output += data.toString();
      });

      dockerStats.on('close', (code) => {
        if (code === 0) {
          try {
            const stats = JSON.parse(output);
            resolve(stats);
          } catch (error) {
            reject(new Error('Failed to parse container stats'));
          }
        } else {
          reject(new Error('Failed to get container stats'));
        }
      });
    });
  }

  /**
   * Check if a port is available
   */
  static async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.listen(port, () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }

  /**
   * Check multiple ports for availability
   */
  static async checkPortsAvailable(ports: number[]): Promise<{ port: number; available: boolean }[]> {
    const results = await Promise.all(
      ports.map(async (port) => ({
        port,
        available: await this.isPortAvailable(port),
      }))
    );
    return results;
  }

  /**
   * Kill container forcefully
   */
  static async killContainer(containerId: string, logger: LoggerService): Promise<void> {
    return new Promise((resolve) => {
      const dockerKill = spawn('docker', ['kill', containerId]);

      dockerKill.on('close', (code) => {
        if (code === 0) {
          logger.info(`Forcefully killed container: ${containerId}`);
        } else {
          logger.warn(`Failed to kill container: ${containerId}`);
        }
        resolve();
      });

      dockerKill.on('error', () => {
        logger.warn(`Error during container kill: ${containerId}`);
        resolve();
      });
    });
  }

  /**
   * Remove container
   */
  static async removeContainer(containerId: string, logger: LoggerService): Promise<void> {
    return new Promise((resolve) => {
      const dockerRm = spawn('docker', ['rm', '-f', containerId]);

      dockerRm.on('close', (code) => {
        if (code === 0) {
          logger.info(`Removed container: ${containerId}`);
        } else {
          logger.warn(`Failed to remove container: ${containerId}`);
        }
        resolve();
      });

      dockerRm.on('error', () => {
        logger.warn(`Error during container removal: ${containerId}`);
        resolve();
      });
    });
  }

  /**
   * Get default Docker configuration
   */
  static getDefaultDockerConfig(): DockerConfig {
    return {
      connectionTimeout: 30000, // 30 seconds
      buildTimeout: 600000,     // 10 minutes
      runTimeout: 300000,       // 5 minutes
      resourceLimits: {
        memory: '1g',
        cpus: '1.0',
        timeout: 3600, // 1 hour
      },
      securityOptions: ['--security-opt=no-new-privileges'],
      imageCleanupPolicy: 'on-error',
    };
  }
}
