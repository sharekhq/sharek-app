import 'reflect-metadata';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';

// Every channel's provider: its preview and settings read the channel's own
// date, and a save that failed on the channel brings it into view through the
// handle the composer holds. Its preview alone also shows each result still
// being made for one of its posts (spec 061, tasks D10).
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import type { PendingMedia } from '@gitroom/frontend/components/new-launch/composer.stage';

type Store = ReturnType<typeof useLaunchStore.getState>;
type Handle = {
  fix: () => void;
  preview: () => void;
  getValues: () => { values: unknown };
};

// What the channel's preview is given as its date.
const DateProbe = () => {
  const { date } = useIntegration();
  return <div data-date={date.format('YYYY-MM-DD HH:mm')} />;
};

const Provider = withProvider({
  postComment: PostComment.ALL,
  minimumCharacters: [],
  SettingsComponent: null,
  CustomPreviewComponent: DateProbe,
  maximumCharacters: 280,
});

// What a channel's preview and its settings are given as its posts.
const seen: { preview?: unknown; settings?: unknown } = {};
const PreviewProbe = () => {
  seen.preview = useIntegration().value;
  return null;
};
const SettingsProbe = () => {
  seen.settings = useIntegration().value;
  return null;
};

const WithSettings = withProvider({
  postComment: PostComment.ALL,
  minimumCharacters: [],
  SettingsComponent: SettingsProbe,
  CustomPreviewComponent: PreviewProbe,
  maximumCharacters: 280,
});

const integration = {
  id: 'int-1',
  identifier: 'x',
  name: 'Sharek on X',
  picture: '',
  additionalSettings: '[]',
};

// The store is one for the page: a channel left open by an earlier case would
// answer the next case's reset with its own effects.
const mounted: Array<{ unmount: () => void }> = [];

const render = async (
  current: string,
  {
    Channel = Provider,
    pending,
    state,
  }: {
    Channel?: typeof Provider;
    pending?: PendingMedia[];
    state?: Partial<Store>;
  } = {}
) => {
  // Where the composer puts the channels' settings.
  const settings = document.createElement('div');
  settings.id = 'social-settings';
  document.body.appendChild(settings);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ref = createRef<Handle>();
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      selectedIntegrations: [
        { integration, settings: {} },
      ] as unknown as Store['selectedIntegrations'],
      global: [
        { id: 'v1', content: '<p>صباح الخير</p>', media: [] },
      ] as unknown as Store['global'],
      current,
      date: dayjs('2026-11-01T10:00:00'),
      channelDates: { 'int-1': dayjs('2026-11-03T18:30:00') },
      ...state,
    });
    root.render(<Channel id="int-1" pending={pending} ref={ref} />);
  });
  return { host, ref };
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  seen.preview = seen.settings = undefined;
});

describe('a channel of the composer', () => {
  it("previews with the channel's own date, not the composer's", async () => {
    const { host } = await render('int-1');

    expect(
      host.querySelector('[data-date]')!.getAttribute('data-date')
    ).toBe('2026-11-03 18:30');
  });

  it('comes into view when a save failed on it', async () => {
    const { ref } = await render('global');

    await act(async () => {
      ref.current!.fix();
    });

    expect(useLaunchStore.getState().current).toBe('int-1');
    expect(useLaunchStore.getState().hide).toBe(true);
  });

  it('comes into view to show its preview', async () => {
    const { ref } = await render('global');

    await act(async () => {
      ref.current!.preview();
    });

    expect(useLaunchStore.getState().current).toBe('int-1');
    expect(useLaunchStore.getState().hide).toBe(true);
  });
});

// Two posts each, the second with a picture: the global post, and the
// channel's own once it has been edited for this channel alone.
const media = { id: 'm1', path: 'https://media.sharek.app/m1.png' };
const placeholder = { id: 'p1', path: 'pending:image' };
const posts = [
  { id: 'v1', content: '<p>صباح الخير</p>', media: [] },
  { id: 'v2', content: '<p>والصورة هنا</p>', media: [media] },
];
const own = [
  { id: 'o1', content: '<p>صباح الخير يا إكس</p>', media: [] },
  { id: 'o2', content: '<p>والصورة هنا</p>', media: [media] },
];
const withPosts = (ofItsOwn: boolean) =>
  ({
    global: posts,
    internal: ofItsOwn ? [{ integration, integrationValue: own }] : [],
    tab: 0,
  } as unknown as Partial<Store>);
// What the preview reads: each post's text and pictures.
const shown = (values: typeof posts) =>
  values.map((p) => ({ id: p.id, content: p.content, image: p.media }));
// A render under way for the second post of a channel, or of the global post.
const pendingFor = (channel: string): PendingMedia[] => [
  { id: 'p1', kind: 'image', place: { channel, index: 1 } },
];

describe("a channel's results still being made", () => {
  it('shows one for one of its own posts in its preview, at that post only', async () => {
    await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('int-1'),
      state: withPosts(true),
    });

    expect(seen.preview).toEqual([
      shown(own)[0],
      { ...shown(own)[1], image: [media, placeholder] },
    ]);
  });

  it("adds nothing for another channel's", async () => {
    await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('int-2'),
      state: withPosts(true),
    });

    expect(seen.preview).toEqual(shown(own));
  });

  it('shows one for the global post while it has no posts of its own, as it previews that post', async () => {
    await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('global'),
      state: withPosts(false),
    });

    expect(seen.preview).toEqual([
      shown(posts)[0],
      { ...shown(posts)[1], image: [media, placeholder] },
    ]);
  });

  it("does not show the global post's once it has posts of its own", async () => {
    await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('global'),
      state: withPosts(true),
    });

    expect(seen.preview).toEqual(shown(own));
  });

  it('keeps them out of its settings, which change the post when media appear', async () => {
    await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('int-1'),
      state: withPosts(true),
    });

    expect(seen.settings).toEqual(shown(own));
  });

  it('keeps them out of what the composer saves', async () => {
    const { ref } = await render('int-1', {
      Channel: WithSettings,
      pending: pendingFor('int-1'),
      state: withPosts(true),
    });

    expect(ref.current!.getValues().values).toEqual(own);
  });
});
