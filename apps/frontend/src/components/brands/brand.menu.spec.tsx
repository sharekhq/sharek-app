import { act, ComponentProps, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// The brand list (spec 053, US4 scenarios 4, 6 and 8, FR-023 and FR-026;
// boards BrandMenu and SamyPhoneSheet; contracts/pages-ui.md part 2), shared
// by Samy's brand chip and the AI image dialog's Brand field: a button that
// opens the brands A to Z, each with its logo or initial, its name and its
// channel count, a ✓ on the current choice; No brand and what it means;
// Manage brands to the Brands page. A pick that spans brands adds Each
// channel's brand first. Titled for a message or for an image. Arrows move,
// Enter picks, Escape closes. At 1025px and below it opens as the channel
// sheet does (SplitPanel). Nothing in it animates, under reduced motion too.
//
// t() is the real i18next on the en and ar files, so a count renders the
// plural form each language picks. The test DOM has no layout: placement and
// sizes are pinned by the classes and styles that carry them.

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: mockChannels }),
  })
);
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import i18next from 'i18next';
import {
  MOBILE_QUERY,
  REDUCED_MOTION_QUERY,
} from '@gitroom/react/helpers/use.media.query';
import type { Brand } from '@gitroom/frontend/components/brands/use.brands';
import { BrandMenu } from '@gitroom/frontend/components/brands/brand.menu';

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

// Not in the order the list shows them. Noor Dental's logo was deleted from
// Media; Rawda Florist has none.
const BRANDS = [
  brand('rf', 'Rawda Florist'),
  brand('nd', 'Noor Dental', { id: 'm2', path: null, missing: true }),
  brand('bq', 'Bayt Al Qahwa', {
    id: 'm1',
    path: 'https://media/bq.png',
    missing: false,
  }),
];
// The channel list the counts come from: Bayt Al Qahwa's three channels,
// Noor Dental's two, Rawda Florist's one, and one in no brand.
const mockChannels = [
  ['ig', 'bq'],
  ['fb', 'bq'],
  ['x', 'bq'],
  ['li', 'nd'],
  ['yt', 'nd'],
  ['pin', 'rf'],
  ['tt', null],
].map(([id, customer]) => ({
  id,
  customer: customer && { id: customer, name: customer },
}));

const LABEL = 'Brand for this message: Bayt Al Qahwa. Change brand';

// The window, as the media queries report it: wider than 1025px and with
// motion unless a case says otherwise.
const realMatchMedia = window.matchMedia;
let smallWindow = false;
let reducedMotion = false;

const onPick = jest.fn();
const mounted: Root[] = [];

beforeEach(() => {
  smallWindow = false;
  reducedMotion = false;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return (
        (smallWindow && query === MOBILE_QUERY) ||
        (reducedMotion && query === REDUCED_MOTION_QUERY)
      );
    },
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

const render = async (
  props: Partial<ComponentProps<typeof BrandMenu>> = {}
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <BrandMenu
        brands={BRANDS}
        value="bq"
        variant="message"
        onPick={onPick}
        label={LABEL}
        trigger={<span>Bayt Al Qahwa</span>}
        triggerClassName="chip"
        {...props}
      />
    );
  });
  return host;
};

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const press = async (node: Element | null | undefined, key: string) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

const trigger = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('button[aria-haspopup="listbox"]')!;
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () =>
  Array.from(listbox()!.querySelectorAll<HTMLElement>('[role="option"]'));
const option = (text: string) =>
  options().find((node) => node.textContent?.includes(text));
// The ✓ sits at the end of its row, beside the mark and the words.
const ticked = (node: HTMLElement) =>
  Array.from(node.children).some((child) => child.tagName === 'svg');
const manage = () =>
  document.querySelector<HTMLAnchorElement>('a[href="/brands"]');
const open = async (props: Partial<ComponentProps<typeof BrandMenu>> = {}) => {
  const host = await render(props);
  await click(trigger(host));
  return host;
};
const classes = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// A class on a physical side, which stays put when Arabic flips the page.
const physical = (name: string) =>
  /^(?:[^:]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-|$)/.test(
    name
  );
