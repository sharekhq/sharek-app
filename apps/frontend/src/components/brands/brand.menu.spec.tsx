import { act, ComponentProps, createRef, ReactNode } from 'react';
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
// The channel list, a jest.fn so a case can tell whether anything asked for
// it, its reload a spy.
const mockIntegrationList = jest.fn();
const mockReloadChannels = jest.fn();
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => mockIntegrationList(),
  })
);
// What Move to brand sends and says: the requests and their answers, and the
// toasts. Moving runs for real (useMoveChannels) on them.
const mockRequest = jest.fn();
const mockToast = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockRequest,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
// GET /brands, a jest.fn so a case can tell whether it was asked for.
const mockUseBrands = jest.fn();
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
  ...jest.requireActual('@gitroom/frontend/components/brands/use.brands'),
  useBrands: () => mockUseBrands(),
}));
// New brand, whose window and creation brand.dialogs.spec pins: what Move to
// brand opens it with.
const mockOpenNewBrand = jest.fn();
jest.mock('@gitroom/frontend/components/brands/brand.dialogs', () => ({
  useBrandDialogs: () => ({ openNewBrand: mockOpenNewBrand }),
}));
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
import type { Channel } from '@gitroom/frontend/components/launches/channel.panel';
import type { PostActionsMenuHandle } from '@gitroom/frontend/components/launches/post.actions.menu';
import {
  BrandMenu,
  MoveToBrandMenu,
} from '@gitroom/frontend/components/brands/brand.menu';

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
  mockIntegrationList.mockImplementation(() => ({
    data: mockChannels,
    mutate: mockReloadChannels,
  }));
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
// The z-index a class gives the element.
const zIndex = (node: Element) =>
  Math.max(
    0,
    ...classes(node).map((name) => Number(/^z-\[(\d+)\]$/.exec(name)?.[1]) || 0)
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

  // In a new tab, from either caller: the AI image dialog, and a post editor
  // under it, stay open with everything in them, and a message half typed in
  // Samy's box stays.
  it('links Manage brands to the Brands page in a new tab, outside the options', async () => {
    await open();

    expect(manage()?.textContent).toBe('Manage brands');
    expect(listbox()!.contains(manage())).toBe(false);
    expect(manage()?.getAttribute('target')).toBe('_blank');
    expect(manage()?.getAttribute('rel')).toBe('noreferrer');
  });

  it('closes when Manage brands is followed', async () => {
    await open();

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

  // A press comes before the click that picks, so a press in the list must
  // not close it, wherever the list renders.
  it('stays open on a press in the list', async () => {
    await open();

    await act(async () => {
      option('Noor Dental')!.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true })
      );
    });

    expect(listbox()).toBeTruthy();
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

  // On Samy's page the button sits in boxes that clip their content and can
  // scroll (the layout's blurMe wrapper), a browser scrolls such boxes to show
  // what takes the focus unless told not to, and the list closes on a scroll
  // outside it. happy-dom scrolls nothing, so here the focus scrolls the box
  // around the button as a browser's does.
  it('opens with the focus on a choice without scrolling the boxes around the button, so it stays open', async () => {
    const host = await render();
    const focus = HTMLElement.prototype.focus;
    jest
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
        focus.call(this, options);
        if (!options?.preventScroll) {
          host.dispatchEvent(new Event('scroll'));
        }
      });

    await click(trigger(host));

    expect(listbox()).toBeTruthy();
    expect(document.activeElement).toBe(option('Bayt Al Qahwa'));
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

  // The list renders into the body, after the rest of the page, so a Tab
  // from it would leave the page: Tab and Shift+Tab close it, as a menu
  // does, and give the focus back to the button.
  it.each([
    ['Tab from the last option', 'No brand', false],
    ['Shift+Tab from the first option', 'Bayt Al Qahwa', true],
  ])(
    'closes on %s and gives the focus back to the button',
    async (_name, from, shiftKey) => {
      const host = await open();
      option(from)!.focus();

      await act(async () => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true })
        );
      });

      expect(listbox()).toBeNull();
      expect(document.activeElement).toBe(trigger(host));
      expect(onPick).not.toHaveBeenCalled();
    }
  );
});

