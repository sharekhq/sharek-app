'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { PinterestBoard } from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.board';
import { PinterestSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import { Input } from '@gitroom/react/form/input';
import { ColorPicker } from '@gitroom/react/form/color.picker';
import { PinterestPreview } from '@gitroom/frontend/components/new-launch/providers/pinterest/pinterest.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const PinterestSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label={t('title', 'Title')} {...register('title')} />
      <Input label={t('link', 'Link')} {...register('link')} />
      <PinterestBoard {...register('board')} />
      <ColorPicker
        label="Select Pin Color"
        name="dominant_color"
        enabled={false}
        canBeCancelled={true}
      />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  comments: false,
  SettingsComponent: PinterestSettings,
  CustomPreviewComponent: PinterestPreview,
  dto: PinterestSettingsDto,
  maximumCharacters: 500,
});
