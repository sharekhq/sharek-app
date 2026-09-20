import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Two complaints, one component. In Samy's chat the four labelled buttons need
// about 560px and the chat gives them 470, so AI Video takes a line of its own
// (2026-09-18). On a phone the same strip is a horizontal scroller, so pen, U,
// B and emoji sit past the edge with nothing saying they exist (2026-09-20).
//
// `compact` is what reconciles them: the caller that knows its container is
// narrow drops the labels, and the strip wraps rather than scrolls so a control
// that does not fit moves to a second row instead of off the edge.
//
// Nine controls at the 44px touch floor cannot share one row at 390px whatever
// we do. "Nothing hidden" here means two rows, and that is what is asserted.
//
// The AI pair render their own triggers, so what this file can say about them
// is that the flag reaches them — their own specs assert what they do with it.
// The mock list is media.component.uploader.spec.tsx's, which mounts the same
// component; only the AI stubs differ, because those props are the assertion.
const aiImageProps: any[] = [];
const aiVideoProps: any[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: any) => {
    aiImageProps.push(props);
    return null;
  },
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: (props: any) => {
    aiVideoProps.push(props);
    return null;
  },
}));
// Scenery, none of it asserted on: the component has to mount for its strip to
// render. `tier.ai` is on so the AI pair are in the row at all.
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
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => undefined, openModal: () => undefined }),
  ModalHeaderSlotTarget: () => null,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: any) => <div>{children}</div>,
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
  ReactSortable: ({ children }: any) => <div>{children}</div>,
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

const render = async (props: Record<string, unknown> = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
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
        {...(props as any)}
      />
    );
  });
  return host;
};

// Reached through the button row it holds, not by `.b1`: the box around the
// whole media area carries that class first and would be found instead — and
// an outer wrapper has no scroller either, so the negative assertions below
// would have passed on the wrong element.
const strip = (host: HTMLElement) =>
  host.querySelector('.b2')!.parentElement as HTMLElement;

beforeEach(() => {
  aiImageProps.length = 0;
  aiVideoProps.length = 0;
});

describe('the media strip', () => {
  it('wraps rather than scrolling on a narrow viewport', async () => {
    const host = await render();

    expect(strip(host).className).toContain('flex-wrap');
    expect(strip(host).className).not.toContain('mobile:overflow-x-auto');
    expect(strip(host).className).not.toContain('mobile:flex-nowrap');
  });

  it('shows its labels by default', async () => {
    const host = await render();

    expect(host.textContent).toContain('Insert Media');
  });

  it('drops its labels when the caller says the space is tight', async () => {
    const host = await render({ compact: true });

    expect(host.textContent).not.toContain('Insert Media');
    expect(host.textContent).not.toContain('Design Media');
  });

  // Dropping the visible label must not drop the name: the control still has to
  // announce itself to a screen reader and on hover.
  it('keeps the name on the control it stopped printing', async () => {
    const host = await render({ compact: true });
    const button = host.querySelector('[data-tooltip-content="Insert Media"]');

    expect(button).toBeTruthy();
    expect(button!.getAttribute('aria-label')).toBe('Insert Media');
  });

  // The other two buttons in the row render their own triggers, so all this
  // component can do is hand the flag on — and it has to, or the row reads as
  // two icons beside two labelled buttons.
  it('tells the AI triggers the space is tight too', async () => {
    await render({ compact: true });

    expect(aiImageProps.at(-1).compact).toBe(true);
    expect(aiVideoProps.at(-1).compact).toBe(true);
  });

  it('leaves them labelled when it is not', async () => {
    await render();

    expect(aiImageProps.at(-1).compact).toBeFalsy();
    expect(aiVideoProps.at(-1).compact).toBeFalsy();
  });
});
