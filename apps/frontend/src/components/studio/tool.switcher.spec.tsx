import { act, ReactElement, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The tool switcher (spec 061 FR-002, FR-011, FR-012, FR-016, FR-033,
// SC-004; contracts/studio-addresses.md § Top bar and § Navigation
// behaviour): in the top bar after "Studio", a button with the current tool's
// picture and name that opens the tools and models the Studio page lists,
// Tools then Models, with a search, the current one marked. A page tool opens
// its page, the image editor its window. Arrows move, Enter chooses, Escape
// closes. TopBarSlot puts it in the top bar.

// t() renders the fallback with {{var}} filled in, and keeps the keys it was
// asked for, so a case can tell which words a line reads.
const mockTranslated: string[] = [];
const mockTranslate = (
  key: string,
  fallback: string,
  params?: Record<string, unknown>
) => {
  mockTranslated.push(key);
  return fallback.replace(/{{(\w+)}}/g, (whole, name) =>
    params && name in params ? String(params[name]) : whole
  );
};
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockTranslate,
}));
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
const mockToast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
// The image editor's window opens through the modal manager.
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  ...jest.requireActual('@gitroom/frontend/components/layout/new-modal'),
  useModals: () => ({
    openModal: mockOpenModal,
    closeAll: jest.fn(),
    closeById: jest.fn(),
  }),
}));
// The provider registry, as studio.catalog.spec has it: Veo 3 and Image Text
// Slides with the Studio parts their providers declare, and Kling, whose card
// declares nothing for Studio. They register through videoWrapper and are
// read back from the registry, so the stub provider below is listed the same
// way (SC-004).
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => {
  const { videoWrapper, videosList } = jest.requireActual(
    '@gitroom/frontend/components/videos/video.wrapper'
  );
  const cards: Record<string, unknown> = {
    veo3: {
      name: { key: 'video_type_veo3', fallback: 'Veo 3' },
      description: {
        key: 'video_type_veo3_desc',
        fallback: 'One continuous live-action shot.',
      },
      pills: [],
      diagram: null,
      studio: {
        kind: 'model',
        cover: '/studio/covers/veo3.webp',
        maker: { name: 'Google', logo: '/studio/makers/google.svg' },
        sampleLength: '0:08',
      },
    },
    'image-text-slides': {
      name: {
        key: 'video_type_image_text_slides',
        fallback: 'Image Text Slides',
      },
      description: {
        key: 'video_type_slides_desc',
        fallback: 'A narrated slideshow of AI images.',
      },
      pills: [],
      diagram: null,
      studio: { kind: 'tool', cover: '/studio/covers/image-text-slides.webp' },
    },
    kling: {
      name: { key: 'video_type_kling', fallback: 'Kling' },
      description: {
        key: 'video_type_kling_desc',
        fallback: 'A short clip from a prompt.',
      },
      pills: [],
      diagram: null,
    },
  };
  Object.entries(cards).forEach(([identifier, card]) =>
    videoWrapper(identifier, (): null => null, { card })
  );
  return {
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoOwnsStage: () => false,
    videoTypeCard: (identifier: string) =>
      videosList.find(
        (provider: { identifier: string }) => provider.identifier === identifier
      )?.card,
  };
});
// The AI tools are never mounted here: a page tool's option leads to its
// page. The cover mirrors ai.image.tsx's export.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
  AiImageTool: () => null,
  AI_IMAGE_COVER: '/studio/covers/ai-image.webp',
}));
// Scenery: the channel panel's module loads for SearchField.
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);

import {
  TopBarSlot,
  ToolSwitcher,
} from '@gitroom/frontend/components/studio/tool.switcher';
import {
  buildStudioCatalog,
  filterStudio,
  findStudioTool,
  STUDIO_TOOLS,
  StudioCatalog,
} from '@gitroom/frontend/components/studio/studio.tools';
import { AI_IMAGE_COVER } from '@gitroom/frontend/components/launches/ai.image';
import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';

type CatalogInput = Parameters<typeof buildStudioCatalog>[0];

// A video provider that registers itself with a Studio card, as a new one
// would (SC-004): listed under Models with its picture, its name and its
// maker, as Veo 3 is.
videoWrapper('stub-model', (): null => null, {
  card: {
    name: { key: 'video_type_stub_model', fallback: 'Stub model' },
    description: {
      key: 'video_type_stub_model_desc',
      fallback: 'A stand-in model.',
    },
    pills: [],
    diagram: null,
    studio: {
      kind: 'model',
      cover: '/studio/covers/stub-model.webp',
      maker: { name: 'Acme', logo: '/studio/makers/acme.svg' },
    },
  },
});

