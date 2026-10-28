import 'reflect-metadata';
import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';

// Spec 044 (FR-002, SC-003): from 1026px up the composer stays what it was
// before the phone composer landed. This pin was recorded on the trunk's code,
// before any of 044's source edits, and must keep passing unchanged.
//
// Each tree is normalised to what a screen 1026px and wider renders:
// - every `mobile:` class token is dropped, since it applies only at 1025px
//   and below;
// - an element whose classes pair `hidden` with a `mobile:` display utility
//   is dropped with its subtree, since it is `display: none` from 1026px up;
// - the remaining class tokens are sorted, since their order does not change
//   what they style;
// - React's generated ids (useId, which Mantine's time field reads) become
//   one placeholder, since their number counts every useId call rendered
//   before them in this file.
// What is left is snapshotted: tags, every attribute, and the text.
//
// One deliberate update since the recording: the media library's search box
// and tile grid dropped `phone:basis-full` and `phone:grid-cols-2`, made
// redundant by the same classes at `mobile:` (which covers every phone width
// with the same value). Nothing renders differently at any width.

const shownMedia = [1, 2, 3].map((n) => ({
  id: `m${n}`,
  name: `photo-${n}.png`,
  path: `https://media.test/photo-${n}.png`,
}));
const tagList = [
  { id: 't1', name: 'Launch', color: '#B92D43' },
  { id: 't2', name: 'Ramadan', color: '#1F6F5C' },
];

let existing: Record<string, unknown> = {};

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{\s*(\w+)\s*}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => {
    if (key === 'load-tags') {
      return {
        data: { tags: tagList },
        isLoading: false,
        mutate: async () => ({ tags: tagList }),
      };
    }
    if (key === 'load-videos-ai') {
      return {
        data: [{ identifier: 'veo3', title: 'Veo 3' }],
        isLoading: false,
      };
    }
    if (key.startsWith('get-media-')) {
      return {
        data: { results: shownMedia, pages: 6 },
        isLoading: false,
        mutate: async (): Promise<void> => undefined,
      };
    }
    return {
      data: undefined,
      isLoading: false,
      mutate: async (): Promise<void> => undefined,
    };
  },
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => new Response('{}'),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: () => undefined,
    closeAll: () => undefined,
    closeById: () => undefined,
    closeCurrent: () => undefined,
  }),
  useDecisionModal: () => ({ open: async () => false }),
  ModalHeaderSlotTarget: () => null,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);
// The image helpers stand in as elements carrying what they were given.
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: ({ src, alt, className, width, height }: Record<string, string>) => (
    <i
      data-mock="SafeImage"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
      className={className}
    />
  ),
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ src, alt, className, width, height }: Record<string, string>) => (
    <i
      data-mock="ImageWithFallback"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
      className={className}
    />
  ),
}));
// Scenery: what the composer shell holds but this pin does not render.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => <i data-mock="EditorWrapper" />,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef } = jest.requireActual<typeof import('react')>('react');
    return {
      Providers: [],
      ShowAllProviders: forwardRef(() => <i data-mock="ShowAllProviders" />),
    };
  }
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => <i data-mock="SelectCustomer" />,
}));
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({
    CreationMethodBadge: () => <i data-mock="CreationMethodBadge" />,
  })
);
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({ DummyCodeComponent: () => null })
);
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: { shortlink: 'NO' } }) })
);
// The add-post button reads its enum through the providers' module, which
// brings the channel previews; they are scenery, as in
// high.order.provider.spec.tsx.
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
jest.mock('@gitroom/frontend/components/settings/signatures.component', () => ({
  SignaturesComponent: () => null,
}));
// Scenery for the media library and the media strip, as in
// media.component.limit.spec.tsx.
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    on: () => undefined,
    off: () => undefined,
    addFiles: () => undefined,
    addFile: () => undefined,
  }),
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => undefined,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true }, totalChannels: 1 }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ showImageEditor: true }),
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: { children: ReactElement }) => (
    <div data-mock="DropFiles">{children}</div>
  ),
}));
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media',
  () => ({ ThirdPartyMedia: () => null })
);
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media-library',
  () => ({ ThirdPartyMediaLibrary: () => null })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/media.settings.component',
  () => ({ MediaComponentInner: () => null })
);
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  MediaPreview: () => null,
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: () => null,
}));
jest.mock('react-sortablejs', () => ({
  ReactSortable: ({ children }: { children: ReactElement }) => (
    <div data-mock="ReactSortable">{children}</div>
  ),
}));
jest.mock('@gitroom/frontend/components/ui/empty.state', () => ({
  EmptyState: () => <i data-mock="EmptyState" />,
}));
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  VideoWrapper: () => null,
  videoOwnsActions: () => false,
  videoTypeCard: () => undefined,
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));

