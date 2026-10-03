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

// A thumbnail in the result step's version strip.
const version = (n: number) =>
  document.querySelector(`button[aria-label="Version ${n}"]`);

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

    expect(field()).toBeTruthy();
    expect(field().value).toBe('a pomegranate on a table');
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
    expect(field().value).toBe('a pomegranate on a table');
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

    // Image 1 of a generation is a reference like the others; only an edit's
    // image 1 is the image being edited.
    it('names a missing image 1 as a reference', async () => {
      request.mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('/allowed')
            ? answer(200, true)
            : answer(404, {
                message: 'server words',
                code: 'reference_missing',
                index: 1,
              })
        )
      );

      await generateWith(ref('a'), ref('b'));

      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(
        'Reference image 1 is no longer in your Media library. Remove it and try again.',
        'warning'
      );
    });
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

  // Image 1 is the image being edited and has no remove control, so its
  // refusal says what can be done instead; an added image keeps its own.
  it.each([
    [
      1,
      "The image you're editing is no longer in your Media library. Go back to the prompt to make a new one.",
    ],
    [
      2,
      'Reference image 2 is no longer in your Media library. Remove it and try again.',
    ],
  ])('explains a missing image %i of the edit', async (index, message) => {
    await toResult();
    await attach(ref('logo'));
    request.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/allowed')
          ? answer(200, true)
          : answer(404, {
              message: 'server words',
              code: 'reference_missing',
              index,
            })
      )
    );

    await applyEdit('put the logo from image 2 on the cup');

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(message, 'warning');
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

