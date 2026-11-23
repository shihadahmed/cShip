'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIcon,
  CpuIcon,
  DatabaseIcon,
  ServerIcon,
  TerminalIcon,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { fetchHealth, getApiBaseUrl } from '@/lib/api';
import { deriveSystemState } from '@/lib/system-state';

const INITIAL_STATE = {
  phase: 'checking',
  health: null,
  error: null,
  latencyMs: null,
  checkedAt: null,
};

const HEALTH_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 15000;

function StatusRow({ icon: Icon, label, value, detail, tone, pulse }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-raised/50 text-muted">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">{label}</p>
          <span className="flex items-center gap-2 text-xs font-medium text-muted">
            <StatusDot tone={tone} pulse={pulse} />
            {value}
          </span>
        </div>
        {detail ? (
          <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}

function badgeVariantFor(tone) {
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'danger') return 'danger';
  return 'outline';
}

export function SystemStatus() {
  const [state, setState] = useState(INITIAL_STATE);
  const mountedRef = useRef(false);
  const controllerRef = useRef(null);

  const check = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, HEALTH_TIMEOUT_MS);
    const started = performance.now();

    try {
      const health = await fetchHealth({ signal: controller.signal });

      if (!mountedRef.current || controller.signal.aborted) return;

      setState({
        phase: 'ready',
        health,
        error: null,
        latencyMs: Math.round(performance.now() - started),
        checkedAt: new Date(),
      });
    } catch (error) {
      if (!mountedRef.current) return;
      if (controller.signal.aborted && !timedOut) return;

      setState({
        phase: 'offline',
        health: null,
        error: timedOut
          ? 'Health check timed out'
          : error.message || 'Health check failed',
        latencyMs: null,
        checkedAt: new Date(),
      });
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let pollTimer = null;
    let active = true;

    const run = async () => {
      await check();
      if (active) {
        pollTimer = setTimeout(run, POLL_INTERVAL_MS);
      }
    };

    run();

    return () => {
      active = false;
      mountedRef.current = false;
      clearTimeout(pollTimer);
      controllerRef.current?.abort();
    };
  }, [check]);

  const { phase, health, error, latencyMs, checkedAt } = state;
  const {
    ready,
    degraded,
    systemLabel,
    systemTone,
    apiValue,
    apiTone,
    databaseLabel,
    databaseTone,
    heapLabel,
  } = deriveSystemState({ phase, health, latencyMs, error });

  const apiDetail = ready
    ? `${latencyMs} ms · ${getApiBaseUrl()}`
    : phase === 'offline'
      ? error || 'API unreachable'
      : 'Waiting for the first health check';

  const databaseDetail = ready
    ? health.database?.configured
      ? `Atlas · ${health.database.status}`
      : 'Add MONGODB_URI to enable persistence'
    : 'Waiting for API health';

  return (
    <Panel>
      <PanelHeader
        title="System"
        description="Live engine telemetry"
        action={
          <span role="status" aria-live="polite">
            <Badge variant={badgeVariantFor(systemTone)}>
              <StatusDot
                tone={systemTone}
                pulse={ready && !degraded}
              />
              {systemLabel}
            </Badge>
          </span>
        }
      />
      <PanelBody className="divide-y divide-border/60 py-4">
        <StatusRow
          icon={ActivityIcon}
          label="API"
          value={apiValue}
          detail={apiDetail}
          tone={apiTone}
          pulse={ready && !degraded}
        />
        <StatusRow
          icon={DatabaseIcon}
          label="MongoDB"
          value={databaseLabel}
          detail={databaseDetail}
          tone={databaseTone}
        />
        <StatusRow
          icon={TerminalIcon}
          label="Build queue"
          value="Phase 3"
          detail="Sequential worker not built yet"
          tone="muted"
        />
        <StatusRow
          icon={CpuIcon}
          label="Heap cap"
          value={heapLabel}
          detail={
            ready
              ? 'Applied to every build child process'
              : 'Available when the API responds'
          }
          tone={ready ? 'accent' : 'muted'}
        />
        <StatusRow
          icon={ServerIcon}
          label="SSE"
          value="Phase 3"
          detail="Log stream not built yet"
          tone="muted"
        />
        <div className="flex items-center justify-between pt-3 text-[11px] text-muted">
          <span>
            {checkedAt
              ? `${phase === 'offline' ? 'Last attempt' : 'Checked'} ${checkedAt.toLocaleTimeString(
                  [],
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  },
                )}`
              : 'Awaiting first check'}
          </span>
          <button
            type="button"
            onClick={check}
            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-raised/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            Check now
          </button>
        </div>
      </PanelBody>
    </Panel>
  );
}
