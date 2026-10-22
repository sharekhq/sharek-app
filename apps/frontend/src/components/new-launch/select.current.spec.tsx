import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's channel tabs. A post that already exists opens on its own
// channels, each with its own content: there is no global mode to go back to,
// and a channel can't be taken off it from here. A new post keeps both.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: async () => false }),
  useModals: () => ({}),
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  GlobalIcon: () => <i data-global />,
}));

let existing: Record<string, unknown> = {};
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);

import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

type Store = ReturnType<typeof useLaunchStore.getState>;

// The tab row watches its own width to know when it scrolls. Nothing scrolls
// here, and the DOM this suite installs has no observers.
class NoObserver {
  observe(): void {}
  disconnect(): void {}
}
Object.assign(global, {
  ResizeObserver: NoObserver,
  MutationObserver: NoObserver,
});

const integration = {
  id: 'int-1',
  identifier: 'instagram',
  name: 'Sharek Café',
  picture: '',
};

// The store is one for the page: tabs left open by an earlier case would
// answer the next case's reset with their own effects.
const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      selectedIntegrations: [
        { integration, settings: {} },
      ] as unknown as Store['selectedIntegrations'],
      // its content no longer follows the global editor, which the tab marks
      internal: [
        { integration, integrationValue: [] },
      ] as unknown as Store['internal'],
    });
    root.render(<SelectCurrent />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// the dot is the one element whose own text is the X
const removeDots = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).filter(
    (node) => node.childElementCount === 0 && node.textContent === 'X'
  );

const notGlobalMark = (host: HTMLElement) =>
  host.querySelector('[data-tooltip-content="No longer in global mode"]');

describe('the channel tabs of a post that already exists', () => {
  beforeEach(() => {
    existing = { integration: 'int-1', posts: [] };
  });

  it('offers no global mode', async () => {
    expect((await render()).querySelector('[data-global]')).toBeNull();
  });

  it('offers no way to take a channel off, and no mark for leaving the global mode', async () => {
    const host = await render();

    expect(removeDots(host)).toHaveLength(0);
    expect(notGlobalMark(host)).toBeNull();
  });

  it('still switches between the channels', async () => {
    const host = await render();

    await click(host.querySelector('[data-tooltip-content="Sharek Café"]')!);

    expect(useLaunchStore.getState().current).toBe('int-1');
  });
});

describe('the channel tabs of a new post', () => {
  beforeEach(() => {
    existing = {};
  });

  it('offer the global mode, a way to take a channel off and the mark', async () => {
    const host = await render();

    expect(host.querySelector('[data-global]')).toBeTruthy();
    expect(removeDots(host)).toHaveLength(1);
    expect(notGlobalMark(host)).toBeTruthy();
  });
});
