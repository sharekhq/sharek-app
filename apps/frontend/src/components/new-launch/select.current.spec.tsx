import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's channel tabs. A post that already exists opens on its own
// channels, each with its own content: there is no global mode to go back to,
// and a channel can't be taken off it from here. A new post keeps both.
// The interface's words; empty = the English fallbacks.
let words: Record<string, string> = {};
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => words[key] ?? fallback ?? key,
}));
// What the remove dot asks, and the answer: keep the channel.
const asked: Array<{ title: string; description: string }> = [];
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({
    open: async (question: { title: string; description: string }) => {
      asked.push(question);
      return false;
    },
  }),
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
  words = {};
  asked.length = 0;
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

// At 1025px and below the tabs sit in one row with the + button (spec 044,
// US2): 44px each on every pointer there, and a channel comes off in the +
// sheet, not through the small dot.
describe('the channel tabs at 1025px and below', () => {
  beforeEach(() => {
    existing = {};
  });

  const tabs = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('[data-global]'))
      .map((icon) => icon.closest('.cursor-pointer')!)
      .concat(
        Array.from(
          host.querySelectorAll('[data-tooltip-content="Sharek Café"]')
        ).map((node) => node.parentElement!)
      );

  it('are 44px on every pointer there, and on a coarse pointer at every width', async () => {
    const host = await render();

    expect(tabs(host)).toHaveLength(2);
    tabs(host).forEach((tab) => {
      expect(tab.className.split(' ')).toEqual(
        expect.arrayContaining([
          'mobile:w-[44px]',
          'mobile:h-[44px]',
          'coarse:w-[44px]',
          'coarse:h-[44px]',
        ])
      );
    });
  });

  it('hide the remove dot', async () => {
    const [dot] = removeDots(await render());

    expect(dot.className.split(' ')).toContain('mobile:hidden');
  });

  it('still ask, in the interface language, before the dot takes a channel off', async () => {
    words = {
      remove_social_account: 'إزالة الحساب',
      are_you_sure_you_want_to_remove_this_social_from_scheduling:
        'هل تريد إزالة هذا الحساب من الجدولة؟',
    };
    const [dot] = removeDots(await render());

    await click(dot);

    expect(asked).toEqual([
      {
        title: 'إزالة الحساب',
        description: 'هل تريد إزالة هذا الحساب من الجدولة؟',
      },
    ]);
  });
});
