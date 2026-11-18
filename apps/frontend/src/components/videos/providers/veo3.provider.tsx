import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { VideoPromptField } from '@gitroom/frontend/components/videos/video.modal.parts';
import {
  ChoiceField,
  FieldLabel,
} from '@gitroom/frontend/components/studio/workspace.fields';

export interface Voice {
  id: string;
  name: string;
  preview_url: string;
}

// Veo takes no audio parameter — the prompt is the only lever — so the choice
// is an enum the backend hygiene pass spells out in words.
const AUDIO_OPTIONS = ['ambient', 'narration', 'none'] as const;

const AUDIO_LABELS = {
  ambient: 'Ambient',
  narration: 'Narration',
  none: 'Silent',
};

const AUDIO_HINTS = {
  ambient: 'Natural sound and music that suit the scene, with no speech.',
  narration:
    'A voiceover describing the scene, spoken in the language of your prompt.',
  none: 'No speech and no music — only quiet ambience.',
};

const VEO3Settings: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const { watch, setValue } = useFormContext();
  const { value } = useVideo();

  // The field the params class declares, and the one the row shows back: the
  // selection is filtered before it is stored, so reading anything else would
  // promise images the request never carries.
  const images = watch('images');
  const audio = watch('audio');
  // The effect defaults the field, but the first render happens before it runs.
  const selected: (typeof AUDIO_OPTIONS)[number] = audio || 'ambient';

  useEffect(() => {
    if (audio === undefined) setValue('audio', 'ambient');
  }, [audio, setValue]);

  return (
    // One 16px rhythm between groups. Without it the prompt's hint line sits
    // flush against the next label and the two read as one block.
    <div className="flex flex-col gap-[16px]">
      <VideoPromptField
        value={value}
        placeholder={t(
          'veo3_prompt_placeholder',
          'Describe the scene: who or what is in it, where, and what happens'
        )}
      />
      <ChoiceField
        label={t('veo3_audio', 'Audio')}
        options={AUDIO_OPTIONS.map((option) => ({
          id: option,
          label: t(`veo3_audio_${option}`, AUDIO_LABELS[option]),
        }))}
        value={selected}
        onChange={(option) => setValue('audio', option)}
        hint={t(`veo3_audio_${selected}_hint`, AUDIO_HINTS[selected])}
      />
      <FieldLabel
        label={t('reference_images', 'Reference images')}
        hint={t(
          'reference_images_hint',
          'Optional: add up to 3 images for the video to draw on — a product, a character, or a scene.'
        )}
      >
        <MultiMediaComponent
          allData={[]}
          dummy={true}
          designNotAvailable={true}
          aiNotAvailable={true}
          flush={true}
          text={t('images', 'Images')}
          description={t('images', 'Images')}
          name="images"
          label={t('label_media', 'Media')}
          value={images}
          onChange={(val) => {
            const images = val.target.value.filter(
              (f) => !hasExtension(f.path, 'mp4')
            );
            if (images.length < val.target.value.length) {
              toaster.show(
                t(
                  'veo3_reference_skipped',
                  "Videos can't be used as a reference and were skipped"
                ),
                'warning'
              );
            }
            setValue('images', images.slice(0, 3));
          }}
        />
      </FieldLabel>
    </div>
  );
};

const VeoComponent = () => {
  return <VEO3Settings />;
};

/**
 * One film frame, not a stack: the sprocket holes read as cinema and the single
 * frame says there are no cuts, which is the whole difference from a slideshow.
 * The subject trails motion streaks because this is the type that moves.
 */
const Veo3Diagram = (
  <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
    <rect
      x="4"
      y="12"
      width="44"
      height="28"
      rx="4"
      fill="var(--ai-soft)"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <g fill="currentColor" opacity=".55">
      {[15, 34].map((y) =>
        [8, 15, 22, 29, 36, 41].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="1" />
        ))
      )}
    </g>
    <circle cx="35" cy="26" r="4.6" fill="currentColor" opacity=".9" />
    <path
      d="M11 22.5h11M9 26h15M11 29.5h11"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      opacity=".42"
    />
  </svg>
);

videoWrapper('veo3', VeoComponent, {
  card: {
    name: { key: 'video_type_veo3', fallback: 'Veo 3' },
    description: {
      key: 'video_type_veo3_desc',
      fallback:
        'One continuous live-action shot with real camera movement and sound. No cuts, and it renders no readable text.',
    },
    pills: [
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
    ],
    diagram: Veo3Diagram,
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
  },
});
