export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(
    /\/$/,
    '',
  );
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const CSRF_META_NAME = 'csrf-token';
let csrfToken = '';
let csrfRequest = null;

function readCsrfTokenFromMeta() {
  if (typeof document === 'undefined') return '';
  return (
    document
      .querySelector(`meta[name="${CSRF_META_NAME}"]`)
      ?.getAttribute('content') || ''
  );
}

function writeCsrfTokenToMeta(token) {
  if (typeof document === 'undefined') return;
  let meta = document.querySelector(`meta[name="${CSRF_META_NAME}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = CSRF_META_NAME;
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', token);
}

export function getCsrfToken() {
  return csrfToken || readCsrfTokenFromMeta();
}

export function setCsrfToken(token) {
  csrfToken = token || '';
  if (token) writeCsrfTokenToMeta(token);
}

/**
 * Fetches a CSRF token once and caches it. Mutating requests automatically
 * obtain a token, so the client never sends a POST/PATCH/DELETE without one.
 */
export async function ensureCsrfToken({ force = false } = {}) {
  if (typeof window === 'undefined') return '';

  if (!force) {
    const existing = getCsrfToken();
    if (existing) return existing;
    if (csrfRequest) return csrfRequest;
  }

  csrfRequest = fetch(`${getApiBaseUrl()}/api/csrf-token`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new ApiError('Unable to initialize CSRF token', {
          status: response.status,
          code: 'CSRF_INIT_FAILED',
        });
      }
      const data = await response.json();
      setCsrfToken(data?.csrfToken || '');
      return getCsrfToken();
    })
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
}

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cship:unauthorized'));
  }
}

async function parseApiError(response) {
  const body = await response.json().catch(() => null);
  return new ApiError(
    body?.error?.message || `Request failed with status ${response.status}`,
    {
      status: response.status,
      code: body?.error?.code || 'REQUEST_FAILED',
    },
  );
}

async function sendRequest(url, { method, body, headers, ...rest }) {
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  return fetch(`${getApiBaseUrl()}${url}`, {
    ...rest,
    method,
    body,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(mutating ? { 'X-CSRF-Token': getCsrfToken() } : {}),
      ...headers,
    },
  });
}

export async function fetchJson(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  if (mutating) await ensureCsrfToken();

  let response = await sendRequest(url, { ...options, method });

  if (mutating && response.status === 403) {
    const error = await parseApiError(response);
    if (error.code !== 'CSRF_ERROR') throw error;
    // Token rotated or expired: fetch a fresh one and retry once.
    await ensureCsrfToken({ force: true });
    response = await sendRequest(url, { ...options, method });
  }

  if (!response.ok) {
    const error = await parseApiError(response);
    if (error.status === 401) notifyUnauthorized();
    throw error;
  }

  if (response.status === 204) return null;

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function fetchHealth({ signal } = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/health`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchMe() {
  try {
    return await fetchJson('/api/auth/me');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function login() {
  window.location.href = `${getApiBaseUrl()}/api/auth/github`;
}

export async function logout() {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login';
  }
}

export async function fetchGitHubRepos() {
  return fetchJson('/api/github/repos');
}

export async function fetchBranches(owner, repo) {
  return fetchJson(`/api/github/repos/${owner}/${repo}/branches`);
}

export async function fetchLatestCommit(owner, repo, branch) {
  return fetchJson(`/api/github/repos/${owner}/${repo}/commits/${branch}`);
}

export async function fetchProjects() {
  return fetchJson('/api/projects');
}

export async function createProject(data) {
  return fetchJson('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchProject(id) {
  return fetchJson(`/api/projects/${id}`);
}

export async function updateProject(id, data) {
  return fetchJson(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id) {
  return fetchJson(`/api/projects/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchDeployments(projectId, options = {}) {
  const { status, limit = 50, skip = 0 } = options;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  params.set('skip', String(skip));
  return fetchJson(`/api/deployments/${projectId}?${params}`);
}

export async function fetchDeployment(projectId, deploymentId) {
  return fetchJson(`/api/deployments/${projectId}/${deploymentId}`);
}

export async function triggerDeployment(projectId, data) {
  return fetchJson(`/api/deployments/${projectId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function redeploy(projectId, deploymentId) {
  return fetchJson(`/api/deployments/${projectId}/redeploy`, {
    method: 'POST',
    body: JSON.stringify({ deploymentId }),
  });
}

export async function deleteDeployment(projectId, deploymentId) {
  return fetchJson(`/api/deployments/${projectId}/${deploymentId}`, {
    method: 'DELETE',
  });
}

export async function rollbackDeployment(projectId, releaseName) {
  return fetchJson(`/api/deployments/${projectId}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ releaseName }),
  });
}

export async function registerWebhook(projectId) {
  return fetchJson(`/api/projects/${projectId}/webhook`, {
    method: 'POST',
  });
}

export async function unregisterWebhook(projectId) {
  return fetchJson(`/api/projects/${projectId}/webhook`, {
    method: 'DELETE',
  });
}