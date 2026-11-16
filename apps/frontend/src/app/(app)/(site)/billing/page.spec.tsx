import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import i18next from '@gitroom/react/translation/i18next';

// Feature 029-arabic-audit-followup (T022, contracts/checks.md T5).
//
// Twenty-one pages set their browser-tab title from a static `metadata` export, so
// the tab said "Sharek Billing" on a screen that was otherwise Arabic. A static
// export cannot be translated: it is evaluated once, with no request and therefore
// no language. `generateMetadata` runs per request, and `getT` already resolves the
// language from the header the proxy sets — so the fix is the page asking for a key
// instead of holding a literal.
//
// This pins the behaviour on one page rather than all twenty-one, because what can
// break is the mechanism, not the wording: if `generateMetadata` reads the language
// the same way the rest of the server does, every other page that copies the shape
// follows. C3 v2 is what proves the other twenty carry no literal.
//
// The language arrives through `next/headers`, mocked here to a settable value, and
// the expected titles are read from the locale files rather than written out again —
// a test carrying its own copy of the Arabic would pass while the shipped string
// said something else.
let mockLanguage: string | null = null;

jest.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) =>
      name === 'x-i18next-current-language' ? mockLanguage : null,
  }),
  cookies: async () => ({ get: () => undefined }),
}));

// The billing tree pulls in SWR, the editor and the payment provider, none of which
// this asks anything of; a stand-in marks where the page puts it.
jest.mock('@gitroom/frontend/components/billing/billing.component', () => ({
  BillingComponent: () => <p data-testid="billing">Billing</p>,
}));

import Page, { generateMetadata } from './page';

const locale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

const en = locale('en');
const ar = locale('ar');

describe('billing page title', () => {
  // i18next preloads every language only when it sees no `window`; the component
  // specs install one, so the bundles are asked for explicitly here.
  beforeAll(async () => {
    await i18next.loadLanguages(['en', 'ar']);
  });

  beforeEach(() => {
    mockLanguage = null;
  });

  it('is Arabic when the request carries the Arabic language header', async () => {
    mockLanguage = 'ar';
    const { title } = await generateMetadata();
    expect(title).toBe(ar['page_title_billing']);
  });

  it('is English when no language header is set', async () => {
    const { title } = await generateMetadata();
    expect(title).toBe(en['page_title_billing']);
  });

  // Without this the pair above would still pass if the key were missing from both
  // files and the title fell through to the default on every request.
  it('renders from a key both locales carry', () => {
    expect(typeof en['page_title_billing']).toBe('string');
    expect(typeof ar['page_title_billing']).toBe('string');
    expect(ar['page_title_billing']).not.toBe(en['page_title_billing']);
  });
});

// Billing scrolls in its card (spec 059, FR-001, FR-002, contracts/routes.md). Its
// root sat in flow, so a long Billing grew the shell and the window scrolled (1047px
// at 900 tall). It now renders inside PageScroll's box, the dashboard page's one
// scroller, with Billing's own 20px inset and 12px gap on the box. happy-dom applies
// no media queries or Tailwind, so the widths are pinned by the classes that carry
// them (page.scroll.spec pins PageScroll's own).
const HOST = ['bg-newBgColorInner', 'flex-1', 'min-w-0', 'relative'];
const BOX = [
  'absolute',
  'inset-0',
  'overflow-y-auto',
  'flex',
  'flex-col',
  'mobile:static',
  'scrollbar',
  'scrollbar-thumb-fifth',
  'scrollbar-track-newBgColor',
];

const mounted: Root[] = [];

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('the billing page', () => {
  afterEach(() => {
    mounted.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = '';
  });

  it("renders Billing inside PageScroll's box, with Billing's inset and gap on the box", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    const page = await Page();
    await act(async () => {
      root.render(page);
    });
    const outer = host.firstElementChild as HTMLElement;
    const box = outer.firstElementChild as HTMLElement;

    expect(classesOf(outer)).toEqual(HOST);
    expect(classesOf(box)).toEqual([...BOX, 'p-[20px]', 'gap-[12px]']);
    expect(box.children).toHaveLength(1);
    expect(box.querySelector('[data-testid="billing"]')?.textContent).toBe(
      'Billing'
    );
  });
});
