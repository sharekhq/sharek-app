import { FC, act } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm } from 'react-hook-form';
import * as fs from 'fs';
import * as path from 'path';

const toast = jest.fn();
const request = jest.fn();
const startRender = jest.fn();
const onMedia = jest.fn();
const failRender = jest.fn();
const reportProgress = jest.fn();
const setTrail = jest.fn();
// Back's question before it throws an edited script away: No unless a case
// says otherwise.
const dialog = jest.fn<Promise<boolean>, unknown[]>(async () => false);
// The window's one render at a time: it says whether this provider may start
// one. Free unless a case says otherwise.
const claimRender = jest.fn(() => true);
// The tool's action bar and its stage, which the provider fills through
// portals, the screen the tool is on and the shape picked. A case changes them
// and renders the tool again, as the tool does when its phase changes.
let actionsSlot: HTMLDivElement | null = null;
let stageSlot: HTMLDivElement | null = null;
let phase: VideoPhase = 'setup';
let output: VideoOrientationId = 'vertical';
// The voice list the selector loads. Empty, so it says it is loading, unless a
// case gives it voices.
let voiceList: {
  voices: Array<{ id: string; name: string; preview_url: string }>;
  arabicVoices?: Array<{ id: string; name: string; preview_url: string }>;
} = { voices: [] };

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
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
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => dialog(...args),
}));
jest.mock('@gitroom/frontend/components/videos/video.modal.parts', () => ({
  VideoPromptField: () => null,
}));
// The registry drags in every video provider; the voice list is all this one
// reads from it, and its contents are not what this spec is about.
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  useVideoFunction: () => jest.fn(),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: voiceList, isLoading: false }),
}));

import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import '@gitroom/frontend/components/videos/providers/image-text-slides.provider';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import { buttonClassName } from '@gitroom/react/form/button';
import {
  VideoContextWrapper,
  VideoPhase,
} from '@gitroom/frontend/components/videos/video.context.wrapper';
import type { VideoOrientationId } from '@gitroom/nestjs-libraries/dtos/videos/video.orientation.catalog';

const Slides = videosList.find(
  (p) => p.identifier === 'image-text-slides'
)!.Component;

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** The NDJSON body the create route answers with, as `ndjsonFrames` reads it. */
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

const storyboard = {
  styleGuide: 'warm studio light',
  slides: [{ text: 'Fresh bread every morning' }, { text: 'Open until ten' }],
};

const finished = { id: 'media-1', path: 'https://media/slides.mp4' };

const rendered = () => ({
  ...answer(200, {}),
  body: stream({ name: 'done', media: finished }),
});

const mounted: Array<{ unmount: () => void }> = [];

/** Flushes the microtasks an awaited fetch resolves on. */
const settle = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Create video carries its cost after the label ("Create video· 1 credit").
const buttonStarting = (label: string) =>
  Array.from(document.querySelectorAll('button')).find((node) =>
    node.textContent?.trim().startsWith(label)
  );

const created = () =>
  request.mock.calls.filter(
    ([called]) => called === '/media/generate-video/create'
  );

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

/** A node the tool hands over, in the page as the frame draws it. */
const slot = () => {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
};

/** The provider in its form, inside the context the video tool gives it. */
const Harness: FC = () => {
  const methods = useForm();
  return (
    <VideoContextWrapper.Provider
      value={{
        value: '',
        output,
        onMedia,
        close: () => undefined,
        phase,
        actionsSlot,
        stageSlot,
        claimRender,
        startRender,
        reportProgress,
        failRender,
        setTrail,
      }}
    >
      <FormProvider {...methods}>
        <Slides />
      </FormProvider>
    </VideoContextWrapper.Provider>
  );
};

/**
 * Renders the provider where the tool's settings draw it, the host, with the
 * slots as they are set. `rerender` hands it the phase and the slots again.
 */
const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const rerender = () =>
    act(async () => {
      root.render(<Harness />);
    });
  await rerender();
  return { host, rerender };
};

/**
 * Renders the provider in a form, with the bar its actions are portalled into
 * and the stage its screens are, and plans `planned` so the review screen and
 * its Create video are showing. Every create answers with `create`.
 */
