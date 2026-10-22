import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

// Opening a post saved for several channels: the composer is loaded with every
// channel the post was saved with, each with its own settings, content and
// date, and opens on the channel that was clicked. The composer itself is out
// of scope here, so it is a probe that only shows it was reached.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/new-launch/manage.modal', () => ({
  ManageModal: () => <div data-manage />,
}));

import {
  AddEditModal,
  AddEditModalProps,
} from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

dayjs.extend(utc);

const channel = (id: string, identifier: string) => ({
  id,
  identifier,
  name: `Sharek on ${identifier}`,
  picture: '',
  disabled: false,
  inBetweenSteps: false,
  additionalSettings: '[]',
});

const channels = [
  channel('int-1', 'x'),
  channel('int-2', 'linkedin'),
  channel('int-3', 'facebook'),
] as unknown as AddEditModalProps['integrations'];

const post = (id: string, content: string, publishDate: string) => ({
  id,
  content,
  publishDate,
  delay: 0,
  image: '[]',
  intervalInDays: null as number | null,
  tags: [] as unknown[],
});

const SIBLING_DATE = '2026-11-03T15:30:00.000Z';

const existing = {
  integration: 'int-1',
  group: 'group-1',
  settings: { __type: 'x', who: 'opened' },
  posts: [post('post-1', '<p>Opened</p>', '2026-11-01T10:00:00.000Z')],
  siblings: [
    {
      integration: 'int-2',
      group: 'group-2',
      settings: { __type: 'linkedin', who: 'sibling' },
      posts: [post('post-2', '<p class="x">Already markup</p>', SIBLING_DATE)],
    },
    {
      integration: 'int-3',
      group: 'group-3',
      settings: { __type: 'facebook' },
      posts: [
        post('post-3', 'First line\nSecond line', '2026-11-04T08:00:00.000Z'),
      ],
    },
    // a channel deleted since the post was saved
    {
      integration: 'int-9',
      group: 'group-9',
      settings: {},
      posts: [post('post-9', '<p>Gone</p>', '2026-11-05T08:00:00.000Z')],
    },
  ],
};

// The store is one for the page: a composer left open by an earlier case
// would answer the next case's reset with its own effects.
let root: Root | undefined;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = undefined;
});

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    useLaunchStore.getState().reset();
    root = createRoot(host);
    root.render(
      <ExistingDataContextProvider value={existing}>
        <AddEditModal
          date={dayjs('2026-11-01T10:00:00')}
          integrations={channels}
          allIntegrations={channels}
          reopenModal={() => undefined}
          mutate={() => undefined}
        />
      </ExistingDataContextProvider>
    );
  });
  return host;
};

const state = () => useLaunchStore.getState();

const contentOf = (id: string) =>
  state()
    .internal.find((p) => p.integration.id === id)
    ?.integrationValue.map((value) => value.content);

describe('opening a post saved for several channels', () => {
  it('reaches the composer', async () => {
    expect((await render()).querySelector('[data-manage]')).toBeTruthy();
  });

  it('selects each channel the post was saved with, with its own settings', async () => {
    await render();

    expect(
      state().selectedIntegrations.map((p) => [p.integration.id, p.settings])
    ).toEqual([
      ['int-1', { __type: 'x', who: 'opened' }],
      ['int-2', { __type: 'linkedin', who: 'sibling' }],
      ['int-3', { __type: 'facebook' }],
    ]);
  });

  it("gives each channel its own content, keeping a body that is already markup", async () => {
    await render();

    expect(contentOf('int-1')).toEqual(['<p>Opened</p>']);
    expect(contentOf('int-2')).toEqual(['<p class="x">Already markup</p>']);
    expect(contentOf('int-3')).toEqual(['<p>First line</p><p>Second line</p>']);
  });

  it('gives each other channel its own date, in local time', async () => {
    await render();

    const dates = state().channelDates;
    expect(Object.keys(dates).sort()).toEqual(['int-2', 'int-3']);
    expect(dates['int-2'].valueOf()).toBe(Date.parse(SIBLING_DATE));
    expect(dates['int-2'].isUTC()).toBe(false);
  });

  it('opens on the channel that was clicked', async () => {
    await render();

    expect(state().current).toBe('int-1');
  });

  it('leaves out a channel that no longer exists', async () => {
    await render();

    expect(state().selectedIntegrations.map((p) => p.integration.id)).not.toContain(
      'int-9'
    );
    expect(contentOf('int-9')).toBeUndefined();
    expect(state().channelDates).not.toHaveProperty('int-9');
  });
});
