import { act, FC, ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const toast = jest.fn();
const setLocked = jest.fn();
const request = jest.fn();

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
  useLaunchStore: (select: (state: any) => any) => select({ setLocked }),
}));
// The credits pill reads SWR; the count is not what this spec is about.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { credits: 0 }, mutate: jest.fn() }),
}));

import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';

const answer = (status: number, body: any) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// What the fetch wrapper actually does with a credit refusal: the interceptor
// raises the limit modal and the request *rejects*. It must not resolve — a
// resolved response is indistinguishable from success to every caller that
// does not inspect one.
const refused = () => Promise.reject(new AlreadyAnsweredError(402));

const mounted: Array<{ unmount: () => void }> = [];

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const type = async (element: HTMLTextAreaElement, value: string) => {
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

const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );

// Some actions carry a credit cost after the label ("Regenerate· 1 credit"),
// so an exact match silently finds nothing and clicking it does nothing.
const buttonStarting = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.trim().startsWith(label)
  );

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

/** Flushes the microtask the awaited fetch resolves on. */
const settle = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

/** Opens the AI image modal, types a prompt, and presses Generate. */
const generate = async (destination?: MediaDestination) => {
  await mount(
    <AiImage value="" onChange={jest.fn()} destination={destination} />
  );

  await click(document.querySelector('.bg-ai'));
  await type(
    document.querySelector('textarea') as HTMLTextAreaElement,
    'a pomegranate on a table'
  );
  await click(button('Generate'));
};

afterEach(() => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const asked = (url: string) =>
  request.mock.calls.filter(([called]) => called === url);

// The reported symptom: the image modal showed its own warning toast where the
// limit modal belongs, because the route answered `200 false` instead of a 402.
describe('when the generation is refused for credits', () => {
  beforeEach(() => {
    request.mockImplementation(refused);
  });

  it('says nothing — the limit modal has already spoken', async () => {
    await generate();

    expect(toast).not.toHaveBeenCalled();
  });

  it('returns to the composer with the prompt intact', async () => {
    await generate();

    const field = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(field).toBeTruthy();
    expect(field.value).toBe('a pomegranate on a table');
  });

  // The pre-flight refuses before anything is committed to, so the composer is
  // never locked in the first place — stronger than locking and releasing.
  it('never locks the composer at all', async () => {
    await generate();

    expect(setLocked).not.toHaveBeenCalled();
  });

  // The reported glitch: the loader ran for about half a second and was then
  // replaced by the limit card. Asking first is what the video modal does, and
  // it is why videos never showed it.
  it('never enters the generating phase, so no loader flashes', async () => {
    await generate();

    expect(asked('/media/generate-image/allowed')).toHaveLength(1);
    expect(asked('/media/generate-image-with-prompt')).toHaveLength(0);
    // Still the composer: its Generate action is what the setup phase renders.
    expect(buttonStarting('Generate')).toBeTruthy();
  });
});

// Credits can run out between the pre-flight and the generation, so the silent
// reset behind it still has to work.
describe('when the generation is refused after the pre-flight passed', () => {
  it('resets without a second message', async () => {
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed') ? Promise.resolve(answer(200, true)) : refused()
    );

    await generate();

    expect(toast).not.toHaveBeenCalled();
    expect(setLocked).toHaveBeenLastCalledWith(false);
  });
});

// The 402 branch sits directly ahead of the generic error path, which is the
// shape that silently swallows everything else (FR-014).
describe('when the generation fails for anything else', () => {
  it('still surfaces the failure', async () => {
    request.mockResolvedValue(
      answer(500, { message: 'the renderer fell over' })
    );

    await generate();

    expect(toast).toHaveBeenCalledWith('the renderer fell over', 'warning');
  });
});

