import { act, FC, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';

// A brand's kit on the Brands page (spec 053, US1 scenarios 4, 5, 7, 9 and 10,
// FR-010 to FR-014; board Main's parts 5 to 8, BrandsMissing): the Logo,
// Example posts, Colours, Channels and Fonts cards, and the note that anyone in
// the team can edit it. Each kit save sends PUT /brands/:id/kit with only the
// field it changed, so two members editing different parts of one kit don't
// overwrite each other (spec, Edge Cases); a channel moves with the existing
// PUT /integrations/:id/group. The line that says what the kit is for is the
// brand header's, which the page draws. While the kit is empty, the Fill from
// my website card comes first (US6); the card has its own spec. Spec 056 adds
// the Details for Samy card (US3, FR-015, FR-019), as the maintainer approved
// it (T004): under Example posts, its five details saved one at a time.

const request = jest.fn();
const reloadBrands = jest.fn();
const reloadChannels = jest.fn();
const toast = jest.fn();
let channels: Array<{
  id: string;
  name: string;
  identifier: string;
  picture: string | null;
  customer: { id: string; name: string } | null;
  disabled?: boolean;
}> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
// Whether the server can look a website up (FIRECRAWL_API_KEY set), as the
// layout reads it.
const mockVariables = { websiteLookup: true };
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  ...jest.requireActual('@gitroom/react/helpers/variable.context'),
  useVariables: () => mockVariables,
}));
// The page's two lists: the kit puts each saved brand in the first, and
// refreshes the second after a channel moves.
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
  ...jest.requireActual('@gitroom/frontend/components/brands/use.brands'),
  useBrands: () => ({ data: [], mutate: reloadBrands }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: channels, mutate: reloadChannels }),
  })
);
// The Media library the logo and examples open. Its own behaviour, the limit
// included, has its own spec; here it only records what it was opened with,
// so a test can answer for it.
const picker: Array<{
  max?: number;
  type?: string;
  setMedia: (media: { id: string; path: string }[]) => void;
}> = [];
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: (props: (typeof picker)[number]) => {
    picker.push(props);
    return null;
  },
  mediaLibrarySize: () => 'calc(100% - 80px)',
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
// The channel list's picture and order, which have their own spec, and its
// focus ring. The picture is a bare box with the classes its row gives it.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ChannelPicture: ({ className }: { className?: string }) => (
    <span data-picture="" className={className} />
  ),
  compareChannels: () => 0,
  FOCUS_RING: 'focus-visible:ring-2 focus-visible:ring-brand',
}));

import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import {
  BRAND_ABOUT_MAX,
  BRAND_CALL_TO_ACTION_MAX,
  BRAND_HASHTAGS_MAX,
  BRAND_POST_LANGUAGE_MAX,
  BRAND_TONE_MAX,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { BrandKit } from '@gitroom/frontend/components/brands/brand.kit';
import { CHECKERBOARD } from '@gitroom/frontend/components/brands/brand.website';
import type { Brand } from '@gitroom/frontend/components/brands/use.brands';

// react-colorful's square falls back to the global `self` for its window when
// it unmounts; jest.setup.js lifts a fixed list of globals onto globalThis and
// that is not one of them.
globalThis.self = window;

const image = (id: string, missing = false) => ({
  id,
  path: missing ? null : `https://media/${id}.png`,
  missing,
});

const brand = (
  kit: Partial<Brand['kit']> = {},
  details: Partial<Brand['details']> = {}
): Brand => ({
  id: 'b1',
  name: 'Bayt Al Qahwa',
  kit: {
    logo: null,
    examples: [],
    colours: [],
    headingFont: null,
    bodyFont: null,
    ...kit,
  },
  details: {
    about: null,
    toneOfVoice: null,
    postLanguage: null,
    callToAction: null,
    hashtags: null,
    ...details,
  },
});

const channel = (
  id: string,
  name: string,
  customer: { id: string; name: string } | null
): (typeof channels)[number] => ({
  id,
  name,
  identifier: 'instagram',
  picture: null,
  customer,
});

const BAYT = { id: 'b1', name: 'Bayt Al Qahwa' };
const NOOR = { id: 'b2', name: 'Noor Dental' };

// The modal manager keeps its open modals in a module-level store, so a modal
// one test leaves open is still there for the next one. This hands afterEach
// a way to empty it.
let closeEveryModal: (() => void) | undefined;
const CaptureModals: FC = () => {
  const { closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
  }, [closeAll]);
  return null;
};

const mounted: Root[] = [];

const page = (value: Brand) => (
  <>
    <CaptureModals />
    <ModalManagerInner />
    <BrandKit brand={value} />
  </>
);

const mount = async (value: Brand) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(page(value));
  });
};

// The same page with the brand as GET /brands now gives it, as after a
// change someone else saved.
const rerender = async (value: Brand) => {
  await act(async () => {
    mounted[0].render(page(value));
  });
};

// A card is a section named by its heading.
const card = (title: string) =>
  Array.from(document.querySelectorAll('section')).find(
    (section) => section.querySelector('h3')?.textContent === title
  )!;

