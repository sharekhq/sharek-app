import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream d5c95a70 + d0ad7058. A video's cover is picked from the
// library through MediaBox's `image-static` mode: only JPEG and PNG pictures
// show, an upload accepts only those two, and the preview reads the same list
// as the tiles. Sharek filters in `visibleMedia`, where upstream filters inline.
// Harness as in media.component.limit.spec.tsx.
type UploaderOptions = { allowedFileTypes: string };

const uploader: { options?: UploaderOptions } = {};
const previewItems: { current?: Array<{ id: string }> } = {};

const media = ['a.jpg', 'b.jpeg', 'c.PNG', 'd.gif', 'e.mp4', 'f.webp'].map(
  (name, n) => ({
    id: `m${n}`,
    name,
    path: `https://media/${name}`,
  })
);

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
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: { results: media, pages: 1 },
    mutate: async () => undefined,
    isLoading: false,
  }),
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
  MediaPreview: ({ items }: { items: Array<{ id: string }> }) => {
    previewItems.current = items;
    return null;
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
    // The preview opens through a modal; render its body so MediaPreview sees
    // the list it would show.
    openModal: ({ children }: { children: ReactNode }) => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      createRoot(host).render(<>{children}</>);
    },
  }),
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

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  uploader.options = undefined;
  previewItems.current = undefined;
});

describe('MediaBox for a cover picture', () => {
  it('shows JPEG and PNG pictures only', () => {
    const container = render('image-static');

    expect(tiles(container)).toEqual(['a.jpg', 'b.jpeg', 'c.PNG']);
    expect(container.querySelectorAll('video')).toHaveLength(0);
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

  // The picture mode leaves the others as they were.
  it('still shows every picture, GIF and WebP included, in the image mode', () => {
    const container = render('image');

    expect(tiles(container)).toEqual([
      'a.jpg',
      'b.jpeg',
      'c.PNG',
      'd.gif',
      'f.webp',
    ]);
  });
});
