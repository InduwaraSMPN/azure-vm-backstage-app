import { Button, Chip, Box, Typography } from '@material-ui/core';
import PlayArrow from '@material-ui/icons/PlayArrow';
import Stop from '@material-ui/icons/Stop';
import { Entity } from '@backstage/catalog-model';
import { useRunner } from '../../hooks/useRunner';
import { RunnerInstance } from '../../api/RunnerApi';

interface RunnerControlsProps {
  entity: Entity;
  instance?: RunnerInstance;
  onInstanceChange?: (instance: RunnerInstance | null) => void;
}

export const RunnerControls = ({ entity, instance, onInstanceChange }: RunnerControlsProps) => {
  const { startComponent, stopComponent, loading } = useRunner();
  const entityRef = `${entity.kind}:${entity.metadata.namespace || 'default'}/${entity.metadata.name}`;

  const handleStart = async () => {
    const newInstance = await startComponent(entityRef);
    if (newInstance && onInstanceChange) {
      onInstanceChange(newInstance);
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
            {isStarting ? 'Starting...' : 'Start'}
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
    </Box>
  );
};
