import { act, ReactElement, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { chunk, range } from 'lodash';

// The options the Media library's viewer opens with. Every one is load-bearing
// (see mediaPreviewModal), and Samy's chat opens the same viewer, so they live
// beside it rather than in two callers. The element is read, not rendered: what
// the viewer does with its items is the viewer's own business.
//
// Spec 057 (research R12, contracts/ui.md "The preview"): the viewer itself,
// rendered. It follows the file it shows by id, says the file's size, shape,
// length and date once it knows them, steps past the last loaded file by
// loading more and, in the media library, deletes the file it shows and moves
// on. The library opens it through libraryPreviewModal, over the list's own
// hook (a double here); Samy's chat through mediaPreviewModal, with no Delete
// and no date. The header renders in place, so a case reads it with the stage.

// The key, so a case reads which words are shown, whatever their wording. The
// calls are kept for the count a counted word is given.
const mockT = jest.fn((key: string) => key);
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => path }),
}));
const mockCloseCurrent = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  ModalHeaderSlot: ({ children }: { children: ReactNode }) => children,
  ModalHeaderSlotTarget: () => null,
  useModals: () => ({ closeCurrent: mockCloseCurrent }),
}));
const mockDeleteDialog = jest.fn<Promise<boolean>, unknown[]>(async () => true);
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => mockDeleteDialog(...args),
}));
const mockShow = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));
// The real step, watched.
jest.mock('@gitroom/helpers/utils/step.media.index', () => {
  const actual = jest.requireActual('@gitroom/helpers/utils/step.media.index');
  return { ...actual, stepMediaIndex: jest.fn(actual.stepMediaIndex) };
});

type Row = {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  tileImage?: string;
};

// The list behind the library's preview, as useMediaLibrary answers it: the
// files loaded and the loads still on the server, the next of which loadMore
// appends once it answers. A file the server deleted leaves the list when the
// refresh refetches it.
const mockLibrary = {
  files: [] as Row[],
  more: [] as Row[][],
  gone: new Set<string>(),
  queries: [] as unknown[],
  listeners: new Set<() => void>(),
  loadMore: jest.fn(),
  mutate: jest.fn(),
  deleteMedia: jest.fn<Promise<number>, [string[]]>(),
  refresh: jest.fn(),
};

const notify = () => mockLibrary.listeners.forEach((listener) => listener());

jest.mock('@gitroom/frontend/components/media/use.media.library', () => {
  const { useEffect, useReducer } = jest.requireActual('react');
  const useMediaLibraryMock = (query: unknown) => {
    mockLibrary.queries.push(query);
    const [, rerender] = useReducer((count: number) => count + 1, 0);
    useEffect(() => {
      mockLibrary.listeners.add(rerender);
      return () => {
        mockLibrary.listeners.delete(rerender);
      };
    }, []);
    return {
      files: mockLibrary.files,
      hasMore: mockLibrary.more.length > 0,
      loadMore: mockLibrary.loadMore,
      isLoading: false,
      isLoadingMore: false,
      error: undefined as Error | undefined,
      mutate: mockLibrary.mutate,
      refresh: mockLibrary.refresh,
    };
  };
  return {
    useMediaLibrary: useMediaLibraryMock,
    useDeleteMedia: () => mockLibrary.deleteMedia,
  };
});

