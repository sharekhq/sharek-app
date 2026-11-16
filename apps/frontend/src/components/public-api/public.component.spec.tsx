// The page pulls in SWR, the modal stack, the user and variable contexts and a
// clipboard shim at module load; the config helpers exercise none of it, and
// the tab's render needs only a user with a key and an organization, so the
// modules are swapped for shells (same pattern as studio.component.spec).
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    tier: { public_api: true },
    publicApi: 'pk_test_0123456789',
    orgId: 'org-1',
  }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    billingEnabled: true,
    backendUrl: 'https://api.example',
    frontEndUrl: 'https://app.example',
    mcpUrl: '',
  }),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: [{ id: 'org-1', name: 'Acme' }] }),
  useSWRConfig: () => ({ mutate: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/public-api/mcp.client.icons', () => ({
  McpClientIcon: ({ client }: { client: string }) => (
    <svg data-client-icon={client} />
  ),
}));
jest.mock('copy-to-clipboard', () => ({ __esModule: true, default: jest.fn() }));
// Hints resolve through i18next at call time, so a localized hint comes back as
// its key here — which is exactly what proves it is no longer inline English.
jest.mock('i18next', () => ({ __esModule: true, default: { t: (k: string) => k } }));

import {
  getMcpConfig,
  localCliSteps,
  mcpClients,
  PublicComponent,
  remoteMcpClients,
  type McpAuth,
} from '@gitroom/frontend/components/public-api/public.component';
import {
  buttonClassName,
  ButtonSize,
  ButtonVariant,
} from '@gitroom/react/form/button';
import {
  SWITCH_GROUP,
  SWITCH_OPTION,
  SWITCH_OPTION_IDLE,
  SWITCH_OPTION_ON,
} from '@gitroom/frontend/components/ui/pick.controls';

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

const mounted: Root[] = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<PublicComponent />);
  });
  return host;
};

const words = (value: string) => value.split(' ');
const classes = (element: Element) => element.className.split(' ');
const look = (variant: ButtonVariant, size: ButtonSize) =>
  words(buttonClassName({ variant, size }));
const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (element) => element.textContent === text
  )!;
