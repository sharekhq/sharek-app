import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Feature 031-ai-image-references-edit (US1, contracts/tests.md T10).
//
// The AI image window opens the Media library to pick reference images, and a
// render takes at most IMAGE_REFERENCE_MAX of them. MediaBox gains an optional
// `max`: a pick past it is refused and says why, instead of being dropped in
// silence the way Veo 3 trims its picks. Without `max` nothing changes.
type UploaderOptions = {
  onUploadSuccess: (items: { id: string; path: string }[]) => Promise<void>;
};

const show = jest.fn();
const openModal = jest.fn();
const uploader: { options?: UploaderOptions } = {};

const media = [1, 2, 3].map((n) => ({
  id: `m${n}`,
  name: `m${n}.png`,
  path: `https://media/m${n}.png`,
}));

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () =>
    (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show }),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: { results: media, pages: 1 },
    mutate: async () => undefined,
    isLoading: false,
  }),
}));
// The uploader is Uppy; what matters here is the callback MediaBox hands it.
// The real hook builds Uppy once and keeps the first render's callback, so
// this double keeps the first one too.
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: (options: UploaderOptions) => {
    if (!uploader.options) {
      uploader.options = options;
    }
    return { on: () => {}, off: () => {}, addFiles: () => {}, addFile: () => {} };
  },
}));
// Scenery from here down, as in media.component.uploader.spec.tsx.
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
    openModal,
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
jest.mock('@gitroom/frontend/components/third-parties/third-party.media', () => ({
  ThirdPartyMedia: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media-library',
  () => ({ ThirdPartyMediaLibrary: () => null })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/media.settings.component',
  () => ({ MediaComponentInner: () => null })
);
jest.mock('@gitroom/react/helpers/video.frame', () => ({ VideoFrame: () => null }));
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
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));

import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { ModalHeaderSlotTarget } from '@gitroom/frontend/components/layout/new-modal';
import { MediaPreview } from '@gitroom/frontend/components/media/media.preview';

const LIMIT = 'You can choose up to 2 images here.';

const roots: Array<{ unmount: () => void }> = [];

const render = (max?: number) => {
  const setMedia = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <MediaBox
        type="image"
        max={max}
        setMedia={setMedia}
        closeModal={() => {}}
      />
    );
  });
  return setMedia;
};

const pick = async (id: string) => {
  await act(async () => {
    document
      .querySelector(`img[src="https://media/${id}.png"]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// What the picker hands back is what the caller attaches, so the selection is
// read from there rather than from the tiles' styling.
const confirm = async () => {
  await act(async () => {
    Array.from(document.querySelectorAll('button'))
      .find((node) => node.textContent === 'Add selected media')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const ids = (setMedia: jest.Mock) =>
  (setMedia.mock.calls[0][0] as { id: string }[]).map((item) => item.id);

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  uploader.options = undefined;
  jest.clearAllMocks();
});

describe('MediaBox with a limit', () => {
  it('stops at the limit and says why, keeping what was chosen', async () => {
    const setMedia = render(2);

    await pick('m1');
    await pick('m2');
    await pick('m3');
    await confirm();

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(LIMIT, 'warning');
    expect(ids(setMedia)).toEqual(['m1', 'm2']);
  });

  // An upload lands in the library whatever happens here; only the selection
  // is trimmed to the slots that are left.
  it('selects only as many uploads as there are free slots', async () => {
    const setMedia = render(2);
    await pick('m1');

    await act(async () => {
      await uploader.options?.onUploadSuccess([
        { id: 'u1', path: 'https://media/u1.png' },
        { id: 'u2', path: 'https://media/u2.png' },
        { id: 'u3', path: 'https://media/u3.png' },
      ]);
    });
    await confirm();

    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(LIMIT, 'warning');
    expect(ids(setMedia)).toEqual(['m1', 'u1']);
  });
});

describe('MediaBox without a limit', () => {
  it('selects everything that is picked, as before', async () => {
    const setMedia = render();

    await pick('m1');
    await pick('m2');
    await pick('m3');
    await confirm();

    expect(show).not.toHaveBeenCalled();
    expect(ids(setMedia)).toEqual(['m1', 'm2', 'm3']);
  });
});

// The only test of the library's way into its viewer. The options are read back
// rather than rendered, because a tile's button is all this file can reach.
describe('Open preview in the Media library', () => {
  it('opens the viewer on the page of media at the tile clicked, with its options', async () => {
    render();

    await act(async () => {
      document
        .querySelectorAll('button[aria-label="Open preview"]')[1]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openModal).toHaveBeenCalledTimes(1);
    const options = openModal.mock.calls[0][0];
    expect(options).toMatchObject({
      top: 20,
      size: 'min(1120px, calc(100vw - 40px))',
      height: 'calc(100vh - 40px)',
      cardClassName: 'phone:!p-[16px]',
    });
    expect(options.title.type).toBe(ModalHeaderSlotTarget);
    expect(options.children.type).toBe(MediaPreview);
    expect(options.children.props).toEqual({ items: media, index: 1 });
  });
});
