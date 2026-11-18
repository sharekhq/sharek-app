import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ current: 'global' }),
}));
// Scenery: the English fallbacks stand in for the locale files.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

import dayjs from 'dayjs';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { LinkedinPreview } from '@gitroom/frontend/components/new-launch/providers/linkedin/linkedin.preview';
import en from '../../../../../../../libraries/react-shared-libraries/src/translation/locales/en/translation.json';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const showPreview = () =>
  render(
    <IntegrationContext.Provider
      value={{
        date: dayjs(),
        allIntegrations: [],
        integration: {
          id: 'int-1',
          name: 'Sharek',
          identifier: 'linkedin',
          picture: '',
        } as any,
        value: [{ id: 'v1', content: '<p>Hi</p>', image: [] }],
      }}
    >
      <LinkedinPreview />
    </IntegrationContext.Provider>
  );

const actionRow = (host: HTMLElement) =>
  host.querySelector('div.border-t.border-borderLinkedin') as HTMLElement;

describe('LinkedIn preview action row', () => {
  it('four items fit with gaps and icons never shrink', async () => {
    const row = actionRow(await showPreview());
    const items = Array.from(row.children) as HTMLElement[];

    expect(items).toHaveLength(4);
    expect(row.className).toMatch(/\bgap-\[/);
    items.forEach((item) => {
      expect(item.className).toMatch(/\bgap-\[/);
      expect(item.querySelector('svg')?.getAttribute('class')).toContain(
        'shrink-0'
      );
    });
  });

  it('the third label reads Comment', async () => {
    const row = actionRow(await showPreview());
    const labels = Array.from(row.children).map((item) => item.textContent);

    expect(en.preview_linkedin_comment).toBe('Comment');
    expect(labels).toContain('Comment');
    expect(labels).not.toContain('Comments');
  });
});