const review = async (
  create: () => Promise<unknown>,
  planned: typeof storyboard = storyboard
) => {
  request.mockImplementation((url: string) => {
    if (url.endsWith('/allowed')) {
      return Promise.resolve(answer(200, true));
    }
    if (url === '/media/generate-video/plan') {
      return Promise.resolve(answer(200, planned));
    }
    return create();
  });

  actionsSlot = slot();
  stageSlot = slot();
  const tool = await mount();
  await click(buttonStarting('Continue'));
  await settle();
  return tool;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  actionsSlot = null;
  stageSlot = null;
  phase = 'setup';
  output = 'vertical';
  jest.clearAllMocks();
});

// Create video and Regenerate stay on screen until the create route answers,
// so a second click there started a second render and a second charge. The
// window holds one render at a time; the provider has to ask it first.
describe('the render it starts', () => {
  it('is claimed once from the window for Create video', async () => {
    await review(() => Promise.resolve(rendered()));

    await click(buttonStarting('Create video'));
    await settle();

    expect(claimRender).toHaveBeenCalledTimes(1);
    expect(created()).toHaveLength(1);
  });

  it('creates nothing while the window holds another', async () => {
    await review(() => Promise.resolve(rendered()));
    claimRender.mockReturnValueOnce(false);

    await click(buttonStarting('Create video'));
    await settle();

    expect(created()).toHaveLength(0);
  });

  it("is claimed again for the handshake's `regenerate` (Generate on a result)", async () => {
    await review(() => Promise.resolve(rendered()));
    await click(buttonStarting('Create video'));
    await settle();
    claimRender.mockReturnValueOnce(false);
    const { regenerate } = startRender.mock.calls[0][0];

    await act(async () => {
      regenerate();
    });
    await settle();

    expect(created()).toHaveLength(1);
  });

  // The tool stamps the next version with the shape picked beside the result
  // (FR-008), so the render has to be made in that shape too, not the first
  // render's.
  it("renders the shape picked beside a result on the handshake's `regenerate`", async () => {
    const { rerender } = await review(() => Promise.resolve(rendered()));
    await click(buttonStarting('Create video'));
    await settle();
    const { regenerate } = startRender.mock.calls[0][0];

    phase = 'result';
    actionsSlot = null;
    stageSlot = null;
    output = 'horizontal';
    await rerender();
    await act(async () => {
      regenerate();
    });
    await settle();

    expect(created().map(([, init]) => JSON.parse(init.body).output)).toEqual([
      'vertical',
      'horizontal',
    ]);
  });

  // The window lets the claim go when the render is handed back, so every way
  // a create can end has to hand it back.
  it('is handed back when the create is refused', async () => {
    await review(() => Promise.reject(new AlreadyAnsweredError(402)));

    await click(buttonStarting('Create video'));
    await settle();

    expect(failRender).toHaveBeenCalledTimes(1);
  });

  // A workflow's result offers the way back to its script (tasks D7, FR-010).
  it('hands the tool Edit script and its way back, beside its steps and regenerate', async () => {
    await review(() => Promise.resolve(rendered()));

    await click(buttonStarting('Create video'));
    await settle();

    expect(startRender).toHaveBeenCalledTimes(1);
    expect(startRender.mock.calls[0][0]).toEqual({
      steps: [
        'Writing image prompts…',
        'Creating images',
        'Recording the voiceover…',
        'Putting the video together…',
      ],
      regenerate: expect.any(Function),
      backLabel: 'Edit script',
      onBack: expect.any(Function),
    });
  });
});

