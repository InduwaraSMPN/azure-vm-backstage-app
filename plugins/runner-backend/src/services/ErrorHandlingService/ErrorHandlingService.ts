import { LoggerService } from '@backstage/backend-plugin-api';

export interface ErrorContext {
  operation: string;
  instanceId?: string;
  containerId?: string;
  componentRef?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface RunnerError {
  code: string;
  message: string;
  userMessage: string;
  context: ErrorContext;
  originalError?: Error;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  retryable: boolean;
}

export class ErrorHandlingService {
  private errorHistory: RunnerError[] = [];
  private maxHistorySize = 1000;

  constructor(private logger: LoggerService) {}

  /**
   * Handle and categorize errors
   */
  handleError(error: Error | string, context: ErrorContext): RunnerError {
    const runnerError = this.categorizeError(error, context);
    
    // Log the error with appropriate level
    this.logError(runnerError);
    
    // Store in history
    this.addToHistory(runnerError);
    
    return runnerError;
  }

  /**
   * Create a user-friendly error for Docker-related issues
   */
  createDockerError(error: Error | string, context: ErrorContext): RunnerError {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    if (errorMessage.includes('docker: command not found')) {
      return this.handleError(error, context);
    }
    
    if (errorMessage.includes('Cannot connect to the Docker daemon')) {
      return {
        code: 'DOCKER_DAEMON_NOT_RUNNING',
        message: errorMessage,
        userMessage: 'Docker daemon is not running. Please start Docker and try again.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: true,
        retryable: true,
      };
    }
    
    if (errorMessage.includes('port is already allocated') || errorMessage.includes('already in use')) {
      return {
        code: 'PORT_ALREADY_IN_USE',
        message: errorMessage,
        userMessage: 'The required port is already in use. Please stop other services using this port or choose a different port.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'medium',
        recoverable: true,
        retryable: false,
      };
    }
    
    if (errorMessage.includes('No such file or directory') && errorMessage.includes('Dockerfile')) {
      return {
        code: 'DOCKERFILE_NOT_FOUND',
        message: errorMessage,
        userMessage: 'Dockerfile not found in the repository. Please ensure the Dockerfile exists at the specified path.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: false,
        retryable: false,
      };
    }
    
    if (errorMessage.includes('build failed') || errorMessage.includes('RUN')) {
      return {
        code: 'DOCKER_BUILD_FAILED',
        message: errorMessage,
        userMessage: 'Docker build failed. Please check your Dockerfile and build configuration.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: false,
        retryable: true,
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return {
        code: 'DOCKER_OPERATION_TIMEOUT',
        message: errorMessage,
        userMessage: 'Docker operation timed out. This might be due to slow network or large image size.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'medium',
        recoverable: true,
        retryable: true,
      };
    }
    
    // Default Docker error
    return {
      code: 'DOCKER_OPERATION_FAILED',
      message: errorMessage,
      userMessage: 'Docker operation failed. Please check the logs for more details.',
      context,
      originalError: typeof error === 'object' ? error : undefined,
      severity: 'medium',
      recoverable: true,
      retryable: true,
    };
  }

  /**
   * Create a user-friendly error for Git-related issues
   */
  createGitError(error: Error | string, context: ErrorContext): RunnerError {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    if (errorMessage.includes('git: command not found')) {
      return {
        code: 'GIT_NOT_INSTALLED',
        message: errorMessage,
        userMessage: 'Git is not installed or not available in PATH. Please install Git.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'critical',
        recoverable: false,
        retryable: false,
      };
    }
    
    if (errorMessage.includes('Repository not found') || errorMessage.includes('fatal: repository')) {
      return {
        code: 'REPOSITORY_NOT_FOUND',
        message: errorMessage,
        userMessage: 'Repository not found or access denied. Please check the repository URL and permissions.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: false,
        retryable: false,
      };
    }
    
    if (errorMessage.includes('Authentication failed') || errorMessage.includes('Permission denied')) {
      return {
        code: 'GIT_AUTHENTICATION_FAILED',
        message: errorMessage,
        userMessage: 'Git authentication failed. Please check your credentials and repository permissions.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: false,
        retryable: false,
      };
    }
    
    // Default Git error
    return {
      code: 'GIT_OPERATION_FAILED',
      message: errorMessage,
      userMessage: 'Git operation failed. Please check the repository URL and try again.',
      context,
      originalError: typeof error === 'object' ? error : undefined,
      severity: 'medium',
      recoverable: true,
      retryable: true,
    };
  }

  /**
   * Create a user-friendly error for configuration issues
   */
  createConfigError(error: Error | string, context: ErrorContext): RunnerError {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    if (errorMessage.includes('config.yml') || errorMessage.includes('configuration')) {
      return {
        code: 'INVALID_CONFIGURATION',
        message: errorMessage,
        userMessage: 'Invalid runner configuration. Please check your .runner/config.yml file.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'high',
        recoverable: false,
        retryable: false,
      };
    }
    
    if (errorMessage.includes('annotation') || errorMessage.includes('runner.backstage.io')) {
      return {
        code: 'MISSING_RUNNER_ANNOTATION',
        message: errorMessage,
        userMessage: 'Component is missing required runner annotations. Please add runner.backstage.io/enabled annotation.',
        context,
        originalError: typeof error === 'object' ? error : undefined,
        severity: 'medium',
        recoverable: false,
        retryable: false,
      };
    }
    
    // Default configuration error
    return {
      code: 'CONFIGURATION_ERROR',
      message: errorMessage,
      userMessage: 'Configuration error. Please check your component configuration.',
      context,
      originalError: typeof error === 'object' ? error : undefined,
      severity: 'medium',
      recoverable: false,
      retryable: false,
    };
  }

  /**
   * Get error history
   */
  getErrorHistory(limit?: number): RunnerError[] {
    return limit ? this.errorHistory.slice(-limit) : this.errorHistory;
  }

  /**
   * Get errors for a specific instance
   */
  getInstanceErrors(instanceId: string): RunnerError[] {
    return this.errorHistory.filter(error => error.context.instanceId === instanceId);
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.logger.info('Error history cleared');
  }

  /**
   * Categorize error based on content and context
   */
  private categorizeError(error: Error | string, context: ErrorContext): RunnerError {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // Check for Docker-related errors
    if (this.isDockerError(errorMessage, context)) {
      return this.createDockerError(error, context);
    }
    
    // Check for Git-related errors
    if (this.isGitError(errorMessage, context)) {
      return this.createGitError(error, context);
    }
    
    // Check for configuration errors
    if (this.isConfigError(errorMessage, context)) {
      return this.createConfigError(error, context);
    }
    
    // Default generic error
    return {
      code: 'UNKNOWN_ERROR',
      message: errorMessage,
      userMessage: 'An unexpected error occurred. Please try again or contact support.',
      context,
      originalError: typeof error === 'object' ? error : undefined,
      severity: 'medium',
      recoverable: true,
      retryable: true,
    };
  }

  private isDockerError(message: string, context: ErrorContext): boolean {
    return message.toLowerCase().includes('docker') ||
           message.toLowerCase().includes('container') ||
           message.toLowerCase().includes('image') ||
           message.toLowerCase().includes('daemon') ||
           context.operation.toLowerCase().includes('docker') ||
           context.operation.toLowerCase().includes('build') ||
           context.operation.toLowerCase().includes('run');
  }

  private isGitError(message: string, context: ErrorContext): boolean {
    return message.includes('git') || 
           message.includes('repository') || 
           message.includes('clone') ||
           context.operation.includes('git') ||
           context.operation.includes('clone');
  }

  private isConfigError(message: string, context: ErrorContext): boolean {
    return message.includes('config') || 
           message.includes('annotation') || 
           message.includes('yaml') ||
           context.operation.includes('config');
  }

  private logError(error: RunnerError): void {
    const logData = {
      code: error.code,
      operation: error.context.operation,
      instanceId: error.context.instanceId,
      severity: error.severity,
      recoverable: error.recoverable,
      retryable: error.retryable,
    };

    switch (error.severity) {
      case 'critical':
        this.logger.error(`Critical error: ${error.message}`, logData);
        break;
      case 'high':
        this.logger.error(`High severity error: ${error.message}`, logData);
        break;
      case 'medium':
        this.logger.warn(`Medium severity error: ${error.message}`, logData);
        break;
      case 'low':
        this.logger.info(`Low severity error: ${error.message}`, logData);
        break;
      default:
        this.logger.warn(`Unknown severity error: ${error.message}`, logData);
        break;
    }
  }

  private addToHistory(error: RunnerError): void {
    this.errorHistory.push(error);
    
    // Limit history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }
}
