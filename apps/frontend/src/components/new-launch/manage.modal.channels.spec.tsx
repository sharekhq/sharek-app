// A post saved for several channels stays linked (upstream a194e3f4 + 003a77eb, grafted into
// Sharek's composer). Saving or deleting one asks whether to act on every channel or only the
// one in view, and the save goes out as one POST /posts per kind of save.
//
// The stub set is manage.modal.validation.spec.tsx's, with three seams that one did not need:
// the modal manager records what the composer opens so a question's buttons can be pressed,
// fetch records every request and answers POST /posts from a queue, and the translations are
// a real i18next instance (as in faq.component.spec.tsx) so interpolation and its escaping run
// for real: a channel name is user text, and "Tom & Jerry" must not come out as "Tom &amp; Jerry".
import * as fs from 'fs';
import * as path from 'path';
import { act, ComponentProps, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createInstance, i18n as I18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import dayjs from 'dayjs';
import type { useModals } from '@gitroom/frontend/components/layout/new-modal';
import type { useExistingData } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import type { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import type { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';

type Opened = Parameters<ReturnType<typeof useModals>['openModal']>[0];
type Existing = ReturnType<typeof useExistingData>;
interface Save {
  type: string;
  posts: Array<{
    integration: { id: string };
    group: string;
    date?: string;
    value: Array<{ content: string }>;
  }>;
}
interface Check {
  id: string;
  identifier: string;
  name: string;
  valid: boolean;
  errors: true | string;
}

const shown: Array<[string, string]> = [];
const requests: Array<{ url: string; method: string; body?: Save }> = [];
const opened: Opened[] = [];
const closedById: string[] = [];
let closedAll = 0;
let postsValid: Check[] = [];
let postReplies: Array<{ status: number; body?: unknown }> = [];
let existing = {} as Existing;
let inPost: string[] = [];
const deleteDialog = jest.fn<Promise<boolean>, unknown[]>(async () => true);

jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({
    show: (message: string, kind: string) => shown.push([message, kind]),
  }),
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
      if (url === '/posts' && method === 'POST') {
        const reply = postReplies.shift() || { status: 200, body: {} };
        return new Response(JSON.stringify(reply.body ?? {}), {
          status: reply.status,
        });
      }
      return new Response('{}');
    },
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: (params: Opened) => opened.push(params),
    closeById: (id: string) => closedById.push(id),
    closeAll: () => {
      closedAll++;
    },
  }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => deleteDialog(...args),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);
// Every selected channel's values, in the shape the providers' getValues() returns.
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useImperativeHandle } =
      jest.requireActual<typeof import('react')>('react');
    return {
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
// Scenery, as in manage.modal.validation.spec.tsx.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => null })
);
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => null,
}));
// The footer's date picker: what it is shown and what its onChange moves.
let datePicker: ComponentProps<typeof DatePicker> | undefined;
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: (props: ComponentProps<typeof DatePicker>) => {
    datePicker = props;
    return null;
  },
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/platform-label',
  () => ({
    platformLabel: (identifier: string) => identifier,
  })
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => null,
}));
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({
    DummyCodeComponent: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({
    CreationMethodBadge: () => null,
  })
);
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
}));
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
// 'NO' skips /posts/should-shortlink, which these questions do not touch.
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
const fix = jest.fn();

// No resources in English: t(key, default) hands back the composer's own default. The Arabic
// instance reads the shipped locale, so the button says what an Arabic user reads.
const en = createInstance();
const ar = createInstance();
const mutate = jest.fn();
const mounted: Array<{ unmount: () => void }> = [];

beforeAll(async () => {
  await en.init({ lng: 'en', resources: { en: { translation: {} } } });
  await ar.init({
    lng: 'ar',
    resources: {
      ar: {
        translation: JSON.parse(
          fs.readFileSync(
            path.join(
              __dirname,
              '../../../../../libraries/react-shared-libraries/src/translation/locales/ar/translation.json'
            ),
            'utf8'
          )
        ),
      },
    },
  });
});