import { ModalHeaderSlotTarget } from '@gitroom/frontend/components/layout/new-modal';
import { setUserTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { stepMediaIndex } from '@gitroom/helpers/utils/step.media.index';
import {
  LibraryPreview,
  libraryPreviewModal,
  MediaPreview,
  mediaPreviewModal,
} from '@gitroom/frontend/components/media/media.preview';

const items = [
  { id: 'a', name: 'a.png', path: 'https://media/a.png' },
  { id: 'b', name: 'b.mp4', path: 'https://media/b.mp4' },
];

describe('mediaPreviewModal', () => {
  it('keeps the card out of the centring branch, at the viewport less its margins', () => {
    expect(mediaPreviewModal(items, 1)).toMatchObject({
      top: 20,
      size: 'min(1120px, calc(100vw - 40px))',
      height: 'calc(100vh - 40px)',
      cardClassName: 'phone:!p-[16px]',
    });
  });

  it('gives the header to the viewer, through the slot in the title', () => {
    expect(mediaPreviewModal(items, 1).title.type).toBe(ModalHeaderSlotTarget);
  });

  it('opens the viewer on those items at that position', () => {
    const { children } = mediaPreviewModal(items, 1);

    expect(children.type).toBe(MediaPreview);
    expect(children.props).toEqual({ items, index: 1 });
  });
});

const ADDED = new Date('2026-11-10T12:00:00.000Z');
const row = (id: string): Row => ({
  id,
  name: `${id}.png`,
  path: `https://media/${id}.png`,
  createdAt: ADDED,
});
const [a, b, c, d, e, x] = ['a', 'b', 'c', 'd', 'e', 'x'].map(row);
const rows = [a, b, c];
const clip: Row = {
  id: 'v',
  name: 'v.mp4',
  path: 'https://media/v.mp4',
  createdAt: ADDED,
};
// What Samy's chat opens: a generated file's URL, no date.
const chatItem = {
  id: 'https://chat/x.png',
  path: 'https://chat/x.png',
  name: 'x.png',
};
const query = {
  type: 'image' as const,
  sort: 'oldest' as const,
  search: 'cat',
};

let host: HTMLElement;
let root: Root;
const unmounts: Array<() => void> = [];

const render = async (element: ReactElement) => {
  const mounted = document.createElement('div');
  document.body.appendChild(mounted);
  const created = createRoot(mounted);
  host = mounted;
  root = created;
  unmounts.push(() => {
    act(() => created.unmount());
    mounted.remove();
  });
  await act(async () => created.render(element));
};
const rerender = (element: ReactElement) =>
  act(async () => root.render(element));
// Lets every answer the case set off land (a dialog, a delete, a refetch).
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
const click = async (element: HTMLElement) => {
  await act(async () => element.click());
  await settle();
};
const press = async (key: string) => {
  await act(async () => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key, code: key, bubbles: true })
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keyup', { key, code: key, bubbles: true })
    );
  });
  await settle();
};

// The file on the stage, by the address it loads.
const shown = () => host.querySelector('img, video')?.getAttribute('src');
const control = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const deleteButton = () =>
  Array.from(host.querySelectorAll('button')).find(
    (button) =>
      button.textContent?.trim() === 'delete' ||
      button.getAttribute('aria-label') === 'delete'
  );
const pressDelete = async () => {
  const remove = deleteButton();
  expect(remove).toBeDefined();
  await click(remove!);
};
const bdis = () =>
  Array.from(host.querySelectorAll('bdi')).map((bdi) => [
    bdi.getAttribute('dir'),
    bdi.textContent,
  ]);
// The innermost element whose text holds `text`.
const holding = (text: string) =>
  Array.from(host.querySelectorAll('*'))
    .filter((element) => element.textContent?.includes(text))
    .pop();

const loadImage = async (width: number, height: number) => {
  const image = host.querySelector('img')!;
  Object.defineProperty(image, 'naturalWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(image, 'naturalHeight', {
    configurable: true,
    value: height,
  });
  await act(async () => {
    image.dispatchEvent(new Event('load'));
  });
};
const loadVideo = async (width: number, height: number, duration: number) => {
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'videoWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(video, 'videoHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(video, 'duration', {
    configurable: true,
    value: duration,
  });
  await act(async () => {
    video.dispatchEvent(new Event('loadedmetadata'));
  });
};
const failToLoad = async () => {
  const media = host.querySelector('img, video')!;
  await act(async () => {
    media.dispatchEvent(new Event('error'));
  });
};

// Opens the library's preview as the Media page and the window do.
const openLibrary = async (startId: string, onDeleted = jest.fn()) => {
  expect(libraryPreviewModal).toEqual(expect.any(Function));
  await render(libraryPreviewModal(query, startId, onDeleted).children);
  return onDeleted;
};

