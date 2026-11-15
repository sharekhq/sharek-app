import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Spec 057 (contracts/ui.md "TilePicture", research R8). The file inside a
// media library tile: the small tile image when the storage made one, the
// original when it didn't or when the tile image fails, and for a video a still
// with a play badge that never falls back to loading the video. The whole file
// shows, letterboxed on the recess, and no tile shows a length.

// A visible mark, so a case can tell the hook's answer from the bare path.
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => `directory:${path}` }),
}));
// The frame reports a length the way a real video's metadata would, so a tile
// that showed one would show it here.
jest.mock('@gitroom/react/helpers/video.frame', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    VideoFrame: ({
      url,
      className,
      onLoadedMetadata,
    }: {
      url: string;
      className?: string;
      onLoadedMetadata?: (video: HTMLVideoElement) => void;
    }) => {
      useEffect(() => {
        onLoadedMetadata?.({ duration: 75 } as HTMLVideoElement);
      }, [onLoadedMetadata]);
      return <span data-frame="" data-url={url} className={className} />;
    },
  };
});

// The fallback with {{var}} filled in, because that is what t() renders.
const mockT = jest.fn(
  (key: string, fallback?: string, params?: Record<string, unknown>) =>
    (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
      params && name in params ? String(params[name]) : whole
    )
);
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));
// A month's count as SWR gives it to useMediaMonthCount: nothing until the
// case answers one. The keys asked for are kept.
const mockCount: { value?: number; keys: string[] } = { keys: [] };
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => {
    mockCount.keys.push(key);
    return {
      data:
        mockCount.value === undefined ? undefined : { count: mockCount.value },
    };
  },
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
// A tile opens the library's preview itself: it hands what libraryPreviewModal
// builds to the modal manager. Both are doubles that keep their calls.
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: mockOpenModal }),
}));
const mockLibraryPreviewModal = jest.fn<{ preview: boolean }, unknown[]>(
  () => ({ preview: true })
);
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  libraryPreviewModal: (...args: unknown[]) => mockLibraryPreviewModal(...args),
}));
// A month's "Select all" asks for its ids through useMonthIds: a double that
// keeps its calls and answers what the case sets. What it says goes through
// the toaster, a double that keeps its calls too.
const mockMonthIds = jest.fn<Promise<string[]>, unknown[]>(async () => []);
jest.mock('@gitroom/frontend/components/media/use.media.library', () => ({
  ...jest.requireActual('@gitroom/frontend/components/media/use.media.library'),
  useMonthIds: () => mockMonthIds,
}));
const mockToast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: (...args: unknown[]) => mockToast(...args) }),
}));

import {
  MediaMonth,
  MediaTile,
  TilePicture,
} from '@gitroom/frontend/components/media/media.library';
import type { MediaLibraryQuery } from '@gitroom/frontend/components/media/use.media.library';

const image = { path: 'https://uploads/a.png' };
const imageWithTile = {
  path: 'https://uploads/a.png',
  tileImage: 'https://uploads/cdn-cgi/image/width=400/a.png',
};
const video = { path: 'https://uploads/b.mp4' };
const videoWithTile = {
  path: 'https://uploads/b.mp4',
  tileImage: 'https://uploads/cdn-cgi/media/mode=frame,width=400/b.mp4',
};

const roots: Array<{ unmount: () => void }> = [];

const render = (
  media: { path: string; tileImage?: string },
  corner?: 'start' | 'end'
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(<TilePicture media={media} name="Beach day" corner={corner} />);
  });
  return host;
};

const fail = (element: Element) => {
  act(() => {
    element.dispatchEvent(new Event('error'));
  });
};