describe('on a wide screen', () => {
  // the open list's surface: the title, the options and Manage brands
  const surface = () => listbox()!.parentElement!;

  it('opens against the viewport, so a box that clips its content cannot hide it', async () => {
    await open();

    expect(classes(surface())).toContain('fixed');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  // `fixed` measures from a transformed ancestor, not the viewport, and
  // Samy's chat is one (`trz`, agent.chat.tsx): there the list painted off by
  // the chat's own offset. Out of the button's tree it hangs where it is put
  // wherever the button sits, and over the modals (200 and up,
  // new-modal.tsx), the AI image dialog among them, which it no longer
  // renders inside. happy-dom lays nothing out, so where the list renders is
  // what pins it.
  it('renders into the body, out of the button’s tree, over the modals', async () => {
    const host = await open();

    expect(surface().parentElement?.tagName).toBe('BODY');
    expect(host.contains(listbox())).toBe(false);
    expect(zIndex(surface())).toBeGreaterThan(200);
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

  // the list renders into the body, outside the button's host
  it('opens the list without animation', async () => {
    await open();

    expect(listbox()).toBeTruthy();
    expect(animated(document.body)).toEqual([]);
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
    await open({ each: ['bq', 'rf'] });

    // the button's host and the list, which renders into the body
    const nodes = Array.from(document.body.querySelectorAll('*'));
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

// Move to brand (spec 058, US1 and US2, FR-006 to FR-018; contracts/ui.md
// "The Move list"), from the channel ⋯ menu: the same list, held in a box
// laid over the ⋯ and opened through its handle, titled for the channel. Every
// brand GET /brands gives, one with no channels too, then No brand, which
// says what it means here, then + New brand in place of Manage brands. A pick
// moves the channel on PUT /integrations/:id/group, the brand's id or '' for
// No brand, and reloads the channel list; the ✓ choice sends nothing.
describe('MoveToBrandMenu', () => {
  // Bayt Al Qahwa's two channels, one disabled, Rawda Florist's one, Al Waha
  // none yet, and one channel in no brand.
  const CHANNEL: Channel = {
    id: 'ig',
    internalId: 'ig-1',
    name: 'Coffee & Co',
    identifier: 'instagram',
    type: 'social',
    customer: { id: 'bq', name: 'Bayt Al Qahwa' },
  };
  const LOOSE: Channel = {
    id: 'tt',
    internalId: 'tt-1',
    name: 'Qahwa TikTok',
    identifier: 'tiktok',
    type: 'social',
    customer: null,
  };
  const CHANNELS: Channel[] = [
    CHANNEL,
    {
      ...CHANNEL,
      id: 'fb',
      internalId: 'fb-1',
      identifier: 'facebook',
      disabled: true,
    },
    {
      ...LOOSE,
      id: 'pin',
      internalId: 'pin-1',
      identifier: 'pinterest',
      customer: { id: 'rf', name: 'Rawda Florist' },
    },
    LOOSE,
  ];
  // Not in the order the list shows them.
  const MOVE_BRANDS = [
    brand('rf', 'Rawda Florist'),
    brand('aw', 'Al Waha'),
    brand('bq', 'Bayt Al Qahwa', {
      id: 'm1',
      path: 'https://media/bq.png',
      missing: false,
    }),
  ];
  const TITLE = 'Move ⁨Coffee & Co⁩ to';

  beforeEach(() => {
    mockUseBrands.mockImplementation(() => ({
      data: MOVE_BRANDS,
      mutate: jest.fn(),
    }));
    mockIntegrationList.mockImplementation(() => ({
      data: CHANNELS,
      mutate: mockReloadChannels,
    }));
    mockRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
  });

  // The channel ⋯ menu's outer box, relative, with its ⋯ button and the held
  // box after it, as menu.tsx renders them.
  const renderMove = async (channel = CHANNEL) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    const handle = createRef<PostActionsMenuHandle>();
    const button = createRef<HTMLButtonElement>();
    await act(async () => {
      root.render(
        <div className="relative">
          <button ref={button} type="button" aria-haspopup="menu">
            ⋯
          </button>
          <MoveToBrandMenu ref={handle} channel={channel} button={button} />
        </div>
      );
    });
    return {
      host,
      handle,
      button: () => button.current!,
      box: () => host.firstElementChild!.lastElementChild as HTMLElement,
    };
  };
  const openMove = async (channel = CHANNEL) => {
    const move = await renderMove(channel);
    await act(async () => {
      move.handle.current!.open();
    });
    return move;
  };

  const newBrand = () =>
    Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent === 'New brand'
    );
  const sheet = () =>
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  // The requests sent to a route, as [method, body].
  const sent = (url: string) =>
    mockRequest.mock.calls
      .filter(([called]) => called === url)
      .map(([, init]) => [init.method, JSON.parse(init.body)]);

  it('loads nothing before it opens, and renders only a box that lets the ⋯ take every press', async () => {
    const move = await renderMove();

    expect(mockUseBrands).not.toHaveBeenCalled();
    expect(mockIntegrationList).not.toHaveBeenCalled();
    expect(classes(move.box())).toEqual([
      'absolute',
      'inset-0',
      'pointer-events-none',
    ]);
    expect(move.box().children).toHaveLength(0);
    expect(move.box().hasAttribute('data-open')).toBe(false);
    expect(listbox()).toBeNull();
  });

  it('opens through its handle, hanging the list from its box, the list in a box that takes presses, and marks the box open', async () => {
    // happy-dom lays nothing out: the box over the ⋯ answers a place, every
    // other element an empty box
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const box = this.classList.contains('pointer-events-none');
        return {
          top: box ? 50 : 0,
          bottom: box ? 86 : 0,
          height: box ? 36 : 0,
          left: box ? 100 : 0,
          right: box ? 136 : 0,
          width: box ? 36 : 0,
          x: box ? 100 : 0,
          y: box ? 50 : 0,
          toJSON: () => undefined,
        };
      });
    const move = await openMove();

    expect(listbox()).toBeTruthy();
    expect(move.box().getAttribute('data-open')).toBe('');
    expect(move.box().children).toHaveLength(1);
    expect(classes(move.box().firstElementChild!)).toEqual([
      'pointer-events-auto',
    ]);
    // on a wide screen, in the body against the viewport, under the box
    const surface = listbox()!.parentElement!;
    expect(surface.parentElement?.tagName).toBe('BODY');
    expect(classes(surface)).toContain('fixed');
    expect(surface.style.left).toBe('100px');
    expect(surface.style.top).toBe('90px');
  });

  it('is titled Move {channel} to, the name isolated and as typed, and the title names the list', async () => {
    await openMove();

    expect(listbox()!.getAttribute('aria-label')).toBe(TITLE);
    expect(document.body.textContent).toContain(TITLE);
  });

  it('lists every brand A to Z, one with no channels too, each with its mark and its count, disabled channels counted; then No brand, then + New brand', async () => {
    await openMove();

    expect(
      Array.from(listbox()!.querySelectorAll('[dir="auto"]')).map(
        (node) => node.textContent
      )
    ).toEqual(['Al Waha', 'Bayt Al Qahwa', 'Rawda Florist']);
    expect(options().map((node) => node.textContent)).toEqual([
      'AAl Waha0 channels',
      'Bayt Al Qahwa2 channels',
      'RRawda Florist1 channel',
      'No brandListed on its own, outside any brand',
    ]);
    expect(
      option('Bayt Al Qahwa')!.querySelector('img')?.getAttribute('src')
    ).toBe('https://media/bq.png');
    expect(manage()).toBeNull();

    const button = newBrand()!;
    expect(button.getAttribute('type')).toBe('button');
    expect(listbox()!.contains(button)).toBe(false);
    expect(
      listbox()!.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // PlusIcon
    expect(button.querySelector('svg path')?.getAttribute('d')).toBe(
      'M8.00065 3.33301V12.6663M3.33398 7.99967H12.6673'
    );
    expect(classes(button)).toEqual(
      expect.arrayContaining([
        'text-brandText',
        'min-h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  it.each([
    ['its brand', CHANNEL, 'Bayt Al Qahwa'],
    ['No brand, for a channel in none', LOOSE, 'No brand'],
  ])('puts the ✓ on %s', async (_, channel, current) => {
    await openMove(channel);

    expect(
      options()
        .filter((node) => node.getAttribute('aria-selected') === 'true')
        .map((node) => node.textContent)
    ).toEqual([expect.stringContaining(current)]);
    expect(options().filter(ticked)).toEqual([option(current)]);
  });

  it.each([
    ['Rawda Florist', 'rf'],
    ['Al Waha', 'aw'],
    ['No brand', ''],
  ])(
    'a pick of %s closes the list, moves the channel, then reloads the channel list',
    async (name, group) => {
      const move = await openMove();

      await click(option(name));

      expect(listbox()).toBeNull();
      expect(move.box().hasAttribute('data-open')).toBe(false);
      expect(sent('/integrations/ig/group')).toEqual([['PUT', { group }]]);
      expect(mockRequest).toHaveBeenCalledTimes(1);
      expect(mockReloadChannels).toHaveBeenCalledTimes(1);
      expect(mockReloadChannels.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockRequest.mock.invocationCallOrder[0]
      );
      expect(mockToast).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['its brand', CHANNEL, 'Bayt Al Qahwa'],
    ['No brand, for a channel in none', LOOSE, 'No brand'],
  ])(
    'a pick of the ✓ choice, %s, closes the list, gives the focus back to the ⋯ and sends nothing',
    async (_, channel, current) => {
      const move = await openMove(channel);

      await click(option(current));

      expect(listbox()).toBeNull();
      expect(document.activeElement).toBe(move.button());
      expect(mockRequest).not.toHaveBeenCalled();
      expect(mockReloadChannels).not.toHaveBeenCalled();
    }
  );

  it('a refused move says so in the server’s words, and the channel list reloads', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Integration not found' }),
    });
    await openMove();

    await click(option('Rawda Florist'));

    expect(mockToast).toHaveBeenCalledWith('Integration not found', 'warning');
    expect(mockReloadChannels).toHaveBeenCalledTimes(1);
  });

  it('+ New brand closes the list and opens New brand with the channel, whose creation moves the channel into it', async () => {
    const move = await openMove();

    await click(newBrand());

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(move.button());
    expect(mockOpenNewBrand).toHaveBeenCalledTimes(1);
    expect(mockOpenNewBrand).toHaveBeenCalledWith(
      expect.any(Function),
      CHANNEL
    );
    expect(mockRequest).not.toHaveBeenCalled();

    // what New brand does once POST /brands answers the new brand's id
    await act(async () => {
      mockOpenNewBrand.mock.calls[0][0]('b9');
    });

    expect(sent('/integrations/ig/group')).toEqual([['PUT', { group: 'b9' }]]);
    expect(mockReloadChannels).toHaveBeenCalledTimes(1);
  });

  it('a move refused once New brand has created the brand says so, and the brand stays', async () => {
    mockRequest.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: ['group must be a string'] }),
    });
    await openMove();
    await click(newBrand());

    await act(async () => {
      mockOpenNewBrand.mock.calls[0][0]('b9');
    });

    expect(mockToast).toHaveBeenCalledWith('group must be a string', 'warning');
    // nothing else is sent: no delete of the brand just made
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('opens with the focus on the ✓ choice; the arrows move and Enter picks', async () => {
    await openMove();

    expect(document.activeElement).toBe(option('Bayt Al Qahwa'));
    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('Rawda Florist'));
    await press(document.activeElement, 'ArrowUp');
    await press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(option('Al Waha'));
    await press(document.activeElement, 'Enter');

    expect(listbox()).toBeNull();
    expect(sent('/integrations/ig/group')).toEqual([['PUT', { group: 'aw' }]]);
  });

  it('closes on Escape, keeps the key from the document and gives the focus back to the ⋯', async () => {
    const documentEscape = jest.fn();
    document.addEventListener('keydown', documentEscape);
    const move = await openMove();

    await press(document.activeElement, 'Escape');
    document.removeEventListener('keydown', documentEscape);

    expect(listbox()).toBeNull();
    expect(move.box().hasAttribute('data-open')).toBe(false);
    expect(documentEscape).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(move.button());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('closes on Tab from the list in the body and gives the focus back to the ⋯', async () => {
    const move = await openMove();
    option('No brand')!.focus();

    await press(document.activeElement, 'Tab');

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(move.button());
    expect(mockRequest).not.toHaveBeenCalled();
  });

  describe('at 1025px and below', () => {
    beforeEach(() => {
      smallWindow = true;
    });

    it('opens as a bottom sheet in the box that takes presses, titled the same', async () => {
      const move = await openMove();

      expect(sheet()).toBeTruthy();
      expect(sheet()!.getAttribute('aria-label')).toBe(TITLE);
      expect(
        move.box().querySelector('.pointer-events-auto')!.contains(sheet())
      ).toBe(true);
      expect(sheet()!.contains(listbox())).toBe(true);
      expect(sheet()!.contains(newBrand()!)).toBe(true);
    });

    // The channel sheet the ⋯ sits in closes on an Escape that reaches the
    // document, where React's listener sits too (Next hydrates the document):
    // its listener is modelled on React's own root, added after it.
    it('closes on Escape, and the channel sheet around it never hears the key', async () => {
      const move = await openMove();
      const outerEscape = jest.fn();
      move.host.addEventListener('keydown', outerEscape);

      await press(document.activeElement, 'Escape');
      move.host.removeEventListener('keydown', outerEscape);

      expect(sheet()).toBeNull();
      expect(outerEscape).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(move.button());
    });
  });

  it('reads in Arabic, the channel’s name in its own direction', async () => {
    await i18next.changeLanguage('ar');
    await openMove();

    expect(listbox()!.getAttribute('aria-label')).toBe('نقل ⁨Coffee & Co⁩ إلى');
  });

  it.each([
    ['on a wide screen', false],
    ['at 1025px and below', true],
  ])('uses no physical-side classes %s', async (_, small) => {
    smallWindow = small;
    await openMove();

    const nodes = Array.from(document.body.querySelectorAll('*'));
    expect(nodes.flatMap((node) => classes(node).filter(physical))).toEqual([]);
  });
});
