import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { range } from 'lodash';

// Spec 057 (research R5, R6; contracts/ui.md "MediaBox", "Delete"; FR-026,
// FR-035 to FR-040, FR-046). On the Media page a file is selected by its
// tile's circle. While anything is selected a tile click toggles it instead
// of opening the preview, and a selection bar takes the toolbar's place: how
// many are selected, Clear, and Delete. A month heading's Select all selects
// every file of the month under the list's type and search, loaded or not.
// Delete asks once, deletes every selected file through the one client delete
// path, says how many went or how many didn't, refreshes the list and its
// month counts and clears the selection; a new filter, sort or search clears
// it too. The Media Library window has none of it.
//
// The list is a double of useSWRInfinite holding the first page of the case's
// server, so a month can hold files not loaded yet; a heading's count is the
// server's files in its range. useMonthIds answers the server's ids in the
// month asked for, useDeleteMedia how many the case says failed, and
// useRefreshMediaLibrary records the list it was built for.

type Row = { id: string; name: string; path: string; createdAt: string };

// The case's server: every file, newest first, and the first key the list
// asked for at each render.
const mockServer = { rows: [] as Row[], keys: [] as string[] };
const mockInMonth = (month: { from: string; to: string }) =>
  mockServer.rows.filter((row) => {
    const at = Date.parse(row.createdAt);
    return at >= Date.parse(month.from) && at < Date.parse(month.to);
  });
const mockMonth = (key: string) => {
  const params = new URLSearchParams(key.split('?')[1]);
  return { from: params.get('from')!, to: params.get('to')! };
};

jest.mock('swr/infinite', () => ({
  __esModule: true,
  default: (getKey: (index: number) => string) => {
    mockServer.keys.push(getKey(0));
    return {
      data: [
        {
          pages: Math.max(1, Math.ceil(mockServer.rows.length / 32)),
          results: mockServer.rows.slice(0, 32),
        },
      ],
      size: 1,
      setSize: async () => undefined,
      mutate: async () => undefined,
      isLoading: false,
      isValidating: false,
    };
  },
}));
// A month heading's count; any other key gets nothing.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => ({
    data: key.startsWith('/media/month?')
      ? { count: mockInMonth(mockMonth(key)).length }
      : undefined,
    mutate: async () => undefined,
  }),
  useSWRConfig: () => ({ mutate: async () => undefined }),
}));
// The key, so a case reads which words are shown, whatever their wording; the
// calls are kept, so a case reads what a counted word was told.
const mockT = jest.fn<string, [string, string?, Record<string, unknown>?]>(
  (key) => key
);
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));
const mockToast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: (...args: unknown[]) => mockToast(...args) }),
}));
// The month's ids, loaded or not; the delete, answering how many failed; the
// refresh, recording the list it was built for. The other hooks stay real.
const mockMonthIds = jest.fn(
  async (_query: unknown, month: { from: string; to: string }) =>
    mockInMonth(month).map((row) => row.id)
);
const mockDelete = { failed: 0 };
const mockDeleteMedia = jest.fn<Promise<number>, [string[]]>(
  async () => mockDelete.failed
);
const mockRefreshed: unknown[] = [];
jest.mock('@gitroom/frontend/components/media/use.media.library', () => ({
  ...jest.requireActual('@gitroom/frontend/components/media/use.media.library'),
  useMonthIds: () => mockMonthIds,
  useDeleteMedia: () => mockDeleteMedia,
  useRefreshMediaLibrary: (query: unknown) => async () => {
    mockRefreshed.push(query);
  },
}));
// The one question Delete asks, answered as the case says.
const mockDialog = { answer: true };
const mockDeleteDialog = jest.fn<Promise<boolean>, unknown[]>(
  async () => mockDialog.answer
);
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => mockDeleteDialog(...args),
}));
// What a tile opens, as the modal manager gets it.
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    closeAll: () => {},
    closeCurrent: () => {},
    openModal: (...args: unknown[]) => mockOpenModal(...args),
  }),
  ModalHeaderSlot: () => null,
  ModalHeaderSlotTarget: () => null,
}));
// Scenery from here down, as in media.component.months.spec.tsx.
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    on: () => {},
    off: () => {},
    addFiles: () => {},
    addFile: () => {},
  }),
}));
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ results: [] }) }),
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => undefined,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: {}, totalChannels: 1 }),
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
jest.mock('@gitroom/react/helpers/video.frame', () => ({
  VideoFrame: () => null,
}));
jest.mock('react-sortablejs', () => ({
  ReactSortable: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@gitroom/frontend/components/ui/empty.state', () => ({
  EmptyState: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));

import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { setUserTimezone } from '@gitroom/frontend/components/layout/set.timezone';

// The end of the list never comes into view here, so no further page loads.
class InertObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
// The component reads the global; happy-dom's window has its own.
const scopes = [globalThis, window] as unknown as Array<{
  IntersectionObserver?: unknown;
}>;
const realObservers = scopes.map((scope) => scope.IntersectionObserver);

beforeAll(() => {
  scopes.forEach((scope) => {
    scope.IntersectionObserver = InertObserver;
  });
});
afterAll(() => {
  scopes.forEach((scope, index) => {
    scope.IntersectionObserver = realObservers[index];
  });
});

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

// `count` files of November 2026, newest first: from the 27th at noon UTC,
// six hours apart, clear of the month's edges in any timezone.
const november = (count: number): Row[] =>
  range(count).map((k) => ({
    id: `n${k}`,
    name: `n${k}.png`,
    path: `https://media/n${k}.png`,
    createdAt: new Date(
      Date.UTC(2026, 10, 27, 12) - k * 6 * 3600000
    ).toISOString(),
  }));
// November 2026 in New York, as UTC instants.
const novemberInNewYork = {
  from: '2026-11-01T04:00:00Z',
  to: '2026-12-01T05:00:00Z',
};

const roots: Array<{ unmount: () => void }> = [];

const mount = async (
  props: { standalone?: boolean } = { standalone: true }
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      <MediaBox setMedia={() => {}} closeModal={() => {}} {...props} />
    );
  });
  await settle();
};

