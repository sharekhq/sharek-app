import * as fs from 'fs';
import * as path from 'path';

/**
 * startMcp builds every connection at boot, so the wiring of the ChatGPT one
 * is pinned from the source: /mcp-oauth-chatgpt gets its own server, built
 * from ChatgptToolsService and its own widget resource map, with no agent and
 * no self-hosted relay, while the other OAuth paths keep the servers they had
 * (as at b80ec8112).
 */

const source = fs.readFileSync(
  path.join(__dirname, '..', 'start.mcp.ts'),
  'utf8'
);

const entry = (mcpPath: string) =>
  source.match(new RegExp(`^\\s*'${mcpPath}': \\{.*\\},?$`, 'm'))?.[0].trim();

// The body of the `const name = new MCPServer({ ... });` statement
const serverBody = (name: string) =>
  source.match(
    new RegExp(`const ${name} = new MCPServer\\(\\{([\\s\\S]*?)\\}\\);`)
  )?.[1];

describe('the ChatGPT connection wiring in start.mcp.ts', () => {
  const chatgptEntry = entry('/mcp-oauth-chatgpt')!;
  const serverName = chatgptEntry?.match(/mcpServer: (\w+)/)?.[1];

  it('answers /mcp-oauth-chatgpt with its own server and no self-hosted relay', () => {
    expect(chatgptEntry).toBeDefined();
    expect(serverName).toBeDefined();
    expect(serverName).not.toBe('oauthServer');
    expect(serverName).toMatch(/chatgpt/i);
    expect(chatgptEntry).not.toContain('selfHostedServer');
  });

  it('builds that server from the service tools and its own resources, without agents', () => {
    const body = serverBody(serverName!)!;

    expect(body).toBeDefined();
    expect(body).toContain('name: CHATGPT_SERVER_NAME');
    expect(body).toMatch(/tools: \w*[cC]hatgpt\w*/);
    expect(body).toMatch(/appResources: \w*[cC]hatgpt\w*/);
    expect(body).not.toContain('agents');
    expect(source).toContain('ChatgptToolsService');
  });

  it('leaves the other OAuth paths as they were', () => {
    expect(entry('/mcp-oauth')).toBe(
      "'/mcp-oauth': { middleware: createResourceMiddleware('/mcp-oauth', '/mcp-oauth-dynamic'), mcpServer: oauthServer, selfHostedServer },"
    );
    expect(entry('/mcp-oauth-claude')).toBe(
      "'/mcp-oauth-claude': { middleware: createResourceMiddleware('/mcp-oauth-claude', '/mcp-oauth-dynamic'), mcpServer: claudeOauthServer, selfHostedServer: claudeSelfHostedServer },"
    );
    expect(entry('/mcp-oauth-dynamic')).toBe(
      "'/mcp-oauth-dynamic': { middleware: createResourceMiddleware('/mcp-oauth-dynamic', '/mcp-oauth-dynamic'), mcpServer: oauthServer, selfHostedServer },"
    );
  });
});
