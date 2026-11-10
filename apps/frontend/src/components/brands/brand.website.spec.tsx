import { act, FC, ReactElement, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Fill from my website (spec 053, US6, FR-027 to FR-029; board BrandsWebsite
// and BrandKit's web parts; contracts/brands-api.md part 3): a full card on a
// brand whose kit is empty, and once it isn't, the same lookup in a dialog
// from the button beside Rename. Look up sends POST /brands/website, which
// saves nothing; picking another logo asks POST /brands/website/colours for
// its colours; Add to kit sends PUT /brands/:id/kit/from-website with only the
// picked logo and the ticked colours, and writes the saved brand into
// GET /brands' list. No font suggestions (research R15). Not now and closing
// save nothing; a failed lookup says so and changes nothing.
//
// t() is the real i18next on the en and ar files, so the Arabic card reads
// the canvas's words.

const request = jest.fn();
const reloadBrands = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
// The page's brand list, which a save writes the saved brand into.
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
  ...jest.requireActual('@gitroom/frontend/components/brands/use.brands'),
  useBrands: () => ({ mutate: reloadBrands }),
}));
// The channel list's focus ring; its module has its own spec.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  FOCUS_RING: 'focus-visible:ring-2 focus-visible:ring-brand',
}));

import i18next from 'i18next';
import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import {
  BrandWebsiteCard,
  kitIsEmpty,
  useFillFromWebsite,
} from '@gitroom/frontend/components/brands/brand.website';
import type { Brand } from '@gitroom/frontend/components/brands/use.brands';

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

const brand = (kit: Partial<Brand['kit']> = {}): Brand => ({
  id: 'b1',
  name: 'Rawda Florist',
  kit: {
    logo: null,
    examples: [],
    colours: [],
    headingFont: null,
    bodyFont: null,
    ...kit,
  },
});

// What POST /brands/website finds on rawda.sa: its logos, best first, and the
// first one's colours.
const SITE = {
  foundOn: 'rawda.sa',
  logos: [
    'https://rawda.sa/logo.svg',
    'https://rawda.sa/favicon.png',
    'https://cdn.rawda.sa/og.jpg',
  ],
  colours: ['#0E7C86', '#F2B84B', '#E6F4F5'],
};
// The second logo's colours, from POST /brands/website/colours.
const FAVICON_COLOURS = ['#1D2B36', '#FFFFFF'];
const SAVED = brand({
  logo: { id: 'm1', path: 'https://media/m1.png', missing: false },
  colours: ['#0E7C86', '#E6F4F5'],
});

const answer = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Each route's answer, which a case can change; anything else is a request
// the card should not send.
let answers: Record<string, () => unknown>;

beforeEach(() => {
  answers = {
    '/brands/website': () => answer(SITE),
    '/brands/website/colours': () => answer({ colours: FAVICON_COLOURS }),
    '/brands/b1/kit/from-website': () => answer(SAVED),
  };
  request.mockImplementation(async (url: string) => {
    if (!answers[url]) {
      throw new Error(`Unexpected request to ${url}`);
    }
    return answers[url]();
  });
});

// What the page holds: the dialog's opener, as the button beside Rename uses
// it, and a way for afterEach to empty the modal manager's module-level store,
// where a modal one test leaves open is still there for the next one.
let closeEveryModal: (() => void) | undefined;
let openWebsite: ReturnType<typeof useFillFromWebsite>;
const Page: FC = () => {
  const { closeAll } = useModals();
  const open = useFillFromWebsite();
  useEffect(() => {
    closeEveryModal = closeAll;
    openWebsite = open;
  });
  return null;
};

const mounted: Root[] = [];

const mount = async (children?: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <ModalManagerInner />
        <Page />
        {children}
      </>
    );
  });
};

const mountCard = () => mount(<BrandWebsiteCard brand={brand()} />);

afterEach(async () => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

// The card is the section its heading names.
const card = () =>
  Array.from(document.querySelectorAll('section')).find(
    (section) => section.querySelector('h3')?.textContent === TITLE
  );
const TITLE = 'Fill from my website';

const field = () =>
  document.querySelector<HTMLInputElement>('input[dir="ltr"]')!;

const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label') === label
  );

// The logo choices, and the colours each with its tick.
const logos = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button[aria-pressed]'));
const colours = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="checkbox"]'));
const picked = () =>
  logos()
    .filter((node) => node.getAttribute('aria-pressed') === 'true')
    .map((node) => node.querySelector('img')?.getAttribute('src'));