import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import type { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { SelectCurrent } from '@gitroom/frontend/components/new-launch/select.current';
import { PicksSocialsComponent } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { DatePicker } from '@gitroom/frontend/components/launches/helpers/date.picker';
import { TagsComponent } from '@gitroom/frontend/components/launches/tags.component';
import { RepeatComponent } from '@gitroom/frontend/components/launches/repeat.component';
import { AComponent } from '@gitroom/frontend/components/new-launch/a.component';
import { BoldText } from '@gitroom/frontend/components/new-launch/bold.text';
import { UText } from '@gitroom/frontend/components/new-launch/u.text';
import { Bullets } from '@gitroom/frontend/components/new-launch/bullets.component';
import { HeadingComponent } from '@gitroom/frontend/components/new-launch/heading.component';
import { AddPostButton } from '@gitroom/frontend/components/new-launch/add.post.button';
import { PostComment } from '@gitroom/frontend/components/new-launch/providers/post-comment.enum';
import { SignatureBox } from '@gitroom/frontend/components/signature';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import { AiVideo } from '@gitroom/frontend/components/launches/ai.video';
import { InformationComponent } from '@gitroom/frontend/components/launches/information.component';
import {
  MediaBox,
  MultiMediaComponent,
} from '@gitroom/frontend/components/media/media.component';

type Store = ReturnType<typeof useLaunchStore.getState>;

// The channel tabs watch their own width; nothing scrolls here.
class NoObserver {
  observe(): void {}
  disconnect(): void {}
}
Object.assign(global, {
  ResizeObserver: NoObserver,
  MutationObserver: NoObserver,
});
// The date line and the time field read the 12/24-hour setting from here.
globalThis.localStorage = window.localStorage;

const instagram = {
  id: 'int-1',
  identifier: 'instagram',
  name: 'Sharek Café',
  picture: 'https://pictures.test/1.png',
  disabled: false,
  inBetweenSteps: false,
};
const linkedin = {
  id: 'int-2',
  identifier: 'linkedin',
  name: 'مطعم الريف',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
};
const youtube = {
  id: 'int-3',
  identifier: 'youtube',
  name: 'Sharek Videos',
  picture: '',
  disabled: false,
  inBetweenSteps: false,
};
const at = dayjs('2026-10-21 21:30');

const DISPLAY =
  /^mobile:!?(flex|inline-flex|block|inline-block|inline|grid|inline-grid|contents|table|flow-root)$/;

const GENERATED_ID = /_r_[0-9a-z]+_/g;

// The tree as a screen 1026px and wider renders it (see the top of the file).
const desktop = (node: Node, depth = 0): string => {
  const pad = '  '.repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    return text.trim() ? `${pad}${JSON.stringify(text)}\n` : '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }
  const element = node as Element;
  const tokens = (element.getAttribute('class') || '')
    .split(/\s+/)
    .filter(Boolean);
  const kept = tokens.filter((token) => !token.startsWith('mobile:'));
  if (kept.includes('hidden') && tokens.some((token) => DISPLAY.test(token))) {
    return '';
  }
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name !== 'class')
    .map(
      (attribute) =>
        `${attribute.name}=${JSON.stringify(
          attribute.value.replace(GENERATED_ID, '_r_ID_')
        )}`
    );
  if (kept.length) {
    attributes.push(`class=${JSON.stringify(kept.sort().join(' '))}`);
  }
  attributes.sort();
  const tag = element.tagName.toLowerCase();
  const open = [tag, ...attributes].join(' ');
  const children = Array.from(element.childNodes)
    .map((child) => desktop(child, depth + 1))
    .join('');
  return children
    ? `${pad}<${open}>\n${children}${pad}</${tag}>\n`
    : `${pad}<${open} />\n`;
};

