const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_BASE = 'https://github.com/login/oauth';

export function createGitHubClient({ getDecryptedToken, getDecryptedRefreshToken, baseUrl = GITHUB_API_BASE, mock = false }) {
  async function request(path, options = {}) {
    const token = await getDecryptedToken();
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cShip',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      error.status = response.status;
      error.response = errorText;
      throw error;
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async function paginate(path, params = {}) {
    const url = new URL(path, baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    url.searchParams.set('per_page', '100');

    const results = [];
    let nextUrl = url.toString();

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${await getDecryptedToken()}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'cShip',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.response = errorText;
        throw error;
      }

      const data = await response.json();
      results.push(...data);

      const linkHeader = response.headers.get('link');
      nextUrl = null;
      if (linkHeader) {
        const links = linkHeader.split(',').map(l => l.trim());
        for (const link of links) {
          const match = link.match(/<([^>]+)>;\s*rel="next"/);
          if (match) {
            nextUrl = match[1];
            break;
          }
        }
      }
    }

    return results;
  }

  /**
   * Refreshes the GitHub access token using the refresh token
   */
  async function refreshAccessToken(refreshToken, clientId, clientSecret) {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch(`${GITHUB_OAUTH_BASE}/access_token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = new Error(`GitHub token refresh failed: ${response.status}`);
      error.status = response.status;
      error.response = errorText;
      throw error;
    }

    return response.json();
  }

  return {
    async exchangeCodeForToken(code, clientId, clientSecret, redirectUri) {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      const response = await fetch(`${GITHUB_OAUTH_BASE}/access_token`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`GitHub token exchange failed: ${response.status}`);
        error.status = response.status;
        error.response = errorText;
        throw error;
      }

      return response.json();
    },

    async getAuthenticatedUser() {
      return request('/user');
    },

    async listRepos() {
      return paginate('/user/repos', {
        sort: 'updated',
        direction: 'desc',
        affiliation: 'owner,collaborator,organization_member',
      });
    },

    async listBranches(owner, repo) {
      return paginate(`/repos/${owner}/${repo}/branches`);
    },

    async listCommits(owner, repo, branch, perPage = 1) {
      return request(`/repos/${owner}/${repo}/commits`, {
        params: { sha: branch, per_page: perPage },
      });
    },

    async getRepo(owner, repo) {
      return request(`/repos/${owner}/${repo}`);
    },

    async createWebhook(owner, repo, config) {
      if (mock) {
        return {
          id: Math.floor(Math.random() * 1000000),
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: config.url,
            content_type: 'json',
            secret: config.secret || 'mock-secret',
          },
        };
      }
      return request(`/repos/${owner}/${repo}/hooks`, {
        method: 'POST',
        body: JSON.stringify(config),
      });
    },

    async deleteWebhook(owner, repo, hookId) {
      if (mock) {
        return null;
      }
      return request(`/repos/${owner}/${repo}/hooks/${hookId}`, {
        method: 'DELETE',
      });
    },

    // Expose refresh function for use by middleware
    async refreshTokenIfNeeded(user, clientId, clientSecret) {
      // Check if token is expired or about to expire
      if (user.isTokenExpired && user.isTokenExpired()) {
        const refreshToken = user.getDecryptedRefreshToken && user.getDecryptedRefreshToken();
        if (refreshToken) {
          try {
            const tokenResponse = await refreshAccessToken(refreshToken, clientId, clientSecret);
            if (tokenResponse.access_token) {
              await user.updateGitHubTokens(
                tokenResponse.access_token,
                tokenResponse.refresh_token,
                tokenResponse.expires_in
              );
              return tokenResponse.access_token;
            }
          } catch (error) {
            // Refresh failed, will fall through to re-authentication
            console.warn('GitHub token refresh failed:', error.message);
          }
        }
      }
      return null;
    },
  };
}