import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Switch,
} from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import GetApp from '@material-ui/icons/GetApp';
import { useRunner } from '../../hooks/useRunner';
import { RunnerInstance } from '../../api/RunnerApi';

interface RunnerLogsProps {
  instance: RunnerInstance;
}

export const RunnerLogs = ({ instance }: RunnerLogsProps) => {
  const { getLogs } = useRunner();
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tailLines, setTailLines] = useState(100);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedLogs = await getLogs(instance.id, { tail: tailLines });
      if (fetchedLogs) {
        setLogs(fetchedLogs);
      }
    } finally {
      setLoading(false);
    }
  }, [getLogs, instance.id, tailLines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh, fetchLogs]);

  const handleDownloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.componentRef}-${instance.id}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Typography variant="h6">
          Logs for {instance.componentRef}
        </Typography>
        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
          <TextField
            label="Tail Lines"
            type="number"
            value={tailLines}
            onChange={(e) => setTailLines(parseInt(e.target.value, 10) || 100)}
            size="small"
            style={{ width: 100 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                color="primary"
              />
            }
            label="Auto Refresh"
          />
          <Button
            startIcon={<Refresh />}
            onClick={fetchLogs}
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
          <Button
            startIcon={<GetApp />}
            onClick={handleDownloadLogs}
            size="small"
          >
            Download
          </Button>
        </Box>
      </Box>

      <Paper style={{ padding: 16, backgroundColor: '#1e1e1e', color: '#ffffff' }}>
        <pre
          style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '400px',
            overflow: 'auto',
          }}
        >
          {logs || 'No logs available'}
        </pre>
      </Paper>
    </Box>
  );
};
