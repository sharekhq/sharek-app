import { act, FC, ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const toast = jest.fn();
const setLocked = jest.fn();
const request = jest.fn();

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
  useLaunchStore: (select: (state: any) => any) => select({ setLocked }),
}));
// The credits pill reads SWR; the count is not what this spec is about.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: { credits: 0 }, mutate: jest.fn() }),
}));
// The Media library the reference row opens. Its own behaviour, the limit
// included, has its own spec; here it only records what it was opened with,
// so a test can answer for it.
const picker: Array<{
  max?: number;
  type?: string;
  setMedia: (media: { id: string; path: string }[]) => void;
}> = [];
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: (props: (typeof picker)[number]) => {
    picker.push(props);
    return null;
  },
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
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
      cancel: async (): Promise<void> => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

const streamed = (...frames: object[]) => ({
  ok: true,
  status: 200,
  body: stream(...frames),
});

const done = {
  name: 'done',
  media: { id: 'media-1', path: 'https://media/first.png' },
};

/**
 * Lets the pre-flight through and answers every render with these frames, on
 * a fresh body each time: a stream can only be read once.
 */
const renders = (...frames: object[]) =>
  request.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/allowed') ? answer(200, true) : streamed(...frames)
    )
  );

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
const generate = async (
  destination?: MediaDestination,
  onChange = jest.fn()
) => {
  await mount(
    <AiImage value="" onChange={onChange} destination={destination} />
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
  picker.length = 0;
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

// A render can outlive the proxies' idle cut, so the route streams heartbeats
// until its one terminal frame (FR-024 – FR-027).
describe('the streamed render', () => {
  // The window says what it reads. Increment 1's route answered any request
  // that did not with plain JSON, for pages loaded before the stream existed.
  it('asks the route for the stream', async () => {
    renders(done);

    await generate();

    expect(asked('/media/generate-image-with-prompt')[0][1]).toMatchObject({
      headers: { Accept: 'application/x-ndjson' },
    });
  });

  it('shows the image once heartbeats give way to the done frame', async () => {
    renders({ name: 'heartbeat' }, { name: 'heartbeat' }, done);

    await generate();

    expect(button('Use image')).toBeTruthy();
    expect(
      document.querySelector('img[src="https://media/first.png"]')
    ).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
  });

  // An error frame means the server refunded the credit, so its message is
  // the true account of what happened.
  it('reports an error frame in its own words and keeps the prompt', async () => {
    renders({
      name: 'error',
      error: true,
      message: 'Your request was rejected by the AI safety system.',
    });

    await generate();

    expect(toast).toHaveBeenCalledWith(
      'Your request was rejected by the AI safety system.',
      'warning'
    );
    const field = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(field.value).toBe('a pomegranate on a table');
  });

  // The render cannot be cancelled once it runs, so a stream that ends without
  // its last frame may still finish, save and be charged. "You have not been
  // charged" would be a guess, and a wrong one invites a paid retry.
  it('says the outcome is unknown when the stream ends early', async () => {
    renders({ name: 'heartbeat' }, { name: 'heartbeat' });

    await generate();

    expect(toast).toHaveBeenCalledWith(
      'The connection dropped before the image was ready. It may still finish — check your Media library in a minute.',
      'warning'
    );
    expect(toast).not.toHaveBeenCalledWith(
      'Could not generate the image. You have not been charged.',
      'warning'
    );
  });

  // A lost connection does not end the stream: fetch() or the body read
  // rejects with the Fetch standard's network error, a TypeError. Before the
  // first heartbeat no byte has arrived, so it is fetch() that rejects.
  it.each([
    [
      'before the first byte arrives',
      () => Promise.reject(new TypeError('Failed to fetch')),
    ],
    [
      'while the body is being read',
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: () => Promise.reject(new TypeError('network error')),
              cancel: async (): Promise<void> => undefined,
            }),
          },
        }),
    ],
  ])(
    'says the outcome is unknown when the connection is lost %s',
    async (_moment, render) => {
      request.mockImplementation((url: string) =>
        url.endsWith('/allowed') ? Promise.resolve(answer(200, true)) : render()
      );

      await generate();

      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'The connection dropped before the image was ready. It may still finish — check your Media library in a minute.',
        'warning'
      );
    }
  );

  // Closing the window gives up watching, not the image: it lands in the post
  // by itself when the stream finishes, and only then is the composer free.
  it('attaches the image when the window was closed mid-render', async () => {
    let deliver: (response: unknown) => void = () => undefined;
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise((resolve) => {
            deliver = resolve;
          })
    );
    const onChange = jest.fn();

    await generate(undefined, onChange);
    await settle();
    act(() => {
      closeEveryModal?.();
    });

    expect(setLocked).toHaveBeenLastCalledWith(true);

    await act(async () => {
      deliver(streamed(done));
    });
    await settle();

    expect(onChange).toHaveBeenCalledWith(done.media);
    expect(setLocked).toHaveBeenLastCalledWith(false);
  });
});

