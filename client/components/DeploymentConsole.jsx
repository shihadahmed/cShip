'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { XIcon, LoaderIcon, TerminalIcon, CheckCircleIcon, XCircleIcon, PauseIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { getApiBaseUrl } from '@/lib/api';

export function DeploymentConsole({ deploymentId, projectId, initialLogs = [], status = 'queued', onClose }) {
  const [logs, setLogs] = useState(initialLogs);
  const [connected, setConnected] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const eventSourceRef = useRef(null);
  const logContainerRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [deploymentId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const connect = () => {
    if (eventSourceRef.current) return;

    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/deployments/${projectId}/${deploymentId}/logs`;

    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
    };

    es.addEventListener('log', (event) => {
      try {
        const entry = JSON.parse(event.data);
        setLogs(prev => [...prev, entry]);
      } catch {
        setLogs(prev => [...prev, { level: 'info', message: event.data, timestamp: Date.now() }]);
      }
    });

    es.addEventListener('history-end', (event) => {
      console.log('History loaded:', event.data);
    });

    es.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        setCurrentStatus(data.status);
      } catch {
        setCurrentStatus('ready');
      }
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener('error', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs(prev => [...prev, { level: 'error', message: data.message, timestamp: Date.now() }]);
        setCurrentStatus('failed');
      } catch {
        // Ignore parse errors
      }
      setConnected(false);
      es.close();
      eventSourceRef.current = null;
      scheduleReconnect();
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setConnected(false);
        scheduleReconnect();
      }
    };
  };

  const scheduleReconnect = () => {
    if (reconnectAttempts.current >= 5) return;

    const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttempts.current++;
      connect();
    }, delay);
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setConnected(false);
  };

  const formatLog = (entry) => {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = entry.level === 'error' ? '✗' : entry.level === 'warn' ? '⚠' : '▸';
    return `[${time}] ${prefix} ${entry.message}`;
  };

  const getStatusBadge = () => {
    const variants = {
      queued: 'outline',
      building: 'info',
      ready: 'success',
      failed: 'danger',
      cancelled: 'outline',
    };
    return (
      <Badge variant={variants[currentStatus] || 'outline'} className="flex items-center gap-1">
        {currentStatus === 'building' && <LoaderIcon className="h-3 w-3 animate-spin" />}
        {currentStatus === 'ready' && <CheckCircleIcon className="h-3 w-3" />}
        {currentStatus === 'failed' && <XCircleIcon className="h-3 w-3" />}
        {currentStatus === 'queued' && <PauseIcon className="h-3 w-3" />}
        {currentStatus}
      </Badge>
    );
  };

  return (
    <Panel className="flex flex-col h-[500px]">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <TerminalIcon className="h-5 w-5 text-accent" />
          <div>
            <p className="font-medium">Deployment Console</p>
            <p className="text-xs text-muted">Deployment {deploymentId.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-success' : 'bg-muted')}></span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <div
          ref={logContainerRef}
          className="h-full overflow-y-auto font-mono text-xs bg-background/50 rounded p-3"
          style={{ fontFamily: 'Geist Mono, monospace' }}
        >
          {logs.length === 0 && (
            <div className="text-center text-muted py-8">
              <LoaderIcon className="mx-auto h-8 w-8 animate-spin mb-2 text-muted/50" />
              <p>Waiting for logs...</p>
            </div>
          )}
          {logs.map((entry, index) => (
            <div
              key={index}
              className={cn(
                'whitespace-pre-wrap break-all',
                entry.level === 'error' && 'text-danger',
                entry.level === 'warn' && 'text-warning',
                entry.level === 'info' && 'text-foreground'
              )}
            >
              {formatLog(entry)}
            </div>
          ))}
        </div>
      </div>

      {!connected && currentStatus !== 'ready' && currentStatus !== 'failed' && (
        <div className="border-t border-border/60 px-4 py-3 text-center text-sm text-muted">
          Reconnecting... (attempt {reconnectAttempts.current + 1}/5)
        </div>
      )}
    </Panel>
  );
}