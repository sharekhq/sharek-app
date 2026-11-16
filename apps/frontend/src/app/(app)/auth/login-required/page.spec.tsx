// The login-required panel covers the whole page, so it follows the theme as
// the /auth shell does (spec 060, code review). happy-dom applies no Tailwind,
// so the theme is pinned by the classes that carry it.
import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.translation.service.backend', () => ({
  getT: async () => (_key: string, fallback: string) => fallback,
}));

import LoginRequiredPage from './page';

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

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

describe('the login-required page', () => {
  it('covers the page on the theme background and ink', async () => {
    const host = await mount(await LoginRequiredPage());
    const panel = host.firstElementChild as HTMLElement;

    expect(classesOf(panel)).toEqual(
      expect.arrayContaining(['fixed', 'inset-0', 'bg-newBgColor', 'text-ink'])
    );
    expect(
      classesOf(panel).filter((name) =>
        /\[#|white|black|left-|top-0/.test(name)
      )
    ).toEqual([]);
    expect(panel.textContent).toBe(
      'Login to use the wizard to generate API code'
    );
  });
});
