import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import { runnerApiRef, RunnerInstance } from '../api/RunnerApi';
import { useState, useEffect, useCallback } from 'react';

export const useRunnerInstances = (refreshInterval = 5000) => {
  const runnerApi = useApi(runnerApiRef);
  const errorApi = useApi(errorApiRef);
  const [instances, setInstances] = useState<RunnerInstance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInstances = useCallback(async () => {
    try {
      const fetchedInstances = await runnerApi.listInstances();
      setInstances(fetchedInstances);
    } catch (error) {
      errorApi.post(error as Error);
    } finally {
      setLoading(false);
    }
  }, [runnerApi, errorApi]);

  useEffect(() => {
    fetchInstances();

    const interval = setInterval(fetchInstances, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchInstances, refreshInterval]);

  return {
    instances,
    loading,
    refresh: fetchInstances,
  };
};
