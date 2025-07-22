import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import { runnerApiRef, RunnerInstance } from '../api/RunnerApi';
import { useState, useCallback } from 'react';

export const useRunner = () => {
  const runnerApi = useApi(runnerApiRef);
  const errorApi = useApi(errorApiRef);
  const [loading, setLoading] = useState(false);

  const startComponent = useCallback(async (entityRef: string): Promise<RunnerInstance | null> => {
    setLoading(true);
    try {
      const instance = await runnerApi.startComponent(entityRef);
      return instance;
    } catch (error) {
      errorApi.post(error as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  const stopComponent = useCallback(async (instanceId: string): Promise<boolean> => {
    setLoading(true);
    try {
      await runnerApi.stopComponent(instanceId);
      return true;
    } catch (error) {
      errorApi.post(error as Error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  const getStatus = useCallback(async (instanceId: string): Promise<RunnerInstance | null> => {
    try {
      const instance = await runnerApi.getStatus(instanceId);
      return instance;
    } catch (error) {
      errorApi.post(error as Error);
      return null;
    }
  }, [runnerApi, errorApi]);

  const getLogs = useCallback(async (instanceId: string, options?: { follow?: boolean; tail?: number }): Promise<string | null> => {
    try {
      const logs = await runnerApi.getLogs(instanceId, options);
      return logs;
    } catch (error) {
      errorApi.post(error as Error);
      return null;
    }
  }, [runnerApi, errorApi]);

  return {
    startComponent,
    stopComponent,
    getStatus,
    getLogs,
    loading,
  };
};
