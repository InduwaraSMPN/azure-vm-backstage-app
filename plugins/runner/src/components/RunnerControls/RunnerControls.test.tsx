
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { runnerApiRef } from '../../api/RunnerApi';
import { errorApiRef } from '@backstage/core-plugin-api';
import { RunnerControls } from './RunnerControls';
import { Entity } from '@backstage/catalog-model';

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-component',
    namespace: 'default',
  },
};

const mockRunnerApi = {
  startComponent: jest.fn(),
  stopComponent: jest.fn(),
  getStatus: jest.fn(),
  listInstances: jest.fn(),
  getLogs: jest.fn(),
};

const mockErrorApi = {
  post: jest.fn(),
  error$: jest.fn(),
};

const renderWithApis = (component: React.ReactElement) => {
  return render(
    <TestApiProvider
      apis={[
        [runnerApiRef, mockRunnerApi],
        [errorApiRef, mockErrorApi],
      ]}
    >
      {component}
    </TestApiProvider>
  );
};

describe('RunnerControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders start button when no instance is provided', () => {
    renderWithApis(<RunnerControls entity={mockEntity} />);
    
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('renders stop button when instance is running', () => {
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'running' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    renderWithApis(<RunnerControls entity={mockEntity} instance={mockInstance} />);
    
    expect(screen.getByText('Stop')).toBeInTheDocument();
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
  });

  it('shows status chip when instance is provided', () => {
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'running' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    renderWithApis(<RunnerControls entity={mockEntity} instance={mockInstance} />);
    
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('shows port links when instance is running', () => {
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'running' as const,
      ports: [3000, 8080],
      startedAt: '2023-01-01T00:00:00Z',
    };

    renderWithApis(<RunnerControls entity={mockEntity} instance={mockInstance} />);
    
    expect(screen.getByText('localhost:3000')).toBeInTheDocument();
    expect(screen.getByText('localhost:8080')).toBeInTheDocument();
  });

  it('calls startComponent when start button is clicked', async () => {
    const mockOnInstanceChange = jest.fn();
    const mockNewInstance = {
      id: 'new-id',
      componentRef: 'Component:default/test-component',
      status: 'starting' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    mockRunnerApi.startComponent.mockResolvedValue(mockNewInstance);

    renderWithApis(
      <RunnerControls 
        entity={mockEntity} 
        onInstanceChange={mockOnInstanceChange}
      />
    );
    
    fireEvent.click(screen.getByText('Start'));

    await waitFor(() => {
      expect(mockRunnerApi.startComponent).toHaveBeenCalledWith('Component:default/test-component');
      expect(mockOnInstanceChange).toHaveBeenCalledWith(mockNewInstance);
    });
  });

  it('calls stopComponent when stop button is clicked', async () => {
    const mockOnInstanceChange = jest.fn();
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'running' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    mockRunnerApi.stopComponent.mockResolvedValue(undefined);

    renderWithApis(
      <RunnerControls 
        entity={mockEntity} 
        instance={mockInstance}
        onInstanceChange={mockOnInstanceChange}
      />
    );
    
    fireEvent.click(screen.getByText('Stop'));

    await waitFor(() => {
      expect(mockRunnerApi.stopComponent).toHaveBeenCalledWith('test-id');
      expect(mockOnInstanceChange).toHaveBeenCalledWith(null);
    });
  });
});
