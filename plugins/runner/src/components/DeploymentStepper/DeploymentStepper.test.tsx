import React from 'react';
import { render, screen } from '@testing-library/react';
import { DeploymentStepper } from './DeploymentStepper';
import { DeploymentProgress, DeploymentStepType, DeploymentStepStatus } from '../../types/deployment';

const mockDeploymentProgress: DeploymentProgress = {
  currentStep: DeploymentStepType.BUILDING_IMAGE,
  steps: [
    {
      type: DeploymentStepType.DOWNLOADING_REPOSITORY,
      status: DeploymentStepStatus.COMPLETED,
      title: 'Downloading Repository',
      description: 'Fetching source code from GitHub repository',
      startedAt: '2023-01-01T10:00:00Z',
      completedAt: '2023-01-01T10:01:00Z',
    },
    {
      type: DeploymentStepType.EXTRACTING_FILES,
      status: DeploymentStepStatus.COMPLETED,
      title: 'Extracting Files',
      description: 'Extracting repository archive to temporary directory',
      startedAt: '2023-01-01T10:01:00Z',
      completedAt: '2023-01-01T10:01:30Z',
    },
    {
      type: DeploymentStepType.BUILDING_IMAGE,
      status: DeploymentStepStatus.IN_PROGRESS,
      title: 'Building Docker Image',
      description: 'Building container image from Dockerfile',
      startedAt: '2023-01-01T10:01:30Z',
      progress: 45,
    },
    {
      type: DeploymentStepType.STARTING_CONTAINER,
      status: DeploymentStepStatus.PENDING,
      title: 'Starting Container',
      description: 'Creating and starting the Docker container',
    },
    {
      type: DeploymentStepType.MONITORING_CONTAINER,
      status: DeploymentStepStatus.PENDING,
      title: 'Monitoring Container',
      description: 'Setting up health checks and monitoring',
    },
  ],
  overallProgress: 40,
  isComplete: false,
  hasError: false,
  startedAt: '2023-01-01T10:00:00Z',
};

describe('DeploymentStepper', () => {
  it('renders deployment progress correctly', () => {
    render(<DeploymentStepper deploymentProgress={mockDeploymentProgress} />);
    
    expect(screen.getByText('Deployment Progress')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });

  it('shows all deployment steps', () => {
    render(<DeploymentStepper deploymentProgress={mockDeploymentProgress} />);
    
    expect(screen.getByText('Downloading Repository')).toBeInTheDocument();
    expect(screen.getByText('Extracting Files')).toBeInTheDocument();
    expect(screen.getByText('Building Docker Image')).toBeInTheDocument();
    expect(screen.getByText('Starting Container')).toBeInTheDocument();
    expect(screen.getByText('Monitoring Container')).toBeInTheDocument();
  });

  it('shows step statuses correctly', () => {
    render(<DeploymentStepper deploymentProgress={mockDeploymentProgress} />);
    
    expect(screen.getAllByText('COMPLETED')).toHaveLength(2);
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    expect(screen.getAllByText('PENDING')).toHaveLength(2);
  });

  it('renders compact view correctly', () => {
    render(<DeploymentStepper deploymentProgress={mockDeploymentProgress} compact />);
    
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Building Docker Image...')).toBeInTheDocument();
    
    // Should not show the full stepper in compact mode
    expect(screen.queryByText('Deployment Progress')).not.toBeInTheDocument();
  });

  it('shows error state correctly', () => {
    const errorProgress: DeploymentProgress = {
      ...mockDeploymentProgress,
      steps: [
        ...mockDeploymentProgress.steps.slice(0, 2),
        {
          ...mockDeploymentProgress.steps[2],
          status: DeploymentStepStatus.FAILED,
          error: 'Docker build failed: missing Dockerfile',
        },
        ...mockDeploymentProgress.steps.slice(3),
      ],
      hasError: true,
      isComplete: true,
      overallProgress: 40,
    };

    render(<DeploymentStepper deploymentProgress={errorProgress} />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('FAILED')).toBeInTheDocument();
  });

  it('shows completed state correctly', () => {
    const completedProgress: DeploymentProgress = {
      ...mockDeploymentProgress,
      steps: mockDeploymentProgress.steps.map(step => ({
        ...step,
        status: DeploymentStepStatus.COMPLETED,
        completedAt: '2023-01-01T10:05:00Z',
      })),
      isComplete: true,
      hasError: false,
      overallProgress: 100,
      completedAt: '2023-01-01T10:05:00Z',
    };

    render(<DeploymentStepper deploymentProgress={completedProgress} />);
    
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getAllByText('COMPLETED')).toHaveLength(5);
  });

  it('shows progress bar for in-progress steps', () => {
    render(<DeploymentStepper deploymentProgress={mockDeploymentProgress} />);

    // Should show progress bar for the building step
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
  });
});
