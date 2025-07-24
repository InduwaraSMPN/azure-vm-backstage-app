import {
  DeploymentProgressHelper,
  DeploymentStepType,
  DeploymentStepStatus,
  DEFAULT_DEPLOYMENT_STEPS,
} from './deployment';

describe('DeploymentProgressHelper', () => {
  describe('createInitialProgress', () => {
    it('creates initial progress with all steps pending', () => {
      const progress = DeploymentProgressHelper.createInitialProgress();
      
      expect(progress.currentStep).toBe(DeploymentStepType.DOWNLOADING_REPOSITORY);
      expect(progress.overallProgress).toBe(0);
      expect(progress.isComplete).toBe(false);
      expect(progress.hasError).toBe(false);
      expect(progress.steps).toHaveLength(DEFAULT_DEPLOYMENT_STEPS.length);
      
      progress.steps.forEach(step => {
        expect(step.status).toBe(DeploymentStepStatus.PENDING);
      });
    });
  });

  describe('updateStep', () => {
    it('updates step status correctly', () => {
      const initialProgress = DeploymentProgressHelper.createInitialProgress();
      
      const updatedProgress = DeploymentProgressHelper.updateStep(
        initialProgress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.IN_PROGRESS
      );
      
      const downloadStep = updatedProgress.steps.find(
        step => step.type === DeploymentStepType.DOWNLOADING_REPOSITORY
      );
      
      expect(downloadStep?.status).toBe(DeploymentStepStatus.IN_PROGRESS);
      expect(downloadStep?.startedAt).toBeDefined();
    });

    it('sets completion timestamp when step completes', () => {
      const initialProgress = DeploymentProgressHelper.createInitialProgress();
      
      const updatedProgress = DeploymentProgressHelper.updateStep(
        initialProgress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.COMPLETED
      );
      
      const downloadStep = updatedProgress.steps.find(
        step => step.type === DeploymentStepType.DOWNLOADING_REPOSITORY
      );
      
      expect(downloadStep?.status).toBe(DeploymentStepStatus.COMPLETED);
      expect(downloadStep?.completedAt).toBeDefined();
    });

    it('updates overall progress correctly', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      // Complete first step (20% progress)
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.COMPLETED
      );
      
      expect(progress.overallProgress).toBe(20);
      
      // Complete second step (40% progress)
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.EXTRACTING_FILES,
        DeploymentStepStatus.COMPLETED
      );
      
      expect(progress.overallProgress).toBe(40);
    });

    it('advances current step when step completes', () => {
      const initialProgress = DeploymentProgressHelper.createInitialProgress();
      
      const updatedProgress = DeploymentProgressHelper.updateStep(
        initialProgress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.COMPLETED
      );
      
      expect(updatedProgress.currentStep).toBe(DeploymentStepType.EXTRACTING_FILES);
    });

    it('marks deployment as complete when all steps are done', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      // Complete all steps
      for (const stepDef of DEFAULT_DEPLOYMENT_STEPS) {
        progress = DeploymentProgressHelper.updateStep(
          progress,
          stepDef.type,
          DeploymentStepStatus.COMPLETED
        );
      }
      
      expect(progress.isComplete).toBe(true);
      expect(progress.overallProgress).toBe(100);
      expect(progress.completedAt).toBeDefined();
    });

    it('marks deployment as failed when a step fails', () => {
      const initialProgress = DeploymentProgressHelper.createInitialProgress();
      
      const updatedProgress = DeploymentProgressHelper.updateStep(
        initialProgress,
        DeploymentStepType.BUILDING_IMAGE,
        DeploymentStepStatus.FAILED,
        { error: 'Build failed' }
      );
      
      expect(updatedProgress.hasError).toBe(true);
      expect(updatedProgress.isComplete).toBe(true);
      
      const buildStep = updatedProgress.steps.find(
        step => step.type === DeploymentStepType.BUILDING_IMAGE
      );
      expect(buildStep?.error).toBe('Build failed');
    });
  });

  describe('getCurrentStep', () => {
    it('returns the current active step', () => {
      const progress = DeploymentProgressHelper.createInitialProgress();
      const currentStep = DeploymentProgressHelper.getCurrentStep(progress);
      
      expect(currentStep?.type).toBe(DeploymentStepType.DOWNLOADING_REPOSITORY);
    });
  });

  describe('getCompletedSteps', () => {
    it('returns only completed steps', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.COMPLETED
      );
      
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.EXTRACTING_FILES,
        DeploymentStepStatus.COMPLETED
      );
      
      const completedSteps = DeploymentProgressHelper.getCompletedSteps(progress);
      expect(completedSteps).toHaveLength(2);
      expect(completedSteps[0].type).toBe(DeploymentStepType.DOWNLOADING_REPOSITORY);
      expect(completedSteps[1].type).toBe(DeploymentStepType.EXTRACTING_FILES);
    });
  });

  describe('getFailedSteps', () => {
    it('returns only failed steps', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.BUILDING_IMAGE,
        DeploymentStepStatus.FAILED,
        { error: 'Build failed' }
      );
      
      const failedSteps = DeploymentProgressHelper.getFailedSteps(progress);
      expect(failedSteps).toHaveLength(1);
      expect(failedSteps[0].type).toBe(DeploymentStepType.BUILDING_IMAGE);
    });
  });

  describe('isStepCompleted', () => {
    it('returns true for completed steps', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.DOWNLOADING_REPOSITORY,
        DeploymentStepStatus.COMPLETED
      );
      
      expect(
        DeploymentProgressHelper.isStepCompleted(progress, DeploymentStepType.DOWNLOADING_REPOSITORY)
      ).toBe(true);
      
      expect(
        DeploymentProgressHelper.isStepCompleted(progress, DeploymentStepType.EXTRACTING_FILES)
      ).toBe(false);
    });
  });

  describe('isStepFailed', () => {
    it('returns true for failed steps', () => {
      let progress = DeploymentProgressHelper.createInitialProgress();
      
      progress = DeploymentProgressHelper.updateStep(
        progress,
        DeploymentStepType.BUILDING_IMAGE,
        DeploymentStepStatus.FAILED
      );
      
      expect(
        DeploymentProgressHelper.isStepFailed(progress, DeploymentStepType.BUILDING_IMAGE)
      ).toBe(true);
      
      expect(
        DeploymentProgressHelper.isStepFailed(progress, DeploymentStepType.DOWNLOADING_REPOSITORY)
      ).toBe(false);
    });
  });
});
