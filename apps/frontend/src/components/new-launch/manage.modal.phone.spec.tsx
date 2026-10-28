// The composer at 1025px and below (spec 044): upstream's phone layout in
// Sharek's skin. One top bar with back, the date and a Post button whose menu
// runs the same saves as the desktop buttons; an eye that swaps the editor for
// the preview; the assistant lifted clear of the pinned tool bar.
//
// The harness is manage.modal.channels.spec.tsx's: fetch records every
// request and answers POST /posts, the translations are a real i18next
// instance with no resources (t hands back the English default), and the
// composer's heavy children are scenery. The top bar, the icons and the sheets
// are the real ones.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import dayjs from 'dayjs';
import type { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import type { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';

type Existing = ReturnType<typeof useExistingData>;
interface Save {
  type: string;
  posts: Array<{ integration: { id: string } }>;
}
interface Check {
  id: string;
  identifier: string;
  name: string;
  valid: boolean;
  errors: true | string;
}

const requests: Array<{ url: string; method: string; body?: Save }> = [];
let postsValid: Check[] = [];
let existing = {} as Existing;
let inPost: string[] = [];
let assistant: { className?: string } = {};
// The channels whose provider has settings of its own, as the providers'
// registry reports them.
const mockProviders: Array<{ identifier: string; component: unknown }> = [];
// What the date sheet's panel was handed last.
let mockPanel: {
  date: dayjs.Dayjs;
  onChange: (date: dayjs.Dayjs) => void;
  sheet?: boolean;
} = { date: dayjs(), onChange: () => undefined };

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch:
    () =>
    async (url: string, init: RequestInit = {}) => {
      const method = init.method || 'GET';
      requests.push({
        url,
        method,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      if (url === '/posts/valid') {
        return new Response(JSON.stringify(postsValid));
      }
      return new Response('{}');
    },
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: () => undefined,
    closeById: () => undefined,
    closeAll: () => undefined,
  }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => true,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useImperativeHandle } =
      jest.requireActual<typeof import('react')>('react');
    return {
      Providers: mockProviders,
      ShowAllProviders: forwardRef((_props, ref) => {
        useImperativeHandle(ref, () => ({
          getAllValues: async () =>
            inPost.map((id) => ({
              id,
              settings: {},
              values: [{ id: `v-${id}`, content: `<p>${id}</p>`, media: [] }],
            })),
        }));
        return null;
      }),
    };
  }
);
// Scenery, as in manage.modal.channels.spec.tsx. The channel picker is the
// real one, for the + sheet's list; its pictures are scenery.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => <div data-editor="" />,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => null,
}));
// The real date trigger (the top bar's is a button of its own); the sheet's
// panel stands in, keeping what it was handed.
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  ...jest.requireActual(
    '@gitroom/frontend/components/launches/helpers/date.picker'
  ),
  DatePickerPanel: (props: typeof mockPanel) => {
    mockPanel = props;
    return <i data-panel="" />;
  },
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: (props: { list?: boolean }) => (
    <button type="button" data-repeat={props.list ? 'list' : 'dropdown'} />
  ),
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: (props: { list?: boolean }) => (
    <button type="button" data-tags={props.list ? 'list' : 'dropdown'} />
  ),
  Check: () => null,
}));
// The providers' module brings the channel previews; scenery, as in
// high.order.provider.spec.tsx.
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/platform-label',
  () => ({ platformLabel: (identifier: string) => identifier })
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => <i data-customer="" />,
}));
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
  () => ({ CreationMethodBadge: () => <i data-badge="" /> })
);
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: { shortlink: 'NO' } }) })
);

import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

type LaunchState = ReturnType<typeof useLaunchStore.getState>;

const instagram = { id: 'int-1', identifier: 'instagram', name: 'Acme Inc.' };
const tiktok = { id: 'int-2', identifier: 'tiktok', name: 'Tom & Jerry' };
const linkedin = { id: 'int-3', identifier: 'linkedin', name: 'مطعم الريف' };

const en = createInstance();
const mounted: Array<{ unmount: () => void }> = [];

beforeAll(async () => {
  await en.init({ lng: 'en', resources: { en: { translation: {} } } });
});

// The window, as the media query reports it: 1025px or narrower unless a case
// grows it, telling the listeners as a browser does.
const realMatchMedia = window.matchMedia;
// The date line reads the 12- or 24-hour setting from here.
globalThis.localStorage = window.localStorage;
let smallWindow = true;
const mediaListeners = new Set<() => void>();
const resize = async (small: boolean) => {
  smallWindow = small;
  await act(async () => {
    mediaListeners.forEach((listener) => listener());
  });
};

