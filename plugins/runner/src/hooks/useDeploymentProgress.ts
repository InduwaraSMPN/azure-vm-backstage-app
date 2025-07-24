import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi, errorApiRef } from '@backstage/core-plugin-api';
import { runnerApiRef, RunnerInstance } from '../api/RunnerApi';
import { DeploymentProgress } from '../types/deployment';

interface UseDeploymentProgressOptions {
  instanceId?: string;
  pollInterval?: number; // milliseconds
  enabled?: boolean;
}

interface UseDeploymentProgressResult {
  deploymentProgress: DeploymentProgress | null;
  isPolling: boolean;
  error: Error | null;
  startPolling: () => void;
  stopPolling: () => void;
  refreshProgress: () => Promise<void>;
}

export const useDeploymentProgress = (
  options: UseDeploymentProgressOptions = {}
): UseDeploymentProgressResult => {
  const {
    instanceId,
    pollInterval = 2000, // Poll every 2 seconds by default
    enabled = true,
  } = options;

  const runnerApi = useApi(runnerApiRef);
  const errorApi = useApi(errorApiRef);

  const [deploymentProgress, setDeploymentProgress] = useState<DeploymentProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const fetchProgress = useCallback(async (): Promise<void> => {
    if (!instanceId || !isMountedRef.current) {
      return;
    }

    try {
      const instance: RunnerInstance = await runnerApi.getStatus(instanceId);
      
      if (isMountedRef.current) {
        setDeploymentProgress(instance.deploymentProgress || null);
        setError(null);
      }
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      
      if (isMountedRef.current) {
        setError(errorObj);
        errorApi.post(errorObj);
      }
    }
  }, [instanceId, runnerApi, errorApi]);

  const startPolling = useCallback(() => {
    if (!instanceId || !enabled || isPolling) {
      return;
    }

    setIsPolling(true);
    
    // Fetch immediately
    fetchProgress();

    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      fetchProgress();
    }, pollInterval);
  }, [instanceId, enabled, isPolling, fetchProgress, pollInterval]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const refreshProgress = useCallback(async (): Promise<void> => {
    await fetchProgress();
  }, [fetchProgress]);

  // Auto-start polling when instanceId is provided and enabled
  useEffect(() => {
    if (instanceId && enabled && !isPolling) {
      startPolling();
    } else if ((!instanceId || !enabled) && isPolling) {
      stopPolling();
    }
  }, [instanceId, enabled, isPolling, startPolling, stopPolling]);

  // Auto-stop polling when deployment is complete
  useEffect(() => {
    if (deploymentProgress?.isComplete && isPolling) {
      // Stop polling after a short delay to allow final status update
      const timeout = setTimeout(() => {
        if (isMountedRef.current) {
          stopPolling();
        }
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [deploymentProgress?.isComplete, isPolling, stopPolling]);

  // Stop polling when instance status changes to non-starting states
  useEffect(() => {
    if (!instanceId) return;

    const checkInstanceStatus = async () => {
      try {
        const instance = await runnerApi.getStatus(instanceId);
        
        // Stop polling if instance is no longer in starting state
        if (instance.status !== 'starting' && isPolling) {
          stopPolling();
        }
      } catch (err) {
        // Instance might not exist anymore, stop polling
        if (isPolling) {
          stopPolling();
        }
      }
    };

    if (isPolling) {
      const statusCheckInterval = setInterval(checkInstanceStatus, 5000);
      return () => clearInterval(statusCheckInterval);
    }
  }, [instanceId, isPolling, runnerApi, stopPolling]);

  return {
    deploymentProgress,
    isPolling,
    error,
    startPolling,
    stopPolling,
    refreshProgress,
  };
};