beforeEach(() => {
  shown.length = 0;
  requests.length = 0;
  opened.length = 0;
  closedById.length = 0;
  closedAll = 0;
  postReplies = [];
  postsValid = [instagram, tiktok, linkedin].map((p) => ({
    id: p.id,
    identifier: p.identifier,
    name: p.name,
    valid: true,
    errors: true,
  }));
  mutate.mockClear();
  deleteDialog.mockClear();
  fix.mockClear();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const post = (integration: string, group: string, state: string) => ({
  integration,
  group,
  posts: [{ id: `p-${integration}`, state }],
  settings: {},
});

// The opened post is int-1, its siblings follow. Dates: tomorrow for int-1 (the composer's
// own date), and each sibling its own (channelDates), as add.edit.modal loads them.
const openLinked = async (
  openedState: string,
  siblings: Array<[string, string]>,
  options: {
    current?: string;
    siblingDates?: Record<string, dayjs.Dayjs>;
    i18n?: I18n;
  } = {}
) => {
  existing = {
    ...post('int-1', 'g-int-1', openedState),
    siblings: siblings.map(([id, state]) => post(id, `g-${id}`, state)),
  } as unknown as Existing;
  const channels = [instagram, tiktok, linkedin].filter(
    (p) => p.id === 'int-1' || siblings.some(([id]) => id === p.id)
  );
  inPost = channels.map((p) => p.id);
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
      selectedIntegrations: channels.map((integration) => ({
        integration,
        settings: {},
        ref: { current: { fix, preview: jest.fn() } },
      })) as unknown as LaunchState['selectedIntegrations'],
      current: options.current || 'int-1',
      date: dayjs().add(1, 'day'),
      channelDates:
        options.siblingDates ||
        Object.fromEntries(
          siblings.map(([id], i) => [id, dayjs().add(2 + i, 'day')])
        ),
    });
    root.render(
      <I18nextProvider i18n={options.i18n || en}>
        <ManageModal {...({ mutate } as unknown as AddEditModalProps)} />
      </I18nextProvider>
    );
  });
  return host;
};

// Lets every awaited fetch and state update the click started run to the end.
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

// A channel name comes isolated (U+2068…U+2069). Pressing a button does not depend on it;
// the cases about the sentence itself read the exact text.
const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button')).find(
    (button) => (button.textContent || '').replace(/[⁨⁩]/g, '').trim() === text
  );

const schedule = (host: HTMLElement) =>
  press(host.querySelector('button.btnSub'));
const draft = (host: HTMLElement) => press(buttonByText(host, 'Save as Draft'));
const postNow = (host: HTMLElement) => press(buttonByText(host, 'Post Now'));
const deletePost = (host: HTMLElement) =>
  press(buttonByText(host, 'Delete Post'));

// The question the composer opened last, rendered on its own so its buttons can be pressed.
const question = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<>{opened.at(-1)!.children as ReactNode}</>);
  });
  return host;
};

const close = async () => {
  await act(async () => opened.at(-1)!.onClose!());
  await settle();
};

const saves = () =>
  requests
    .filter((r) => r.url === '/posts' && r.method === 'POST')
    .map((r) => [r.body!.type, r.body!.posts.map((p) => p.integration.id)]);

const deletes = () =>
  requests.filter((r) => r.method === 'DELETE').map((r) => r.url);

