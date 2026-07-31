import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { FC, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useVideo } from '@gitroom/frontend/components/videos/video.context.wrapper';
import { Textarea } from '@gitroom/react/form/textarea';
import { MultiMediaComponent } from '@gitroom/frontend/components/media/media.component';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export interface Voice {
  id: string;
  name: string;
  preview_url: string;
}

const VEO3Settings: FC = () => {
  const t = useT();
  const { register, watch, setValue, formState } = useFormContext();
  const { value } = useVideo();

  const media = register('media', {
    value: [],
  });

  const mediaValue = watch('media');

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
