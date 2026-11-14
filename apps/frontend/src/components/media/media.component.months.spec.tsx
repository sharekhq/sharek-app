import { act as reactAct, ReactNode, useEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/ar';
import { chunk, range, uniq } from 'lodash';

// Spec 057 (research R2, R3, R16; contracts/ui.md "MediaBox"). The Media page
// and the Media Library window list every file under month headings, loading
// the next page of GET /media on their own as the end of the list comes into
// view: no page control, each file once, a month under one heading however
// many loads bring its files. While a page loads, placeholders stand where its
// files will be; at the end the list says so and asks for nothing more. A
// failed load keeps what is shown and asks again on Try again or when the end
// of the list comes back into view.
//
// The list is a double of useSWRInfinite that answers from the case's server
// page by page when the case says so, as SWR would. A month heading's count is
// a double of useSWR answering /media/month and nothing else, so today's paged
// list gets no pages. The end of the list is watched through a double of
// IntersectionObserver that calls back as a real one does: once when it starts
// observing, then only when the case moves the sentinel into or out of view,
// never on a re-render or when a load ends.
//
// Narrowing the list (research R9, R11, R16; contracts/ui.md "MediaBox"): a
// type filter (where the caller accepts more than one type) and a sort beside
// the search, each change starting the list again from the top; the Media page
// starts from its address and reports each change, the window starts afresh
// each time it opens and never touches the address. An empty library shows
// today's empty state; a filter or search that finds nothing says so and
// offers to clear them. An upload or an import refreshes the list and its
// month counts through useRefreshMediaLibrary, whose own spec pins what it
// refetches.

type Row = { id: string; name: string; path: string; createdAt: string };
type Page = { pages: number; results: Row[] };
type GetKey = (index: number, previous: Page | null) => string | null;

// GET /media as the case's server answers it (page n is server[n - 1];
// `instant`, as soon as a page is asked for), and what useSWRInfinite holds:
// the pages answered, the size asked for, the error of the last load and the
// pages being loaded. Every key asked for is kept.
const mockList = {
  server: [] as Page[],
  failing: new Set<number>(),
  instant: false,
  data: undefined as Page[] | undefined,
  size: 1,
  error: undefined as Error | undefined,
  pending: undefined as number[] | undefined,
  requests: [] as Array<string | null>,
  getKey: undefined as GetKey | undefined,
  listeners: new Set<() => void>(),
  setSize: jest.fn(),
  mutate: jest.fn(),
};

const notify = () => mockList.listeners.forEach((listener) => listener());

// The server answers the pages being loaded; a page in `failing` fails them.
const land = () => {
  const indexes = mockList.pending ?? [];
  mockList.pending = undefined;
  if (indexes.some((index) => mockList.failing.has(index + 1))) {
    mockList.error = new Error('Failed to load the files');
  } else {
    const data = [...(mockList.data ?? [])];
    indexes.forEach((index) => {
      data[index] = mockList.server[index] ?? {
        pages: mockList.server.length,
        results: [],
      };
    });
    mockList.data = data;
    mockList.error = undefined;
  }
};

// Asks for the pages at these indexes through the hook's own keys; a server
// that answers at once lands them before the list renders again.
const ask = (indexes: number[], announce = true) => {
  indexes.forEach((index) =>
    mockList.requests.push(mockList.getKey!(index, null))
  );
  mockList.pending = uniq([...(mockList.pending ?? []), ...indexes]);
  if (mockList.instant) {
    land();
  }
  if (announce) {
    notify();
  }
};

mockList.setSize.mockImplementation(
  async (next: number | ((size: number) => number)) => {
    mockList.size = typeof next === 'function' ? next(mockList.size) : next;
    const missing = range(mockList.data?.length ?? 0, mockList.size).filter(
      (index) => !mockList.pending?.includes(index)
    );
    if (missing.length) {
      ask(missing);
    } else {
      notify();
    }
    return mockList.data;
  }
);
// A bare mutate() refetches every page asked for, keeping the data shown.
mockList.mutate.mockImplementation(async () => {
  ask(range(0, Math.max(mockList.size, mockList.data?.length ?? 0)));
  return mockList.data;
});

function mockUseSWRInfinite(getKey: GetKey) {
  // A new key is another list, as SWR's: none of it cached, its first page
  // asked for.
  if (mockList.getKey && getKey(0, null) !== mockList.getKey(0, null)) {
    mockList.data = undefined;
    mockList.error = undefined;
    mockList.pending = undefined;
    mockList.size = 1;
  }
  mockList.getKey = getKey;
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    mockList.listeners.add(rerender);
    return () => {
      mockList.listeners.delete(rerender);
    };
  }, []);
  // Over an empty cache the first render already loads, as SWR's does. Pages
  // in the cache are not asked for again when the hook mounts.
  if (!mockList.data && !mockList.error && !mockList.pending) {
    ask(range(0, mockList.size), false);
  }
  return {
    data: mockList.data,
    size: mockList.size,
    setSize: mockList.setSize,
    mutate: mockList.mutate,
    error: mockList.error,
    isValidating: !!mockList.pending,
    isLoading: !!mockList.pending && !mockList.data,
  };
}

// The files of the case's server within a month heading's range.
const mockCount = (key: string) => {
  const params = new URLSearchParams(key.split('?')[1]);
  const from = Date.parse(params.get('from')!);
  const to = Date.parse(params.get('to')!);
  return mockList.server
    .flatMap((page) => page.results)
    .filter((row) => {
      const at = Date.parse(row.createdAt);
      return at >= from && at < to;
    }).length;
};
const mockMonthKeys: string[] = [];

