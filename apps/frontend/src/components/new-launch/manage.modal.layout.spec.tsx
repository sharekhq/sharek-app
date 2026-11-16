import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Compose's narrow-layout DOM facts — the ones manage.modal.narrow.spec.tsx
// deliberately does not cover, because they are class lists rather than store
// state and no amount of store testing can see them.
//
// The stub set below is the one manage.modal.validation.spec.tsx established:
// none of them is asserted on, they exist so the modal can mount. That spec's
// note applies here too — these questions have no seam other than the rendered
// modal, because what changed is a class on a wrapper.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => <div data-picks /> })
);
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => <div data-current />,
}));
// The preview, recording the ref the composer hands it on every render and
// counting its mounts.
const shown = { refs: [] as unknown[], mounts: 0 };
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useEffect, useImperativeHandle } = require('react');
    return {
      Providers: [],
      ShowAllProviders: forwardRef((_props: any, ref: any) => {
        shown.refs.push(ref);
        useEffect(() => {
          shown.mounts += 1;
        }, []);
        useImperativeHandle(ref, () => ({
          getAllValues: async (): Promise<unknown[]> => [],
        }));
        return <div data-show-all />;
      }),
    };
  }
);
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: () => <div data-date />,
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: () => null,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => undefined, openModal: () => undefined }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/platform-label',
  () => ({
    ...jest.requireActual(
      '@gitroom/frontend/components/launches/helpers/platform-label'
    ),
    platformLabel: (identifier: string) => identifier,
  })
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => <div data-customer />,
}));
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({ DummyCodeComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/creation.method.badge', () => ({
  CreationMethodBadge: () => null,
}));
// The settings sheet reads the providers' settings through their module,
// which brings the channel previews; scenery, as in
// high.order.provider.spec.tsx.
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  SettingsIcon: () => null,
  ChevronDownIcon: () => null,
  CloseIcon: () => null,
  TrashIcon: () => null,
  DropdownArrowSmallIcon: () => null,
  // the top bar and the preview button at 1025px and below
  ChevronLeftIcon: () => null,
  DropdownArrowIcon: () => null,
  EyeIcon: () => null,
  PlusIcon: () => null,
  SettingsOutlineIcon: () => null,
  TagIcon: () => null,
  RepeatIcon: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: undefined }) })
);

// Set per test: a post that already exists carries an integration.
let existing: Record<string, unknown> = {};
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);

import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

// The preview column's fit measures the column; a case reports its height as
// the browser would.
const observers: Array<() => void> = [];
Object.assign(global, {
  ResizeObserver: class {
    constructor(callback: () => void) {
      observers.push(callback);
    }
    observe() {}
    disconnect() {}
  },
});
const measure = async () => {
  await act(async () => {
    observers.forEach((callback) => callback());
  });
};

const integration = {
  id: 'int-1',
  identifier: 'youtube',
  name: 'A channel',
} as any;

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  observers.length = 0;
});

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: [integration],
      selectedIntegrations: [{ integration, settings: {} }] as any,
    });
    root.render(<ManageModal {...({} as any)} />);
  });
  return host;
};

// A post that already exists keeps the channels and the customer it was saved
// with. Its channel tabs only show when it was saved for several channels,
// where they switch between each channel's own post.
describe('an existing post', () => {
  const saved = { integration: 'int-1', posts: [{ state: 'QUEUE' }] };

  it('offers the customer control for a new post only', async () => {
    existing = {};
    expect((await render()).querySelector('[data-customer]')).toBeTruthy();

    existing = saved;
    expect((await render()).querySelector('[data-customer]')).toBeNull();
  });

  it('shows the channel tabs for a new post', async () => {
    existing = {};

    expect((await render()).querySelector('[data-current]')).toBeTruthy();
  });

  it('shows the channel tabs for a post saved with other channels', async () => {
    existing = {
      ...saved,
      siblings: [{ integration: 'int-2', posts: [{ state: 'QUEUE' }] }],
    };

    expect((await render()).querySelector('[data-current]')).toBeTruthy();
  });

  it('shows no channel tabs for a post saved alone', async () => {
    existing = saved;

    expect((await render()).querySelector('[data-current]')).toBeNull();
  });
});

// The compose window shares the window shell's 24px corners on a wide screen,
// and still fills a phone's screen edge to edge with none.
describe('the compose card', () => {
  it('rounds its corners at 24px, and drops them on a phone', async () => {
    existing = {};
    const card = (await render()).querySelector('.bg-newBgColorInner')!;
    const classes = (card.getAttribute('class') ?? '').split(/\s+/);

    expect(classes).toEqual(
      expect.arrayContaining(['rounded-[24px]', 'mobile:rounded-none'])
    );
    expect(classes).not.toContain('rounded-[20px]');
  });
});

// On a wide screen the preview column draws each post at a phone's 360px,
// scaled to the column inside its scroll box (FR-028), and the composer's
// ref still reaches the preview itself, which mounts once (FR-032).
describe('the preview column', () => {
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    existing = {};
    shown.refs.length = 0;
    shown.mounts = 0;
    // wider than 1025px
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (): void => undefined,
      removeEventListener: (): void => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  it('draws the preview at 360px inside the scroll box', async () => {
    const host = await render();
    const content = host.querySelector('[data-show-all]')!
      .parentElement as HTMLElement;
    const room = content.parentElement!.parentElement as HTMLElement;
    Object.defineProperty(room, 'clientHeight', {
      configurable: true,
      get: () => 631,
    });
    await measure();

    expect(content.style.width).toBe('360px');
    expect(room.parentElement!.classList.contains('overflow-y-auto')).toBe(
      true
    );
  });

  it('hands the composer’s ref to the preview, which mounts once', async () => {
    await render();
    const [ref] = shown.refs;
    expect(ref).toHaveProperty('current.getAllValues');

    await measure();
    // a new tags list renders the composer again
    await act(async () => {
      useLaunchStore.setState({ tags: [] });
    });

    expect(shown.refs.length).toBeGreaterThan(1);
    shown.refs.forEach((each) => expect(each).toBe(ref));
    expect(shown.mounts).toBe(1);
  });
});
