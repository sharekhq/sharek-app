import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { FormProvider, useForm, UseFormReturn } from 'react-hook-form';
import * as fs from 'fs';
import * as path from 'path';

/** The slice of the media picker's props this spec drives. */
interface MediaRowProps {
  value?: Array<{ id: string; path: string }>;
  onChange: (event: {
    target: { value: Array<{ id: string; path: string }> };
  }) => void;
}

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
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
    MultiMediaComponent: ({ value, onChange }: MediaRowProps) =>
      React.createElement(
        'div',
        null,
        React.createElement(
          'span',
          { 'data-testid': 'shown' },
          JSON.stringify(value?.map((image) => image.path) || [])
        ),
        React.createElement('button', {
          'data-testid': 'select',
          onClick: () => onChange({ target: { value: SELECTION } }),
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

  return {
    press,
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

describe('veo3 reference images', () => {
  it('shows back what the request will carry, not what was picked', async () => {
    const run = await render();
    await run.press();

    // Videos are dropped and the rest is capped at three, so a fourth image is
    // never sent — showing five thumbnails would promise otherwise.
    expect(run.shown()).toEqual(['one.png', 'two.png', 'three.png']);
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

  it('leaves the chooser card as it was', () => {
    expect(card?.name).toEqual({ key: 'video_type_veo3', fallback: 'Veo 3' });
    expect(card?.description).toEqual({
      key: 'video_type_veo3_desc',
      fallback:
        'One continuous live-action shot with real camera movement and sound. No cuts, and it renders no readable text.',
    });
    expect(card?.pills).toEqual([
      { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
      { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
      {
        key: 'video_type_veo3_pill_refs',
        fallback: 'Up to 3 reference images',
      },
      {
        key: 'video_type_veo3_pill_bestfor',
        fallback: 'Best for one vivid moment',
      },
    ]);
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
