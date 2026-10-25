import { act, ReactElement, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The image editor stays hidden until SHOW_IMAGE_EDITOR is set. The composer
// opens it from two places: Design Media in the media row, and the Editor
// button beside a provider's single image (YouTube's thumbnail, the cover
// picture of WordPress, Hashnode and Dev.to, X's article cover). Hiding one
// and not the other leaves the editor a click away, so both are held here;
// Studio's card is held in studio.catalog.spec.tsx and
// studio.component.spec.tsx.
let showImageEditor = false;

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ showImageEditor }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
// Scenery, none of it asserted on: media.component.compact.spec.tsx's list,
// which mounts the same row. `useSettings` answers `getValues` because the
// provider setting reads its saved value on mount.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: () => null,
}));
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
  useSettings: () => ({ getValues: () => ({}) }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true }, totalChannels: 1 }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => undefined, openModal: () => undefined }),
  ModalHeaderSlotTarget: () => null,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
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
  MediaComponent,
  MultiMediaComponent,
} from '@gitroom/frontend/components/media/media.component';

const roots: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

const mediaRow = () =>
  render(
    <MultiMediaComponent
      allData={[{ content: '' }]}
      text=""
      label="Attachments"
      description=""
      value={[]}
      dummy={false}
      name="image"
      onChange={() => undefined}
    />
  );

const providerImage = () =>
  render(
    <MediaComponent
      label="Thumbnail"
      description=""
      name="thumbnail"
      onChange={() => undefined}
    />
  );

const control = (host: HTMLElement, name: string) =>
  host.querySelector(`[aria-label="${name}"]`);
const button = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );

beforeEach(() => {
  showImageEditor = false;
});

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("the media row's Design Media button", () => {
  it('is gone while the image editor is switched off, and only it', async () => {
    const host = await mediaRow();

    expect(control(host, 'Design Media')).toBeNull();
    expect(control(host, 'Insert Media')).toBeTruthy();
  });

  it('is back once the image editor is switched on', async () => {
    showImageEditor = true;
    const host = await mediaRow();

    expect(control(host, 'Design Media')).toBeTruthy();
  });
});

describe("a provider image's Editor button", () => {
  it('is gone while the image editor is switched off, and only it', async () => {
    const host = await providerImage();

    expect(button(host, 'Editor')).toBeUndefined();
    expect(button(host, 'Select')).toBeTruthy();
    expect(button(host, 'Clear')).toBeTruthy();
  });

  it('is back once the image editor is switched on', async () => {
    showImageEditor = true;
    const host = await providerImage();

    expect(button(host, 'Editor')).toBeTruthy();
  });
});