beforeEach(() => {
  mockT.mockClear();
  mockShow.mockReset();
  mockCloseCurrent.mockReset();
  mockDeleteDialog.mockReset().mockResolvedValue(true);
  (stepMediaIndex as jest.Mock).mockClear();
  mockLibrary.files = [];
  mockLibrary.more = [];
  mockLibrary.gone.clear();
  mockLibrary.queries = [];
  mockLibrary.mutate.mockReset();
  mockLibrary.loadMore.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    const next = mockLibrary.more.shift();
    if (next) {
      mockLibrary.files = [...mockLibrary.files, ...next];
      notify();
    }
  });
  mockLibrary.deleteMedia.mockReset().mockImplementation(async (ids) => {
    ids.forEach((id) => mockLibrary.gone.add(id));
    return 0;
  });
  mockLibrary.refresh.mockReset().mockImplementation(async () => {
    mockLibrary.files = mockLibrary.files.filter(
      (file) => !mockLibrary.gone.has(file.id)
    );
    notify();
  });
});

afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
  document.dir = '';
});

describe('MediaPreview: the details', () => {
  it.each([
    ['a picture', a],
    ['a video', clip],
  ])('holds no size and no shape before %s loads', async (_kind, file) => {
    await render(<MediaPreview items={[file, b]} index={0} />);

    expect(host.textContent).not.toMatch(/×|\d:\d/);
  });

  it('names a picture\'s size and shape once it loads, each in its own <bdi dir="ltr">, beside the date it was added', async () => {
    await render(<MediaPreview items={rows} index={0} />);
    await loadImage(1080, 1920);

    expect(bdis()).toEqual(
      expect.arrayContaining([
        ['ltr', '1080 × 1920'],
        ['ltr', '9:16'],
      ])
    );
    // newDayjs(createdAt).format('D MMM YYYY')
    expect(host.textContent).toContain('10 Nov 2026');
  });

  it('adds "Video" and its length for a video once its metadata loads', async () => {
    await render(<MediaPreview items={[clip, a]} index={0} />);
    await loadVideo(1920, 1080, 32);

    expect(bdis()).toEqual(
      expect.arrayContaining([
        ['ltr', '1920 × 1080'],
        ['ltr', '16:9'],
        ['ltr', '0:32'],
      ])
    );
    expect(host.textContent).toContain('media_preview_video');
    expect(host.textContent).toContain('10 Nov 2026');
  });

  it("never shows a size or a shape for a file that fails to load, nor the file before it's", async () => {
    await render(<MediaPreview items={rows} index={0} />);
    await loadImage(1080, 1920);
    expect(host.textContent).toContain('1080 × 1920');

    await click(control('next')!);
    await failToLoad();

    expect(shown()).toBe(b.path);
    expect(host.textContent).not.toMatch(/×|\d:\d/);
  });

  it.each([
    [
      'the library',
      () => <MediaPreview items={rows} index={0} onDelete={async () => true} />,
      ['1080 × 1920', '9:16', '10 Nov 2026'],
    ],
    [
      "Samy's chat",
      () => mediaPreviewModal([chatItem], 0).children,
      ['1080 × 1920', '9:16'],
    ],
  ])(
    'shows the details on every width, in %s',
    async (_surface, preview, details) => {
      await render(preview());
      await loadImage(1080, 1920);

      details.forEach((detail) => {
        const element = holding(detail);
        expect(element).toBeDefined();
        expect(element!.closest('[class*="phone:hidden"]')).toBeNull();
      });
    }
  );
});