// What /media/video-options answers.
const PROVIDERS = [
  { identifier: 'veo3', title: 'Veo3 (Audio + Video)' },
  { identifier: 'image-text-slides', title: 'Image Text Slides' },
  { identifier: 'kling', title: 'Kling (Video)' },
  { identifier: 'stub-model', title: 'Stub (Video)' },
];
const withAi = { tier: { ai: true } } as unknown as CatalogInput['user'];
const withoutAi = { tier: { ai: false } } as unknown as CatalogInput['user'];

const build = (overrides: Partial<CatalogInput> = {}) =>
  buildStudioCatalog({
    tools: STUDIO_TOOLS,
    videoOptions: PROVIDERS,
    user: withAi,
    billingEnabled: true,
    showImageEditor: true,
    ...overrides,
  });
// Every tool is locked for a plan without AI while billing is on.
const locked = () => build({ user: withoutAi });

const TOOLS = ['AI image generator', 'Image Text Slides', 'Image editor'];
const MODELS = ['Veo 3', 'Kling', 'Stub model'];

const mounted: Root[] = [];

beforeEach(() => {
  mockTranslated.splice(0);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const mount = async (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(node);
  });
  return host;
};

// The switcher on the page of `current`, a slug of `catalog`.
const render = async (
  current = 'ai-image',
  catalog: StudioCatalog = build()
) => {
  const tool = findStudioTool(catalog, current);
  expect(tool).toBeDefined();
  return mount(<ToolSwitcher current={tool!} catalog={catalog} />);
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

const trigger = () =>
  document.querySelector<HTMLElement>('button[aria-haspopup="listbox"]')!;
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
const options = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
// An option by the name it shows, the first line of its text.
const nameOf = (node: HTMLElement) =>
  node.querySelector('span > span')?.textContent ?? '';
const option = (name: string) =>
  options().find((node) => nameOf(node) === name);
const lineOf = (node: HTMLElement) =>
  node.querySelector('span > span:nth-child(2)')?.textContent ?? '';
const groups = () =>
  Array.from(listbox()?.querySelectorAll<HTMLElement>('[role="group"]') ?? []);
const group = (title: string) =>
  groups().find((node) => node.getAttribute('aria-label') === title);
const listed = (title: string) =>
  Array.from(
    group(title)?.querySelectorAll<HTMLElement>('[role="option"]') ?? []
  ).map(nameOf);
const search = () =>
  document.querySelector<HTMLInputElement>('input[type="search"]');
const picture = (node: HTMLElement) =>
  node.querySelector('img')?.getAttribute('src');
// The ✓ sits at the end of its row, beside the picture and the words.
const ticked = (node: HTMLElement) =>
  Array.from(node.children).some((child) => child.tagName === 'svg');
const open = async (current?: string, catalog?: StudioCatalog) => {
  await render(current, catalog);
  await click(trigger());
};
const type = async (text: string) => {
  const input = search()!;
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
  it("shows the current tool's picture and name, is named Switch tool: its name, and starts closed", async () => {
    await render('veo3');
    const button = trigger();

    expect(picture(button)).toBe('/studio/covers/veo3.webp');
    expect(button.textContent).toBe('Veo 3');
    expect(button.getAttribute('aria-label')).toBe(
      `Switch tool: ${isolate('Veo 3')}`
    );
    expect(mockTranslated).toContain('workspace_switch_tool');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(listbox()).toBeNull();
  });

  it('opens the list on click, and closes it on a second', async () => {
    await open();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(listbox()).toBeTruthy();

    await click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(listbox()).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('the list', () => {
  it('shows a search field, then Tools, then Models', async () => {
    await open();

    expect(search()?.getAttribute('aria-label')).toBe(
      'Search tools and models'
    );
    expect(
      search()!.compareDocumentPosition(listbox()!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(groups().map((node) => node.getAttribute('aria-label'))).toEqual([
      'Tools',
      'Models',
    ]);
    expect(mockTranslated).toEqual(
      expect.arrayContaining([
        'studio_search',
        'studio_section_tools',
        'studio_section_models',
      ])
    );
  });

  it('lists what the Studio page lists, in the order filterStudio gives it', async () => {
    const catalog = build();
    await open('ai-image', catalog);
    const sections = filterStudio(catalog, 'all', '', mockTranslate as never);

    expect(listed('Tools')).toEqual(TOOLS);
    expect(listed('Models')).toEqual(MODELS);
    expect(listed('Tools')).toEqual(
      sections.tools.map((tool) => tool.entry.name(mockTranslate as never))
    );
    expect(listed('Models')).toEqual(
      sections.models.map((tool) => tool.entry.name(mockTranslate as never))
    );
  });

  it('gives each option its picture, its name and its category, or its maker and category', async () => {
    await open();

    expect(picture(option('AI image generator')!)).toBe(AI_IMAGE_COVER);
    expect(lineOf(option('AI image generator')!)).toBe('Images');
    expect(picture(option('Image Text Slides')!)).toBe(
      '/studio/covers/image-text-slides.webp'
    );
    expect(lineOf(option('Image Text Slides')!)).toBe('Video');
    expect(picture(option('Image editor')!)).toBe(
      '/studio/covers/image-editor.webp'
    );
    expect(lineOf(option('Image editor')!)).toBe('Edit & enhance');
    expect(picture(option('Veo 3')!)).toBe('/studio/covers/veo3.webp');
    expect(lineOf(option('Veo 3')!)).toBe(`by ${isolate('Google')} · Video`);
    expect(mockTranslated).toContain('studio_model_by');
  });

  it('draws the glyph for a listing with no picture, or whose picture does not load', async () => {
    await open();

    expect(picture(option('Kling')!)).toBeUndefined();
    expect(option('Kling')!.querySelector('svg')).toBeTruthy();
    expect(lineOf(option('Kling')!)).toBe('Video');

    await act(async () => {
      option('Veo 3')!.querySelector('img')!.dispatchEvent(new Event('error'));
    });
    expect(picture(option('Veo 3')!)).toBeUndefined();
    expect(option('Veo 3')!.querySelector('svg')).toBeTruthy();
  });

  it('lists a provider that registers itself under Models, with its picture, its name and its maker, like the others (SC-004)', async () => {
    await open();
    const stub = option('Stub model')!;

    expect(listed('Models')).toContain('Stub model');
    expect(picture(stub)).toBe('/studio/covers/stub-model.webp');
    expect(lineOf(stub)).toBe(`by ${isolate('Acme')} · Video`);
  });

  it('lists the locked tools and models too', async () => {
    await open('ai-image', locked());

    expect(listed('Tools')).toEqual(TOOLS);
    expect(listed('Models')).toEqual(MODELS);
  });

  it('marks the current tool, and only it, with a ✓', async () => {
    await open('veo3');

    expect(
      options()
        .filter((node) => node.getAttribute('aria-selected') === 'true')
        .map(nameOf)
    ).toEqual(['Veo 3']);
    expect(options().filter(ticked).map(nameOf)).toEqual(['Veo 3']);
  });
});

describe('the search', () => {
  it('filters as it is typed, by name and by maker', async () => {
    await open();

    await type('veo');
    expect(options().map(nameOf)).toEqual(['Veo 3']);
    expect(group('Tools')).toBeUndefined();

    await type('acme');
    expect(options().map(nameOf)).toEqual(['Stub model']);

    await type('');
    expect(options().map(nameOf)).toEqual([...TOOLS, ...MODELS]);
  });

  it('says nothing matches when nothing does', async () => {
    await open();

    await type('zzz');
    expect(options()).toEqual([]);
    expect(document.body.textContent).toContain(
      `Nothing matches “${isolate('zzz')}”`
    );
    expect(mockTranslated).toContain('studio_no_match_title');
  });

  it('starts empty again when the list opens again', async () => {
    await open();
    await type('veo');

    await click(trigger());
    await click(trigger());
    expect(search()!.value).toBe('');
    expect(options().map(nameOf)).toEqual([...TOOLS, ...MODELS]);
  });
});

describe('choosing', () => {
  it('opens a page tool at its address, closes the list and gives the focus back to the button', async () => {
    await open('ai-image');

    await click(option('Veo 3'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/studio/veo3');
    expect(listbox()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  // A locked tool's page opens with its settings and Upgrade (FR-013).
  it('opens a locked page tool at its address too', async () => {
    await open('ai-image', locked());

    await click(option('Image Text Slides'));
    expect(mockPush).toHaveBeenCalledWith('/studio/image-text-slides');
  });

  it('only closes the list when the current tool is chosen', async () => {
    await open('veo3');

    await click(option('Veo 3'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
  });

  it("opens the image editor's window, as its Studio card does, and confirms what it saves", async () => {
    await open('ai-image');

    await click(option('Image editor'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const window = mockOpenModal.mock.calls[0][0];
    expect(window.title).toBe('Design Media');

    // The editor's own save lands the design in the Media library.
    const editor = window.children(jest.fn()) as ReactElement<{
      setMedia: (media: Array<{ id: string; path: string }>) => void;
    }>;
    editor.props.setMedia([{ id: 'm1', path: '/design.png' }]);
    expect(mockToast).toHaveBeenCalledWith(
      'Saved to your Media library',
      'success'
    );
  });

  // Today's behaviour (FR-016): a locked window tool is never mounted behind
  // its card, which leads to Billing.
  it('leads a locked image editor to Billing, as its Studio card does, without opening its window', async () => {
    await open('ai-image', locked());

    await click(option('Image editor'));
    expect(mockPush).toHaveBeenCalledWith('/billing');
    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
  });

  // The page it leaves takes its button with it, and the focus would fall to
  // the body: the switcher on the page it opened takes it (spec 061, T062a
  // W5).
  const leave = () =>
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });

  it('gives the focus to the switcher on the page it opens', async () => {
    await open('ai-image');
    await click(option('Veo 3'));
    expect(mockPush).toHaveBeenCalledWith('/studio/veo3');

    leave();
    expect(document.activeElement).toBe(document.body);
    await render('veo3');

    expect(document.activeElement).toBe(trigger());
  });

  it('gives no focus to a switcher it did not open, as on a tool page reached after Billing', async () => {
    await open('ai-image', locked());
    await click(option('Image editor'));
    expect(mockPush).toHaveBeenCalledWith('/billing');

    leave();
    await render('veo3', locked());

    expect(document.activeElement).toBe(document.body);
  });
});

describe('the keyboard', () => {
  it('opens with the focus in the search field', async () => {
    await open();

    expect(document.activeElement).toBe(search());
  });

  it('moves from the search into the options and through them with the arrows, wrapping', async () => {
    await open();

    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('AI image generator'));
    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('Image Text Slides'));
    await press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(option('AI image generator'));
    await press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(option('Stub model'));
    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('AI image generator'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('chooses the option with the focus on Enter', async () => {
    await open('ai-image');

    await press(document.activeElement, 'ArrowDown');
    await press(document.activeElement, 'ArrowDown');
    await press(document.activeElement, 'ArrowDown');
    await press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(option('Veo 3'));

    await press(document.activeElement, 'Enter');
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/studio/veo3');
    expect(listbox()).toBeNull();
  });

  // A dialog behind closes on an Escape that reaches the document
  // (new-modal.tsx): the open list keeps it, as the brand list does.
  it.each([
    ['the search field', 0],
    ['an option', 1],
  ])(
    'closes on Escape from %s, gives the focus back to the button, and keeps the key to itself',
    async (_name, downs) => {
      const documentEscape = jest.fn();
      document.addEventListener('keydown', documentEscape);
      await open();
      for (let i = 0; i < downs; i++) {
        await press(document.activeElement, 'ArrowDown');
      }
      documentEscape.mockClear();

      await press(document.activeElement, 'Escape');
      document.removeEventListener('keydown', documentEscape);

      expect(listbox()).toBeNull();
      expect(document.activeElement).toBe(trigger());
      expect(mockPush).not.toHaveBeenCalled();
      expect(documentEscape).not.toHaveBeenCalled();
    }
  );

  // The list hangs in the body, after the rest of the page, so a Tab from it
  // would leave the page: it closes, as the brand list does.
  it('closes on Tab and gives the focus back to the button', async () => {
    await open();

    await press(document.activeElement, 'Tab');
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe('the look', () => {
  const controls = () => [trigger(), ...options()];

  it('rings every control in the app’s ring', async () => {
    await open();

    controls().forEach((node) => {
      expect(classes(node)).toEqual(
        expect.arrayContaining([
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    });
  });

  it('gives the button and every option a 44px target at least under a coarse pointer', async () => {
    await open();

    expect(classes(trigger())).toContain('coarse:h-[44px]');
    options().forEach((node) => {
      expect(minHeight(node)).toBeGreaterThanOrEqual(44);
    });
  });

  // On a phone the heading gives the slot its place (layout/title.tsx), so
  // the switcher starts the bar's row, whose gap spaces it from the menu
  // button, and its name takes what the bar has left, cut short there, while
  // its picture keeps its size (spec 061, T062a W4).
  it("takes the heading's place at phone width and gives its name the room left", async () => {
    const host = await render();
    const name = trigger().querySelector('span:not([aria-hidden])')!;

    expect(classes(host.firstElementChild!)).toEqual(
      expect.arrayContaining(['min-w-0', 'ms-[12px]', 'phone:ms-0'])
    );
    expect(classes(trigger())).toContain('min-w-0');
    expect(name.textContent).toBe('AI image generator');
    expect(classes(name)).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', 'truncate'])
    );
    expect(classes(trigger().querySelector('span[aria-hidden]')!)).toContain(
      'flex-none'
    );
  });

  // The live re-walk at 390: beside the menu button and the bar's end group
  // the name had 47px (about 62 on a phone with no scrollbar) and read
  // "AI i…". On a phone the picture goes and the name may take two lines.
  it('on a phone drops its picture and lets its name take two lines', async () => {
    await open();
    const name = trigger().querySelector('span:not([aria-hidden])')!;
    const listPicture = listbox()!.querySelector(
      '[role="option"] span[aria-hidden]'
    )!;

    expect(classes(trigger().querySelector('span[aria-hidden]')!)).toContain(
      'phone:hidden'
    );
    expect(classes(trigger())).toContain('phone:ps-[10px]');
    expect(classes(name)).toEqual(
      expect.arrayContaining([
        'phone:whitespace-normal',
        'phone:line-clamp-2',
        'phone:text-[13px]',
        'phone:leading-[16px]',
      ])
    );
    expect(classes(listPicture)).not.toContain('phone:hidden');
  });

  it('uses no physical-side classes, so it mirrors in Arabic', async () => {
    await open();
    const nodes = [
      trigger(),
      ...Array.from(trigger().querySelectorAll('*')),
      listbox()!.parentElement!,
      ...Array.from(listbox()!.parentElement!.querySelectorAll('*')),
    ];

    expect(nodes.flatMap(classes).filter(physical)).toEqual([]);
  });
});

// Spec 064 (D2, R8): the composer's AI button hands a pick to its caller
// instead of routing, and marks the tools it is making.
describe('with onPick and busy', () => {
  const renderPicking = async (
    onPick: (toolId: string) => void,
    catalog: StudioCatalog = build(),
    busy?: readonly string[]
  ) => {
    const tool = findStudioTool(catalog, 'ai-image');
    expect(tool).toBeDefined();
    await mount(
      <ToolSwitcher
        current={tool!}
        catalog={catalog}
        onPick={onPick}
        busy={busy}
      />
    );
    await click(trigger());
  };

  it('with onPick, picking a page tool calls onPick with its id and does not route', async () => {
    const onPick = jest.fn();
    await renderPicking(onPick);

    await click(option('Veo 3'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('veo3');
    expect(mockPush).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
  });

  it('with onPick, a locked or window tool is picked through onPick too, never /billing', async () => {
    const onPick = jest.fn();
    await renderPicking(onPick, locked());

    await click(option('Image editor'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(listbox()).toBeNull();
  });

  it('with onPick, the opened-page focus hand-off is not written', async () => {
    await renderPicking(jest.fn());
    await click(option('Veo 3'));

    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    await render('veo3');

    expect(document.activeElement).toBe(document.body);
  });

  it('with onPick, the panel opens on the z-[300] layer above the composer window; without it, z-[100] as today', async () => {
    await renderPicking(jest.fn());
    expect(classes(listbox()!.parentElement!)).toContain('z-[300]');

    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    await open();
    expect(classes(listbox()!.parentElement!)).toContain('z-[100]');
  });

  it('a busy tool reads Creating… as its second line', async () => {
    await renderPicking(jest.fn(), build(), ['veo3']);

    expect(lineOf(option('Veo 3')!)).toBe('Creating…');
    expect(lineOf(option('Kling')!)).not.toBe('Creating…');
    expect(mockTranslated).toContain('composer_ai_creating');
  });

  it('the current tool keeps its check while busy', async () => {
    await renderPicking(jest.fn(), build(), ['ai-image']);

    expect(ticked(option('AI image generator')!)).toBe(true);
    expect(lineOf(option('AI image generator')!)).toBe('Creating…');
  });
});

describe('TopBarSlot', () => {
  it("portals its children into the top bar's slot once it is there", async () => {
    const slot = document.createElement('span');
    slot.id = 'top-bar-slot';
    document.body.appendChild(slot);

    const host = await mount(
      <TopBarSlot>
        <span data-probe="" />
      </TopBarSlot>
    );

    expect(slot.querySelector('[data-probe]')).toBeTruthy();
    expect(host.querySelector('[data-probe]')).toBeNull();
  });

  it('renders nothing on a page with no slot', async () => {
    const host = await mount(
      <TopBarSlot>
        <span data-probe="" />
      </TopBarSlot>
    );

    expect(document.querySelector('[data-probe]')).toBeNull();
    expect(host.innerHTML).toBe('');
  });
});
