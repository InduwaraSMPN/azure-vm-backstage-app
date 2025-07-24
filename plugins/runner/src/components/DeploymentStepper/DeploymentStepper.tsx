import React from 'react';
import {
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Typography,
  Box,
  CircularProgress,
  LinearProgress,
  Chip,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import {
  CloudDownload,
  Archive,
  Build,
  PlayArrow,
  Visibility,
  CheckCircle,
  Error as ErrorIcon,
  Schedule,
} from '@material-ui/icons';
import { DeploymentProgress, DeploymentStepType, DeploymentStepStatus } from '../../types/deployment';

const useStyles = makeStyles((theme) => ({
  root: {
    width: '100%',
    maxWidth: 600,
  },
  stepContent: {
    paddingLeft: theme.spacing(4),
    paddingBottom: theme.spacing(2),
  },
  stepDescription: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  progressBar: {
    flexGrow: 1,
  },
  timestamp: {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  errorMessage: {
    color: theme.palette.error.main,
    marginTop: theme.spacing(1),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.error.light + '20',
    borderRadius: theme.shape.borderRadius,
    fontSize: '0.875rem',
  },
  overallProgress: {
    marginBottom: theme.spacing(2),
  },
  statusChip: {
    marginLeft: theme.spacing(1),
  },
}));

interface DeploymentStepperProps {
  deploymentProgress: DeploymentProgress;
  compact?: boolean;
}

const STEP_ICONS: Record<DeploymentStepType, React.ComponentType> = {
  [DeploymentStepType.DOWNLOADING_REPOSITORY]: CloudDownload,
  [DeploymentStepType.EXTRACTING_FILES]: Archive,
  [DeploymentStepType.BUILDING_IMAGE]: Build,
  [DeploymentStepType.STARTING_CONTAINER]: PlayArrow,
  [DeploymentStepType.MONITORING_CONTAINER]: Visibility,
};

const getStepIcon = (stepType: DeploymentStepType, status: DeploymentStepStatus) => {
  const IconComponent = STEP_ICONS[stepType];
  
  switch (status) {
    case DeploymentStepStatus.COMPLETED:
      return <CheckCircle style={{ color: '#4caf50' }} />;
    case DeploymentStepStatus.FAILED:
      return <ErrorIcon style={{ color: '#f44336' }} />;
    case DeploymentStepStatus.IN_PROGRESS:
      return <CircularProgress size={20} />;
    case DeploymentStepStatus.PENDING:
    default:
      return <Schedule style={{ color: '#9e9e9e' }} />;
  }
};

const getStatusColor = (status: DeploymentStepStatus): 'primary' | 'secondary' | 'default' => {
  switch (status) {
    case DeploymentStepStatus.COMPLETED:
      return 'primary';
    case DeploymentStepStatus.FAILED:
      return 'secondary';
    case DeploymentStepStatus.IN_PROGRESS:
      return 'primary';
    case DeploymentStepStatus.PENDING:
    default:
      return 'default';
  }
};

const formatTimestamp = (timestamp?: string): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

const calculateDuration = (startedAt?: string, completedAt?: string): string => {
  if (!startedAt) return '';
  
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();
  const durationSeconds = Math.round(durationMs / 1000);
  
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  } else {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }
};

export const DeploymentStepper: React.FC<DeploymentStepperProps> = ({
  deploymentProgress,
  compact = false,
}) => {
  const classes = useStyles();
  const { steps, overallProgress, isComplete, hasError } = deploymentProgress;

  // Find the active step index for the stepper
  const activeStepIndex = steps.findIndex(step => 
    step.status === DeploymentStepStatus.IN_PROGRESS ||
    (step.status === DeploymentStepStatus.PENDING && 
     !steps.slice(0, steps.indexOf(step)).some(s => s.status === DeploymentStepStatus.PENDING))
  );

  const finalActiveStep = activeStepIndex >= 0 ? activeStepIndex : steps.length;

  if (compact) {
    // Compact view for inline display
    return (
      <Box>
        <Box className={classes.progressContainer}>
          <LinearProgress 
            variant="determinate" 
            value={overallProgress} 
            className={classes.progressBar}
            color={hasError ? 'secondary' : 'primary'}
          />
          <Typography variant="body2" color="textSecondary">
            {overallProgress}%
          </Typography>
        </Box>
        <Typography variant="body2" color="textSecondary">
          {isComplete 
            ? hasError 
              ? 'Deployment failed'
              : 'Deployment completed'
            : `${steps.find(s => s.status === DeploymentStepStatus.IN_PROGRESS)?.title || 'Preparing deployment'}...`
          }
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={classes.root}>
      {/* Overall Progress */}
      <Box className={classes.overallProgress}>
        <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom={1}>
          <Typography variant="h6">
            Deployment Progress
          </Typography>
          <Chip
            label={isComplete ? (hasError ? 'Failed' : 'Completed') : 'In Progress'}
            color={isComplete ? (hasError ? 'secondary' : 'primary') : 'default'}
            size="small"
            className={classes.statusChip}
          />
        </Box>
        <Box className={classes.progressContainer}>
          <LinearProgress 
            variant="determinate" 
            value={overallProgress} 
            className={classes.progressBar}
            color={hasError ? 'secondary' : 'primary'}
          />
          <Typography variant="body2" color="textSecondary">
            {overallProgress}%
          </Typography>
        </Box>
      </Box>

      {/* Step-by-step Progress */}
      <Stepper activeStep={finalActiveStep} orientation="vertical">
        {steps.map((step, index) => (
          <Step key={step.type}>
            <StepLabel
              icon={getStepIcon(step.type, step.status)}
              error={step.status === DeploymentStepStatus.FAILED}
            >
              <Box display="flex" alignItems="center">
                <Typography variant="subtitle2">
                  {step.title}
                </Typography>
                <Chip
                  label={step.status.replace('_', ' ').toUpperCase()}
                  color={getStatusColor(step.status)}
                  size="small"
                  variant="outlined"
                  className={classes.statusChip}
                />
              </Box>
            </StepLabel>
            <StepContent>
              <Box className={classes.stepContent}>
                {step.description && (
                  <Typography variant="body2" className={classes.stepDescription}>
                    {step.description}
                  </Typography>
                )}
                
                {/* Progress bar for steps that support it */}
                {step.progress !== undefined && step.status === DeploymentStepStatus.IN_PROGRESS && (
                  <Box className={classes.progressContainer}>
                    <LinearProgress 
                      variant="determinate" 
                      value={step.progress} 
                      className={classes.progressBar}
                    />
                    <Typography variant="body2" color="textSecondary">
                      {step.progress}%
                    </Typography>
                  </Box>
                )}

                {/* Timestamps and duration */}
                {step.startedAt && (
                  <Typography variant="caption" className={classes.timestamp}>
                    Started: {formatTimestamp(step.startedAt)}
                    {step.completedAt && (
                      <> • Completed: {formatTimestamp(step.completedAt)} • Duration: {calculateDuration(step.startedAt, step.completedAt)}</>
                    )}
                    {step.status === DeploymentStepStatus.IN_PROGRESS && (
                      <> • Running for: {calculateDuration(step.startedAt)}</>
                    )}
                  </Typography>
                )}

                {/* Error message */}
                {step.error && (
                  <Typography variant="body2" className={classes.errorMessage}>
                    <strong>Error:</strong> {step.error}
                  </Typography>
                )}
              </Box>
            </StepContent>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};