// Inheriting the interface's direction, an Arabic slide such as «… بنسبة 40%.»
// in an English interface was laid out left to right: its full stop sat at the
// sentence's start and the percentage at the far left. A field now reads the
// way the slide's captions burn.
describe("a slide's text field", () => {
  const directionOf = async (text: string) => {
    await review(() => Promise.resolve(rendered()), {
      ...storyboard,
      slides: [{ text }],
    });
    return document.querySelector('textarea')?.getAttribute('dir');
  };

  it('reads an Arabic slide right to left', async () => {
    expect(await directionOf('احجز الآن واحصل على خصم حصري بنسبة 40%.')).toBe(
      'rtl'
    );
  });

  it('keeps an Arabic slide that opens with a brand name right to left', async () => {
    expect(
      await directionOf('Instagram هو المكان الأنسب لعرضنا المحدود.')
    ).toBe('rtl');
  });

  it('lets a slide without Arabic take its direction from its text', async () => {
    expect(await directionOf('Fresh bread every morning')).toBe('auto');
  });

  it("leaves an empty slide in the interface's direction", async () => {
    expect(await directionOf('')).toBeNull();
  });
});

// The row is the shared ChoiceField (FR-004), so how six counts share a
// phone's row (044 T071) is that part's case, in workspace.fields.spec.tsx
// (tasks D15b).
describe('the Slides row', () => {
  // The six count buttons, on the setup screen.
  const renderCounts = async () => {
    const { host } = await mount();
    return () =>
      Array.from(host.querySelectorAll('button')).filter((button) =>
        /^[1-6]$/.test(button.textContent?.trim() || '')
      );
  };

  // Spec 059 (contracts/inventory.md A): an outlined choice is secondary, as
  // ghost has no border since T003, so the chosen count's brand border shows
  // again; the chosen one, 4 on arrival, keeps its soft brand fill.
  it('draws the counts through `ChoiceField`: secondary buttons, 4 pressed (`aria-pressed`) on arrival, the chosen one in the brand tint with its border', async () => {
    const counts = await renderCounts();
    const chosen = () =>
      counts()
        .filter((count) =>
          ['!bg-brandSoft', '!text-brandText', '!border-brand'].every((name) =>
            count.className.split(' ').includes(name)
          )
        )
        .map((count) => count.textContent);
    const pressed = () =>
      counts()
        .filter((count) => count.getAttribute('aria-pressed') === 'true')
        .map((count) => count.textContent);

    expect(counts()).toHaveLength(6);
    for (const count of counts()) {
      expect(count.className.split(' ')).toEqual(
        expect.arrayContaining(
          buttonClassName({ variant: 'secondary' }).split(' ')
        )
      );
    }
    expect(chosen()).toEqual(['4']);
    expect(pressed()).toEqual(['4']);

    await click(counts()[1]);

    expect(chosen()).toEqual(['2']);
    expect(pressed()).toEqual(['2']);
  });
});

// Spec 060 (FR-026, FR-027, contracts/ui.md §9): the window's action rows are
// one height, the shared button's large size; the voice sets are a 40px row,
// 44px under a finger, each set's name and count on one line; a script line
// types at 14px with a mouse, 16px under a finger.
describe("the window's action rows and boxes", () => {
  const own = (node: Element | null | undefined) =>
    node?.className.split(' ') ?? [];

  const voice = (id: string) => ({ id, name: id, preview_url: '' });

  afterEach(() => {
    voiceList = { voices: [] };
  });

  // The setup screen, with the bar its actions are portalled into.
  const setUp = async () => {
    request.mockImplementation(() => Promise.resolve(answer(200, true)));
    actionsSlot = slot();
    stageSlot = slot();
    await mount();
  };

  // The two sets, not the Slides counts, which are pressed buttons too.
  const voiceSets = () =>
    Array.from(document.querySelectorAll('button[aria-pressed]')).filter(
      (button) => /voices$/.test(button.textContent || '')
    );

  it('draws Continue at the large size', async () => {
    await setUp();

    expect(own(buttonStarting('Continue'))).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]'])
    );
  });

  it('draws Add slide, Back and Create video at the large size', async () => {
    await review(() => Promise.resolve(rendered()));

    [
      buttonStarting('Add slide'),
      buttonStarting('Back'),
      buttonStarting('Create video'),
    ].forEach((action) =>
      expect(own(action)).toEqual(
        expect.arrayContaining(['h-[44px]', 'px-[20px]'])
      )
    );
  });

  it('draws the voice sets as a 40px row, 44px under a finger, at 14px', async () => {
    voiceList = {
      voices: [voice('en-1'), voice('en-2')],
      arabicVoices: [voice('ar-1')],
    };
    await setUp();
    const sets = voiceSets();

    expect(sets).toHaveLength(2);
    for (const set of sets) {
      expect(own(set)).toEqual(
        expect.arrayContaining(['h-[40px]', 'coarse:h-[44px]', 'text-[14px]'])
      );
      expect(own(set)).not.toContain('h-[52px]');
      expect(own(set)).not.toContain('flex-col');
    }
  });

  it("writes each set's voice count at 12px", async () => {
    voiceList = {
      voices: [voice('en-1'), voice('en-2')],
      arabicVoices: [voice('ar-1')],
    };
    await setUp();
    const counts = Array.from(
      document.querySelectorAll('button[aria-pressed] > span')
    ).filter((span) => /voices$/.test(span.textContent || ''));

    expect(counts.map((count) => count.textContent)).toEqual([
      '2 voices',
      '1 voices',
    ]);
    for (const count of counts) {
      expect(own(count)).toContain('text-[12px]');
    }
  });

  it('types a script line at 14px with a mouse, 16px under a finger', async () => {
    await review(() => Promise.resolve(rendered()));
    const line = document.querySelector('textarea');

    expect(own(line)).toEqual(
      expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
    );
    expect(own(line)).not.toContain('text-[16px]');
  });
});