beforeEach(() => {
  smallWindow = true;
  mediaListeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  requests.length = 0;
  assistant = {};
  mockProviders.length = 0;
  existing = {} as Existing;
  postsValid = [instagram, tiktok].map((p) => ({
    ...p,
    valid: true,
    errors: true,
  }));
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
});

// A new post for Acme and Tom & Jerry, tomorrow.
const open = async (props: Partial<AddEditModalProps> = {}) => {
  inPost = ['int-1', 'int-2'];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: [
        instagram,
        tiktok,
        linkedin,
      ] as unknown as LaunchState['integrations'],
      selectedIntegrations: [instagram, tiktok].map((integration) => ({
        integration,
        settings: {},
        ref: { current: { fix: jest.fn(), preview: jest.fn() } },
      })) as unknown as LaunchState['selectedIntegrations'],
      current: 'global',
      date: dayjs().add(1, 'day'),
    });
    root.render(
      <I18nextProvider i18n={en}>
        <ManageModal
          {...({ mutate: jest.fn(), ...props } as unknown as AddEditModalProps)}
        />
      </I18nextProvider>
    );
  });
  return host;
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const press = async (button: Element | undefined | null) => {
  expect(button).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
};

const byText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find(
    (button) => (button.textContent || '').trim() === text
  );

// The top bar's Post button, and the menu it opens beside it.
const postButton = (host: HTMLElement) => byText(host, 'Post')!;
const menu = (host: HTMLElement) => postButton(host).parentElement!;

const saves = () =>
  requests
    .filter((r) => r.url === '/posts' && r.method === 'POST')
    .map((r) => r.body!.type);

describe('the Post menu', () => {
  it('opens on a tap, holding Add to calendar, Post Now and Save as Draft', async () => {
    const host = await open();

    await press(postButton(host));

    expect(
      Array.from(menu(host).querySelectorAll('button'))
        .slice(1)
        .map((button) => button.textContent)
    ).toEqual(['Add to calendar', 'Post Now', 'Save as Draft']);
  });

  it.each([
    ['Add to calendar', 'schedule'],
    ['Post Now', 'now'],
    ['Save as Draft', 'draft'],
  ])('"%s" saves the post as %s', async (label, type) => {
    const host = await open();

    await press(postButton(host));
    await press(byText(menu(host), label));

    expect(saves()).toEqual([type]);
  });

  // FR-004: a tooltip cannot be read on touch, so the menu says why.
  it('disables Add to calendar and Post Now for a blocked channel, keeps Save as Draft, and says why', async () => {
    const host = await open();
    await act(async () => {
      useLaunchStore
        .getState()
        .setPublishBlocker(
          'int-2',
          'TikTok (Tom & Jerry): pick who can see it'
        );
    });

    await press(postButton(host));

    expect(byText(menu(host), 'Add to calendar')!.disabled).toBe(true);
    expect(byText(menu(host), 'Post Now')!.disabled).toBe(true);
    expect(byText(menu(host), 'Save as Draft')!.disabled).toBe(false);
    expect(menu(host).textContent).toContain(
      'TikTok (Tom & Jerry): pick who can see it'
    );
  });

  it('is a single Save Set when adding to a set', async () => {
    const addEditSets = jest.fn();
    const host = await open({ addEditSets });

    const saveSet = byText(host.querySelector('.sticky')!, 'Save Set')!;
    expect(saveSet.hasAttribute('aria-haspopup')).toBe(false);
    await press(saveSet);

    expect(addEditSets).toHaveBeenCalledTimes(1);
    expect(addEditSets.mock.calls[0][0].type).toBe('draft');
  });

  it('offers no Post Now when the composer only builds an output', async () => {
    const host = await open({ dummy: true });

    await press(postButton(host));

    expect(byText(menu(host), 'Create output')).toBeTruthy();
    expect(byText(menu(host), 'Post Now')).toBeUndefined();
  });
});

