import { renderHook, act } from '@testing-library/react';
import { TestApiProvider } from '@backstage/test-utils';
import { runnerApiRef } from '../api/RunnerApi';
import { errorApiRef } from '@backstage/core-plugin-api';
import { useRunner } from './useRunner';
import { createElement, type ReactNode } from 'react';

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

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(TestApiProvider, {
    apis: [
      [runnerApiRef, mockRunnerApi],
      [errorApiRef, mockErrorApi],
    ],
    children
  });

describe('useRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start component successfully', async () => {
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'starting' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    mockRunnerApi.startComponent.mockResolvedValue(mockInstance);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let returnedInstance;
    await act(async () => {
      returnedInstance = await result.current.startComponent('Component:default/test-component');
    });

    expect(mockRunnerApi.startComponent).toHaveBeenCalledWith('Component:default/test-component');
    expect(returnedInstance).toEqual(mockInstance);
    expect(result.current.loading).toBe(false);
  });

  it('should handle start component error', async () => {
    const error = new Error('Failed to start component');
    mockRunnerApi.startComponent.mockRejectedValue(error);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let returnedInstance;
    await act(async () => {
      returnedInstance = await result.current.startComponent('Component:default/test-component');
    });

    expect(mockErrorApi.post).toHaveBeenCalledWith(error);
    expect(returnedInstance).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should stop component successfully', async () => {
    mockRunnerApi.stopComponent.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let success;
    await act(async () => {
      success = await result.current.stopComponent('test-id');
    });

    expect(mockRunnerApi.stopComponent).toHaveBeenCalledWith('test-id');
    expect(success).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('should handle stop component error', async () => {
    const error = new Error('Failed to stop component');
    mockRunnerApi.stopComponent.mockRejectedValue(error);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let success;
    await act(async () => {
      success = await result.current.stopComponent('test-id');
    });

    expect(mockErrorApi.post).toHaveBeenCalledWith(error);
    expect(success).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('should get status successfully', async () => {
    const mockInstance = {
      id: 'test-id',
      componentRef: 'Component:default/test-component',
      status: 'running' as const,
      ports: [3000],
      startedAt: '2023-01-01T00:00:00Z',
    };

    mockRunnerApi.getStatus.mockResolvedValue(mockInstance);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let returnedInstance;
    await act(async () => {
      returnedInstance = await result.current.getStatus('test-id');
    });

    expect(mockRunnerApi.getStatus).toHaveBeenCalledWith('test-id');
    expect(returnedInstance).toEqual(mockInstance);
  });

  it('should get logs successfully', async () => {
    const mockLogs = 'Test log output';
    mockRunnerApi.getLogs.mockResolvedValue(mockLogs);

    const { result } = renderHook(() => useRunner(), { wrapper });

    let returnedLogs;
    await act(async () => {
      returnedLogs = await result.current.getLogs('test-id', { tail: 100 });
    });

    expect(mockRunnerApi.getLogs).toHaveBeenCalledWith('test-id', { tail: 100 });
    expect(returnedLogs).toEqual(mockLogs);
  });
});
