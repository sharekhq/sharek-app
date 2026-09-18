import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Feature 029-arabic-audit-followup (T038, contracts/checks.md T3).
//
// The X "Verified" preference is declared by the provider and rendered verbatim, so
// an Arabic reader sees two English strings in the middle of a translated panel. It
// is translated here the way every other server-declared string in this feature is:
// by a key derived from the English, looked up at render time.
//
// The catch, and the whole reason this test exists, is that the code keys on the
// English. `x.provider.ts` reads `additionalSettings` back and looks for the setting
// whose `title` is exactly 'Verified' to decide the 280/25,000 character limit. A
// wrapper that translated the value in place — rather than only on the way to the
// screen — would save "موثّق" into the integration row and silently move every X
// account onto the short limit. So the two assertions are a pair: the title must
// render translated, and the object that goes back to the server must be unchanged,
// down to the description nobody looked at.
const capturedRequests: Array<{ url: string; options: any }> = [];
const closeAll = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async (url: string, options: any) => {
    capturedRequests.push({ url, options });
    return { json: async () => ({}) };
  },
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll }),
}));
// settings.modal.tsx imports TopTitle without using it (pre-existing), which pulls
// the icon set in at module scope.
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  ExpandIcon: () => null,
  CollapseIcon: () => null,
}));

import {
  Element,
  SettingsModal,
} from '@gitroom/frontend/components/launches/settings.modal';

// What x.provider.ts declares, as the integration row stores it after a save.
const VERIFIED = {
  title: 'Verified',
  description: 'Is this a verified user? (Premium)',
  value: false,
};

const mount = (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
};

const click = (element: globalThis.Element | null | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

describe('the X Verified preference', () => {
  beforeEach(() => {
    capturedRequests.length = 0;
    closeAll.mockClear();
  });

  // t is mocked to return the key it is asked for, so the rendered text IS the key
  // the wrapper derived — a formula that produced setting_verified_ would show up
  // here rather than as an English string on an Arabic screen months later.
  it('renders the declared title and description through derived keys', () => {
    const text = mount(
      <Element setting={{ ...VERIFIED }} onChange={() => {}} />
    ).textContent;

    expect(text).toContain('setting_verified');
    expect(text).toContain('setting_is_this_a_verified_user_premium');
  });

  it('sends the English back unchanged after a toggle and a save', async () => {
    const container = mount(
      <SettingsModal
        integration={
          {
            id: 'int-1',
            additionalSettings: JSON.stringify([{ ...VERIFIED }]),
          } as any
        }
        onClose={() => {}}
      />
    );

    // The slider is the only clickable div; the button is the only <button>.
    click(container.querySelector('div[class*="cursor-pointer"]'));
    await act(async () => {
      container.querySelector('button')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].url).toBe('/integrations/int-1/settings');
    expect(
      JSON.parse(JSON.parse(capturedRequests[0].options.body).additionalSettings)
    ).toEqual([{ ...VERIFIED, value: true }]);
  });
});
