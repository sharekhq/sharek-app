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
// The editor, reading the composer's tabs as its AI buttons do.
const mockEditor = { tabs: undefined as unknown };
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => {
    const {
      useComposerTabs,
    } = require('@gitroom/frontend/components/new-launch/composer.tabs');
    mockEditor.tabs = useComposerTabs();
    return null;
  },
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
// The AI tools the composer's tabs host, as in composer.stage.spec.tsx: the
// catalog's real tools bring the media library and its ESM-only uploader.
jest.mock('@gitroom/frontend/components/studio/studio.tools', () => ({
  AI_IMAGE_TOOL: 'ai-image',
  useComposerCatalog: () => ({
    catalog: {
      listings: [
        {
          state: 'entitled',
          entry: {
            id: 'ai-image',
            post: { kind: 'image', panel: () => <div data-tool="image" /> },
          },
        },
      ],
    },
    loading: false,
  }),
}));
jest.mock('@gitroom/frontend/components/studio/tool.switcher', () => ({
  ToolSwitcher: () => null,
}));
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
// The Assistant, recording the props the composer gives it.
let assistant: { className?: string } = {};
jest.mock('@copilotkit/react-ui', () => ({
  CopilotPopup: (props: { className?: string }) => {
    assistant = props;
    return null;
  },
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({ DummyCodeComponent: () => null })
);
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({
    CreationMethodBadge: () => null,
  })
);
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
import type { ComposerTabs } from '@gitroom/frontend/components/new-launch/composer.tabs';

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

const render = async (props: Record<string, unknown> = {}) => {
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
    root.render(<ManageModal {...(props as any)} />);
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

// With a channel's Settings open the editor pane is hidden, and the channel
// row (the picks and the tabs, Global among them) stays in the column so the
// settings of another channel, or Global, are one click away (FR-007).
describe('a channel’s Settings', () => {
  const hiddenWithin = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (node.classList.contains('hidden')) {
        return true;
      }
    }
    return false;
  };

  const openSettings = async () => {
    existing = {};
    const host = await render();
    await act(async () => {
      useLaunchStore.setState({ current: 'int-1' });
    });
    await act(async () => {
      (host.querySelector('.cursor-pointer') as HTMLElement).click();
    });
    return host;
  };

  it('with a channel’s Settings open the channel row is still rendered and switching works', async () => {
    const host = await openSettings();

    expect(
      host.querySelector('#social-content')!.parentElement!.classList
    ).toContain('hidden');
    expect(hiddenWithin(host.querySelector('[data-picks]')!)).toBe(false);
  });

  it('Back to global stays reachable', async () => {
    const host = await openSettings();

    expect(hiddenWithin(host.querySelector('[data-current]')!)).toBe(false);
  });
});

// The compose window takes the Studio page card's 12px corners on a wide
// screen (spec 061), and still fills a phone's screen edge to edge with none.
describe('the compose card', () => {
  it('rounds its corners at 12px, and drops them on a phone', async () => {
    existing = {};
    const card = (await render()).querySelector('.bg-newBgColorInner')!;
    const classes = (card.getAttribute('class') ?? '').split(/\s+/);

    expect(classes).toEqual(
      expect.arrayContaining(['rounded-[12px]', 'mobile:rounded-none'])
    );
    expect(classes).not.toContain('rounded-[24px]');
  });

  // On a phone the card's sticky header (back, a 430px date button, Post)
  // set its min-content to 608px and, as a flex item with min-width:auto,
  // the card grew past a 390px screen, pushing Post, Settings and the
  // preview cards off it (spec 062 walk, FR-019)
  it('can shrink below its content so nothing is wider than a phone', async () => {
    existing = {};
    const card = (await render()).querySelector('.bg-newBgColorInner')!;

    expect((card.getAttribute('class') ?? '').split(/\s+/)).toContain(
      'min-w-0'
    );
  });
});

