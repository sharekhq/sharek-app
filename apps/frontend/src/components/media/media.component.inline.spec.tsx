import { act, ComponentProps, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream's pictures in post text reuse the attachments strip: the
// editor passes `insertInContent`, and a picked file goes into the text instead
// of the attachments. Only a picture belongs in the text, so the library opens
// on pictures alone, and the two sources that bring video or someone else's
// files, AI video and third-party media, leave the strip.
//
// The stage-2 merge grafted that onto Sharek's own strip, so what is
// pinned here is the graft: the two gates, the library's type and where a pick
// goes. The mock list is media.component.compact.spec.tsx's; only the AI video,
// third-party media and modal stubs differ, because their props are the
// assertion.
type Media = { id: string; path: string };
// What the library modal is opened with: the MediaBox it renders.
type OpenedModal = {
  children: (
    close: () => void
  ) => ReactElement<{ type?: string; setMedia: (media: Media[]) => void }>;
};

const aiVideoProps: unknown[] = [];
const thirdPartyProps: unknown[] = [];
const opened: OpenedModal[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: (props: unknown) => {
    aiVideoProps.push(props);
    return null;
  },
}));
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media',
  () => ({
    ThirdPartyMedia: (props: unknown) => {
      thirdPartyProps.push(props);
      return null;
    },
  })
);
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    closeAll: () => undefined,
    openModal: (modal: OpenedModal) => opened.push(modal),
  }),
  ModalHeaderSlotTarget: () => null,
}));
// Scenery, none of it asserted on: the component has to mount for its strip to
// render. `tier.ai` is on so AI video is in the row at all.
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: { results: [], count: 0 },
    mutate: () => undefined,
    isLoading: false,
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ results: [] }) }),
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    on: () => undefined,
    off: () => undefined,
    addFiles: () => undefined,
    addFile: () => undefined,
  }),
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => undefined,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true }, totalChannels: 1 }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
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

import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';

const roots: Array<{ unmount: () => void }> = [];

const render = async (
  props: Partial<ComponentProps<typeof MultiMediaComponent>> = {}
) => {
  aiVideoProps.length = 0;
  thirdPartyProps.length = 0;
  opened.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      <MultiMediaComponent
        allData={[{ content: '' }]}
        text=""
        label="Attachments"
        description=""
        value={[]}
        dummy={false}
        name="image"
        onChange={() => undefined}
        onOpen={() => undefined}
        onClose={() => undefined}
        {...props}
      />
    );
  });
  return host;
};

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('MultiMediaComponent with insertInContent', () => {
  it('keeps AI video and third-party media for attachments', async () => {
    await render();

    expect(aiVideoProps.length).toBeGreaterThan(0);
    expect(thirdPartyProps.length).toBeGreaterThan(0);
  });

  it('drops AI video and third-party media when pictures go into the text', async () => {
    await render({ insertInContent: (): void => undefined });

    expect(aiVideoProps).toEqual([]);
    expect(thirdPartyProps).toEqual([]);
  });

  it('still hides AI video on aiVideoNotAvailable alone', async () => {
    await render({ aiVideoNotAvailable: true });

    expect(aiVideoProps).toEqual([]);
    expect(thirdPartyProps.length).toBeGreaterThan(0);
  });

  it('opens the library on pictures and puts a pick into the text, not the attachments', async () => {
    const inserted: Media[][] = [];
    const changed: unknown[] = [];
    const host = await render({
      insertInContent: (media) => {
        inserted.push(media);
      },
      onChange: (event) => {
        changed.push(event);
      },
    });

    await act(async () => {
      host
        .querySelector('[data-tooltip-content="Insert Media"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const box = opened[0].children((): void => undefined);
    expect(box.props.type).toBe('image');

    const picture = { id: 'm1', path: 'https://cdn.example/a.png' };
    await act(async () => {
      box.props.setMedia([picture]);
    });
    expect(inserted).toEqual([[picture]]);
    expect(changed).toEqual([]);
  });
});
