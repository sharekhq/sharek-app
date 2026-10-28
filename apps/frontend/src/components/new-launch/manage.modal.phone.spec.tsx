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
      Providers: [],
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
// Scenery, as in manage.modal.channels.spec.tsx.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => null })
);
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => <div data-editor="" />,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: (props: { date: dayjs.Dayjs }) => (
    <span data-date="">{props.date.format('DD/MM/YYYY')}</span>
  ),
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/platform-label',
  () => ({ platformLabel: (identifier: string) => identifier })
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => null,
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
  () => ({ CreationMethodBadge: () => null })
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

const en = createInstance();
const mounted: Array<{ unmount: () => void }> = [];

beforeAll(async () => {
  await en.init({ lng: 'en', resources: { en: { translation: {} } } });
});

beforeEach(() => {
  requests.length = 0;
  assistant = {};
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