const pin = (host: Element) =>
  Array.from(host.childNodes)
    .map((child) => desktop(child))
    .join('');

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement, store: Partial<Store> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState(store);
    root.render(element);
  });
  return host;
};

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const selected = (...channels: Array<typeof instagram>) =>
  channels.map((integration) => ({
    integration,
    settings: {},
    ref: { current: null },
  })) as unknown as Store['selectedIntegrations'];

const channels = [
  instagram,
  linkedin,
  youtube,
] as unknown as Store['integrations'];

beforeEach(() => {
  existing = {};
  localStorage.setItem('isUS', 'GLOBAL');
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('the composer shell from 1026px up', () => {
  const shell = (props: Partial<AddEditModalProps> = {}) => (
    <ManageModal
      {...({ mutate: () => undefined, ...props } as AddEditModalProps)}
    />
  );

  it('a new post', async () => {
    const host = await render(shell(), {
      integrations: channels,
      selectedIntegrations: selected(instagram, linkedin),
      current: 'global',
      date: at,
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('a new post that a channel blocks from publishing', async () => {
    const host = await render(shell(), {
      integrations: channels,
      selectedIntegrations: selected(instagram, linkedin),
      current: 'global',
      date: at,
      publishBlockers: { 'int-2': 'TikTok: pick who can see it' },
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('a new post with no channel picked', async () => {
    const host = await render(shell(), {
      integrations: channels,
      current: 'global',
      date: at,
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('an existing post with another channel, on its own channel', async () => {
    existing = {
      integration: 'int-1',
      group: 'g-1',
      posts: [{ id: 'p-1', state: 'DRAFT' }],
      siblings: [{ integration: 'int-2', group: 'g-2', posts: [] }],
    };
    const host = await render(shell(), {
      integrations: channels,
      selectedIntegrations: selected(instagram, linkedin),
      current: 'int-1',
      date: at,
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('a set being added', async () => {
    const host = await render(shell({ addEditSets: () => undefined }), {
      integrations: channels,
      selectedIntegrations: selected(instagram),
      current: 'global',
      date: at,
    });

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the channel tabs from 1026px up', () => {
  it('a new post', async () => {
    const host = await render(<SelectCurrent />, {
      selectedIntegrations: selected(instagram, youtube),
      current: 'int-1',
      internal: [
        { integration: instagram, integrationValue: [] },
      ] as unknown as Store['internal'],
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('an existing post', async () => {
    existing = { integration: 'int-1', posts: [] };
    const host = await render(<SelectCurrent />, {
      selectedIntegrations: selected(instagram, linkedin),
      current: 'int-1',
    });

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the channel grid from 1026px up', () => {
  it('a new post', async () => {
    const host = await render(<PicksSocialsComponent toolTip={true} />, {
      integrations: channels,
      selectedIntegrations: selected(instagram),
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('a locked composer', async () => {
    const host = await render(<PicksSocialsComponent toolTip={true} />, {
      integrations: channels,
      selectedIntegrations: selected(instagram),
      locked: true,
    });

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the date picker from 1026px up', () => {
  it('closed', async () => {
    const host = await render(<DatePicker date={at} onChange={jest.fn()} />);

    expect(pin(host)).toMatchSnapshot();
  });

  it('open', async () => {
    const host = await render(<DatePicker date={at} onChange={jest.fn()} />);
    await click(host.firstElementChild);

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('tags and repeat from 1026px up', () => {
  const tags = (initial: Array<{ value: string; label: string }> = []) => (
    <TagsComponent
      name="tags"
      label="Tags"
      initial={initial}
      onChange={jest.fn()}
    />
  );

  it('tags, closed and empty', async () => {
    expect(pin(await render(tags()))).toMatchSnapshot();
  });

  it('tags, closed with two picked', async () => {
    const host = await render(
      tags([
        { value: 'Launch', label: 'Launch' },
        { value: 'Ramadan', label: 'Ramadan' },
      ])
    );

    expect(pin(host)).toMatchSnapshot();
  });

  it('tags, open with one picked', async () => {
    const host = await render(tags([{ value: 'Launch', label: 'Launch' }]));
    await click(host.firstElementChild!.firstElementChild);

    expect(pin(host)).toMatchSnapshot();
  });

  it('repeat, closed', async () => {
    const host = await render(
      <RepeatComponent repeat={null} onChange={jest.fn()} />
    );

    expect(pin(host)).toMatchSnapshot();
  });

  it('repeat, closed on a week', async () => {
    const host = await render(
      <RepeatComponent repeat={7} onChange={jest.fn()} />
    );

    expect(pin(host)).toMatchSnapshot();
  });

  it('repeat, open', async () => {
    const host = await render(
      <RepeatComponent repeat={7} onChange={jest.fn()} />
    );
    await click(host.firstElementChild!.firstElementChild);

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the tool buttons from 1026px up', () => {
  it.each([
    ['link', <AComponent key="a" editor={null} currentValue="" />],
    ['bold', <BoldText key="b" editor={null} currentValue="" />],
    ['underline', <UText key="u" editor={null} currentValue="" />],
    ['bullets', <Bullets key="l" editor={null} currentValue="" />],
    ['heading', <HeadingComponent key="h" editor={null} currentValue="" />],
    ['signature', <SignatureBox key="s" editor={null} />],
    [
      'add comment or post',
      <AddPostButton
        key="p"
        onClick={jest.fn()}
        num={0}
        postComment={PostComment.ALL}
      />,
    ],
    [
      'add comment',
      <AddPostButton
        key="c"
        onClick={jest.fn()}
        num={1}
        postComment={PostComment.COMMENT}
      />,
    ],
    ['AI image', <AiImage key="i" value="" onChange={jest.fn()} />],
    ['AI video', <AiVideo key="v" value="" onChange={jest.fn()} />],
  ])('%s', async (_name, element) => {
    expect(pin(await render(element))).toMatchSnapshot();
  });

  it('the media strip', async () => {
    const host = await render(
      <MultiMediaComponent
        allData={[{ content: '' }]}
        text=""
        label="Attachments"
        description=""
        value={[shownMedia[0]]}
        dummy={false}
        name="image"
        onChange={jest.fn()}
        onOpen={jest.fn()}
        onClose={jest.fn()}
        toolBar={<i data-slot="toolBar" />}
        information={<i data-slot="information" />}
      />
    );

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the character counter from 1026px up', () => {
  const counter = (text: string, totalAllowedChars = 280) => (
    <InformationComponent
      chars={{ 'int-1': 280, 'int-2': 3000 }}
      totalChars={text.length}
      totalAllowedChars={totalAllowedChars}
      isPicture={false}
      text={text}
    />
  );

  it('one channel, within its limit', async () => {
    const host = await render(counter('Hello'), {
      integrations: channels,
      selectedIntegrations: selected(instagram),
      current: 'int-1',
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('one channel, over its limit', async () => {
    const host = await render(counter('Hello there', 5), {
      integrations: channels,
      selectedIntegrations: selected(instagram),
      current: 'int-1',
    });

    expect(pin(host)).toMatchSnapshot();
  });

  it('every channel, empty', async () => {
    const host = await render(counter(''), {
      integrations: channels,
      selectedIntegrations: selected(instagram, linkedin),
      current: 'global',
    });

    expect(pin(host)).toMatchSnapshot();
  });
});

describe('the media library from 1026px up', () => {
  it('the picker', async () => {
    const host = await render(
      <MediaBox setMedia={jest.fn()} closeModal={jest.fn()} />
    );

    expect(pin(host)).toMatchSnapshot();
  });

  it('the picker with two picked', async () => {
    const host = await render(
      <MediaBox setMedia={jest.fn()} closeModal={jest.fn()} />
    );
    await click(host.querySelector(`img[src="${shownMedia[0].path}"]`));
    await click(host.querySelector(`img[src="${shownMedia[1].path}"]`));

    expect(pin(host)).toMatchSnapshot();
  });

  it('the Media page', async () => {
    const host = await render(
      <MediaBox setMedia={jest.fn()} closeModal={jest.fn()} standalone={true} />
    );

    expect(pin(host)).toMatchSnapshot();
  });
});