describe('MediaPreview: stepping', () => {
  it('follows the file it shows by id when the list reloads in another order', async () => {
    await render(<MediaPreview items={rows} index={1} />);
    expect(shown()).toBe(b.path);

    // an upload lands at the top
    await rerender(<MediaPreview items={[x, a, b, c]} index={1} />);
    expect(shown()).toBe(b.path);

    await rerender(<MediaPreview items={[c, a, b]} index={1} />);
    expect(shown()).toBe(b.path);
  });

  it('at the last loaded file with more to load, next loads more, stays live, and moves on when the files arrive', async () => {
    const loadMore = jest.fn();
    await render(
      <MediaPreview items={rows} index={2} hasMore={true} loadMore={loadMore} />
    );

    expect(control('next')!.disabled).toBe(false);
    await click(control('next')!);

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(control('next')!.disabled).toBe(false);
    expect(shown()).toBe(c.path);

    await rerender(
      <MediaPreview
        items={[...rows, d, e]}
        index={2}
        hasMore={false}
        loadMore={loadMore}
      />
    );

    expect(shown()).toBe(d.path);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('the arrow key loads more there too, and moves on when the files arrive', async () => {
    const loadMore = jest.fn();
    await render(
      <MediaPreview items={rows} index={2} hasMore={true} loadMore={loadMore} />
    );

    await press('ArrowRight');
    expect(loadMore).toHaveBeenCalledTimes(1);

    await rerender(
      <MediaPreview
        items={[...rows, d]}
        index={2}
        hasMore={false}
        loadMore={loadMore}
      />
    );
    expect(shown()).toBe(d.path);
  });

  it('at the last file there is, next is disabled and nothing wraps', async () => {
    const loadMore = jest.fn();
    await render(
      <MediaPreview
        items={rows}
        index={2}
        hasMore={false}
        loadMore={loadMore}
      />
    );

    expect(control('next')!.disabled).toBe(true);
    expect(control('previous')!.disabled).toBe(false);
    await press('ArrowRight');

    expect(shown()).toBe(c.path);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it.each([
    ['ltr', 'ArrowRight', 'ArrowLeft'],
    ['rtl', 'ArrowLeft', 'ArrowRight'],
  ])(
    'steps with the arrow keys through stepMediaIndex, in %s on with %s and back with %s',
    async (dir, next, back) => {
      document.dir = dir;
      await render(<MediaPreview items={rows} index={1} />);

      await press(next);
      expect(shown()).toBe(c.path);
      await press(back);
      await press(back);
      expect(shown()).toBe(a.path);
      expect(stepMediaIndex).toHaveBeenCalledWith(
        expect.objectContaining({ rtl: dir === 'rtl' })
      );
    }
  );

  it('makes previous and next 40px buttons, 44px under coarse:, with the focus ring', async () => {
    await render(<MediaPreview items={rows} index={1} />);

    ['previous', 'next'].forEach((label) => {
      const button = control(label)!;
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
      expect(button.className.split(/\s+/)).toEqual(
        expect.arrayContaining([
          'w-[40px]',
          'h-[40px]',
          'coarse:w-[44px]',
          'coarse:h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it.each([
    [
      'the library',
      () => <MediaPreview items={rows} index={0} onDelete={async () => true} />,
    ],
    ["Samy's chat", () => mediaPreviewModal([chatItem], 0).children],
  ])('stands the file on the recess in %s', async (_surface, preview) => {
    await render(preview());

    const image = host.querySelector('img')!;
    expect(image.closest('.bg-panel')).not.toBeNull();
    expect(image.closest('.bg-surface2')).toBeNull();
  });

  it('keeps "Open original" at 30px and makes it 44px to tap under coarse:', async () => {
    await render(<MediaPreview items={rows} index={0} />);

    expect(
      host
        .querySelector('a[aria-label="open_original"]')!
        .className.split(/\s+/)
    ).toEqual(
      expect.arrayContaining([
        'h-[30px]',
        'coarse:min-h-[44px]',
        'coarse:min-w-[44px]',
      ])
    );
  });
});

describe('MediaPreview: Delete', () => {
  it("with onDelete, puts the file's month at the start of a footer under the stage and Delete at its end", async () => {
    await render(
      <MediaPreview items={rows} index={0} onDelete={async () => true} />
    );

    const remove = deleteButton()!;
    expect(remove).toBeDefined();
    expect(remove.getAttribute('type')).toBe('button');
    expect(remove.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'coarse:min-h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    // newDayjs(createdAt).format('MMMM YYYY'), as its month heading reads
    const month = holding('November 2026')!;
    expect(month).toBeDefined();
    let footer = remove.parentElement!;
    while (!footer.contains(month)) {
      footer = footer.parentElement!;
    }
    const image = host.querySelector('img')!;
    expect(footer.contains(image)).toBe(false);
    expect(image.parentElement!.contains(remove)).toBe(false);
    expect(
      image.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      month.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // the plain viewer has no footer
    await rerender(<MediaPreview items={rows} index={0} />);
    expect(deleteButton()).toBeUndefined();
    expect(host.textContent).not.toContain('November 2026');
  });

  it("names the date and the month in the user's timezone", async () => {
    setUserTimezone('America/New_York');
    try {
      const early = { ...a, createdAt: new Date('2026-11-01T03:30:00.000Z') };
      await render(
        <MediaPreview
          items={[early, b]}
          index={0}
          onDelete={async () => true}
        />
      );

      expect(host.textContent).toContain('31 Oct 2026');
      expect(holding('October 2026')).toBeDefined();
      expect(host.textContent).not.toContain('November 2026');
    } finally {
      setUserTimezone();
    }
  });

  it('asks once, titled and worded for one file, as a destructive choice', async () => {
    await render(
      <MediaPreview items={rows} index={1} onDelete={async () => true} />
    );
    await pressDelete();

    expect(mockDeleteDialog).toHaveBeenCalledTimes(1);
    expect(mockDeleteDialog).toHaveBeenCalledWith(
      'media_delete_body',
      'delete',
      'media_delete_title',
      'cancel',
      true
    );
    ['media_delete_title', 'media_delete_body'].forEach((key) =>
      expect(mockT).toHaveBeenCalledWith(
        key,
        expect.any(String),
        expect.objectContaining({ count: 1, value: '1' })
      )
    );
  });

  it('confirmed, hands onDelete the file and shows the one after it once it has gone', async () => {
    const onDelete = jest.fn(async () => true);
    await render(<MediaPreview items={rows} index={1} onDelete={onDelete} />);
    await pressDelete();

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(b);

    // the list refetches without it
    await rerender(
      <MediaPreview items={[a, c]} index={1} onDelete={onDelete} />
    );
    expect(shown()).toBe(c.path);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it('shows the one before only when the file was the very last', async () => {
    const onDelete = jest.fn(async () => true);
    await render(<MediaPreview items={rows} index={2} onDelete={onDelete} />);
    await pressDelete();

    await rerender(
      <MediaPreview items={[a, b]} index={2} onDelete={onDelete} />
    );
    expect(shown()).toBe(b.path);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it('closes when no file is left', async () => {
    await render(
      <MediaPreview items={[a]} index={0} onDelete={async () => true} />
    );
    await pressDelete();

    expect(mockCloseCurrent).toHaveBeenCalledTimes(1);
  });

  it('deleting the last loaded file while more can load loads more and shows the next file when it arrives, not the previous', async () => {
    const loadMore = jest.fn();
    const onDelete = jest.fn(async () => true);
    const preview = (list: Row[], hasMore: boolean) => (
      <MediaPreview
        items={list}
        index={2}
        hasMore={hasMore}
        loadMore={loadMore}
        onDelete={onDelete}
      />
    );
    await render(preview(rows, true));
    await pressDelete();

    expect(loadMore).toHaveBeenCalledTimes(1);

    await rerender(preview([a, b, d, e], false));
    expect(shown()).toBe(d.path);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it('cancelled, changes nothing', async () => {
    mockDeleteDialog.mockResolvedValue(false);
    const loadMore = jest.fn();
    const onDelete = jest.fn(async () => true);
    await render(
      <MediaPreview
        items={rows}
        index={1}
        hasMore={true}
        loadMore={loadMore}
        onDelete={onDelete}
      />
    );
    await pressDelete();

    expect(mockDeleteDialog).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(shown()).toBe(b.path);
    expect(loadMore).not.toHaveBeenCalled();
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it('stays on the file when onDelete answers that it did not go', async () => {
    const onDelete = jest.fn(async () => false);
    await render(<MediaPreview items={rows} index={1} onDelete={onDelete} />);
    await pressDelete();
    // the list refetches with it still there
    await rerender(<MediaPreview items={rows} index={1} onDelete={onDelete} />);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(b.path);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it("gives Samy's chat (mediaPreviewModal([item], 0)) no footer, no Delete, no date and no previous or next", async () => {
    await render(mediaPreviewModal([chatItem], 0).children);

    expect(deleteButton()).toBeUndefined();
    expect(control('previous')).toBeNull();
    expect(control('next')).toBeNull();
    expect(host.textContent).not.toMatch(/\b20\d\d\b|Invalid/);
  });
});

describe('libraryPreviewModal', () => {
  it("opens with today's modal options, the header in the title's slot and LibraryPreview as the body", () => {
    expect(libraryPreviewModal).toEqual(expect.any(Function));
    const options = libraryPreviewModal(query, 'b', jest.fn());

    expect(options).toMatchObject({
      top: 20,
      size: 'min(1120px, calc(100vw - 40px))',
      height: 'calc(100vh - 40px)',
      cardClassName: 'phone:!p-[16px]',
    });
    expect(options.title.type).toBe(ModalHeaderSlotTarget);
    expect(options.children.type).toBe(LibraryPreview);
  });

  it('reads the list through one useMediaLibrary(query), opens on startId with the original file, and refetches nothing when it mounts', async () => {
    mockLibrary.files = rows.map((file) => ({
      ...file,
      tileImage: `https://tiles/${file.id}.webp`,
    }));
    await openLibrary('b');

    expect(shown()).toBe(b.path);
    expect(mockLibrary.queries.length).toBeGreaterThan(0);
    mockLibrary.queries.forEach((asked) => expect(asked).toEqual(query));
    expect(mockLibrary.listeners.size).toBe(1);
    expect(mockLibrary.mutate).not.toHaveBeenCalled();
    expect(mockLibrary.refresh).not.toHaveBeenCalled();
    expect(mockLibrary.loadMore).not.toHaveBeenCalled();
  });

  it('steps past the loaded files by loading more, as the list behind it does', async () => {
    mockLibrary.files = [a, b];
    mockLibrary.more = [[c]];
    await openLibrary('b');

    await click(control('next')!);

    expect(mockLibrary.loadMore).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(c.path);
    expect(control('next')!.disabled).toBe(true);
  });

  it('deletes [id] through useDeleteMedia, says it went, tells onDeleted, refetches the list and the counts, and moves on', async () => {
    mockLibrary.files = rows;
    const onDeleted = await openLibrary('b');

    await pressDelete();

    expect(mockLibrary.deleteMedia).toHaveBeenCalledTimes(1);
    expect(mockLibrary.deleteMedia).toHaveBeenCalledWith(['b']);
    expect(mockShow.mock.calls.map(([text]) => text)).toEqual([
      'media_deleted',
    ]);
    expect(mockT).toHaveBeenCalledWith(
      'media_deleted',
      expect.any(String),
      expect.objectContaining({ count: 1, value: '1' })
    );
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith('b');
    expect(mockLibrary.refresh).toHaveBeenCalledTimes(1);
    const [deleted] = mockLibrary.deleteMedia.mock.invocationCallOrder;
    const [toasted] = mockShow.mock.invocationCallOrder;
    const [told] = onDeleted.mock.invocationCallOrder;
    const [refetched] = mockLibrary.refresh.mock.invocationCallOrder;
    expect(deleted).toBeLessThan(toasted);
    expect(deleted).toBeLessThan(told);
    expect(toasted).toBeLessThan(refetched);
    expect(told).toBeLessThan(refetched);
    expect(shown()).toBe(c.path);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  it("when the file wasn't deleted, says so, doesn't tell onDeleted, still refetches, and stays on the file", async () => {
    mockLibrary.files = rows;
    mockLibrary.deleteMedia.mockImplementation(async () => 1);
    const onDeleted = await openLibrary('b');

    await pressDelete();

    expect(mockLibrary.deleteMedia).toHaveBeenCalledWith(['b']);
    expect(mockShow.mock.calls.map(([text]) => text)).toEqual([
      'media_not_deleted',
    ]);
    expect(mockT).toHaveBeenCalledWith(
      'media_not_deleted',
      expect.any(String),
      expect.objectContaining({ count: 1, value: '1' })
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(mockLibrary.refresh).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(b.path);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });

  // SC-010
  it('over 1,000 files served in loads of 32, next pressed 100 times reaches the 101st file without closing', async () => {
    const library = range(1000).map((index) => row(`f${index}`));
    [mockLibrary.files, ...mockLibrary.more] = chunk(library, 32);
    await openLibrary('f0');

    for (let pressed = 0; pressed < 100; pressed++) {
      await click(control('next')!);
    }

    expect(shown()).toBe(library[100].path);
    expect(mockLibrary.loadMore).toHaveBeenCalledTimes(3);
    expect(mockCloseCurrent).not.toHaveBeenCalled();
  });
});
