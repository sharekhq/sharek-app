import { act, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';

// The media library at 1025px and below (spec 044, US4): upstream's
// full-screen picker in Sharek's skin, and the pieces upstream applies to the
// Media page there. Classes say what the layout is (no layout runs here); the
// behaviour is real: Delete Selected, the page it leaves, the uploader's
// messages keeping the progress band open.
type Result = { results: typeof shownMedia; pages: number };

const shownMedia = [1, 2, 3].map((n) => ({
  id: `m${n}`,
  name: `photo-${n}.png`,
  path: `https://media.test/photo-${n}.png`,
}));
// Pages the server has, before and after a delete.
let pages = 6;
let pagesAfterMutate = 6;
const keys: string[] = [];
const requests: Array<{ url: string; method: string }> = [];
const confirm = jest.fn<Promise<boolean>, unknown[]>(async () => true);
const uploaderEvents: Record<string, () => void> = {};

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => {
    keys.push(key);
    return {
      data: { results: shownMedia, pages } as Result,
      isLoading: false,
      mutate: async (): Promise<Result> => {
        pages = pagesAfterMutate;
        return { results: shownMedia, pages };
      },
    };
  },
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch:
    () =>
    async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method || 'GET' });
      return new Response('{}');
    },
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => confirm(...args),
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    on: (event: string, handler: () => void) => {
      uploaderEvents[event] = handler;
    },
    off: () => undefined,
    addFiles: () => undefined,
    addFile: () => undefined,
  }),
}));
// Scenery from here down, as in media.component.limit.spec.tsx.
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => undefined,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: {}, totalChannels: 1 }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    closeAll: () => undefined,
    closeCurrent: () => undefined,
    openModal: () => undefined,
  }),
  ModalHeaderSlotTarget: () => null,
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
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  MediaPreview: () => null,
}));
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

import {
  MediaBox,
  mediaLibrarySize,
} from '@gitroom/frontend/components/media/media.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

const picker = () =>
  render(<MediaBox setMedia={jest.fn()} closeModal={jest.fn()} />);
const page = () =>
  render(
    <MediaBox setMedia={jest.fn()} closeModal={jest.fn()} standalone={true} />
  );

const click = async (node: Element | undefined | null) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const tile = (host: HTMLElement, n: number) =>
  host.querySelector(`img[src="https://media.test/photo-${n}.png"]`);
const buttonByText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (button) => (button.textContent || '').trim() === text
  );
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') || '').split(' ');
const deletes = () =>
  requests.filter((r) => r.method === 'DELETE').map((r) => r.url);
// The caption that names a tile: the innermost element holding the name.
const caption = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div'))
    .filter((node) => node.textContent === 'photo-3.png')
    .at(-1);
// The progress band: the uploader's wrapper.
const band = (host: HTMLElement) =>
  host.querySelector('.uppyChange')!.parentElement!;

beforeEach(() => {
  pages = 6;
  pagesAfterMutate = 6;
  keys.length = 0;
  requests.length = 0;
  confirm.mockClear();
  confirm.mockImplementation(async () => true);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the size every media library opens at', () => {
  const restore = window.matchMedia;
  afterEach(() => {
    window.matchMedia = restore;
  });
  const screen = (small: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: small && query === MOBILE_QUERY,
      media: query,
    })) as unknown as typeof window.matchMedia;
  };

  it('fills the screen at 1025px and below', () => {
    screen(true);

    expect(mediaLibrarySize()).toBe('100%');
  });

  it('leaves 80px around it from 1026px up', () => {
    screen(false);

    expect(mediaLibrarySize()).toBe('calc(100% - 80px)');
  });
});