const ticked = () =>
  colours()
    .filter((node) => node.getAttribute('aria-checked') === 'true')
    .map((node) => node.getAttribute('aria-label'));

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const type = async (input: HTMLInputElement, text: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// Enter in the address field submits its form, as a browser does with a
// form's only text field and its submit button.
const enter = async (input: HTMLInputElement) => {
  await act(async () => {
    input.form!.requestSubmit();
  });
};

const lookUp = async (address = 'rawda.sa') => {
  await type(field(), address);
  await click(button('Look up'));
};

// The bodies sent to a route, in order.
const sent = (url: string) =>
  request.mock.calls
    .filter(([called]) => called === url)
    .map(([, init]) => ({ method: init.method, body: JSON.parse(init.body) }));

const classesOf = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// A class on a physical side, which stays put when Arabic flips the page.
const physical = (name: string) =>
  /^(?:[^:]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)(?:-|$)/.test(
    name
  );

describe('which kit gets the full card', () => {
  it('is empty with no logo, example or colour; fonts alone leave it empty, as the lookup never suggests them', () => {
    expect(kitIsEmpty(brand())).toBe(true);
    expect(kitIsEmpty(brand({ headingFont: 'Tajawal' }))).toBe(true);

    expect(
      kitIsEmpty(
        brand({
          logo: { id: 'm1', path: 'https://media/m1.png', missing: false },
        })
      )
    ).toBe(false);
    // a logo deleted from Media still has its place in the kit
    expect(
      kitIsEmpty(brand({ logo: { id: 'm1', path: null, missing: true } }))
    ).toBe(false);
    expect(
      kitIsEmpty(
        brand({
          examples: [
            { id: 'e1', path: 'https://media/e1.png', missing: false },
          ],
        })
      )
    ).toBe(false);
    expect(kitIsEmpty(brand({ colours: ['#0E7C86'] }))).toBe(false);
  });
});

describe('the full card', () => {
  it('shows its heading, its help line and the address field, labelled, left to right, with Look up', async () => {
    await mountCard();

    expect(card()).toBeDefined();
    expect(card()!.textContent).toContain(
      'Sharek reads your site and suggests a logo and colours. You choose what goes in.'
    );
    expect(field().getAttribute('dir')).toBe('ltr');
    expect(
      document.querySelector(`label[for="${field().id}"]`)?.textContent
    ).toBe(TITLE);
    // nothing to look up yet
    expect(button('Look up')!.hasAttribute('disabled')).toBe(true);
    expect(card()!.textContent).not.toContain('Add to kit');
  });

  // The server looks a bare domain up on https:// (BrandWebsiteDto), so the
  // card sends the address as typed, trimmed.
  it('sends the address as typed, trimmed, a bare domain or one with its own scheme; Enter looks up too', async () => {
    await mountCard();

    await lookUp('  rawda.sa ');
    await type(field(), 'http://rawda.sa/ar');
    await enter(field());

    expect(sent('/brands/website')).toEqual([
      { method: 'POST', body: { url: 'rawda.sa' } },
      { method: 'POST', body: { url: 'http://rawda.sa/ar' } },
    ]);
  });

  it('is busy while it looks up, and sends one lookup at a time', async () => {
    let release: () => void = () => undefined;
    answers['/brands/website'] = () =>
      new Promise((resolve) => {
        release = () => resolve(answer(SITE));
      });
    await mountCard();

    await lookUp();

    expect(button('Look up')!.hasAttribute('disabled')).toBe(true);
    expect(button('Look up')!.getAttribute('aria-busy')).toBe('true');
    await enter(field());
    expect(sent('/brands/website')).toHaveLength(1);

    await act(async () => release());

    expect(button('Look up')!.hasAttribute('disabled')).toBe(false);
    expect(button('Look up')!.getAttribute('aria-busy')).not.toBe('true');
    expect(logos()).toHaveLength(3);
  });

  it('says where it found the suggestions, the address isolated, and offers the logos, the first picked, and the colours, all ticked; never fonts', async () => {
    await mountCard();

    await lookUp();

    expect(card()!.textContent).toContain('Found on ⁨rawda.sa⁩');
    expect(card()!.textContent).toContain('Pick a logo');
    expect(card()!.textContent).toContain('Colours');
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('src'))
    ).toEqual(SITE.logos);
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('alt'))
    ).toEqual(['Logo', 'Logo', 'Logo']);
    expect(picked()).toEqual([SITE.logos[0]]);
    expect(colours().map((node) => node.getAttribute('aria-label'))).toEqual(
      SITE.colours
    );
    expect(ticked()).toEqual(SITE.colours);
    expect(card()!.textContent).not.toMatch(/font/i);
    expect(card()!.textContent).toContain('Nothing is saved until you add it.');
    // a lookup saves nothing
    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  // A dark logo vanishes on a dark page and a white one on a light page, so
  // each choice sits on the kit's logo tile: its checkerboard on the panel.
  // happy-dom drops a gradient made of var() and color-mix(), so the spec sees
  // the panel's class and the checkerboard's size and offset, not its squares.
  it("draws each logo on the kit logo tile's checkerboard, not on the page's own background", async () => {
    await mountCard();

    await lookUp();

    for (const node of logos()) {
      expect(classesOf(node)).toContain('bg-panel');
      expect(classesOf(node)).not.toContain('bg-surface');
      expect(node.style.backgroundSize).toBe('16px 16px');
      expect(node.style.backgroundPosition).toBe('0px 0px, 8px 8px');
    }
  });

  it('asks for the colours of another logo when it is picked, all ticked again', async () => {
    await mountCard();
    await lookUp();
    await click(colours()[0]);

    await click(logos()[1]);

    expect(sent('/brands/website/colours')).toEqual([
      { method: 'POST', body: { logo: SITE.logos[1] } },
    ]);
    expect(picked()).toEqual([SITE.logos[1]]);
    expect(colours().map((node) => node.getAttribute('aria-label'))).toEqual(
      FAVICON_COLOURS
    );
    expect(ticked()).toEqual(FAVICON_COLOURS);
  });

  it('adds only the picked logo and the ticked colours to the kit, writes the saved brand into the list and closes the suggestions', async () => {
    await mountCard();
    await lookUp();

    await click(colours()[1]);
    expect(ticked()).toEqual(['#0E7C86', '#E6F4F5']);
    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      {
        method: 'PUT',
        body: { logo: SITE.logos[0], colours: ['#0E7C86', '#E6F4F5'] },
      },
    ]);
    // the saved brand takes its place in GET /brands' list, with no refetch
    expect(reloadBrands).toHaveBeenCalledTimes(1);
    const [update, revalidate] = reloadBrands.mock.calls[0];
    expect(revalidate).toBe(false);
    expect(update([brand(), { ...brand(), id: 'b2' }])).toEqual([
      SAVED,
      { ...brand(), id: 'b2' },
    ]);
    expect(logos()).toHaveLength(0);
    expect(card()!.textContent).not.toContain('Add to kit');
  });

  it('keeps the colours alone once the picked logo is clicked again, and with nothing kept has nothing to add', async () => {
    await mountCard();
    await lookUp();

    await click(logos()[0]);
    expect(picked()).toEqual([]);
    // the colours stay those of the logo they were read from
    expect(ticked()).toEqual(SITE.colours);
    expect(sent('/brands/website/colours')).toEqual([]);

    for (const node of colours()) {
      await click(node);
    }
    expect(button('Add to kit')!.hasAttribute('disabled')).toBe(true);

    await click(colours()[2]);
    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      { method: 'PUT', body: { colours: ['#E6F4F5'] } },
    ]);
  });

  it('saves nothing with Not now, and goes back to the address, still typed', async () => {
    await mountCard();
    await lookUp();

    await click(button('Not now'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
    expect(reloadBrands).not.toHaveBeenCalled();
    expect(logos()).toHaveLength(0);
    expect(card()).toBeDefined();
    expect(field().value).toBe('rawda.sa');
  });

  // What was found belongs to the address it was found on, so another address
  // can never add one site's suggestions to the kit.
  it('drops the suggestions once the address changes, so Add to kit is gone until the new one is looked up', async () => {
    await mountCard();
    await lookUp();
    expect(logos()).toHaveLength(3);

    await type(field(), 'bayt.sa');

    expect(logos()).toHaveLength(0);
    expect(colours()).toHaveLength(0);
    expect(card()!.textContent).not.toContain('Found on');
    expect(button('Add to kit')).toBeUndefined();
    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
  });

  it('drops a lookup answer that comes after the address changed', async () => {
    let release: () => void = () => undefined;
    answers['/brands/website'] = () =>
      new Promise((resolve) => {
        release = () => resolve(answer(SITE));
      });
    await mountCard();
    await lookUp();

    await type(field(), 'bayt.sa');
    await act(async () => release());

    expect(logos()).toHaveLength(0);
    expect(card()!.textContent).not.toContain('Found on');
    expect(button('Look up')!.hasAttribute('disabled')).toBe(false);
  });

  it('stops saying the lookup failed once the address changes', async () => {
    answers['/brands/website'] = () => answer({}, 500);
    await mountCard();
    await lookUp();
    expect(card()!.textContent).toContain("Sharek couldn't read this site.");

    await type(field(), 'rawda.sa/ar');

    expect(card()!.textContent).not.toContain(
      "Sharek couldn't read this site."
    );
  });

  it("stops saying the logo couldn't be saved once another logo is picked", async () => {
    answers['/brands/b1/kit/from-website'] = () => answer({}, 422);
    await mountCard();
    await lookUp();
    await click(button('Add to kit'));
    expect(card()!.textContent).toContain("This logo couldn't be saved");

    await click(logos()[1]);

    expect(card()!.textContent).not.toContain("This logo couldn't be saved");
    expect(picked()).toEqual([SITE.logos[1]]);
  });

  it.each([
    ['refuses it (422)', () => answer({ message: 'Unreadable' }, 422)],
    ['fails on the server', () => answer({}, 500)],
    [
      'never answers',
      () => {
        throw new TypeError('Failed to fetch');
      },
    ],
  ])(
    "says Sharek couldn't read the site when the lookup %s, and changes nothing",
    async (_, failure) => {
      await mountCard();
      await lookUp();
      answers['/brands/website'] = failure;

      await lookUp('rawda.sa/missing');

      expect(card()!.textContent).toContain(
        "Sharek couldn't read this site. Check the address, or try again later."
      );
      expect(logos()).toHaveLength(0);
      expect(sent('/brands/b1/kit/from-website')).toEqual([]);
      expect(reloadBrands).not.toHaveBeenCalled();
    }
  );

  it('says nothing more when the fetch interceptor answered the lookup itself', async () => {
    answers['/brands/website'] = () => {
      throw new AlreadyAnsweredError(402);
    };
    await mountCard();

    await lookUp();

    expect(card()!.textContent).not.toContain("Sharek couldn't read this site");
    expect(logos()).toHaveLength(0);
  });

  it('says when nothing was found, and keeps the field to try another address', async () => {
    answers['/brands/website'] = () =>
      answer({ foundOn: 'rawda.sa', logos: [], colours: [] });
    await mountCard();

    await lookUp();

    expect(card()!.textContent).toContain(
      'Nothing was found on this site. Try another address.'
    );
    expect(card()!.textContent).not.toContain('Found on');
    expect(field().value).toBe('rawda.sa');

    answers['/brands/website'] = () => answer(SITE);
    await lookUp('rawdaflorist.com');

    expect(card()!.textContent).not.toContain('Nothing was found');
    expect(logos()).toHaveLength(3);
  });

  it("says when the logo couldn't be saved (422), keeps the suggestions to pick another, and changes nothing", async () => {
    answers['/brands/b1/kit/from-website'] = () =>
      answer({ message: 'Could not fetch the logo' }, 422);
    await mountCard();
    await lookUp();

    await click(button('Add to kit'));

    expect(card()!.textContent).toContain(
      "This logo couldn't be saved, so nothing was added. Pick another logo or try again."
    );
    expect(logos()).toHaveLength(3);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it('mirrors, rings each control on focus and gives a finger 44px', async () => {
    await mountCard();
    await lookUp();

    for (const node of Array.from(card()!.querySelectorAll('*'))) {
      expect(classesOf(node).filter(physical)).toEqual([]);
    }
    for (const node of [field(), ...logos(), ...colours()]) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
    // the canvas's field (.inp.lg), 44px at every pointer
    expect(classesOf(field())).toContain('h-[44px]');
    expect(classesOf(field())).not.toContain('h-[40px]');
    for (const node of logos()) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining(['w-[76px]', 'h-[76px]'])
      );
    }
    for (const node of colours()) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining(['w-[44px]', 'h-[44px]'])
      );
    }
  });

  it('reads in Arabic, the address kept left to right', async () => {
    await i18next.changeLanguage('ar');
    await mountCard();

    await type(field(), 'rawda.sa');
    await click(button('ابحث'));

    const title = 'املأ من موقعي';
    const section = Array.from(document.querySelectorAll('section')).find(
      (node) => node.querySelector('h3')?.textContent === title
    )!;
    expect(section.textContent).toContain(
      'يقرأ شارك موقعك ويقترح شعارًا وألوانًا، وتختار أنت ما يضاف.'
    );
    expect(section.textContent).toContain('وجدنا في ⁨rawda.sa⁩');
    expect(section.textContent).toContain('اختر شعارًا');
    expect(section.textContent).toContain('أضف إلى الهوية');
    expect(section.textContent).toContain('ليس الآن');
    expect(field().getAttribute('dir')).toBe('ltr');
  });
});

