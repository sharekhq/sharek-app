import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { Button } from '@gitroom/react/form/button';
import { Textarea } from '@gitroom/react/form/textarea';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';

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
  const { register, watch, setValue, formState } = useFormContext();
  const { value } = useVideo();

  const media = register('media', {
    value: [],
  });

  const mediaValue = watch('media');
  const audio = watch('audio');
  // The effect defaults the field, but the first render happens before it runs.
  const selected: (typeof AUDIO_OPTIONS)[number] = audio || 'ambient';

  useEffect(() => {
    if (audio === undefined) setValue('audio', 'ambient');
  }, [audio, setValue]);

  return (
    <div>
      <Textarea
        label="Prompt"
        translationKey="prompt"
        name="prompt"
        {...register('prompt', {
          required: true,
          minLength: 5,
          value,
        })}
        error={formState?.errors?.prompt?.message}
      />
      <div className="mb-[16px]">
        <div className="text-[14px] mb-[6px]">{t('veo3_audio', 'Audio')}</div>
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
        <div className="text-[12px] text-muted mt-[6px]">
          {t(`veo3_audio_${selected}_hint`, AUDIO_HINTS[selected])}
        </div>
      </div>
      <div className="flex flex-col gap-[2px] mb-[6px]">
        <div className="text-[14px]">
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
        hideTopBorder={true}
        text="Images"
        description="Images"
        name="images"
        label="Media"
        value={mediaValue}
        onChange={(val) =>
          setValue(
            'images',
            val.target.value
              .filter((f) => !hasExtension(f.path, 'mp4'))
              .slice(0, 3)
          )
        }
        error={formState?.errors?.media?.message}
      />
    </div>
  );
};

const VeoComponent = () => {
  return <VEO3Settings />;
};

videoWrapper('veo3', VeoComponent);
