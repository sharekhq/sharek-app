import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

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
  useModals: () => ({ closeAll: jest.fn() }),
}));
let swrData: unknown;
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: swrData, isLoading: false, mutate: jest.fn() }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/pick.platform.component',
  () => ({ PickPlatforms: () => null })
);
// The add/edit form's rich-text field; the real one pulls the whole assistant
// runtime in, and this page imports it at load.
jest.mock('@copilotkit/react-textarea', () => ({
  CopilotTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea readOnly placeholder={placeholder} />
  ),
}));

import {
  AddOrEditWebhook,
  Autopost,
} from '@gitroom/frontend/components/autopost/autopost';
import {
  buttonClassName,
  ButtonSize,
  ButtonVariant,
} from '@gitroom/react/form/button';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement = <Autopost />) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(element);
  });

  return host;
};

const classes = (element: Element) => element.className.split(' ');
const look = (variant: ButtonVariant, size: ButtonSize) =>
  buttonClassName({ variant, size }).split(' ');
const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (element) => element.textContent === text
  )!;

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("an Auto Post feed's URL", () => {
  const url = `https://feeds.example.org/${'a'.repeat(120)}/`;

  it('cuts at its end, reading left to right in Arabic too', async () => {
    swrData = [{ id: 'feed-1', title: 'News', url, active: true }];
    const host = await render();

    // A truncating block cuts at its inline end, so the block itself has to be
    // left to right for the ellipsis to land after the URL, not before it.
    const block = host.querySelector(`[title="${url}"]`)!;
    expect(block.textContent).toBe(url);
    expect(block.getAttribute('dir')).toBe('ltr');
    expect(block.className.split(' ')).toContain('truncate');
  });
});

describe("an Auto Post row's buttons", () => {
  it('draw Edit as a small secondary button and Delete as a small red-text one, neither filled red', async () => {
    swrData = [
      {
        id: 'feed-1',
        title: 'News',
        url: 'https://feeds.example.org/',
        active: true,
      },
    ];
    const host = await render();

    // An action on every row is never primary, and a row's Delete is red
    // text with no fill (FR-027, FR-028, FR-029).
    const edit = button(host, 'Edit');
    const remove = button(host, 'Delete');
    expect(classes(edit)).toEqual(
      expect.arrayContaining(look('secondary', 'small'))
    );
    expect(classes(remove)).toEqual(
      expect.arrayContaining(look('dangerGhost', 'small'))
    );
    expect(classes(edit)).not.toContain('bg-error');
    expect(classes(remove)).not.toContain('bg-error');
  });
});

describe("Auto Post's form", () => {
  // A window's action row is one height: its buttons are large (spec 060
  // FR-026).
  it('draws Send Test as a large secondary button, as Webhooks does', async () => {
    swrData = undefined;
    const host = await render(<AddOrEditWebhook reload={jest.fn()} />);

    expect(classes(button(host, 'Send Test'))).toEqual(
      expect.arrayContaining(look('secondary', 'large'))
    );
  });

  // Save shows once the feed's address is checked, as on a saved feed.
  it('draws Save as a large button', async () => {
    swrData = undefined;
    const host = await render(
      <AddOrEditWebhook
        reload={jest.fn()}
        data={{
          id: 'feed-1',
          title: 'News',
          url: 'https://feeds.example.org/',
          syncLast: true,
          integrations: '[]',
        }}
      />
    );

    expect(classes(button(host, 'Save'))).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]'])
    );
  });
});

describe("Auto Post's panel", () => {
  it('holds its rows in a card with 12px corners and a 1px line, under a 20px semibold heading', async () => {
    swrData = [
      {
        id: 'feed-1',
        title: 'News',
        url: 'https://feeds.example.org/',
        active: true,
      },
    ];
    const host = await render();

    // FR-035: a Settings card has the dashboard's 12px corners, a panel's
    // heading is 20px semibold; its content sits 20px in, 16px at 1025px and
    // below (spec 060 FR-022).
    const card = host.querySelector('.bg-sixth')!;
    expect(classes(card)).toEqual(
      expect.arrayContaining([
        'rounded-[12px]',
        'border',
        'border-fifth',
        'p-[20px]',
        'mobile:p-[16px]',
      ])
    );
    expect(classes(card)).not.toContain('rounded-[4px]');
    expect(classes(card)).not.toContain('p-[24px]');
    expect(classes(host.querySelector('h3')!)).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
  });
});
