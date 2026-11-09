import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The heading reads its text out of the nav menu, so the menu is the seam: it is
// stubbed down to two translated entries, one with a title of its own, but
// through the real useT, because what is under test is whether a language switch
// reaches the heading at all. A stub returning a plain string would never
// re-render and would pass against the bug.
jest.mock('@gitroom/frontend/components/layout/top.menu', () => ({
  useMenuItem: () => {
    const {
      useT,
    } = require('@gitroom/react/translation/get.transation.service.client');
    const t = useT();
    return {
      all: [
        { name: t('launches'), path: '/launches' },
        { name: t('brands'), title: t('brands_all_brands'), path: '/brands' },
      ],
    };
  },
}));
// The page the browser is on; afterEach puts it back on /launches.
const route = { path: '/launches' };
jest.mock('next/navigation', () => ({ usePathname: () => route.path }));

import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { Title } from '@gitroom/frontend/components/layout/title';

// Its own instance, not the app singleton: specs share a worker process, and
// initialising the shared one here would outlive this file.
const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          launches: 'Launches',
          brands: 'Brands',
          brands_all_brands: 'Brands',
        },
      },
      ar: {
        translation: {
          launches: 'الإطلاقات',
          brands: 'العلامات',
          brands_all_brands: 'العلامات التجارية',
        },
      },
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
      <I18nextProvider i18n={i18n}>
        <Title />
      </I18nextProvider>
    );
  });

  return () => host.querySelector('h1')?.textContent;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  route.path = '/launches';
});

describe('Title', () => {
  it('names the current page in the loaded language', () => {
    expect(render()()).toBe('Launches');
  });

  // Switching language never changes the path, so a heading memoised on the path
  // alone keeps the string it resolved on first paint: correct on a fresh load in
  // Arabic, stale for the rest of the session after an in-session switch.
  it('follows an in-session language switch', async () => {
    const heading = render();
    expect(heading()).toBe('Launches');

    await act(async () => {
      await i18n.changeLanguage('ar');
    });

    expect(heading()).toBe('الإطلاقات');
  });

  // The rail's word can be shorter than the page's name: Brands is العلامات on
  // the rail and العلامات التجارية over its page (spec 053, US1 scenario 11).
  it("names the page by its menu item's title when the item has one", async () => {
    await act(async () => {
      await i18n.changeLanguage('ar');
    });
    route.path = '/brands';

    expect(render()()).toBe('العلامات التجارية');
  });

  it("names the page by its menu item's name when the item has no title", async () => {
    await act(async () => {
      await i18n.changeLanguage('ar');
    });

    expect(render()()).toBe('الإطلاقات');
  });
});
