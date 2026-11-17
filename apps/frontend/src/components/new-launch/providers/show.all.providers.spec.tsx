import 'reflect-metadata';
import { act, createRef, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The composer's previews (spec 061, tasks D10): while an AI tab makes a
// result for a post, the preview of that post shows a placeholder where it
// will land, and what the composer saves never holds it. The general preview
// takes the global post's results; each channel is handed the results under
// way, and its preview shows its own (high.order.provider.spec.tsx).

// Scenery: the English fallbacks stand in for the locale files.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
// The preview, recording the posts it is given: the general preview's, or a
// channel's that has no preview of its own.
const mockSeen: { preview?: unknown } = {};
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => {
    const { useIntegration } = jest.requireActual(
      '@gitroom/frontend/components/launches/helpers/use.integration'
    );
    return {
      GeneralPreviewComponent: () => {
        mockSeen.preview = useIntegration().value;
        return null;
      },
    };
  }
);
// What the channels' modules bring that the previews never render here: the
// editor (threads), the media library and its ESM-only uploader, the plugs.
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({}));
// The AI tools the composer's tabs host, as in composer.stage.spec.tsx: a
// stand-in keeping its latest props, so a case starts a render as the real
// tool does.
const mockTools = { props: {} as Record<string, any> };
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImageTool: (props: any) => {
    mockTools.props.image = props;
    return null;
  },
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideoChooser: () => null,
  useAiVideoTypes: () => ({ data: [], isLoading: false }),
}));
jest.mock('@gitroom/frontend/components/new-launch/preview.fit', () => ({
  PreviewFit: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// The scroll box's overflow check needs a MutationObserver, which this DOM
// lacks; scenery, as in composer.stage.spec.tsx.
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));

import {
  ComposerStage,
  ComposerTabs,
  ComposerTabsProvider,
  useComposerTabs,
} from '@gitroom/frontend/components/new-launch/composer.stage';
import { ShowAllProviders } from '@gitroom/frontend/components/new-launch/providers/show.all.providers';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

type Store = ReturnType<typeof useLaunchStore.getState>;
type Preview = { getAllValues: () => Promise<Array<{ values: unknown }>> };

// A channel whose preview is the general one.
const integration = {
  id: 'int-1',
  identifier: 'mastodon',
  name: 'Sharek on Mastodon',
  picture: '',
  additionalSettings: '[]',
};
// Two posts each, the second with a picture: the global post, and the
// channel's own once it has been edited for this channel alone.
const media = { id: 'm1', path: 'https://media.sharek.app/m1.png' };
const posts = [
  { id: 'v1', content: '<p>صباح الخير</p>', media: [] },
  { id: 'v2', content: '<p>والصورة هنا</p>', media: [media] },
];
const own = [
  { id: 'o1', content: '<p>صباح الخير يا ماستودون</p>', media: [] },
  { id: 'o2', content: '<p>والصورة هنا</p>', media: [media] },
];
// What the preview reads: each post's text and pictures.
const shown = (values: typeof posts) =>
  values.map((p) => ({ id: p.id, content: p.content, image: p.media }));

// What a trigger reads through the context, from a child of the provider.
let tabs: ComposerTabs | null;
const Probe = () => {
  tabs = useComposerTabs();
  return null;
};

const mounted: Root[] = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockSeen.preview = undefined;
  mockTools.props = {};
  tabs = null;
});

const render = async (
  current: string,
  ofItsOwn: boolean,
  composer: (preview: ReturnType<typeof createRef<Preview>>) => ReactNode
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const preview = createRef<Preview>();
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      selectedIntegrations: [{ integration, settings: {}, ref: createRef() }],
      global: posts,
      internal: ofItsOwn ? [{ integration, integrationValue: own }] : [],
      current,
      tab: 0,
    } as unknown as Partial<Store>);
    root.render(composer(preview));
  });
  return preview;
};

// The composer: its tabs around the stage, whose Post preview holds the
// previews.
const inComposer = (preview: ReturnType<typeof createRef<Preview>>) => (
  <ComposerTabsProvider>
    <Probe />
    <ComposerStage previewRef={preview} onClose={jest.fn()} />
  </ComposerTabsProvider>
);

// An AI image render started for the second post, as the tab's tool starts
// it: the tab takes the post on screen at the click, the channel's own when
// it has posts of its own, else the global one.
const makingForTheSecondPost = async () => {
  await act(async () => {
    tabs!.open('image', () => undefined, 1);
  });
  await act(async () => {
    mockTools.props.image.setLoading(true);
  });
  return { id: tabs!.pending[0].id, path: 'pending:image' };
};

describe('the general preview', () => {
  it("shows a result still being made for the global post at that post's place", async () => {
    await render('global', false, inComposer);
    const placeholder = await makingForTheSecondPost();

    expect(mockSeen.preview).toEqual([
      shown(posts)[0],
      { ...shown(posts)[1], image: [media, placeholder] },
    ]);
  });

  it("leaves out a channel's own", async () => {
    await render('int-1', true, inComposer);
    await makingForTheSecondPost();
    await act(async () => {
      useLaunchStore.setState({ current: 'global' });
    });

    expect(mockSeen.preview).toEqual(shown(posts));
  });

  it('shows the post as it is outside the composer', async () => {
    await render('global', false, (preview) => (
      <ShowAllProviders ref={preview} />
    ));

    expect(mockSeen.preview).toEqual(shown(posts));
  });
});

describe("a channel's preview", () => {
  it('shows a result still being made for one of its own posts', async () => {
    await render('int-1', true, inComposer);
    const placeholder = await makingForTheSecondPost();

    expect(mockSeen.preview).toEqual([
      shown(own)[0],
      { ...shown(own)[1], image: [media, placeholder] },
    ]);
  });
});

describe('what the composer saves', () => {
  it('never holds a result still being made', async () => {
    const preview = await render('global', false, inComposer);
    await makingForTheSecondPost();

    const saved = await preview.current!.getAllValues();
    expect(saved.map((channel) => channel.values)).toEqual([posts]);
  });
});