describe('Delete Selected in the picker', () => {
  const pickTwo = async () => {
    const host = await picker();
    await click(tile(host, 1));
    await click(tile(host, 2));
    return host;
  };

  it('counts what is picked, as one translated label, on a 44px red button', async () => {
    const host = await pickTwo();
    const remove = buttonByText(host, 'Delete Selected (2)')!;

    expect(remove.getAttribute('type')).toBe('button');
    expect(classes(remove)).toEqual(
      expect.arrayContaining([
        'hidden',
        'mobile:flex',
        'min-h-[44px]',
        'text-error',
        'focus-visible:ring-brand',
      ])
    );
  });

  it('is not there while nothing is picked', async () => {
    const host = await picker();

    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        (button.textContent || '').startsWith('Delete Selected')
      )
    ).toBe(false);
  });

  it('deletes every pick once confirmed, and reloads the list', async () => {
    const host = await pickTwo();
    keys.length = 0;

    await click(buttonByText(host, 'Delete Selected (2)'));

    expect(confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete the selected media?'
    );
    expect(deletes()).toEqual(['/media/m1', '/media/m2']);
    expect(buttonByText(host, 'Delete Selected (2)')).toBeUndefined();
  });

  it('deletes nothing when the confirm is cancelled', async () => {
    confirm.mockImplementation(async () => false);
    const host = await pickTwo();

    await click(buttonByText(host, 'Delete Selected (2)'));

    expect(deletes()).toEqual([]);
    expect(buttonByText(host, 'Delete Selected (2)')).toBeTruthy();
  });

  it('steps back a page when the one it emptied was the last', async () => {
    pages = 2;
    pagesAfterMutate = 1;
    const host = await picker();
    await click(host.querySelector('button[aria-label="Go to next page"]'));
    expect(keys.at(-1)).toBe('get-media-1-');
    await click(tile(host, 1));

    await click(buttonByText(host, 'Delete Selected (1)'));

    expect(keys.at(-1)).toBe('get-media-0-');
  });
});

