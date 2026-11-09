import { act, FC, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';

// A brand's kit on the Brands page (spec 053, US1 scenarios 4, 5, 7, 9 and 10,
// FR-010 to FR-014; board Main's parts 5 to 8, BrandsMissing): the Logo,
// Example posts, Colours, Channels and Fonts cards, and the note that anyone in
// the team can edit it. Each kit save sends PUT /brands/:id/kit with only the
// field it changed, so two members editing different parts of one kit don't
// overwrite each other (spec, Edge Cases); a channel moves with the existing
// PUT /integrations/:id/group. The line that says what the kit is for is the
// brand header's, which the page draws.

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
// The page's two lists, which the kit refreshes after each save.
jest.mock('@gitroom/frontend/components/brands/use.brands', () => ({
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
// The channel list's picture and order, which have their own spec.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ChannelPicture: () => null,
  compareChannels: () => 0,
}));

import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import {
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { BrandKit } from '@gitroom/frontend/components/brands/brand.kit';
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

const brand = (kit: Partial<Brand['kit']> = {}): Brand => ({
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

const mount = async (value: Brand) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <CaptureModals />
        <ModalManagerInner />
        <BrandKit brand={value} />
      </>
    );
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

// React's onBlur listens for focusout.
const leave = async (input: HTMLInputElement) => {
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

const font = (name: string) =>
  Array.from(card('Fonts').querySelectorAll('label'))
    .find((label) => label.textContent?.includes(name))!
    .querySelector('input')!;

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
});

describe('saving the kit', () => {
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