describe('the preview', () => {
  it('swaps the editor for the preview and back, saying which shows', async () => {
    const host = await open();
    const eye = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Preview"]'
    )!;
    const editorColumn = () =>
      host.querySelector('[data-editor]')!.parentElement!;

    expect(eye.getAttribute('aria-pressed')).toBe('false');
    expect(editorColumn().className).not.toContain('mobile:hidden');

    await press(eye);

    expect(eye.getAttribute('aria-pressed')).toBe('true');
    expect(editorColumn().className).toContain('mobile:hidden');
    // pressed on the selected tile, never the rose brandText
    expect(eye.className.split(' ')).toEqual(
      expect.arrayContaining(['bg-selectedBg', 'text-selectedText'])
    );

    await press(eye);

    expect(eye.getAttribute('aria-pressed')).toBe('false');
  });

  it('is a named 44px button with a focus ring', async () => {
    const host = await open();
    const eye = host.querySelector('button[aria-label="Preview"]')!;

    expect(eye.getAttribute('type')).toBe('button');
    expect(eye.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });
});

describe('the assistant', () => {
  it('sits clear of the pinned tool bar and of the Post menu', async () => {
    await open();

    expect(assistant.className).toBe('mobile:!z-[460] mobile:!bottom-[112px]');
  });
});

describe('the + sheet', () => {
  const plus = (host: HTMLElement) =>
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select Channels"]'
    );
  const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const rows = () =>
    Array.from(
      sheet()!.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')
    );
  const picked = () =>
    useLaunchStore.getState().selectedIntegrations.map((p) => p.integration.id);

  it('is a named 44px button beside the channel tabs that opens Select Channels', async () => {
    const host = await open();

    expect(plus(host)!.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'bg-btnSimple',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(sheet()).toBeNull();
    await press(plus(host));

    const title = sheet()!.getAttribute('aria-labelledby')!;
    expect(document.getElementById(title)!.textContent).toBe('Select Channels');
  });

  it('lists every channel that can publish, the picked ones checked', async () => {
    const host = await open();
    await press(plus(host));

    expect(rows().map((row) => row.textContent)).toEqual([
      'Acme Inc.',
      'Tom & Jerry',
      'مطعم الريف',
    ]);
    expect(rows().map((row) => row.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
    ]);
  });

  it('adds and takes off a channel on a tap', async () => {
    const host = await open();
    await press(plus(host));

    await press(rows()[2]);
    expect(picked()).toEqual(['int-1', 'int-2', 'int-3']);

    await press(rows()[0]);
    expect(picked()).toEqual(['int-2', 'int-3']);
  });

  it('keeps Done disabled while no channel is picked', async () => {
    const host = await open();
    await press(plus(host));

    expect(byText(sheet()!, 'Done')!.disabled).toBe(false);
    await press(rows()[0]);
    await press(rows()[1]);

    expect(byText(sheet()!, 'Done')!.disabled).toBe(true);
  });

  it('holds the customer selector, which the page no longer shows', async () => {
    const host = await open();

    expect(
      host.querySelector('[data-customer]')!.parentElement!.className
    ).toContain('mobile:hidden');
    await press(plus(host));

    expect(sheet()!.querySelector('[data-customer]')).toBeTruthy();
  });

  it('closes on Done', async () => {
    const host = await open();
    await press(plus(host));

    await press(byText(sheet()!, 'Done'));

    expect(sheet()).toBeNull();
  });

  it('replaces the circle grid of a new post', async () => {
    const host = await open();
    const grid =
      host.querySelector('[data-customer]')!.parentElement!.parentElement!;

    expect(grid.className.split(' ')).toContain('mobile:hidden');
  });
});

describe('a post that already exists', () => {
  const openExisting = async () => {
    existing = {
      integration: 'int-1',
      group: 'g-1',
      posts: [{ id: 'p-1', state: 'DRAFT' }],
    } as unknown as Existing;
    const host = await open();
    await act(async () => {
      useLaunchStore.setState({ current: 'int-1' });
    });
    return host;
  };

  it('has no + button, and keeps its circle row with the badge and the eye', async () => {
    const host = await openExisting();
    const row =
      host.querySelector('[data-badge]')!.parentElement!.parentElement!;

    expect(
      host.querySelector('button[aria-label="Select Channels"]')
    ).toBeNull();
    expect(row.className.split(' ')).not.toContain('mobile:hidden');
    expect(row.querySelector('button[aria-label="Preview"]')).toBeTruthy();
  });
});

// US3: the gear's Settings sheet, the tags, repeat and date sheets, and the
// channel settings pane, each closed by Escape without closing the post.
const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');
const sheetTitle = () =>
  document.getElementById(sheet()!.getAttribute('aria-labelledby')!)!
    .textContent;
const gear = (host: HTMLElement) =>
  host.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