// A button by its words or, for an icon, its label.
const button = (scope: ParentNode, label: string) =>
  Array.from(scope.querySelectorAll('button')).find(
    (node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label') === label
  );
const buttons = (scope: ParentNode, label: string) =>
  Array.from(scope.querySelectorAll('button')).filter(
    (node) =>
      node.textContent?.trim() === label ||
      node.getAttribute('aria-label') === label
  );

// A button of an open modal, which renders outside the kit's cards.
const inModal = (label: string) =>
  buttons(document, label).find((node) => !node.closest('section'));

const click = async (node: Element | null | undefined) => {
  await act(async () => {
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

type Field = HTMLInputElement | HTMLTextAreaElement;

const type = async (input: Field, text: string) => {
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

// React's onBlur listens for focusout.
const leave = async (input: Field) => {
  await act(async () => {
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
};

// The Media library opened last, answering with these images.
const pick = async (...media: { id: string; path: string }[]) => {
  await act(async () => {
    picker[picker.length - 1].setMedia(media);
  });
};

// The bodies sent to the kit's route, in order.
const kitSaves = () =>
  request.mock.calls
    .filter(([url]) => url === '/brands/b1/kit')
    .map(([, init]) => {
      expect(init.method).toBe('PUT');
      return JSON.parse(init.body);
    });

const classesOf = (node: Element | null) => node?.className.split(' ') ?? [];

const font = (name: string) =>
  Array.from(card('Fonts').querySelectorAll('label'))
    .find((label) => label.textContent?.includes(name))!
    .querySelector('input')!;

// The approved card (T004, contracts/pages-ui.md section 1): its words in
// English, which the mocked t() renders, and each detail's field.
const DETAILS_TITLE = 'Details for Samy';
const DETAILS_HELP =
  "All optional. Samy uses them when it writes this brand's captions and the words on its images, and reads them as facts about the brand, never as instructions.";
const DETAILS = [
  {
    key: 'about',
    label: 'About',
    max: BRAND_ABOUT_MAX,
    placeholder:
      "What you do and who it's for, e.g. We help students study abroad: 600+ programmes in 13 countries.",
  },
  {
    key: 'toneOfVoice',
    label: 'Tone of voice',
    max: BRAND_TONE_MAX,
    placeholder: 'e.g. warm, aspirational, formal Arabic',
  },
  {
    key: 'postLanguage',
    label: 'Post language',
    max: BRAND_POST_LANGUAGE_MAX,
    placeholder: 'e.g. Arabic, or Arabic and English',
  },
  {
    key: 'callToAction',
    label: 'Call to action',
    max: BRAND_CALL_TO_ACTION_MAX,
    placeholder: 'e.g. Apply now at yourbrand.com',
  },
  {
    key: 'hashtags',
    label: 'Hashtags',
    max: BRAND_HASHTAGS_MAX,
    placeholder: 'e.g. #StudyAbroad #YourBrand',
  },
] as const;

// User Story 3's brand, as the agency filled it in.
const US3 = {
  about: 'We help students study abroad: 600+ programmes in 13 countries.',
  toneOfVoice: 'warm, aspirational, formal Arabic',
  postLanguage: 'Arabic',
  callToAction: 'قدّم الآن عبر pkhub.info',
  hashtags: '#ادرس_في_الخارج #الدراسة_في_ألمانيا #PKHub',
};

// A detail's field, inside the label that names it.
const detail = (label: string): Field =>
  Array.from(card(DETAILS_TITLE).querySelectorAll('label'))
    .find((node) => node.querySelector('span')?.textContent === label)!
    .querySelector('input, textarea')!;

beforeEach(() => {
  request.mockResolvedValue({ ok: true, json: async () => ({}) });
  channels = [
    channel('c1', 'بيت القهوة', BAYT),
    channel('c2', 'baytalqahwa', BAYT),
    channel('c3', 'Noor Dental', NOOR),
    channel('c4', 'Rawda Florist', null),
  ];
});

afterEach(() => {
  act(() => {
    closeEveryModal?.();
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  picker.length = 0;
  jest.clearAllMocks();
});

describe('a brand kit', () => {
  it('leaves the line that says what the kit is for to the brand’s header, which the page draws', async () => {
    await mount(brand());

    expect(document.body.textContent).not.toContain(
      "Samy and Sharek's AI use this kit to keep your images on-brand."
    );
  });

  it('says anyone in the team can edit the brand (scenario 10)', async () => {
    await mount(brand());

    expect(document.body.textContent).toContain(
      'Anyone in your team can edit this brand.'
    );
  });

  it('starts with the Fill from my website card while the kit is empty, and drops it once the kit has something in it (FR-027)', async () => {
    await mount(brand({ headingFont: 'Tajawal' }));

    expect(
      document.querySelector('section')?.querySelector('h3')?.textContent
    ).toBe('Fill from my website');

    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';

    await mount(brand({ colours: ['#0E7C86'] }));

    expect(card('Fill from my website')).toBeUndefined();
    expect(card('Logo')).toBeDefined();
  });

  it('shows no Fill from my website card, even on an empty kit, while the server has no web lookup (FIRECRAWL_API_KEY unset)', async () => {
    mockVariables.websiteLookup = false;
    await mount(brand());

    expect(card('Fill from my website')).toBeUndefined();
    expect(card('Logo')).toBeDefined();
  });

  it('shows its cards: Logo, Colours, Example posts, Channels and Fonts', async () => {
    await mount(brand());

    for (const title of [
      'Logo',
      'Colours',
      'Example posts',
      'Channels',
      'Fonts',
    ]) {
      expect(card(title)).toBeDefined();
    }
  });
});

describe('the Logo card', () => {
  it('with no logo says so and offers Upload logo, which opens the Media library for one image', async () => {
    await mount(brand());

    expect(card('Logo').textContent).toContain('No logo yet');
    expect(button(card('Logo'), 'Replace')).toBeUndefined();
    expect(button(card('Logo'), 'Remove')).toBeUndefined();
    expect(card('Logo').textContent).toContain(
      'Goes with every image, even when you attach your own.'
    );

    await click(button(card('Logo'), 'Upload logo'));

    expect(document.body.textContent).toContain('Media Library');
    expect(picker[picker.length - 1].type).toBe('image');
    expect(picker[picker.length - 1].max).toBe(1);

    await pick({ id: 'm9', path: 'https://media/m9.png' });

    expect(kitSaves()).toEqual([{ logoId: 'm9' }]);
    expect(reloadBrands).toHaveBeenCalled();
  });

  it('shows the logo, with Replace through the same library and Remove', async () => {
    await mount(brand({ logo: image('logo') }));

    expect(card('Logo').querySelector('img')!.getAttribute('src')).toBe(
      'https://media/logo.png'
    );
    expect(button(card('Logo'), 'Upload logo')).toBeUndefined();

    await click(button(card('Logo'), 'Replace'));
    expect(picker[picker.length - 1].type).toBe('image');
    expect(picker[picker.length - 1].max).toBe(1);
    await pick({ id: 'm9', path: 'https://media/m9.png' });

    await click(button(card('Logo'), 'Remove'));

    expect(kitSaves()).toEqual([{ logoId: 'm9' }, { logoId: null }]);
  });

  // The website lookup's tile (brand.website.tsx's CHECKERBOARD, whose grey
  // its own spec pins): one board for a logo wherever it is shown, with no
  // class painting the tile under it.
  it("draws the logo on the website lookup's checkerboard", async () => {
    const BOARD = [
      'backgroundColor',
      'backgroundImage',
      'backgroundSize',
      'backgroundPosition',
    ] as const;
    const drawn = (node: HTMLElement) => BOARD.map((part) => node.style[part]);
    const probe = document.createElement('div');
    Object.assign(probe.style, CHECKERBOARD);
    await mount(brand({ logo: image('logo') }));

    const tile = card('Logo').querySelector('img')!.parentElement!;

    expect(drawn(tile)).toEqual(drawn(probe));
    expect(classesOf(tile).filter((name) => name.startsWith('bg-'))).toEqual(
      []
    );
  });

  // "No logo yet" is the muted text, which can't be read on the board's grey
  // (1.1:1 to 2.1:1 in either theme), and there is no logo for the board to
  // show through: the empty tile is the panel.
  it('says there is no logo on the panel, not on the checkerboard', async () => {
    await mount(brand());

    const tile = Array.from(card('Logo').querySelectorAll('span')).find(
      (node) => node.textContent === 'No logo yet'
    )!.parentElement!;

    expect(classesOf(tile)).toContain('bg-panel');
    expect(tile.getAttribute('style')).toBeNull();
  });

  it('shows a logo deleted from Media as such, with Replace, and keeps its help line', async () => {
    await mount(brand({ logo: image('logo', true) }));

    expect(card('Logo').querySelector('img')).toBeNull();
    expect(card('Logo').textContent).toContain('Deleted from Media');
    expect(card('Logo').textContent).toContain(
      'Goes with every image, even when you attach your own.'
    );
    // the help line that switches is the examples' (BrandsMissing)
    expect(card('Example posts').textContent).toContain(
      'Up to 3 posts in your style.'
    );

    await click(button(card('Logo'), 'Replace'));
    await pick({ id: 'm9', path: 'https://media/m9.png' });

    expect(kitSaves()).toEqual([{ logoId: 'm9' }]);
  });
});

describe('the Example posts card', () => {
  it('reads "None yet" with none, and "n of 3" with some', async () => {
    await mount(brand());
    expect(card('Example posts').textContent).toContain('None yet');

    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';

    await mount(brand({ examples: [image('e1'), image('e2')] }));
    expect(card('Example posts').textContent).toContain('2 of 3');
    expect(
      Array.from(card('Example posts').querySelectorAll('img')).map((img) =>
        img.getAttribute('src')
      )
    ).toEqual(['https://media/e1.png', 'https://media/e2.png']);
  });

  it('adds through the same library, for the slots left, keeping the order and skipping one already in', async () => {
    await mount(brand({ examples: [image('e1')] }));

    await click(button(card('Example posts'), 'Add'));

    expect(picker[picker.length - 1].type).toBe('image');
    expect(picker[picker.length - 1].max).toBe(2);

    await pick(
      { id: 'm2', path: 'https://media/m2.png' },
      { id: 'e1', path: 'https://media/e1.png' }
    );

    expect(kitSaves()).toEqual([{ exampleIds: ['e1', 'm2'] }]);
    expect(reloadBrands).toHaveBeenCalled();
  });

  it('refuses a 4th: at 3 the add control is gone and the count reads "3 of 3" (scenario 5)', async () => {
    await mount(brand({ examples: [image('e1'), image('e2'), image('e3')] }));

    expect(card('Example posts').textContent).toContain('3 of 3');
    expect(button(card('Example posts'), 'Add')).toBeUndefined();
  });

  it('removes one with its ×, saving the rest', async () => {
    await mount(brand({ examples: [image('e1'), image('e2'), image('e3')] }));

    await click(buttons(card('Example posts'), 'Remove example')[1]);

    expect(kitSaves()).toEqual([{ exampleIds: ['e1', 'e3'] }]);
  });

  it('shows one deleted from Media as such, with Replace in its place, and switches the help line (scenario 9)', async () => {
    await mount(
      brand({ examples: [image('e1'), image('e2', true), image('e3')] })
    );

    expect(card('Example posts').textContent).toContain('Deleted from Media');
    expect(card('Example posts').querySelectorAll('img')).toHaveLength(2);
    expect(card('Example posts').textContent).toContain(
      'One example was deleted from Media, so Samy skips it until you replace it.'
    );
    expect(card('Example posts').textContent).not.toContain(
      'Up to 3 posts in your style.'
    );

    await click(button(card('Example posts'), 'Replace'));

    expect(picker[picker.length - 1].type).toBe('image');
    expect(picker[picker.length - 1].max).toBe(1);

    await pick({ id: 'm9', path: 'https://media/m9.png' });

    expect(kitSaves()).toEqual([{ exampleIds: ['e1', 'm9', 'e3'] }]);
  });

  it('removes one deleted from Media with its × too, saving the rest', async () => {
    await mount(
      brand({ examples: [image('e1'), image('e2', true), image('e3')] })
    );

    // the deleted one's tile is the one holding Replace
    const tile = button(card('Example posts'), 'Replace')!.parentElement!;
    expect(button(tile, 'Remove example')).toBeDefined();

    await click(button(tile, 'Remove example'));

    expect(kitSaves()).toEqual([{ exampleIds: ['e1', 'e3'] }]);
  });

  it('keeps the help line for a kit with nothing missing', async () => {
    await mount(brand({ examples: [image('e1')] }));

    expect(card('Example posts').textContent).toContain(
      'Up to 3 posts in your style. They stay out when you attach images of your own.'
    );
    expect(card('Example posts').textContent).not.toContain(
      'Deleted from Media'
    );
  });
});

describe('the Colours card', () => {
  it('reads "None yet" with none, and "n of 6" with each code left to right', async () => {
    await mount(brand());
    expect(card('Colours').textContent).toContain('None yet');

    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';

    await mount(brand({ colours: ['#3B2417', '#C8913A'] }));

    expect(card('Colours').textContent).toContain('2 of 6');
    const codes = Array.from(
      card('Colours').querySelectorAll('[dir="ltr"]')
    ).filter((node) => /^#[0-9A-F]{6}$/.test(node.textContent || ''));
    expect(codes.map((node) => node.textContent)).toEqual([
      '#3B2417',
      '#C8913A',
    ]);
    expect(card('Colours').textContent).toContain(
      'Up to 6. Samy names them in each image request.'
    );
  });

  it('adds one through the popover, saving the list with it', async () => {
    await mount(brand({ colours: ['#3B2417'] }));

    await click(button(card('Colours'), 'Add a colour'));
    const dialog = card('Colours').querySelector('[role="dialog"]')!;
    await type(dialog.querySelector('input')!, '#b5542c');
    await click(button(dialog, 'Add'));

    expect(kitSaves()).toEqual([{ colours: ['#3B2417', '#B5542C'] }]);
    expect(reloadBrands).toHaveBeenCalled();
  });

  it('removes one with its ×, saving the rest', async () => {
    await mount(brand({ colours: ['#3B2417', '#C8913A', '#F1E4D3'] }));

    await click(button(card('Colours'), 'Remove colour #C8913A'));

    expect(kitSaves()).toEqual([{ colours: ['#3B2417', '#F1E4D3'] }]);
  });

  it('has no + at 6, and the count reads "6 of 6" (scenario 5)', async () => {
    await mount(
      brand({
        colours: [
          '#3B2417',
          '#C8913A',
          '#F1E4D3',
          '#1F3B2F',
          '#0E7C86',
          '#F2B84B',
        ],
      })
    );

    expect(card('Colours').textContent).toContain('6 of 6');
    expect(button(card('Colours'), 'Add a colour')).toBeUndefined();
  });
});

describe('the Fonts card', () => {
  it('shows Headings and Body text, each up to 60 characters', async () => {
    await mount(
      brand({ headingFont: 'Reem Kufi', bodyFont: 'IBM Plex Sans Arabic' })
    );

    expect(font('Headings').value).toBe('Reem Kufi');
    expect(font('Body text').value).toBe('IBM Plex Sans Arabic');
    expect(font('Headings').getAttribute('maxlength')).toBe('60');
    expect(font('Body text').getAttribute('maxlength')).toBe('60');
    expect(font('Headings').getAttribute('dir')).toBe('auto');
  });

  it('focuses each field with the app focus ring, not a ring of its own', async () => {
    await mount(brand());

    for (const name of ['Headings', 'Body text']) {
      const classes = font(name).className.split(' ');
      expect(classes).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
      expect(classes.filter((item) => item.startsWith('focus:'))).toEqual([]);
      // the canvas's field (.inp.lg), 44px at every pointer
      expect(classes).toContain('h-[44px]');
      expect(classes).not.toContain('h-[40px]');
    }
  });

  it('saves a font when its field is left, only the one that changed, trimmed', async () => {
    await mount(brand({ bodyFont: 'IBM Plex Sans Arabic' }));

    await type(font('Headings'), '  Reem Kufi ');
    await leave(font('Headings'));
    await leave(font('Body text'));

    expect(kitSaves()).toEqual([{ headingFont: 'Reem Kufi' }]);
    expect(reloadBrands).toHaveBeenCalled();
  });

  it('saves nothing when a field is left unchanged', async () => {
    await mount(brand({ headingFont: 'Reem Kufi' }));

    await type(font('Headings'), 'Reem Kufi ');
    await leave(font('Headings'));
    await leave(font('Body text'));

    expect(kitSaves()).toEqual([]);
  });

  it('clears a font emptied, sending null', async () => {
    await mount(brand({ bodyFont: 'IBM Plex Sans Arabic' }));

    await type(font('Body text'), '');
    await leave(font('Body text'));

    expect(kitSaves()).toEqual([{ bodyFont: null }]);
  });
});

// No brand's page has no such card: it lives in BrandKit, which that page
// never draws (brands.component.spec, "shows the channels in no brand and no
// kit").
describe('the Details for Samy card (spec 056, US3)', () => {
  it('sits in the wide column right after Example posts, as approved', async () => {
    await mount(brand());

    expect(card(DETAILS_TITLE)).toBeDefined();
    expect(card('Example posts').nextElementSibling).toBe(card(DETAILS_TITLE));
  });

  it('says what the details are for under its fields', async () => {
    await mount(brand());

    const help = card(DETAILS_TITLE).lastElementChild!;
    expect(help.tagName).toBe('P');
    expect(help.textContent).toBe(DETAILS_HELP);
  });

  it('labels its five details in order, each with its example as the placeholder, its cap from the DTO and its own direction (FR-015, FR-020)', async () => {
    await mount(brand());

    expect(
      Array.from(card(DETAILS_TITLE).querySelectorAll('label')).map(
        (label) => label.querySelector('span')?.textContent
      )
    ).toEqual(DETAILS.map(({ label }) => label));
    for (const { label, max, placeholder } of DETAILS) {
      const field = detail(label);
      expect(field.getAttribute('placeholder')).toBe(placeholder);
      expect(field.getAttribute('maxlength')).toBe(String(max));
      expect(field.getAttribute('dir')).toBe('auto');
      expect(field.value).toBe('');
    }
  });

  it('gives About a three-line text area and the other four one line each', async () => {
    await mount(brand());

    expect(detail('About').tagName).toBe('TEXTAREA');
    expect(detail('About').getAttribute('rows')).toBe('3');
    for (const { label } of DETAILS.slice(1)) {
      expect(detail(label).tagName).toBe('INPUT');
    }
  });

  it('draws each field as the fonts are drawn: the app focus ring, the placeholder guard, 44px for a line, and About as tall as its lines', async () => {
    await mount(brand());

    for (const { label } of DETAILS) {
      const classes = classesOf(detail(label));
      expect(classes).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
          'placeholder:text-muted',
          'placeholder-shown:[direction:inherit]',
          'rounded-[8px]',
          'border-line',
          'bg-surface',
          'text-ink',
        ])
      );
      expect(classes.filter((item) => item.startsWith('focus:'))).toEqual([]);
    }
    for (const { label } of DETAILS.slice(1)) {
      expect(classesOf(detail(label))).toContain('h-[44px]');
    }
    expect(classesOf(detail('About'))).not.toContain('h-[44px]');
    expect(classesOf(detail('About'))).toEqual(
      expect.arrayContaining(['py-[10px]', 'leading-[1.5]', 'resize-y'])
    );
  });

  it('shows the details saved', async () => {
    await mount(brand({}, US3));

    for (const { key, label } of DETAILS) {
      expect(detail(label).value).toBe(US3[key]);
    }
  });

  it.each(DETAILS.map(({ key, label }) => [label, key]))(
    'saves %s when its field is left, only that detail, trimmed',
    async (label, key) => {
      await mount(brand());

      await type(detail(label), '  Arabic and English ');
      for (const other of DETAILS) {
        await leave(detail(other.label));
      }

      expect(kitSaves()).toEqual([{ [key]: 'Arabic and English' }]);
    }
  );

  it('saves nothing when a detail is left unchanged', async () => {
    await mount(brand({}, US3));

    await type(detail('Post language'), 'Arabic ');
    for (const { label } of DETAILS) {
      await leave(detail(label));
    }

    expect(kitSaves()).toEqual([]);
  });

  it('clears a detail emptied, sending null', async () => {
    await mount(brand({}, US3));

    await type(detail('Hashtags'), '   ');
    await leave(detail('Hashtags'));

    expect(kitSaves()).toEqual([{ hashtags: null }]);
  });

  it('sends one detail and nothing of the kit, so two members editing different parts lose nothing', async () => {
    await mount(
      brand({ colours: ['#1C7E6C'], headingFont: 'Inter' }, { about: 'Old' })
    );

    await type(detail('About'), 'New');
    await leave(detail('About'));
    await type(detail('Call to action'), 'Apply now');
    await leave(detail('Call to action'));

    expect(kitSaves()).toEqual([
      { about: 'New' },
      { callToAction: 'Apply now' },
    ]);
  });

  it('refills a field with a detail someone else saved', async () => {
    await mount(brand({}, { toneOfVoice: 'warm' }));

    await rerender(brand({}, { toneOfVoice: 'formal' }));

    expect(detail('Tone of voice').value).toBe('formal');
  });

  it('puts the brand the server answers with in its place in the brands list', async () => {
    const before = brand();
    const saved = brand({}, { postLanguage: 'Arabic' });
    const other = { ...brand(), id: 'b2', name: 'Noor Dental' };
    request.mockResolvedValueOnce({ ok: true, json: async () => saved });
    await mount(before);

    await type(detail('Post language'), 'Arabic');
    await leave(detail('Post language'));

    expect(reloadBrands).toHaveBeenCalledTimes(1);
    const [update, revalidate] = reloadBrands.mock.calls[0];
    expect(revalidate).toBe(false);
    expect(update([before, other])).toEqual([saved, other]);
  });

  // jsdom lays nothing out, so this pins what mirrors the card on an Arabic
  // page: logical directions only, and each field in its own text's
  // direction, an empty one in the page's.
  it('mirrors on an Arabic page: logical directions only, each field in its own direction', async () => {
    const PHYSICAL =
      /^(?:[\w-]+:)*-?(?:[mp][lr]|left|right|border-[lr]|rounded-[lr]|rounded-[tb][lr]|text-(?:left|right)|float-(?:left|right))(?:-|$)/;
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      await mount(brand({}, US3));

      const nodes = [
        card(DETAILS_TITLE),
        ...Array.from(card(DETAILS_TITLE).querySelectorAll('*')),
      ];
      const physical = nodes.flatMap((node) =>
        classesOf(node).filter((name) => PHYSICAL.test(name))
      );
      expect(physical).toEqual([]);
      for (const { label } of DETAILS) {
        expect(detail(label).getAttribute('dir')).toBe('auto');
        expect(classesOf(detail(label))).toContain(
          'placeholder-shown:[direction:inherit]'
        );
      }
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });
});

describe('the Channels card (scenario 7)', () => {
  it('lists the brand’s channels only, with their count', async () => {
    await mount(brand());

    const text = card('Channels').textContent;
    expect(text).toContain('بيت القهوة');
    expect(text).toContain('baytalqahwa');
    expect(text).not.toContain('Noor Dental');
    expect(text).not.toContain('Rawda Florist');
    expect(
      card('Channels').querySelector('h3')!.nextElementSibling!.textContent
    ).toBe('2');
    expect(card('Channels').textContent).toContain(
      'Tick these channels in Samy and it uses this kit.'
    );
  });

  it('moves a channel to No brand with its ×, and refreshes the channel list', async () => {
    await mount(brand());

    await click(buttons(card('Channels'), 'Remove from brand')[0]);

    expect(request).toHaveBeenCalledWith('/integrations/c1/group', {
      method: 'PUT',
      body: JSON.stringify({ group: '' }),
    });
    expect(reloadChannels).toHaveBeenCalled();
    expect(kitSaves()).toEqual([]);
  });

  it('Add channels offers the organization’s other channels with their brand, and adds the ticked ones', async () => {
    await mount(brand());

    await click(button(card('Channels'), 'Add channels'));

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[role="checkbox"]')
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Noor Dental'),
      expect.stringContaining('Rawda Florist'),
    ]);
    // each says the brand it is in now, or No brand
    expect(rows[1].textContent).toContain('No brand');
    expect(
      rows.every((row) => row.getAttribute('aria-checked') === 'false')
    ).toBe(true);
    expect(inModal('Add')!.disabled).toBe(true);

    await click(rows[0]);
    await click(rows[1]);
    expect(rows[0].getAttribute('aria-checked')).toBe('true');
    expect(inModal('Add')!.disabled).toBe(false);

    await click(inModal('Add'));

    expect(request).toHaveBeenCalledWith('/integrations/c3/group', {
      method: 'PUT',
      body: JSON.stringify({ group: 'b1' }),
    });
    expect(request).toHaveBeenCalledWith('/integrations/c4/group', {
      method: 'PUT',
      body: JSON.stringify({ group: 'b1' }),
    });
    expect(reloadChannels).toHaveBeenCalled();
    expect(kitSaves()).toEqual([]);
  });

  it('Add channels says so when every channel is in the brand already', async () => {
    channels = [channel('c1', 'بيت القهوة', BAYT)];
    await mount(brand());

    await click(button(card('Channels'), 'Add channels'));

    expect(document.querySelector('[role="checkbox"]')).toBeNull();
    expect(document.body.textContent).toContain('No other channels to add.');
  });

  // jsdom lays nothing out, so this pins the structure that sets a name beside
  // its picture. A <bdi> stretched across its column takes its name's own
  // direction and lines it up at that direction's start: a Latin name went to
  // the far side of an Arabic row, an Arabic one to the far side of an English
  // row. The column lines each of its lines up at its own start instead
  // (items-start), each as wide as its words and no wider than the column
  // (max-w-full), cut at its own end, as the brands list's names are.
  it('sets each name beside its picture on an Arabic page, in the brand’s channels and in Add channels', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    try {
      await mount(brand());
      const beside = (name: Element) => {
        const column = name.parentElement!;
        expect(name.tagName).toBe('BDI');
        expect(classesOf(column)).toEqual(
          expect.arrayContaining(['flex', 'flex-col', 'items-start'])
        );
        Array.from(column.children).forEach((line) =>
          expect(classesOf(line)).toEqual(
            expect.arrayContaining(['max-w-full', 'truncate'])
          )
        );
      };

      const own = Array.from(card('Channels').querySelectorAll('bdi'));
      expect(own.map((name) => name.textContent)).toEqual([
        'بيت القهوة',
        'baytalqahwa',
      ]);
      own.forEach(beside);

      await click(button(card('Channels'), 'Add channels'));

      const rows = Array.from(document.querySelectorAll('[role="checkbox"]'));
      expect(rows.map((row) => row.querySelector('bdi')!.textContent)).toEqual([
        'Noor Dental',
        'Rawda Florist',
      ]);
      rows.forEach((row) => beside(row.querySelector('bdi')!));
    } finally {
      document.documentElement.removeAttribute('dir');
    }
  });

  it('keeps a disabled channel in the brand and its count, dimmed as the channel list dims one, its line saying so in place of its platform (spec, Edge Cases)', async () => {
    channels = [
      ...channels,
      { ...channel('c5', 'Swanky Outlet', BAYT), disabled: true },
    ];
    await mount(brand());
    const row = (name: string) =>
      Array.from(card('Channels').querySelectorAll('bdi')).find(
        (node) => node.textContent === name
      )!;

    expect(
      card('Channels').querySelector('h3')!.nextElementSibling!.textContent
    ).toBe('3');
    const swanky = row('Swanky Outlet');
    expect(classesOf(swanky)).toContain('opacity-50');
    expect(
      classesOf(swanky.closest('div')!.querySelector('[data-picture]'))
    ).toContain('opacity-50');
    expect(swanky.nextElementSibling!.textContent).toBe('Channel Disabled');

    const bayt = row('baytalqahwa');
    expect(classesOf(bayt)).not.toContain('opacity-50');
    expect(
      classesOf(bayt.closest('div')!.querySelector('[data-picture]'))
    ).not.toContain('opacity-50');
    expect(bayt.nextElementSibling!.textContent).not.toBe('Channel Disabled');

    // it can still leave the brand
    expect(buttons(card('Channels'), 'Remove from brand')).toHaveLength(3);
  });

  it('Add channels marks a disabled channel as the channel list does, beside the brand it is in, and still adds it', async () => {
    channels = [
      ...channels,
      { ...channel('c5', 'Swanky Outlet', NOOR), disabled: true },
    ];
    await mount(brand());

    await click(button(card('Channels'), 'Add channels'));

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[role="checkbox"]')
    );
    const row = (name: string) =>
      rows.find((node) => node.querySelector('bdi')!.textContent === name)!;
    const swanky = row('Swanky Outlet');
    expect(classesOf(swanky.querySelector('bdi'))).toContain('opacity-50');
    expect(classesOf(swanky.querySelector('[data-picture]'))).toContain(
      'opacity-50'
    );
    expect(swanky.querySelector('bdi')!.nextElementSibling!.textContent).toBe(
      'Noor Dental · Channel Disabled'
    );

    const noor = row('Noor Dental');
    expect(classesOf(noor.querySelector('bdi'))).not.toContain('opacity-50');
    expect(classesOf(noor.querySelector('[data-picture]'))).not.toContain(
      'opacity-50'
    );
    expect(noor.querySelector('bdi')!.nextElementSibling!.textContent).toBe(
      'Noor Dental'
    );

    await click(swanky);
    await click(inModal('Add'));

    expect(request).toHaveBeenCalledWith('/integrations/c5/group', {
      method: 'PUT',
      body: JSON.stringify({ group: 'b1' }),
    });
  });
});

describe('saving the kit', () => {
  it('puts the brand the server answers with in its place in the brands list, without loading the list again', async () => {
    const before = brand({ colours: ['#3B2417', '#C8913A'] });
    const saved = brand({ colours: ['#C8913A'] });
    const other = { ...brand(), id: 'b2', name: 'Noor Dental' };
    request.mockResolvedValueOnce({ ok: true, json: async () => saved });
    await mount(before);

    await click(button(card('Colours'), 'Remove colour #3B2417'));

    expect(reloadBrands).toHaveBeenCalledTimes(1);
    const [update, revalidate] = reloadBrands.mock.calls[0];
    expect(revalidate).toBe(false);
    expect(update([before, other])).toEqual([saved, other]);
    expect(update(undefined)).toBeUndefined();
  });

  it('sends only the field each change made, so two members editing one kit lose nothing', async () => {
    await mount(
      brand({
        logo: image('logo'),
        examples: [image('e1'), image('e2')],
        colours: ['#3B2417', '#C8913A'],
        headingFont: 'Reem Kufi',
      })
    );

    await click(button(card('Logo'), 'Remove'));
    await click(buttons(card('Example posts'), 'Remove example')[0]);
    await click(button(card('Colours'), 'Remove colour #3B2417'));
    await type(font('Body text'), 'Tajawal');
    await leave(font('Body text'));

    expect(kitSaves()).toEqual([
      { logoId: null },
      { exampleIds: ['e2'] },
      { colours: ['#C8913A'] },
      { bodyFont: 'Tajawal' },
    ]);
  });
});

describe('a change the server refuses or that fails', () => {
  const refused = (status: number, body: object) =>
    request.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => body,
    });

  it('a refused save says so in the server’s words, and the brands stay as they were', async () => {
    refused(404, { message: 'Media m9 was not found' });
    await mount(brand({ logo: image('logo') }));

    await click(button(card('Logo'), 'Remove'));

    expect(toast).toHaveBeenCalledWith('Media m9 was not found', 'warning');
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it('a refused save with several reasons gives the first', async () => {
    refused(400, {
      message: ['each value in colours must match', 'colours must be unique'],
    });
    await mount(brand({ colours: ['#3B2417', '#C8913A'] }));

    await click(button(card('Colours'), 'Remove colour #3B2417'));

    expect(toast).toHaveBeenCalledWith(
      'each value in colours must match',
      'warning'
    );
  });

  it.each([
    ['a refusal with no words', () => refused(500, {})],
    [
      'a request that fails',
      () => request.mockRejectedValueOnce(new TypeError('Failed to fetch')),
    ],
  ])('%s says an error occurred', async (_, fail) => {
    fail();
    await mount(brand({ headingFont: 'Reem Kufi' }));

    await type(font('Headings'), 'Tajawal');
    await leave(font('Headings'));

    expect(toast).toHaveBeenCalledWith(
      'An error occurred. Please try again.',
      'warning'
    );
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it('says nothing more for a request the fetch interceptor answered already', async () => {
    request.mockRejectedValueOnce(new AlreadyAnsweredError(402));
    await mount(brand({ logo: image('logo') }));

    await click(button(card('Logo'), 'Remove'));

    expect(toast).not.toHaveBeenCalled();
    expect(reloadBrands).not.toHaveBeenCalled();
  });

  it('a refused channel move says so, and the channel list reloads to show where each one is', async () => {
    refused(404, { message: 'Integration not found' });
    await mount(brand());

    await click(buttons(card('Channels'), 'Remove from brand')[0]);

    expect(toast).toHaveBeenCalledWith('Integration not found', 'warning');
    expect(reloadChannels).toHaveBeenCalled();
  });
});

describe('the ×', () => {
  it('draws an example’s × as board Main’s dark chip over the image, and a colour’s as the AI image window’s reference chip', async () => {
    await mount(
      brand({
        examples: [image('e1'), image('e2', true)],
        colours: ['#3B2417'],
      })
    );

    const chip = (control: Element) =>
      control.querySelector('span')!.className.split(' ');
    expect(chip(button(card('Colours'), 'Remove colour #3B2417')!)).toEqual(
      expect.arrayContaining(['rounded-full', 'bg-surface', 'border-line'])
    );
    const examples = buttons(card('Example posts'), 'Remove example');
    expect(examples).toHaveLength(2);
    for (const example of examples) {
      expect(chip(example)).toEqual(
        expect.arrayContaining([
          'w-[28px]',
          'h-[28px]',
          'rounded-[8px]',
          'bg-black/55',
          'text-white',
        ])
      );
    }
  });
});

describe('touch', () => {
  it('grows each small control to 44px under a coarse pointer, with the app focus ring', async () => {
    await mount(
      brand({
        logo: image('logo'),
        examples: [image('e1')],
        colours: ['#3B2417'],
      })
    );

    for (const control of [
      button(card('Logo'), 'Replace')!,
      button(card('Logo'), 'Remove')!,
      button(card('Example posts'), 'Remove example')!,
      button(card('Colours'), 'Remove colour #3B2417')!,
      buttons(card('Channels'), 'Remove from brand')[0],
    ]) {
      const classes = control.className.split(' ');
      expect(classes).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
      expect(classes.some((name) => name === 'coarse:h-[44px]')).toBe(true);
    }
  });
});
