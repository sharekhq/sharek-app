// The Apps tab's OAuth app: a prompt while there is none, the new app form, and
// the app's details and credentials once it exists. The tab loads the app over
// SWR and opens the Media Library and confirmations through the modal stack;
// none of that is under test, so the modules are shells (webhooks.spec's
// pattern) and `oauthApp` is what the app request returns.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: jest.fn() }),
  useModals: () => ({ openModal: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: () => null,
  mediaLibrarySize: () => 'md',
}));
jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: jest.fn(),
}));
let oauthApp: unknown;
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: oauthApp, mutate: jest.fn() }),
}));

import { DeveloperComponent } from '@gitroom/frontend/components/developer/developer.component';
import {
  buttonClassName,
  ButtonSize,
  ButtonVariant,
} from '@gitroom/react/form/button';

const mounted: Root[] = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<DeveloperComponent />);
  });
  return host;
};

const classes = (element: Element) => element.className.split(' ');
const look = (variant: ButtonVariant, size: ButtonSize) =>
  buttonClassName({ variant, size }).split(' ');
const control = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button, a')).find(
    (element) => element.textContent === text
  )!;
const click = async (element: Element) => {
  await act(async () => {
    (element as HTMLElement).click();
  });
};
// A one-line field is 40px, 44px under a coarse pointer (FR-034).
const expectFieldHeight = (element: Element) => {
  expect(classes(element)).toEqual(
    expect.arrayContaining(['h-[40px]', 'coarse:h-[44px]'])
  );
  expect(classes(element)).not.toContain('h-[44px]');
};

// Every icon a text button or link carries, beside the label.
const buttonIcons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button svg, a svg'));

beforeEach(() => {
  oauthApp = null;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// FR-026: a text button's icon is 16px, 6px from its label (the button's own
// gap-[6px]), before there is an app (Docs) and once there is one (Docs, Edit
// App, Copy ID, Rotate Secret and Delete App).
it("draws every text button's icon at 16px", async () => {
  const before = buttonIcons(await render());
  oauthApp = {
    name: 'Acme Scheduler',
    description: '',
    redirectUrl: 'https://acme.example/callback',
    clientId: 'client-123',
  };
  const after = buttonIcons(await render());

  expect(before).toHaveLength(1);
  expect(after).toHaveLength(5);
  for (const icon of [...before, ...after]) {
    expect([icon.getAttribute('width'), icon.getAttribute('height')]).toEqual([
      '16',
      '16',
    ]);
  }
});

describe('the OAuth app before there is one', () => {
  // FR-026, FR-027: Docs is the small secondary button; Create OAuth App is
  // the tab's main action, the medium primary.
  it('offers Docs as the small secondary button and Create OAuth App as the medium primary', async () => {
    const host = await render();

    expect(classes(control(host, 'Docs'))).toEqual(look('secondary', 'small'));
    expect(classes(control(host, 'Create OAuth App'))).toEqual(
      look('primary', 'medium')
    );
  });
});

describe('the new app form', () => {
  it('draws Choose Image small secondary, Create medium primary and Cancel medium ghost', async () => {
    const host = await render();
    await click(control(host, 'Create OAuth App'));

    expect(classes(control(host, 'Choose Image'))).toEqual(
      look('secondary', 'small')
    );
    expect(classes(control(host, 'Create'))).toEqual(look('primary', 'medium'));
    expect(classes(control(host, 'Cancel'))).toEqual(look('ghost', 'medium'));
  });

  // The name and redirect URL are one-line fields; the description is a
  // multi-line field and keeps its own height.
  it('makes its name and redirect URL fields 40px and leaves the description its own height', async () => {
    const host = await render();
    await click(control(host, 'Create OAuth App'));
    const [name, redirectUrl] = Array.from(host.querySelectorAll('input'));

    expectFieldHeight(name);
    expectFieldHeight(redirectUrl);
    expect(classes(host.querySelector('textarea')!)).toContain('min-h-[80px]');
  });
});

describe('the OAuth app once it exists', () => {
  beforeEach(() => {
    oauthApp = {
      name: 'Acme Scheduler',
      description: '',
      redirectUrl: 'https://acme.example/callback',
      clientId: 'client-123',
    };
  });

  it('offers Docs, Edit App, Copy ID and Rotate Secret as the small secondary button', async () => {
    const host = await render();

    expect(classes(control(host, 'Docs'))).toEqual(look('secondary', 'small'));
    expect(classes(control(host, 'Edit App'))).toEqual(
      look('secondary', 'small')
    );
    expect(classes(control(host, 'Copy ID'))).toEqual(
      look('secondary', 'small')
    );
    expect(classes(control(host, 'Rotate Secret'))).toEqual(
      look('secondary', 'small')
    );
  });

  // FR-028: Delete App sits on the app's row and opens a confirmation, so it
  // is red text with no fill; the confirmation's own button is the filled one.
  it('offers Delete App as the small red-text button', async () => {
    const host = await render();

    expect(classes(control(host, 'Delete App'))).toEqual(
      look('dangerGhost', 'small')
    );
  });

  it('shows the client ID and the client secret in 40px boxes', async () => {
    const host = await render();
    const clientId = Array.from(host.querySelectorAll('code')).find(
      (element) => element.textContent === 'client-123'
    )!;
    const secret = Array.from(host.querySelectorAll('span')).find(
      (element) =>
        element.textContent === 'Secret is only shown on creation or rotation'
    )!;

    expectFieldHeight(clientId.parentElement!);
    expectFieldHeight(secret.parentElement!);
  });

  it('draws the edit form like the new app form: Choose Image small secondary, Save medium primary and Cancel medium ghost', async () => {
    const host = await render();
    await click(control(host, 'Edit App'));

    expect(classes(control(host, 'Choose Image'))).toEqual(
      look('secondary', 'small')
    );
    expect(classes(control(host, 'Save'))).toEqual(look('primary', 'medium'));
    expect(classes(control(host, 'Cancel'))).toEqual(look('ghost', 'medium'));
  });

  it('makes the app name and redirect URL fields 40px when editing', async () => {
    const host = await render();
    await click(control(host, 'Edit App'));
    const [name, redirectUrl] = Array.from(host.querySelectorAll('input'));

    expectFieldHeight(name);
    expectFieldHeight(redirectUrl);
  });
});