// The tallest a class lets the element be at its smallest, in px.
const minHeight = (node: Element) =>
  Math.max(
    0,
    ...classes(node).map(
      (name) => Number(/^min-h-\[(\d+)px\]$/.exec(name)?.[1]) || 0
    )
  );

describe('the button', () => {
  it('shows what it is given, named by its label, with the list closed', async () => {
    const host = await render();
    const button = trigger(host);

    expect(button.textContent).toBe('Bayt Al Qahwa');
    expect(button.getAttribute('aria-label')).toBe(LABEL);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('type')).toBe('button');
    expect(classes(button)).toContain('chip');
    expect(listbox()).toBeNull();
  });

  it('opens the list on click, and closes it on a second', async () => {
    const host = await open();

    expect(trigger(host).getAttribute('aria-expanded')).toBe('true');
    expect(listbox()).toBeTruthy();

    await click(trigger(host));
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
    expect(listbox()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('the list', () => {
  it('is titled for a message', async () => {
    await open();

    expect(listbox()!.getAttribute('aria-label')).toBe(
      'Brand for this message'
    );
    expect(document.body.textContent).toContain('Brand for this message');
  });

  it('is titled for an image in the image variant', async () => {
    await open({ variant: 'image' });

    expect(listbox()!.getAttribute('aria-label')).toBe('Brand for this image');
    expect(document.body.textContent).toContain('Brand for this image');
    expect(document.body.textContent).not.toContain('Brand for this message');
  });

  it('lists the brands A to Z, then No brand', async () => {
    await open();

    expect(
      Array.from(listbox()!.querySelectorAll('[dir="auto"]')).map(
        (node) => node.textContent
      )
    ).toEqual(['Bayt Al Qahwa', 'Noor Dental', 'Rawda Florist']);
    expect(options()).toHaveLength(4);
    expect(options()[3].textContent).toContain('No brand');
  });

  it('gives each brand its logo, or its initial when it has none or it was deleted from Media, and its channel count', async () => {
    await open();

    const logo = option('Bayt Al Qahwa')!.querySelector('img');
    expect(logo?.getAttribute('src')).toBe('https://media/bq.png');
    // the name beside it names the row
    expect(logo?.getAttribute('alt')).toBe('');
    expect(option('Bayt Al Qahwa')!.textContent).toContain('3 channels');

    expect(option('Noor Dental')!.querySelector('img')).toBeNull();
    expect(option('Noor Dental')!.textContent).toBe('NNoor Dental2 channels');
    expect(option('Rawda Florist')!.querySelector('img')).toBeNull();
    expect(option('Rawda Florist')!.textContent).toBe(
      'RRawda Florist1 channel'
    );
  });

  it('describes No brand', async () => {
    await open();

    expect(option('No brand')!.textContent).toBe(
      'No brandSends no logo, examples or colours'
    );
  });

  it('marks the current brand with a ✓, and only that one', async () => {
    await open({ value: 'nd' });

    expect(options().map((node) => node.getAttribute('aria-selected'))).toEqual(
      ['false', 'true', 'false', 'false']
    );
    expect(options().map(ticked)).toEqual([false, true, false, false]);
  });

  it('marks No brand when it is the choice', async () => {
    await open({ value: 'none' });

    expect(option('No brand')!.getAttribute('aria-selected')).toBe('true');
    expect(ticked(option('No brand')!)).toBe(true);
    expect(options().filter(ticked)).toHaveLength(1);
  });

  it('marks nothing while no choice is made, or the chosen brand is gone', async () => {
    await open({ value: undefined });
    expect(options().some(ticked)).toBe(false);
    expect(
      options().every((node) => node.getAttribute('aria-selected') === 'false')
    ).toBe(true);
  });

  // In the tab the list is in, unless a caller asks for a new one.
  it('links Manage brands to the Brands page, outside the options', async () => {
    await open();

    expect(manage()?.textContent).toBe('Manage brands');
    expect(listbox()!.contains(manage())).toBe(false);
    expect(manage()!.hasAttribute('target')).toBe(false);
  });

  it('closes when Manage brands is followed', async () => {
    await open();

    await click(manage());
    expect(listbox()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  // The AI image dialog asks for it, so the dialog, and a post editor under
  // it, stay open with everything in them, and Samy's chip, so a message half
  // typed in the box stays.
  it('opens the Brands page in a new tab when asked, closing the list', async () => {
    await open({ manageInNewTab: true });

    expect(manage()?.getAttribute('target')).toBe('_blank');
    expect(manage()?.getAttribute('rel')).toBe('noreferrer');

    await click(manage());
    expect(listbox()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("offers no Each channel's brand unless the pick spans brands", async () => {
    await open();

    expect(document.body.textContent).not.toContain("Each channel's brand");
  });

  it("offers Each channel's brand first for a pick from two brands, with their logos", async () => {
    await open({ each: ['bq', 'rf'], value: 'each' });

    // Bayt Al Qahwa's logo, then Rawda Florist's initial
    const each = options()[0];
    expect(each.textContent).toBe(
      "REach channel's brandOne image per brand, a credit each"
    );
    expect(each.querySelector('img')?.getAttribute('src')).toBe(
      'https://media/bq.png'
    );
    expect(each.getAttribute('aria-selected')).toBe('true');
    expect(ticked(each)).toBe(true);
    expect(options()).toHaveLength(5);
    expect(options().filter(ticked)).toHaveLength(1);
  });
});

describe('picking', () => {
  it('hands the brand on, closes, and gives the focus back to the button', async () => {
    const host = await open();

    await click(option('Noor Dental'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('nd');
    expect(listbox()).toBeNull();
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger(host));
  });

  it('hands on none for No brand', async () => {
    await open();

    await click(option('No brand'));
    expect(onPick).toHaveBeenCalledWith('none');
  });

  it("hands on each for Each channel's brand", async () => {
    await open({ each: ['bq', 'rf'] });

    await click(option("Each channel's brand"));
    expect(onPick).toHaveBeenCalledWith('each');
  });

  it('closes on a press elsewhere without picking', async () => {
    await open();

    // useClickOutside listens on mousedown and touchstart
    await act(async () => {
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true })
      );
    });

    expect(listbox()).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('the keyboard', () => {
  it('opens with the focus on the current choice', async () => {
    await open({ value: 'rf' });

    expect(document.activeElement).toBe(option('Rawda Florist'));
  });

  it('opens with the focus on the first option while there is no choice', async () => {
    await open({ value: undefined, each: ['bq', 'rf'] });

    expect(document.activeElement).toBe(option("Each channel's brand"));
  });

  it('moves down and up through the options with the arrows, wrapping', async () => {
    await open({ value: 'rf' });

    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('No brand'));
    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('Bayt Al Qahwa'));
    await press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(option('No brand'));
    await press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(option('Rawda Florist'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('picks the option with the focus on Enter', async () => {
    await open({ value: 'bq' });

    await press(document.activeElement, 'ArrowDown');
    await press(document.activeElement, 'Enter');

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('nd');
    expect(listbox()).toBeNull();
  });

  it('closes on Escape, gives the focus back to the button, and keeps the key to itself', async () => {
    const documentEscape = jest.fn();
    document.addEventListener('keydown', documentEscape);
    const host = await open();

    await press(document.activeElement, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(trigger(host));
    expect(documentEscape).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('on a wide screen', () => {
  // the open list's surface: the title, the options and Manage brands
  const surface = () => listbox()!.parentElement!;

  it('opens against the viewport, so a box that clips its content cannot hide it', async () => {
    await open();

    expect(classes(surface())).toContain('fixed');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // As the post's ⋯ menu (PostActionsMenu) and the launches menu cast it:
  // the shadow of a list that opens from a button, not a card's.
  it('casts the shadow of the lists that open from a button', async () => {
    await open();

    expect(classes(surface())).toContain('shadow-menu');
    expect(classes(surface())).not.toContain('shadow-card');
  });

  it('opens above a button near the bottom of the screen, clear of it', async () => {
    const HEIGHT = 300;
    const bottom = window.innerHeight - 20;
    // happy-dom lays nothing out: the button's box answers the box it is
    // given, and the list a 300px box wherever its `top` puts it.
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const list = this === listbox()?.parentElement;
        const top = list ? parseFloat(this.style.top) || 0 : bottom - 44;
        const height = list ? HEIGHT : 44;
        return {
          top,
          bottom: top + height,
          height,
          left: 20,
          right: 320,
          width: 300,
          x: 20,
          y: top,
          toJSON: () => undefined,
        };
      });
    await open();

    expect(parseFloat(surface().style.top) + HEIGHT).toBe(bottom - 44 - 4);
  });

  it('closes on a scroll of the page, but not on a scroll of its own list', async () => {
    await open();

    await act(async () => {
      surface().dispatchEvent(new Event('scroll'));
    });
    expect(listbox()).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(listbox()).toBeNull();
  });
});

describe('at 1025px and below', () => {
  beforeEach(() => {
    smallWindow = true;
  });

  const sheet = () =>
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');

  it('opens as a bottom sheet, as the channel sheet does, named by its title', async () => {
    await open();

    expect(sheet()).toBeTruthy();
    expect(sheet()!.getAttribute('aria-label')).toBe('Brand for this message');
    expect(sheet()!.contains(listbox())).toBe(true);
    expect(sheet()!.contains(manage())).toBe(true);
    // SplitPanel's sheet: from the bottom of the screen, its top corners round
    expect(classes(sheet()!)).toEqual(
      expect.arrayContaining([
        'mobile:fixed',
        'mobile:bottom-0',
        'mobile:rounded-t-[16px]',
      ])
    );
  });

  it('gives each row a 56px row on the sheet, as the board does', async () => {
    await open();

    expect(options().map(minHeight)).toEqual([56, 56, 56, 56]);
  });

  it('closes on the scrim without picking', async () => {
    const host = await open();

    await click(sheet()!.nextElementSibling);

    expect(sheet()).toBeNull();
    expect(trigger(host).getAttribute('aria-expanded')).toBe('false');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('hands the pick on and closes', async () => {
    await open();

    await click(option('Rawda Florist'));

    expect(onPick).toHaveBeenCalledWith('rf');
    expect(sheet()).toBeNull();
  });
});

describe('under reduced motion', () => {
  beforeEach(() => {
    reducedMotion = true;
  });

  const animated = (host: HTMLElement) =>
    [host, ...Array.from(host.querySelectorAll('*'))].filter((node) =>
      classes(node).some((name) => /(?:^|:)animate-/.test(name))
    );

  it('opens the list without animation', async () => {
    const host = await open();

    expect(listbox()).toBeTruthy();
    expect(animated(host)).toEqual([]);
  });

  it('opens the sheet and its scrim without animation', async () => {
    smallWindow = true;
    const host = await open();

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(animated(host)).toEqual([]);
  });
});

describe('the look', () => {
  it('rings what takes the focus, in the app’s ring', async () => {
    await open();

    [...options(), manage()!].forEach((node) => {
      expect(classes(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it('gives every row and Manage brands a 44px target at least', async () => {
    await open({ each: ['bq', 'rf'] });

    [...options(), manage()!].forEach((node) => {
      expect(minHeight(node)).toBeGreaterThanOrEqual(44);
    });
  });

  it('uses no physical-side classes, so it mirrors in Arabic', async () => {
    const host = await open({ each: ['bq', 'rf'] });

    const nodes = [host, ...Array.from(host.querySelectorAll('*'))];
    expect(nodes.flatMap((node) => classes(node).filter(physical))).toEqual([]);
  });

  it('reads in Arabic, its counts in the forms Arabic picks', async () => {
    await i18next.changeLanguage('ar');
    await open();

    expect(listbox()!.getAttribute('aria-label')).toBe(
      'العلامة التجارية لهذه الرسالة'
    );
    expect(option('Bayt Al Qahwa')!.textContent).toContain('3 قنوات');
    expect(option('Noor Dental')!.textContent).toContain('قناتان');
    expect(option('Rawda Florist')!.textContent).toContain('قناة واحدة');
    expect(option('بلا علامة تجارية')!.textContent).toContain(
      'لا يرسل شعارًا ولا منشورات نموذجية ولا ألوانًا'
    );
    expect(manage()!.textContent).toBe('إدارة العلامات التجارية');
  });
});
