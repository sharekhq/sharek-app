import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form';
import * as fs from 'fs';
import * as path from 'path';

/** The slice of the media picker's props this spec drives. */
interface MediaRowProps {
  aiNotAvailable?: boolean;
  value?: Array<{ id: string; path: string }>;
  onChange: (event: {
    target: { value: Array<{ id: string; path: string }> };
  }) => void;
}

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
const toast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/frontend/components/videos/video.context.wrapper', () => ({
  useVideo: () => ({ value: '' }),
}));
jest.mock('@gitroom/frontend/components/videos/video.modal.parts', () => ({
  VideoPromptField: () => null,
}));

/**
 * Stands in for the media picker: it reports the `value` it was handed and
 * hands back a fixed selection, which is all this spec needs to see whether the
 * row reads the same form field it writes.
 */
const SELECTION = [
  { id: '1', path: 'one.png' },
  { id: '2', path: 'two.png' },
  { id: '3', path: 'clip.mp4' },
  { id: '4', path: 'three.png' },
  { id: '5', path: 'four.png' },
];

jest.mock('@gitroom/frontend/components/media/media.component', () => {
  const React = require('react');
  return {
    MultiMediaComponent: ({ aiNotAvailable, value, onChange }: MediaRowProps) =>
      React.createElement(
        'div',
        {
          'data-testid': 'media-row',
          'data-ai-not-available': String(!!aiNotAvailable),
        },
        React.createElement(
          'span',
          { 'data-testid': 'shown' },
          JSON.stringify(value?.map((image) => image.path) || [])
        ),
        React.createElement('button', {
          'data-testid': 'select',
          onClick: () => onChange({ target: { value: SELECTION } }),
        }),
        React.createElement('button', {
          'data-testid': 'select-images',
          onClick: () =>
            onChange({
              target: { value: SELECTION.filter((f) => f.id !== '3') },
            }),
        })
      ),
  };
});

import { videosList } from '@gitroom/frontend/components/videos/video.wrapper';
import '@gitroom/frontend/components/videos/providers/veo3.provider';

const Veo3 = videosList.find((p) => p.identifier === 'veo3')!.Component;

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  let form: UseFormReturn | undefined;
  const Harness: FC = () => {
    const methods = useForm();
    useEffect(() => {
      form = methods;
    }, [methods]);
    return (
      <FormProvider {...methods}>
        <Veo3 />
      </FormProvider>
    );
  };

  await act(async () => {
    root.render(<Harness />);
  });

  const press = async () => {
    const button = document.querySelector('[data-testid="select"]')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  const pressImagesOnly = async () => {
    const button = document.querySelector('[data-testid="select-images"]')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  return {
    press,
    pressImagesOnly,
    /** The paths the row is showing back to the user. */
    shown: () =>
      JSON.parse(
        document.querySelector('[data-testid="shown"]')?.textContent || '[]'
      ),
    values: () => form!.getValues(),
  };
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const byText = (text: string) =>
  Array.from(document.querySelectorAll('div')).find(
    (node) => node.textContent === text && node.children.length === 0
  );
/** The Audio row's buttons: every button but the media picker stand-in's. */
const audioButtons = () =>
  Array.from(document.querySelectorAll('button:not([data-testid])'));
const follows = (later: Node | undefined, earlier: Node | undefined) =>
  !!later &&
  !!earlier &&
  !!(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);

const HINTS = {
  ambient: 'Natural sound and music that suit the scene, with no speech.',
  narration:
    'A voiceover describing the scene, spoken in the language of your prompt.',
  none: 'No speech and no music — only quiet ambience.',
};

describe('the Audio row', () => {
  it('offers Ambient, Narration and Silent under its label, Ambient pressed by default with its hint', async () => {
    const run = await render();
    const label = byText('Audio');
    const choices = audioButtons();
    const hint = byText(HINTS.ambient);

    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Ambient',
      'Narration',
      'Silent',
    ]);
    expect(
      choices.map((choice) => choice.getAttribute('aria-pressed'))
    ).toEqual(['true', 'false', 'false']);
    expect(run.values().audio).toBe('ambient');
    // The hint says what the chosen option does, under the row, as today.
    choices.forEach((choice) => {
      expect(follows(choice, label)).toBe(true);
      expect(follows(hint, choice)).toBe(true);
    });
  });

  it.each([
    ['Narration', 'narration', HINTS.narration],
    ['Silent', 'none', HINTS.none],
  ])(
    'presses %s when picked, stores %s and shows its hint',
    async (name, audio, hint) => {
      const run = await render();

      await click(audioButtons().find((choice) => choice.textContent === name));

      expect(
        audioButtons().map((choice) => [
          choice.textContent,
          choice.getAttribute('aria-pressed'),
        ])
      ).toEqual(
        ['Ambient', 'Narration', 'Silent'].map((option) => [
          option,
          String(option === name),
        ])
      );
      expect(run.values().audio).toBe(audio);
      expect(byText(hint)).toBeDefined();
      expect(byText(HINTS.ambient)).toBeUndefined();
    }
  );
});

