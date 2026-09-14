// The page pulls in SWR, the modal stack, the user and variable contexts and a
// clipboard shim at module load; none of that is exercised by the config
// helpers, so the modules are swapped for shells (same pattern as
// studio.component.spec).
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { public_api: true } }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: true, backendUrl: '', mcpUrl: '' }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/developer/developer.component', () => ({
  DeveloperComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/public-api/mcp.client.icons', () => ({
  McpClientIcon: () => null,
}));
jest.mock('copy-to-clipboard', () => ({ __esModule: true, default: jest.fn() }));
// Hints resolve through i18next at call time, so a localized hint comes back as
// its key here — which is exactly what proves it is no longer inline English.
jest.mock('i18next', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import {
  getMcpConfig,
  localCliSteps,
  mcpClients,
  remoteMcpClients,
  type McpAuth,
} from '@gitroom/frontend/components/public-api/public.component';

const BASE = 'https://api.example';
const KEY = 'KEY';
const AUTHS: McpAuth[] = ['oauth', 'apikey'];

describe('MCP client configurations', () => {
  // The generated config is what the user pastes into their agent, so the
  // server it names is the fork's name in every client and both auth modes.
  it('names the Sharek server in every local client config', () => {
    for (const client of mcpClients) {
      for (const auth of AUTHS) {
        const { config } = getMcpConfig(client, auth, BASE, KEY);
        expect(config).toMatch(/sharek/);
        expect(config).not.toMatch(/postiz/i);
      }
    }
  });

  // Remote clients get a bare URL under the base, so there is no server name to
  // check — only that no upstream name rides along.
  it('carries no upstream name in the remote client urls', () => {
    for (const client of Object.keys(remoteMcpClients) as Array<
      keyof typeof remoteMcpClients
    >) {
      for (const auth of AUTHS) {
        expect(getMcpConfig(client, auth, BASE, KEY).config).not.toMatch(
          /postiz/i
        );
      }
    }
  });

  it('gives the chat-only agent the Sharek CLI, skill and key', () => {
    const { config } = getMcpConfig('Grok Bot', 'oauth', BASE, KEY);

    expect(config).toContain('npm install -g sharek-cli');
    expect(config).toContain('npx skills add sharekhq/sharek-agent');
    expect(config).toContain('SHAREK_API_KEY');
  });

  // The onboarding step reads these codes too, so they are the fork's published
  // package and binary, not upstream's.
  it('walks through the published Sharek CLI commands', () => {
    expect(localCliSteps.map((step) => step.code)).toEqual([
      'npm install -g sharek-cli',
      'sharek auth:login',
      'npx skills add sharekhq/sharek-agent',
    ]);
  });

  // A hint left inline renders English under Arabic, which is the bug that made
  // the app look half-translated.
  it('resolves every hint through a translation key', () => {
    expect(getMcpConfig('Cursor', 'oauth', BASE, KEY).hint).toBe(
      'mcp_hint_cursor'
    );
    expect(getMcpConfig('Claude', 'oauth', BASE, KEY).hint).toBe(
      'mcp_hint_remote_claude'
    );
    expect(getMcpConfig('Grok Bot', 'oauth', BASE, KEY).hint).toBe(
      'mcp_hint_chat_only'
    );
    expect(getMcpConfig('Codex', 'oauth', BASE, KEY).hint).toBe(
      'mcp_hint_codex_login'
    );
  });
});
