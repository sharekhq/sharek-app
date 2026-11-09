import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig } from 'swr';
import * as fs from 'fs';
import * as path from 'path';

// The Brands page (spec 053, US1 scenarios 1, 3, 11 and 12, FR-003; boards
// Main, BrandsAR, BrandsPhone and BrandsPhoneList; contracts/pages-ui.md's
// Brands page): the brands listed on the start side in SplitPanel, as Samy's
// chats are, New brand first with no heading above it, each brand A to Z with
// its logo or initial and its channel count, then No brand; with no brands an
// empty state that explains them; a brand's page with its name, Rename, its ⋯
// and the line on what the kit is for, then its kit; No brand's page with its
// channels and no kit. At 1025px and below the list comes first and a brand's
// page has a link back to it.
//
// SWR runs for real on a cache of its own, so the brands come from GET /brands
// and the channels from GET /integrations/list; only the requests are stubbed.
// t() is the real i18next on the en and ar files, so a count renders the
// plural form each language picks. The kit and the dialogs have their own
// specs: here they are markers that record what the page hands them.

type Channel = {
  id: string;
  internalId: string;
  name: string;
  identifier: string;
  picture: string | null;
  type: string;
  disabled?: boolean;
  customer: { id: string; name: string } | null;
};

const mockFetch = jest.fn();
const mockDialogs = {
  openNewBrand: jest.fn(),
  openDeleteBrand: jest.fn(),
  openRenameBrand: jest.fn(),
};
// What the page last handed the split panel.
let mockSplit: ComponentProps<typeof SplitPanel> | undefined;

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
// the page's title, read on the server
jest.mock('@gitroom/react/translation/get.translation.service.backend', () => ({
  getT: async () => mockTranslate,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/brands/brand.kit', () => ({
  BrandKit: ({ brand }: { brand: { id: string } }) => (
    <div data-testid="brand-kit" data-brand={brand.id} />
  ),
  BrandChannel: ({ channel }: { channel: Channel }) => (
    <div data-testid="channel">{channel.name}</div>
  ),
}));
jest.mock('@gitroom/frontend/components/brands/brand.dialogs', () => ({
  useBrandDialogs: () => mockDialogs,
}));
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplit = props;
    return <aside data-testid="split-panel">{props.children}</aside>;
  },
}));
// Scenery: the channel list's module loads for its order and its ring.
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);

import i18next from 'i18next';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import type { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import type { Brand } from '@gitroom/frontend/components/brands/use.brands';
import { BrandsComponent } from '@gitroom/frontend/components/brands/brands.component';

const mockTranslate = (
  key: string,
  fallback: string,
  options?: Record<string, unknown>
) => i18next.t(key, { defaultValue: fallback, ...options });

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: readLocale('en') },
      ar: { translation: readLocale('ar') },
    },
  });
});

const brand = (id: string, name: string, logo: Brand['kit']['logo'] = null) =>
  ({
    id,
    name,
    kit: {
      logo,
      examples: [],
      colours: [],
      headingFont: null,
      bodyFont: null,
    },
  } as Brand);

const BQ = { id: 'bq', name: 'Bayt Al Qahwa' };
const ND = { id: 'nd', name: 'noor Dental' };
const RF = { id: 'rf', name: 'Rawda Florist' };

// Not in the order the list shows them: a lower-case name, and numbers that
// go by value, Client 2 before Client 10, as the channel list orders its
// brands. Noor Dental's logo was deleted from Media.
const BRANDS = [
  brand(RF.id, RF.name),
  brand('c10', 'Client 10'),
  brand(ND.id, ND.name, { id: 'm2', path: null, missing: true }),
  brand(BQ.id, BQ.name, {
    id: 'm1',
    path: 'https://media/bq.png',
    missing: false,
  }),
  brand('c2', 'Client 2'),
];

const channel = (
  id: string,
  name: string,
  customer: Channel['customer'],
  disabled = false
): Channel => ({
  id,
  internalId: id,
  name,
  identifier: 'instagram',
  picture: null,
  type: 'social',
  disabled,
  customer,
});

// A disabled channel still counts, in a brand and in No brand.
const CHANNELS = [
  channel('ch1', 'بيت القهوة', BQ),
  channel('ch2', 'Bayt Instagram', BQ),
  channel('ch3', 'baytalqahwa', BQ, true),
  channel('ch4', 'Noor Dental', ND),
  channel('ch5', 'Noor Clinic', ND),
  channel('ch6', 'Rawda Florist', RF),
  channel('ch9', 'Sky Studio', null, true),
  channel('ch8', 'Mona Saeed', null),
  channel('ch7', 'Lamsa Studio', null),
];

