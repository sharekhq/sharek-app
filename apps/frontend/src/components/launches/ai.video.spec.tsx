import { act, FC, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useFormContext } from 'react-hook-form';

const toast = jest.fn();
const setLocked = jest.fn();
const request = jest.fn();
let providers: Array<{ identifier: string; title: string }> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders. A mock that
  // returned the raw default would have this spec assert a string no reader ever sees.
  useT:
    () =>
    (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
// The composer's store: the lock, which no tool writes any more (tasks D14).
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ setLocked, setActivateExitButton: jest.fn() }),
}));
// The composer's tabs: none outside the composer, as Studio and a reference
// row see it; inside it, a case hands its own. The ✦ button's opener (its
// cases in composer.stage.spec.tsx) is recorded with what the button hands
// it, and opens the tabs' tab when a case handed them, the tool's window
// otherwise.
let mockTabs: { open: jest.Mock } | null = null;
const mockOpenTool = jest.fn(
  (
    _kind: string,
    _onChange: unknown,
    _place: number,
    _destination: MediaDestination,
    openWindow: () => void
  ) => {
    return () => (mockTabs ? mockTabs.open() : openWindow());
  }
);
jest.mock('@gitroom/frontend/components/new-launch/composer.tabs', () => ({
  useComposerTabs: () => mockTabs,
  useOpenTool: (...args: Parameters<typeof mockOpenTool>) =>
    mockOpenTool(...args),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { current: 'STANDARD' }, role: 'ADMIN' }),
}));
// The trigger reads the provider list through SWR and the credits pill reads
// the credit count under the key the AI video windows have always shared; the
// list is what the trigger specs steer.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) =>
    key === 'load-videos-ai'
      ? { data: providers, isLoading: false }
      : key === 'copilot-credits'
      ? { data: { credits: 7 }, mutate: jest.fn() }
      : { data: undefined, mutate: jest.fn() },
}));
// The modal manager opens the windows for real; this keeps what each one was
// opened with, for the window's size.
const mockOpened: Array<Record<string, unknown>> = [];
jest.mock('@gitroom/frontend/components/layout/new-modal', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/layout/new-modal'
  );
  return {
    ...actual,
    useModals: () => {
      const modals = actual.useModals();
      return {
        ...modals,
        openModal: (params: Record<string, unknown>) => {
          mockOpened.push(params);
          modals.openModal(params);
        },
      };
    },
  };
});
// Whether the provider's form holds a required field; most cases leave it out,
// so the form always validates.
let mockRequiredField = false;
// What a workflow puts in the stage through the slot the tool hands it; most
// cases put nothing there.
let mockStageContent: ReactNode = null;
// What the tool hands its provider, as the provider receives it.
let mockVideo: ReturnType<typeof useVideo> | undefined;
// Each provider's card, as its file registers it; a case can take one away.
let mockCards: Record<string, VideoTypeCard> = {};
// The provider registry drags in every video provider; this spec only needs a
// type that leaves the action bar — and therefore the Generate button — to the
// tool, and Image Text Slides owning the stage, as its file registers it
// (`ownsStage`).
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  VideoWrapper: () => <ProviderStandIn />,
  videoOwnsActions: () => false,
  videoOwnsStage: (identifier: string) => identifier === 'image-text-slides',
  videoTypeCard: (identifier: string) => mockCards[identifier],
}));

import {
  AiVideo,
  AiVideoChooser,
  AiVideoTool,
} from '@gitroom/frontend/components/launches/ai.video';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import type { WorkspaceLayout } from '@gitroom/frontend/components/studio/workspace.frame';
import type { VideoTypeCard } from '@gitroom/frontend/components/videos/video.wrapper';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import { buttonClassName } from '@gitroom/react/form/button';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';

/**
 * The provider's side of the tool: the context it is handed, one required
 * field when a case asks for it, and, when a case gives it some, what a
 * workflow portals into the stage through `stageSlot`.
 */
const ProviderStandIn: FC = () => {
  const { register } = useFormContext();
  const video = useVideo();
  useEffect(() => {
    mockVideo = video;
  }, [video]);
  return (
    <div data-testid="provider-fields">
      {mockRequiredField && (
        <input {...register('prompt', { required: true })} />
      )}
      {!!mockStageContent &&
        !!video.stageSlot &&
        createPortal(mockStageContent, video.stageSlot)}
    </div>
  );
};

// Veo 3's card and Image Text Slides', as their providers register them: a
// model with a maker and facts, and a workflow with a cover only.
const veo3Card: VideoTypeCard = {
  name: { key: 'video_type_veo3', fallback: 'Veo 3' },
  description: {
    key: 'video_type_veo3_desc',
    fallback: 'One continuous live-action shot with real camera movement.',
  },
  pills: [
    { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
    { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
  ],
  diagram: null,
  studio: {
    kind: 'model',
    cover: '/studio/covers/veo3.webp',
    maker: { name: 'Google', logo: '/studio/makers/google.svg' },
    facts: [
      { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
      { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
      { key: 'video_type_veo3_fact_sound', fallback: 'Sound' },
    ],
    sampleLength: '0:08',
  },
};
const slidesCard: VideoTypeCard = {
  name: { key: 'video_type_slides', fallback: 'Image Text Slides' },
  description: {
    key: 'video_type_slides_desc',
    fallback: 'A narrated slideshow of AI images with captions burned in.',
  },
  pills: [],
  diagram: null,
  studio: { kind: 'tool', cover: '/studio/covers/image-text-slides.webp' },
};

const veo3 = { identifier: 'veo3', title: 'Veo3' };
const slides = { identifier: 'image-text-slides', title: 'Image Text Slides' };

const answer = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  body: null,
});

// What the fetch wrapper actually does with a credit refusal: the interceptor
// raises the limit modal and the request *rejects*. It must not resolve — a
// resolved response is indistinguishable from success to every caller that
// does not inspect one.
const refused = () => Promise.reject(new AlreadyAnsweredError(402));

const mounted: Array<{ unmount: () => void }> = [];

const posted = (url: string) =>
  request.mock.calls.filter(([called]) => called === url);

/** The NDJSON body the render route answers with, as `ndjsonFrames` reads it. */
const stream = (...frames: object[]) => {
  const chunks = frames.map((frame) =>
    new TextEncoder().encode(JSON.stringify(frame) + '\n')
  );
  let next = 0;
  return {
    getReader: () => ({
      read: async () =>
        next < chunks.length
          ? { done: false, value: chunks[next++] }
          : { done: true, value: undefined },
      cancel: async () => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

/** Flushes the microtask the awaited fetch resolves on. */
const settle = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

/** Who hosts the tool, and what it hands the tool (contracts §5, §6). */
interface Host {
  layout?: WorkspaceLayout;
  destination?: MediaDestination;
  onChange?: jest.Mock;
  onAccept?: jest.Mock;
  onCreatePost?: jest.Mock;
  provider?: { identifier: string; title: string };
}

/**
 * Renders the tool for one provider, as a host does once a type is chosen:
 * by default the body of the composer's window, which closes on accept. The
 * Studio page (`layout: 'page'`) has nothing to close.
 */
const open = async ({
  layout = 'stacked',
  destination = 'post',
  onChange = jest.fn(),
  onAccept = layout === 'page' ? undefined : jest.fn(),
  onCreatePost,
  provider = veo3,
}: Host = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <AiVideoTool
        type={provider}
        layout={layout}
        destination={destination}
        onChange={onChange}
        onAccept={onAccept}
        onCreatePost={onCreatePost}
        setLoading={jest.fn()}
      />
    );
  });
  return root;
};

/** Presses the main button while it reads Generate. */
const pressGenerate = async () => {
  const submit = Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === 'Generate'
  );

  await act(async () => {
    submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // handleSubmit resolves on a microtask after the click.
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

const generate = async (host: Host = {}) => {
  const root = await open(host);
  await pressGenerate();
  return root;
};

// The modal manager keeps its open modals in a module-level store, so a modal
// one test leaves open is still there for the next one. This hands afterEach
// a way to empty it.
let closeEveryModal: (() => void) | undefined;
const CaptureModals: FC = () => {
  const { closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
  }, [closeAll]);
  return null;
};

/** Mounts a trigger next to the modal manager it opens into. */
const mount = async (trigger: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <>
        <CaptureModals />
        <ModalManagerInner />
        {trigger}
      </>
    );
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Some actions carry more after the label, so an exact match silently finds
// nothing and clicking it does nothing.
const buttonStarting = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.trim().startsWith(label)
  );

const type = async (element: HTMLInputElement, value: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const finished = { id: 'media-1', path: 'https://media/first.mp4' };
const second = { id: 'media-2', path: 'https://media/second.mp4' };

/** The render route's answer: a stream that goes straight to its done frame. */
const rendered = (media = finished) => ({
  ...answer(200, {}),
  body: stream({ name: 'done', media }),
});

/**
 * Lets every credit check through; every render finishes at once, as the
 * given videos in turn and the last one from then on (`finished` by default).
 */
const renders = (...videos: Array<{ id: string; path: string }>) => {
  const queue = videos.length ? [...videos] : [finished];
  request.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/allowed')
        ? answer(200, true)
        : rendered(queue.length > 1 ? queue.shift() : queue[0])
    )
  );
};

/** Lets every credit check through; every render fails with a message. */
const rendersFail = () =>
  request.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/allowed')
        ? answer(200, true)
        : answer(500, { message: 'the renderer fell over' })
    )
  );

