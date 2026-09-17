'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { WordpressPostType } from '@gitroom/frontend/components/new-launch/providers/wordpress/wordpress.post.type';
import { WordpressTerms } from '@gitroom/frontend/components/new-launch/providers/wordpress/wordpress.terms';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { WordpressDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const WordpressSettings: FC = () => {
  const t = useT();
  const form = useSettings();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <WordpressPostType {...form.register('type')} />
      <Select label="Status" {...form.register('status', { value: 'publish' })}>
        <option value="publish">{t('label_article_status_published', 'Publish')}</option>
        <option value="draft">{t('draft', 'Draft')}</option>
        <option value="pending">{t('label_status_pending', 'Pending')}</option>
        <option value="private">{t('label_status_private', 'Private')}</option>
      </Select>
      <WordpressTerms
        label="Categories"
        func="categoriesList"
        {...form.register('categories')}
      />
      <WordpressTerms
        label="WordPress Tags"
        func="tagsList"
        {...form.register('tags')}
      />
      <MediaComponent
        label={t('label_cover_picture', 'Cover picture')}
        description="Add a cover picture"
        {...form.register('main_image')}
      />
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: WordpressSettings,
  CustomPreviewComponent: undefined, // WordpressPreview,
  dto: WordpressDto,
  maximumCharacters: 100000,
});
