import { act, FC, ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const toast = jest.fn();
const setLocked = jest.fn();
const request = jest.fn();
let providers: Array<{ identifier: string; title: string }> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ setLocked, setActivateExitButton: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { current: 'STANDARD' }, role: 'ADMIN' }),
}));
// The trigger reads the provider list through SWR and the credits pill reads
// the credit count; the list is what the trigger specs steer.
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) =>
    key === 'load-videos-ai'
      ? { data: providers, isLoading: false }
      : { data: { credits: 0 }, mutate: jest.fn() },
}));
// The provider registry drags in every video provider; this spec only needs a
// type that leaves the action bar — and therefore the Generate button — to the
// modal.
jest.mock(
  '@gitroom/frontend/components/videos/video.render.component',
  () => ({
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: () => undefined,
  })
);

import {
  AiVideo,
  Modal,
} from '@gitroom/frontend/components/launches/ai.video';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';

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

const generate = async (destination?: MediaDestination) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <Modal
        type={{ identifier: 'veo3', title: 'Veo3' }}
        close={jest.fn()}
        setLoading={jest.fn()}
        onChange={jest.fn()}
        destination={destination}
      />
    );
  });

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
});

afterEach(() => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
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
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(200, true)
          : answer(500, { message: 'the renderer fell over' })
      )
    );

    await generate();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});

// The composer keeps the ✦ button and its chooser (FR-010): nothing about the
// trigger changes for a caller that asks for nothing new.
describe('as the composer button', () => {
  it('renders the ✦ button and opens the chooser from it, as before', async () => {
    await mount(<AiVideo value="" onChange={jest.fn()} />);

    const trigger = document.querySelector('.bg-ai');
    expect(trigger?.textContent?.trim()).toBe('AI Video');

    await click(trigger);

    expect(document.body.textContent).toContain('Choose a video type');
  });
});

// Studio renders a card of its own as the trigger, one per provider.
describe('with a trigger of its own', () => {
  it('renders that trigger alone and opens the chooser from it', async () => {
    await mount(
      <AiVideo value="" onChange={jest.fn()} renderTrigger={cardTrigger} />
    );

    expect(document.querySelector('.bg-ai')).toBeNull();

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

// A render runs for minutes, so the waiting screen exists to say the window is
// not a leash. Where the video lands afterwards is the caller's, and Studio's
// copy of the generator has no post to land it in.
describe('the note under the waiting screen', () => {
  beforeEach(() => {
    // Never resolves, so the rendering phase stays on screen to be read.
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise(() => undefined)
    );
  });

  it('promises the post by default', async () => {
    await generate();

    expect(document.body.textContent).toContain(
      "the video will be added to your post when it's ready"
    );
  });

  it('promises the Media library when nothing is being composed', async () => {
    await generate('media');

    expect(document.body.textContent).toContain(
      "the video will be saved to your Media library when it's ready"
    );
  });
});

// The video is a Media row before this screen exists — the route saves it as
// it finishes — so outside a composer the action is not "use" at all: there is
// nothing left to attach it to, and it only confirms and closes.
describe('the action that accepts the result', () => {
  const finished = { id: 'media-1', path: 'https://media/first.mp4' };

  beforeEach(() => {
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(200, true)
          : {
              ...answer(200, {}),
              body: stream({ name: 'done', media: finished }),
            }
      )
    );
  });

  it('offers to use the video in the post by default', async () => {
    await generate();
    await settle();

    const labels = Array.from(document.querySelectorAll('button')).map((node) =>
      node.textContent?.trim()
    );
    expect(labels).toContain('Use video');
  });

  it('only confirms when the video is not going anywhere else', async () => {
    await generate('media');
    await settle();

    const labels = Array.from(document.querySelectorAll('button')).map((node) =>
      node.textContent?.trim()
    );
    expect(labels).not.toContain('Use video');
    expect(labels).toContain('Done');
  });
});