describe('the dialog from the button beside Rename', () => {
  const dialogOpen = () => document.body.textContent?.includes(TITLE);

  it('opens the same lookup, and Add to kit saves the kept suggestions and closes it', async () => {
    await mount();

    await act(async () => openWebsite(brand()));

    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain(
      'Sharek reads your site and suggests a logo and colours. You choose what goes in.'
    );
    await lookUp();
    expect(document.body.textContent).toContain('Found on ⁨rawda.sa⁩');

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      { method: 'PUT', body: { logo: SITE.logos[0], colours: SITE.colours } },
    ]);
    expect(reloadBrands).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
  });

  it('closes with Not now, and saves nothing then or when it is closed', async () => {
    await mount();

    await act(async () => openWebsite(brand()));
    await lookUp();
    await click(button('Not now'));
    expect(dialogOpen()).toBe(false);

    await act(async () => openWebsite(brand()));
    await lookUp();
    await click(document.querySelector('.mantine-Modal-close'));
    expect(dialogOpen()).toBe(false);

    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it("keeps a logo that couldn't be saved open, saying so", async () => {
    answers['/brands/b1/kit/from-website'] = () => answer({}, 422);
    await mount();

    await act(async () => openWebsite(brand()));
    await lookUp();
    await click(button('Add to kit'));

    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain(
      "This logo couldn't be saved, so nothing was added."
    );
  });
});