const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};
// Which half of the switch an option carries, whole and alone: 'on', 'idle',
// or 'mixed' for anything else.
const half = (option: Element) => {
  const own = classes(option);
  expect(own).toEqual(expect.arrayContaining(words(SWITCH_OPTION)));
  const has = (value: string) =>
    words(value).filter((name) => own.includes(name)).length;
  const on = has(SWITCH_OPTION_ON);
  const idle = has(SWITCH_OPTION_IDLE);
  if (on === words(SWITCH_OPTION_ON).length && !idle) return 'on';
  if (idle === words(SWITCH_OPTION_IDLE).length && !on) return 'idle';
  return 'mixed';
};
const options = (host: HTMLElement, first: string) =>
  Array.from(button(host, first).parentElement!.children).filter(
    (element) => element.tagName === 'BUTTON'
  );

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the Sharek API tab', () => {
  // FR-026: the copy, reveal, rotate and wizard buttons and the Docs and N8N
  // links are one small secondary button, drawn from the shared look and
  // nothing else (the hand-written string they repeated is gone).
  it('draws every copy, reveal, rotate and wizard button and every docs link as the small secondary button', async () => {
    const host = await render();
    // The MCP section's API Key mode and a local client show its Reveal and
    // Copy URL; the CLI's CI mode shows its Reveal.
    await click(button(host, 'API Key'));
    await click(button(host, 'Cursor'));
    await click(button(host, 'CI / Remote servers'));

    const labels = [
      'Reveal',
      'Copy',
      'Copy URL',
      'Copy All',
      'Rotate Key',
      'Open Wizard',
      'Docs',
      'N8N Node',
    ];
    const actions = Array.from(host.querySelectorAll('button, a')).filter(
      (element) => labels.includes(element.textContent ?? '')
    );

    expect(actions.map((element) => element.textContent).sort()).toEqual(
      [
        'Copy',
        'Copy',
        'Copy All',
        'Copy URL',
        'Docs',
        'Docs',
        'Docs',
        'N8N Node',
        'Open Wizard',
        'Reveal',
        'Reveal',
        'Reveal',
        'Rotate Key',
      ].sort()
    );
    for (const action of actions) {
      expect(classes(action)).toEqual(look('secondary', 'small'));
    }
  });

  // FR-026: each of those buttons' icons is 16px, 6px from its label (the
  // button's own gap-[6px]).
  it("draws every copy, reveal, rotate, wizard and docs button's icon at 16px", async () => {
    const host = await render();
    await click(button(host, 'API Key'));
    await click(button(host, 'Cursor'));
    await click(button(host, 'CI / Remote servers'));

    const labels = [
      'Reveal',
      'Copy',
      'Copy URL',
      'Copy All',
      'Rotate Key',
      'Open Wizard',
      'Docs',
      'N8N Node',
    ];
    const icons = Array.from(host.querySelectorAll('button, a'))
      .filter((element) => labels.includes(element.textContent ?? ''))
      .map((element) => element.querySelector('svg'));

    expect(icons).toHaveLength(13);
    for (const icon of icons) {
      expect([
        icon?.getAttribute('width'),
        icon?.getAttribute('height'),
      ]).toEqual(['16', '16']);
    }
  });

  // FR-032: the sign-in method, the client and where the CLI runs are view
  // switches in the dashboard's one look: each row is a switch group (the
  // clients wrap), the current option takes the current half and the others
  // the idle half.
  it("draws the sign-in, client and CLI rows in the dashboard's one switch look", async () => {
    const host = await render();
    const auth = () => options(host, 'API Key');
    const clients = () => options(host, 'Claude');
    const cli = () => options(host, 'Locally');

    expect(classes(button(host, 'API Key').parentElement!)).toEqual(
      expect.arrayContaining(words(SWITCH_GROUP))
    );
    expect(classes(button(host, 'Claude').parentElement!)).toEqual(
      expect.arrayContaining([...words(SWITCH_GROUP), 'flex-wrap'])
    );
    expect(classes(button(host, 'Locally').parentElement!)).toEqual(
      expect.arrayContaining(words(SWITCH_GROUP))
    );

    expect(auth().map(half)).toEqual(['on', 'idle']);
    expect(cli().map(half)).toEqual(['on', 'idle']);
    expect(
      clients().map((option) => [option.textContent, half(option)])
    ).toEqual(
      clients().map((option) => [
        option.textContent,
        option.textContent === 'Claude' ? 'on' : 'idle',
      ])
    );

    await click(button(host, 'API Key'));
    await click(button(host, 'Cursor'));
    await click(button(host, 'CI / Remote servers'));
    expect(auth().map(half)).toEqual(['idle', 'on']);
    expect(cli().map(half)).toEqual(['idle', 'on']);
    expect(
      clients()
        .filter((option) => half(option) === 'on')
        .map((option) => option.textContent)
    ).toEqual(['Cursor']);

    for (const option of [...auth(), ...clients(), ...cli()]) {
      expect(option.getAttribute('type')).toBe('button');
      expect(classes(option)).not.toContain('bg-btnSimple');
    }
    // each client keeps its icon beside its name
    for (const option of clients()) {
      expect(
        option
          .querySelector('[data-client-icon]')
          ?.getAttribute('data-client-icon')
      ).toBe(option.textContent);
    }
  });

  // FR-034: the box the API key sits in is a field's 40px.
  it('shows the API key in a 40px box', async () => {
    const host = await render();
    const box = host.querySelector('code')!.parentElement!;

    expect(classes(box)).toContain('h-[40px]');
    expect(classes(box)).not.toContain('h-[44px]');
  });

  // FR-035: a panel's heading is 20px semibold.
  it('heads the tab at 20px semibold with the organization name', async () => {
    const heading = (await render()).querySelector('h3')!;

    expect(heading.textContent).toBe('Sharek API - Acme');
    expect(classes(heading)).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
  });
});
