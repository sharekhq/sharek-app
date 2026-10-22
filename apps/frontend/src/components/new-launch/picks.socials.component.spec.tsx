import { act } from 'react';
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

import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
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

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: channels as unknown as Store['integrations'],
      selectedIntegrations: [
        { integration: channels[0], settings: {} },
      ] as unknown as Store['selectedIntegrations'],
    });
    createRoot(host).render(<PicksSocialsComponent toolTip={true} />);
  });
  return host;
};

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