const badge = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).find((node) =>
    node.classList.contains('bg-black/60')
  );

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('TilePicture', () => {
  it('draws an image from its tile image, whole, lazily, named by the name given', () => {
    const host = render(imageWithTile);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(imageWithTile.tileImage);
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].classList.contains('w-full')).toBe(true);
    expect(images[0].classList.contains('h-full')).toBe(true);
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[0].getAttribute('decoding')).toBe('async');
    expect(images[0].getAttribute('alt')).toBe('Beach day');
    expect(badge(host)).toBeUndefined();
  });

  it('shows the original when the tile image fails, and stays on it when that fails too', () => {
    const host = render(imageWithTile);
    const original = 'directory:https://uploads/a.png';

    fail(host.querySelector('img')!);
    expect(host.querySelector('img')!.getAttribute('src')).toBe(original);

    fail(host.querySelector('img')!);
    expect(host.querySelectorAll('img')).toHaveLength(1);
    expect(host.querySelector('img')!.getAttribute('src')).toBe(original);
  });

  it('draws an image without a tile image from the original, as today', () => {
    const host = render(image);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(
      'directory:https://uploads/a.png'
    );
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].getAttribute('alt')).toBe('Beach day');
  });

  it('draws a video with a tile image as its still and the play badge, and no video', () => {
    const host = render(videoWithTile);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(videoWithTile.tileImage);
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[0].getAttribute('decoding')).toBe('async');
    expect(images[0].getAttribute('alt')).toBe('Beach day');
    expect(badge(host)).toBeDefined();
    expect(host.querySelector('video')).toBeNull();
    expect(host.querySelector('[data-frame]')).toBeNull();
  });

  it('swaps a failed still for the neutral placeholder with the play badge, never a video', () => {
    const host = render(videoWithTile);

    fail(host.querySelector('img')!);

    const placeholder = host.querySelector('[role="img"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.getAttribute('aria-label')).toBe('Beach day');
    expect(host.querySelector('img')).toBeNull();
    expect(badge(host)).toBeDefined();
    expect(host.querySelector('video')).toBeNull();
    expect(host.querySelector('[data-frame]')).toBeNull();
  });

  it('draws a video without a tile image with its frame from the original, whole, with the play badge', () => {
    const host = render(video);
    const frame = host.querySelector('[data-frame]');

    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('data-url')).toBe(
      'directory:https://uploads/b.mp4'
    );
    expect(frame!.classList.contains('object-contain')).toBe(true);
    expect(frame!.classList.contains('object-cover')).toBe(false);
    expect(host.querySelector('img')).toBeNull();
    expect(badge(host)).toBeDefined();
  });

  it('shows no length on any tile', () => {
    const still = render(videoWithTile);
    const frame = render(video);
    const placeholder = render(videoWithTile);
    fail(placeholder.querySelector('img')!);

    [still, frame, placeholder].forEach((host) => {
      expect(host.textContent).not.toMatch(/\d+:\d\d/);
    });
  });

  it('puts the play badge over the file in the start corner by default, hidden from assistive technology', () => {
    const host = render(video);
    const play = badge(host)!;

    expect(play.getAttribute('aria-hidden')).toBe('true');
    expect(play.classList.contains('text-white')).toBe(true);
    expect(play.classList.contains('h-[20px]')).toBe(true);
    expect(play.classList.contains('top-[6px]')).toBe(true);
    expect(play.classList.contains('start-[6px]')).toBe(true);
    expect(play.classList.contains('end-[6px]')).toBe(false);
    expect(play.querySelector('svg')).not.toBeNull();
  });

  it('puts the play badge in the end corner when the caller gives it', () => {
    const play = badge(render(video, 'end'))!;

    expect(play.classList.contains('top-[6px]')).toBe(true);
    expect(play.classList.contains('end-[6px]')).toBe(true);
    expect(play.classList.contains('start-[6px]')).toBe(false);
  });

  it('sits in a square on the recess', () => {
    [image, imageWithTile, video, videoWithTile].forEach((media) => {
      const square = render(media).firstElementChild!;

      expect(square.classList.contains('bg-panel')).toBe(true);
      expect(square.classList.contains('w-full')).toBe(true);
      expect(square.classList.contains('h-full')).toBe(true);
    });
  });

  it('never draws the cover a row carries in thumbnail', () => {
    const cover = 'https://uploads/cover.jpg';
    const hosts = [image, imageWithTile, video, videoWithTile].map((media) =>
      render({ ...media, thumbnail: cover } as typeof media)
    );
    fail(hosts[1].querySelector('img')!);
    fail(hosts[3].querySelector('img')!);

    hosts.forEach((host) => {
      expect(host.innerHTML).not.toContain('cover.jpg');
    });
  });
});

