import { Button, Chip, Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@material-ui/core';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import { Entity } from '@backstage/catalog-model';
import { useRunner } from '../../hooks/useRunner';
import { RunnerInstance } from '../../api/RunnerApi';
import { DeploymentStepper } from '../DeploymentStepper';
import { useDeploymentProgress } from '../../hooks/useDeploymentProgress';
import React, { useState } from 'react';

interface RunnerControlsProps {
  entity: Entity;
  instance?: RunnerInstance;
  onInstanceChange?: (instance: RunnerInstance | null) => void;
}

export const RunnerControls = ({ entity, instance, onInstanceChange }: RunnerControlsProps) => {
  const { startComponent, stopComponent, loading } = useRunner();
  const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;
  const [showDeploymentDialog, setShowDeploymentDialog] = useState(false);

  // Track deployment progress for starting instances
  const { deploymentProgress } = useDeploymentProgress({
    instanceId: instance?.id,
    enabled: instance?.status === 'starting',
  });

  const handleStart = async () => {
    const newInstance = await startComponent(entityRef);
    if (newInstance && onInstanceChange) {
      onInstanceChange(newInstance);
      // Show deployment dialog for starting instances
      if (newInstance.status === 'starting') {
        setShowDeploymentDialog(true);
      }
    }
  };

  const handleStop = async () => {
    if (instance) {
      const success = await stopComponent(instance.id);
      if (success && onInstanceChange) {
        onInstanceChange(null);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'primary';
      case 'starting': return 'default';
      case 'stopping': return 'default';
      case 'stopped': return 'default';
      case 'error': return 'secondary';
      default: return 'default';
    }
  };

  const isRunning = instance?.status === 'running';
  const isStarting = instance?.status === 'starting';
  const isStopping = instance?.status === 'stopping';

  // Auto-close deployment dialog when deployment completes
  React.useEffect(() => {
    if (deploymentProgress?.isComplete || instance?.status !== 'starting') {
      const timer = setTimeout(() => {
        setShowDeploymentDialog(false);
      }, 2000); // Keep dialog open for 2 seconds after completion
      return () => clearTimeout(timer);
    }
  }, [deploymentProgress?.isComplete, instance?.status]);

  return (
    <Box display="flex" alignItems="center" style={{ gap: 16 }}>
      <Box>
        {!instance || instance.status === 'stopped' ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrow />}
            onClick={handleStart}
            disabled={loading || isStarting}
          >
            {isStarting ? (
              deploymentProgress ? (
                <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                  <span>Deploying...</span>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setShowDeploymentDialog(true)}
                    style={{ marginLeft: 8 }}
                  >
                    View Progress
                  </Button>
                </Box>
              ) : (
                'Starting...'
              )
            ) : (
              'Start'
            )}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Stop />}
            onClick={handleStop}
            disabled={loading || isStopping}
          >
            {isStopping ? 'Stopping...' : 'Stop'}
          </Button>
        )}
      </Box>

      {instance && (
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <Chip
            label={instance.status.toUpperCase()}
            color={getStatusColor(instance.status)}
            size="small"
          />

          {/* Show compact deployment progress for starting instances */}
          {isStarting && deploymentProgress && (
            <Box style={{ minWidth: 200 }}>
              <DeploymentStepper deploymentProgress={deploymentProgress} compact />
            </Box>
          )}

          {isRunning && instance.ports.length > 0 && (
            <Box>
              <Typography variant="body2" color="textSecondary">
                Running on:
              </Typography>
              {instance.ports.map(port => (
                <Button
                  key={port}
                  size="small"
                  href={`http://localhost:${port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  localhost:{port}
                </Button>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Deployment Progress Dialog */}
      <Dialog
        open={showDeploymentDialog}
        onClose={() => setShowDeploymentDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Deployment Progress - {entity.metadata.name}
        </DialogTitle>
        <DialogContent>
          {deploymentProgress ? (
            <DeploymentStepper deploymentProgress={deploymentProgress} />
          ) : (
            <Typography>Loading deployment progress...</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeploymentDialog(false)} color="primary">
            {deploymentProgress?.isComplete ? 'Close' : 'Hide'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