// Feature 031-ai-image-references-edit, US3: every image made in the window, in
// the order it was made, to go back to (contracts/ui.md, Result step).
describe('the version strip', () => {
  const second = {
    name: 'done',
    media: { id: 'media-2', path: 'https://media/second.png' },
  };
  const third = {
    name: 'done',
    media: { id: 'media-3', path: 'https://media/third.png' },
  };
  const fourth = {
    name: 'done',
    media: { id: 'media-4', path: 'https://media/fourth.png' },
  };

  const strip = () =>
    document.querySelector('[role="group"][aria-label="Versions"]');
  const versions = () => Array.from(strip()?.querySelectorAll('button') ?? []);
  // Which version is marked as the one on screen, in strip order.
  const pressed = () =>
    versions().map((node) => node.getAttribute('aria-pressed'));
  const previewAlt = () =>
    document
      .querySelector('a[aria-label="Open the image full size"] img')
      ?.getAttribute('alt');
  // The element the spied scroll was last called on.
  const lastScrolled = (scrolled: jest.SpyInstance) =>
    scrolled.mock.contexts[scrolled.mock.contexts.length - 1];

  /** Generates the first image and regenerates a second. */
  const toTwoVersions = async (onChange = jest.fn()) => {
    renders(done);
    await generate(undefined, onChange);
    renders(second);
    await click(buttonStarting('Regenerate'));
  };

  /**
   * Generates the first image, then goes back and generates the second from
   * another prompt, in Watercolor: two versions described differently.
   */
  const toTwoPrompts = async () => {
    renders(done);
    await generate();
    await click(button('Back to prompt'));
    await type(field(), 'a fig on a plate');
    await click(button('Watercolor'));
    renders(second);
    await click(button('Generate'));
  };

  // US3 scenario 1 and FR-020: one image has nothing to go back to.
  it('appears from the second version, marking the one on screen by more than colour', async () => {
    renders(done);
    await generate();

    expect(strip()).toBeNull();

    renders(second);
    await click(buttonStarting('Regenerate'));

    expect(pressed()).toEqual(['false', 'true']);
    // The check, beside the ring.
    expect(version(2)?.querySelector('svg')).toBeTruthy();
    expect(version(1)?.querySelector('svg')).toBeNull();
  });

  // The button says which version it is; its picture would only say it again.
  it('names each version by its number and leaves its picture unnamed', async () => {
    await toTwoVersions();

    expect(versions().map((node) => node.getAttribute('aria-label'))).toEqual([
      'Version 1',
      'Version 2',
    ]);
    expect(
      versions().map((node) => {
        const picture = node.querySelector('img');
        return [picture?.getAttribute('src'), picture?.getAttribute('alt')];
      })
    ).toEqual([
      ['https://media/first.png', ''],
      ['https://media/second.png', ''],
    ]);
  });

  // US3 scenario 2 and FR-021.
  it('shows the version picked, and uses it', async () => {
    const onChange = jest.fn();
    await toTwoVersions(onChange);

    await click(version(1));

    expect(pressed()).toEqual(['true', 'false']);
    expect(preview()).toBe('https://media/first.png');

    await click(button('Use image'));

    expect(onChange).toHaveBeenCalledWith(done.media);
  });

  // An edit keeps the frame of the version it changes (FR-012), which a
  // version picked in the strip need not share with the latest.
  it('edits the version picked, at the preset it was made at', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
    await type(field(), 'a pomegranate on a table');
    await click(buttonStarting('Portrait'));
    renders(done);
    await click(button('Generate'));
    await click(button('Back to prompt'));
    await click(buttonStarting('Landscape'));
    renders(second);
    await click(button('Generate'));
    renders(third);

    await click(version(1));
    await applyEdit('make the background plain white');

    expect(editBody()).toEqual({
      imageId: 'media-1',
      prompt: 'make the background plain white',
      aspectRatio: 'portrait',
    });
  });

  // US3 scenario 3 and FR-022: nothing in the strip is replaced.
  it('adds a Regenerate after an edit as a third version', async () => {
    renders(done);
    await generate();
    renders(second);
    await applyEdit('make the background plain white');
    renders(third);

    await click(buttonStarting('Regenerate'));

    expect(pressed()).toEqual(['false', 'false', 'true']);
    expect(preview()).toBe('https://media/third.png');
  });

  // US3 scenario 5 and FR-023: the strip lasts as long as the window.
  it('keeps the strip through Back to prompt', async () => {
    renders(done);
    await generate();
    renders(second);
    await applyEdit('make the background plain white');
    renders(third);
    await click(buttonStarting('Regenerate'));

    await click(button('Back to prompt'));
    renders(fourth);
    await click(button('Generate'));

    expect(pressed()).toEqual(['false', 'false', 'false', 'true']);
  });

  // The limit modal answers a refused edit; the window stays as usable as it
  // was.
  it('still picks and uses versions after an edit is refused for credits', async () => {
    const onChange = jest.fn();
    await toTwoVersions(onChange);
    await type(field(), 'make the background plain white');
    request.mockImplementation(refused);
    await click(apply());
    await settle();

    await click(version(1));

    expect(pressed()).toEqual(['true', 'false']);

    await click(button('Use image'));

    expect(onChange).toHaveBeenCalledWith(done.media);
  });

  // Versions are Media items, so one can be added to an edit of another.
  // Picked, it is image 1, and sent twice the server would refuse the edit: it
  // leaves the added images, as a second pick of an attached image would.
  it('takes the version picked out of the images added to the edit', async () => {
    await toTwoVersions();
    await attach(done.media);

    expect(thumbnails().map((thumbnail) => thumbnail.src)).toEqual([
      'https://media/second.png',
      'https://media/first.png',
    ]);

    await click(version(1));

    expect(thumbnails()).toEqual([
      { alt: 'Reference image 1', src: 'https://media/first.png', number: '1' },
    ]);

    renders(third);
    await applyEdit('make the background plain white');

    expect(editBody()).not.toHaveProperty('references');
  });

  // The compose step may have moved on since a version was made, so the
  // caption and the picture's description come from the version.
  it('describes each version by the prompt and style it was made from', async () => {
    await toTwoPrompts();

    expect(document.body.textContent).toContain(
      'a fig on a plate · Square · Watercolor'
    );

    await click(version(1));

    expect(document.body.textContent).toContain(
      'a pomegranate on a table · Square · ✦Auto'
    );
    expect(document.body.textContent).not.toContain('a fig on a plate');
    expect(previewAlt()).toBe('a pomegranate on a table');
  });

  // As the approved mockup has it, an edit is described as the version it
  // changed (review-3 A8), whatever the compose step says by then.
  it('describes an edit by the version it changed', async () => {
    await toTwoPrompts();
    await click(version(1));
    renders(third);

    await applyEdit('make the background plain white');

    expect(preview()).toBe('https://media/third.png');
    expect(document.body.textContent).toContain(
      'a pomegranate on a table · Square · ✦Auto'
    );
    expect(previewAlt()).toBe('a pomegranate on a table');
  });

  // US3 scenario 4: a strip wider than the window scrolls, and the version on
  // screen is brought into view, picked or just made. Nearest, so a version
  // already in view moves nothing; the scroll padding keeps its ring and check
  // clear of the strip's edge. The animation is the stylesheet's, where the
  // app's reduced-motion layer can take it away.
  it('keeps the version on screen in view', async () => {
    const scrolled = jest.spyOn(Element.prototype, 'scrollIntoView');

    await toTwoVersions();

    expect(lastScrolled(scrolled)).toBe(version(2));
    expect(scrolled).toHaveBeenLastCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });

    await click(version(1));

    expect(lastScrolled(scrolled)).toBe(version(1));
    expect(strip()?.className).toContain('overflow-x-auto');
    expect(strip()?.className).toContain('scroll-px-[8px]');
    expect(strip()?.className).toContain('motion-safe:scroll-smooth');
    scrolled.mockRestore();
  });

  // The waiting screen replaces the strip, so a failed render comes back to a
  // new one, scrolled to its start.
  it('brings the version on screen back into view after a failed edit', async () => {
    const scrolled = jest.spyOn(Element.prototype, 'scrollIntoView');
    await toTwoVersions();
    await click(version(1));
    renders({ name: 'error', error: true, message: 'The renderer fell over.' });

    await applyEdit('make the background plain white');

    expect(pressed()).toEqual(['true', 'false']);
    expect(lastScrolled(scrolled)).toBe(version(1));
    scrolled.mockRestore();
  });

  // Keyboard focus is drawn with a ring, so the version on screen is marked
  // with a border instead: marked with a ring, it would show no change when
  // focused, brand and brandText being one colour in the light theme.
  it('marks the version on screen without the focus ring', async () => {
    await toTwoVersions();
    // Ring classes that apply without focus.
    const resting = (node: Element | null) =>
      Array.from(node?.classList ?? []).filter((name) =>
        name.startsWith('ring-')
      );

    expect(resting(version(2))).toEqual([]);
    expect(version(2)?.querySelector('img')?.className).toContain(
      'border-brandText'
    );
    expect(version(1)?.querySelector('img')?.className).not.toContain(
      'border-brandText'
    );
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

  // Closing would leave the render to finish on its own and hand the post a
  // second image after the one just used.
  it('keeps Use image waiting for the render', async () => {
    const onChange = jest.fn();
    renders(done);
    await generate(undefined, onChange);
    request.mockClear();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(button('Use image'));
    await answerChecks();

    expect(onChange).not.toHaveBeenCalled();
    expect(asked('/media/generate-image-with-prompt')).toHaveLength(1);
    expect(button('Use image')).toBeTruthy();
  });

  // Going back would show the prompt until the check answers, and then the
  // waiting screen over it.
  it('keeps the result on screen when Back to prompt is pressed', async () => {
    renders(done);
    await generate();
    const answerChecks = holdCreditChecks();

    await click(buttonStarting('Regenerate'));
    await click(button('Back to prompt'));

    expect(button('Use image')).toBeTruthy();
    await answerChecks();
  });

  // An edit changes the version on screen at the click, and its waiting screen
  // names that version: another picked meanwhile would be named instead.
  it('keeps the version being edited on screen', async () => {
    renders(done);
    await generate();
    await click(buttonStarting('Regenerate'));
    await type(field(), 'make the background plain white');
    const answerChecks = holdCreditChecks();

    await click(apply());
    await click(version(1));

    expect(version(2)?.getAttribute('aria-pressed')).toBe('true');
    await answerChecks();
  });
});

