// The sign-in pages follow the theme (spec 060, FR-030, contracts/ui.md §15).
// The (app) root layout already renders <body> with the `light` or `dark`
// class from the `mode` cookie, so the auth layout only needs its fixed
// colours swapped for the semantic tokens that class resolves. happy-dom
// applies no Tailwind, so the theme is pinned by the classes that carry it.
import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.translation.service.backend', () => ({
  getT: async () => (_key: string, fallback: string) => fallback,
  requestLanguage: async () => 'en',
}));
jest.mock('@gitroom/frontend/components/auth/vignettes.component', () => ({
  VignettesComponent: () => <div data-testid="vignettes" />,
}));
jest.mock('@gitroom/frontend/components/ui/logo-text.component', () => ({
  LogoTextComponent: () => <div data-testid="logo" />,
}));
// ReturnUrlComponent is the only dynamic import.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));

import AuthLayout from './layout';

const mounted: Root[] = [];

const mount = async (page: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(page);
  });
  return host;
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

const render = async () => {
  const host = await mount(
    await AuthLayout({ children: <p data-testid="form">Form</p> })
  );
  const outer = host.firstElementChild as HTMLElement;
  // The logo heads the form column, which sits in the form panel, whose last
  // child is the footer.
  const column = host.querySelector('[data-testid="logo"]')!
    .parentElement as HTMLElement;
  const panel = column.parentElement as HTMLElement;
  const footer = panel.lastElementChild as HTMLElement;
  return { host, outer, panel, footer };
};

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

describe('the sign-in layout', () => {
  it('sets the page on the theme background and ink', async () => {
    const { outer } = await render();

    expect(classesOf(outer)).toEqual(
      expect.arrayContaining(['bg-newBgColor', 'text-ink'])
    );
  });

  it('sets the form panel on the theme surface and ink', async () => {
    const { panel } = await render();

    expect(classesOf(panel)).toEqual(
      expect.arrayContaining(['bg-newBgColorInner', 'text-ink'])
    );
  });

  it('sets the footer in the muted ink', async () => {
    const { footer } = await render();

    expect(footer.textContent).toBe('© 2026 Sharek');
    expect(classesOf(footer)).toContain('text-muted');
  });

  it('carries no fixed colour in any class', async () => {
    const { host } = await render();

    const fixed = Array.from(host.querySelectorAll('[class]'))
      .flatMap(classesOf)
      .filter((name) => /\[#|white|black/.test(name));
    expect(fixed).toEqual([]);
  });
});