// A row's or a button's text, with the isolation marks around a name taken out.
const label = (node: Element) =>
  (node.textContent || '').replace(/[⁨⁩]/g, '').trim();
const rowNamed = (text: string) =>
  Array.from(sheet()!.querySelectorAll('button')).find(
    (button) => label(button) === text
  );
const withSettings = (identifier: string) =>
  mockProviders.push({
    identifier,
    component: { __settings: { SettingsComponent: () => null } },
  });
const keydown = async (target: Element, key: string) => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true })
    );
  });
};
const openExistingPost = async (props: Partial<AddEditModalProps> = {}) => {
  existing = {
    integration: 'int-1',
    group: 'g-1',
    posts: [{ id: 'p-1', state: 'DRAFT' }],
  } as unknown as Existing;
  const host = await open(props);
  await act(async () => {
    useLaunchStore.setState({ current: 'int-1' });
  });
  return host;
};

describe('the gear', () => {
  it('is a named 44px button with a focus ring beside the eye', async () => {
    const host = await open();

    expect(gear(host)!.getAttribute('type')).toBe('button');
    expect(gear(host)!.className.split(' ')).toEqual(
      expect.arrayContaining([
        'w-[44px]',
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('is not there when the composer only builds an output', async () => {
    const host = await open({ dummy: true });

    expect(gear(host)).toBeNull();
  });

  it('sits on the circle row of a post that already exists', async () => {
    const host = await openExistingPost();
    const row =
      host.querySelector('[data-badge]')!.parentElement!.parentElement!;

    expect(row.querySelector('button[aria-label="Settings"]')).toBeTruthy();
  });
});

describe('the Settings sheet', () => {
  it('offers Add Tag and Repeat Post, and no channel settings when no channel has any', async () => {
    const host = await open();
    await press(gear(host));

    expect(sheetTitle()).toBe('Settings');
    expect(rowNamed('Add Tag')).toBeTruthy();
    expect(rowNamed('Repeat Post')).toBeTruthy();
    expect(rowNamed('Channel Settings')).toBeUndefined();
    expect(rowNamed('Delete Post')).toBeUndefined();
  });

  it('offers the channels’ settings when one of the picked channels has some', async () => {
    withSettings('tiktok');
    const host = await open();
    await press(gear(host));

    expect(rowNamed('Channel Settings')).toBeTruthy();
  });

  it('names the channel in view, and offers Delete Post, on a post that already exists', async () => {
    withSettings('instagram');
    const host = await openExistingPost();
    await press(gear(host));

    expect(rowNamed('Acme Inc. Settings')).toBeTruthy();
    const remove = rowNamed('Delete Post')!;
    expect(remove.className.split(' ')).toEqual(
      expect.arrayContaining(['min-h-[44px]', 'text-error'])
    );
  });

  it('opens the channel settings pane from its row and closes itself', async () => {
    withSettings('tiktok');
    const host = await open();
    await press(gear(host));

    await press(rowNamed('Channel Settings'));

    expect(sheet()).toBeNull();
    expect(host.querySelector('#wrapper-settings')!.className).toContain(
      'flex-1'
    );
  });

  it('opens the Add Tag sheet, the only tags control mounted while it is open', async () => {
    const host = await open();
    await press(gear(host));

    await press(rowNamed('Add Tag'));

    expect(sheetTitle()).toBe('Add Tag');
    expect(
      Array.from(document.querySelectorAll('[data-tags]')).map((node) =>
        node.getAttribute('data-tags')
      )
    ).toEqual(['list']);
  });

  it('opens the Repeat Post sheet with the list of choices', async () => {
    const host = await open();
    await press(gear(host));

    await press(rowNamed('Repeat Post'));

    expect(sheetTitle()).toBe('Repeat Post');
    expect(sheet()!.querySelector('[data-repeat="list"]')).toBeTruthy();
  });
});

describe('the date sheet', () => {
  const openDate = async () => {
    const host = await open();
    await press(host.querySelector('.sticky button[aria-haspopup="dialog"]'));
    return host;
  };
  const moved = dayjs().add(9, 'day');

  it('opens from the date in the top bar, on the post’s date', async () => {
    await openDate();

    expect(sheetTitle()).toBe('Change Date or Time');
    expect(mockPanel.sheet).toBe(true);
    expect(mockPanel.date.isSame(useLaunchStore.getState().date)).toBe(true);
  });

  it('changes the post’s date on Save', async () => {
    await openDate();
    await act(async () => mockPanel.onChange(moved));

    expect(useLaunchStore.getState().date.isSame(moved)).toBe(false);
    await press(rowNamed('Save'));

    expect(useLaunchStore.getState().date.isSame(moved)).toBe(true);
    expect(sheet()).toBeNull();
  });

  it('leaves the date alone when it is closed instead', async () => {
    await openDate();
    const date = useLaunchStore.getState().date;
    await act(async () => mockPanel.onChange(moved));

    await press(sheet()!.querySelector('button[aria-label="Close"]'));

    expect(useLaunchStore.getState().date).toBe(date);
  });
});

describe('Escape', () => {
  // The composer's own Escape (new-modal's useHotkeys) asks to close the post.
  // In the app it listens on the document, the node React listens on (Next
  // hydrates the document); here that node is React's root, and the listener
  // is added after React's, as the hook's is.
  const composerEscape = jest.fn();
  beforeEach(() => composerEscape.mockClear());
  const listen = (host: HTMLElement) =>
    host.addEventListener('keydown', composerEscape);

  it('closes a sheet and leaves the composer open', async () => {
    const host = await open();
    listen(host);
    await press(gear(host));

    await keydown(sheet()!, 'Escape');

    expect(sheet()).toBeNull();
    expect(host.querySelector('[data-editor]')).toBeTruthy();
    expect(composerEscape).not.toHaveBeenCalled();
  });

  describe('in the channel settings pane', () => {
    const openPane = async () => {
      withSettings('tiktok');
      const host = await open();
      listen(host);
      await press(gear(host));
      await press(rowNamed('Channel Settings'));
      return host;
    };
    const pane = (host: HTMLElement) =>
      host.querySelector<HTMLElement>('#wrapper-settings')!;

    it('takes the focus at 1025px and below, and closes on Escape alone', async () => {
      const host = await openPane();

      expect(document.activeElement).toBe(pane(host));
      await keydown(pane(host), 'Escape');

      expect(pane(host).className).not.toContain('flex-1');
      expect(composerEscape).not.toHaveBeenCalled();
    });

    it('leaves Escape to the composer from 1026px up, where it is the inline panel', async () => {
      const host = await openPane();
      await resize(false);

      expect(pane(host).hasAttribute('tabindex')).toBe(false);
      await keydown(pane(host), 'Escape');

      expect(pane(host).className).toContain('flex-1');
      expect(composerEscape).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a locked composer', () => {
  const lock = async () => {
    await act(async () => {
      useLaunchStore.setState({ locked: true });
    });
  };
  const fieldset = () => sheet()!.querySelector('fieldset');

  it.each(['Add Tag', 'Repeat Post'])(
    'keeps the controls of the %s sheet inert',
    async (row) => {
      const host = await open();
      await press(gear(host));
      await press(rowNamed(row));
      await lock();

      expect(fieldset()!.disabled).toBe(true);
      expect(
        fieldset()!.querySelector('[data-tags], [data-repeat]')
      ).toBeTruthy();
    }
  );

  it('keeps the Settings sheet’s rows inert', async () => {
    const host = await open();
    await press(gear(host));
    await lock();

    expect(fieldset()!.disabled).toBe(true);
    expect(fieldset()!.contains(rowNamed('Add Tag')!)).toBe(true);
  });

  it('keeps the date sheet’s controls inert and its Save disabled', async () => {
    const host = await open();
    await press(host.querySelector('.sticky button[aria-haspopup="dialog"]'));
    await lock();

    expect(fieldset()!.disabled).toBe(true);
    expect(fieldset()!.querySelector('[data-panel]')).toBeTruthy();
    expect(rowNamed('Save')!.disabled).toBe(true);
  });
});

// An iPad turned to landscape (820 to 1180) with a sheet open.
describe('the window growing past 1025px', () => {
  it('closes the sheet that was open', async () => {
    const host = await open();
    await press(host.querySelector('button[aria-label="Select Channels"]'));
    expect(sheet()).toBeTruthy();

    await resize(false);

    expect(sheet()).toBeNull();
  });

  it('puts the footer’s tags control back when Add Tag was open', async () => {
    const host = await open();
    await press(gear(host));
    await press(rowNamed('Add Tag'));

    await resize(false);

    expect(
      Array.from(document.querySelectorAll('[data-tags]')).map((node) =>
        node.getAttribute('data-tags')
      )
    ).toEqual(['dropdown']);
  });
});
