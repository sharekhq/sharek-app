import { act, FC, ReactNode, useEffect } from 'react';
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
// Whether the provider's form holds a required field; most cases leave it out,
// so the form always validates.
let mockRequiredField = false;
// What the modal hands its provider, as the provider receives it.
let mockVideo: ReturnType<typeof useVideo> | undefined;
// The provider registry drags in every video provider; this spec only needs a
// type that leaves the action bar — and therefore the Generate button — to the
// modal.
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  VideoWrapper: () => <ProviderStandIn />,
  videoOwnsActions: () => false,
  videoTypeCard: () => undefined,
}));

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
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';

/**
 * The provider's side of the modal: the context it is handed, and one required
 * field when a case asks for it.
 */
const ProviderStandIn: FC = () => {
  const { register } = useFormContext();
  const video = useVideo();
  useEffect(() => {
    mockVideo = video;
  }, [video]);
  return mockRequiredField ? (
    <input {...register('prompt', { required: true })} />
  ) : null;
};

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

/** Renders one provider's modal, as the chooser does once a type is picked. */
const open = async (destination?: MediaDestination, onChange = jest.fn()) => {
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
        onChange={onChange}
        destination={destination}
      />
    );
  });
};

const generate = async (
  destination?: MediaDestination,
  onChange = jest.fn()
) => {
  await open(destination, onChange);

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

// Some actions carry a credit cost after the label ("Regenerate· 1 credit"),
// so an exact match silently finds nothing and clicking it does nothing.
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

/** The render route's answer: a stream that goes straight to its done frame. */
const rendered = () => ({
  ...answer(200, {}),
  body: stream({ name: 'done', media: finished }),
});

/** Lets every credit check through; every render finishes at once. */
const renders = () =>
  request.mockImplementation((url: string) =>
    Promise.resolve(url.endsWith('/allowed') ? answer(200, true) : rendered())
  );

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
  mockRequiredField = false;
  mockVideo = undefined;
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

  // The button this complaint was filed about: at 470px it was the one that
  // wrapped onto a line of its own. Icon-only when the caller says so, with the
  // name moved onto the control rather than lost with the label.
  it('drops the word when the caller says the space is tight', async () => {
    await mount(<AiVideo value="" onChange={jest.fn()} compact={true} />);

    const trigger = document.querySelector('.bg-ai');
    expect(trigger?.textContent?.trim()).toBe('');
    expect(trigger?.getAttribute('aria-label')).toBe('AI Video');
    expect(trigger?.getAttribute('data-tooltip-content')).toBe('AI Video');
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

describe('the scroller around the provider form', () => {
  it('leaves room for the focus ring on every side', async () => {
    await open();
    const classes = document
      .querySelector('.overflow-y-auto')!
      .className.split(' ');
    // The ring is a 2px box-shadow outside the field and overflow clips at the
    // padding edge, so a scroller padded on the end side only showed the ring
    // there and cut it off at the start. The matching negative margin keeps
    // the form exactly where an unpadded scroller had it.
    expect(classes).toContain('p-[4px]');
    expect(classes).toContain('-m-[4px]');
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

// Generate and Regenerate stay on screen while the credits are checked, so a
// second click there started a second render and a second charge.
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

  it('starts one regeneration', async () => {
    renders();
    await generate();
    await settle();
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(buttonStarting('Regenerate'));
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

  // A provider that runs its own render claims it from the modal at the click,
  // and the modal holds the claim until that render is handed back.
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
    await generate(undefined, onChange);
    await settle();
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(buttonStarting('Use video'));
    await answerChecks();

    expect(onChange).not.toHaveBeenCalled();
    expect(posted('/media/generate-video')).toHaveLength(1);
    expect(buttonStarting('Use video')).toBeTruthy();
  });

  // Going back would show the provider's screen until the check answers, and
  // then the waiting screen over it.
  it('keeps the result on screen when the back action is pressed', async () => {
    renders();
    await generate();
    await settle();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(buttonStarting('Edit prompt'));

    expect(buttonStarting('Use video')).toBeTruthy();
    await answerChecks();
  });
});
