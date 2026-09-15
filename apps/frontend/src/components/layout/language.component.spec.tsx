import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The selector is the seam: what is under test is the side effect of picking a
// language, so everything around the tiles is stubbed but i18next itself is real.
// Mocking i18next would leave the test asserting that two setAttribute calls
// happen, which is true of any implementation and of none of the bug.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeCurrent: () => {} }),
}));
jest.mock('@gitroom/frontend/components/new-launch/modal.wrapper.component', () => ({
  ModalWrapperComponent: () => null,
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['en', () => {}],
}));
jest.mock('react-country-flag', () => ({ __esModule: true, default: () => null }));
jest.mock('@mantine/core', () => ({
  List: () => null,
  Box: () => null,
  Group: () => null,
  Text: ({ children }: any) =>
    require('react').createElement('span', null, children),
}));

import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { languageNames } from '@gitroom/react/translation/i18n.config';
import { ChangeLanguageComponent } from '@gitroom/frontend/components/layout/language.component';

// The component reaches for the i18next singleton rather than an injected
// instance, so the singleton is what has to be initialised. Jest gives each spec
// file its own module registry, so this one stays inside this file.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: { change_language: 'Select Language' } },
      ar: { translation: { change_language: 'اختر اللغة' } },
    },
  });
});

const mounted: Array<{ unmount: () => void }> = [];

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  act(() => {
    root.render(
      <I18nextProvider i18n={i18next}>
        <ChangeLanguageComponent />
      </I18nextProvider>
    );
  });

  return host;
};

const pick = (host: HTMLElement, name: string) => {
  const tile = Array.from(host.querySelectorAll('.grid > div')).find(
    (el) => el.textContent === name
  );
  if (!tile) throw new Error(`no tile for ${name}`);
  act(() => {
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// A fresh document per test, carrying the attributes the server rendered, so
// "still en" is a stale value rather than an absent one.
beforeEach(() => {
  document.documentElement.setAttribute('lang', 'en');
  document.documentElement.setAttribute('dir', 'ltr');
});

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  await i18next.changeLanguage('en');
});

// global.scss keys the Arabic typography on html[lang='ar'], and the document's
// lang is also what a screen reader picks a voice from. Setting dir alone leaves
// the page reading right-to-left in a font chosen for Latin, and announced in the
// wrong language, until the next full reload.
describe('picking a language', () => {
  it('moves the document to that language, not only to its direction', () => {
    const host = render();

    pick(host, languageNames.ar);

    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('comes back again on the way to a left-to-right language', async () => {
    const host = render();

    pick(host, languageNames.ar);
    pick(host, languageNames.de);

    expect(document.documentElement.getAttribute('lang')).toBe('de');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });
});