describe('which saves of a linked post ask about the other channels', () => {
  it.each([
    // [opened, sibling, save, asks]
    ['DRAFT', 'DRAFT', schedule, true],
    ['DRAFT', 'QUEUE', draft, true],
    ['DRAFT', 'DRAFT', postNow, true],
    ['QUEUE', 'QUEUE', schedule, false],
    ['DRAFT', 'DRAFT', draft, false],
  ] as const)(
    'opened %s, sibling %s',
    async (openedState, siblingState, save, asks) => {
      const host = await openLinked(openedState, [['int-2', siblingState]]);
      await save(host);

      expect(opened.some((m) => m.id === 'change-post-channels')).toBe(asks);
    }
  );

  // The server answers `siblings: []` for a post with no link (getPostsByGroup).
  it('asks nothing for a post saved before the link existed', async () => {
    const host = await openLinked('DRAFT', []);
    await schedule(host);

    expect(opened).toEqual([]);
    expect(saves()).toEqual([['schedule', ['int-1']]]);
  });

  // A sibling whose date passed would go out at once: only its details are saved.
  it('saves a sibling whose time has passed as an update, without asking', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']], {
      siblingDates: { 'int-2': dayjs().subtract(1, 'hour') },
    });
    await schedule(host);

    expect(opened).toEqual([]);
    expect(saves()).toEqual([
      ['update', ['int-2']],
      ['schedule', ['int-1']],
    ]);
  });

  it('leaves a published sibling published when the post moves to drafts', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'PUBLISHED']]);
    await draft(host);

    expect(saves()).toEqual([
      ['update', ['int-2']],
      ['draft', ['int-1']],
    ]);
  });
});

describe('the answers to the save question', () => {
  it('"all channels" saves every channel as the kind pressed', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await press(buttonByText(await question(), 'Schedule all channels'));

    expect(closedById).toContain('change-post-channels');
    expect(saves()).toEqual([['schedule', ['int-1', 'int-2']]]);
  });

  // "Only" keeps the other channels' state, and still saves the edits made to them.
  it('"only" schedules the channel in view and keeps the others as they were', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await press(buttonByText(await question(), 'Only Acme Inc.'));

    expect(saves()).toEqual([
      ['schedule', ['int-1']],
      ['draft', ['int-2']],
    ]);
    const draftSave = requests.filter((r) => r.url === '/posts').at(-1)!;
    expect(draftSave.body!.posts[0].value[0].content).toBe('<p>int-2</p>');
  });

  it('closing the question saves nothing', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await close();

    expect(requests).toEqual([]);
  });

  it('offers no "only" when the channel in view stays published on a draft', async () => {
    const host = await openLinked('PUBLISHED', [['int-2', 'QUEUE']]);
    await draft(host);

    const buttons = (await question()).querySelectorAll('button');
    expect(buttons).toHaveLength(1);
  });

  it('each sibling keeps its own group and date', async () => {
    const tomorrowPlus3 = dayjs().add(3, 'day');
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']], {
      siblingDates: { 'int-2': tomorrowPlus3 },
    });
    await schedule(host);
    await press(buttonByText(await question(), 'Schedule all channels'));

    const [save] = requests.filter((r) => r.url === '/posts');
    const sibling = save.body!.posts.find((p) => p.integration.id === 'int-2')!;
    expect(sibling.group).toBe('g-int-2');
    expect(sibling.date).toBe(
      tomorrowPlus3.utc().format('YYYY-MM-DDTHH:mm:ss')
    );
  });
});

describe('one request per kind of save', () => {
  it('goes out as update, schedule, then draft', async () => {
    const host = await openLinked('QUEUE', [
      ['int-2', 'PUBLISHED'],
      ['int-3', 'DRAFT'],
    ]);
    await schedule(host);
    await press(buttonByText(await question(), 'Only Acme Inc.'));

    expect(saves()).toEqual([
      ['update', ['int-2']],
      ['schedule', ['int-1']],
      ['draft', ['int-3']],
    ]);
  });

  it('names each published channel, in its own direction, and its date before it goes out again', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'PUBLISHED']], {
      siblingDates: { 'int-2': dayjs('2026-11-05T09:30:00') },
    });
    await schedule(host);

    const warning = opened.find((m) => m.id === 'republish-post');
    const text = (await question()).textContent || '';
    expect(warning).toBeTruthy();
    expect(text).toContain('⁨Tom & Jerry⁩ at 05/11/2026 09:30');
  });

  // It closes on a choice, so a save that then fails its checks shows the channel to fix.
  it.each([
    [
      'Just update the post details',
      [
        ['update', ['int-2']],
        ['schedule', ['int-1']],
      ],
    ],
    ['Republish the post', [['schedule', ['int-1', 'int-2']]]],
  ])(
    '"%s" closes the republish warning and saves',
    async (choice, expected) => {
      const host = await openLinked('QUEUE', [['int-2', 'PUBLISHED']]);
      await schedule(host);
      await press(buttonByText(await question(), choice));

      expect(closedById).toContain('republish-post');
      expect(saves()).toEqual(expected);
    }
  );

  it('closing the republish warning saves nothing', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'PUBLISHED']]);
    await schedule(host);
    await close();

    expect(saves()).toEqual([]);
  });
});

