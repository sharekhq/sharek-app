import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's row of media buttons. On a phone it's a horizontal scroller,
// and a row that wraps paints over the control below it (see the first case).
// Each button keeps its name, on the control as well as in its label. The mock
// list is media.component.uploader.spec.tsx's, which mounts the same component;
// only the image editor's switch and the AI buttons differ.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
// The AI buttons show the post they work for (spec 061, FR-024).
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: { place?: number }) => (
    <div data-ai="image" data-place={props.place} />
  ),
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: (props: { place?: number }) => (
    <div data-ai="video" data-place={props.place} />
  ),
}));
// Scenery, none of it asserted on: the component has to mount for its strip to
// render.
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
// The image editor is switched on so Design Media is in the row.
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ showImageEditor: true }),
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

describe('the media strip', () => {
  // This assertion was the opposite way round for one deployment, and the
  // deployment is what corrected it. Branch 138 made the row wrap, on the
  // theory that a 190px floor on the editor box removed the compression spec
  // 017 hit. Measured live at commit 9239003a: the strip rendered 195px tall
  // holding 324px of content and painted 130px below its own box, covering
  // "Add comment / post" entirely — at 1280 with an ordinary mouse, not only
  // on a phone. Mutating this single class back to `nowrap` in the live DOM
  // took the overflow to zero at every width.
  //
  // jsdom computes no layout, so nothing here can see that. What this can do
  // is hold the class list that the measurement settled on, so the wrap is
  // not reintroduced by someone reading the strip's markup and thinking a
  // scroller looks like an oversight. It is not: it is the accepted cost.
  it('scrolls rather than wrapping, so a second row cannot paint over the control below', async () => {
    const host = await render();

    expect(strip(host).className).not.toContain('flex-wrap');
    expect(strip(host).className).toContain('mobile:overflow-x-auto');
    expect(strip(host).className).toContain('mobile:flex-nowrap');
  });

  it('shows its labels by default', async () => {
    const host = await render();

    expect(host.textContent).toContain('Insert Media');
  });

  // The name is on the control too, for a screen reader and on hover, because
  // at 1025px and below the label is hidden.
  it('keeps the name on the control', async () => {
    const host = await render();
    const button = host.querySelector('[data-tooltip-content="Insert Media"]');

    expect(button).toBeTruthy();
    expect(button!.getAttribute('aria-label')).toBe('Insert Media');
  });

  // At 1025px and below the tile is its 20px icon alone: the small size's
  // 12px sides and its border made it 46 wide, so it drops its sides and
  // takes its 44px from the floor, square like AI Image beside it.
  it('is a 44px square at 1025px and below', async () => {
    const host = await render();
    const button = host.querySelector('[data-tooltip-content="Insert Media"]');

    expect(button!.className.split(' ')).toEqual(
      expect.arrayContaining([
        'mobile:h-[44px]',
        'mobile:min-w-[44px]',
        'mobile:px-0',
      ])
    );
  });

  it('hands its AI buttons the post it was given', async () => {
    const host = await render({ place: 2 });
    const ai = Array.from(host.querySelectorAll<HTMLElement>('[data-ai]'));

    expect(ai.map((each) => [each.dataset.ai, each.dataset.place])).toEqual([
      ['image', '2'],
      ['video', '2'],
    ]);
  });
  // From 1026px the tool bar and the counter stay in view at the bottom of the
  // left side's scroll area while the text and the thumbnails scroll above
  // (spec 062, FR-003). A sticky bar only moves inside its parent's box, so the
  // box around the thumbnails and the bar dissolves (`contents`) into the
  // editor card, which is as tall as the scroll area. jsdom has no layout: the
  // classes are the assertion.
  it('pins the bar to the bottom of the scroll area from 1026px, and only there', async () => {
    const host = await render();
    const classes = strip(host).className.split(' ');

    expect(classes).toEqual(
      expect.arrayContaining([
        '[@media(min-width:1026px)]:sticky',
        '[@media(min-width:1026px)]:bottom-0',
        '[@media(min-width:1026px)]:bg-panel',
      ])
    );
    expect(classes).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(mobile:)?sticky$/)])
    );
    expect(
      strip(host).parentElement!.className.split(' ')
    ).toContain('[@media(min-width:1026px)]:contents');
  });
});