// The server keeps the kit's own colours first and drops what doesn't fit
// (BRAND_COLOURS_MAX), so the suggestions are ticked only up to the room the
// kit has, and the card says how many fit.
describe('a kit with less room for colours than the site suggests', () => {
  const KIT = ['#111111', '#222222', '#333333', '#444444', '#555555'];
  // the line under the colours, in either language
  const note = () => document.querySelector('[role="group"] > p') ?? undefined;
  const disabled = () =>
    colours()
      .filter((node) => node.hasAttribute('disabled'))
      .map((node) => node.getAttribute('aria-label'));

  it('ticks the first ones the kit has room for, refuses ticking more, and says how many fit', async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: KIT.slice(0, 4) })));
    await lookUp();

    expect(ticked()).toEqual(SITE.colours.slice(0, 2));
    expect(disabled()).toEqual([SITE.colours[2]]);
    expect(note()?.textContent).toBe('Your kit has room for 2 more colours.');

    // a ticked colour unticked makes room for another
    await click(colours()[0]);
    await click(colours()[2]);
    expect(ticked()).toEqual([SITE.colours[1], SITE.colours[2]]);

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      {
        method: 'PUT',
        body: {
          logo: SITE.logos[0],
          colours: [SITE.colours[1], SITE.colours[2]],
        },
      },
    ]);
  });

  it("ticks only that many of another logo's colours", async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: KIT })));
    await lookUp();
    await click(logos()[1]);

    expect(ticked()).toEqual([FAVICON_COLOURS[0]]);
    expect(note()?.textContent).toBe('Your kit has room for 1 more colour.');
  });

  it('with no room left ticks none, offers none, and says to remove one; the logo can still go in', async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: [...KIT, '#666666'] })));
    await lookUp();

    expect(ticked()).toEqual([]);
    expect(disabled()).toEqual(SITE.colours);
    expect(note()?.textContent).toBe(
      "Your kit's colours are full: remove one to add from your site."
    );

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      { method: 'PUT', body: { logo: SITE.logos[0], colours: [] } },
    ]);
  });

  it('says nothing about room when every suggestion fits', async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: KIT.slice(0, 3) })));
    await lookUp();

    expect(ticked()).toEqual(SITE.colours);
    expect(disabled()).toEqual([]);
    expect(note()).toBeUndefined();
  });

  it('reads in Arabic', async () => {
    await i18next.changeLanguage('ar');
    await mount();

    await act(async () => openWebsite(brand({ colours: KIT.slice(0, 4) })));
    await type(field(), 'rawda.sa');
    await click(button('ابحث'));

    expect(note()?.textContent).toBe('تتسع هويتك للونين آخرين.');
  });
});