describe('the picker at 1025px and below', () => {
  it('says what to do above the tiles', async () => {
    const host = await picker();
    const hint = Array.from(host.querySelectorAll('div')).find(
      (node) =>
        node.textContent ===
        'Select or upload pictures (maximum 1 GB per upload).'
    );

    expect(classes(hint)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block'])
    );
  });

  it('hides the file names and the per-tile delete on its tiles', async () => {
    const host = await picker();
    const name = caption(host);
    const remove = host.querySelector(
      'button[aria-label="Delete photo-3.png"]'
    );

    expect(classes(name)).toContain('mobile:hidden');
    expect(classes(remove)).toContain('mobile:hidden');
  });

  it('keeps Add disabled and grey until something is picked, then brand', async () => {
    const host = await picker();
    const add = buttonByText(host, 'Add selected media')!;

    expect(add.disabled).toBe(true);
    expect(classes(add)).toEqual(
      expect.arrayContaining([
        'bg-brand',
        'mobile:h-[44px]',
        'mobile:rounded-[8px]',
        'mobile:disabled:bg-btnSimple',
        'mobile:disabled:text-muted',
        'mobile:disabled:opacity-100',
      ])
    );
    await click(tile(host, 1));

    expect(add.disabled).toBe(false);
  });

  it('has no Cancel there (the cross closes it), and Upload at the bottom', async () => {
    const host = await picker();
    const [top, bottom] = Array.from(host.querySelectorAll('button')).filter(
      (button) => (button.textContent || '').trim() === 'Upload'
    );

    expect(classes(buttonByText(host, 'Cancel'))).toContain('mobile:hidden');
    expect(classes(top.parentElement)).toContain('mobile:hidden');
    expect(classes(bottom.parentElement)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
  });
});

// Q7: the Media page takes the pieces upstream applies to it at 1025px and
// below, and keeps what upstream keeps there.
describe('the Media page at 1025px and below', () => {
  it('puts the search on its own line', async () => {
    const host = await page();
    const search = host.querySelector(
      'input[placeholder="Search by file name"]'
    )!;

    expect(classes(search.parentElement)).toContain('mobile:basis-full');
  });

  it('lays the tiles out in two columns, each with a 6px pad', async () => {
    const host = await page();
    const tileBox = tile(host, 1)!.closest('.group')!;

    expect(classes(tileBox.parentElement)).toEqual(
      expect.arrayContaining(['mobile:grid-cols-2', 'mobile:gap-0'])
    );
    expect(classes(tileBox)).toContain('mobile:p-[6px]');
  });

  it('keeps the names, the per-tile delete and the upload buttons', async () => {
    const host = await page();
    const name = caption(host);
    const remove = host.querySelector(
      'button[aria-label="Delete photo-3.png"]'
    );
    const upload = buttonByText(host, 'Upload')!;

    expect(classes(name)).not.toContain('mobile:hidden');
    expect(classes(remove)).not.toContain('mobile:hidden');
    expect(classes(upload.parentElement)).not.toContain('mobile:hidden');
  });

  it('has no footer and no Delete Selected, since nothing can be picked', async () => {
    const host = await page();
    await click(tile(host, 1));

    expect(buttonByText(host, 'Add selected media')).toBeUndefined();
    expect(buttonByText(host, 'Cancel')).toBeUndefined();
    expect(
      Array.from(host.querySelectorAll('button')).some((button) =>
        (button.textContent || '').startsWith('Delete Selected')
      )
    ).toBe(false);
  });
});

describe('the upload progress band at 1025px and below', () => {
  it.each([
    ['the picker', picker],
    ['the Media page', page],
  ])(
    'is hidden in %s until there is something to show',
    async (_name, open) => {
      const host = await open();

      expect(classes(band(host))).toContain('mobile:hidden');
    }
  );

  it('stays while the uploader shows a message, and goes when it is gone', async () => {
    const host = await picker();

    await act(async () => uploaderEvents['info-visible']());
    expect(classes(band(host))).not.toContain('mobile:hidden');

    await act(async () => uploaderEvents['info-hidden']());
    expect(classes(band(host))).toContain('mobile:hidden');
  });
});

describe('the pagination at 1025px and below', () => {
  it.each([
    ['the picker', picker],
    ['the Media page', page],
  ])('reads "2 / 6" in %s, between two 44px arrows', async (_name, open) => {
    const host = await open();
    await click(host.querySelector('button[aria-label="Go to next page"]'));
    const counter = Array.from(host.querySelectorAll('li')).find(
      (item) => item.textContent === '2 / 6'
    );

    expect(classes(counter)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
    for (const name of ['Go to previous page', 'Go to next page']) {
      // the chevrons point the way the pages go, right to left in Arabic
      expect(
        classes(host.querySelector(`button[aria-label="${name}"] svg`))
      ).toContain('rtl:rotate-180');
      expect(
        classes(host.querySelector(`button[aria-label="${name}"]`))
      ).toEqual(
        expect.arrayContaining(['mobile:h-[44px]', 'mobile:min-w-[44px]'])
      );
    }
  });
});

// 044 T071 F-2: under 16px, iOS Safari zooms the page when the search takes
// the focus and leaves it zoomed, so the composer read too wide on return.
describe('the search under a finger', () => {
  it.each([
    ['the picker', picker],
    ['the Media page', page],
  ])(
    'types at 16px on a touch screen in %s, 14px with a mouse',
    async (_name, open) => {
      const host = await open();
      const search = host.querySelector(
        'input[placeholder="Search by file name"]'
      );

      expect(classes(search)).toEqual(
        expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
      );
    }
  );
});

// 044 T071 F-4: at 1025px and below the tiles' scroll box reached 6px past its
// slot on every side, the top too, where nothing absorbs it: the progress band
// that sits between them from 1026px up is hidden there, so the box lay over
// the last 6px of the toolbar and a scrolled tile covered the bottom of the
// hint in the picker and of Upload on the Media page.
describe('the tiles under the toolbar at 1025px and below', () => {
  it.each([
    ['the picker', picker],
    ['the Media page', page],
  ])(
    'scroll beneath the toolbar in %s, reaching 6px past the sides and the bottom only',
    async (_name, open) => {
      const host = await open();
      const grid = tile(host, 1)!.closest('.group')!.parentElement;

      expect(classes(grid)).toContain('inset-0');
      expect(
        classes(grid).filter((name) =>
          /^mobile:-?(inset|top|bottom)/.test(name)
        )
      ).toEqual(['mobile:-inset-x-[6px]', 'mobile:-bottom-[6px]']);
    }
  );
});

// 044 T071 F-5: Upload is the brand button at every width, as it is from
// 1026px up; it read grey at 1025px and below.
describe('Upload at 1025px and below', () => {
  it.each([
    ['the picker', picker],
    ['the Media page', page],
  ])('is the brand button in %s, as from 1026px up', async (_name, open) => {
    const host = await open();
    const uploads = Array.from(host.querySelectorAll('button')).filter(
      (button) => (button.textContent || '').trim() === 'Upload'
    );

    expect(uploads.length).toBeGreaterThan(0);
    for (const upload of uploads) {
      expect(classes(upload)).toEqual(
        expect.arrayContaining(['bg-btnPrimary', 'text-white'])
      );
      expect(
        classes(upload).filter((name) => /^mobile:(bg|text)-/.test(name))
      ).toEqual([]);
    }
  });
});