// Public path, as Studio draws it with `<img>`.
const COVER = '/studio/covers/image-text-slides.webp';

describe('its Studio listing', () => {
  const card = videosList.find(
    (p) => p.identifier === 'image-text-slides'
  )?.card;

  it('lists itself as a tool with its cover, and no maker, facts or length', () => {
    expect(card?.studio).toEqual({ kind: 'tool', cover: COVER });
  });

  it('leaves the chooser card as it was', () => {
    expect(card?.name).toEqual({
      key: 'video_type_image_text_slides',
      fallback: 'Image Text Slides',
    });
    expect(card?.description).toEqual({
      key: 'video_type_slides_desc',
      fallback:
        'A narrated slideshow of AI images with captions burned in. You review and edit the script before anything is rendered.',
    });
    expect(card?.pills).toEqual([
      { key: 'video_type_slides_pill_slides', fallback: '1–6 slides' },
      { key: 'video_type_slides_pill_length', fallback: '10–55 s' },
      {
        key: 'video_type_slides_pill_voiceover',
        fallback: 'Voiceover optional',
      },
      {
        key: 'video_type_slides_pill_bestfor',
        fallback: 'Best for lists & explainers',
      },
    ]);
  });
});

describe('its picture ships with the app', () => {
  // Shipped with the app, never fetched from a third party (FR-018, SC-002).
  const PUBLIC = path.join(__dirname, '../../../../public');

  it('its cover is under apps/frontend/public', () => {
    expect(fs.existsSync(path.join(PUBLIC, COVER))).toBe(true);
  });
});

// Spec 061 (FR-004, FR-006, contracts/video-provider.md): the tool draws the
// provider's fields in its settings and hands it the stage, which shows the
// Script screen's sample and then the Review screen's cards.
describe('the Script screen', () => {
  // The setup screen, with the bar and the stage it is portalled into.
  const script = async () => {
    request.mockImplementation(() => Promise.resolve(answer(200, true)));
    actionsSlot = slot();
    stageSlot = slot();
    return mount();
  };

  it('shows its sample in the stage while its fields stay in the settings', async () => {
    const { host } = await script();

    expect(stageSlot!.querySelector('img')?.getAttribute('src')).toBe(COVER);
    expect(stageSlot!.textContent).toContain('Sample');
    expect(stageSlot!.textContent).toContain('Your script appears here');
    expect(stageSlot!.textContent).toContain(
      'Press Continue and Sharek writes a script, slide by slide. You edit it here before anything is charged.'
    );
    expect(stageSlot!.textContent).not.toContain('Voiceover');
    expect(host.textContent).toContain('Slides');
    expect(host.textContent).toContain('Voiceover');
    expect(host.textContent).not.toContain('Your script appears here');
  });

  // Planning is free; the credit is spent by Create video (FR-018).
  it('says beside Continue, in the bar, that nothing is charged yet', async () => {
    await script();

    expect(actionsSlot!.contains(buttonStarting('Continue')!)).toBe(true);
    expect(actionsSlot!.textContent).toContain('Nothing is charged yet');
  });
});