jest.mock('swr/infinite', () => ({
  __esModule: true,
  default: (getKey: GetKey) => mockUseSWRInfinite(getKey),
}));
// A month heading's count; any other key, today's paged list among them, gets
// nothing.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => {
    if (!key.startsWith('/media/month?')) {
      return { data: undefined, mutate: async () => undefined };
    }
    mockMonthKeys.push(key);
    return {
      data: { count: mockCount(key) },
      mutate: async () => undefined,
    };
  },
  useSWRConfig: () => ({ mutate: async () => undefined }),
}));
// The key, so a case reads which words are shown, whatever their wording.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
// The real hook builds Uppy once and keeps the first render's callback, so
// this double keeps the first one too.
const mockUploader: {
  options?: { onUploadSuccess: (items: unknown[]) => Promise<void> };
} = {};
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: (options: {
    onUploadSuccess: (items: unknown[]) => Promise<void>;
  }) => {
    if (!mockUploader.options) {
      mockUploader.options = options;
    }
    return {
      on: () => {},
      off: () => {},
      addFiles: () => {},
      addFile: () => {},
    };
  },
}));
// The queries whose refresh ran, in order: the hooks stay real, but the
// refresh only records which list it was built for.
const mockRefreshed: unknown[] = [];
jest.mock('@gitroom/frontend/components/media/use.media.library', () => ({
  ...jest.requireActual('@gitroom/frontend/components/media/use.media.library'),
  useRefreshMediaLibrary: (query: unknown) => async () => {
    mockRefreshed.push(query);
  },
}));
// Scenery from here down, as in media.component.limit.spec.tsx.
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
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
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
  () => ({
    ThirdPartyMedia: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media-library',
  () => ({
    ThirdPartyMediaLibrary: ({ onImported }: { onImported: () => void }) => (
      <button type="button" onClick={onImported}>
        import
      </button>
    ),
  })
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
// Its title as an attribute, so the list's words stay the case's to read.
jest.mock('@gitroom/frontend/components/ui/empty.state', () => ({
  EmptyState: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <div data-empty-state={title}>{actions}</div>
  ),
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

// A case that overruns Jest's timeout runs on after Jest has moved to the
// next case, and an act() of its that overlaps one of the next case's leaves
// React's act queue broken, so every case after it renders nothing. Every
// act() here is this one: afterEach waits for the act() in flight, and an
// act() that ends after its case did holds that case there for good. React
// closes an act() scope each time its thenable's then() is called, so it is
// called once, by Promise.resolve.
const acting = { case: 0, inFlight: Promise.resolve() };
const act = async (callback: () => void | Promise<void>): Promise<void> => {
  const owner = acting.case;
  const run = Promise.resolve(reactAct(callback));
  acting.inFlight = run.then(
    () => undefined,
    () => undefined
  );
  await run;
  if (owner !== acting.case) {
    await new Promise<never>(() => undefined);
  }
};

// Whether the sentinel is in view, as the browser would report it.
const view = { inView: false };

class FakeObserver {
  targets = new Set<Element>();
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit
  ) {
    observers.push(this);
  }
  // A real observer reports where its target is once it starts watching, on
  // a later task.
  observe(target: Element) {
    this.targets.add(target);
    setTimeout(() => {
      if (this.targets.has(target)) {
        this.report([target]);
      }
    }, 0);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  takeRecords() {
    return [];
  }
  report(targets: Element[]) {
    this.callback(
      targets.map(
        (target) =>
          ({
            target,
            isIntersecting: view.inView,
            intersectionRatio: view.inView ? 1 : 0,
          } as unknown as IntersectionObserverEntry)
      ),
      this as unknown as IntersectionObserver
    );
  }
}
const observers: FakeObserver[] = [];
// The component reads the global; happy-dom's window has its own.
const scopes = [globalThis, window] as unknown as Array<{
  IntersectionObserver?: unknown;
}>;
const realObservers = scopes.map((scope) => scope.IntersectionObserver);

beforeAll(() => {
  scopes.forEach((scope) => {
    scope.IntersectionObserver = FakeObserver;
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

// The elements watched that are still on the page: the sentinel.
const sentinels = () =>
  observers.flatMap((observer) =>
    Array.from(observer.targets).filter((target) => target.isConnected)
  );
const watching = () =>
  observers.filter((observer) =>
    Array.from(observer.targets).some((target) => target.isConnected)
  );

// The user scrolls the sentinel into view (true) or out of it (false). A real
// observer calls back only when that changes.
const cross = async (inView: boolean) => {
  if (view.inView === inView) {
    return;
  }
  view.inView = inView;
  await act(async () => {
    watching().forEach((observer) =>
      observer.report(
        Array.from(observer.targets).filter((target) => target.isConnected)
      )
    );
  });
  await settle();
};

// The pages being loaded land, and the list renders them.
const answer = async () => {
  await act(async () => {
    land();
    notify();
  });
  await settle();
};

// A file of the library, made at a fixed instant.
const file = (id: string, createdAt: string, extension = 'png'): Row => ({
  id,
  name: `${id}.${extension}`,
  path: `https://media/${id}.${extension}`,
  createdAt,
});
// `count` files of one month, newest first: from the 27th at noon UTC, six
// hours apart, so up to 84 of them stay between the 6th and the 27th, clear of
// the month's edges in any timezone.
const monthFiles = (
  prefix: string,
  year: number,
  month: number,
  count: number
): Row[] =>
  range(count).map((k) =>
    file(
      `${prefix}${k}`,
      new Date(Date.UTC(year, month, 27, 12) - k * 6 * 3600000).toISOString()
    )
  );
const november = (count: number) => monthFiles('n', 2026, 10, count);
// The rows, newest first, as the server's pages of 32.
const serve = (rows: Row[]) => {
  const pages = chunk(rows, 32);
  mockList.server = pages.map((results) => ({
    pages: pages.length,
    results,
  }));
};
// The first `count` pages are already in SWR's cache.
const cache = (count: number) => {
  mockList.data = mockList.server.slice(0, count);
  mockList.size = count;
};
// The page numbers asked for, in order.
const asked = () =>
  mockList.requests.map((key) =>
    Number(new URLSearchParams(String(key).split('?')[1]).get('page'))
  );

const roots: Array<{ unmount: () => void }> = [];

type Query = {
  type?: 'image' | 'image-static' | 'video';
  sort: 'newest' | 'oldest';
  search: string;
};

const mount = async (props: {
  standalone?: boolean;
  type?: 'image' | 'image-static' | 'video';
  max?: number;
  setMedia?: (media: Array<{ id: string; path: string }>) => void;
  initialQuery?: Query;
  onQueryChange?: (query: Query) => void;
}) => {
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

const text = () => document.body.textContent ?? '';
const headings = () =>
  Array.from(document.querySelectorAll('h2')).map((node) => node.textContent);
// The tiles carry their file's name as a tooltip, whatever they draw inside.
const shown = () =>
  Array.from(document.querySelectorAll('[title]')).map((node) =>
    node.getAttribute('title')
  );
const tiles = (name: string) => document.querySelectorAll(`[title="${name}"]`);
const monthOf = (name: string) =>
  tiles(name)[0]?.closest('section')?.querySelector('h2')?.textContent;
const scroller = () =>
  document.querySelector('[title]')!.closest('.overflow-y-auto') as HTMLElement;
// Placeholders: a tile's is a pulsing square, a heading's a pulsing bar
// outside any square.
const skeletonTiles = () =>
  Array.from(document.querySelectorAll('.aspect-square')).filter(
    (cell) =>
      cell.matches('.animate-pulse') || !!cell.querySelector('.animate-pulse')
  );
const skeletonBars = () =>
  Array.from(document.querySelectorAll('.animate-pulse')).filter(
    (node) => !node.closest('.aspect-square')
  );
const precedes = (a: Node, b: Node) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent === label
  );
// The window's picks: a tile's click picks or unpicks it, its badge holds the
// pick's number, and Add hands the picks to the caller.
const pick = async (name: string) => {
  await act(async () => {
    (tiles(name)[0] as HTMLElement).click();
  });
  await settle();
};
const pickNumber = (name: string) =>
  tiles(name)[0]?.closest('.group')?.querySelector('.bg-brand')?.textContent;
const expandOf = (name: string) =>
  tiles(name)[0]
    ?.closest('.group')
    ?.querySelector<HTMLButtonElement>('button[aria-label="open_preview"]');
const addPicks = async () => {
  await act(async () => {
    button('add_selected_media')!.click();
  });
};
const handedBack = (setMedia: jest.Mock) =>
  (setMedia.mock.calls[0][0] as Row[]).map((row) => row.id);
// The ranges the month headings asked their counts for, in the order they
// first asked, as instants.
const ranges = () =>
  uniq(mockMonthKeys).map((key) => {
    const params = new URLSearchParams(key.split('?')[1]);
    return {
      from: Date.parse(params.get('from')!),
      to: Date.parse(params.get('to')!),
    };
  });

beforeEach(() => {
  mockList.server = [];
  mockList.failing = new Set();
  mockList.instant = false;
  mockList.data = undefined;
  mockList.size = 1;
  mockList.error = undefined;
  mockList.pending = undefined;
  mockList.requests = [];
  mockList.getKey = undefined;
  mockMonthKeys.length = 0;
  view.inView = false;
  observers.length = 0;
  mockUploader.options = undefined;
  mockRefreshed.length = 0;
});

afterEach(async () => {
  acting.case += 1;
  await acting.inFlight;
  await act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  setUserTimezone(null);
  dayjs.locale('en');
  jest.clearAllMocks();
});

describe.each([
  ['the Media page', { standalone: true }],
  ['the Media Library window', {}],
])('%s', (_surface, surface) => {
  describe('months', () => {
    it('shows one heading for a month whose files come on two pages, and a file on both pages once', async () => {
      const rows = november(40);
      serve(rows);
      // A file added between the loads pushed n31 onto page 2 as well.
      mockList.server[1].results.unshift(rows[31]);
      cache(2);

      await mount(surface);

      expect(headings()).toEqual(['November 2026']);
      expect(tiles('n31.png')).toHaveLength(1);
      expect(shown()).toHaveLength(40);
    });

    it('heads each month in list order with its name and year', async () => {
      serve([
        file('a', '2026-11-20T12:00:00.000Z'),
        file('b', '2026-11-10T12:00:00.000Z'),
        file('c', '2026-10-10T12:00:00.000Z'),
        file('d', '2026-08-10T12:00:00.000Z'),
      ]);

      await mount(surface);
      await answer();

      expect(headings()).toEqual([
        'November 2026',
        'October 2026',
        'August 2026',
      ]);
      expect(monthOf('b.png')).toBe('November 2026');
      expect(monthOf('c.png')).toBe('October 2026');
      expect(monthOf('d.png')).toBe('August 2026');
    });

    it('names the month in the interface language: نوفمبر 2026 in Arabic', async () => {
      dayjs.locale('ar');
      serve(november(2));

      await mount(surface);
      await answer();

      expect(headings()).toEqual(['نوفمبر 2026']);
    });

    it("groups by the user's timezone and gives each month its bounds there, as UTC instants", async () => {
      setUserTimezone('America/New_York');
      serve([
        file('mid', '2026-11-10T12:00:00.000Z'),
        // 23:30 on 31 October in New York
        file('edge', '2026-11-01T03:30:00.000Z'),
        file('oct', '2026-10-10T12:00:00.000Z'),
      ]);

      await mount(surface);
      await answer();

      expect(headings()).toEqual(['November 2026', 'October 2026']);
      expect(monthOf('edge.png')).toBe('October 2026');
      expect(ranges()).toEqual([
        {
          from: Date.parse('2026-11-01T04:00:00Z'),
          to: Date.parse('2026-12-01T05:00:00Z'),
        },
        {
          from: Date.parse('2026-10-01T04:00:00Z'),
          to: Date.parse('2026-11-01T04:00:00Z'),
        },
      ]);
    });

    it('gives a month no heading until one of its files has loaded', async () => {
      serve([...november(32), ...monthFiles('o', 2026, 9, 5)]);

      await mount(surface);
      await answer();
      expect(headings()).toEqual(['November 2026']);

      await cross(true);
      await answer();
      expect(headings()).toEqual(['November 2026', 'October 2026']);
    });
  });

  describe('loading as the list scrolls', () => {
    it('asks for the next page once when the sentinel shows, never while one loads, and never past the last', async () => {
      serve(november(80));

      await mount(surface);
      await answer();
      expect(shown()).toHaveLength(32);
      expect(sentinels()).toHaveLength(1);
      // watched within the list's own scroll box, a screen or so ahead
      const [observer] = watching();
      expect(observer.options?.root).toBe(scroller());
      expect(observer.options?.rootMargin).toMatch(/[1-9]/);
      expect(mockList.setSize).not.toHaveBeenCalled();

      await cross(true);
      expect(mockList.setSize).toHaveBeenCalledTimes(1);
      expect(mockList.size).toBe(2);

      await cross(false);
      await cross(true);
      expect(mockList.setSize).toHaveBeenCalledTimes(1);

      await cross(false);
      await answer();
      expect(mockList.setSize).toHaveBeenCalledTimes(1);

      await cross(true);
      expect(mockList.setSize).toHaveBeenCalledTimes(2);
      expect(mockList.size).toBe(3);

      // the last page lands with the sentinel still in view
      await answer();
      expect(mockList.setSize).toHaveBeenCalledTimes(2);
      expect(asked()).toEqual([1, 2, 3]);
      expect(shown()).toHaveLength(80);
    });

    it('keeps loading on its own while the sentinel stays in view as each page lands, as after a short first page', async () => {
      serve(november(80));
      view.inView = true;

      await mount(surface);
      expect(mockList.setSize).not.toHaveBeenCalled();

      await answer();
      expect(mockList.setSize).toHaveBeenCalledTimes(1);
      expect(mockList.size).toBe(2);

      await answer();
      expect(mockList.setSize).toHaveBeenCalledTimes(2);
      expect(mockList.size).toBe(3);

      await answer();
      expect(mockList.setSize).toHaveBeenCalledTimes(2);
      expect(asked()).toEqual([1, 2, 3]);
      expect(shown()).toHaveLength(80);
      expect(text()).toContain('media_end');
    });

    it('asks for page 1 again, once, when it mounts over a cache that holds it', async () => {
      serve(november(40));
      cache(1);

      await mount(surface);
      expect(shown()).toHaveLength(32);
      expect(mockList.mutate).toHaveBeenCalledTimes(1);
      expect(asked()).toEqual([1]);

      await answer();
      expect(mockList.mutate).toHaveBeenCalledTimes(1);
      expect(asked()).toEqual([1]);
    });

    it('sends a first load once, with no refetch of its own, over an empty cache', async () => {
      serve(november(3));

      await mount(surface);
      await answer();

      expect(shown()).toHaveLength(3);
      expect(mockList.mutate).not.toHaveBeenCalled();
      expect(asked()).toEqual([1]);
    });

    it('keeps the scroll box mounted where it was while the list refetches', async () => {
      serve(november(32));
      await mount(surface);
      await answer();
      expect(shown()).toHaveLength(32);
      const box = scroller();
      box.scrollTop = 480;
      mockList.server[0].results.unshift(
        file('fresh', '2026-11-28T12:00:00.000Z')
      );

      await act(async () => {
        await mockList.mutate();
      });
      await settle();
      expect(scroller()).toBe(box);
      expect(box.isConnected).toBe(true);
      expect(box.scrollTop).toBe(480);
      expect(shown()).toHaveLength(32);

      await answer();
      expect(scroller()).toBe(box);
      expect(box.scrollTop).toBe(480);
      expect(tiles('fresh.png')).toHaveLength(1);
    });

    it('draws no page control and no page numbers', async () => {
      serve(november(80));

      await mount(surface);
      await answer();

      expect(document.querySelector('[aria-current="page"]')).toBeNull();
      expect(
        document.querySelector(
          '[aria-label="aria_next_page"], [aria-label="aria_previous_page"]'
        )
      ).toBeNull();
      expect(text()).not.toMatch(/\d+ \/ \d+/);
    });
  });

  describe('placeholders and the end', () => {
    it('draws 32 skeleton tiles under a skeleton heading while the first page loads', async () => {
      serve(november(3));

      await mount(surface);
      const cells = skeletonTiles();
      expect(cells).toHaveLength(32);
      const bars = skeletonBars();
      expect(bars.length).toBeGreaterThan(0);
      expect(precedes(bars[0], cells[0])).toBe(true);
      expect(headings()).toEqual([]);

      await answer();
      expect(skeletonTiles()).toHaveLength(0);
      expect(skeletonBars()).toHaveLength(0);
      expect(shown()).toHaveLength(3);
    });

    it('draws one row of skeleton tiles after the last month while a further page loads', async () => {
      serve(november(40));
      await mount(surface);
      await answer();

      await cross(true);
      expect(asked()).toEqual([1, 2]);
      expect(shown()).toHaveLength(32);
      const cells = skeletonTiles();
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThanOrEqual(8);
      const months = document.querySelectorAll('section');
      const lastMonth = months[months.length - 1];
      cells.forEach((cell) => {
        expect(lastMonth.contains(cell)).toBe(false);
        expect(precedes(lastMonth, cell)).toBe(true);
      });

      await cross(false);
      await answer();
      expect(skeletonTiles()).toHaveLength(0);
      expect(shown()).toHaveLength(40);
    });

    it('ends on media_end with no sentinel and no skeleton once the last page has loaded', async () => {
      serve(november(40));
      await mount(surface);
      await answer();
      expect(shown()).toHaveLength(32);
      expect(text()).not.toContain('media_end');
      expect(sentinels()).toHaveLength(1);

      await cross(true);
      await answer();

      expect(asked()).toEqual([1, 2]);
      const end = Array.from(document.querySelectorAll('*')).find(
        (node) => node.textContent === 'media_end' && !node.children.length
      );
      expect(end?.closest('.text-muted')).not.toBeNull();
      expect(sentinels()).toHaveLength(0);
      expect(skeletonTiles()).toHaveLength(0);
      expect(skeletonBars()).toHaveLength(0);
    });
  });

  describe('a failed load', () => {
    const failOnPage2 = async () => {
      serve(november(80));
      mockList.failing.add(2);
      await mount(surface);
      await answer();
      await cross(true);
      await answer();
    };

    it('keeps the files shown and offers Try again, which asks again and loads the missing ones', async () => {
      await failOnPage2();

      expect(shown()).toHaveLength(32);
      expect(text()).toContain('media_load_failed');
      expect(mockList.mutate).not.toHaveBeenCalled();

      mockList.failing.clear();
      await act(async () => {
        button('try_again')!.click();
      });
      await settle();
      expect(mockList.mutate).toHaveBeenCalledTimes(1);

      await answer();
      expect(shown()).toHaveLength(64);
      expect(text()).not.toContain('media_load_failed');
    });

    it('asks nothing while the error stands, and asks again each time the sentinel comes back into view', async () => {
      await failOnPage2();
      expect(mockList.setSize).toHaveBeenCalledTimes(1);
      expect(mockList.mutate).not.toHaveBeenCalled();

      await cross(false);
      expect(mockList.mutate).not.toHaveBeenCalled();
      await cross(true);
      expect(mockList.mutate).toHaveBeenCalledTimes(1);

      // page 2 fails again
      await answer();
      expect(mockList.mutate).toHaveBeenCalledTimes(1);
      expect(text()).toContain('media_load_failed');

      await cross(false);
      await cross(true);
      expect(mockList.mutate).toHaveBeenCalledTimes(2);
      expect(mockList.setSize).toHaveBeenCalledTimes(1);
      expect(shown()).toHaveLength(32);
    });
  });

  // SC-010
  it('scrolls a 1,000-file library over 12 months to its end, each month heading once and no 33rd request', async () => {
    const months = [
      [2026, 10],
      [2026, 9],
      [2026, 8],
      [2026, 7],
      [2026, 6],
      [2026, 5],
      [2026, 4],
      [2026, 3],
      [2026, 2],
      [2026, 1],
      [2026, 0],
      [2025, 11],
    ];
    serve(
      months.flatMap(([year, month], index) =>
        monthFiles(`f${index}-`, year, month, index < 4 ? 84 : 83)
      )
    );
    expect(mockList.server).toHaveLength(32);

    await mount(surface);
    await answer();
    // From here the server answers each page as it is asked for, so the list
    // renders once a page: the sentinel stays in view and, as each page
    // lands, asks for the next on its own, with no second crossing.
    mockList.instant = true;
    await cross(true);

    expect(asked()).toEqual(range(1, 33));
    expect(headings()).toEqual([
      'November 2026',
      'October 2026',
      'September 2026',
      'August 2026',
      'July 2026',
      'June 2026',
      'May 2026',
      'April 2026',
      'March 2026',
      'February 2026',
      'January 2026',
      'December 2025',
    ]);
    expect(uniq(shown())).toHaveLength(1000);
    expect(shown()).toHaveLength(1000);
    expect(text()).toContain('media_end');
    expect(sentinels()).toHaveLength(0);
  });
});

// The window asks the server for its caller's type; whatever comes back is
// shown, with no second filter on the client (research R9).
describe('the Media Library window with a type', () => {
  it.each([
    ['image', 'clip', 'mp4'],
    ['image-static', 'photo', 'webp'],
    ['video', 'still', 'png'],
  ] as const)(
    'shows every row the server sends for %s, %s.%s included',
    async (type, id, extension) => {
      serve([
        file('first', '2026-11-20T12:00:00.000Z', 'jpg'),
        file(id, '2026-11-10T12:00:00.000Z', extension),
      ]);

      await mount({ type });
      await answer();

      expect(shown()).toEqual(['first.jpg', `${id}.${extension}`]);
    }
  );
});

describe('narrowing the list', () => {
  const filterGroup = () =>
    document.querySelector('[role="group"][aria-label="media_type_filter"]');
  const filterButtons = () =>
    Array.from(filterGroup()?.querySelectorAll('button') ?? []);
  const pressed = () =>
    filterButtons()
      .filter((node) => node.getAttribute('aria-pressed') === 'true')
      .map((node) => node.textContent);
  const sortSelect = () =>
    document.querySelector(
      'select[aria-label="media_sort"]'
    ) as HTMLSelectElement | null;
  const searchInput = () =>
    document.querySelector(
      'input[placeholder="search_media_by_name"]'
    ) as HTMLInputElement;
  const toolbarHidden = () => !!searchInput().closest('.hidden');
  const emptyState = () => document.querySelector('[data-empty-state]');
  const emptyTitle = () => emptyState()?.getAttribute('data-empty-state');
  const within = (node: Element | null, label: string) =>
    Array.from(node?.querySelectorAll('button') ?? []).find(
      (each) => each.textContent === label
    );
  // The last page asked for, as its parts in order.
  const lastAsked = () =>
    Array.from(
      new URLSearchParams(
        String(mockList.requests[mockList.requests.length - 1]).split('?')[1]
      ).entries()
    );

  const choose = async (label: string) => {
    await act(async () => {
      button(label)!.click();
    });
    await settle();
  };
  const sortBy = async (value: 'newest' | 'oldest') => {
    const select = sortSelect()!;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
  };
  const search = async (value: string) => {
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!;
    await act(async () => {
      setValue.call(searchInput(), value);
      searchInput().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  // The search reaches the list 300 ms after the last keystroke.
  const debounce = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await settle();
  };
  const unmountLast = () => act(() => roots.pop()!.unmount());

  describe.each([
    ['the Media page', { standalone: true }],
    ['the Media Library window without a type', {}],
  ])('%s', (_surface, surface) => {
    it('shows a type filter: All, Images and Videos pressed apart in a group named media_type_filter, All at first', async () => {
      serve(november(3));

      await mount(surface);
      await answer();

      expect(filterButtons().map((node) => node.textContent)).toEqual([
        'media_filter_all',
        'media_filter_images',
        'media_filter_videos',
      ]);
      filterButtons().forEach((node) =>
        expect(node.getAttribute('type')).toBe('button')
      );
      expect(pressed()).toEqual(['media_filter_all']);

      await choose('media_filter_videos');
      expect(pressed()).toEqual(['media_filter_videos']);
    });

    it('asks with type=video, sort=oldest and the trimmed search, all three together', async () => {
      serve(november(3));
      await mount(surface);
      await answer();

      await choose('media_filter_videos');
      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
      ]);
      await sortBy('oldest');
      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
        ['sort', 'oldest'],
      ]);
      await search('  ramadan  ');
      await debounce();

      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
        ['sort', 'oldest'],
        ['search', 'ramadan'],
      ]);
      expect(sortSelect()!.value).toBe('oldest');
    });

    it.each([
      ['the filter', () => choose('media_filter_images'), ['type', 'image']],
      ['the sort', () => sortBy('oldest'), ['sort', 'oldest']],
      [
        'the search',
        async () => {
          await search('eid');
          await debounce();
        },
        ['search', 'eid'],
      ],
    ] as const)(
      'starts the list again from page 1 and scrolls it to the top on a change of %s',
      async (_change, change, param) => {
        serve(november(40));
        await mount(surface);
        await answer();
        await cross(true);
        await cross(false);
        await answer();
        expect(shown()).toHaveLength(40);
        const box = scroller();
        box.scrollTop = 480;

        await change();

        expect(lastAsked()).toEqual([['page', '1'], param]);
        expect(box.isConnected).toBe(true);
        expect(box.scrollTop).toBe(0);
      }
    );

    it('shows today’s empty state with Upload and Import for an empty library, and hides the toolbar', async () => {
      serve([]);

      await mount(surface);
      await answer();

      expect(emptyTitle()).toBe('you_dont_have_any_media_yet');
      expect(within(emptyState(), 'upload')).toBeDefined();
      expect(within(emptyState(), 'import')).toBeDefined();
      expect(toolbarHidden()).toBe(true);
    });

    it('says media_no_type_match when the filter finds nothing, keeps the toolbar, and Show all clears the filter', async () => {
      serve(november(3));
      await mount(surface);
      await answer();
      serve([]);

      await choose('media_filter_videos');
      await answer();

      expect(emptyTitle()).toBe('media_no_type_match');
      expect(toolbarHidden()).toBe(false);
      serve(november(3));
      await act(async () => {
        within(emptyState(), 'media_show_all')!.click();
      });
      await settle();
      await answer();
      expect(pressed()).toEqual(['media_filter_all']);
      expect(lastAsked()).toEqual([['page', '1']]);
      expect(shown()).toHaveLength(3);
      expect(emptyState()).toBeNull();
    });

    it('says no_media_match_search when the search finds nothing', async () => {
      serve(november(3));
      await mount(surface);
      await answer();
      serve([]);

      await search('zzz');
      await debounce();
      await answer();

      expect(emptyTitle()).toBe('no_media_match_search');
      expect(toolbarHidden()).toBe(false);
    });

    it('offers Show all when the search finds nothing, which clears the search and the filter', async () => {
      serve(november(3));
      await mount(surface);
      await answer();
      serve([]);
      await choose('media_filter_videos');
      await answer();
      await search('zzz');
      await debounce();
      await answer();
      expect(emptyTitle()).toBe('no_media_match_search');
      serve(november(3));

      await act(async () => {
        within(emptyState(), 'media_show_all')!.click();
      });
      await debounce();
      await answer();

      expect(searchInput().value).toBe('');
      expect(pressed()).toEqual(['media_filter_all']);
      expect(lastAsked()).toEqual([['page', '1']]);
      expect(shown()).toHaveLength(3);
    });

    it('refreshes the list shown through useRefreshMediaLibrary, once after an upload and once after an import', async () => {
      serve(november(3));
      await mount(surface);
      await answer();
      await choose('media_filter_videos');
      await answer();

      await act(async () => {
        await mockUploader.options!.onUploadSuccess([]);
      });
      await settle();
      const shownQuery = { type: 'video', sort: 'newest', search: '' };
      expect(mockRefreshed).toEqual([shownQuery]);

      await act(async () => {
        button('import')!.click();
      });
      await settle();
      expect(mockRefreshed).toEqual([shownQuery, shownQuery]);
      expect(mockList.mutate).not.toHaveBeenCalled();
    });

    // Decided with the orchestrator on 2026-11-14: a library that couldn't
    // load isn't an empty one.
    it('shows only media_load_failed with Try again when the first load fails, not the empty state', async () => {
      serve(november(3));
      mockList.failing.add(1);

      await mount(surface);
      await answer();

      expect(text()).toContain('media_load_failed');
      expect(button('try_again')).toBeDefined();
      expect(emptyState()).toBeNull();
    });
  });

  describe.each([
    ['the Media page', { standalone: true }],
    ['the Media Library window', {}],
    ['the Media Library window with a type', { type: 'image' as const }],
  ])('%s', (_surface, surface) => {
    it('offers the sort as a native select named media_sort, Newest first at first', async () => {
      serve(november(3));

      await mount(surface);
      await answer();

      const select = sortSelect()!;
      expect(
        Array.from(select.options).map((option) => [
          option.value,
          option.textContent,
        ])
      ).toEqual([
        ['newest', 'media_sort_newest'],
        ['oldest', 'media_sort_oldest'],
      ]);
      expect(select.value).toBe('newest');
    });

    it('makes the filter’s buttons and the sort at least 44px high under a finger, each with the focus ring', async () => {
      serve(november(3));

      await mount(surface);
      await answer();

      const controls = [...filterButtons(), sortSelect()!];
      controls.forEach((node) => {
        const classes = node.className.split(/\s+/);
        expect(classes).toEqual(
          expect.arrayContaining([
            'focus-visible:ring-2',
            'focus-visible:ring-brand',
          ])
        );
        expect(
          classes.some((name) => /^(coarse:)?(min-)?h-\[44px\]$/.test(name))
        ).toBe(true);
      });
    });

    it('hides the toolbar while the library is empty and nothing is set', async () => {
      serve([]);

      await mount(surface);
      await answer();

      expect(toolbarHidden()).toBe(true);
    });
  });

  describe('the Media page', () => {
    it('starts from initialQuery', async () => {
      serve(november(3));

      await mount({
        standalone: true,
        initialQuery: { type: 'video', sort: 'oldest', search: 'ramadan' },
      });

      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
        ['sort', 'oldest'],
        ['search', 'ramadan'],
      ]);
      expect(pressed()).toEqual(['media_filter_videos']);
      expect(sortSelect()!.value).toBe('oldest');
      expect(searchInput().value).toBe('ramadan');
    });

    it('reports each change through onQueryChange, the search after its 300 ms debounce', async () => {
      serve(november(3));
      const onQueryChange = jest.fn();
      await mount({ standalone: true, onQueryChange });
      await answer();
      expect(onQueryChange).not.toHaveBeenCalled();

      await choose('media_filter_videos');
      expect(onQueryChange).toHaveBeenLastCalledWith({
        type: 'video',
        sort: 'newest',
        search: '',
      });
      await sortBy('oldest');
      expect(onQueryChange).toHaveBeenLastCalledWith({
        type: 'video',
        sort: 'oldest',
        search: '',
      });
      await search('ramadan');
      await settle();
      expect(onQueryChange).toHaveBeenCalledTimes(2);
      await debounce();

      expect(onQueryChange).toHaveBeenCalledTimes(3);
      expect(onQueryChange).toHaveBeenLastCalledWith({
        type: 'video',
        sort: 'oldest',
        search: 'ramadan',
      });
    });
  });

  describe('the Media Library window', () => {
    it.each(['image', 'image-static', 'video'] as const)(
      'opened with the type %s has no type filter and asks with that type on every load',
      async (type) => {
        serve(november(40));

        await mount({ type });
        await answer();
        await cross(true);
        await answer();

        expect(filterGroup()).toBeNull();
        expect(asked()).toEqual([1, 2]);
        mockList.requests.forEach((key) =>
          expect(
            new URLSearchParams(String(key).split('?')[1]).get('type')
          ).toBe(type)
        );
      }
    );

    it('opens on All, Newest first and an empty search each time it mounts', async () => {
      serve(november(3));
      await mount({});
      await answer();
      await choose('media_filter_videos');
      await sortBy('oldest');
      await search('ramadan');
      await debounce();
      await unmountLast();

      await mount({});

      expect(pressed()).toEqual(['media_filter_all']);
      expect(sortSelect()!.value).toBe('newest');
      expect(searchInput().value).toBe('');
      expect(lastAsked()).toEqual([['page', '1']]);
    });

    it('opened with a type, opens on that type, Newest first and an empty search each time it mounts', async () => {
      serve(november(3));
      await mount({ type: 'image' });
      await answer();
      await sortBy('oldest');
      await search('ramadan');
      await debounce();
      await unmountLast();

      await mount({ type: 'image' });

      expect(sortSelect()!.value).toBe('newest');
      expect(searchInput().value).toBe('');
      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'image'],
      ]);
    });

    it('never writes the address when its filter, sort and search change', async () => {
      const replace = jest.spyOn(window.history, 'replaceState');
      const push = jest.spyOn(window.history, 'pushState');
      serve(november(3));
      await mount({});
      await answer();

      await choose('media_filter_videos');
      await sortBy('oldest');
      await search('ramadan');
      await debounce();

      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
        ['sort', 'oldest'],
        ['search', 'ramadan'],
      ]);
      expect(replace).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      replace.mockRestore();
      push.mockRestore();
    });

    it('with its own type, clears only the search on Show all', async () => {
      serve(november(3));
      await mount({ type: 'video' });
      await answer();
      serve([]);
      await search('zzz');
      await debounce();
      await answer();
      expect(emptyTitle()).toBe('no_media_match_search');
      serve(november(3));

      await act(async () => {
        within(emptyState(), 'media_show_all')!.click();
      });
      await debounce();
      await answer();

      expect(searchInput().value).toBe('');
      expect(lastAsked()).toEqual([
        ['page', '1'],
        ['type', 'video'],
      ]);
      expect(shown()).toHaveLength(3);
    });

    it('with its own type and nothing of it, shows today’s empty state with Upload and Import titled media_no_type_match, no Show all and no toolbar', async () => {
      serve([]);

      await mount({ type: 'image' });
      await answer();

      expect(emptyTitle()).toBe('media_no_type_match');
      expect(within(emptyState(), 'upload')).toBeDefined();
      expect(within(emptyState(), 'import')).toBeDefined();
      expect(button('media_show_all')).toBeUndefined();
      expect(toolbarHidden()).toBe(true);
    });

    // FR-026: a new filter, sort or search starts the list again, but a
    // file picked before it is still handed back.
    it('keeps its picks and their numbers across a filter, sort or search change', async () => {
      const setMedia = jest.fn();
      serve(november(3));
      await mount({ setMedia });
      await answer();
      await pick('n2.png');
      await pick('n0.png');

      await choose('media_filter_videos');
      await answer();
      await sortBy('oldest');
      await answer();
      await search('n');
      await debounce();
      await answer();

      expect(pickNumber('n2.png')).toBe('1');
      expect(pickNumber('n0.png')).toBe('2');
      expect(pickNumber('n1.png')).toBeUndefined();
      await addPicks();
      expect(handedBack(setMedia)).toEqual(['n2', 'n0']);
    });
  });
});

