/**
 * Deployment step types and interfaces for the runner plugin stepper UI
 */

export enum DeploymentStepType {
  DOWNLOADING_REPOSITORY = 'downloading_repository',
  EXTRACTING_FILES = 'extracting_files', 
  BUILDING_IMAGE = 'building_image',
  STARTING_CONTAINER = 'starting_container',
  MONITORING_CONTAINER = 'monitoring_container',
}

export enum DeploymentStepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface DeploymentStep {
  type: DeploymentStepType;
  status: DeploymentStepStatus;
  title: string;
  description?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  progress?: number; // 0-100 percentage for steps that support progress tracking
}

export interface DeploymentProgress {
  currentStep: DeploymentStepType;
  steps: DeploymentStep[];
  overallProgress: number; // 0-100 percentage
  isComplete: boolean;
  hasError: boolean;
  startedAt: string;
  completedAt?: string;
}

// Default step definitions with titles and descriptions
export const DEFAULT_DEPLOYMENT_STEPS: Omit<DeploymentStep, 'status' | 'startedAt' | 'completedAt'>[] = [
  {
    type: DeploymentStepType.DOWNLOADING_REPOSITORY,
    title: 'Downloading Repository',
    description: 'Fetching source code from GitHub repository',
  },
  {
    type: DeploymentStepType.EXTRACTING_FILES,
    title: 'Extracting Files',
    description: 'Extracting repository archive to temporary directory',
  },
  {
    type: DeploymentStepType.BUILDING_IMAGE,
    title: 'Building Docker Image',
    description: 'Building container image from Dockerfile',
  },
  {
    type: DeploymentStepType.STARTING_CONTAINER,
    title: 'Starting Container',
    description: 'Creating and starting the Docker container',
  },
  {
    type: DeploymentStepType.MONITORING_CONTAINER,
    title: 'Monitoring Container',
    description: 'Setting up health checks and monitoring',
  },
];

// Helper functions for working with deployment progress
export class DeploymentProgressHelper {
  /**
   * Create initial deployment progress with all steps in pending state
   */
  static createInitialProgress(): DeploymentProgress {
    const steps: DeploymentStep[] = DEFAULT_DEPLOYMENT_STEPS.map(stepDef => ({
      ...stepDef,
      status: DeploymentStepStatus.PENDING,
    }));

    return {
      currentStep: DeploymentStepType.DOWNLOADING_REPOSITORY,
      steps,
      overallProgress: 0,
      isComplete: false,
      hasError: false,
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Update a specific step's status and progress
   */
  static updateStep(
    progress: DeploymentProgress,
    stepType: DeploymentStepType,
    status: DeploymentStepStatus,
    options?: {
      error?: string;
      progress?: number;
      description?: string;
    }
  ): DeploymentProgress {
    const updatedSteps = progress.steps.map(step => {
      if (step.type === stepType) {
        const updatedStep: DeploymentStep = {
          ...step,
          status,
          ...(options?.error && { error: options.error }),
          ...(options?.progress !== undefined && { progress: options.progress }),
          ...(options?.description && { description: options.description }),
        };

        // Set timestamps based on status
        if (status === DeploymentStepStatus.IN_PROGRESS && !step.startedAt) {
          updatedStep.startedAt = new Date().toISOString();
        } else if (
          (status === DeploymentStepStatus.COMPLETED || status === DeploymentStepStatus.FAILED) &&
          !step.completedAt
        ) {
          updatedStep.completedAt = new Date().toISOString();
        }

        return updatedStep;
      }
      return step;
    });

    // Calculate overall progress
    const completedSteps = updatedSteps.filter(step => step.status === DeploymentStepStatus.COMPLETED).length;
    const totalSteps = updatedSteps.length;
    const overallProgress = Math.round((completedSteps / totalSteps) * 100);

    // Determine if deployment is complete or has error
    const hasError = updatedSteps.some(step => step.status === DeploymentStepStatus.FAILED);
    const isComplete = completedSteps === totalSteps || hasError;

    // Update current step to next pending step if current step is completed
    let currentStep = progress.currentStep;
    if (status === DeploymentStepStatus.COMPLETED) {
      const currentStepIndex = updatedSteps.findIndex(step => step.type === stepType);
      const nextStep = updatedSteps.find((step, index) => 
        index > currentStepIndex && step.status === DeploymentStepStatus.PENDING
      );
      if (nextStep) {
        currentStep = nextStep.type;
      }
    }

    return {
      ...progress,
      currentStep,
      steps: updatedSteps,
      overallProgress,
      isComplete,
      hasError,
      ...(isComplete && !progress.completedAt && { completedAt: new Date().toISOString() }),
    };
  }

  /**
   * Get the current active step
   */
  static getCurrentStep(progress: DeploymentProgress): DeploymentStep | undefined {
    return progress.steps.find(step => step.type === progress.currentStep);
  }

  /**
   * Get all completed steps
   */
  static getCompletedSteps(progress: DeploymentProgress): DeploymentStep[] {
    return progress.steps.filter(step => step.status === DeploymentStepStatus.COMPLETED);
  }

  /**
   * Get all failed steps
   */
  static getFailedSteps(progress: DeploymentProgress): DeploymentStep[] {
    return progress.steps.filter(step => step.status === DeploymentStepStatus.FAILED);
  }

  /**
   * Check if a specific step is completed
   */
  static isStepCompleted(progress: DeploymentProgress, stepType: DeploymentStepType): boolean {
    const step = progress.steps.find(s => s.type === stepType);
    return step?.status === DeploymentStepStatus.COMPLETED;
  }

  /**
   * Check if a specific step has failed
   */
  static isStepFailed(progress: DeploymentProgress, stepType: DeploymentStepType): boolean {
    const step = progress.steps.find(s => s.type === stepType);
    return step?.status === DeploymentStepStatus.FAILED;
  }

  /**
   * Get step by type
   */
  static getStep(progress: DeploymentProgress, stepType: DeploymentStepType): DeploymentStep | undefined {
    return progress.steps.find(step => step.type === stepType);
  }
}