// global.scss sets `body * { outline: none !important }`, so a field without an
// explicit focus-visible ring shows no focus at all.
describe('keyboard visibility', () => {
  it('rings the prompt field', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));

    expect(field().className).toContain('focus-visible:ring-2');
    expect(field().className).toContain('focus-visible:ring-brand');
  });

  it('rings the edit field', async () => {
    renders(done);
    await generate();

    expect(field().className).toContain('focus-visible:ring-2');
    expect(field().className).toContain('focus-visible:ring-brand');
  });

  // The chips, the tiles and the actions, with the frame's close button, which
  // already carries its own.
  it('rings every button on the compose step', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
    const interactive = Array.from(document.querySelectorAll('button'));

    expect(interactive.length).toBeGreaterThan(0);
    interactive.forEach((element) => {
      expect(element.className).toContain('focus-visible:ring-2');
      expect(element.className).toContain('focus-visible:ring-brand');
    });
  });

  it('rings every button in the style catalog', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
    await click(button('All styles'));
    const interactive = Array.from(document.querySelectorAll('button'));

    expect(interactive.length).toBeGreaterThan(0);
    interactive.forEach((element) => {
      expect(element.className).toContain('focus-visible:ring-2');
      expect(element.className).toContain('focus-visible:ring-brand');
    });
  });

  // The version strip's buttons with the edit row's and the action bar's.
  it('rings every button on the result step', async () => {
    renders(done);
    await generate();
    await click(buttonStarting('Regenerate'));
    const interactive = Array.from(document.querySelectorAll('button'));

    expect(version(1)).toBeTruthy();
    expect(version(2)).toBeTruthy();
    interactive.forEach((element) => {
      expect(element.className).toContain('focus-visible:ring-2');
      expect(element.className).toContain('focus-visible:ring-brand');
    });
  });

  // The search field sits borderless inside its box, so the ring belongs on
  // the box and has to key off focus-within.
  it('rings the style search around its box', async () => {
    await mount(<AiImage value="" onChange={jest.fn()} />);
    await click(document.querySelector('.bg-ai'));
    await click(button('All styles'));
    const box = document.querySelector('input[placeholder="Search styles"]')!
      .parentElement!;

    expect(box.className).toContain('focus-within:ring-2');
    expect(box.className).toContain('focus-within:ring-brand');
  });
});