describe("the Media Library window's picks", () => {
  // FR-045: the window's preview deletes through the list, and the file it
  // deletes leaves the picks; the picks after it move up a number.
  it('drops a file its preview deletes from the picks', async () => {
    const setMedia = jest.fn();
    serve(november(3));
    await mount({ setMedia });
    await answer();
    await pick('n0.png');
    await pick('n1.png');
    await pick('n2.png');

    await act(async () => {
      expandOf('n1.png')!.click();
    });
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const { onDeleted } = mockOpenModal.mock.calls[0][0].children.props;
    expect(onDeleted).toEqual(expect.any(Function));
    await act(async () => {
      onDeleted('n1');
    });

    expect(pickNumber('n0.png')).toBe('1');
    expect(pickNumber('n1.png')).toBeUndefined();
    expect(pickNumber('n2.png')).toBe('2');
    await addPicks();
    expect(handedBack(setMedia)).toEqual(['n0', 'n2']);
  });

  // FR-043, FR-049: an upload stays in the library and joins the picks
  // within the caller's limit, as today.
  it('adds an upload to the picks within max, as today', async () => {
    const setMedia = jest.fn();
    serve(november(3));
    await mount({ setMedia, max: 2 });
    await answer();
    await pick('n0.png');

    await act(async () => {
      await mockUploader.options!.onUploadSuccess([
        { id: 'u1', path: 'https://media/u1.png' },
        { id: 'u2', path: 'https://media/u2.png' },
      ]);
    });
    await settle();
    await addPicks();

    expect(handedBack(setMedia)).toEqual(['n0', 'u1']);
  });
});