describe('a save that fails part-way', () => {
  it('tells the user, refreshes the calendar and keeps the editor open', async () => {
    postReplies = [
      { status: 200 },
      { status: 500, body: { message: 'TikTok said no' } },
    ];
    const host = await openLinked('QUEUE', [
      ['int-2', 'PUBLISHED'],
      ['int-3', 'DRAFT'],
    ]);
    await schedule(host);
    await press(buttonByText(await question(), 'Only Acme Inc.'));

    expect(saves()).toHaveLength(2);
    expect(shown).toContainEqual(['TikTok said no', 'warning']);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(closedAll).toBe(0);
  });

  it('does not refresh the calendar when the first request fails', async () => {
    postReplies = [{ status: 500, body: {} }];
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await press(buttonByText(await question(), 'Schedule all channels'));

    expect(shown).toContainEqual(['Could not save the post', 'warning']);
    expect(mutate).not.toHaveBeenCalled();
    expect(closedAll).toBe(0);
  });
});

describe('the publishing checks of a linked post', () => {
  // A channel that stays a draft is checked when it is scheduled, not now.
  it('skips the checks for a channel saved as a draft', async () => {
    postsValid[1] = { ...postsValid[1], valid: false };
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await press(buttonByText(await question(), 'Only Acme Inc.'));

    expect(shown.filter(([, kind]) => kind === 'warning')).toEqual([]);
    expect(saves()).toHaveLength(2);
  });

  it('points to the channel to fix and saves nothing', async () => {
    postsValid[1] = { ...postsValid[1], valid: false };
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await schedule(host);
    await press(buttonByText(await question(), 'Schedule all channels'));

    expect(fix).toHaveBeenCalled();
    expect(saves()).toEqual([]);
  });

  // FR-006 / FR-027: a TikTok sibling with incomplete settings blocks the whole post.
  it('a blocked sibling disables scheduling and posting now, not the draft', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']]);
    await act(async () => {
      useLaunchStore
        .getState()
        .setPublishBlocker(
          'int-2',
          'TikTok (Tom & Jerry): pick who can see it'
        );
    });

    expect(
      host.querySelector<HTMLButtonElement>('button.btnSub')!.disabled
    ).toBe(true);
    expect(buttonByText(host, 'Post Now')!.disabled).toBe(true);
    expect(buttonByText(host, 'Save as Draft')!.disabled).toBe(false);
  });
});