/** Lets every credit check through; no render ever answers. */
const rendersForever = () =>
  request.mockImplementation((url: string) =>
    url.endsWith('/allowed')
      ? Promise.resolve(answer(200, true))
      : new Promise(() => undefined)
  );

/**
 * Lets every credit check through and holds the render until the returned
 * function lands it.
 */
const holdRender = () => {
  let land: () => void = () => undefined;
  request.mockImplementation((url: string) =>
    url.endsWith('/allowed')
      ? Promise.resolve(answer(200, true))
      : new Promise((resolve) => {
          land = () => resolve(rendered());
        })
  );
  return async () => {
    await act(async () => land());
    await settle();
  };
};

/**
 * A render the provider runs itself, as Image Text Slides does: claimed at
 * the click, started with the provider's own handshake, then handed back.
 */
const providerRender = async (handshake: object = {}, media = finished) => {
  await act(async () => {
    mockVideo!.claimRender();
    mockVideo!.startRender({ regenerate: jest.fn(), ...handshake });
  });
  await act(async () => mockVideo!.onMedia(media));
};

/** Opens the window as a caller does: its trigger, then the provider. */
const openWindow = async (
  destination: MediaDestination = 'post',
  onChange = jest.fn()
) => {
  await mount(
    <AiVideo
      value=""
      onChange={onChange}
      only="veo3"
      renderTrigger={cardTrigger}
      destination={destination}
    />
  );
  await click(document.querySelector('[data-testid="card"]'));
};

/**
 * The tool in a composer tab (contracts/composer-and-preview.md §4): the
 * chooser, stacked, for the post, with what the stage hands it; one type
 * opens straight away. `show` draws it again, on screen or behind another tab.
 */
const openTab = async (list = providers.slice(0, 1)) => {
  mockTabs = { open: jest.fn() };
  const host = {
    onChange: jest.fn(),
    onAccept: jest.fn(),
    setLoading: jest.fn(),
  };
  const root = createRoot(
    document.body.appendChild(document.createElement('div'))
  );
  mounted.push(root);
  const show = (active: boolean) =>
    act(async () => {
      root.render(
        <AiVideoChooser
          list={list}
          layout="stacked"
          destination="post"
          active={active}
          {...host}
        />
      );
    });
  await show(true);
  return { ...host, show, leave: () => act(() => root.unmount()) };
};

// The frame's regions (contracts/workspace-parts.md §1): the stage is the
// frame's size container, the page's settings panel is 360px wide, and the
// action bar is the box with the line above it.
const stage = () =>
  document.querySelector<HTMLElement>('.\\[container-type\\:size\\]');
const panel = () => document.querySelector<HTMLElement>('.w-\\[360px\\]');
const bar = () => document.querySelector<HTMLElement>('.border-t');
const mainButton = () => bar()?.querySelector('button');
const stageVideo = () => stage()?.querySelector('video[controls]');
const versionButtons = () =>
  Array.from(stage()?.querySelectorAll('[role="group"] button') ?? []);
/** The result's actions, in the stage, in order, the versions left out. */
const resultActions = () =>
  Array.from(stage()?.querySelectorAll('a, button') ?? [])
    .filter((node) => !node.closest('[role="group"]'))
    .map((node) => node.textContent?.trim());

const tokens = (element: Element | null | undefined) =>
  (element?.getAttribute('class') || '').split(' ');
const byTestId = (id: string) =>
  document.querySelector(`[data-testid="${id}"]`);
/** The one element holding exactly this text and nothing else. */
const byText = (root: Element, text: string) =>
  Array.from(root.querySelectorAll('div')).find(
    (node) => node.textContent === text && node.children.length === 0
  );
/** The innermost element whose text holds this. */
const holding = (root: Element, text: string) =>
  Array.from(root.querySelectorAll('*'))
    .filter((node) => node.textContent?.includes(text))
    .pop();
const follows = (
  later: Node | null | undefined,
  earlier: Node | null | undefined
) =>
  !!later &&
  !!earlier &&
  !!(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

// Spec 060 (FR-026): the main actions are one height, the shared button's
// large size.
const LARGE = ['h-[44px]', 'px-[20px]'];

const cardTrigger = (open: () => void) => (
  <button data-testid="card" onClick={open}>
    Card
  </button>
);

beforeEach(() => {
  providers = [
    { identifier: 'veo3', title: 'Veo 3' },
    { identifier: 'image-text-slides', title: 'Image Text Slides' },
  ];
  mockCards = { veo3: veo3Card, 'image-text-slides': slidesCard };
});

afterEach(() => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockRequiredField = false;
  mockStageContent = null;
  mockVideo = undefined;
  mockOpened.splice(0);
  mockTabs = null;
  jest.clearAllMocks();
});

