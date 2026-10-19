import * as fs from 'fs';
import * as path from 'path';

/**
 * The OAuth MCP lives at the domain root, not under /api. start.mcp.ts builds
 * its endpoint, resource and issuer as
 * `new URL('/<path>', NEXT_PUBLIC_BACKEND_URL)`, which drops the /api prefix,
 * and clients look its discovery documents up under /.well-known on the root
 * whatever the server advertises. The container's nginx sends only /api/ to
 * the backend, so without a route of their own these requests reach the
 * website, which redirects them to /auth, and no AI client can sign in.
 *
 * A failure here means a merge dropped or narrowed that route.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const config = fs.readFileSync(
  path.join(ROOT, 'var/docker/nginx.conf'),
  'utf8'
);

// A matching regex location wins over every prefix location in this config
// (the "reads every location" test keeps it that way), so the first regex
// block that matches a path is where nginx sends it; no match leaves the path
// to the prefix blocks (/api/, /uploads/ and the website at `location /`)
const regexLocations = [
  ...config.matchAll(/location ~ (\S+) \{([^}]*)\}/g),
].map(([, pattern, body]) => ({
  pattern: new RegExp(pattern),
  proxyPass: body.match(/proxy_pass ([^;]+);/)?.[1],
}));

const matching = (uri: string) =>
  regexLocations.find((location) => location.pattern.test(uri));

describe('the OAuth MCP root routes in the container nginx', () => {
  it.each([
    '/.well-known/oauth-protected-resource/mcp-oauth-dynamic',
    '/.well-known/oauth-authorization-server/mcp-oauth-dynamic',
    '/.well-known/oauth-authorization-server/mcp-oauth-chatgpt',
    '/.well-known/openid-configuration/mcp-oauth-dynamic',
    // The bare documents clients fall back to: the backend answers 404 itself
    '/.well-known/oauth-authorization-server',
    '/mcp-oauth-dynamic',
    '/mcp-oauth-claude',
    '/mcp-oauth-chatgpt',
    '/mcp-oauth',
    // The API-key endpoint: the key comes as a Bearer header or in the path
    '/mcp',
    '/mcp/an-api-key',
  ])('sends %s to the backend with its path unchanged', (uri) => {
    // No URI part on proxy_pass, so nginx forwards the request path as it came
    expect(matching(uri)?.proxyPass).toBe('http://localhost:3000');
  });

  it.each([
    '/auth',
    '/oauth/authorize',
    '/launches',
    // /api/ strips its prefix for the backend; a regex match would not
    '/api/mcp/an-api-key',
    '/uploads/x.png',
  ])('leaves %s to its prefix block', (uri) => {
    expect(matching(uri)).toBeUndefined();
  });

  // The reads above rely on this: an `=` or `^~` location is chosen before any
  // regex is tried, and a `~*` or differently formatted regex block would not
  // be parsed here
  it('reads every location that can outrank the prefix blocks', () => {
    expect(config).not.toMatch(/location\s+(=|\^~|~\*)/);
    expect(config.match(/location\s+~/g)).toHaveLength(regexLocations.length);
  });
});
