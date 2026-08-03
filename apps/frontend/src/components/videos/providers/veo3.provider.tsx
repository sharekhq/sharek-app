import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { Button } from '@gitroom/react/form/button';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { VideoPromptField } from '@gitroom/frontend/components/videos/video.modal.parts';

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
      <div className="flex flex-col gap-[6px]">
        <div className="text-[14px] font-[600]">{t('veo3_audio', 'Audio')}</div>
        <div className="flex gap-[8px]">
          {AUDIO_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              className={clsx(
                '!flex-1',
                selected === option &&
                  '!bg-brandSoft !text-brandText !border-brand'
              )}
              onClick={() => setValue('audio', option)}
            >
              {t(`veo3_audio_${option}`, AUDIO_LABELS[option])}
            </Button>
          ))}
        </div>
        <div className="text-[12px] text-muted">
          {t(`veo3_audio_${selected}_hint`, AUDIO_HINTS[selected])}
        </div>
      </div>
      <div className="flex flex-col gap-[6px]">
        <div className="flex flex-col gap-[2px]">
          <div className="text-[14px] font-[600]">
            {t('reference_images', 'Reference images')}
          </div>
          <div className="text-[12px] text-muted">
            {t(
              'reference_images_hint',
              'Optional: add up to 3 images for the video to draw on — a product, a character, or a scene.'
            )}
          </div>
        </div>
        <MultiMediaComponent
          allData={[]}
          dummy={true}
          designNotAvailable={true}
          aiVideoNotAvailable={true}
          flush={true}
          text="Images"
          description="Images"
          name="images"
          label="Media"
          value={images}
          onChange={(val) =>
            setValue(
              'images',
              val.target.value
                .filter((f) => !hasExtension(f.path, 'mp4'))
                .slice(0, 3)
            )
          }
        />
      </div>
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
  },
});
