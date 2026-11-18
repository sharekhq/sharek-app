import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FACEBOOK_PRESETS } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/facebook.dto';

// The Facebook settings' background list. 062 T029: the options showed the
// DTO's English names in every language; the stored id stays the value.
const mockAr: Record<string, string> = jest.requireActual(
  '../../../../../../../libraries/react-shared-libraries/src/translation/locales/ar/translation.json'
);
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) =>
    mockAr[key] ?? fallback ?? key,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({
    register: (name: string) => ({ name }),
    watch: () => '',
    setValue: jest.fn(),
  }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({ value: [] }),
  })
);
jest.mock('@gitroom/react/form/select', () => ({
  Select: ({ children, label, hideErrors, ...rest }: any) => (
    <select {...rest}>{children}</select>
  ),
}));
jest.mock('@gitroom/react/form/input', () => ({ Input: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/high.order.provider',
  () => ({ withProvider: () => () => null, PostComment: {} })
);
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/facebook/facebook.preview',
  () => ({ FacebookPreview: () => null })
);

import { FacebookSettings } from '@gitroom/frontend/components/new-launch/providers/facebook/facebook.provider';

describe('Facebook settings backgrounds', () => {
  it('every background option is translated in Arabic', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<FacebookSettings />);
    });
    const options = Array.from(
      host.querySelectorAll('select[name="text_format_preset_id"] option')
    ).filter((o) => (o as HTMLOptionElement).value) as HTMLOptionElement[];
    expect(options.length).toBe(FACEBOOK_PRESETS.length);
    FACEBOOK_PRESETS.forEach((item) => {
      const option = options.find((o) => o.value === item.id)!;
      expect(option.textContent).toBe(mockAr[`facebook_preset_${item.id}`]);
    });
    act(() => root.unmount());
    document.body.innerHTML = '';
  });
});