describe('veo3 reference images', () => {
  it('keeps its row: the media picker for a reference, under its label and hint', async () => {
    await render();
    const label = byText('Reference images');
    const hint = byText(
      'Optional: add up to 3 images for the video to draw on — a product, a character, or a scene.'
    );
    const row =
      document.querySelector('[data-testid="media-row"]') ?? undefined;

    expect(follows(hint, label)).toBe(true);
    expect(follows(row, hint)).toBe(true);
  });

  it('the reference images row offers no AI tool', async () => {
    await render();
    const row = document.querySelector('[data-testid="media-row"]');

    expect(row?.getAttribute('data-ai-not-available')).toBe('true');
  });

  it('shows back what the request will carry, not what was picked', async () => {
    const run = await render();
    await run.press();

    // Videos are dropped and the rest is capped at three, so a fourth image is
    // never sent — showing five thumbnails would promise otherwise.
    expect(run.shown()).toEqual(['one.png', 'two.png', 'three.png']);
  });

  it('a dropped video shows the skipped toast', async () => {
    toast.mockClear();
    const run = await render();
    await run.press();

    expect(toast).toHaveBeenCalledWith(
      "Videos can't be used as a reference and were skipped",
      'warning'
    );
  });

  it('nothing dropped, no toast', async () => {
    toast.mockClear();
    const run = await render();
    await run.pressImagesOnly();

    expect(toast).not.toHaveBeenCalled();
  });

  it('writes the images to the field the backend reads', async () => {
    const run = await render();
    await run.press();

    expect(run.values().images).toHaveLength(3);
  });

  it('submits no field the params class does not declare', async () => {
    const run = await render();
    await run.press();

    expect(Object.keys(run.values())).not.toContain('media');
  });
});

// Public paths, as Studio draws them with `<img>`.
const COVER = '/studio/covers/veo3.webp';
const LOGO = '/studio/makers/google.svg';

describe('its Studio listing', () => {
  const card = videosList.find((p) => p.identifier === 'veo3')?.card;

  it('lists itself as a model by Google, with its facts, length and cover', () => {
    expect(card?.studio).toEqual({
      kind: 'model',
      cover: COVER,
      maker: { name: 'Google', logo: LOGO },
      facts: [
        { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
        { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
        { key: 'video_type_veo3_fact_sound', fallback: 'Sound' },
      ],
      sampleLength: '0:08',
    });
  });

  it('keeps its name and description', () => {
    expect(card?.name).toEqual({ key: 'video_type_veo3', fallback: 'Veo 3' });
    expect(card?.description).toEqual({
      key: 'video_type_veo3_desc',
      fallback:
        'One continuous live-action shot with real camera movement and sound. No cuts, and it renders no readable text.',
    });
  });
});

describe('its picture ships with the app', () => {
  // Shipped with the app, never fetched from a third party (FR-018, SC-002).
  const PUBLIC = path.join(__dirname, '../../../../public');

  it.each([
    ['cover', COVER],
    ['maker logo', LOGO],
  ])('its %s is under apps/frontend/public', (_, file) => {
    expect(fs.existsSync(path.join(PUBLIC, file))).toBe(true);
  });
});
