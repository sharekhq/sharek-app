import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The Instagram collaborators picker. 062 T030: its list was named by the
// library's English default ("Select tags").
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) =>
    key === 'instagram_tags_label' ? 'اختر الوسوم' : fallback ?? key,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({ getValues: () => ({}) }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({ integration: {} }),
  })
);

import { InstagramCollaboratorsTags } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.tags';

describe('Instagram tags', () => {
  it('the picker is named from the locale', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <InstagramCollaboratorsTags
          name="c"
          label="Collaborators"
          onChange={jest.fn()}
        />
      );
    });
    expect(host.querySelector('.react-tags__label')!.textContent).toBe(
      'اختر الوسوم'
    );
    act(() => root.unmount());
    document.body.innerHTML = '';
  });
});
