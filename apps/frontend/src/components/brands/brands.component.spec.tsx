import { act, ComponentProps, FC, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig, useSWRConfig } from 'swr';
import * as fs from 'fs';
import * as path from 'path';

// The Brands page (spec 053, US1 scenarios 1, 3, 11 and 12, FR-003; boards
// Main, BrandsAR, BrandsPhone and BrandsPhoneList; contracts/pages-ui.md's
// Brands page): the brands listed on the start side in SplitPanel, as Samy's
// chats are, New brand first with no heading above it, each brand A to Z with
// its logo or initial and its channel count, then No brand; with no brands an
// empty state that explains them; a brand's page with its name, Rename, its ⋯
// and the line on what the kit is for, then its kit, with Fill from my website
// beside Rename once the kit has something in it (US6); No brand's page with
// its channels and no kit. Above 1025px with brands, All brands' overview
// until a brand is picked (spec 059, US6). At 1025px and below the list comes
// first and a brand's page has a link back to it.
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
}));
jest.mock('@gitroom/frontend/components/brands/brand.channels', () => ({
  BrandChannel: ({ channel }: { channel: Channel }) => (
    <div data-testid="channel">{channel.name}</div>
  ),
}));
jest.mock('@gitroom/frontend/components/brands/brand.dialogs', () => ({
  useBrandDialogs: () => mockDialogs,
}));
// Whether the server can look a website up (FIRECRAWL_API_KEY set), as the
// layout reads it.
const mockVariables = { websiteLookup: true };
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  ...jest.requireActual('@gitroom/react/helpers/variable.context'),
  useVariables: () => mockVariables,
}));
// Fill from my website's dialog, which has its own spec, is a marker too.
const mockOpenWebsite = jest.fn();
jest.mock('@gitroom/frontend/components/brands/brand.website', () => ({
  ...jest.requireActual('@gitroom/frontend/components/brands/brand.website'),
  useFillFromWebsite: () => mockOpenWebsite,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div data-testid="loading" />,
}));
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/ui/split.panel'),
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplit = props;
    return <aside data-testid="split-panel">{props.children}</aside>;
  },
}));
// The overview's grid mark and a done item's tick are markers that keep the
// props the page gives them; every other icon is the real one.
jest.mock('@gitroom/frontend/components/ui/icons', () => {
  const marker = (name: string) => {
    const Icon = (props: ComponentProps<'svg'> & { size?: number }) => (
      <svg data-icon={name} {...props} />
    );
    return Icon;
  };
  return {
    ...jest.requireActual('@gitroom/frontend/components/ui/icons'),
    GridIcon: marker('GridIcon'),
    CheckmarkIcon: marker('CheckmarkIcon'),
  };
});
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
import { buttonClassName } from '@gitroom/react/form/button';
import type { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import type {
  Brand,
  BrandImage,
} from '@gitroom/frontend/components/brands/use.brands';
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

const brand = (
  id: string,
  name: string,
  logo: Brand['kit']['logo'] = null,
  kit: Partial<Brand['kit']> = {},
  about: string | null = null
) =>
  ({
    id,
    name,
    kit: {
      logo,
      examples: [],
      colours: [],
      headingFont: null,
      bodyFont: null,
      ...kit,
    },
    details: {
      about,
      toneOfVoice: null,
      postLanguage: null,
      callToAction: null,
      hashtags: null,
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
  mockVariables.websiteLookup = true;
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

// The page's SWR cache asking again, as a dialog has it do once it changed
// the brands.
let revalidate: ReturnType<typeof useSWRConfig>['mutate'];
const Revalidate: FC = () => {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    revalidate = mutate;
  }, [mutate]);
  return null;
};

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <Revalidate />
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
const USED_BY_EACH =
  "Samy and Sharek's AI use each brand's kit to keep images on-brand.";

// The overview's cards: every button beside the list.
const cards = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('button')).filter(
    (node) => !list(host)!.contains(node)
  );
const card = (host: HTMLElement, text: string) =>
  cards(host).find((node) => node.textContent?.includes(text));
// A card's line under its name, its kit items and its note.
const cardLine = (node: Element) =>
  Array.from(node.querySelectorAll('span')).find((item) =>
    classes(item).includes('text-[13px]')
  )?.textContent;
const chips = (node: Element) =>
  Array.from(node.querySelectorAll('span')).filter((item) =>
    classes(item).includes('h-[24px]')
  );
// A kit item as a reader takes it: ✓ and its label when it is done, its
// label and the screen reader's word when it is missing.
const chip = (node: Element) => {
  const word = node.querySelector('.sr-only');
  const label = Array.from(node.childNodes)
    .filter((child) => child !== word && child.nodeName !== 'svg')
    .map((child) => child.textContent)
    .join('');
  return word ? `${label} (${word.textContent})` : `✓ ${label}`;
};
const note = (node: Element) =>
  Array.from(node.children).find((child) =>
    classes(child).includes('text-[12.5px]')
  )?.textContent ?? null;
// The line under the page's heading.
const topLine = (host: HTMLElement) =>
  heading(host)?.nextElementSibling?.textContent;
// What the page's scroll box holds: the overview or a brand's page beside
// the list, the list itself on a phone.
const box = (host: HTMLElement) =>
  host.querySelector('[class~="mobile:static"]')!.firstElementChild!;
// The box's padding before spec 060: a 960px column with its own sides.
const OLD_BOX = [
  'max-w-[960px]',
  'mx-auto',
  'px-[32px]',
  'py-[24px]',
  'mobile:px-[14px]',
  'mobile:py-[16px]',
];

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

  it('draws New brand as the medium secondary button, 4px in from the list’s sides and 8px over the first row (spec 059, FR-026)', async () => {
    const host = await render();
    const newBrand = list(host)!.querySelector('button')!;

    expect(classes(newBrand)).toEqual(
      expect.arrayContaining([
        ...buttonClassName({ variant: 'secondary' }).split(' '),
        'mx-[4px]',
        'mb-[8px]',
      ])
    );
    expect(newBrand.querySelector('svg')?.getAttribute('width')).toBe('16');
  });

  it('lists All brands, then each brand A to Z as the channel list orders brands, then No brand', async () => {
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
    expect(rows(host)).toHaveLength(7);
    expect(rows(host)[0].textContent).toContain('All brands');
    expect(rows(host)[6].textContent).toContain('No brand');
  });

  it('gives All brands the brand count, each brand its channel count, disabled channels included, and No brand the channels in no brand', async () => {
    const host = await render();

    // the row's last line
    expect(
      rows(host).map(
        (node) => Array.from(node.querySelectorAll('span')).pop()?.textContent
      )
    ).toEqual([
      '5 brands',
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
    // A wide logo was a sliver on the page beside the square initials; it
    // fits inside the square, inset, on the tile an initial has. The spec
    // sees the classes, not the fit.
    expect(classes(logo!)).toEqual(
      expect.arrayContaining(['object-contain', 'bg-surface2'])
    );
    expect(classes(logo!).some((name) => /^p-\[\d+px\]$/.test(name))).toBe(
      true
    );

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

// Above 1025px with brands, the page opens on All brands (spec 059, US6,
// contracts/ui.md §7): a card per brand with what its kit has, New brand,
// and No brand while a channel is in none. The cards read the brands and
// the channel list the page has already loaded.
describe('the overview', () => {
  const live = (id: string): BrandImage => ({
    id,
    path: `https://media/${id}.png`,
    missing: false,
  });
  const deleted = (id: string): BrandImage => ({
    id,
    path: null,
    missing: true,
  });
  // Bayt Al Qahwa's kit is full; Client 2's too, with no channels; Client
  // 10's is empty; noor Dental has only a font, its logo, an example and
  // its About (spaces) gone or empty; Rawda Florist a colour and one
  // example still in Media of two.
  const KITS = [
    brand(RF.id, RF.name, null, {
      colours: ['#2E7D32'],
      examples: [live('e4'), deleted('e5')],
    }),
    brand('c10', 'Client 10'),
    brand(
      ND.id,
      ND.name,
      deleted('m2'),
      { bodyFont: 'Inter', examples: [deleted('e3')] },
      '   '
    ),
    brand(
      BQ.id,
      BQ.name,
      live('bq'),
      {
        colours: ['#6B3E26', '#F2E6D8'],
        headingFont: 'Cairo',
        examples: [live('e1'), live('e2')],
      },
      'Coffee roasted in Riyadh.'
    ),
    brand(
      'c2',
      'Client 2',
      live('c2'),
      { colours: ['#111111'], bodyFont: 'Inter', examples: [live('e6')] },
      'A client.'
    ),
  ];

  it('opens on the overview, All brands the first row after New brand with its grid mark and the brand count, marked current (FR-012)', async () => {
    const host = await render();

    expect(heading(host)?.textContent).toBe('All brands');
    expect(kit(host)).toBeNull();
    expect(topLine(host)).toBe(
      `5 brands · 3 channels not in a brand · ${USED_BY_EACH}`
    );

    const all = rows(host)[0];
    expect(all.textContent).toBe('All brands5 brands');
    const mark = all.querySelector('svg[data-icon="GridIcon"]')!.parentElement!;
    expect(classes(mark)).toEqual(
      expect.arrayContaining([
        'w-[32px]',
        'h-[32px]',
        'rounded-[8px]',
        'bg-surface',
        'border',
        'border-line',
        'text-brand',
      ])
    );
    expect(rows(host).map((node) => node.getAttribute('aria-current'))).toEqual(
      ['page', null, null, null, null, null, null]
    );
  });

  it('draws a card per brand A to Z with its mark, its name, its channels and kit count, five kit items and its note (FR-013)', async () => {
    mockBrands = KITS;
    const host = await render();
    const brandCards = cards(host).slice(0, 5);

    // in the grid, then New brand, then No brand
    expect(cards(host)).toHaveLength(7);
    expect(classes(cards(host)[0].parentElement!)).toEqual(
      expect.arrayContaining([
        'grid',
        'grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_32px)/3)),1fr))]',
        'gap-[16px]',
      ])
    );
    const names = brandCards.map((node) => node.querySelector('[title]')!);
    expect(names.map((node) => node.textContent)).toEqual([
      'Bayt Al Qahwa',
      'Client 2',
      'Client 10',
      'noor Dental',
      'Rawda Florist',
    ]);
    names.forEach((node) => {
      expect(node.getAttribute('title')).toBe(node.textContent);
      expect(node.getAttribute('dir')).toBe('auto');
      expect(classes(node)).toEqual(
        expect.arrayContaining(['truncate', 'text-[15px]', 'font-[600]'])
      );
    });

    // the logo while it is in Media, else the initial, at 44px
    const logo = brandCards[0].querySelector('img')!;
    expect(logo.getAttribute('src')).toBe('https://media/bq.png');
    expect(classes(logo)).toEqual(
      expect.arrayContaining(['w-[44px]', 'h-[44px]', 'rounded-[11px]'])
    );
    expect(brandCards[3].querySelector('img')).toBeNull();
    expect(brandCards[3].textContent?.startsWith('Nnoor Dental')).toBe(true);

    expect(brandCards.map(cardLine)).toEqual([
      '3 channels · kit 5 of 5',
      '0 channels · kit 5 of 5',
      '0 channels · kit 0 of 5',
      '2 channels · kit 1 of 5',
      '1 channel · kit 2 of 5',
    ]);
    expect(brandCards.map((node) => chips(node).map(chip))).toEqual([
      ['✓ Logo', '✓ Colours', '✓ Fonts', '✓ 2 of 3 examples', '✓ About'],
      ['✓ Logo', '✓ Colours', '✓ Fonts', '✓ 1 of 3 examples', '✓ About'],
      [
        'Logo (missing)',
        'Colours (missing)',
        'Fonts (missing)',
        'Examples (missing)',
        'About (missing)',
      ],
      [
        'Logo (missing)',
        'Colours (missing)',
        '✓ Fonts',
        'Examples (missing)',
        'About (missing)',
      ],
      [
        'Logo (missing)',
        '✓ Colours',
        'Fonts (missing)',
        '✓ 1 of 3 examples',
        'About (missing)',
      ],
    ]);
    expect(brandCards.map(note)).toEqual([
      'Ready: Samy and Studio use this kit',
      'No channels yet',
      'No channels yet',
      'Empty kit: Samy uses no look',
      null,
    ]);
  });

  it('draws a done item with a 12px tick and a missing one dashed, with a word for screen readers (FR-013)', async () => {
    mockBrands = KITS;
    const host = await render();
    const [logo, colours] = chips(card(host, 'noor Dental')!);
    const fonts = chips(card(host, 'noor Dental')!)[2];
    const look = [
      'inline-flex',
      'items-center',
      'gap-[4px]',
      'h-[24px]',
      'px-[8px]',
      'rounded-[6px]',
      'text-[12px]',
      'font-[500]',
    ];

    expect(classes(fonts)).toEqual(
      expect.arrayContaining([...look, 'bg-surface2', 'text-ink'])
    );
    // the tick ignores a size: its width and height set it
    const tick = fonts.querySelector('svg[data-icon="CheckmarkIcon"]')!;
    expect(tick.getAttribute('width')).toBe('12');
    expect(tick.getAttribute('height')).toBe('9');
    expect(tick.hasAttribute('size')).toBe(false);
    expect(classes(tick)).toContain('text-success');
    expect(fonts.querySelector('.sr-only')).toBeNull();

    for (const item of [logo, colours]) {
      expect(classes(item)).toEqual(
        expect.arrayContaining([
          ...look,
          'border',
          'border-dashed',
          'border-line',
          'text-muted',
        ])
      );
      expect(classes(item)).not.toContain('bg-surface2');
      expect(item.querySelector('svg')).toBeNull();
      expect(item.querySelector('.sr-only')?.textContent).toBe('missing');
    }
  });

  it("opens a brand's page from its card, marked in the list, and All brands comes back (FR-014)", async () => {
    const host = await render();

    await click(card(host, 'noor Dental'));
    expect(heading(host)?.textContent).toBe('noor Dental');
    expect(kit(host)?.getAttribute('data-brand')).toBe('nd');
    expect(rows(host).map((node) => node.getAttribute('aria-current'))).toEqual(
      [null, null, null, null, 'page', null, null]
    );

    await click(rows(host)[0]);
    expect(heading(host)?.textContent).toBe('All brands');
    expect(kit(host)).toBeNull();
    expect(rows(host)[0].getAttribute('aria-current')).toBe('page');
  });

  it('opens New brand from its dashed card, then the new brand (FR-015)', async () => {
    const host = await render();
    const add = cards(host).find((node) => node.textContent === 'New brand')!;

    expect(classes(add)).toEqual(
      expect.arrayContaining([
        'border-[1.5px]',
        'border-dashed',
        'border-line',
        'rounded-[12px]',
        'min-h-[150px]',
      ])
    );
    expect(add.querySelector('svg')).not.toBeNull();

    await click(add);
    expect(mockDialogs.openNewBrand).toHaveBeenCalledTimes(1);
    const onCreated = mockDialogs.openNewBrand.mock.calls[0][0];
    await act(async () => {
      onCreated('rf');
    });
    expect(heading(host)?.textContent).toBe('Rawda Florist');
  });

  it("shows the No brand card while a channel is in no brand, with its count, opening No brand's page (FR-015)", async () => {
    const host = await render();
    const none = card(host, 'No brand')!;

    expect(cards(host).indexOf(none)).toBe(6);
    expect(none.textContent).toBe(
      "No brand3 channelsThese channels post without a brand's look. Move one with its ⋯ in the Calendar."
    );
    expect(note(none)).toBe(
      "These channels post without a brand's look. Move one with its ⋯ in the Calendar."
    );
    expect(classes(none.querySelector('.border-dashed')!)).toEqual(
      expect.arrayContaining(['w-[44px]', 'h-[44px]', 'rounded-[11px]'])
    );

    await click(none);
    expect(heading(host)?.textContent).toBe('No brand');
    expect(row(host, 'No brand')!.getAttribute('aria-current')).toBe('page');
  });

  it('draws no No brand card while every channel is in a brand', async () => {
    mockChannels = CHANNELS.filter((item) => item.customer);
    const host = await render();

    expect(card(host, 'No brand')).toBeUndefined();
    expect(cards(host)).toHaveLength(6);
    expect(topLine(host)).toBe(`5 brands · ${USED_BY_EACH}`);
  });

  it('comes back once the open brand is deleted', async () => {
    const host = await render();

    await click(row(host, 'noor Dental'));
    expect(heading(host)?.textContent).toBe('noor Dental');

    mockBrands = BRANDS.filter((item) => item.id !== ND.id);
    await act(async () => {
      await revalidate('/brands');
    });
    await settle();

    expect(heading(host)?.textContent).toBe('All brands');
    expect(rows(host)[0].getAttribute('aria-current')).toBe('page');
    expect(card(host, 'noor Dental')).toBeUndefined();
  });

  it('gives every card 12px corners and the focus ring (FR-035, FR-046)', async () => {
    const host = await render();

    expect(cards(host)).toHaveLength(7);
    cards(host).forEach((node) => {
      expect(classes(node)).toEqual(
        expect.arrayContaining([
          'rounded-[12px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it("pads every card, New brand's too, 20px in, 16px at 1025px and below (spec 060, FR-022)", async () => {
    const host = await render();

    expect(cards(host)).toHaveLength(7);
    cards(host).forEach((node) => {
      expect(classes(node)).toEqual(
        expect.arrayContaining(['p-[20px]', 'mobile:p-[16px]'])
      );
      expect(classes(node)).not.toContain('p-[16px]');
    });
  });

  it("sits full width, 20px in from the page's card, 12px at 1025px and below, a brand's page too (spec 060, FR-001)", async () => {
    const host = await render();

    expect(classes(box(host))).toEqual(
      expect.arrayContaining(['p-[20px]', 'mobile:p-[12px]'])
    );
    OLD_BOX.forEach((name) => expect(classes(box(host))).not.toContain(name));

    await click(row(host, 'Bayt Al Qahwa'));
    expect(heading(host)?.textContent).toBe('Bayt Al Qahwa');
    expect(classes(box(host))).toEqual(
      expect.arrayContaining(['p-[20px]', 'mobile:p-[12px]'])
    );
    OLD_BOX.forEach((name) => expect(classes(box(host))).not.toContain(name));
  });

  it('asks for nothing beyond the brands and the channel list (FR-017)', async () => {
    await render();

    expect(new Set(mockFetch.mock.calls.map(([url]) => url))).toEqual(
      new Set(['/brands', '/integrations/list'])
    );
  });
});

describe("a brand's page", () => {
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

    await click(row(host, 'Bayt Al Qahwa'));
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

  it('offers Fill from my website beside Rename once the kit has something in it, and none while it is empty (FR-027)', async () => {
    const host = await render();

    // Bayt Al Qahwa has a logo
    await click(row(host, 'Bayt Al Qahwa'));
    const website = button(host, 'Fill from my website')!;
    expect(website.nextElementSibling).toBe(button(host, 'Rename'));
    await click(website);
    expect(mockOpenWebsite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bq' })
    );

    // Noor Dental's logo was deleted from Media: it still has its place
    await click(row(host, 'noor Dental'));
    expect(button(host, 'Fill from my website')).toBeDefined();

    // Rawda Florist's kit is empty: the kit shows the full card instead
    await click(row(host, 'Rawda Florist'));
    expect(button(host, 'Fill from my website')).toBeUndefined();
    expect(button(host, 'Rename')).toBeDefined();
  });

  it('gives Fill from my website and Rename 16px icons, as every text button has (spec 059, FR-026)', async () => {
    const host = await render();

    await click(row(host, 'Bayt Al Qahwa'));
    for (const label of ['Fill from my website', 'Rename']) {
      expect(
        button(host, label)!.querySelector('svg')?.getAttribute('width')
      ).toBe('16');
    }
  });

  it('offers no Fill from my website while the server has no web lookup (FIRECRAWL_API_KEY unset)', async () => {
    mockVariables.websiteLookup = false;
    const host = await render();

    // Bayt Al Qahwa has a logo
    await click(row(host, 'Bayt Al Qahwa'));
    expect(heading(host)?.textContent).toBe('Bayt Al Qahwa');
    expect(button(host, 'Fill from my website')).toBeUndefined();
    expect(button(host, 'Rename')).toBeDefined();
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

describe("while the brands don't load", () => {
  beforeEach(() => {
    // a 500 comes back with a JSON body; SWR asks again for the brands later
    mockFetch.mockImplementation(async (url: string) =>
      url === '/brands'
        ? {
            ok: false,
            status: 500,
            json: async () => ({
              statusCode: 500,
              message: 'Internal server error',
            }),
          }
        : answer({ integrations: mockChannels })
    );
  });

  it('shows the page loading, never that there are no brands', async () => {
    const host = await render();

    expect(mockFetch).toHaveBeenCalledWith('/brands');
    expect(host.querySelector('[data-testid="loading"]')).not.toBeNull();
    expect(list(host)).toBeNull();
    expect(host.textContent).not.toContain('No brands yet.');
    expect(heading(host)).toBeNull();
    expect(button(host, 'New brand')).toBeUndefined();
  });
});

describe('at 1025px and below', () => {
  beforeEach(() => {
    smallWindow = true;
  });

  it('has no All brands row and no overview, as before (spec 059, FR-016)', async () => {
    const host = await render();

    expect(rows(host)).toHaveLength(6);
    expect(host.textContent).not.toContain('All brands');
    expect(cards(host)).toEqual([]);

    await click(row(host, 'Bayt Al Qahwa'));
    await click(button(host, 'Brands'));
    expect(host.textContent).not.toContain('All brands');
    expect(heading(host)).toBeNull();
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

  it('puts Fill from my website in the ⋯ with Rename, once the kit has something in it', async () => {
    const host = await render();
    const options = () =>
      Array.from(host.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent
      );

    await click(row(host, 'Bayt Al Qahwa'));
    expect(classes(button(host, 'Fill from my website')!)).toContain(
      'mobile:hidden'
    );
    await click(button(host, 'Brand options'));
    expect(options()).toEqual([
      'Rename',
      'Fill from my website',
      'Delete brand',
    ]);
    await click(host.querySelectorAll('[role="menuitem"]')[1]);
    expect(mockOpenWebsite).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bq' })
    );

    await click(button(host, 'Brands'));
    await click(row(host, 'Rawda Florist'));
    await click(button(host, 'Brand options'));
    expect(options()).toEqual(['Rename', 'Delete brand']);
  });

  it('leaves Fill from my website out of the ⋯ while the server has no web lookup', async () => {
    mockVariables.websiteLookup = false;
    const host = await render();

    await click(row(host, 'Bayt Al Qahwa'));
    await click(button(host, 'Brand options'));

    expect(
      Array.from(host.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent
      )
    ).toEqual(['Rename', 'Delete brand']);
  });

  it("insets the list 12px at each side, on the page's gutter (spec 060, FR-001)", async () => {
    const host = await render();

    expect(box(host).contains(list(host))).toBe(true);
    expect(classes(box(host))).toEqual(['px-[12px]', 'pb-[20px]']);
  });

  it("starts a brand's page with its link back on the page's gutter, no negative margins (spec 060, FR-004)", async () => {
    const host = await render();

    await click(row(host, 'Bayt Al Qahwa'));

    expect(classes(box(host))).toEqual(
      expect.arrayContaining(['p-[20px]', 'mobile:p-[12px]'])
    );
    const back = classes(button(host, 'Brands')!);
    expect(back).toEqual(expect.arrayContaining(['h-[44px]', 'px-[6px]']));
    expect(back).not.toContain('-my-[8px]');
    expect(back).not.toContain('-ms-[6px]');
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
    // All brands counts the brands
    expect(
      Array.from(rows(host)[0].querySelectorAll('span')).pop()?.textContent
    ).toBe('5 علامات');
    // each row after it: the initial when there is no logo, the name, the
    // count
    expect(
      rows(host)
        .slice(1)
        .map((node) => node.textContent)
    ).toEqual([
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
    await click(row(host, 'Bayt Al Qahwa'));
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
