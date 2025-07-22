import { ErrorHandlingService, ErrorContext } from './ErrorHandlingService';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger),
} as any;

describe('ErrorHandlingService', () => {
  let service: ErrorHandlingService;
  let context: ErrorContext;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ErrorHandlingService(mockLogger);
    context = {
      operation: 'test-operation',
      instanceId: 'test-instance',
      componentRef: 'Component:default/test-component',
      timestamp: new Date().toISOString(),
    };
  });

  describe('handleError', () => {
    it('should handle and categorize errors', () => {
      const error = new Error('Cannot connect to the Docker daemon');
      const runnerError = service.handleError(error, context);

      expect(runnerError.code).toBe('DOCKER_DAEMON_NOT_RUNNING');
      expect(runnerError.userMessage).toBe('Docker daemon is not running. Please start Docker and try again.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(true);
    });

    it('should log errors with appropriate severity', () => {
      const error = new Error('Cannot connect to the Docker daemon');
      service.handleError(error, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'High severity error: Cannot connect to the Docker daemon',
        expect.objectContaining({
          code: 'DOCKER_DAEMON_NOT_RUNNING',
          severity: 'high',
        })
      );
    });

    it('should store errors in history', () => {
      const error = new Error('Test error');
      service.handleError(error, context);

      const history = service.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].message).toBe('Test error');
    });
  });

  describe('createDockerError', () => {
    it('should handle Docker daemon not running error', () => {
      const error = new Error('Cannot connect to the Docker daemon');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('DOCKER_DAEMON_NOT_RUNNING');
      expect(runnerError.userMessage).toBe('Docker daemon is not running. Please start Docker and try again.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(true);
    });

    it('should handle port already in use error', () => {
      const error = new Error('port is already allocated');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('PORT_ALREADY_IN_USE');
      expect(runnerError.userMessage).toBe('The required port is already in use. Please stop other services using this port or choose a different port.');
      expect(runnerError.severity).toBe('medium');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle Dockerfile not found error', () => {
      const error = new Error('No such file or directory: Dockerfile');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('DOCKERFILE_NOT_FOUND');
      expect(runnerError.userMessage).toBe('Dockerfile not found in the repository. Please ensure the Dockerfile exists at the specified path.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle Docker build failed error', () => {
      const error = new Error('build failed: RUN command failed');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('DOCKER_BUILD_FAILED');
      expect(runnerError.userMessage).toBe('Docker build failed. Please check your Dockerfile and build configuration.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(true);
    });

    it('should handle timeout errors', () => {
      const error = new Error('Operation timed out');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('DOCKER_OPERATION_TIMEOUT');
      expect(runnerError.userMessage).toBe('Docker operation timed out. This might be due to slow network or large image size.');
      expect(runnerError.severity).toBe('medium');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(true);
    });

    it('should handle generic Docker errors', () => {
      const error = new Error('Unknown Docker error');
      const runnerError = service.createDockerError(error, context);

      expect(runnerError.code).toBe('DOCKER_OPERATION_FAILED');
      expect(runnerError.userMessage).toBe('Docker operation failed. Please check the logs for more details.');
      expect(runnerError.severity).toBe('medium');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(true);
    });
  });

  describe('createGitError', () => {
    it('should handle Git not installed error', () => {
      const error = new Error('git: command not found');
      const runnerError = service.createGitError(error, context);

      expect(runnerError.code).toBe('GIT_NOT_INSTALLED');
      expect(runnerError.userMessage).toBe('Git is not installed or not available in PATH. Please install Git.');
      expect(runnerError.severity).toBe('critical');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle repository not found error', () => {
      const error = new Error('Repository not found');
      const runnerError = service.createGitError(error, context);

      expect(runnerError.code).toBe('REPOSITORY_NOT_FOUND');
      expect(runnerError.userMessage).toBe('Repository not found or access denied. Please check the repository URL and permissions.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle authentication failed error', () => {
      const error = new Error('Authentication failed');
      const runnerError = service.createGitError(error, context);

      expect(runnerError.code).toBe('GIT_AUTHENTICATION_FAILED');
      expect(runnerError.userMessage).toBe('Git authentication failed. Please check your credentials and repository permissions.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle generic Git errors', () => {
      const error = new Error('Unknown Git error');
      const runnerError = service.createGitError(error, context);

      expect(runnerError.code).toBe('GIT_OPERATION_FAILED');
      expect(runnerError.userMessage).toBe('Git operation failed. Please check the repository URL and try again.');
      expect(runnerError.severity).toBe('medium');
      expect(runnerError.recoverable).toBe(true);
      expect(runnerError.retryable).toBe(true);
    });
  });

  describe('createConfigError', () => {
    it('should handle invalid configuration error', () => {
      const error = new Error('Invalid config.yml format');
      const runnerError = service.createConfigError(error, context);

      expect(runnerError.code).toBe('INVALID_CONFIGURATION');
      expect(runnerError.userMessage).toBe('Invalid runner configuration. Please check your .runner/config.yml file.');
      expect(runnerError.severity).toBe('high');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });

    it('should handle missing annotation error', () => {
      const error = new Error('Missing runner.backstage.io/enabled annotation');
      const runnerError = service.createConfigError(error, context);

      expect(runnerError.code).toBe('MISSING_RUNNER_ANNOTATION');
      expect(runnerError.userMessage).toBe('Component is missing required runner annotations. Please add runner.backstage.io/enabled annotation.');
      expect(runnerError.severity).toBe('medium');
      expect(runnerError.recoverable).toBe(false);
      expect(runnerError.retryable).toBe(false);
    });
  });

  describe('getErrorHistory', () => {
    it('should return error history', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      service.handleError(error1, context);
      service.handleError(error2, context);

      const history = service.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Error 1');
      expect(history[1].message).toBe('Error 2');
    });

    it('should return limited error history', () => {
      for (let i = 0; i < 5; i++) {
        service.handleError(new Error(`Error ${i}`), context);
      }

      const history = service.getErrorHistory(3);
      expect(history).toHaveLength(3);
      expect(history[0].message).toBe('Error 2');
      expect(history[2].message).toBe('Error 4');
    });
  });

  describe('getInstanceErrors', () => {
    it('should return errors for specific instance', () => {
      const context1 = { ...context, instanceId: 'instance-1' };
      const context2 = { ...context, instanceId: 'instance-2' };
      
      service.handleError(new Error('Error 1'), context1);
      service.handleError(new Error('Error 2'), context2);
      service.handleError(new Error('Error 3'), context1);

      const instanceErrors = service.getInstanceErrors('instance-1');
      expect(instanceErrors).toHaveLength(2);
      expect(instanceErrors[0].message).toBe('Error 1');
      expect(instanceErrors[1].message).toBe('Error 3');
    });
  });

  describe('clearHistory', () => {
    it('should clear error history', () => {
      service.handleError(new Error('Test error'), context);
      expect(service.getErrorHistory()).toHaveLength(1);

      service.clearHistory();
      expect(service.getErrorHistory()).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Error history cleared');
    });
  });
});
