import { EventEmitter } from 'node:events';

export class SSEHub extends EventEmitter {
  constructor(options = {}) {
    super();
    this.heartbeatInterval = options.heartbeatInterval || 15000;
    this.maxLogHistory = options.maxLogHistory || 1000;
    this.clients = new Map();
    this.logHistory = new Map();
    this.heartbeatTimer = null;
  }

  startHeartbeat() {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, this.heartbeatInterval);

    this.heartbeatTimer.unref?.();
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  broadcastHeartbeat() {
    const comment = `: heartbeat ${Date.now()}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.write(comment);
      } catch {
        // Client disconnected, will be cleaned up on next write
      }
    });
  }

  addClient(jobId, response) {
    if (!this.clients.has(jobId)) {
      this.clients.set(jobId, new Set());
    }
    this.clients.get(jobId).add(response);

    this.sendLogHistory(jobId, response);
  }

  removeClient(jobId, response) {
    const clients = this.clients.get(jobId);
    if (clients) {
      clients.delete(response);
      if (clients.size === 0) {
        this.clients.delete(jobId);
      }
    }
  }

  sendLogHistory(jobId, response) {
    const history = this.logHistory.get(jobId) || [];
    const recent = history.slice(-50);

    for (const entry of recent) {
      this.sendEvent(response, 'log', entry);
    }

    this.sendEvent(response, 'history-end', { count: recent.length });
  }

  sendEvent(response, event, data, id) {
    let message = '';
    if (id) message += `id: ${id}\n`;
    message += `event: ${event}\n`;
    message += `data: ${JSON.stringify(data)}\n\n`;

    try {
      response.write(message);
      return true;
    } catch {
      return false;
    }
  }

  broadcast(jobId, event, data, id) {
    const clients = this.clients.get(jobId);
    if (!clients) return 0;

    let sent = 0;
    for (const client of clients) {
      if (this.sendEvent(client, event, data, id)) {
        sent++;
      } else {
        this.removeClient(jobId, client);
      }
    }
    return sent;
  }

  addLog(jobId, logEntry) {
    if (!this.logHistory.has(jobId)) {
      this.logHistory.set(jobId, []);
    }

    const history = this.logHistory.get(jobId);
    history.push({
      ...logEntry,
      timestamp: logEntry.timestamp || Date.now(),
    });

    if (history.length > this.maxLogHistory) {
      history.splice(0, history.length - this.maxLogHistory);
    }

    this.broadcast(jobId, 'log', logEntry, String(logEntry.timestamp));
  }

  addLogs(jobId, logEntries) {
    for (const entry of logEntries) {
      this.addLog(jobId, entry);
    }
  }

  complete(jobId, data) {
    this.broadcast(jobId, 'complete', data);
    this.cleanup(jobId);
  }

  error(jobId, error) {
    this.broadcast(jobId, 'error', {
      message: error.message,
      code: error.code,
    });
    this.cleanup(jobId);
  }

  cleanup(jobId) {
    const clients = this.clients.get(jobId);
    if (clients) {
      for (const client of clients) {
        try {
          client.end();
        } catch {
          // Ignore
        }
      }
      this.clients.delete(jobId);
    }

    if (this.logHistory.has(jobId)) {
      const history = this.logHistory.get(jobId);
      history.splice(50);
    }
  }

  getConnectedCount(jobId) {
    const clients = this.clients.get(jobId);
    return clients ? clients.size : 0;
  }

  getTotalConnections() {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  getActiveJobs() {
    return Array.from(this.clients.keys());
  }

  getLogHistory(jobId) {
    return this.logHistory.get(jobId) || [];
  }
}

export function createSSEHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  };
}

export function createSSEResponse(response, headers = {}) {
  response.writeHead(200, { ...createSSEHeaders(), ...headers });
  response.write('\n');
  response.flushHeaders?.();
  return response;
}