import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ current: 'global' }),
}));
jest.mock('react-hook-form', () => ({
  useFormContext: () => null,
  useWatch: () => undefined,
}));
// Scenery: the Arabic locale file answers, with its CLDR plural suffixes.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => {
  const ar = require('../../../../../../../libraries/react-shared-libraries/src/translation/locales/ar/translation.json');
  return {
    useT:
      () => (key: string, fallback?: string, options?: { count?: number }) => {
        const suffix =
          options?.count === undefined
            ? ''
            : `_${new Intl.PluralRules('ar').select(options.count)}`;
        const text = ar[`${key}${suffix}`] ?? fallback ?? key;
        return text.replace('{{count}}', String(options?.count));
      },
  };
});

import dayjs from 'dayjs';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { FacebookPreview } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview';

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

const showPreview = (values: Array<{ id: string; content: string }>) =>
  render(
    <IntegrationContext.Provider
      value={{
        date: dayjs(),
        allIntegrations: [],
        integration: {
          id: 'int-1',
          name: 'Sharek',
          identifier: 'facebook',
          picture: '',
        } as any,
        value: values.map((value) => ({ ...value, image: [] })),
      }}
    >
      <FacebookPreview />
    </IntegrationContext.Provider>
  );

describe('Facebook preview', () => {
  it('row gaps and shrink-0 icons', async () => {
    const host = await showPreview([{ id: 'v1', content: '<p>Hi</p>' }]);
    const row = host.querySelector(
      'div.border-t.border-borderLinkedin'
    ) as HTMLElement;
    const items = Array.from(row.children) as HTMLElement[];

    expect(items).toHaveLength(3);
    expect(row.className).toMatch(/\bgap-\[/);
    // 32px each side left 296px at a 360px preview for four items: the row now pads 8px
    expect(row.className).toContain('px-[8px]');
    expect(row.className).not.toContain('px-[32px]');
    items.forEach((item) => {
      expect(item.className).toMatch(/\bgap-\[/);
      expect(item.querySelector('svg')?.getAttribute('class')).toContain(
        'shrink-0'
      );
    });
  });

  it('the sample time and comment time are translated (ar)', async () => {
    const host = await showPreview([
      { id: 'v1', content: '<p>Hi</p>' },
      { id: 'v2', content: '<p>Reply</p>' },
    ]);

    expect(host.textContent).toContain('30 د');
    expect(host.textContent).toContain('9 س');
    expect(host.textContent).not.toContain('30m');
    expect(host.textContent).not.toContain('9h');
  });
});