// The pre-flight exists so a refusal lands before the waiting screen does. Its
// answer was being thrown away, so the render call went out regardless — and
// refused a second time, raising the modal twice (FR-012).
describe('when the pre-flight refuses', () => {
  beforeEach(() => {
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed') ? refused() : Promise.resolve(answer(200, {}))
    );
  });

  it('never asks for the render', async () => {
    await generate();

    expect(posted('/media/generate-video/veo3/allowed')).toHaveLength(1);
    expect(posted('/media/generate-video')).toHaveLength(0);
  });

  it('says nothing of its own — the limit modal has already spoken', async () => {
    await generate();

    expect(toast).not.toHaveBeenCalled();
  });
});

// A 404 (provider gone) or a 5xx resolves rather than rejecting, and the
// pre-flight has no error handling of its own. Bailing here would leave the
// Generate button doing nothing at all, so it falls through and lets the
// render call report it once, properly.
describe('when the pre-flight fails for anything else', () => {
  it('still goes on to the render, which surfaces the failure', async () => {
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(404, { message: 'Video type veo3 not found' })
          : answer(500, { message: 'the renderer fell over' })
      )
    );

    await generate();

    expect(posted('/media/generate-video')).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});

describe('when the render itself is refused', () => {
  it('resets without a second message', async () => {
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed') ? Promise.resolve(answer(200, true)) : refused()
    );

    await generate();

    expect(toast).not.toHaveBeenCalled();
  });
});