describe('the Review screen', () => {
  const lines = () => Array.from(stageSlot!.querySelectorAll('textarea'));

  it('draws one card per slide in the stage, with its counters and the total length, and none in the settings', async () => {
    const { host } = await review(() => Promise.resolve(rendered()));

    expect(lines().map((line) => line.value)).toEqual([
      'Fresh bread every morning',
      'Open until ten',
    ]);
    // each card's seconds and characters, under its text
    expect(lines()[0].nextElementSibling?.textContent).toContain('2s');
    expect(lines()[0].nextElementSibling?.textContent).toContain('25 / 280');
    expect(lines()[1].nextElementSibling?.textContent).toContain('1s');
    expect(lines()[1].nextElementSibling?.textContent).toContain('14 / 280');
    expect(stageSlot!.textContent).toContain('About 3s');
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).not.toContain('About 3s');
  });

  it('edits, reorders, adds and removes slides there', async () => {
    await review(() => Promise.resolve(rendered()));
    expect(lines()).toHaveLength(2);

    await type(lines()[0], 'Fresh bread at seven');

    expect(lines().map((line) => line.value)).toEqual([
      'Fresh bread at seven',
      'Open until ten',
    ]);

    await click(
      stageSlot!.querySelectorAll('button[aria-label="Move slide down"]')[0]
    );

    expect(lines().map((line) => line.value)).toEqual([
      'Open until ten',
      'Fresh bread at seven',
    ]);

    await click(buttonStarting('Add slide'));

    expect(lines().map((line) => line.value)).toEqual([
      'Open until ten',
      'Fresh bread at seven',
      '',
    ]);

    await click(stageSlot!.querySelectorAll('button[aria-label="Delete"]')[2]);

    expect(lines().map((line) => line.value)).toEqual([
      'Open until ten',
      'Fresh bread at seven',
    ]);
  });

  it('keeps Add slide, Back and Create video in the bar', async () => {
    await review(() => Promise.resolve(rendered()));

    for (const label of ['Add slide', 'Back', 'Create video']) {
      expect(actionsSlot!.contains(buttonStarting(label)!)).toBe(true);
    }
  });

  // Back plans again, which replaces the script, so it asks first.
  it('asks before Back throws an edited script away, and keeps the edit on No', async () => {
    await review(() => Promise.resolve(rendered()));
    await type(document.querySelector('textarea')!, 'Fresh bread at seven');

    await click(buttonStarting('Back'));
    await settle();

    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog.mock.calls[0][0]).toBe(
      'Going back rewrites the script and your edits will be lost. Continue?'
    );
    expect(document.querySelector('textarea')?.value).toBe(
      'Fresh bread at seven'
    );
  });

  // The tool's Edit script on a result goes back to setup, where this screen
  // is still mounted, and hands the stage over again (FR-010).
  it('is in the stage again with the edited script after Edit script on a result', async () => {
    const { host, rerender } = await review(() => Promise.resolve(rendered()));
    await type(document.querySelector('textarea')!, 'Fresh bread at seven');
    await click(buttonStarting('Create video'));
    await settle();
    const { onBack } = startRender.mock.calls[0][0];

    // On the result the stage shows the video and the bar is the tool's.
    phase = 'result';
    actionsSlot = null;
    stageSlot = null;
    await rerender();

    expect(document.querySelector('textarea')).toBeNull();

    phase = 'setup';
    actionsSlot = slot();
    stageSlot = slot();
    await act(async () => onBack());
    await rerender();

    expect(lines().map((line) => line.value)).toEqual([
      'Fresh bread at seven',
      'Open until ten',
    ]);
    expect(host.querySelector('textarea')).toBeNull();
    expect(actionsSlot!.contains(buttonStarting('Create video')!)).toBe(true);
  });
});