// The credit for the first image was already spent, and `generate()` clears the
// result before it asks. A refused Regenerate must not take the image with it —
// `ai.video`'s failRender holds its result for exactly this reason.
describe('when a Regenerate is refused', () => {
  it('keeps the image the credit already paid for', async () => {
    request.mockResolvedValue(
      answer(200, { id: 'media-1', path: 'https://media/first.png' })
    );
    await generate();

    // On screen, and reachable: the result phase is what offers "Use image".
    expect(button('Use image')).toBeTruthy();

    request.mockImplementation(refused);
    const regenerate = buttonStarting('Regenerate');
    expect(regenerate).toBeTruthy();
    await click(regenerate);
    // The rejection is handled a microtask after the click; asserting before
    // this flush reads the pre-click DOM and passes whatever the code does.
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });

    expect(toast).not.toHaveBeenCalled();
    expect(button('Use image')).toBeTruthy();
    expect(
      document.querySelector('img[src="https://media/first.png"]')
    ).toBeTruthy();
  });
});

// The composer keeps the ✦ button it has today (FR-010): nothing about the
// trigger changes for a caller that asks for nothing new.
describe('as the composer button', () => {
  it('renders the ✦ button and opens the generator from it, as before', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);

    const trigger = document.querySelector('.bg-ai');
    expect(trigger?.textContent?.trim()).toBe('AI Image');

    await click(trigger);

    expect(document.querySelector('textarea')).toBeTruthy();
  });
});

// Studio renders a card of its own as the trigger; the wiring behind it stays
// here rather than being copied.
describe('with a trigger of its own', () => {
  it('renders that trigger alone and opens the generator from it', async () => {
    await mount(
      <AiImage
        value=""
        onChange={jest.fn()}
        renderTrigger={(open) => (
          <button data-testid="card" onClick={open}>
            Card
          </button>
        )}
      />
    );

    expect(document.querySelector('.bg-ai')).toBeNull();

    await click(document.querySelector('[data-testid="card"]'));

    expect(document.querySelector('textarea')).toBeTruthy();
  });
});

// The waiting screen tells the user what closing it costs them: nothing,
// because the image lands by itself. Where it lands is the caller's, and
// Studio's copy of the generator has no post to land it in.
describe('the note under the waiting screen', () => {
  beforeEach(() => {
    // Never resolves, so the generating phase stays on screen to be read.
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise(() => undefined)
    );
  });

  it('promises the post by default', async () => {
    await generate();
    await settle();

    expect(document.body.textContent).toContain(
      "the image will be added to your post when it's ready"
    );
  });

  it('promises the Media library when nothing is being composed', async () => {
    await generate('media');
    await settle();

    expect(document.body.textContent).toContain(
      "the image will be saved to your Media library when it's ready"
    );
  });

  it('promises the reference images when it fills a reference row', async () => {
    await generate('reference');
    await settle();

    expect(document.body.textContent).toContain(
      "the image will be added to your reference images when it's ready"
    );
  });
});

// The image is a Media row before this screen exists — the route uploads and
// saves it — so outside a composer the action is not "use" at all: there is
// nothing left to attach it to, and it only confirms and closes.
describe('the action that accepts the result', () => {
  beforeEach(() => {
    request.mockResolvedValue(
      answer(200, { id: 'media-1', path: 'https://media/first.png' })
    );
  });

  it('offers to use the image in the post by default', async () => {
    await generate();

    expect(button('Use image')).toBeTruthy();
  });

  it('only confirms when the image is not going anywhere else', async () => {
    await generate('media');

    expect(button('Use image')).toBeFalsy();
    expect(button('Done')).toBeTruthy();
  });

  it('offers to use the image when it fills a reference row', async () => {
    await generate('reference');

    expect(button('Use image')).toBeTruthy();
  });
});

// The Cairo Cafe banner: "a banner for a 30% weekend" came back with
// «30% weekend» printed on it, verbatim. The rewrite can only guess which
// words are copy, so the composer says how to make it a certainty.
describe('the hint under the prompt', () => {
  it('tells the user to put the exact words in quotes', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));

    expect(document.body.textContent).toContain(
      'Put the words you want on the image in quotes.'
    );
  });
});