// Spec 057 (contracts/ui.md "MediaMonth", research R4). A month of the list: a
// heading with the month's name and how many files it holds under the list's
// type and search, over today's grid of its tiles. The heading stays at the top
// while its month's tiles scroll under it, until the next month's heading takes
// its place, which holds because each heading is sticky inside its own month's
// section.
describe('MediaMonth', () => {
  const query: MediaLibraryQuery = {
    type: 'video',
    sort: 'newest',
    search: 'eid',
  };
  // November and October 2026 in New York, as UTC instants.
  const november = {
    label: 'November 2026',
    from: '2026-11-01T04:00:00Z',
    to: '2026-12-01T05:00:00Z',
  };
  const october = {
    label: 'October 2026',
    from: '2026-10-01T04:00:00Z',
    to: '2026-11-01T04:00:00Z',
  };

  beforeEach(() => {
    mockCount.value = undefined;
    mockCount.keys = [];
    mockT.mockClear();
  });

  // Renders the months given, each holding two tiles named after it, and
  // answers a render that draws them again (after a case answers the count).
  const renderMonths = (months = [november]) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    const draw = () => {
      act(() => {
        root.render(
          <>
            {months.map((month) => (
              <MediaMonth
                key={month.label}
                query={query}
                label={month.label}
                from={month.from}
                to={month.to}
              >
                <div data-tile={`${month.label} 1`} />
                <div data-tile={`${month.label} 2`} />
              </MediaMonth>
            ))}
          </>
        );
      });
    };
    draw();
    return { host, draw };
  };

  const sections = (host: HTMLElement) => Array.from(host.children);
  const heading = (section: Element) => section.children[0] as HTMLElement;
  const grid = (section: Element) => section.children[1] as HTMLElement;

  it('names the month with the label it is given', () => {
    const { host } = renderMonths();

    expect(heading(sections(host)[0]).textContent).toContain('November 2026');
  });

  it("shows the month's count through media_month_files, with count and value, muted", () => {
    mockCount.value = 1234;
    const { host } = renderMonths();

    const head = heading(sections(host)[0]);
    expect(mockT).toHaveBeenCalledWith(
      'media_month_files',
      expect.any(String),
      { count: 1234, value: '1,234' }
    );
    expect(head.textContent).toContain('1,234 files');
    const count = Array.from(head.querySelectorAll('*')).find(
      (node) => node.textContent === '1,234 files'
    );
    expect(count!.classList.contains('text-muted')).toBe(true);
  });

  it("asks the count for its own month under the list's type and search", () => {
    mockCount.value = 23;
    renderMonths([november, october]);

    const asked = mockCount.keys.map((key) => {
      const [path, search] = key.split('?');
      const params = new URLSearchParams(search);
      return [path, params.get('from'), params.get('to'), params.get('type')];
    });
    expect(asked).toContainEqual([
      '/media/month',
      november.from,
      november.to,
      'video',
    ]);
    expect(asked).toContainEqual([
      '/media/month',
      october.from,
      october.to,
      'video',
    ]);
    expect(
      mockCount.keys.every(
        (key) => new URLSearchParams(key.split('?')[1]).get('search') === 'eid'
      )
    ).toBe(true);
  });

  it('shows a skeleton bar and no count until the count answers', () => {
    const { host, draw } = renderMonths();
    const head = () => heading(sections(host)[0]);

    expect(head().querySelector('.animate-pulse')).not.toBeNull();
    expect(head().textContent).not.toContain('files');

    mockCount.value = 23;
    draw();

    expect(head().querySelector('.animate-pulse')).toBeNull();
    expect(head().textContent).toContain('23 files');
  });

  it("pins its heading at the top on the list's background, above the tiles' controls", () => {
    const { host } = renderMonths();

    const head = heading(sections(host)[0]);
    expect(head.classList.contains('sticky')).toBe(true);
    expect(head.classList.contains('top-0')).toBe(true);
    expect(head.classList.contains('bg-newBgColorInner')).toBe(true);
    // The highest of today's tile controls is the window's order badge,
    // z-[101]; TilePicture's play badge is z-[30].
    const layer = Array.from(head.classList)
      .map((name) => /^z-\[(\d+)\]$/.exec(name))
      .find(Boolean);
    expect(layer).toBeDefined();
    expect(Number(layer![1])).toBeGreaterThan(101);
  });

  it("keeps each heading inside its own month's section, so the next month's heading pushes it up", () => {
    const { host } = renderMonths([november, october]);

    const [first, second] = sections(host);
    expect(sections(host)).toHaveLength(2);
    expect(heading(first).textContent).toContain('November 2026');
    expect(heading(second).textContent).toContain('October 2026');
    expect(first.contains(heading(second))).toBe(false);
    expect(
      grid(first).querySelector('[data-tile="November 2026 1"]')
    ).not.toBeNull();
    expect(
      grid(second).querySelector('[data-tile="October 2026 1"]')
    ).not.toBeNull();
  });

  it("lays its tiles out on today's grid", () => {
    const { host } = renderMonths();

    const tiles = grid(sections(host)[0]);
    [
      'grid',
      'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]',
      '2xl:grid-cols-8',
      'mobile:grid-cols-2',
      'gap-[6px]',
      'mobile:gap-0',
    ].forEach((name) => {
      expect(tiles.classList.contains(name)).toBe(true);
    });
  });

  it('renders the tiles it is given inside its grid, not its heading', () => {
    const { host } = renderMonths();

    const section = sections(host)[0];
    expect(
      Array.from(grid(section).children).map((tile) =>
        tile.getAttribute('data-tile')
      )
    ).toEqual(['November 2026 1', 'November 2026 2']);
    expect(heading(section).querySelector('[data-tile]')).toBeNull();
  });

  // The pinning is plain CSS and the heading itself never moves. Only the
  // skeleton bar pulses, which global.scss's prefers-reduced-motion rule stops.
  it('never animates its heading', () => {
    const { host, draw } = renderMonths();
    const head = () => heading(sections(host)[0]);
    const moves = (node: Element) => /animate-|transition/.test(node.className);

    expect(moves(sections(host)[0])).toBe(false);
    expect(moves(head())).toBe(false);

    mockCount.value = 23;
    draw();

    expect(moves(head())).toBe(false);
    expect(Array.from(head().querySelectorAll('*')).some(moves)).toBe(false);
  });

  // FR-046: the window's months have no "Select all".
  it('has no Select all in the Media Library window', () => {
    const { host } = renderMonths();

    expect(heading(sections(host)[0]).querySelector('button')).toBeNull();
  });

  // Spec 057 (contracts/ui.md "MediaMonth", research R5; FR-039). On the Media
  // page each heading has "Select all", which asks for every id of its month
  // under the list's type and search, loaded or not, and selects them. It
  // reads "Clear" while every id of the month is selected: the ids its Select
  // all fetched, or, for a month ticked by hand, its loaded files once they
  // are all of its files (loaded = its count).
  describe('on the Media page', () => {
    const onSelectAll = jest.fn();
    const onClear = jest.fn();

    beforeEach(() => {
      mockMonthIds.mockReset();
      mockMonthIds.mockResolvedValue([]);
      mockToast.mockClear();
      onSelectAll.mockClear();
      onClear.mockClear();
    });

    // November with the loaded files `ids` (two tiles), the page's selection
    // and the ids its Select all fetched.
    const renderPageMonth = ({
      ids = ['n1', 'n2'],
      selected = [] as string[],
      fetched,
    }: {
      ids?: string[];
      selected?: string[];
      fetched?: string[];
    } = {}) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      roots.push(root);
      act(() => {
        root.render(
          <MediaMonth
            query={query}
            label={november.label}
            from={november.from}
            to={november.to}
            selection={{
              ids,
              selected: new Set(selected),
              fetched,
              onSelectAll,
              onClear,
            }}
          >
            <div data-tile="1" />
            <div data-tile="2" />
          </MediaMonth>
        );
      });
      return host;
    };
    const selectAll = (host: HTMLElement) =>
      heading(sections(host)[0]).querySelector('button')!;
    const classes = (node: Element) => Array.from(node.classList);
    const press = async (node: HTMLElement) => {
      await act(async () => {
        node.click();
      });
    };

    it("has Select all at the heading's end, in brand text, 13px semibold, 44px high under a finger, with the focus ring", () => {
      const button = selectAll(renderPageMonth());

      expect(button).toBeTruthy();
      expect(button.getAttribute('type')).toBe('button');
      expect(button.textContent).toBe('Select all');
      expect(mockT).toHaveBeenCalledWith('media_select_all', 'Select all');
      expect(classes(button)).toEqual(
        expect.arrayContaining([
          'ms-auto',
          'text-brandText',
          'text-[13px]',
          'font-[600]',
          'coarse:min-h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });

    // An `opacity: 0` button is still hit-tested, so Select all, like the
    // tile's circle, takes a press only once it shows.
    it("shows Select all on hover of its month, through the month's named group, on focus and always under a finger, and is pressable only while it shows", () => {
      const host = renderPageMonth();
      const section = sections(host)[0];

      expect(classes(section)).toContain('group/month');
      expect(classes(section)).not.toContain('group');
      expect(classes(selectAll(host))).toEqual(
        expect.arrayContaining([
          'opacity-0',
          'pointer-events-none',
          'group-hover/month:opacity-100',
          'group-hover/month:pointer-events-auto',
          'focus-visible:opacity-100',
          'focus-visible:pointer-events-auto',
          'coarse:opacity-100',
          'coarse:pointer-events-auto',
        ])
      );
      expect(classes(selectAll(host))).not.toContain('group-hover:opacity-100');
      expect(classes(selectAll(host))).not.toContain(
        'group-hover:pointer-events-auto'
      );
    });

    it('shows Select all, pressable, while anything is selected, of any month', () => {
      const button = selectAll(renderPageMonth({ selected: ['o4'] }));

      expect(button.textContent).toBe('Select all');
      expect(classes(button)).toEqual(
        expect.arrayContaining(['opacity-100', 'pointer-events-auto'])
      );
      expect(classes(button)).not.toContain('opacity-0');
      expect(classes(button)).not.toContain('pointer-events-none');
    });

    it("asks useMonthIds for the month's ids under the list's query when pressed, and selects them all, loaded or not", async () => {
      mockMonthIds.mockResolvedValue(['n1', 'n2', 'n3']);
      const host = renderPageMonth();

      await press(selectAll(host));

      expect(mockMonthIds).toHaveBeenCalledTimes(1);
      expect(mockMonthIds).toHaveBeenCalledWith(query, {
        from: november.from,
        to: november.to,
      });
      expect(onSelectAll).toHaveBeenCalledTimes(1);
      expect(onSelectAll).toHaveBeenCalledWith(['n1', 'n2', 'n3']);
      expect(onClear).not.toHaveBeenCalled();
    });

    it('reads Clear once every id its Select all fetched is selected, and unselects them, asking for nothing', async () => {
      const host = renderPageMonth({
        selected: ['n1', 'n2', 'n3'],
        fetched: ['n1', 'n2', 'n3'],
      });

      expect(selectAll(host).textContent).toBe('Clear');
      expect(mockT).toHaveBeenCalledWith('media_clear_selection', 'Clear');
      await press(selectAll(host));

      expect(onClear).toHaveBeenCalledTimes(1);
      expect(onClear).toHaveBeenCalledWith(['n1', 'n2', 'n3']);
      expect(mockMonthIds).not.toHaveBeenCalled();
      expect(onSelectAll).not.toHaveBeenCalled();
    });

    it('turns back to Select all when one id its Select all fetched is unselected', () => {
      const host = renderPageMonth({
        selected: ['n1', 'n3'],
        fetched: ['n1', 'n2', 'n3'],
      });

      expect(selectAll(host).textContent).toBe('Select all');
    });

    it('reads Clear for a month ticked by hand once all its files have loaded and are selected, loaded meaning its count', async () => {
      mockCount.value = 2;
      const all = renderPageMonth({ selected: ['n1', 'n2'] });
      mockCount.value = 3;
      const partly = renderPageMonth({ selected: ['n1', 'n2'] });
      mockCount.value = undefined;
      const uncounted = renderPageMonth({ selected: ['n1', 'n2'] });

      expect(selectAll(all).textContent).toBe('Clear');
      expect(selectAll(partly).textContent).toBe('Select all');
      expect(selectAll(uncounted).textContent).toBe('Select all');
      await press(selectAll(all));
      expect(onClear).toHaveBeenCalledWith(['n1', 'n2']);
    });

    it("says error_occurred and selects nothing when the month's ids fail to load", async () => {
      mockMonthIds.mockRejectedValue(
        new Error("Failed to load the month's files")
      );
      const host = renderPageMonth();

      await press(selectAll(host));

      expect(onSelectAll).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        'An error occurred. Please try again.',
        'warning'
      );
    });
  });
});

// Spec 057 (contracts/ui.md "MediaTile", research R14). On the Media page the
// whole tile is one button that opens the library's preview on its file, over
// the list the page shows. It has no corner buttons of its own: no preview
// button and no delete, which the preview carries now.
// The rows and helpers both surfaces' tiles are read with.
type Row = {
  id: string;
  name: string;
  originalName: string | null;
  path: string;
  tileImage?: string;
  createdAt: Date;
};
const query: MediaLibraryQuery = {
  type: 'image',
  sort: 'oldest',
  search: 'beach',
};
const photo: Row = {
  id: 'm1',
  name: 'f3a9c2.png',
  originalName: 'Beach day.png',
  path: 'https://uploads/a.png',
  createdAt: new Date('2026-11-10T12:00:00.000Z'),
};
// `originalName` is nullable; `name` never is.
const clip: Row = {
  id: 'm2',
  name: 'clip.mp4',
  originalName: null,
  path: 'https://uploads/b.mp4',
  tileImage: 'https://uploads/cdn-cgi/media/mode=frame,width=400/b.mp4',
  createdAt: new Date('2026-11-10T12:00:00.000Z'),
};
const onDeleted = jest.fn();

const tileButton = (host: HTMLElement, name = 'Beach day.png') =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
// The caption: the innermost element holding the name.
const caption = (host: HTMLElement, name = 'Beach day.png') =>
  Array.from(host.querySelectorAll('div'))
    .filter((node) => node.textContent === name)
    .at(-1);

describe('MediaTile on the Media page', () => {
  const onToggle = jest.fn();

  beforeEach(() => {
    mockOpenModal.mockClear();
    mockLibraryPreviewModal.mockClear();
    mockT.mockClear();
    onDeleted.mockClear();
    onToggle.mockClear();
  });

  // `selected`: this file is; `selecting`: anything is (contracts/ui.md).
  const renderTile = (
    media: Row = photo,
    { selected, selecting }: { selected?: boolean; selecting?: boolean } = {}
  ) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        <MediaTile
          media={media}
          standalone={true}
          query={query}
          onDeleted={onDeleted}
          selected={selected}
          selecting={selecting}
          onToggle={onToggle}
        />
      );
    });
    return host;
  };

  // The selection circle, named by the file's name, and the ring it holds.
  const circle = (host: HTMLElement, name = 'Beach day.png') =>
    host.querySelector<HTMLButtonElement>(
      `button[aria-label="Select ${name}"]`
    );
  const ring = (host: HTMLElement) => circle(host)!.querySelector('span')!;
  const frame = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('div')).find((node) =>
      node.classList.contains('border-[4px]')
    )!;
  const classes = (node: Element) => Array.from(node.classList);

  it("is a button over the whole square, named by the file's name, with the focus ring", () => {
    const host = renderTile();
    const tile = tileButton(host)!;

    expect(tile).toBeTruthy();
    expect(tile.getAttribute('type')).toBe('button');
    expect(tile.classList.contains('w-full')).toBe(true);
    expect(tile.classList.contains('h-full')).toBe(true);
    expect(tile.classList.contains('focus-visible:ring-2')).toBe(true);
    expect(tile.classList.contains('focus-visible:ring-brand')).toBe(true);
    expect(tile.contains(host.querySelector('img'))).toBe(true);
  });

  it('names a file without an original name by its stored name', () => {
    const host = renderTile(clip);

    expect(tileButton(host, 'clip.mp4')).toBeTruthy();
    expect(tileButton(host, 'clip.mp4')!.getAttribute('title')).toBe(
      'clip.mp4'
    );
    expect(caption(host, 'clip.mp4')).toBeTruthy();
  });

  it('opens the library preview on its own file when clicked, with the query and onDeleted it was given', () => {
    const host = renderTile();

    expect(mockOpenModal).not.toHaveBeenCalled();
    act(() => {
      tileButton(host)!.click();
    });

    expect(mockLibraryPreviewModal).toHaveBeenCalledTimes(1);
    const [given, id, deleted] = mockLibraryPreviewModal.mock.calls[0];
    expect(given).toBe(query);
    expect(id).toBe('m1');
    expect(deleted).toBe(onDeleted);
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal.mock.calls[0][0]).toBe(
      mockLibraryPreviewModal.mock.results[0].value
    );
  });

  it('has no preview button and no delete button of its own: only the tile and its circle', () => {
    const host = renderTile();
    const buttons = Array.from(host.querySelectorAll('button'));

    expect(buttons).toHaveLength(2);
    expect(buttons).toEqual(
      expect.arrayContaining([tileButton(host), circle(host)])
    );
    expect(
      buttons.some((button) =>
        /preview|delete/i.test(button.getAttribute('aria-label') || '')
      )
    ).toBe(false);
  });

  it('puts the play badge in the end corner', () => {
    const host = renderTile(clip);
    const mark = badge(host)!;

    expect(mark).toBeTruthy();
    expect(mark.classList.contains('top-[6px]')).toBe(true);
    expect(mark.classList.contains('end-[6px]')).toBe(true);
    expect(mark.classList.contains('start-[6px]')).toBe(false);
  });

  it('shows the name on hover and always under a finger, at every width', () => {
    const host = renderTile();
    const name = caption(host)!;

    expect(name.classList.contains('opacity-0')).toBe(true);
    expect(name.classList.contains('group-hover:opacity-100')).toBe(true);
    expect(name.classList.contains('coarse:opacity-100')).toBe(true);
    expect(name.classList.contains('mobile:hidden')).toBe(false);
  });

  // Rule 17. The strip is dir="ltr". tailwindcss-rtl adds a physical side for
  // the page's direction to core's text-start, which outranks it, so in
  // Arabic a short name sat at the right; the arbitrary property is the
  // native start alone, which resolves against the strip's own direction.
  it("aligns the name to the start of the strip's own direction, not the page's", () => {
    const name = caption(renderTile())!;

    expect(name.getAttribute('dir')).toBe('ltr');
    expect(classes(name)).toContain('[text-align:start]');
    expect(classes(name)).not.toContain('text-start');
  });

  it("carries the file's name as the tile's title, and group on its square wrapper", () => {
    const host = renderTile();
    const wrapper = host.firstElementChild!;

    expect(tileButton(host)!.getAttribute('title')).toBe('Beach day.png');
    expect(wrapper.classList.contains('group')).toBe(true);
    expect(wrapper.classList.contains('aspect-square')).toBe(true);
    expect(wrapper.contains(tileButton(host))).toBe(true);
  });

  // FR-035 to FR-037, FR-050: the selection circle, in the top-start corner
  // (top-right in Arabic, by `start-`), beside the tile button.
  it('has a circle beside the tile button, never inside it, in the top start corner: a 40px hit box, 44px under a finger, holding a 24px ring, with the focus ring', () => {
    const host = renderTile();
    const tile = tileButton(host)!;
    const select = circle(host)!;

    expect(select).toBeTruthy();
    expect(select.getAttribute('type')).toBe('button');
    expect(select.getAttribute('aria-pressed')).toBe('false');
    expect(mockT).toHaveBeenCalledWith(
      'media_select_named',
      'Select {{name}}',
      { name: 'Beach day.png' }
    );
    expect(select.parentElement).toBe(tile.parentElement);
    expect(tile.contains(select)).toBe(false);
    expect(select.contains(tile)).toBe(false);
    expect(classes(select)).toEqual(
      expect.arrayContaining([
        'absolute',
        'top-0',
        'start-0',
        'w-[40px]',
        'h-[40px]',
        'coarse:w-[44px]',
        'coarse:h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(classes(select)).not.toContain('end-0');
    expect(classes(ring(host))).toEqual(
      expect.arrayContaining(['w-[24px]', 'h-[24px]', 'rounded-full'])
    );
  });

  it('shows the circle on hover and on focus, and always under a finger, while nothing is selected', () => {
    const select = circle(renderTile())!;

    expect(classes(select)).toEqual(
      expect.arrayContaining([
        'opacity-0',
        'pointer-events-none',
        'group-hover:opacity-100',
        'group-hover:pointer-events-auto',
        'focus-visible:opacity-100',
        'focus-visible:pointer-events-auto',
        'coarse:opacity-100',
        'coarse:pointer-events-auto',
      ])
    );
  });

  it('shows the circle on every tile while anything is selected', () => {
    const select = circle(renderTile(photo, { selecting: true }))!;

    expect(classes(select)).toEqual(
      expect.arrayContaining(['opacity-100', 'pointer-events-auto'])
    );
    expect(classes(select)).not.toContain('opacity-0');
    expect(classes(select)).not.toContain('pointer-events-none');
  });

  it('selects and unselects its file through onToggle when the circle is pressed, and opens nothing', () => {
    const unselected = renderTile();
    const selected = renderTile(photo, { selected: true, selecting: true });

    act(() => {
      circle(unselected)!.click();
    });
    act(() => {
      circle(selected)!.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(mockLibraryPreviewModal).not.toHaveBeenCalled();
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('shows a selected file with a white check in the filled brand circle, pressed, and the 4px brand frame, and an unselected one with neither', () => {
    const selected = renderTile(photo, { selected: true, selecting: true });
    const unselected = renderTile(photo, { selecting: true });

    expect(circle(selected)!.getAttribute('aria-pressed')).toBe('true');
    expect(classes(ring(selected))).toEqual(
      expect.arrayContaining(['bg-brand', 'text-white'])
    );
    expect(ring(selected).querySelector('svg')).toBeTruthy();
    expect(classes(frame(selected))).toContain('border-brand');
    expect(classes(frame(selected))).not.toContain('border-transparent');

    expect(circle(unselected)!.getAttribute('aria-pressed')).toBe('false');
    expect(classes(ring(unselected))).toContain('border-white');
    expect(classes(ring(unselected))).not.toContain('bg-brand');
    expect(ring(unselected).querySelector('svg')).toBeNull();
    expect(classes(frame(unselected))).toContain('border-transparent');
    expect(classes(frame(unselected))).not.toContain('border-brand');
  });

  it('toggles its file instead of opening the preview when clicked while anything is selected', () => {
    const selecting = renderTile(photo, { selecting: true });
    const browsing = renderTile();

    act(() => {
      tileButton(selecting)!.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(mockLibraryPreviewModal).not.toHaveBeenCalled();
    expect(mockOpenModal).not.toHaveBeenCalled();

    act(() => {
      tileButton(browsing)!.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
  });
});

// Spec 057 (contracts/ui.md "MediaTile", research R14; FR-043 to FR-046). In
// the Media Library window the tile picks and unpicks its file, numbered in
// the order picked, and a corner button beside it opens the library preview
// without touching the picks. Deleting is the preview's.
describe('MediaTile in the window', () => {
  const onToggle = jest.fn();

  beforeEach(() => {
    mockOpenModal.mockClear();
    mockLibraryPreviewModal.mockClear();
    mockT.mockClear();
    onDeleted.mockClear();
    onToggle.mockClear();
  });

  // `order` is the pick's number, absent while the file isn't picked.
  const renderTile = (media: Row = photo, order?: number) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => {
      root.render(
        <MediaTile
          media={media}
          query={query}
          onDeleted={onDeleted}
          order={order}
          onToggle={onToggle}
        />
      );
    });
    return host;
  };

  const expandButton = (host: HTMLElement) =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Open preview"]');
  // The pick's number: the element holding nothing but digits.
  const orderBadge = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('div')).find((node) =>
      /^\d+$/.test(node.textContent || '')
    );
  // The square's 4px frame, which turns brand while the file is picked.
  const frame = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('div')).find((node) =>
      node.classList.contains('border-[4px]')
    )!;
  const classes = (node: Element) => Array.from(node.classList);

  it("is a button over the whole square, named by the file's name, with the focus ring, that picks and unpicks its file through onToggle and opens nothing", () => {
    const unpicked = renderTile();
    const picked = renderTile(photo, 1);
    const tile = tileButton(unpicked)!;

    expect(tile).toBeTruthy();
    expect(tile.getAttribute('type')).toBe('button');
    expect(classes(tile)).toEqual(
      expect.arrayContaining([
        'w-full',
        'h-full',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(tile.contains(unpicked.querySelector('img'))).toBe(true);

    act(() => {
      tile.click();
    });
    act(() => {
      tileButton(picked)!.click();
    });

    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(mockLibraryPreviewModal).not.toHaveBeenCalled();
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it("shows the pick's number on its bottom end corner and a 4px brand frame while picked, and neither while not", () => {
    const picked = renderTile(photo, 2);
    const unpicked = renderTile(clip);
    const badge = orderBadge(picked)!;

    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('2');
    expect(classes(badge)).toEqual(
      expect.arrayContaining([
        'absolute',
        '-bottom-[10px]',
        '-end-[10px]',
        'bg-brand',
        'text-white',
      ])
    );
    expect(classes(frame(picked))).toContain('border-brand');
    expect(classes(frame(picked))).not.toContain('border-transparent');
    expect(orderBadge(unpicked)).toBeUndefined();
    expect(classes(frame(unpicked))).toContain('border-transparent');
    expect(classes(frame(unpicked))).not.toContain('border-brand');
  });

  it('has an expand button beside the tile button, never inside it, in the top end corner, 36px and 44px under a finger, with the focus ring', () => {
    const host = renderTile();
    const tile = tileButton(host)!;
    const expand = expandButton(host)!;

    expect(expand).toBeTruthy();
    expect(expand.getAttribute('type')).toBe('button');
    expect(expand.parentElement).toBe(tile.parentElement);
    expect(tile.contains(expand)).toBe(false);
    expect(expand.contains(tile)).toBe(false);
    expect(classes(expand)).toEqual(
      expect.arrayContaining([
        'absolute',
        'top-[6px]',
        'end-[6px]',
        'w-[36px]',
        'h-[36px]',
        'coarse:w-[44px]',
        'coarse:h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(classes(expand)).not.toContain('start-[6px]');
    expect(mockT).toHaveBeenCalledWith('open_preview', 'Open preview');
  });

  it('shows the expand button on hover and on focus, and always under a finger', () => {
    const expand = expandButton(renderTile())!;

    expect(expand).toBeTruthy();
    expect(classes(expand)).toEqual(
      expect.arrayContaining([
        'opacity-0',
        'pointer-events-none',
        'group-hover:opacity-100',
        'group-hover:pointer-events-auto',
        'focus-visible:opacity-100',
        'focus-visible:pointer-events-auto',
        'coarse:opacity-100',
        'coarse:pointer-events-auto',
      ])
    );
  });

  it('opens the library preview on its own file from the expand button, with the query and onDeleted it was given, and leaves the pick as it was', () => {
    const host = renderTile(photo, 1);

    act(() => {
      expandButton(host)!.click();
    });

    expect(mockLibraryPreviewModal).toHaveBeenCalledTimes(1);
    const [given, id, deleted] = mockLibraryPreviewModal.mock.calls[0];
    expect(given).toBe(query);
    expect(id).toBe('m1');
    expect(deleted).toBe(onDeleted);
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal.mock.calls[0][0]).toBe(
      mockLibraryPreviewModal.mock.results[0].value
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('puts the play badge in the start corner', () => {
    const mark = badge(renderTile(clip))!;

    expect(mark).toBeTruthy();
    expect(mark.classList.contains('top-[6px]')).toBe(true);
    expect(mark.classList.contains('start-[6px]')).toBe(true);
    expect(mark.classList.contains('end-[6px]')).toBe(false);
  });

  it('shows the name on hover and always under a finger, and hides it at 1025px and below', () => {
    const name = caption(renderTile())!;

    expect(classes(name)).toEqual(
      expect.arrayContaining([
        'opacity-0',
        'group-hover:opacity-100',
        'coarse:opacity-100',
        'mobile:hidden',
      ])
    );
  });

  it('has no circle and no delete button: only the tile and its expand button', () => {
    const host = renderTile(photo, 1);
    const buttons = Array.from(host.querySelectorAll('button'));

    expect(buttons).toHaveLength(2);
    expect(buttons).toEqual(
      expect.arrayContaining([tileButton(host), expandButton(host)])
    );
    expect(
      buttons.some((button) =>
        /select|delete/i.test(button.getAttribute('aria-label') || '')
      )
    ).toBe(false);
  });

  it("carries the file's name as the tile's title, and group on the square wrapper that holds both buttons", () => {
    const host = renderTile();
    const wrapper = host.firstElementChild!;

    expect(tileButton(host)!.getAttribute('title')).toBe('Beach day.png');
    expect(wrapper.classList.contains('group')).toBe(true);
    expect(wrapper.classList.contains('aspect-square')).toBe(true);
    expect(wrapper.contains(tileButton(host))).toBe(true);
    expect(wrapper.contains(expandButton(host))).toBe(true);
  });
});