// At 1025px and below the preview takes the editor's place, so a failed check
// goes back to what needs fixing.
describe('a failed check on a small screen', () => {
  const eye = (host: HTMLElement) =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Preview"]')!;
  const onPreview = async () => {
    const host = await openLinked('QUEUE', []);
    await press(eye(host));
    return host;
  };

  it("opens the channel's settings for its settings", async () => {
    postsValid[0] = { ...postsValid[0], valid: false };
    const host = await onPreview();
    await schedule(host);

    expect(host.querySelector('#wrapper-settings')!.className).toContain(
      'flex-1'
    );
  });

  it('goes back to the editor for its content', async () => {
    postsValid[0] = { ...postsValid[0], errors: 'Too many hashtags' };
    const host = await onPreview();
    expect(eye(host).getAttribute('aria-pressed')).toBe('true');

    await schedule(host);

    expect(eye(host).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('the date of the channel in view', () => {
  it('shows and moves the sibling in view only', async () => {
    const own = dayjs().add(4, 'day');
    await openLinked('QUEUE', [['int-2', 'QUEUE']], {
      current: 'int-2',
      siblingDates: { 'int-2': own },
    });
    const composerDate = useLaunchStore.getState().date;

    expect(datePicker!.date).toBe(own);
    const moved = dayjs().add(5, 'day');
    await act(async () => datePicker!.onChange(moved));

    expect(useLaunchStore.getState().channelDates['int-2']).toBe(moved);
    expect(useLaunchStore.getState().date).toBe(composerDate);
  });

  it('shows and moves the opened channel on the composer date', async () => {
    await openLinked('QUEUE', [['int-2', 'QUEUE']]);
    const sibling = useLaunchStore.getState().channelDates['int-2'];

    expect(datePicker!.date).toBe(useLaunchStore.getState().date);
    const moved = dayjs().add(6, 'day');
    await act(async () => datePicker!.onChange(moved));

    expect(useLaunchStore.getState().date).toBe(moved);
    expect(useLaunchStore.getState().channelDates['int-2']).toBe(sibling);
  });
});

describe('deleting a linked post', () => {
  it('asks nothing extra for a post with no other channels', async () => {
    const host = await openLinked('QUEUE', []);
    await deletePost(host);

    expect(deleteDialog).toHaveBeenCalled();
    expect(deletes()).toEqual(['/posts/g-int-1']);
  });

  it('"Delete from all channels" deletes every channel\'s post', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']]);
    await deletePost(host);
    await press(buttonByText(await question(), 'Delete from all channels'));

    expect(deletes()).toEqual(['/posts/g-int-1', '/posts/g-int-2']);
  });

  // The channel in view, here the sibling.
  it('"Only from" deletes the channel in view only', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']], {
      current: 'int-2',
    });
    await deletePost(host);
    await press(buttonByText(await question(), 'Only from Tom & Jerry'));

    expect(deletes()).toEqual(['/posts/g-int-2']);
  });

  it('closing the question deletes nothing', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']]);
    await deletePost(host);
    await close();

    expect(deletes()).toEqual([]);
  });

  it('marks "all" as the destructive choice and "only" as the quiet one', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']]);
    await deletePost(host);
    const dialog = await question();

    expect(
      buttonByText(dialog, 'Delete from all channels')!.className
    ).toContain('bg-error');
    expect(buttonByText(dialog, 'Only from Acme Inc.')!.className).toContain(
      'border-line'
    );
  });
});

// Each "only" button is one translated sentence, so a language can put the name where its
// grammar wants it. The name keeps its own direction and arrives as typed, not escaped.
describe('the channel named on an "only" button', () => {
  const onlyButton = (dialog: ParentNode) =>
    Array.from(dialog.querySelectorAll('button')).at(-1)!.textContent;

  it('names the channel to delete from', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']], {
      current: 'int-2',
    });
    await deletePost(host);

    expect(onlyButton(await question())).toBe('Only from ⁨Tom & Jerry⁩');
  });

  it('names the channel to save', async () => {
    const host = await openLinked('DRAFT', [['int-2', 'DRAFT']], {
      current: 'int-2',
    });
    await schedule(host);

    expect(onlyButton(await question())).toBe('Only ⁨Tom & Jerry⁩');
  });

  it('puts the name inside the Arabic sentence', async () => {
    const host = await openLinked('QUEUE', [['int-2', 'QUEUE']], {
      current: 'int-2',
      i18n: ar,
    });
    await press(buttonByText(host, ar.t('delete_post')));

    expect(onlyButton(await question())).toBe('من ⁨Tom & Jerry⁩ فقط');
  });
});
