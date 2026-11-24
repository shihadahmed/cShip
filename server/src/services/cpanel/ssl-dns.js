import dns from 'node:dns';
import { promisify } from 'node:util';
import tls from 'node:tls';

const resolveDns = promisify(dns.resolve4);

export async function verifyDns(hostname, expectedIp) {
  try {
    const ips = await resolveDns(hostname);
    return {
      resolved: true,
      ip: ips[0],
      matchesExpected: expectedIp ? ips.includes(expectedIp) : true,
    };
  } catch (error) {
    return { resolved: false, error: error.message };
  }
}

export async function verifySsl(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, {
      servername: hostname,
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate();
      const valid = cert && cert.subject && cert.valid_to;
      resolve({
        valid,
        subject: cert?.subject,
        issuer: cert?.issuer,
        validFrom: cert?.valid_from,
        validTo: cert?.valid_to,
        expiresAt: cert?.valid_to ? new Date(cert.valid_to).getTime() : null,
        daysUntilExpiry: cert?.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null,
      });
      socket.destroy();
    });

    socket.on('error', (err) => {
      resolve({ valid: false, error: err.message });
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      resolve({ valid: false, error: 'Connection timeout' });
    });
  });
}

export async function verifyDomain(project, config) {
  const rootDomain = config.CPANEL_ROOT_DOMAIN || config.CLIENT_ORIGIN?.replace(/^https?:\/\//, '').split('/')[0];
  const results = {
    subdomain: null,
    customDomain: null,
  };

  if (project.subdomain && rootDomain) {
    const fqdn = `${project.subdomain}.${rootDomain}`;
    results.subdomain = {
      fqdn,
      dns: await verifyDns(fqdn),
      ssl: await verifySsl(fqdn),
      checkedAt: new Date().toISOString(),
    };
  }

  if (project.domain) {
    results.customDomain = {
      fqdn: project.domain,
      dns: await verifyDns(project.domain),
      ssl: await verifySsl(project.domain),
      checkedAt: new Date().toISOString(),
    };
  }

  return results;
}