let mockBrands: Brand[];
let mockChannels: Channel[];

const answer = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

// The window, as the media query reports it: wider than 1025px unless a case
// narrows it.
const realMatchMedia = window.matchMedia;
let smallWindow = false;

beforeEach(() => {
  mockBrands = BRANDS;
  mockChannels = CHANNELS;
  mockSplit = undefined;
  smallWindow = false;
  mockFetch.mockImplementation(async (url: string) =>
    answer(url === '/brands' ? mockBrands : { integrations: mockChannels })
  );
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

const mounted: Root[] = [];

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <BrandsComponent />
      </SWRConfig>
    );
  });
  await settle();
  return host;
};

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// The list, named by brands_all_brands.
const list = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('nav[aria-label]');
const rows = (host: HTMLElement) =>
  Array.from(list(host)!.querySelectorAll('button')).slice(1);
const row = (host: HTMLElement, text: string) =>
  rows(host).find((node) => node.textContent?.includes(text));
// A button by its words or its label, anywhere on the page.
const button = (host: HTMLElement, label: string) =>
  Array.from(
    host.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).find(
    (node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label') === label
  );
const heading = (host: HTMLElement) => host.querySelector('h2');
const kit = (host: HTMLElement) =>
  host.querySelector('[data-testid="brand-kit"]');
const classes = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// A class on a physical side, which stays put when Arabic flips the page.
const physical = (name: string) =>
  /^(?:[^:]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-|$)/.test(
    name
  );

const USED_BY =
  "Samy and Sharek's AI use this kit to keep your images on-brand.";

describe('the list', () => {
  it('sits on the start side in SplitPanel, named Brands', async () => {
    const host = await render();

    expect(mockSplit?.label).toBe('Brands');
    // the rail is the page's first column, the brand's page after it
    const rail = host.querySelector('[data-testid="split-panel"]')!;
    expect(rail.contains(list(host))).toBe(true);
    expect(
      rail.compareDocumentPosition(heading(host)!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('starts with New brand, with no heading above it', async () => {
    const host = await render();
    const nav = list(host)!;

    expect(nav.querySelector('button')?.textContent).toBe('New brand');
    expect(nav.textContent?.startsWith('New brand')).toBe(true);
    expect(nav.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();

    await click(nav.querySelector('button'));
    expect(mockDialogs.openNewBrand).toHaveBeenCalledTimes(1);
  });

  it('lists each brand A to Z as the channel list orders brands, then No brand', async () => {
    const host = await render();

    expect(
      Array.from(list(host)!.querySelectorAll('[dir="auto"]')).map(
        (node) => node.textContent
      )
    ).toEqual([
      'Bayt Al Qahwa',
      'Client 2',
      'Client 10',
      'noor Dental',
      'Rawda Florist',
    ]);
    expect(rows(host)).toHaveLength(6);
    expect(rows(host)[5].textContent).toContain('No brand');
  });

  it('gives each brand its channel count, disabled channels included, and No brand the channels in no brand', async () => {
    const host = await render();

    // the row's last line
    expect(
      rows(host).map(
        (node) => Array.from(node.querySelectorAll('span')).pop()?.textContent
      )
    ).toEqual([
      '3 channels',
      '0 channels',
      '0 channels',
      '2 channels',
      '1 channel',
      '3 channels',
    ]);
  });

  it('shows a brand by its logo, or by its initial when it has none or it was deleted from Media', async () => {
    const host = await render();

    const logo = row(host, 'Bayt Al Qahwa')!.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('https://media/bq.png');
    // the name beside it names the row
    expect(logo?.getAttribute('alt')).toBe('');

    expect(row(host, 'Client 2')!.querySelector('img')).toBeNull();
    expect(row(host, 'Client 2')!.textContent).toBe('CClient 20 channels');
    expect(row(host, 'noor Dental')!.querySelector('img')).toBeNull();
    expect(row(host, 'noor Dental')!.textContent).toBe(
      'Nnoor Dental2 channels'
    );
  });

  it('puts No brand under Not in a brand', async () => {
    const host = await render();
    const group = list(host)!.querySelector(
      '[role="group"][aria-label="Not in a brand"]'
    );

    expect(group?.textContent).toContain('Not in a brand');
    expect(group?.contains(row(host, 'No brand')!)).toBe(true);
  });
});

describe("a brand's page", () => {
  it('shows the first brand A to Z until one is picked, marked in the list', async () => {
    const host = await render();

    expect(heading(host)?.textContent).toBe('Bayt Al Qahwa');
    expect(kit(host)?.getAttribute('data-brand')).toBe('bq');
    expect(rows(host).map((node) => node.getAttribute('aria-current'))).toEqual(
      ['page', null, null, null, null, null]
    );
  });

  it('shows a picked brand: its name, the sub-line, Rename and its ⋯, then its kit', async () => {
    const host = await render();

    await click(row(host, 'noor Dental'));

    const title = heading(host)!;
    expect(title.textContent).toBe('noor Dental');
    expect(title.getAttribute('dir')).toBe('auto');
    expect(row(host, 'noor Dental')!.getAttribute('aria-current')).toBe('page');
    expect(host.textContent).toContain(`2 channels · ${USED_BY}`);
    expect(kit(host)?.getAttribute('data-brand')).toBe('nd');
    // the kit comes after the header
    expect(
      title.compareDocumentPosition(kit(host)!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    await click(button(host, 'Rename'));
    expect(mockDialogs.openRenameBrand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'nd', name: 'noor Dental' })
    );
  });

  it('offers Rename and Delete brand in its ⋯', async () => {
    const host = await render();

    await click(button(host, 'Brand options'));
    const items = Array.from(host.querySelectorAll('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual([
      'Rename',
      'Delete brand',
    ]);

    await click(items[1]);
    expect(mockDialogs.openDeleteBrand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bq', name: 'Bayt Al Qahwa' })
    );

    await click(button(host, 'Brand options'));
    await click(host.querySelector('[role="menuitem"]'));
    expect(mockDialogs.openRenameBrand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bq', name: 'Bayt Al Qahwa' })
    );
  });

  it('opens a new brand once it is created', async () => {
    const host = await render();

    await click(list(host)!.querySelector('button'));
    const onCreated = mockDialogs.openNewBrand.mock.calls[0][0];
    await act(async () => {
      onCreated('rf');
    });

    expect(heading(host)?.textContent).toBe('Rawda Florist');
    expect(kit(host)?.getAttribute('data-brand')).toBe('rf');
  });
});

describe("No brand's page", () => {
  it('shows the channels in no brand and no kit', async () => {
    const host = await render();

    await click(row(host, 'No brand'));

    expect(heading(host)?.textContent).toBe('No brand');
    expect(row(host, 'No brand')!.getAttribute('aria-current')).toBe('page');
    expect(host.textContent).toContain('3 channels');
    expect(kit(host)).toBeNull();
    expect(button(host, 'Rename')).toBeUndefined();
    expect(button(host, 'Brand options')).toBeUndefined();
    // in the channel list's order: enabled first, then by name
    expect(
      Array.from(host.querySelectorAll('[data-testid="channel"]')).map(
        (node) => node.textContent
      )
    ).toEqual(['Lamsa Studio', 'Mona Saeed', 'Sky Studio']);
  });
});

describe('with no brands', () => {
  beforeEach(() => {
    mockBrands = [];
    mockChannels = CHANNELS.map((item) => ({ ...item, customer: null }));
  });

  it('says in the list what brands are for, between New brand and No brand', async () => {
    const host = await render();
    const nav = list(host)!;

    expect(nav.querySelector('button')?.textContent).toBe('New brand');
    expect(nav.textContent).toContain(
      "No brands yet. Give each brand its own logo and look, and Samy uses it for that brand's channels."
    );
    expect(rows(host).map((node) => node.textContent)).toEqual([
      'No brand9 channels',
    ]);
  });

  it('explains brands beside the list, with New brand', async () => {
    const host = await render();

    expect(heading(host)?.textContent).toBe('Give each brand its own look');
    expect(host.textContent).toContain(
      "Add a logo, a few example posts, colours and fonts. When you pick a brand's channels, Samy and Sharek's AI keep your images in its look."
    );
    expect(kit(host)).toBeNull();

    const buttons = Array.from(host.querySelectorAll('button')).filter(
      (node) => node.textContent?.trim() === 'New brand'
    );
    expect(buttons).toHaveLength(2);
    await click(buttons[1]);
    expect(mockDialogs.openNewBrand).toHaveBeenCalledTimes(1);
  });

  it('still opens No brand', async () => {
    const host = await render();

    await click(row(host, 'No brand'));

    expect(heading(host)?.textContent).toBe('No brand');
    expect(host.querySelectorAll('[data-testid="channel"]')).toHaveLength(9);
  });
});

describe('at 1025px and below', () => {
  beforeEach(() => {
    smallWindow = true;
  });

  it('shows the list first, in the page, with no brand picked', async () => {
    const host = await render();

    expect(host.querySelector('[data-testid="split-panel"]')).toBeNull();
    expect(list(host)).not.toBeNull();
    expect(heading(host)).toBeNull();
    expect(kit(host)).toBeNull();
    expect(rows(host).every((node) => !node.hasAttribute('aria-current'))).toBe(
      true
    );
  });

  it("opens a brand's page in place of the list, with a link back to it", async () => {
    const host = await render();

    await click(row(host, 'Bayt Al Qahwa'));

    expect(list(host)).toBeNull();
    expect(heading(host)?.textContent).toBe('Bayt Al Qahwa');
    expect(kit(host)?.getAttribute('data-brand')).toBe('bq');
    const back = button(host, 'Brands')!;
    expect(
      back.compareDocumentPosition(heading(host)!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Rename lives in the ⋯ on a phone
    expect(classes(button(host, 'Rename')!)).toContain('mobile:hidden');

    await click(back);
    expect(list(host)).not.toBeNull();
    expect(heading(host)).toBeNull();
    expect(kit(host)).toBeNull();
  });

  it("opens No brand's page with the same link back", async () => {
    const host = await render();

    await click(row(host, 'No brand'));

    expect(list(host)).toBeNull();
    expect(heading(host)?.textContent).toBe('No brand');
    await click(button(host, 'Brands'));
    expect(list(host)).not.toBeNull();
  });
});

describe('in Arabic', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('ar');
  });

  it('words the list and counts in Arabic, each count in its plural form', async () => {
    const host = await render();

    expect(list(host)!.getAttribute('aria-label')).toBe('العلامات التجارية');
    expect(list(host)!.querySelector('button')?.textContent).toBe(
      'علامة تجارية جديدة'
    );
    expect(
      list(host)!.querySelector('[role="group"]')?.getAttribute('aria-label')
    ).toBe('خارج العلامات التجارية');
    // each row: the initial when there is no logo, the name, the count
    expect(rows(host).map((node) => node.textContent)).toEqual([
      'Bayt Al Qahwa3 قنوات',
      'CClient 2لا قنوات',
      'CClient 10لا قنوات',
      'Nnoor Dentalقناتان',
      'RRawda Floristقناة واحدة',
      'بلا علامة تجارية3 قنوات',
    ]);
  });

  it('keeps brand names as typed, each in its own direction', async () => {
    const host = await render();

    for (const name of ['Bayt Al Qahwa', 'Client 2', 'noor Dental']) {
      const node = Array.from(list(host)!.querySelectorAll('*')).find(
        (item) => item.textContent === name && !item.children.length
      );
      expect(node?.getAttribute('dir')).toBe('auto');
    }
    expect(heading(host)?.getAttribute('dir')).toBe('auto');
    expect(host.textContent).toContain(
      '3 قنوات · يستخدم سامي والذكاء الاصطناعي في شارك هذه الهوية لتبقى صورك متسقة مع علامتك.'
    );
  });

  it('mirrors: no class sits on a physical side', async () => {
    const host = await render();
    const all = () =>
      Array.from(host.querySelectorAll('*')).flatMap((node) => classes(node));

    expect(all().filter(physical)).toEqual([]);
    await click(row(host, 'بلا علامة تجارية'));
    expect(all().filter(physical)).toEqual([]);
  });

  it("turns the phone's back arrow to point right", async () => {
    smallWindow = true;
    const host = await render();

    await click(row(host, 'Bayt Al Qahwa'));
    const back = button(host, 'العلامات التجارية')!;

    expect(classes(back.querySelector('svg')!)).toContain('rtl:-scale-x-100');
    expect(
      Array.from(host.querySelectorAll('*'))
        .flatMap((node) => classes(node))
        .filter(physical)
    ).toEqual([]);
  });
});

describe('the route', () => {
  it('is titled Sharek Brands and renders the page', async () => {
    const page = await import('@gitroom/frontend/app/(app)/(site)/brands/page');

    expect((await page.generateMetadata()).title).toBe('Sharek Brands');
    expect((await page.default()).type).toBe(BrandsComponent);
  });
});
