import crypto from 'node:crypto';
import { HttpError } from '../../lib/http-error.js';

export class UapiError extends Error {
  constructor(message, status, errors = [], metadata = {}) {
    super(message);
    this.name = 'UapiError';
    this.status = status;
    this.errors = errors;
    this.metadata = metadata;
  }
}

export class UapiAuthenticationError extends UapiError {
  constructor(message, metadata = {}) {
    super(message, 401, [], metadata);
    this.name = 'UapiAuthenticationError';
  }
}

export class UapiPermissionError extends UapiError {
  constructor(message, metadata = {}) {
    super(message, 403, [], metadata);
    this.name = 'UapiPermissionError';
  }
}

export class UapiNotFoundError extends UapiError {
  constructor(message, metadata = {}) {
    super(message, 404, [], metadata);
    this.name = 'UapiNotFoundError';
  }
}

export class UapiRateLimitError extends UapiError {
  constructor(message, retryAfter, metadata = {}) {
    super(message, 429, [], { ...metadata, retryAfter });
    this.name = 'UapiRateLimitError';
  }
}

function parseUapiResponse(data) {
  if (!data || typeof data !== 'object') {
    return { success: false, errors: ['Invalid UAPI response'], data: null, metadata: {} };
  }

  const result = data.result || data;
  const errors = result.errors || [];
  const warnings = result.warnings || [];
  const messages = result.messages || [];
  const dataField = result.data;
  const metadata = result.metadata || {};

  const allErrors = [
    ...errors.map(e => typeof e === 'string' ? e : JSON.stringify(e)),
    ...warnings.map(w => typeof w === 'string' ? w : JSON.stringify(w)),
    ...messages.filter(m => m.type === 'error').map(m => m.message || JSON.stringify(m)),
  ];

  return {
    success: result.status === 1 || result.success === true,
    errors: allErrors,
    data: dataField,
    metadata,
  };
}

export function createUapiClient(config, logger) {
  const { CPANEL_URL, CPANEL_USERNAME, CPANEL_API_TOKEN } = config;

  if (!CPANEL_URL || !CPANEL_USERNAME || !CPANEL_API_TOKEN) {
    throw new Error('cPanel UAPI requires CPANEL_URL, CPANEL_USERNAME, and CPANEL_API_TOKEN');
  }

  const baseUrl = CPANEL_URL.replace(/\/+$/, '');
  const authHeader = `cpanel ${CPANEL_USERNAME}:${CPANEL_API_TOKEN}`;

  async function request(module, functionName, params = {}, options = {}) {
    const url = `${baseUrl}/execute/${module}/${functionName}`;
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => searchParams.append(key, v));
      } else if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const requestOptions = {
      method: options.method || 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'cShip/1.0',
      },
      body: searchParams.toString(),
      signal: options.signal,
    };

    logger.debug('UAPI request', { module, function: functionName, params: Object.keys(params) });

    let response;
    try {
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new UapiError(`Network error: ${error.message}`, 0, [], { module, function: functionName });
    }

    let responseData;
    try {
      responseData = await response.json();
    } catch {
      throw new UapiError('Invalid JSON response from cPanel', response.status, [], { module, function: functionName });
    }

    const parsed = parseUapiResponse(responseData);

    if (!response.ok) {
      if (response.status === 401) {
        throw new UapiAuthenticationError('cPanel authentication failed', { status: response.status });
      }
      if (response.status === 403) {
        throw new UapiPermissionError('cPanel permission denied', { status: response.status });
      }
      if (response.status === 404) {
        throw new UapiNotFoundError('cPanel endpoint not found', { status: response.status });
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new UapiRateLimitError('cPanel rate limit exceeded', retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      throw new UapiError(
        `cPanel UAPI error: ${parsed.errors.join('; ') || `HTTP ${response.status}`}`,
        response.status,
        parsed.errors,
        { module, function: functionName }
      );
    }

    if (!parsed.success && parsed.errors.length > 0) {
      const errorMsg = parsed.errors.join('; ');
      if (errorMsg.includes('permission') || errorMsg.includes('unauthorized') || errorMsg.includes('access denied')) {
        throw new UapiPermissionError(errorMsg, { module, function: functionName });
      }
      if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
        throw new UapiNotFoundError(errorMsg, { module, function: functionName });
      }
      throw new UapiError(errorMsg, 400, parsed.errors, { module, function: functionName });
    }

    logger.debug('UAPI response', { module, function: functionName, success: true });
    return parsed;
  }

  async function detectCapabilities() {
    const capabilities = {
      subdomains: false,
      passengerApps: false,
      domainInfo: false,
      ssl: false,
    };

    try {
      await request('SubDomain', 'listsubdomains', {});
      capabilities.subdomains = true;
    } catch (error) {
      logger.debug('SubDomain module not available', { error: error.message });
    }

    try {
      await request('PassengerApps', 'listapps', {});
      capabilities.passengerApps = true;
    } catch (error) {
      logger.debug('PassengerApps module not available', { error: error.message });
    }

    try {
      await request('DomainInfo', 'listdomains', {});
      capabilities.domainInfo = true;
    } catch (error) {
      logger.debug('DomainInfo module not available', { error: error.message });
    }

    try {
      await request('SSL', 'listcerts', {});
      capabilities.ssl = true;
    } catch (error) {
      logger.debug('SSL module not available', { error: error.message });
    }

    logger.info('cPanel capability detection complete', capabilities);
    return capabilities;
  }

  return {
    request,
    detectCapabilities,
    // Convenience methods
    subdomains: {
      list: () => request('SubDomain', 'listsubdomains', {}),
      add: (domain, rootDomain, dir) => request('SubDomain', 'addsubdomain', { domain, rootdomain: rootDomain, dir }),
      remove: (domain, rootDomain) => request('SubDomain', 'deletesubdomain', { domain, rootdomain: rootDomain }),
    },
    passengerApps: {
      list: () => request('PassengerApps', 'listapps', {}),
      register: (params) => request('PassengerApps', 'registerapp', params),
      edit: (params) => request('PassengerApps', 'editapp', params),
      restart: (appName) => request('PassengerApps', 'restartapp', { appname: appName }),
      unregister: (appName) => request('PassengerApps', 'unregisterapp', { appname: appName }),
      ensureDir: (path) => request('PassengerApps', 'ensuredir', { path }),
    },
    domainInfo: {
      list: () => request('DomainInfo', 'listdomains', {}),
      single: (domain) => request('DomainInfo', 'singledomain', { domain }),
    },
    ssl: {
      listCerts: () => request('SSL', 'listcerts', {}),
      install: (params) => request('SSL', 'installssl', params),
      delete: (params) => request('SSL', 'deletessl', params),
    },
    fileman: {
      upload: (params) => request('Fileman', 'upload', params),
      getFile: (path) => request('Fileman', 'getfile', { path }),
      putFile: (params) => request('Fileman', 'putfile', params),
      delete: (path) => request('Fileman', 'deletefile', { path }),
      mkdir: (path) => request('Fileman', 'mkdir', { path }),
    },
  };
}