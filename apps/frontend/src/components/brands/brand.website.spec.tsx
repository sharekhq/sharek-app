import { act, CSSProperties, FC, ReactElement, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Fill from my website (spec 053, US6, FR-027 to FR-029; board BrandsWebsite
// and BrandKit's web parts; spec 054's contracts/brands-website.md and its
// approved mockup): a full card on a brand whose kit is empty, and once it
// isn't, the same lookup in a dialog from the button beside Rename. Look up
// sends POST /brands/website, which saves nothing and answers the site's
// logos, colours and fonts; picking the other logo changes the logo alone;
// Add to kit sends PUT /brands/:id/kit/from-website with only the picked
// logo, the ticked colours and the ticked fonts, and writes the saved brand
// into GET /brands' list. Not now and closing save nothing; a failed lookup
// says so and changes nothing.
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
  CHECKERBOARD,
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

// What POST /brands/website finds on rawda.sa: its logo, then its icon, and
// its colours. Its page names no fonts.
const SITE = {
  foundOn: 'rawda.sa',
  logos: ['https://rawda.sa/logo.svg', 'https://rawda.sa/icon.png'],
  colours: ['#0E7C86', '#F2B84B', '#E6F4F5'],
};
// The same site once its page names its fonts.
const FONTS = { headingFont: 'Playfair Display', bodyFont: 'Noto Sans' };
const SITE_WITH_FONTS = { ...SITE, ...FONTS };
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
// the card should not send, and afterEach fails the case that sent one.
let answers: Record<string, () => unknown>;

beforeEach(() => {
  answers = {
    '/brands/website': () => answer(SITE),
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

const mountCard = (value = brand()) =>
  mount(<BrandWebsiteCard brand={value} />);

// A request to a route no case answers fails the case, even where the card
// would swallow its failure: the route that read another logo's colours
// (POST /brands/website/colours) is gone, and nothing may ask for it.
afterEach(async () => {
  const unanswered = request.mock.calls
    .map(([url]) => url)
    .filter((url) => !answers[url]);
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
  expect(unanswered).toEqual([]);
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

// The logo choices, and the colours each with its tick: a colour's tick is
// named by its code, a font's by the words beside it.
const logos = () =>
  Array.from(document.querySelectorAll<HTMLElement>('button[aria-pressed]'));
const colours = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('[role="checkbox"][aria-label]')
  );
const picked = () =>
  logos()
    .filter((node) => node.getAttribute('aria-pressed') === 'true')
    .map((node) => node.querySelector('img')?.getAttribute('src'));
const ticked = () =>
  colours()
    .filter((node) => node.getAttribute('aria-checked') === 'true')
    .map((node) => node.getAttribute('aria-label'));

// A suggested font by its label: the field with its name, and the tick over
// the field, which says whether it goes in.
const fontField = (label: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const fontTick = (label: string) =>
  fontField(label)?.parentElement?.querySelector<HTMLElement>(
    '[role="checkbox"]'
  );
const fontTicked = (label: string) =>
  fontTick(label)?.getAttribute('aria-checked') === 'true';
// The names offered, in the order the card shows them.
const fontNames = () =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>('input[aria-label]')
  ).map((input) => [input.getAttribute('aria-label'), input.value]);

// A part of what was found by its heading (Colours, Fonts), and the line
// under its choices.
const group = (heading: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="group"]')).find(
    (node) =>
      document.getElementById(node.getAttribute('aria-labelledby') ?? '')
        ?.textContent === heading
  );
const noteOf = (heading: string) =>
  Array.from(group(heading)?.children ?? []).find(
    (node) => node.tagName === 'P'
  )?.textContent;

// A style as the DOM holds it once set, which a tile's own is compared with.
const BOARD = [
  'backgroundColor',
  'backgroundImage',
  'backgroundSize',
  'backgroundPosition',
] as const;
const drawn = (node: HTMLElement) => BOARD.map((part) => node.style[part]);
const drawnFrom = (style: CSSProperties) => {
  const probe = document.createElement('div');
  Object.assign(probe.style, style);
  return drawn(probe);
};

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
  it('is empty with no logo, example or colour; fonts alone leave it empty', () => {
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
      'Sharek reads your site and suggests a logo, colours and fonts. You choose what goes in.'
    );
    expect(field().getAttribute('dir')).toBe('ltr');
    expect(field().getAttribute('placeholder')).toBe('yourbrand.com');
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
    expect(logos()).toHaveLength(2);
  });

  it('says where it found the suggestions, the address isolated, and offers the logos, the first picked, the colours, all ticked, and the fonts under them', async () => {
    answers['/brands/website'] = () => answer(SITE_WITH_FONTS);
    await mountCard();

    await lookUp();

    expect(card()!.textContent).toContain('Found on ⁨rawda.sa⁩');
    expect(group('Pick a logo')).toBeDefined();
    expect(group('Colours')).toBeDefined();
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('src'))
    ).toEqual(SITE.logos);
    // each choice named apart, by its place among them
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('alt'))
    ).toEqual(['Logo 1 of 2', 'Logo 2 of 2']);
    expect(picked()).toEqual([SITE.logos[0]]);
    expect(colours().map((node) => node.getAttribute('aria-label'))).toEqual(
      SITE.colours
    );
    expect(ticked()).toEqual(SITE.colours);
    // the fonts are the last part, the headings' before the body's
    expect(Array.from(document.querySelectorAll('[role="group"]')).pop()).toBe(
      group('Fonts')
    );
    expect(fontNames()).toEqual([
      ['Headings', 'Playfair Display'],
      ['Body text', 'Noto Sans'],
    ]);
    // every part was found, so no line says one is missing
    for (const heading of ['Pick a logo', 'Colours', 'Fonts']) {
      expect(noteOf(heading)).toBeUndefined();
    }
    expect(card()!.textContent).toContain('Nothing is saved until you add it.');
    // a lookup saves nothing
    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  // A white logo vanished on the light theme's checkerboard and a dark one on
  // the dark theme's, so the board is one grey in both: #8C8C8C with #6C6C6C
  // squares, with no theme variable in it. No class paints the tile under it.
  it('draws each logo on the grey checkerboard, the same in both themes', async () => {
    expect(CHECKERBOARD.backgroundColor).toBe('#8C8C8C');
    expect(String(CHECKERBOARD.backgroundImage).match(/#\w+/g)).toEqual(
      Array(4).fill('#6C6C6C')
    );
    expect(Object.values(CHECKERBOARD).join(' ')).not.toMatch(
      /var\(|color-mix|currentcolor/i
    );
    await mountCard();

    await lookUp();

    // the DOM holds each part of the board, so the comparison is of the board
    expect(drawnFrom(CHECKERBOARD).filter(Boolean)).toHaveLength(4);
    for (const node of logos()) {
      expect(drawn(node)).toEqual(drawnFrom(CHECKERBOARD));
      expect(classesOf(node).filter((name) => /^bg-/.test(name))).toEqual([]);
    }
  });

  it('changes the logo alone when the other one is picked: the colours and their ticks stay, and no request is made', async () => {
    await mountCard();
    await lookUp();
    await click(colours()[0]);
    const before = request.mock.calls.length;

    await click(logos()[1]);

    expect(picked()).toEqual([SITE.logos[1]]);
    expect(colours().map((node) => node.getAttribute('aria-label'))).toEqual(
      SITE.colours
    );
    expect(ticked()).toEqual(SITE.colours.slice(1));
    expect(request.mock.calls).toHaveLength(before);

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      {
        method: 'PUT',
        body: { logo: SITE.logos[1], colours: SITE.colours.slice(1) },
      },
    ]);
  });

  // A part the site didn't give left its heading over nothing.
  it('says under its heading which part the site did not give: no colours and no fonts beside a logo, which can still go in alone', async () => {
    answers['/brands/website'] = () => answer({ ...SITE, colours: [] });
    await mountCard();

    await lookUp();

    expect(colours()).toHaveLength(0);
    expect(noteOf('Colours')).toBe('No colours were found on this site.');
    expect(fontNames()).toEqual([]);
    expect(noteOf('Fonts')).toBe('No fonts were found on this site.');
    expect(noteOf('Pick a logo')).toBeUndefined();

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      { method: 'PUT', body: { logo: SITE.logos[0], colours: [] } },
    ]);
  });

  it('says the site gave no logo under the heading Logo, and still adds its colours and fonts', async () => {
    answers['/brands/website'] = () =>
      answer({ ...SITE_WITH_FONTS, logos: [] });
    await mountCard();

    await lookUp();

    expect(logos()).toHaveLength(0);
    expect(group('Pick a logo')).toBeUndefined();
    expect(noteOf('Logo')).toBe(
      'No logo was found on this site. You can upload your own.'
    );
    expect(noteOf('Colours')).toBeUndefined();
    expect(noteOf('Fonts')).toBeUndefined();

    await click(button('Add to kit'));

    expect(sent('/brands/b1/kit/from-website')).toEqual([
      { method: 'PUT', body: { colours: SITE.colours, ...FONTS } },
    ]);
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
    // the colours are the site's, with a logo picked or without
    expect(ticked()).toEqual(SITE.colours);

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
    answers['/brands/website'] = () => answer(SITE_WITH_FONTS);
    await mountCard();
    await lookUp();
    expect(logos()).toHaveLength(2);

    await type(field(), 'bayt.sa');

    expect(logos()).toHaveLength(0);
    expect(colours()).toHaveLength(0);
    expect(fontNames()).toEqual([]);
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

  // A site the lookup refuses to read (a social network's page) is not one to
  // try again later: the line points to the user's own website.
  it('shows the refused message when the lookup refuses the site (403), and changes nothing', async () => {
    await mountCard();
    await lookUp();
    answers['/brands/website'] = () => answer({ message: 'Refused' }, 403);

    await lookUp('facebook.com/rawda');

    expect(card()!.querySelector('[role="alert"]')?.textContent).toBe(
      "Sharek can't read this kind of site. Enter your own website's address, or upload your logo yourself."
    );
    expect(logos()).toHaveLength(0);
    expect(sent('/brands/b1/kit/from-website')).toEqual([]);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it.each([
    ["couldn't read it (422)", () => answer({ message: 'Unreadable' }, 422)],
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

      expect(card()!.querySelector('[role="alert"]')?.textContent).toBe(
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

  it('says when the site gave no logo, colour or font, and keeps the field to try another address', async () => {
    answers['/brands/website'] = () =>
      answer({ foundOn: 'rawda.sa', logos: [], colours: [] });
    await mountCard();

    await lookUp();

    expect(card()!.querySelector('[role="alert"]')?.textContent).toBe(
      'Nothing was found at this address. Try another address, or upload your logo yourself.'
    );
    expect(card()!.textContent).not.toContain('Found on');
    expect(field().value).toBe('rawda.sa');

    answers['/brands/website'] = () => answer(SITE);
    await lookUp('rawdaflorist.com');

    expect(card()!.textContent).not.toContain('Nothing was found');
    expect(logos()).toHaveLength(2);
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
    expect(logos()).toHaveLength(2);
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  // The kit has a headings font, so one suggestion comes with the kit's name
  // under it and its tick off, the other ticked: every new part is drawn.
  it('mirrors, rings each control on focus and gives a finger 44px', async () => {
    answers['/brands/website'] = () => answer(SITE_WITH_FONTS);
    await mountCard(brand({ headingFont: 'Tajawal' }));
    await lookUp();
    const fonts = ['Headings', 'Body text'];
    const ticks = fonts.map((label) => fontTick(label)!);
    const fields = fonts.map(fontField);
    expect([...ticks, ...fields].filter(Boolean)).toHaveLength(4);

    for (const node of Array.from(card()!.querySelectorAll('*'))) {
      expect(classesOf(node).filter(physical)).toEqual([]);
    }
    for (const node of [
      field(),
      ...logos(),
      ...colours(),
      ...ticks,
      ...fields,
    ]) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
    // the canvas's field (.inp.lg), 44px at every pointer, the fonts' too
    for (const node of [field(), ...fields]) {
      expect(classesOf(node)).toContain('h-[44px]');
      expect(classesOf(node)).not.toContain('h-[40px]');
    }
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
    // a font's tick is 20px with its label beside it, a row a finger can hit
    for (const node of ticks) {
      expect(classesOf(node)).toContain('coarse:min-h-[44px]');
    }
  });

  // The picked logo's border is the brand's red, as the focus ring is, so the
  // ring stands off each logo by a gap of the card's own surface, and only the
  // picked one carries the ✓. The spec sees the classes and the ✓, not how
  // they read side by side.
  it('tells keyboard focus from the picked logo: the ring stands off with a gap, and the picked one has its border and ✓', async () => {
    await mountCard();
    await lookUp();

    for (const node of logos()) {
      expect(classesOf(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-surface',
        ])
      );
    }
    expect(
      logos().map((node) => classesOf(node).includes('border-brand'))
    ).toEqual([true, false]);
    expect(logos().map((node) => !!node.querySelector('svg'))).toEqual([
      true,
      false,
    ]);
  });

  // The primary Button's ring is its own red with no gap, so on Add to kit it
  // can't be seen; this one stands off by a gap of the surface. The shared
  // Button is unchanged. The spec sees the classes, not the ring.
  it('rings Add to kit on focus with a gap of the surface, so the ring shows around the red button', async () => {
    await mountCard();
    await lookUp();

    expect(classesOf(button('Add to kit')!)).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-surface',
      ])
    );
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
      'يقرأ شارك موقعك ويقترح شعارًا وألوانًا وخطوطًا، وتختار أنت ما يضاف.'
    );
    expect(section.textContent).toContain('وجدنا في ⁨rawda.sa⁩');
    expect(section.textContent).toContain('اختر شعارًا');
    expect(
      logos().map((node) => node.querySelector('img')?.getAttribute('alt'))
    ).toEqual(['الشعار 1 من 2', 'الشعار 2 من 2']);
    expect(section.textContent).toContain('أضف إلى الهوية');
    expect(section.textContent).toContain('ليس الآن');
    expect(field().getAttribute('dir')).toBe('ltr');
    // the example is a Latin domain in either language
    expect(field().getAttribute('placeholder')).toBe('yourbrand.com');
  });
});

// The site's two font names, each in a field the user can edit under a tick
// that says whether it goes in. On a kit with no name of its own a font comes
// ticked; beside a name the kit has it comes unticked with that name under
// it, since adding it replaces the kit's; and the name the kit has already
// isn't offered. The two names are compared as the user reads them: the
// server cleans a suggestion's outer spaces and the kit stores a name trimmed,
// so they are compared as they stand, and case counts, as the kit keeps it
// ("tajawal" in the kit is not the site's "Tajawal").
describe('the fonts the site names', () => {
  const HEADINGS = 'Headings';
  const BODY = 'Body text';
  const lookUpFonts = async (
    kit: Partial<Brand['kit']> = {},
    fonts: Partial<typeof FONTS> = FONTS
  ) => {
    answers['/brands/website'] = () => answer({ ...SITE, ...fonts });
    await mountCard(brand(kit));
    await lookUp();
  };
  // What Add to kit sent.
  const added = () =>
    sent('/brands/b1/kit/from-website').map(({ body }) => body);
  const KEPT = { logo: SITE.logos[0], colours: SITE.colours };

  it('come ticked on a kit with no fonts, each in a field, left to right, of up to 60 characters, and Add to kit sends them as edited, trimmed', async () => {
    await lookUpFonts();

    expect(fontNames()).toEqual([
      [HEADINGS, 'Playfair Display'],
      [BODY, 'Noto Sans'],
    ]);
    for (const label of [HEADINGS, BODY]) {
      expect(fontTicked(label)).toBe(true);
      // the tick and its label are one checkbox, named by the label
      expect(fontTick(label)!.textContent).toBe(label);
      expect(fontTick(label)!.querySelector('svg')).toBeTruthy();
      expect(fontField(label).getAttribute('dir')).toBe('ltr');
      expect(fontField(label).getAttribute('maxlength')).toBe('60');
    }
    // the kit has no name to show under either
    expect(card()!.textContent).not.toContain('In your kit now');

    await type(fontField(HEADINGS), '  Playfair  ');
    expect(fontField(HEADINGS).value).toBe('  Playfair  ');
    await click(button('Add to kit'));

    expect(added()).toEqual([
      { ...KEPT, headingFont: 'Playfair', bodyFont: 'Noto Sans' },
    ]);
  });

  // An emptied name sent to the kit would clear the kit's own.
  it('drops a font whose name is emptied: its tick goes and stays off until a name is typed, and it is not sent', async () => {
    await lookUpFonts();

    await type(fontField(HEADINGS), '   ');

    expect(fontTicked(HEADINGS)).toBe(false);
    expect(fontTick(HEADINGS)!.querySelector('svg')).toBeNull();
    expect(fontTick(HEADINGS)!.hasAttribute('disabled')).toBe(true);
    expect(fontTicked(BODY)).toBe(true);

    await click(button('Add to kit'));

    expect(added()).toEqual([{ ...KEPT, bodyFont: 'Noto Sans' }]);
  });

  it("an unticked font is not sent: beside a name the kit has it comes unticked, with the kit's name under it, isolated", async () => {
    await lookUpFonts({ headingFont: 'Tajawal' });

    expect(fontTicked(HEADINGS)).toBe(false);
    // an empty ring; the name stays in its field, to read and to edit
    expect(fontTick(HEADINGS)!.querySelector('svg')).toBeNull();
    expect(fontField(HEADINGS).value).toBe('Playfair Display');
    expect(fontField(HEADINGS).parentElement!.textContent).toContain(
      'In your kit now: ⁨Tajawal⁩'
    );
    // the kit has no body font, so that one comes ticked with no line
    expect(fontTicked(BODY)).toBe(true);
    expect(fontField(BODY).parentElement!.textContent).not.toContain(
      'In your kit now'
    );

    await click(button('Add to kit'));

    expect(added()).toEqual([{ ...KEPT, bodyFont: 'Noto Sans' }]);
  });

  it("sends a font ticked beside the kit's name, to take its place", async () => {
    await lookUpFonts({ headingFont: 'Tajawal', bodyFont: 'Cairo' });
    expect([fontTicked(HEADINGS), fontTicked(BODY)]).toEqual([false, false]);

    await click(fontTick(HEADINGS));

    expect([fontTicked(HEADINGS), fontTicked(BODY)]).toEqual([true, false]);

    await click(button('Add to kit'));

    expect(added()).toEqual([{ ...KEPT, headingFont: 'Playfair Display' }]);
  });

  it('ticks a font that is not ticked once its name is typed in, and it can be unticked again', async () => {
    await lookUpFonts({ headingFont: 'Tajawal', bodyFont: 'Cairo' });

    await type(fontField(HEADINGS), 'Playfair Display SC');

    expect(fontTicked(HEADINGS)).toBe(true);
    // typing in one leaves the other as it was
    expect(fontTicked(BODY)).toBe(false);

    await click(fontTick(HEADINGS));

    expect(fontTicked(HEADINGS)).toBe(false);
    expect(fontField(HEADINGS).value).toBe('Playfair Display SC');

    await click(button('Add to kit'));

    expect(added()).toEqual([KEPT]);
  });

  it("doesn't offer the name the kit has already; one that differs in its case is offered", async () => {
    await lookUpFonts(
      { headingFont: 'Noto Sans', bodyFont: 'noto sans' },
      { headingFont: 'Noto Sans', bodyFont: 'Noto Sans' }
    );

    expect(fontNames()).toEqual([[BODY, 'Noto Sans']]);
    expect(fontTicked(BODY)).toBe(false);
    expect(fontField(BODY).parentElement!.textContent).toContain(
      'In your kit now: ⁨noto sans⁩'
    );
    // the site named its fonts, so the line that it named none stays away
    expect(noteOf('Fonts')).toBeUndefined();
  });

  // Nothing to choose and nothing missing: a heading over nothing, or a line
  // saying the site named no fonts, would both be wrong.
  it("draws no Fonts part when the site's fonts are the kit's already", async () => {
    await lookUpFonts(
      { headingFont: 'Playfair Display', bodyFont: 'Noto Sans' },
      FONTS
    );

    expect(group('Colours')).toBeDefined();
    expect(group('Fonts')).toBeUndefined();
    expect(card()!.textContent).not.toContain('No fonts were found');

    await click(button('Add to kit'));

    expect(added()).toEqual([KEPT]);
  });

  it('shows both fields when the headings and the body have the same name, as the kit has two', async () => {
    await lookUpFonts({}, { headingFont: 'Raleway', bodyFont: 'Raleway' });

    expect(fontNames()).toEqual([
      [HEADINGS, 'Raleway'],
      [BODY, 'Raleway'],
    ]);

    await click(fontTick(BODY));
    await click(button('Add to kit'));

    expect(added()).toEqual([{ ...KEPT, headingFont: 'Raleway' }]);
  });

  it('offers the one font the site names, and says nothing is missing', async () => {
    await lookUpFonts({}, { bodyFont: 'Noto Sans' });

    expect(fontNames()).toEqual([[BODY, 'Noto Sans']]);
    expect(noteOf('Fonts')).toBeUndefined();
  });

  it('adds a font alone: Add to kit is there while one font is kept, with no logo and no colour', async () => {
    answers['/brands/website'] = () =>
      answer({ foundOn: 'rawda.sa', logos: [], colours: [], ...FONTS });
    await mountCard();

    await lookUp();

    // a site that names its fonts gave something, so this is not "nothing found"
    expect(card()!.querySelector('[role="alert"]')).toBeNull();
    expect(noteOf('Logo')).toBe(
      'No logo was found on this site. You can upload your own.'
    );
    expect(noteOf('Colours')).toBe('No colours were found on this site.');
    expect(button('Add to kit')!.hasAttribute('disabled')).toBe(false);

    await click(fontTick(HEADINGS));
    await click(fontTick(BODY));
    expect(button('Add to kit')!.hasAttribute('disabled')).toBe(true);

    await click(fontTick(BODY));
    expect(button('Add to kit')!.hasAttribute('disabled')).toBe(false);
    await click(button('Add to kit'));

    expect(added()).toEqual([{ colours: [], bodyFont: 'Noto Sans' }]);
  });

  it('reads in Arabic, each font name and the kit name under it kept left to right', async () => {
    await i18next.changeLanguage('ar');
    answers['/brands/website'] = () => answer(SITE_WITH_FONTS);
    await mountCard(brand({ headingFont: 'Tajawal' }));

    await type(field(), 'rawda.sa');
    await click(button('ابحث'));

    expect(group('الخطوط')).toBeDefined();
    expect(fontNames()).toEqual([
      ['العناوين', 'Playfair Display'],
      ['النص', 'Noto Sans'],
    ]);
    expect(fontField('العناوين').getAttribute('dir')).toBe('ltr');
    expect(fontField('العناوين').parentElement!.textContent).toContain(
      'في هويتك الآن: ⁨Tajawal⁩'
    );
  });

  it('says in Arabic which parts the site did not give, and that it refuses a site', async () => {
    await i18next.changeLanguage('ar');
    answers['/brands/website'] = () =>
      answer({ foundOn: 'rawda.sa', logos: [], colours: [], ...FONTS });
    await mountCard();
    await type(field(), 'rawda.sa');
    await click(button('ابحث'));

    expect(noteOf('الشعار')).toBe(
      'لم نجد شعارًا في هذا الموقع. يمكنك رفع شعارك بنفسك.'
    );
    expect(noteOf('الألوان')).toBe('لم نجد ألوانًا في هذا الموقع.');

    answers['/brands/website'] = () => answer(SITE);
    await type(field(), 'rawda.sa/ar');
    await click(button('ابحث'));

    expect(noteOf('الخطوط')).toBe('لم نجد خطوطًا في هذا الموقع.');

    answers['/brands/website'] = () => answer({}, 403);
    await type(field(), 'facebook.com/rawda');
    await click(button('ابحث'));

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'لا يستطيع شارك قراءة هذا النوع من المواقع. أدخل عنوان موقعك، أو ارفع شعارك بنفسك.'
    );
  });
});

describe('the dialog from the button beside Rename', () => {
  const dialogOpen = () => document.body.textContent?.includes(TITLE);

  it('opens the same lookup, and Add to kit saves the kept suggestions and closes it', async () => {
    await mount();

    await act(async () => openWebsite(brand()));

    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain(
      'Sharek reads your site and suggests a logo, colours and fonts. You choose what goes in.'
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

  // The app's modal (new-modal.tsx, upstream's too) gives no dialog role, so
  // the lookup's own content says it is a dialog, named by the modal's title.
  // Not aria-modal: the content holds the body alone, and aria-modal would
  // hide the modal's title and × from a screen reader. The card on the kit is
  // no dialog.
  it("is a dialog to a screen reader, named by the modal's title, around the lookup; the card is not", async () => {
    await mountCard();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => openWebsite(brand()));

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.hasAttribute('aria-modal')).toBe(false);
    expect(
      document.getElementById(dialog!.getAttribute('aria-labelledby') ?? '')
        ?.textContent
    ).toBe(TITLE);
    expect(dialog!.querySelector('input[dir="ltr"]')).toBeTruthy();
    expect(card()!.closest('[role="dialog"]')).toBeNull();
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
  // the line under the colours
  const note = () => noteOf('Colours');
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
    expect(note()).toBe('Your kit has room for 2 more colours.');

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

  it('keeps the ticks and the line when the other logo is picked', async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: KIT })));
    await lookUp();
    await click(logos()[1]);

    expect(ticked()).toEqual([SITE.colours[0]]);
    expect(note()).toBe('Your kit has room for 1 more colour.');
  });

  it('with no room left ticks none, offers none, and says to remove one; the logo can still go in', async () => {
    await mount();

    await act(async () => openWebsite(brand({ colours: [...KIT, '#666666'] })));
    await lookUp();

    expect(ticked()).toEqual([]);
    expect(disabled()).toEqual(SITE.colours);
    expect(note()).toBe(
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

    expect(noteOf('الألوان')).toBe('تتسع هويتك للونين آخرين.');
  });
});
