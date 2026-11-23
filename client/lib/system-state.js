export function deriveSystemState({ phase, health, latencyMs, error }) {
  const ready = phase === 'ready' && Boolean(health);
  const degraded = ready && health.status === 'degraded';

  const apiValue = !ready
    ? phase === 'offline'
      ? 'Offline'
      : 'Checking'
    : 'Online';
  const apiTone = !ready
    ? phase === 'offline'
      ? 'danger'
      : 'muted'
    : degraded
      ? 'warning'
      : 'success';

  const systemLabel = !ready
    ? phase === 'offline'
      ? 'Offline'
      : 'Checking'
    : degraded
      ? 'Degraded'
      : 'Live';
  const systemTone = !ready
    ? phase === 'offline'
      ? 'danger'
      : 'muted'
    : degraded
      ? 'warning'
      : 'success';

  const database = ready ? health.database : null;
  const databaseLabel = !ready
    ? 'Unknown'
    : !database?.configured
      ? 'Not configured'
      : database.status === 'connected'
        ? 'Connected'
        : database.status === 'connecting'
          ? 'Connecting'
          : 'Disconnected';
  const databaseTone = !ready
    ? 'muted'
    : !database?.configured
      ? 'muted'
      : database.status === 'connected'
        ? 'success'
        : database.status === 'connecting'
          ? 'warning'
          : 'danger';

  const heapLabel =
    ready && Number.isFinite(health.build?.memoryLimitMb)
      ? `${health.build.memoryLimitMb} MB`
      : 'Unknown';

  return {
    ready,
    degraded,
    apiValue,
    apiTone,
    systemLabel,
    systemTone,
    databaseLabel,
    databaseTone,
    heapLabel,
    latencyMs: ready ? latencyMs : null,
    error,
  };
}