// The credit for the first image was already spent, so a refused Regenerate
// must not take it off screen — `ai.video`'s failRender holds its result for
// exactly this reason.
describe('when a Regenerate is refused', () => {
  it('keeps the image the credit already paid for', async () => {
    renders(done);
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

  // Samy's chat is about 470px whatever the window is doing, and four labelled
  // buttons in that strip want roughly 560 — so the caller that knows the space
  // is tight asks for the glyph alone. The name is not dropped with the label:
  // it moves onto the control, where a tooltip and a screen reader read it.
  it('drops the word when the caller says the space is tight', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} compact={true} />);

    const trigger = document.querySelector('.bg-ai');
    expect(trigger?.textContent?.trim()).toBe('');
    expect(trigger?.getAttribute('aria-label')).toBe('AI Image');
    expect(trigger?.getAttribute('data-tooltip-content')).toBe('AI Image');
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
    renders(done);
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

const ref = (id: string) => ({ id, path: `https://media/${id}.png` });

/** Opens the Media library from the add tile and picks these. */
const attach = async (...items: { id: string; path: string }[]) => {
  await click(button('Add image'));
  await act(async () => {
    picker[picker.length - 1].setMedia(items);
  });
};

const thumbnails = () =>
  Array.from(
    document.querySelectorAll<HTMLImageElement>('img[alt^="Reference image"]')
  ).map((img) => ({
    alt: img.alt,
    src: img.getAttribute('src'),
    // The number drawn on the thumbnail, next to the picture.
    number: img.parentElement?.textContent?.trim(),
  }));

// Feature 031-ai-image-references-edit, US1: up to four Media images the render
// draws on, numbered in the order they were attached (contracts/ui.md).
describe('reference images', () => {
  /** Opens the window on its compose step. */
  const compose = async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
  };

  it('numbers attached images in the order they were picked', async () => {
    await compose();
    await attach(ref('a'), ref('b'));

    expect(thumbnails()).toEqual([
      {
        alt: 'Reference image 1',
        src: 'https://media/a.png',
        number: '1',
      },
      {
        alt: 'Reference image 2',
        src: 'https://media/b.png',
        number: '2',
      },
    ]);
  });

  it('opens the Media library on images only', async () => {
    await compose();
    await click(button('Add image'));

    expect(picker[picker.length - 1].type).toBe('image');
  });

  it('renumbers the rest when one is removed', async () => {
    await compose();
    await attach(ref('a'), ref('b'));

    await click(
      document.querySelector('button[aria-label="Remove reference image 1"]')
    );

    expect(thumbnails()).toEqual([
      {
        alt: 'Reference image 1',
        src: 'https://media/b.png',
        number: '1',
      },
    ]);
  });

  // FR-005: the same picture twice is the same reference.
  it('adds nothing for an image that is already attached', async () => {
    await compose();
    await attach(ref('a'), ref('b'));
    await attach(ref('b'));

    expect(thumbnails().map((thumbnail) => thumbnail.src)).toEqual([
      'https://media/a.png',
      'https://media/b.png',
    ]);
  });

  it('opens the picker with only the slots that are left, and hides it when full', async () => {
    await compose();
    await attach(ref('a'), ref('b'), ref('c'));

    await click(button('Add image'));
    expect(picker[picker.length - 1].max).toBe(1);

    await act(async () => {
      picker[picker.length - 1].setMedia([ref('d')]);
    });
    expect(thumbnails()).toHaveLength(4);
    expect(button('Add image')).toBeUndefined();
  });

  describe('when generating', () => {
    const body = () =>
      JSON.parse(asked('/media/generate-image-with-prompt')[0][1].body);

    const generateWith = async (...items: { id: string; path: string }[]) => {
      await compose();
      if (items.length) {
        await attach(...items);
      }
      await type(
        document.querySelector('textarea') as HTMLTextAreaElement,
        'the cup from image 1 on the table in image 2'
      );
      await click(button('Generate'));
    };

    it('sends the references in their order', async () => {
      renders(done);

      await generateWith(ref('a'), ref('b'));

      expect(body().references).toEqual(['a', 'b']);
    });

    // SC-007: without references the request is today's, byte for byte.
    it('sends no references key when none are attached', async () => {
      renders(done);

      await generateWith();

      expect(body()).not.toHaveProperty('references');
    });

    // The server names the reference by its number; the window says it in
    // the user's language rather than toasting the server's English.
    it.each([
      [
        404,
        'reference_missing',
        2,
        'Reference image 2 is no longer in your Media library. Remove it and try again.',
      ],
      [
        422,
        'reference_unreadable',
        1,
        "Reference image 1 can't be used — its file format isn't supported. Remove it and try again.",
      ],
      [
        422,
        'reference_too_large',
        1,
        'Reference image 1 is larger than 30 MB. Remove it and try again.',
      ],
    ])(
      'explains a %i %s by the number on the thumbnail',
      async (status, code, index, message) => {
        request.mockImplementation((url: string) =>
          Promise.resolve(
            url.endsWith('/allowed')
              ? answer(200, true)
              : answer(status, { message: 'server words', code, index })
          )
        );

        await generateWith(ref('a'), ref('b'));

        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(message, 'warning');
      }
    );
  });
});

// Feature 031-ai-image-references-edit, US2: a change typed under the result
// and applied to the image on screen, for one credit (contracts/ui.md, Result
// step).
describe('editing the result', () => {
  const edited = {
    name: 'done',
    media: { id: 'media-2', path: 'https://media/edited.png' },
  };

  /** Generates the first image; every render after it answers with an edit. */
  const toResult = async (onChange = jest.fn()) => {
    renders(done);
    await generate(undefined, onChange);
    renders(edited);
  };

  // The window's one field: the prompt on the compose step, the change on the
  // result step.
  const field = () => document.querySelector('textarea') as HTMLTextAreaElement;
  const apply = () => buttonStarting('Apply edit');
  const preview = () =>
    document
      .querySelector('a[aria-label="Open the image full size"] img')
      ?.getAttribute('src');
  const editBody = () =>
    JSON.parse(asked('/media/edit-image-with-prompt')[0][1].body);

  const applyEdit = async (change: string) => {
    await type(field(), change);
    await click(apply());
  };

  // FR-015: nothing to apply, so nothing is asked of the server either.
  it('asks for the change before anything is sent', async () => {
    await toResult();
    request.mockClear();

    await click(apply());

    expect(toast).toHaveBeenCalledWith('Please describe the change', 'warning');
    expect(request).not.toHaveBeenCalled();
  });

  // FR-011: the cost is on the action, as Regenerate's is.
  it('states its cost on the action', async () => {
    await toResult();

    expect(apply()?.textContent).toContain('1 credit');
  });

  it("counts the change against the prompt's ceiling", async () => {
    await toResult();

    await type(field(), 'make it white');

    expect(field().maxLength).toBe(2000);
    expect(document.body.textContent).toContain('13 / 2000');
  });

  // FR-016: the credit check a generation runs comes first for an edit too.
  it('checks the credits first, then asks for the edit as a stream', async () => {
    await toResult();
    request.mockClear();

    await applyEdit('make the background plain white');

    expect(request.mock.calls.map(([url]) => url)).toEqual([
      '/media/generate-image/allowed',
      '/media/edit-image-with-prompt',
    ]);
    expect(asked('/media/edit-image-with-prompt')[0][1]).toMatchObject({
      method: 'POST',
      headers: { Accept: 'application/x-ndjson' },
    });
  });

  it('edits the image on screen', async () => {
    await toResult();

    await applyEdit('make the background plain white');

    expect(editBody()).toEqual({
      imageId: 'media-1',
      prompt: 'make the background plain white',
      aspectRatio: 'square',
    });
  });

  // An edit keeps its frame (FR-012): the preset the image was made at, even
  // after the compose step has moved on to another.
  it('keeps the preset the image was made at', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
    await type(field(), 'a pomegranate on a table');
    await click(buttonStarting('Portrait'));
    renders(done);
    await click(button('Generate'));

    await click(button('Back to prompt'));
    await click(buttonStarting('Landscape'));
    renders({ name: 'error', error: true, message: 'The renderer fell over.' });
    await click(button('Generate'));
    renders(edited);

    await applyEdit('make the background plain white');

    expect(editBody().aspectRatio).toBe('portrait');
  });

  it('sends the images added to it after the one being edited', async () => {
    await toResult();
    await attach(ref('logo'));

    await applyEdit('put the logo from image 2 on the cup');

    expect(editBody().references).toEqual(['logo']);
  });

  it('shows the edit, and clears the change and the images added to it', async () => {
    await toResult();
    await attach(ref('logo'));

    await applyEdit('put the logo from image 2 on the cup');

    expect(preview()).toBe('https://media/edited.png');
    expect(field().value).toBe('');
    expect(thumbnails()).toEqual([
      {
        alt: 'Reference image 1',
        src: 'https://media/edited.png',
        number: '1',
      },
    ]);
  });

  // A failed edit costs nothing and takes nothing away (spec, Edge Cases).
  it('keeps the image, the change and the added images when the edit fails', async () => {
    await toResult();
    await attach(ref('logo'));
    renders({
      name: 'error',
      error: true,
      message: 'Your request was rejected by the AI safety system.',
    });

    await applyEdit('put the logo from image 2 on the cup');

    expect(toast).toHaveBeenCalledWith(
      'Your request was rejected by the AI safety system.',
      'warning'
    );
    expect(preview()).toBe('https://media/first.png');
    expect(field().value).toBe('put the logo from image 2 on the cup');
    expect(thumbnails().map((thumbnail) => thumbnail.src)).toEqual([
      'https://media/first.png',
      'https://media/logo.png',
    ]);
  });

  // The limit modal has already spoken, and nothing was committed to.
  it('says nothing and keeps everything when the credits have run out', async () => {
    const onChange = jest.fn();
    await toResult(onChange);
    await attach(ref('logo'));
    await type(field(), 'put the logo from image 2 on the cup');
    request.mockImplementation(refused);

    await click(apply());
    await settle();

    expect(toast).not.toHaveBeenCalled();
    expect(asked('/media/edit-image-with-prompt')).toHaveLength(0);
    expect(preview()).toBe('https://media/first.png');
    expect(field().value).toBe('put the logo from image 2 on the cup');
    expect(thumbnails()).toHaveLength(2);

    await click(button('Use image'));
    expect(onChange).toHaveBeenCalledWith(done.media);
  });

  // FR-019: two actions called "Edit" side by side would be one too many; the
  // way back to the compose step says where it goes instead.
  it('names no action "Edit", and goes back to the prompt with it kept', async () => {
    await toResult();

    const labels = Array.from(document.querySelectorAll('button')).map(
      (node) => node.textContent?.trim() ?? ''
    );
    expect(labels.some((label) => label.startsWith('Edit'))).toBe(false);

    await click(button('Back to prompt'));

    expect(field().value).toBe('a pomegranate on a table');
  });

  // FR-013: the image being edited is image 1, so the images added to it
  // count from 2, as the change names them.
  it('shows the image being edited as a fixed image 1, and numbers added ones from 2', async () => {
    await toResult();
    await attach(ref('logo'));

    expect(thumbnails()).toEqual([
      { alt: 'Reference image 1', src: 'https://media/first.png', number: '1' },
      { alt: 'Reference image 2', src: 'https://media/logo.png', number: '2' },
    ]);
    expect(
      document.querySelector('button[aria-label="Remove reference image 1"]')
    ).toBeNull();
    expect(
      document.querySelector('button[aria-label="Remove reference image 2"]')
    ).toBeTruthy();
  });

  it('leaves the slots the image being edited does not take', async () => {
    await toResult();

    await click(button('Add image'));

    expect(picker[picker.length - 1].max).toBe(3);
  });

  // It is image 1 already; sent twice, the server would refuse the edit.
  it('adds nothing when the image being edited is picked again', async () => {
    await toResult();

    await attach(done.media);

    expect(thumbnails()).toHaveLength(1);
  });

  it('says it is editing, and which version', async () => {
    await toResult();
    // Never resolves, so the waiting screen stays to be read.
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise(() => undefined)
    );

    await applyEdit('make the background plain white');
    await settle();

    expect(document.body.textContent).toContain('Editing your image…');
    expect(document.body.textContent).toContain('Edit of version 1');
  });

  // Closing the window gives up watching, not the edit, as for a generation.
  it('attaches the edit when the window was closed mid-edit', async () => {
    const onChange = jest.fn();
    await toResult(onChange);
    let deliver: (response: unknown) => void = () => undefined;
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise((resolve) => {
            deliver = resolve;
          })
    );

    await applyEdit('make the background plain white');
    await settle();
    act(() => {
      closeEveryModal?.();
    });
    await act(async () => {
      deliver(streamed(edited));
    });
    await settle();

    expect(onChange).toHaveBeenCalledWith(edited.media);
    expect(setLocked).toHaveBeenLastCalledWith(false);
  });

  // The image on screen was paid for, so an edit that fails after the window
  // closed hands that one to the post rather than nothing.
  it('attaches the image on screen when the window was closed and the edit failed', async () => {
    const onChange = jest.fn();
    await toResult(onChange);
    let deliver: (response: unknown) => void = () => undefined;
    request.mockImplementation((url: string) =>
      url.endsWith('/allowed')
        ? Promise.resolve(answer(200, true))
        : new Promise((resolve) => {
            deliver = resolve;
          })
    );

    await applyEdit('make the background plain white');
    await settle();
    act(() => {
      closeEveryModal?.();
    });
    await act(async () => {
      deliver(
        streamed({
          name: 'error',
          error: true,
          message: 'Your request was rejected by the AI safety system.',
        })
      );
    });
    await settle();

    expect(onChange).toHaveBeenCalledWith(done.media);
    expect(setLocked).toHaveBeenLastCalledWith(false);
  });

  it('uses the edit on screen', async () => {
    const onChange = jest.fn();
    await toResult(onChange);
    await applyEdit('make the background plain white');

    await click(button('Use image'));

    expect(onChange).toHaveBeenCalledWith(edited.media);
  });

  // Regenerate is still the compose request (FR-022), whatever was edited.
  it('regenerates from the prompt after an edit', async () => {
    await toResult();
    await applyEdit('make the background plain white');
    request.mockClear();
    renders(done);

    await click(buttonStarting('Regenerate'));

    expect(asked('/media/edit-image-with-prompt')).toHaveLength(0);
    expect(
      JSON.parse(asked('/media/generate-image-with-prompt')[0][1].body).prompt
    ).toBe('a pomegranate on a table');
  });
});

