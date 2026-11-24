import { UapiError, UapiNotFoundError } from './uapi-client.js';

export class PassengerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PassengerError';
    this.code = code;
    this.details = details;
  }
}

export async function listApps(uapi) {
  try {
    const { data } = await uapi.passengerApps.list();
    return data?.map(app => ({
      name: app.name,
      domain: app.domain,
      path: app.path,
      passenger_version: app.passenger_version,
      ruby_version: app.ruby_version,
      python_version: app.python_version,
      nodejs_version: app.nodejs_version,
      deployment_mode: app.deployment_mode,
      base_uri: app.base_uri,
      enabled: app.enabled,
    })) || [];
  } catch (error) {
    if (error instanceof UapiNotFoundError) {
      return [];
    }
    throw error;
  }
}

export async function findApp(uapi, appName) {
  const apps = await listApps(uapi);
  return apps.find(a => a.name === appName);
}

export async function findAppByDomain(uapi, domain) {
  const apps = await listApps(uapi);
  return apps.find(a => a.domain === domain);
}

export async function ensureAppRegistered(uapi, params, logger) {
  const { name, domain, path, passenger_version, nodejs_version, deployment_mode, base_uri, envvars } = params;

  const existing = await findApp(uapi, name);
  if (existing) {
    logger.info('Passenger app already registered', { name, domain: existing.domain, path: existing.path });
    return { created: false, app: existing };
  }

  try {
    const registerParams = {
      name,
      domain,
      path,
      passenger_version: passenger_version || '6.0',
      deployment_mode: deployment_mode || 'production',
      base_uri: base_uri || '/',
      ...(nodejs_version && { nodejs_version }),
      ...(envvars && { envvars: JSON.stringify(envvars) }),
    };

    const { data } = await uapi.passengerApps.register(registerParams);
    logger.info('Passenger app registered', { name, domain, path });
    return { created: true, app: { name, domain, path, ...data } };
  } catch (error) {
    if (error instanceof UapiError && error.errors.some(e => e.includes('already exists') || e.includes('already registered'))) {
      const existing = await findApp(uapi, name);
      if (existing) {
        logger.info('Passenger app already exists (race condition)', { name });
        return { created: false, app: existing };
      }
    }
    throw new PassengerError(
      `Failed to register Passenger app: ${error.message}`,
      'PASSENGER_REGISTER_FAILED',
      { name, domain, path, originalError: error.message }
    );
  }
}

export async function updateApp(uapi, params, logger) {
  const { name, domain, path, passenger_version, nodejs_version, deployment_mode, base_uri, envvars, enabled } = params;

  try {
    const updateParams = { name };
    if (domain) updateParams.domain = domain;
    if (path) updateParams.path = path;
    if (passenger_version) updateParams.passenger_version = passenger_version;
    if (nodejs_version) updateParams.nodejs_version = nodejs_version;
    if (deployment_mode) updateParams.deployment_mode = deployment_mode;
    if (base_uri) updateParams.base_uri = base_uri;
    if (envvars) updateParams.envvars = JSON.stringify(envvars);
    if (enabled !== undefined) updateParams.enabled = enabled ? '1' : '0';

    const { data } = await uapi.passengerApps.edit(updateParams);
    logger.info('Passenger app updated', { name });
    return { updated: true, app: { name, ...data } };
  } catch (error) {
    throw new PassengerError(
      `Failed to update Passenger app: ${error.message}`,
      'PASSENGER_UPDATE_FAILED',
      { name, originalError: error.message }
    );
  }
}

export async function restartApp(uapi, appName, logger) {
  try {
    await uapi.passengerApps.restart(appName);
    logger.info('Passenger app restarted', { appName });
    return { restarted: true };
  } catch (error) {
    throw new PassengerError(
      `Failed to restart Passenger app: ${error.message}`,
      'PASSENGER_RESTART_FAILED',
      { appName, originalError: error.message }
    );
  }
}

export async function unregisterApp(uapi, appName, logger) {
  try {
    await uapi.passengerApps.unregister(appName);
    logger.info('Passenger app unregistered', { appName });
    return { unregistered: true };
  } catch (error) {
    if (error instanceof UapiNotFoundError) {
      return { unregistered: false };
    }
    throw new PassengerError(
      `Failed to unregister Passenger app: ${error.message}`,
      'PASSENGER_UNREGISTER_FAILED',
      { appName, originalError: error.message }
    );
  }
}

export async function ensureAppDirectory(uapi, path, logger) {
  try {
    await uapi.passengerApps.ensureDir(path);
    logger.debug('Passenger app directory ensured', { path });
    return { ensured: true };
  } catch (error) {
    logger.warn('Failed to ensure Passenger app directory', { path, error: error.message });
    return { ensured: false, error: error.message };
  }
}

export function generateAppName(projectId, subdomain) {
  const cleanSubdomain = subdomain.replace(/[^a-z0-9]/gi, '_');
  return `cship_${cleanSubdomain}_${projectId.slice(0, 8)}`;
}

export function getRestartTxtPath(appPath) {
  return `${appPath.replace(/\/$/, '')}/tmp/restart.txt`;
}

export function getAppRoot(appPath) {
  return appPath.replace(/\/$/, '');
}