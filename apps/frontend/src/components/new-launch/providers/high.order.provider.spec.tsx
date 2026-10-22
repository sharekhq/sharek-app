import 'reflect-metadata';
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';

// Every channel's provider: its preview and settings read the channel's own
// date, and a save that failed on the channel brings it into view through the
// handle the composer holds.
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

type Store = ReturnType<typeof useLaunchStore.getState>;
type Handle = { fix: () => void; preview: () => void };

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

const integration = {
  id: 'int-1',
  identifier: 'x',
  name: 'Sharek on X',
  picture: '',
  additionalSettings: '[]',
};

const render = async (current: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ref = createRef<Handle>();
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
    });
    createRoot(host).render(<Provider id="int-1" ref={ref} />);
  });
  return { host, ref };
};

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