// The composer sits in the shell's insets as a Studio page's card does, and
// the extension's composer, with no shell around it, keeps its 40px margins
// (spec 061, FR-019); its right column is the tab strip with Post preview
// and the AI tabs (FR-021).
describe('the composer frame', () => {
  const classesOf = (element: Element) =>
    (element.getAttribute('class') ?? '').split(/\s+/);

  beforeEach(() => {
    existing = {};
  });

  it('the root adds no inset of its own on desktop (the window wrapper owns it)', async () => {
    const classes = classesOf((await render()).firstElementChild!);

    expect(classes).toContain('mobile:p-0');
    ['py-[12px]', 'pe-[12px]', 'ps-[100px]', 'p-[40px]'].forEach((inset) =>
      expect(classes).not.toContain(inset)
    );
  });

  it('keeps props.padding for the extension path', async () => {
    const classes = classesOf(
      (await render({ padding: 'p-[40px]' })).firstElementChild!
    );

    expect(classes).toEqual(expect.arrayContaining(['p-[40px]', 'mobile:p-0']));
    ['py-[12px]', 'pe-[12px]', 'ps-[100px]'].forEach((inset) =>
      expect(classes).not.toContain(inset)
    );
  });

  it('the preview column is 45% between 440 and 680px', async () => {
    const host = await render();
    const column = Array.from(host.querySelectorAll('div')).find((each) =>
      classesOf(each).includes('[@media(min-width:1026px)]:w-[45%]')
    )!;

    expect(classesOf(column)).toEqual(
      expect.arrayContaining([
        '[@media(min-width:1026px)]:min-w-[440px]',
        '[@media(min-width:1026px)]:max-w-[680px]',
        'mobile:!w-full',
        'mobile:flex-1',
      ])
    );
    expect(host.innerHTML).not.toContain('w-[580px]');
  });

  it('the left pane can shrink', async () => {
    const host = await render();
    const pane = Array.from(host.querySelectorAll('div')).find(
      (each) =>
        classesOf(each).includes('border-newBorder') &&
        classesOf(each).includes('border-e') &&
        classesOf(each).includes('flex-1')
    )!;

    expect(classesOf(pane)).toContain('min-w-0');
  });

  it('rounds the left header’s start corners at 12px', async () => {
    const host = await render();
    const header = Array.from(host.querySelectorAll('.bg-newBgColor')).find(
      (each) => each.textContent?.includes('Create Post')
    )!;

    expect(classesOf(header)).toContain('rounded-s-[12px]');
    expect(host.innerHTML).not.toContain('rounded-s-[20px]');
  });

  it('holds the composer’s tabs, Post preview first, and its close in the right column', async () => {
    const host = await render();
    const column = Array.from(host.querySelectorAll('div')).find((each) =>
      classesOf(each).includes('[@media(min-width:1026px)]:w-[45%]')
    )!;
    const tablist = column.querySelector('[role="tablist"]');

    expect(tablist).toBeTruthy();
    expect(
      Array.from(tablist!.querySelectorAll('[role="tab"]')).map(
        (tab) => tab.textContent
      )
    ).toEqual(['Post preview']);
    expect(column.querySelector('button[aria-label="Close"]')).toBeTruthy();
  });

  it('gives the editor the composer’s tabs', async () => {
    mockEditor.tabs = undefined;
    await render();

    expect(mockEditor.tabs).toEqual(
      expect.objectContaining({ active: 'preview', open: expect.any(Function) })
    );
  });
});

// Inside the composer the Assistant sits above the bottom bar on a wide
// screen, as far above it as CopilotKit's own 16px from the screen's foot: the
// bar is 84px tall and 12px from the foot in the shell's insets (spec 061,
// FR-020). At 1025px and below it keeps its lift clear of the pinned tool bar.
describe('the assistant', () => {
  it('sits above the bottom bar on a wide screen only', async () => {
    existing = {};
    assistant = {};
    await render();

    expect(
      (assistant.className ?? '')
        .split(/\s+/)
        .filter((each) => each.includes('bottom-'))
    ).toEqual([
      'mobile:!bottom-[112px]',
      '[@media(min-width:1026px)]:!bottom-[112px]',
    ]);
  });

  // An AI tab's own bar sits under the raised Assistant, which would cover the
  // end of its main button, so the Assistant leaves while an AI tab is on
  // screen, at every width (spec 061, walk fix F-1b).
  const classes = () => (assistant.className ?? '').split(/\s+/);
  const tabs = () => mockEditor.tabs as ComposerTabs;

  it('is hidden at every width while the AI tab is on screen', async () => {
    existing = {};
    assistant = {};
    await render();

    expect(classes()).not.toContain('hidden');

    await act(async () => {
      tabs().open(() => undefined, 0, undefined, ['image', 'video']);
    });

    expect(classes()).toContain('hidden');

    await act(async () => {
      tabs().select('preview');
    });
    await act(async () => {
      tabs().open(() => undefined, 0, undefined, ['image', 'video']);
    });

    expect(classes()).toContain('hidden');
  });

  it('is back above the bottom bar once Post preview is on screen', async () => {
    existing = {};
    assistant = {};
    const host = await render();
    await act(async () => {
      tabs().open(() => undefined, 0, undefined, ['image', 'video']);
    });
    const preview = Array.from(host.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === 'Post preview'
    ) as HTMLElement;

    await act(async () => {
      preview.click();
    });

    expect(classes()).not.toContain('hidden');
    expect(classes().filter((each) => each.includes('bottom-'))).toEqual([
      'mobile:!bottom-[112px]',
      '[@media(min-width:1026px)]:!bottom-[112px]',
    ]);
  });
});

// On a wide screen the preview column draws each post at a phone's 420px,
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

  it('draws the preview at 420px inside the scroll box', async () => {
    const host = await render();
    const content = host.querySelector('[data-show-all]')!
      .parentElement as HTMLElement;
    const room = content.parentElement!.parentElement as HTMLElement;
    Object.defineProperty(room, 'clientHeight', {
      configurable: true,
      get: () => 631,
    });
    await measure();

    expect(content.style.width).toBe('420px');
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
