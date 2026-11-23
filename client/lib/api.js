export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(
    /\/$/,
    '',
  );
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
