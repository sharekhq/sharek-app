import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream d5c95a70 + d0ad7058. A video's cover is picked from the
// library through MediaBox's `image-static` mode: only JPEG and PNG pictures
// show, an upload accepts only those two, and the preview reads the same list
// as the tiles. Sharek asks the server for the mode's files (research R9),
// where upstream filters inline. Harness as in media.component.limit.spec.tsx.
type UploaderOptions = { allowedFileTypes: string };

const uploader: { options?: UploaderOptions } = {};
const previewItems: { current?: Array<{ id: string }> } = {};
// The list's page keys MediaBox hands useSWRInfinite.
const keys: string[] = [];

const media = ['a.jpg', 'b.jpeg', 'c.PNG', 'd.gif', 'e.mp4', 'f.webp'].map(
  (name, n) => ({
    id: `m${n}`,
    name,
    path: `https://media/${name}`,
    createdAt: '2026-11-10T12:00:00.000Z',
  })
);
// What the server answers each type (research R9): JPEG and PNG for a cover,
// every picture in the image mode; without a type, everything.
const answers: Record<string, typeof media> = {
  'image-static': media.slice(0, 3),
  image: media.filter((row) => row.name !== 'e.mp4'),
};
const typeOf = (key: string) =>
  new URL(key, 'http://localhost').searchParams.get('type');
const served = (key: string) => answers[typeOf(key) || ''] || media;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
// A month heading's count.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => ({
    data: { count: served(key).length },
    mutate: async () => undefined,
    isLoading: false,
  }),
  useSWRConfig: () => ({ mutate: async () => undefined }),
}));
// The list as useSWRInfinite answers it: the server's files as its one page.
jest.mock('swr/infinite', () => ({
  __esModule: true,
  default: (getKey: (index: number, previous: null) => string) => {
    const key = getKey(0, null);
    keys.push(key);
    return {
      data: [{ results: served(key), pages: 1 }],
      size: 1,
      setSize: async () => undefined,
      mutate: async () => undefined,
      isLoading: false,
      isValidating: false,
    };
  },
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: (options: UploaderOptions) => {
    uploader.options = options;
    return {
      on: () => {},
      off: () => {},
      addFiles: () => {},
      addFile: () => {},
    };
  },
}));
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  mediaPreviewModal: (items: Array<{ id: string }>) => {
    previewItems.current = items;
    return {};
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
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    closeAll: () => {},
    closeCurrent: () => {},
    openModal: () => {},
  }),
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

const roots: Array<{ unmount: () => void }> = [];

const render = (type?: 'image' | 'image-static' | 'video') => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <MediaBox type={type} setMedia={() => {}} closeModal={() => {}} />
    );
  });
  return container;
};

// Pictures are <img> tiles and videos <video> tiles; the names are the alt text.
const tiles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('img')).map((img) =>
    img.getAttribute('alt')
  );
// The types the list asked the server for, each once.
const requestedTypes = () => Array.from(new Set(keys.map(typeOf)));

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  uploader.options = undefined;
  previewItems.current = undefined;
  keys.length = 0;
});

describe('MediaBox for a cover picture', () => {
  it('asks the server for JPEG and PNG pictures only', () => {
    const container = render('image-static');

    expect(requestedTypes()).toEqual(['image-static']);
    expect(tiles(container)).toEqual(
      answers['image-static'].map((row) => row.name)
    );
  });

  it('accepts only JPEG and PNG uploads', () => {
    render('image-static');

    expect(uploader.options?.allowedFileTypes).toBe('image/jpeg,image/png');
  });

  // The preview and the tiles read one list, so a position means the same
  // picture in both.
  it('previews the same pictures it shows', async () => {
    const container = render('image-static');

    await act(async () => {
      container
        .querySelectorAll('button[aria-label="Open preview"]')[2]
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(previewItems.current?.map((item) => item.id)).toEqual([
      'm0',
      'm1',
      'm2',
    ]);
  });

  // The picture mode asks for every picture, GIF and WebP included.
  it('asks for every picture in the image mode', () => {
    const container = render('image');

    expect(requestedTypes()).toEqual(['image']);
    expect(tiles(container)).toEqual([
      'a.jpg',
      'b.jpeg',
      'c.PNG',
      'd.gif',
      'f.webp',
    ]);
  });
});