// The 402 branch sits directly ahead of the generic error path, which is the
// shape that silently swallows everything else (FR-014).
describe('when the render fails for anything else', () => {
  it('still surfaces the failure', async () => {
    rendersFail();

    await generate();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});

// The composer keeps the ✦ button and its chooser (FR-010): nothing about the
// trigger changes for a caller that asks for nothing new.
describe('as the composer button', () => {
  it('renders the ✦ button and opens the chooser from it, as before', async () => {
    await mount(<AiVideo value="" onChange={jest.fn()} />);

    const trigger = document.querySelector('.bg-aiSoft');
    expect(trigger?.textContent?.trim()).toBe('AI Video');

    await click(trigger);

    expect(document.body.textContent).toContain('Choose a video type');
  });
});

// Studio renders a card of its own as the trigger for a provider with no page
// of its own.
describe('with a trigger of its own', () => {
  it('renders that trigger alone and opens the chooser from it', async () => {
    await mount(
      <AiVideo value="" onChange={jest.fn()} renderTrigger={cardTrigger} />
    );

    expect(document.querySelector('.bg-aiSoft')).toBeNull();

    await click(document.querySelector('[data-testid="card"]'));

    expect(document.body.textContent).toContain('Choose a video type');
  });

  // A single-item list already auto-selects, so one card per provider needs
  // no chooser — and the title names the provider instead of the generic one.
  it('opens one provider directly, under its own name, when told which', async () => {
    await mount(
      <AiVideo
        value=""
        onChange={jest.fn()}
        only="veo3"
        renderTrigger={cardTrigger}
      />
    );

    await click(document.querySelector('[data-testid="card"]'));

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('Choose a video type');
    expect(text).not.toContain('Generate AI Video');
    expect(text).toContain('Veo 3');
    expect(
      Array.from(document.querySelectorAll('button')).some((node) =>
        node.textContent?.trim().startsWith('Generate')
      )
    ).toBe(true);
  });

  // The capability can disappear between the page loading and the click.
  it('renders nothing for a provider the platform no longer offers', async () => {
    await mount(
      <AiVideo
        value=""
        onChange={jest.fn()}
        only="sora"
        renderTrigger={cardTrigger}
      />
    );

    expect(document.querySelector('[data-testid="card"]')).toBeNull();
  });
});

// "the scroller around the provider form › leaves room for the focus ring on
// every side" moved to workspace.frame.spec.tsx (tasks D15a): the provider's
// fields now sit in the frame's settings scroller, which keeps that room.

// A render runs for minutes, so the waiting screen exists to say the window is
// not a leash. Where the video lands afterwards is the caller's, and Studio's
// copy of the generator has no post to land it in.
describe('the note under the waiting screen', () => {
  beforeEach(() => {
    // Never resolves, so the rendering phase stays on screen to be read.
    rendersForever();
  });

  // A window for the post outside a composer tab, as a channel's settings row
  // opens: it can be closed (`close_window_video_note`, review C4).
  it('promises the post by default', async () => {
    await generate();

    expect(document.body.textContent).toContain(
      "You can close this window — the video will be added to your post when it's ready."
    );
    expect(document.body.textContent).not.toContain('Keep writing');
  });

  it('promises the Media library when nothing is being composed', async () => {
    await generate({ destination: 'media' });

    expect(document.body.textContent).toContain(
      "the video will be saved to your Media library when it's ready"
    );
  });

  // FR-014: any move inside the app keeps the render; a closed browser tab is
  // not promised.
  it('says on its page that the member can leave the page', async () => {
    await generate({ layout: 'page', destination: 'media' });

    expect(stage()!.textContent).toContain(
      "You can leave this page. The video is saved to your Media library when it's ready."
    );
    expect(document.body.textContent).not.toContain('close this window');
  });
});

// The video is a Media row before this screen exists — the route saves it as
// it finishes — so outside a composer the action is not "use" at all: there is
// nothing left to attach it to (contracts §3, StageActions).
describe('the action that accepts the result', () => {
  beforeEach(() => {
    renders();
  });

  it('offers to use the video in the post by default', async () => {
    await generate();
    await settle();

    const labels = Array.from(document.querySelectorAll('button')).map((node) =>
      node.textContent?.trim()
    );
    expect(labels).toContain('Use video');
  });

  it('on its page with destination `media` offers Download and, only with `onCreatePost`, Create a post; no Use video, no Done', async () => {
    const hosts: Array<[Host, string[]]> = [
      [
        { layout: 'page', destination: 'media', onCreatePost: jest.fn() },
        ['Download', 'Create a post'],
      ],
      [{ layout: 'page', destination: 'media' }, ['Download']],
    ];

    for (const [host, actions] of hosts) {
      const root = await generate(host);
      await settle();

      expect(resultActions()).toEqual(actions);
      act(() => root.unmount());
    }
  });

  // A window accepts, so it offers the accept button even with nothing to
  // attach the video to: Done, main's word, whose onChange brings Studio's
  // saved banner.
  it('in a window for the Media library offers Done, which hands the video over and then closes the window', async () => {
    const onChange = jest.fn();
    const onAccept = jest.fn();
    await generate({ destination: 'media', onChange, onAccept });
    await settle();

    expect(resultActions()).toEqual(['Download', 'Done']);

    await click(buttonStarting('Done'));

    expect(onChange).toHaveBeenCalledWith(finished);
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onChange.mock.invocationCallOrder[0]).toBeLessThan(
      onAccept.mock.invocationCallOrder[0]
    );
  });

  it('offers Download and Use video in a reference window', async () => {
    await generate({ destination: 'reference' });
    await settle();

    expect(resultActions()).toEqual(['Download', 'Use video']);
  });

  it('downloads the video on screen', async () => {
    await generate({ layout: 'page', destination: 'media' });
    await settle();

    const download = stage()!.querySelector('a[download]');
    expect(download?.textContent?.trim()).toBe('Download');
    expect(download?.getAttribute('href')).toBe(finished.path);
  });

  // FR-007: the page's Create a post is the host's, handed in (tasks D4).
  it('hands the video on screen to Create a post on its page', async () => {
    const onCreatePost = jest.fn();
    await generate({ layout: 'page', destination: 'media', onCreatePost });
    await settle();

    await click(buttonStarting('Create a post'));

    expect(onCreatePost).toHaveBeenCalledWith(finished);
  });

  it('hands the video to the post and closes the window on Use video', async () => {
    const onChange = jest.fn();
    const onAccept = jest.fn();
    await generate({ onChange, onAccept });
    await settle();

    await click(buttonStarting('Use video'));

    expect(onChange).toHaveBeenCalledWith(finished);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

// Generate stays on screen while the credits are checked, on a result as
// before one, so a second click there started a second render and a second
// charge.
describe('a second click while the credits are checked', () => {
  /**
   * Holds every credit check until the returned function answers them all;
   * renders answer at once. Answering every one matters: were only the last
   * answered, a missing guard would still show a single render.
   */
  const holdCreditChecks = () => {
    const pending: Array<() => void> = [];
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? new Promise((resolve) =>
            pending.push(() => resolve(answer(200, true)))
          )
        : Promise.resolve(rendered())
    );
    return async () => {
      await act(async () => {
        pending.splice(0).forEach((answerCheck) => answerCheck());
      });
      await settle();
    };
  };

  const field = () =>
    document.querySelector('input[name="prompt"]') as HTMLInputElement;

  it('starts one render', async () => {
    const answerChecks = holdCreditChecks();

    await generate();
    await click(buttonStarting('Generate'));
    await settle();
    await answerChecks();

    expect(posted('/media/generate-video')).toHaveLength(1);
  });

  it("starts one render from a second Generate on a result (the handshake's `regenerate`)", async () => {
    renders();
    await generate();
    await settle();
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(mainButton());
    await click(mainButton());
    await answerChecks();

    expect(posted('/media/generate-video')).toHaveLength(1);
  });

  // A refused check ends the render, and the guard with it: the button must
  // not stay dead for when credits are bought.
  it('takes the next click once a refused check has answered', async () => {
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed') ? refused() : Promise.resolve(answer(200, {}))
    );
    await generate();
    renders();

    await click(buttonStarting('Generate'));
    await settle();

    expect(posted('/media/generate-video')).toHaveLength(1);
  });

  // The form is checked again once the credits are: a field emptied while
  // they were being checked ends the render before it starts, and the guard
  // with it.
  it('takes the next click once an incomplete form has been reported', async () => {
    mockRequiredField = true;
    await open();
    await type(field(), 'a pomegranate');
    const answerChecks = holdCreditChecks();
    await click(buttonStarting('Generate'));
    await settle();
    await type(field(), '');
    await answerChecks();
    renders();
    await type(field(), 'a pomegranate');

    await click(buttonStarting('Generate'));
    await settle();

    expect(toast).toHaveBeenCalledWith(
      'Please fill all required fields',
      'warning'
    );
    expect(posted('/media/generate-video')).toHaveLength(1);
  });

  // A provider that runs its own render claims it from the tool at the click,
  // and the tool holds the claim until that render is handed back.
  it("holds a provider's claim until its render is handed back", async () => {
    await open();

    expect(mockVideo!.claimRender()).toBe(true);
    expect(mockVideo!.claimRender()).toBe(false);
    act(() => mockVideo!.failRender());
    expect(mockVideo!.claimRender()).toBe(true);
  });

  // Closing would leave the render to finish on its own and hand the post a
  // second video after the one just used.
  it('keeps Use video waiting for the render', async () => {
    const onChange = jest.fn();
    renders();
    await generate({ onChange });
    await settle();
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(mainButton());
    await click(buttonStarting('Use video'));
    await answerChecks();

    expect(onChange).not.toHaveBeenCalled();
    expect(posted('/media/generate-video')).toHaveLength(1);
    expect(buttonStarting('Use video')).toBeTruthy();
  });

  // Going back would show the provider's screen until the check answers, and
  // then the waiting screen over it. A workflow's Generate on a result claims
  // the render at the click and checks its credits from there, as Image Text
  // Slides does; only a workflow has a back action (tasks D7).
  it("keeps the result on screen when a workflow's back action (`backLabel`) is pressed while a second Generate's check runs", async () => {
    const onBack = jest.fn();
    const regenerate = jest.fn(() => mockVideo!.claimRender());
    await open();
    await providerRender({ regenerate, backLabel: 'Edit script', onBack });

    await click(mainButton());
    await click(buttonStarting('Edit script'));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
    expect(stageVideo()?.getAttribute('src')).toBe(finished.path);
    expect(buttonStarting('Use video')).toBeTruthy();
    act(() => mockVideo!.failRender());
  });

  // Swapping the type unmounts the tool over its render, which goes on
  // without it, and the next type could start another.
  it('keeps the type while a render is starting', async () => {
    await mount(
      <AiVideo value="" onChange={jest.fn()} renderTrigger={cardTrigger} />
    );
    await click(document.querySelector('[data-testid="card"]'));
    await click(buttonStarting('Veo 3'));
    const answerChecks = holdCreditChecks();
    await click(buttonStarting('Generate'));
    await settle();

    await click(buttonStarting('Veo 3'));

    expect(document.body.textContent).not.toContain('Choose a video type');
    await answerChecks();
  });
});

// Spec 060 (FR-026, contracts/ui.md §9) and tasks D15e: the main button and
// the result's actions are one height, the shared button's large size. The
// frame's bar replaces the window's action row.
describe("the frame's buttons", () => {
  it('draws Generate at the large size', async () => {
    await open();

    expect(mainButton()?.textContent?.trim()).toBe('Generate');
    expect(tokens(mainButton())).toEqual(expect.arrayContaining(LARGE));
  });

  it("draws a workflow's back action and Use video at the large size", async () => {
    await open();
    await providerRender({ backLabel: 'Edit script', onBack: jest.fn() });

    [buttonStarting('Edit script'), buttonStarting('Use video')].forEach(
      (action) => expect(tokens(action)).toEqual(expect.arrayContaining(LARGE))
    );
  });

  it('draws Download and Create a post at the large size on its page', async () => {
    renders();
    await generate({
      layout: 'page',
      destination: 'media',
      onCreatePost: jest.fn(),
    });
    await settle();

    [
      stage()!.querySelector('a[download]'),
      buttonStarting('Create a post'),
    ].forEach((action) =>
      expect(tokens(action)).toEqual(expect.arrayContaining(LARGE))
    );
  });
});

// The settings sit in the frame's settings, the same for every host (FR-004,
// FR-009, FR-010).
describe('the settings', () => {
  const tile = (label: string) =>
    Array.from(panel()!.querySelectorAll('button[aria-pressed]')).find((node) =>
      node.textContent?.startsWith(label)
    );

  // plan Q6: today's order, Orientation first, through the shared field.
  it('draw Orientation first, Vertical chosen, through the shared tiles', async () => {
    await open({ layout: 'page', destination: 'media' });

    const settings = panel()!;
    const scroller = settings.querySelector('.overflow-y-auto')!;
    const label = byText(settings, 'Orientation');
    const tiles = Array.from(settings.querySelectorAll('button[aria-pressed]'));

    expect(scroller.textContent?.startsWith('Orientation')).toBe(true);
    expect(tokens(label)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-[600]'])
    );
    expect(tiles.map((node) => node.textContent)).toEqual([
      'Vertical9:16',
      'Horizontal16:9',
    ]);
    expect(tiles.map((node) => node.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
    ]);
    expect(follows(byTestId('provider-fields'), tiles[1])).toBe(true);
  });

  it('send the orientation picked with the render', async () => {
    renders();
    await open({ layout: 'page', destination: 'media' });

    await click(tile('Horizontal'));
    await pressGenerate();
    await settle();

    const [[, init]] = posted('/media/generate-video');
    expect(JSON.parse(init.body).output).toBe('horizontal');
  });

  it("start a model's settings with its maker and facts, from its card", async () => {
    await open({ layout: 'page', destination: 'media' });

    const settings = panel()!;
    const orientation = byText(settings, 'Orientation');
    ['Google', '~8 s', '1080p', 'Sound'].forEach((text) =>
      expect(follows(orientation, holding(settings, text))).toBe(true)
    );
  });

  it("start a workflow's settings with its steps", async () => {
    await open({ layout: 'page', destination: 'media', provider: slides });

    act(() =>
      mockVideo!.setTrail({ steps: ['Script', 'Review', 'Render'], current: 1 })
    );

    const settings = panel()!;
    const [script, review, render] = ['Script', 'Review', 'Render'].map(
      (step) => holding(settings, step)
    );
    expect(follows(review, script)).toBe(true);
    expect(follows(render, review)).toBe(true);
    expect(follows(byText(settings, 'Orientation'), render)).toBe(true);
  });

  // The live walk: in the page's 360px panel the steps kept their width and
  // cut "Image Text Slides" to 69 of its 104px. The name stays whole; when
  // the row is short the steps take the next line, from its start.
  it("keep a workflow's whole name, its steps going under it when the row is short", async () => {
    await open({ layout: 'page', destination: 'media', provider: slides });

    act(() =>
      mockVideo!.setTrail({ steps: ['Script', 'Review', 'Render'], current: 0 })
    );

    const name = holding(panel()!, 'Image Text Slides')!;
    const row = name.parentElement!;
    expect(tokens(name)).not.toContain('truncate');
    expect(tokens(row)).toEqual(
      expect.arrayContaining(['flex-wrap', 'justify-between'])
    );
    expect(row.contains(holding(panel()!, 'Script')!)).toBe(true);
    expect(
      Array.from(row.querySelectorAll('*')).filter((node) =>
        tokens(node).includes('ms-auto')
      )
    ).toHaveLength(0);
  });

  // The window's own scroller goes: the frame's settings scroll for it.
  it("leave out the window's capped scroller", async () => {
    await open({ layout: 'page', destination: 'media' });
    await open();

    expect(
      Array.from(document.querySelectorAll('[class]')).filter((node) =>
        tokens(node).includes('max-h-[min(430px,60vh)]')
      )
    ).toHaveLength(0);
  });
});

// The stage shows the sample, the wait, or the video, the same in every host
// (FR-006, FR-016a, tasks D3).
describe('the stage', () => {
  it("shows the provider's cover before anything is made, marked as a sample, and what to do", async () => {
    await open({ layout: 'page', destination: 'media' });

    const sample = stage()!;
    expect(sample.querySelector('img')?.getAttribute('src')).toBe(
      '/studio/covers/veo3.webp'
    );
    expect(sample.textContent).toContain('Sample');
    expect(sample.textContent).toContain('Your video appears here');
    expect(sample.textContent).toContain(
      'Fill in the settings, then press Generate.'
    );
  });

  // The Studio card's placeholder stands in for a cover the provider lacks.
  it('shows no picture for a provider with no card', async () => {
    delete mockCards.veo3;
    await open({ layout: 'page', destination: 'media' });

    expect(stage()!.querySelector('img')).toBeNull();
    expect(stage()!.textContent).toContain('Your video appears here');
  });

  it('hands the provider its slot only while nothing is being made or shown', async () => {
    const land = holdRender();
    await open({ layout: 'page', destination: 'media', provider: slides });

    expect(mockVideo!.phase).toBe('setup');
    expect(mockVideo!.stageSlot).toBeInstanceOf(HTMLElement);
    expect(stage()!.contains(mockVideo!.stageSlot!)).toBe(true);

    await pressGenerate();
    await settle();

    expect(mockVideo!.phase).toBe('rendering');
    expect(mockVideo!.stageSlot).toBeNull();

    await land();

    expect(mockVideo!.phase).toBe('result');
    expect(mockVideo!.stageSlot).toBeNull();
  });

  // The slot is a stage owner's (`ownsStage`), as the action bar's is an
  // action owner's: a one-shot provider has nothing to put there.
  it('hands a provider that does not own the stage no slot, and shows the sample', async () => {
    await open({ layout: 'page', destination: 'media' });

    expect(mockVideo!.phase).toBe('setup');
    expect(mockVideo!.stageSlot).toBeNull();
    expect(stage()!.textContent).toContain('Your video appears here');
  });

  // A workflow's middle step, a storyboard, belongs in the stage.
  it('shows what the provider puts in its slot in place of the sample', async () => {
    mockStageContent = <div data-testid="storyboard">Slide 1</div>;
    await open({ layout: 'page', destination: 'media', provider: slides });
    await settle();

    expect(stage()!.contains(byTestId('storyboard'))).toBe(true);
    expect(stage()!.textContent).not.toContain('Your video appears here');
  });

  // A provider's stage part is a flex item that fills a column (StageSample's
  // own box), so the filled slot is that column and no provider wraps it.
  it("makes a filled slot the column the provider's part fills", async () => {
    mockStageContent = <div data-testid="storyboard">Slide 1</div>;
    await open({ layout: 'page', destination: 'media', provider: slides });
    await settle();

    expect(
      (mockVideo!.stageSlot!.getAttribute('class') ?? '').split(/\s+/)
    ).toEqual(
      expect.arrayContaining([
        'flex-1',
        'min-h-0',
        'overflow-y-auto',
        'flex',
        'flex-col',
      ])
    );
  });

  it('shows the wait in the chosen shape, with the time it has taken', async () => {
    rendersForever();
    await generate({ layout: 'page', destination: 'media' });

    const wait = stage()!;
    const placeholder = wait.querySelector<HTMLElement>(
      '.motion-safe\\:animate-pulse'
    )!;
    expect(parseFloat(placeholder.style.aspectRatio)).toBeCloseTo(9 / 16, 5);
    expect(wait.textContent).toContain('Creating your video…');
    expect(wait.textContent).toContain(
      'Usually takes a few minutes · 0:00 elapsed'
    );
  });

  // The shape stays editable during a render, for the next one (FR-008); the
  // box waits in the shape being made.
  it("keeps the wait in the render's shape when another is picked meanwhile", async () => {
    rendersForever();
    await generate({ layout: 'page', destination: 'media' });

    const horizontal = Array.from(
      panel()!.querySelectorAll('button[aria-pressed]')
    ).find((node) => node.textContent?.startsWith('Horizontal'));
    await click(horizontal);

    expect(horizontal?.getAttribute('aria-pressed')).toBe('true');
    const placeholder = stage()!.querySelector<HTMLElement>(
      '.motion-safe\\:animate-pulse'
    )!;
    expect(parseFloat(placeholder.style.aspectRatio)).toBeCloseTo(9 / 16, 5);
  });

  it("lists a workflow's render steps in place of the time", async () => {
    await open({ layout: 'page', destination: 'media', provider: slides });

    act(() => {
      mockVideo!.claimRender();
      mockVideo!.startRender({
        steps: [
          'Writing the script',
          'Drawing the slides',
          'Putting the video together',
        ],
        regenerate: jest.fn(),
      });
    });
    act(() => mockVideo!.reportProgress({ index: 1, done: 2, total: 4 }));

    const wait = stage()!;
    expect(wait.textContent).toContain('Writing the script');
    expect(wait.textContent).toContain('Drawing the slides · 2/4');
    expect(wait.textContent).toContain('Putting the video together');
    expect(wait.textContent).toContain('Usually takes a few minutes');
    expect(wait.textContent).not.toContain('elapsed');
    act(() => mockVideo!.failRender());
  });

  it('plays the video where it was made, saved to the Media library', async () => {
    renders();
    await generate({ layout: 'page', destination: 'media' });
    await settle();

    const video = stageVideo()!;
    expect(video.getAttribute('src')).toBe(finished.path);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(stage()!.textContent).toContain('Saved to your Media library');
  });

  // FR-015: on its page a phone lets the stage grow with the video, at the
  // full width in its own shape, the page scrolling on to its actions and
  // versions; the sample and the wait keep the stage's fixed height.
  const FIXED = 'phone:h-[clamp(240px,45dvh,440px)]';

  it('on its page lets the stage grow with the video on a phone, from the sample', async () => {
    renders();
    await open({ layout: 'page', destination: 'media' });

    expect(tokens(stage())).toContain(FIXED);

    await pressGenerate();
    await settle();

    expect(tokens(stage())).not.toContain(FIXED);
    expect(tokens(stage())).toContain('phone:[container-type:normal]');
    expect(tokens(stageVideo())).toContain('phone:!w-full');
  });

  it('on its page keeps the stage at its fixed height on a phone while the video is made', async () => {
    rendersForever();
    await generate({ layout: 'page', destination: 'media' });

    expect(stage()!.textContent).toContain('Creating your video…');
    expect(tokens(stage())).toContain(FIXED);
  });

  it("keeps a window's video to the stage's fixed height", async () => {
    renders();
    await generate();
    await settle();

    expect(tokens(stage())).toContain('h-[clamp(240px,45dvh,440px)]');
    expect(tokens(stageVideo())).not.toContain('phone:!w-full');
  });
});

// This visit's results, one version per render (FR-008, data-model §3).
describe('the versions', () => {
  const pressed = () =>
    versionButtons().map((node) => node.getAttribute('aria-pressed'));

  it('adds a version for a second render, and the strip shows both', async () => {
    renders(finished, second);
    await generate({ layout: 'page', destination: 'media' });
    await settle();

    expect(stage()!.querySelector('[role="group"]')).toBeNull();

    await click(mainButton());
    await settle();

    expect(
      versionButtons().map((node) => node.getAttribute('aria-label'))
    ).toEqual(['Version 1', 'Version 2']);
    expect(pressed()).toEqual(['false', 'true']);
    expect(stageVideo()?.getAttribute('src')).toBe(second.path);
  });

  it('shows the version chosen, and Use video takes that one', async () => {
    const onChange = jest.fn();
    renders(finished, second);
    await generate({ onChange });
    await settle();
    await click(mainButton());
    await settle();

    await click(versionButtons()[0]);

    expect(stageVideo()?.getAttribute('src')).toBe(finished.path);
    expect(pressed()).toEqual(['true', 'false']);

    await click(buttonStarting('Use video'));

    expect(onChange).toHaveBeenCalledWith(finished);
  });

  // The earlier result was paid for, so a second render that fails must not
  // throw it away.
  it('puts the video on screen back when a second render fails', async () => {
    renders();
    await generate();
    await settle();
    rendersFail();

    await click(mainButton());
    await settle();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
    expect(stageVideo()?.getAttribute('src')).toBe(finished.path);
    expect(stage()!.querySelector('[role="group"]')).toBeNull();
    expect(buttonStarting('Use video')).toBeTruthy();
  });

  it('puts back the version chosen, not the latest, when a render fails', async () => {
    const onChange = jest.fn();
    renders(finished, second);
    await generate({ onChange });
    await settle();
    await click(mainButton());
    await settle();
    await click(versionButtons()[0]);
    rendersFail();

    await click(mainButton());
    await settle();

    expect(stageVideo()?.getAttribute('src')).toBe(finished.path);
    expect(pressed()).toEqual(['true', 'false']);

    await click(buttonStarting('Use video'));

    expect(onChange).toHaveBeenCalledWith(finished);
  });
});

// The bar's main button: Generate, then, on a result, the same render again
// through the handshake (FR-003, FR-008, tasks D6).
describe('the main button', () => {
  it("runs the handshake's regenerate on a result", async () => {
    const regenerate = jest.fn();
    await open();
    await providerRender({ regenerate });

    await click(mainButton());

    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  // One render at a time (`claimRender`).
  it('says it is working while a render runs, and a press there starts nothing', async () => {
    rendersForever();
    await generate({ layout: 'page', destination: 'media' });

    expect(mainButton()?.textContent?.trim()).toBe('Creating…');
    expect(mainButton()?.getAttribute('aria-busy')).toBe('true');
    expect(mockVideo!.claimRender()).toBe(false);

    await click(mainButton());
    await settle();

    expect(posted('/media/generate-video')).toHaveLength(1);
  });

  it('shows the credits left beside it', async () => {
    await open({ layout: 'page', destination: 'media' });

    expect(bar()!.textContent).toContain('7 credits left');
  });
});

// Only a workflow has an earlier screen to go back to after its video: Image
// Text Slides' Edit script returns to Review with the script. A one-shot
// render's settings sit beside its result (tasks D7, FR-010).
describe("a workflow's back action", () => {
  it("shows the handshake's back label as a secondary action that returns to setup and keeps the versions", async () => {
    const onBack = jest.fn();
    await open({ layout: 'page', destination: 'media', provider: slides });
    await providerRender({ backLabel: 'Edit script', onBack });

    const back = buttonStarting('Edit script')!;
    expect(stage()!.contains(back)).toBe(true);
    expect(tokens(back)).toEqual(
      expect.arrayContaining(
        buttonClassName({ variant: 'secondary', size: 'large' }).split(' ')
      )
    );

    await click(back);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockVideo!.phase).toBe('setup');
    // The stage is the workflow's again, for its Review screen.
    expect(stage()!.contains(mockVideo!.stageSlot)).toBe(true);

    await providerRender({ backLabel: 'Edit script', onBack }, second);

    expect(versionButtons()).toHaveLength(2);
  });

  it('shows none for a handshake without one', async () => {
    await open();
    await providerRender();

    expect(resultActions()).toEqual(['Download', 'Use video']);
  });

  it('shows none after its own Generate: no Edit prompt', async () => {
    renders();
    await generate();
    await settle();

    expect(resultActions()).toEqual(['Download', 'Use video']);
    expect(document.body.textContent).not.toContain('Edit prompt');
  });
});

// The window's and the composer tab's chooser (contracts §5): today's list of
// types, then the chosen type's tool with a way back to the list.
describe('AiVideoChooser', () => {
  const backTo = (label: string) =>
    Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === label
    );

  it('draws the chooser, then the chosen tool with a way back to it', async () => {
    await mount(
      <AiVideoChooser
        list={providers}
        layout="stacked"
        destination="post"
        onChange={jest.fn()}
        onAccept={jest.fn()}
        setLoading={jest.fn()}
      />
    );

    expect(document.body.textContent).toContain('Choose a video type');

    await click(buttonStarting('Veo 3'));

    expect(document.body.textContent).not.toContain('Choose a video type');
    expect(mainButton()?.textContent?.trim()).toBe('Generate');

    await click(backTo('Veo 3'));

    expect(document.body.textContent).toContain('Choose a video type');
  });

  // The way back names the type in full, as the page's head does.
  it("keeps the chosen type's whole name on its way back", async () => {
    await mount(
      <AiVideoChooser
        list={providers}
        layout="stacked"
        destination="post"
        onChange={jest.fn()}
        onAccept={jest.fn()}
        setLoading={jest.fn()}
      />
    );

    await click(buttonStarting('Image Text Slides'));

    const back = backTo('Image Text Slides')!;
    expect(
      Array.from(back.querySelectorAll('*')).filter((node) =>
        tokens(node).includes('truncate')
      )
    ).toHaveLength(0);
  });

  it('opens the one type there is, with no way back', async () => {
    await mount(
      <AiVideoChooser
        list={providers.slice(0, 1)}
        layout="stacked"
        destination="post"
        onChange={jest.fn()}
        onAccept={jest.fn()}
        setLoading={jest.fn()}
      />
    );

    expect(document.body.textContent).not.toContain('Choose a video type');
    expect(mainButton()?.textContent?.trim()).toBe('Generate');
    expect(backTo('Veo 3')).toBeUndefined();
  });
});

// The windows that stay take the frame's stacked layout (maintainer's Q1), at
// one size, so the bar is never below the screen (contracts §6).
describe('the window', () => {
  it('opens at the window size, clear of the top of the screen', async () => {
    await openWindow();

    expect(mockOpened).toHaveLength(1);
    expect(mockOpened[0]).toEqual(
      expect.objectContaining({
        size: 'min(640px, 100%)',
        height: 'min(860px, calc(100dvh - 48px))',
        top: 24,
      })
    );
  });

  it('shows the credits left in its bar, not in its header', async () => {
    await openWindow();

    expect(bar()!.textContent).toContain('7 credits left');
    expect(document.body.textContent!.split('credits left')).toHaveLength(2);
  });

  it('folds its settings after a result, under their summary, and offers Generate again', async () => {
    renders();
    await openWindow();

    expect(buttonStarting('Settings')).toBeUndefined();

    await pressGenerate();
    await settle();

    const row = buttonStarting('Settings')!;
    expect(row.textContent).toContain('Prompt and settings');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(mainButton()?.textContent?.trim()).toBe('Generate again');
    expect(tokens(mainButton())).toEqual(expect.arrayContaining(LARGE));
  });
});

// A render outlives its host: one that lands once the member has left the
// page goes where today's closed window sent it (FR-014, R1).
describe('a render that lands after the tool is gone', () => {
  it('hands its video to onChange', async () => {
    const onChange = jest.fn();
    const land = holdRender();
    const root = await open({ layout: 'page', destination: 'media', onChange });
    await pressGenerate();
    await settle();

    act(() => root.unmount());
    await land();

    expect(onChange).toHaveBeenCalledWith(finished);
  });

  /** Makes a video, then a second render that fails once the host is gone. */
  const failAfterLeaving = async (host: Host) => {
    renders();
    const root = await generate(host);
    await settle();
    let fail: () => void = () => undefined;
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise((resolve) => {
            fail = () =>
              resolve(answer(500, { message: 'the renderer fell over' }));
          })
    );

    await click(mainButton());
    await settle();
    act(() => root.unmount());
    await act(async () => fail());
    await settle();
  };

  // On the page onChange raises the ready notice, and the Media library
  // already holds the earlier video: handing it back would announce it as new.
  it('announces nothing when the page was left and the next render failed', async () => {
    const onChange = jest.fn();
    await failAfterLeaving({ layout: 'page', destination: 'media', onChange });

    expect(posted('/media/generate-video')).toHaveLength(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  // The post or the reference row was promised a video, and the one on
  // screen is paid for.
  it('attaches the video on screen when its window was closed and the next render failed', async () => {
    for (const destination of ['post', 'reference'] as const) {
      const onChange = jest.fn();
      await failAfterLeaving({ destination, onChange });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(finished);
    }
  });
});

// Spec 061 part 3 (FR-021, FR-023; tasks D10): in the composer, AI Video opens
// its tab beside the post, never a window, for the post its button is under.
// The button hands the composer's opener its kind, its row's handler, the
// post's index and where the video goes; Studio and a reference row keep the
// window (composer.stage.spec.tsx).
describe('in the composer', () => {
  const aiButton = () => document.querySelector('.bg-aiSoft');

  /** The composer's ✦ button under one post's media row. */
  const row = async (
    onChange: jest.Mock,
    props: { place?: number; destination?: MediaDestination } = {}
  ) => {
    mockTabs = { open: jest.fn() };
    await mount(<AiVideo value="" onChange={onChange} {...props} />);
  };

  it('opens the AI video tab for the post, never a window', async () => {
    const onChange = jest.fn();
    await row(onChange);
    await click(aiButton());

    expect(mockOpenTool).toHaveBeenLastCalledWith(
      'video',
      onChange,
      0,
      'post',
      expect.any(Function)
    );
    expect(mockTabs!.open).toHaveBeenCalledTimes(1);
    expect(mockOpened).toHaveLength(0);
  });

  // The stage reads the post's channel at the click (tasks D10).
  it('hands the tab the index of the post its button is under', async () => {
    const onChange = jest.fn();
    await row(onChange, { place: 2 });

    expect(mockOpenTool).toHaveBeenLastCalledWith(
      'video',
      onChange,
      2,
      'post',
      expect.any(Function)
    );
  });

  it("hands the opener a reference row's destination", async () => {
    const onChange = jest.fn();
    await row(onChange, { destination: 'reference' });

    expect(mockOpenTool).toHaveBeenLastCalledWith(
      'video',
      onChange,
      0,
      'reference',
      expect.any(Function)
    );
  });
});

// The tool in a composer tab reports its request to the stage, which shows
// the tab's spinner and the previews' placeholder and holds the composer's
// lock while any tab's request is open (tasks D14); it is watching only while
// its tab is on screen (contracts/workspace-parts.md §5).
describe('as a composer tab', () => {
  const keepWriting =
    "Keep writing, switch to Post preview or close this tab. The video is added to your post when it's ready.";

  it('says the member can keep writing while it works (`composer_leave_note_video`)', async () => {
    rendersForever();
    await openTab();
    await pressGenerate();

    expect(stage()!.textContent).toContain(keepWriting);
    expect(document.body.textContent).not.toContain('close this window');
  });

  // FR-023: the tab is the window's body beside the post.
  it("starts with the chooser, then the choice's fields, its progress and Use video", async () => {
    const land = holdRender();
    const { onChange, onAccept } = await openTab(providers);

    expect(document.body.textContent).toContain('Choose a video type');
    expect(buttonStarting('Image Text Slides')).toBeTruthy();

    await click(buttonStarting('Veo 3'));

    expect(byTestId('provider-fields')).toBeTruthy();

    await pressGenerate();

    expect(stage()!.textContent).toContain(keepWriting);

    await land();
    await click(buttonStarting('Use video'));

    expect(onChange).toHaveBeenCalledWith(finished);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('reports its request through setLoading alone: true once the credit check passes, false with the result on screen, unused', async () => {
    const land = holdRender();
    const { setLoading, onChange } = await openTab();
    await pressGenerate();

    expect(setLoading.mock.calls).toEqual([[true]]);

    await land();

    expect(stageVideo()).toBeTruthy();
    expect(setLoading.mock.calls).toEqual([[true], [false]]);
    expect(onChange).not.toHaveBeenCalled();
    expect(setLocked).not.toHaveBeenCalled();
  });

  it('reports nothing for a render the credit check refuses', async () => {
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed') ? refused() : Promise.resolve(answer(200, {}))
    );
    const { setLoading } = await openTab();
    await pressGenerate();

    expect(setLoading).not.toHaveBeenCalled();
    expect(setLocked).not.toHaveBeenCalled();
  });

  it('reports false after a failed render', async () => {
    rendersFail();
    const { setLoading } = await openTab();
    await pressGenerate();
    await settle();

    expect(setLoading.mock.calls).toEqual([[true], [false]]);
    expect(setLocked).not.toHaveBeenCalled();
  });

  it('reports false when the render settles after its tab closed, and hands the video on', async () => {
    const land = holdRender();
    const { setLoading, onChange, leave } = await openTab();
    await pressGenerate();
    leave();
    await land();

    expect(setLoading.mock.calls).toEqual([[true], [false]]);
    expect(onChange).toHaveBeenCalledWith(finished);
    expect(setLocked).not.toHaveBeenCalled();
  });

  it('hands the video on, with no result shown, when it lands while another tab is on screen', async () => {
    const land = holdRender();
    const { onChange, show } = await openTab();
    await pressGenerate();
    await show(false);
    await land();

    expect(onChange).toHaveBeenCalledWith(finished);
    expect(stageVideo()).toBeFalsy();
  });

  it('shows the result, handing nothing on, when it lands on screen', async () => {
    const land = holdRender();
    const { onChange, show } = await openTab();
    await pressGenerate();
    await show(false);
    await show(true);
    await land();

    expect(stageVideo()).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  // Outside the composer no host passes `active`: the page and the windows
  // watch while they are mounted, as before.
  it('shows the result outside the composer, with no `active`, as before', async () => {
    const land = holdRender();
    const onChange = jest.fn();
    await generate({ layout: 'page', destination: 'media', onChange });
    await land();

    expect(stageVideo()).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// Spec 061 (FR-021a; tasks D14): no tool writes the composer's lock any more.
// In the composer the stage holds it while any tab's request is open (one
// image and one video can render at once); the Studio page, a window and a
// tab never take it.
describe("the composer's lock", () => {
  it('is never taken on its page, before, during or after a result', async () => {
    const land = holdRender();
    const root = await open({ layout: 'page', destination: 'media' });

    expect(setLocked).not.toHaveBeenCalled();

    await pressGenerate();
    await settle();

    expect(setLocked).not.toHaveBeenCalled();

    await land();

    expect(stageVideo()).toBeTruthy();
    expect(setLocked).not.toHaveBeenCalled();

    act(() => root.unmount());

    expect(setLocked).not.toHaveBeenCalled();
  });

  it('is never taken by a reference window', async () => {
    renders();
    await openWindow('reference');
    await pressGenerate();
    await settle();

    await click(buttonStarting('Use video'));

    expect(setLocked).not.toHaveBeenCalled();
  });

  it('is never taken by a post window, from the request to Use video', async () => {
    const onChange = jest.fn();
    renders();
    await openWindow('post', onChange);
    await pressGenerate();
    await settle();

    expect(setLocked).not.toHaveBeenCalled();

    await click(buttonStarting('Use video'));

    expect(onChange).toHaveBeenCalledWith(finished);
    expect(setLocked).not.toHaveBeenCalled();
  });

  it('is never taken by a post window closed with its result unused', async () => {
    renders();
    await openWindow('post');
    await pressGenerate();
    await settle();

    expect(stageVideo()).toBeTruthy();

    act(() => closeEveryModal?.());

    expect(setLocked).not.toHaveBeenCalled();
  });

  it('is never taken by a composer tab, before, during or after a result', async () => {
    const land = holdRender();
    await openTab();
    await pressGenerate();

    expect(setLocked).not.toHaveBeenCalled();

    await land();
    await click(buttonStarting('Use video'));

    expect(setLocked).not.toHaveBeenCalled();
  });
});