// Generate, Regenerate and Apply edit stay on screen while the credits are
// checked, so a second click there started a second render and a second charge.
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
        : Promise.resolve(streamed(done))
    );
    return async () => {
      await act(async () => {
        pending.splice(0).forEach((answerCheck) => answerCheck());
      });
      await settle();
    };
  };

  it('starts one generation', async () => {
    const answerChecks = holdCreditChecks();

    await generate();
    await click(button('Generate'));
    await answerChecks();

    expect(asked('/media/generate-image-with-prompt')).toHaveLength(1);
  });

  it('starts one regeneration', async () => {
    renders(done);
    await generate();
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(buttonStarting('Regenerate'));
    await answerChecks();

    expect(asked('/media/generate-image-with-prompt')).toHaveLength(1);
  });

  it('applies one edit', async () => {
    renders(done);
    await generate();
    await type(
      document.querySelector('textarea') as HTMLTextAreaElement,
      'make the background plain white'
    );
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Apply edit'));
    await click(buttonStarting('Apply edit'));
    await answerChecks();

    expect(asked('/media/edit-image-with-prompt')).toHaveLength(1);
  });

  // A refused check ends the render, and the guard with it: the button must
  // not stay dead for when credits are bought.
  it('takes the next click once a refused check has answered', async () => {
    request.mockImplementation(refused);
    await generate();
    renders(done);

    await click(button('Generate'));

    expect(asked('/media/generate-image-with-prompt')).toHaveLength(1);
  });
});
