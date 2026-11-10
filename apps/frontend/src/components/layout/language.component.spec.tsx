import { act } from 'react';
import { createRoot } from 'react-dom/client';

// What the top bar's button does is open the language modal.
const mockOpenModal = jest.fn();

// The selector is the seam: what is under test is the side effect of picking a
// language, so everything around the tiles is stubbed but i18next itself is real.
// Mocking i18next would leave the test asserting that two setAttribute calls
// happen, which is true of any implementation and of none of the bug.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeCurrent: () => {}, openModal: mockOpenModal }),
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
import {
  ChangeLanguageComponent,
  LanguageComponent,
} from '@gitroom/frontend/components/layout/language.component';

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

const render = (Component = ChangeLanguageComponent) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  act(() => {
    root.render(
      <I18nextProvider i18n={i18next}>
        <Component />
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

// The language control in the top bar: one button, named by the modal it opens,
// in the dark mode button's 40px box (research R9), around the flag's own disc.
describe('the button in the top bar', () => {
  // The menu button's box (layout.component.tsx), centred, as mode.component.tsx
  // carries it.
  const BOX = [
    'flex',
    'items-center',
    'justify-center',
    'h-[40px]',
    'w-[40px]',
    'coarse:h-[44px]',
    'coarse:w-[44px]',
    'rounded-[10px]',
    'text-textItemBlur',
    'hover:text-newTextColor',
    'hover:bg-boxFocused',
    'transition-colors',
    'focus-visible:ring-2',
    'focus-visible:ring-brand',
  ];

  const buttonIn = (host: HTMLElement) => {
    const buttons = host.querySelectorAll<HTMLElement>('button');
    if (buttons.length !== 1) throw new Error(`${buttons.length} buttons`);
    return buttons[0];
  };

  // Class names are matched as words in className, not as CSS selectors, so
  // the brackets of Tailwind's arbitrary values need no escaping.
  const classesOf = (el: Element) =>
    el.getAttribute('class')?.split(/\s+/) ?? [];

  beforeEach(() => {
    mockOpenModal.mockClear();
  });

  it('is one button that submits nothing', () => {
    const host = render(LanguageComponent);

    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild!.tagName).toBe('BUTTON');
    expect(host.firstElementChild!.getAttribute('type')).toBe('button');
  });

  it('is named by the modal it opens', () => {
    expect(buttonIn(render(LanguageComponent)).getAttribute('aria-label')).toBe(
      'Select Language'
    );
  });

  it('opens the language modal on a click', () => {
    const button = buttonIn(render(LanguageComponent));

    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal.mock.calls[0][0].title).toBe('Select Language');
    expect(mockOpenModal.mock.calls[0][0].children.type).toBe(
      ChangeLanguageComponent
    );
  });

  it("carries the dark mode button's 40px box, centred", () => {
    const classes = classesOf(render(LanguageComponent).firstElementChild!);

    BOX.forEach((name) => expect(classes).toContain(name));
  });

  // overflow-hidden on this 22px round box is what crops the flag into a disc,
  // so the button grows around it and the box itself stays as it was.
  it('keeps the 22px round flag box inside it, unchanged', () => {
    const button = buttonIn(render(LanguageComponent));

    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild!.tagName).toBe('DIV');
    expect(button.firstElementChild!.getAttribute('class')).toBe(
      'rounded-full overflow-hidden h-[22px] w-[22px] relative'
    );
  });
});
