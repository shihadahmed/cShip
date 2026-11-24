export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(
    /\/$/,
    '',
  );
}

function getCsrfToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute('content') || '';
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
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
  return fetchJson('/api/auth/me');
}

export async function login() {
  window.location.href = `${getApiBaseUrl()}/api/auth/github`;
}

export async function logout() {
  await fetchJson('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
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