const press = async (node: HTMLElement | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.click();
  });
  await settle();
};
// A tile is the button its file's name titles; its circle is the pressable
// button beside it.
const tile = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[title="${name}"]`);
const circleOf = (name: string) =>
  tile(name)?.parentElement?.querySelector<HTMLButtonElement>(
    'button[aria-pressed]'
  );
const ticked = () =>
  Array.from(document.querySelectorAll('button[title]'))
    .filter(
      (node) =>
        node.parentElement
          ?.querySelector('button[aria-pressed]')
          ?.getAttribute('aria-pressed') === 'true'
    )
    .map((node) => node.getAttribute('title'));
// The selection bar's buttons, outside every month.
const barButton = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent === label && !node.closest('section')
  );
const bar = () => barButton('media_clear_selection')?.parentElement;
const heading = () =>
  document.querySelector('section')!.querySelector('h2')!.parentElement!;
const selectAll = () => heading().querySelector('button');
const searchInput = () =>
  document.querySelector(
    'input[placeholder="search_media_by_name"]'
  ) as HTMLInputElement;
const toolbarHidden = () => !!searchInput().closest('.hidden');
const classes = (node: Element) => Array.from(node.classList);
// What a word was last told: its count and value, for a counted one.
const said = (key: string) =>
  mockT.mock.calls.filter(([each]) => each === key).at(-1)?.[2];
const counted = (count: number) => ({
  count,
  value: count.toLocaleString('en-US'),
});
// The next Select all's answer, held back until the case releases it.
const holdMonthIds = () => {
  let answer = () => {};
  mockMonthIds.mockImplementationOnce(
    (_query, month) =>
      new Promise((resolve) => {
        answer = () => resolve(mockInMonth(month).map((row) => row.id));
      })
  );
  return async () => {
    await act(async () => {
      answer();
    });
    await settle();
  };
};

beforeEach(() => {
  mockServer.rows = [];
  mockServer.keys = [];
  mockDelete.failed = 0;
  mockDialog.answer = true;
  mockRefreshed.length = 0;
});

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  setUserTimezone(null);
  jest.clearAllMocks();
});

describe('selecting on the Media page', () => {
  it("selects a file with its circle, and the selection bar takes the toolbar's place with how many are selected, Clear and Delete", async () => {
    mockServer.rows = november(3);
    await mount();

    expect(bar()).toBeUndefined();
    expect(toolbarHidden()).toBe(false);

    await press(circleOf('n0.png'));

    expect(circleOf('n0.png')!.getAttribute('aria-pressed')).toBe('true');
    expect(toolbarHidden()).toBe(true);
    expect(bar()!.textContent).toContain('media_selected');
    expect(said('media_selected')).toEqual(counted(1));
    expect(barButton('delete')).toBeTruthy();

    await press(circleOf('n2.png'));

    expect(ticked()).toEqual(['n0.png', 'n2.png']);
    expect(said('media_selected')).toEqual(counted(2));
  });

  it('gives Clear and Delete 44px under a finger and the focus ring, and puts Delete at the end in white on the error colour with the trash glyph', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n1.png'));

    const clear = barButton('media_clear_selection')!;
    const remove = barButton('delete')!;

    [clear, remove].forEach((button) => {
      expect(button.getAttribute('type')).toBe('button');
      expect(classes(button)).toEqual(
        expect.arrayContaining([
          'coarse:min-h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
    expect(bar()!.lastElementChild).toBe(remove);
    expect(classes(remove)).toEqual(
      expect.arrayContaining(['ms-auto', 'bg-error', 'text-white'])
    );
    expect(remove.querySelector('svg')).toBeTruthy();
  });

  it("shows every tile's circle while anything is selected", async () => {
    mockServer.rows = november(3);
    await mount();

    expect(classes(circleOf('n2.png')!)).toContain('opacity-0');

    await press(circleOf('n0.png'));

    expect(classes(circleOf('n2.png')!)).toContain('opacity-100');
    expect(classes(circleOf('n2.png')!)).not.toContain('opacity-0');
  });

  it('toggles a file whose tile is clicked while anything is selected, instead of opening the preview', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n0.png'));

    await press(tile('n1.png'));
    expect(ticked()).toEqual(['n0.png', 'n1.png']);
    await press(tile('n0.png'));
    expect(ticked()).toEqual(['n1.png']);
    expect(mockOpenModal).not.toHaveBeenCalled();

    await press(tile('n1.png'));
    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();

    await press(tile('n2.png'));
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(ticked()).toEqual([]);
  });

  it('unselects everything on Clear and brings the toolbar back', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n0.png'));
    await press(circleOf('n1.png'));

    await press(barButton('media_clear_selection'));

    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();
    expect(toolbarHidden()).toBe(false);
  });
});

describe("a month heading's Select all", () => {
  it("selects every file of its month, loaded or not, asking useMonthIds under the list's query for the month's bounds, then reads Clear", async () => {
    setUserTimezone('America/New_York');
    mockServer.rows = november(40);
    await mount();

    expect(selectAll()!.textContent).toBe('media_select_all');

    await press(selectAll());

    expect(mockMonthIds).toHaveBeenCalledTimes(1);
    expect(mockMonthIds.mock.calls[0][0]).toEqual({
      type: undefined,
      sort: 'newest',
      search: '',
    });
    expect(mockMonthIds.mock.calls[0][1]).toEqual(novemberInNewYork);
    expect(said('media_selected')).toEqual(counted(40));
    expect(ticked()).toHaveLength(32);
    expect(selectAll()!.textContent).toBe('media_clear_selection');
  });

  it("unselects its month's files when it reads Clear and is pressed", async () => {
    mockServer.rows = november(40);
    await mount();
    await press(selectAll());

    await press(selectAll());

    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();
    expect(selectAll()!.textContent).toBe('media_select_all');
    expect(mockMonthIds).toHaveBeenCalledTimes(1);
  });

  it('turns back to Select all when one of its files is unticked', async () => {
    mockServer.rows = november(40);
    await mount();
    await press(selectAll());

    await press(circleOf('n0.png'));

    expect(said('media_selected')).toEqual(counted(39));
    expect(selectAll()!.textContent).toBe('media_select_all');
  });

  it('reads Clear for a month ticked by hand once all its files have loaded and are ticked', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n0.png'));
    await press(circleOf('n1.png'));

    expect(selectAll()!.textContent).toBe('media_select_all');

    await press(circleOf('n2.png'));

    expect(selectAll()!.textContent).toBe('media_clear_selection');
  });

  it('keeps Select all for a month ticked by hand while some of its files have not loaded', async () => {
    mockServer.rows = november(40);
    await mount();

    for (const k of range(32)) {
      await act(async () => {
        circleOf(`n${k}.png`)!.click();
      });
    }
    await settle();

    expect(ticked()).toHaveLength(32);
    expect(selectAll()!.textContent).toBe('media_select_all');
  });

  it('selects nothing when its answer comes after Clear, and selects its month when pressed again', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n0.png'));
    const release = holdMonthIds();
    await press(selectAll());

    await press(barButton('media_clear_selection'));
    await release();

    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();
    expect(selectAll()!.textContent).toBe('media_select_all');

    await press(selectAll());

    expect(ticked()).toEqual(['n0.png', 'n1.png', 'n2.png']);
    expect(selectAll()!.textContent).toBe('media_clear_selection');
  });

  it('counts the selection with its value formatted: 1,200 selected', async () => {
    mockServer.rows = november(3);
    mockMonthIds.mockResolvedValueOnce(range(1200).map((k) => `f${k}`));
    await mount();

    await press(selectAll());

    expect(said('media_selected')).toEqual({ count: 1200, value: '1,200' });
  });
});

describe('deleting the selection', () => {
  it('asks once, counted by the selection, then sends every selected file, loaded or not, through useDeleteMedia', async () => {
    mockServer.rows = november(40);
    await mount();
    await press(selectAll());

    await press(barButton('delete'));

    expect(mockDeleteDialog).toHaveBeenCalledTimes(1);
    expect(mockDeleteDialog).toHaveBeenCalledWith(
      'media_delete_body',
      'delete',
      'media_delete_title',
      'cancel',
      true
    );
    expect(said('media_delete_title')).toEqual(counted(40));
    expect(said('media_delete_body')).toEqual(counted(40));
    expect(mockDeleteMedia).toHaveBeenCalledTimes(1);
    expect([...mockDeleteMedia.mock.calls[0][0]].sort()).toEqual(
      november(40)
        .map((row) => row.id)
        .sort()
    );
  });

  it('says how many were deleted, refreshes the list and its month counts once and clears the selection, when all went', async () => {
    mockServer.rows = november(3);
    await mount();
    await press(circleOf('n0.png'));
    await press(circleOf('n2.png'));

    await press(barButton('delete'));

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('media_deleted', 'success');
    expect(said('media_deleted')).toEqual(counted(2));
    expect(mockRefreshed).toEqual([
      { type: undefined, sort: 'newest', search: '' },
    ]);
    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();
    expect(toolbarHidden()).toBe(false);
  });

  it('says how many were not deleted when some fail, and still refreshes once and clears the selection', async () => {
    mockServer.rows = november(3);
    mockDelete.failed = 2;
    await mount();
    await press(circleOf('n0.png'));
    await press(circleOf('n1.png'));
    await press(circleOf('n2.png'));

    await press(barButton('delete'));

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('media_not_deleted', 'warning');
    expect(said('media_not_deleted')).toEqual(counted(2));
    expect(mockRefreshed).toHaveLength(1);
    expect(ticked()).toEqual([]);
    expect(bar()).toBeUndefined();
  });

  it('sends nothing and changes nothing when the question is cancelled', async () => {
    mockServer.rows = november(3);
    mockDialog.answer = false;
    await mount();
    await press(circleOf('n0.png'));
    await press(circleOf('n1.png'));

    await press(barButton('delete'));

    expect(mockDeleteDialog).toHaveBeenCalledTimes(1);
    expect(mockDeleteMedia).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockRefreshed).toEqual([]);
    expect(ticked()).toEqual(['n0.png', 'n1.png']);
    expect(said('media_selected')).toEqual(counted(2));
  });
});

// FR-026. While anything is selected the toolbar is hidden, so a change
// reaches the list as a search typed just before a tick, landing after its
// debounce; the filter and the sort are changed on their hidden controls,
// the same change of list.
describe('a new filter, sort or search on the Media page', () => {
  const typeSearch = async () => {
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    await act(async () => {
      setValue.call(searchInput(), 'n');
      searchInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const nothing = async () => {};
  // Each change, after what the user did before ticking: the search is typed
  // just before, and lands once the ticks are in.
  const changes: Array<[string, () => Promise<void>, () => Promise<void>]> = [
    [
      'the filter',
      nothing,
      async () => {
        await press(
          Array.from(document.querySelectorAll('button')).find(
            (node) => node.textContent === 'media_filter_videos'
          )
        );
      },
    ],
    [
      'the sort',
      nothing,
      async () => {
        const select = document.querySelector(
          'select[aria-label="media_sort"]'
        ) as HTMLSelectElement;
        await act(async () => {
          select.value = 'oldest';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await settle();
      },
    ],
    [
      'the search',
      typeSearch,
      async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 350));
        });
        await settle();
      },
    ],
  ];

  it.each(changes)(
    'clears the selection on %s',
    async (_name, before, change) => {
      mockServer.rows = november(3);
      await mount();
      await before();
      await press(circleOf('n0.png'));
      await press(circleOf('n1.png'));
      expect(ticked()).toEqual(['n0.png', 'n1.png']);
      const lists = new Set(mockServer.keys).size;

      await change();

      expect(new Set(mockServer.keys).size).toBe(lists + 1);
      expect(ticked()).toEqual([]);
      expect(bar()).toBeUndefined();
    }
  );

  // FR-039: the month's ids a Select all asked for before the change are
  // another list's.
  it.each(changes)(
    'selects nothing when a Select all pressed before %s answers after it, and selects the month when pressed again',
    async (_name, before, change) => {
      mockServer.rows = november(3);
      await mount();
      await before();
      const release = holdMonthIds();
      await press(selectAll());
      const lists = new Set(mockServer.keys).size;

      await change();
      await release();

      expect(new Set(mockServer.keys).size).toBe(lists + 1);
      expect(ticked()).toEqual([]);
      expect(bar()).toBeUndefined();

      await press(selectAll());

      expect(ticked()).toEqual(['n0.png', 'n1.png', 'n2.png']);
    }
  );
});

// FR-046: the window picks in order and hands back; it never selects to
// delete.
describe('the Media Library window', () => {
  it('has no circle, no Select all and no selection bar, even with picks', async () => {
    mockServer.rows = november(3);
    await mount({});

    expect(circleOf('n0.png')).toBeNull();
    expect(selectAll()).toBeNull();

    await press(tile('n0.png'));

    expect(circleOf('n0.png')).toBeNull();
    expect(selectAll()).toBeNull();
    expect(bar()).toBeUndefined();
    expect(barButton('delete')).toBeUndefined();
    expect(toolbarHidden()).toBe(false);
  });
});
