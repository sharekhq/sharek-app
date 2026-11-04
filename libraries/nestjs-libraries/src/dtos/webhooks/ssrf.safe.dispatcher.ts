import { Agent, buildConnector } from 'undici';
import axios, { AxiosInstance } from 'axios';
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isBlockedIp } from './webhook.url.validator';

// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
function ssrfSafeLookup(
  hostname: string,
  options: any,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: any,
    family?: number
  ) => void
) {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    return options && (options as any).all
      ? callback(null, [{ address: hostname, family }] as any, family)
      : callback(null, hostname, family);
  }

  dns.lookup(hostname, options, (err, address: any, family: any) => {
    if (err) return callback(err, '', 0);
    if (Array.isArray(address)) {
      for (const entry of address) {
        if (isBlockedIp(entry.address)) {
          return callback(new Error('Blocked IP'), '', 0);
        }
      }
      return callback(null, address as any, 0);
    }
    if (isBlockedIp(address)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    callback(null, address, family);
  });
}

// Node's net.connect never calls `lookup` for a host that is already an IP
// address, so an address in a URL, or in a redirect, is refused at connect time.
function isBlockedAddress(host?: string | null): boolean {
  return !!host && !!net.isIP(host) && isBlockedIp(host);
}

const ssrfSafeConnector = buildConnector({ lookup: ssrfSafeLookup });

export const ssrfSafeDispatcher = new Agent({
  connect: (options, callback) => {
    if (isBlockedAddress(options.hostname)) {
      return callback(new Error('Blocked IP'), null);
    }
    ssrfSafeConnector(options, callback);
  },
});

// A blocked address carries on as a host name whose lookup fails, so it's refused
// the way a blocked host name is, and the agent and the request clean up as usual.
function refuseBlockedAddresses<T extends http.Agent>(agent: T): T {
  // not in @types/node, but documented as the method an agent can override
  const createConnection = (agent as any).createConnection;
  (agent as any).createConnection = (options: any, callback: any) =>
    createConnection.call(
      agent,
      isBlockedAddress(options.host)
        ? {
            ...options,
            host: 'blocked.invalid',
            lookup: (_hostname: string, _options: any, done: any) =>
              setImmediate(done, new Error('Blocked IP'), '', 0),
          }
        : options,
      callback
    );
  return agent;
}

// axios can't use an undici dispatcher, but Node's http(s) agents accept the
// same `lookup` hook, so axios requests (providers that need form-data /
// stream uploads) get the identical pinned-DNS guard as `this.fetch`.
const ssrfSafeAxios = axios.create({
  httpAgent: refuseBlockedAddresses(
    new http.Agent({ lookup: ssrfSafeLookup } as http.AgentOptions)
  ),
  httpsAgent: refuseBlockedAddresses(
    new https.Agent({
      lookup: ssrfSafeLookup,
    } as https.AgentOptions)
  ),
});

// Self-hosters legitimately connect Postiz to WordPress/Mastodon/Lemmy/Listmonk
// instances that live on a private network (e.g. the same Docker network or VPC).
// Setting DISABLE_SSRF_PROTECTION=true opts those deployments out of the IP
// guard. It stays ON by default so the hosted product is protected.
export function getSsrfSafeDispatcher(): Agent | undefined {
  return process.env.DISABLE_SSRF_PROTECTION === 'true'
    ? undefined
    : ssrfSafeDispatcher;
}

export function getSsrfSafeAxios(): AxiosInstance {
  return process.env.DISABLE_SSRF_PROTECTION === 'true' ? axios : ssrfSafeAxios;
}
