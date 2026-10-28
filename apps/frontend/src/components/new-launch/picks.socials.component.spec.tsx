import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's channel picker. A post that already exists shows the
// channels it was saved with, even one disabled since, and keeps them: a
// click does not add or remove one. A new post offers the channels that can
// publish.
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));

let existing: Record<string, unknown> = {};
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);

import {
  IntegrationListRow,
  PicksSocialsComponent,
} from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

type Store = ReturnType<typeof useLaunchStore.getState>;

const channel = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  identifier: 'instagram',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
  ...over,
});

const channels = [
  channel('int-1', 'Sharek Café'),
  channel('int-2', 'Sharek Café (LinkedIn)', { disabled: true }),
  channel('int-3', 'Sharek on X', { inBetweenSteps: true }),
  channel('int-4', 'Sharek Café (Facebook)'),
];

// The store is one for the page: a picker left open by an earlier case would
// answer the next case's reset with its own effects.
const mounted: Array<{ unmount: () => void }> = [];

const render = async (
  element: ReactElement = <PicksSocialsComponent toolTip={true} />,
  store: Partial<Store> = {}
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: channels as unknown as Store['integrations'],
      selectedIntegrations: [
        { integration: channels[0], settings: {} },
      ] as unknown as Store['selectedIntegrations'],
      ...store,
    });
    root.render(element);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const shown = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[data-tooltip-content]')).map((node) =>
    node.getAttribute('data-tooltip-content')
  );

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('the channel picker of a post that already exists', () => {
  beforeEach(() => {
    existing = { integration: 'int-1', siblings: [{ integration: 'int-2' }] };
  });

  it('shows exactly the channels it was saved with, a disabled one included', async () => {
    expect(shown(await render())).toEqual([
      'Sharek Café',
      'Sharek Café (LinkedIn)',
    ]);
  });

  it('keeps them when one is clicked', async () => {
    const host = await render();

    await click(
      host.querySelector('[data-tooltip-content="Sharek Café"]')!.firstElementChild!
    );

    expect(
      useLaunchStore.getState().selectedIntegrations.map((p) => p.integration.id)
    ).toEqual(['int-1']);
  });
});

describe('the channel picker of a new post', () => {
  beforeEach(() => {
    existing = {};
  });

  it('offers the channels that can publish', async () => {
    expect(shown(await render())).toEqual([
      'Sharek Café',
      'Sharek Café (Facebook)',
    ]);
  });
});

// The list the + sheet shows at 1025px and below (spec 044, US2): one row per
// channel, with its picture, its name and a checkbox.
describe('the channel list', () => {
  const list = (store: Partial<Store> = {}) =>
    render(<PicksSocialsComponent list={true} />, store);
  const rows = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'));
  const picked = () =>
    useLaunchStore.getState().selectedIntegrations.map((p) => p.integration.id);

  beforeEach(() => {
    existing = {};
  });

  it('names each channel that can publish, on a checkbox that says whether it is picked', async () => {
    const host = await list();

    expect(rows(host).map((row) => row.textContent)).toEqual([
      'Sharek Café',
      'Sharek Café (Facebook)',
    ]);
    expect(rows(host).map((row) => row.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
    ]);
  });

  it('draws each row as a 44px button with a focus ring', async () => {
    const host = await list();

    expect(rows(host)).toHaveLength(2);
    rows(host).forEach((row) => {
      expect(row.tagName).toBe('BUTTON');
      expect(row.getAttribute('type')).toBe('button');
      expect(row.className.split(' ')).toEqual(
        expect.arrayContaining([
          'min-h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it('adds a channel on a tap, and takes it off on another', async () => {
    const host = await list();

    await click(rows(host)[1]);
    expect(picked()).toEqual(['int-1', 'int-4']);

    await click(rows(host)[1]);
    expect(picked()).toEqual(['int-1']);
  });

  it('shows a post that already exists its own channels only, and keeps them', async () => {
    existing = { integration: 'int-1', siblings: [{ integration: 'int-2' }] };
    const host = await list();

    expect(rows(host).map((row) => row.textContent)).toEqual([
      'Sharek Café',
      'Sharek Café (LinkedIn)',
    ]);
    await click(rows(host)[1]);

    expect(picked()).toEqual(['int-1']);
  });

  it('is inert while the composer is locked', async () => {
    const host = await list({ locked: true });

    expect(rows(host)).toHaveLength(2);
    rows(host).forEach((row) => expect(row.disabled).toBe(true));
    await click(rows(host)[1]);

    expect(picked()).toEqual(['int-1']);
  });
});

// The calendar's channel sheet (spec 046) reuses the row on its own.
describe('a channel row on its own', () => {
  it('renders from the channel, whether it is picked and what a tap does', async () => {
    const onClick = jest.fn();
    const host = await render(
      <IntegrationListRow
        integration={channels[0] as unknown as Store['integrations'][number]}
        selected={false}
        onClick={onClick}
      />
    );
    const row = host.querySelector('[role="checkbox"]')!;

    expect(row.getAttribute('aria-checked')).toBe('false');
    expect(row.textContent).toBe('Sharek Café');
    await click(row);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
