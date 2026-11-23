import { UapiError, UapiNotFoundError, UapiPermissionError } from './uapi-client.js';

export class SubdomainError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SubdomainError';
    this.code = code;
    this.details = details;
  }
}

export async function resolveDocumentRoot(uapi, rootDomain) {
  try {
    const { data } = await uapi.domainInfo.single(rootDomain);
    if (data && data.documentroot) {
      return data.documentroot;
    }
  } catch (error) {
    if (!(error instanceof UapiNotFoundError)) {
      throw error;
    }
  }

  return `public_html`;
}

export async function listSubdomains(uapi) {
  try {
    const { data } = await uapi.subdomains.list();
    return data?.map(s => ({
      subdomain: s.subdomain,
      rootdomain: s.rootdomain,
      domain: s.domain,
      documentroot: s.documentroot,
      dir: s.dir,
    })) || [];
  } catch (error) {
    if (error instanceof UapiNotFoundError) {
      return [];
    }
    throw error;
  }
}

export async function findSubdomain(uapi, subdomain, rootDomain) {
  const subdomains = await listSubdomains(uapi);
  return subdomains.find(s => s.subdomain === subdomain && s.rootdomain === rootDomain);
}

export async function ensureSubdomain(uapi, subdomain, rootDomain, documentRoot, logger) {
  const existing = await findSubdomain(uapi, subdomain, rootDomain);
  if (existing) {
    logger.info('Subdomain already exists', { subdomain, rootDomain, documentRoot: existing.documentroot });
    return { created: false, subdomain: existing };
  }

  try {
    const { data } = await uapi.subdomains.add(subdomain, rootDomain, documentRoot);
    logger.info('Subdomain created', { subdomain, rootDomain, documentRoot });
    return { created: true, subdomain: { subdomain, rootdomain: rootDomain, documentroot: documentRoot, ...data } };
  } catch (error) {
    if (error instanceof UapiError && error.errors.some(e => e.includes('already exists') || e.includes('already in use'))) {
      const existing = await findSubdomain(uapi, subdomain, rootDomain);
      if (existing) {
        logger.info('Subdomain already exists (race condition)', { subdomain, rootDomain });
        return { created: false, subdomain: existing };
      }
    }
    throw new SubdomainError(
      `Failed to create subdomain: ${error.message}`,
      'SUBDOMAIN_CREATE_FAILED',
      { subdomain, rootDomain, documentRoot, originalError: error.message }
    );
  }
}

export async function removeSubdomain(uapi, subdomain, rootDomain, logger) {
  const existing = await findSubdomain(uapi, subdomain, rootDomain);
  if (!existing) {
    logger.info('Subdomain does not exist, nothing to remove', { subdomain, rootDomain });
    return { removed: false };
  }

  try {
    await uapi.subdomains.remove(subdomain, rootDomain);
    logger.info('Subdomain removed', { subdomain, rootDomain });
    return { removed: true };
  } catch (error) {
    throw new SubdomainError(
      `Failed to remove subdomain: ${error.message}`,
      'SUBDOMAIN_REMOVE_FAILED',
      { subdomain, rootDomain, originalError: error.message }
    );
  }
}

export function buildSubdomainUrl(subdomain, rootDomain, useHttps = true) {
  const protocol = useHttps ? 'https' : 'http';
  return `${protocol}://${subdomain}.${rootDomain}`;
}

export function parseSubdomainUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.');
    if (parts.length < 2) return null;
    const subdomain = parts[0];
    const rootDomain = parts.slice(1).join('.');
    return { subdomain, rootDomain, protocol: parsed.protocol.replace(':', '') };
  } catch {
    return null;
  }
}