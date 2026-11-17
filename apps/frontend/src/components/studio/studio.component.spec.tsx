import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

const toast = jest.fn();
const openModal = jest.fn();
let providers:
  | Array<{ identifier: string; title: string; description?: string }>
  | undefined = [];
let providersLoading = false;
let integrations: Array<{ id: string; name: string }> = [];
let user: { tier: { ai: boolean } };
let billingEnabled = true;
let showImageEditor = true;
let emptyCatalog = false;
const push = jest.fn();
/** Each useStudioCatalog call, so a case can see the page build through it. */
const catalogHook = jest.fn();
/** Each t() call, so a case can check the options a sentence is given. */
const translated: Array<{ key: string; params?: Record<string, unknown> }> = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) => {
      translated.push({ key, params });
      return fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      );
    },
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled, showImageEditor }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal,
    closeAll: jest.fn(),
    closeById: jest.fn(),
  }),
  ModalHeaderSlotTarget: () => null,
  ModalHeaderSlot: () => null,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: integrations }),
  })
);
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
// A page tool's card is a next/link.
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
// The AI tools are never mounted here: their cards link to their pages, so the
// page's own wiring is all that is under test. Their own behaviour has specs
// of its own.
// The registry knows Veo 3 and Image Text Slides, with the Studio parts their
// providers declare (their own specs pin them), and nothing else, so a
// provider with a card and a provider without one can be told apart.
const registryCards: Record<
  string,
  { name: { key: string; fallback: string } } & Record<string, unknown>
> = {
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
      facts: [
        { key: 'video_type_veo3_pill_length', fallback: '~8 s' },
        { key: 'video_type_veo3_pill_quality', fallback: '1080p' },
        { key: 'video_type_veo3_fact_sound', fallback: 'Sound' },
      ],
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
  // A tool that has no picture yet.
  'avatar-ad': {
    name: { key: 'video_type_avatar_ad', fallback: 'Avatar Ad' },
    description: {
      key: 'video_type_avatar_ad_desc',
      fallback: 'A presenter reads your script.',
    },
    pills: [],
    diagram: null,
    studio: { kind: 'tool' },
  },
};
const registryCard = (identifier: string) => registryCards[identifier];

// The cover mirrors ai.image.tsx's export.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImageTool: () => null,
  AI_IMAGE_COVER: '/studio/covers/ai-image.webp',
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: () => null,
  AiVideoTool: () => null,
  useAiVideoTypes: () => ({ data: providers, isLoading: providersLoading }),
  videoTypeLabel: (
    t: (key: string, fallback: string) => string,
    type: { identifier: string; title: string }
  ) => {
    const card = registryCard(type.identifier);
    return card ? t(card.name.key, card.name.fallback) : type.title;
  },
}));
jest.mock(
  '@gitroom/frontend/components/videos/video.render.component',
  () => ({
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: (identifier: string) => registryCard(identifier),
  })
);
// Samy's play mark, as a mark the cases can find; its centring is its own.
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({
  PlayBadge: () => <span data-play-badge="" />,
}));
// The catalog has its own spec; the page only needs a way to be handed an
// empty one, which no real deployment produces while the fixed tools exist,
// and to be seen building it through the hook a tool page shares (D4).
jest.mock('@gitroom/frontend/components/studio/studio.tools', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/studio/studio.tools'
  );
  return {
    ...actual,
    useStudioCatalog: () => {
      catalogHook();
      const built = actual.useStudioCatalog();
      return emptyCatalog
        ? {
            catalog: {
              listings: [],
              chips: [],
              hasLockedTools: false,
              empty: true,
            },
            loading: false,
          }
        : built;
    },
  };
});

import {
  StudioComponent,
  useCreatePost,
} from '@gitroom/frontend/components/studio/studio.component';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import {
  CHIP,
  CHIP_COUNT,
  CHIP_COUNT_IDLE,
  CHIP_COUNT_ON,
  CHIP_IDLE,
  CHIP_ON,
} from '@gitroom/frontend/components/ui/pick.controls';

const mounted: Root[] = [];

const mount = async (page: ReactNode = <StudioComponent />) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(page);
  });
};

// The page drawn again, as when the provider list comes back from a reload.
const rerender = async () => {
  await act(async () => {
    mounted[mounted.length - 1].render(<StudioComponent />);
  });
};

const click = async (element: Element | null | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const buttons = () => Array.from(document.querySelectorAll('button'));
/** The cards: a page tool's is a link, a window tool's a button. */
const cards = () =>
  Array.from(document.querySelectorAll('section a, section button'));
const card = (name: string) =>
  cards().find((node) => node.textContent?.includes(name));
const button = (label: string) =>
  buttons().find((node) => node.textContent?.trim() === label);
const headings = () =>
  Array.from(document.querySelectorAll('h2')).map((node) =>
    node.textContent?.trim()
  );
const section = (heading: string) =>
  Array.from(document.querySelectorAll('section')).find(
    (node) => node.querySelector('h2')?.textContent?.trim() === heading
  );
const NAMES = [
  'Image editor',
  'AI image generator',
  'Image Text Slides',
  'Veo 3',
  'Sora',
];
/** The listings a section shows, by name, in order: none while it is hidden. */
const listed = (heading: string) =>
  Array.from(section(heading)?.querySelectorAll('a, button') ?? []).map(
    (node) => NAMES.find((name) => node.textContent?.includes(name))
  );
/** A card carrying the chip. Cards live in a section; the banner does not. */
const lockedCards = () =>
  cards().filter((node) => node.textContent?.includes('Upgrade'));
/** The banner's Upgrade action: the chips carry the word too, inside a card. */
const upgradeActions = () =>
  buttons().filter((node) => node.textContent?.trim() === 'Upgrade');
const search = () =>
  document.querySelector<HTMLInputElement>('input[type="search"]');
const chipGroup = () => document.querySelector('[role="radiogroup"]');
/** The page's top row, which holds the chips. */
const topRow = () => chipGroup()!.parentElement!;
const chips = () =>
  Array.from(
    chipGroup()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
  );
/** A chip is its label, then its count. */
const chipLabels = () => chips().map((node) => node.children[0]?.textContent);
const chip = (label: string) =>
  chips().find((node) => node.children[0]?.textContent === label);
const checkedChips = () =>
  chips()
    .filter((node) => node.getAttribute('aria-checked') === 'true')
    .map((node) => node.children[0]?.textContent);
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
const press = async (node: Element, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    node.dispatchEvent(event);
  });
};
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
const precedes = (first: Node, then: Node) =>
  !!(first.compareDocumentPosition(then) & Node.DOCUMENT_POSITION_FOLLOWING);
/** A card is its picture's frame, then its text. */
const frameOf = (name: string) => card(name)!.children[0];
const textOf = (name: string) => card(name)!.children[1];
/** The card's text, line by line, top to bottom. */
const linesOf = (name: string) =>
  Array.from(textOf(name).children).map((node) => node.textContent);
/** What stands in for the picture: the listing's glyph, muted. */
const glyphOf = (frame: Element) =>
  Array.from(frame.children).find((node) =>
    classes(node).includes('text-muted')
  );
const playBadge = (frame: Element) => frame.querySelector('[data-play-badge]');
// A card is named by what it holds, as a browser names it: its text and its
// pictures' alt in order, leaving out what's aria-hidden.
const contentOf = (node: Node): string[] => {
  if (node.nodeType === node.TEXT_NODE) return [node.textContent ?? ''];
  const el = node as Element;
  if (el.getAttribute('aria-hidden') === 'true') return [];
  if (el.tagName === 'IMG') return [el.getAttribute('alt') ?? ''];
  return Array.from(el.childNodes).flatMap(contentOf);
};
const nameOf = (el: Element) =>
  contentOf(el)
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ');
/** A picture that does not load, as the browser reports it. */
const fail = async (picture: Element | null) => {
  await act(async () => {
    picture?.dispatchEvent(new Event('error'));
  });
};
const PICTURE = { id: 'img-1', path: 'https://media/img-1.png' };
/**
 * A design saved from the image editor's window, the one tool on this page
 * that opens in place: page tools' cards link out.
 */
const saveFromEditor = async () => {
  await click(card('Image editor'));
  const editor = openModal.mock.calls[0][0].children(jest.fn());
  await act(async () => {
    editor.props.setMedia([PICTURE]);
  });
};

beforeEach(() => {
  providers = [
    { identifier: 'veo3', title: 'Veo 3' },
    { identifier: 'image-text-slides', title: 'Image Text Slides' },
  ];
  integrations = [{ id: 'ig-1', name: 'Instagram' }];
  user = { tier: { ai: true } };
  billingEnabled = true;
  showImageEditor = true;
  providersLoading = false;
  emptyCatalog = false;
  translated.length = 0;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  document.dir = '';
  jest.clearAllMocks();
});

// The page (spec 055, US1 scenarios 1 to 4 and 8, FR-001, FR-004 to FR-007,
// FR-011, FR-016; spec 060 FR-006, FR-007, decisions D25): no intro, the
// search and the category chips on one row, then Tools and then Models, each
// section hidden while it has nothing to show.
describe('the page', () => {
  it('shows the search and the chips on one row, then Tools, then Models', async () => {
    await mount();

    expect(document.body.textContent).not.toContain(
      'Create designs, images and videos for your posts. Everything you make is saved to your Media library.'
    );
    // The search first in the DOM, so first in tab order; flex-row-reverse
    // draws the chips at the start edge in either direction.
    const row = topRow();
    expect(row.children).toHaveLength(2);
    expect(row.children[0].contains(search())).toBe(true);
    expect(row.children[1]).toBe(chipGroup());
    expect(classes(row)).toEqual(
      expect.arrayContaining([
        'flex',
        'flex-row-reverse',
        'items-center',
        'phone:flex-col',
      ])
    );
    expect(classes(chipGroup())).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0'])
    );
    expect(search()!.getAttribute('aria-label')).toBe(
      'Search tools and models'
    );
    expect(chipGroup()?.getAttribute('aria-label')).toBe('Filter by category');
    expect(headings()).toEqual(['Tools', 'Models']);
    expect(section('Tools')!.querySelector('p')?.textContent).toBe(
      'Made for one job, like an image or a slideshow.'
    );
    expect(section('Models')!.querySelector('p')?.textContent).toBe(
      'Choose the exact AI model when you want full control over the result.'
    );
    expect(precedes(row, section('Tools')!)).toBe(true);
    expect(precedes(section('Tools')!, section('Models')!)).toBe(true);
  });

  // In category order, then registry order (research R2).
  it('lists the tools under Tools and Veo 3 under Models', async () => {
    await mount();

    expect(listed('Tools')).toEqual([
      'AI image generator',
      'Image Text Slides',
      'Image editor',
    ]);
    expect(listed('Models')).toEqual(['Veo 3']);
  });

  // FR-011: no coming-soon card, notify-me action, suggest bar, recently used
  // row or made-for filter; the chips and the search are the only controls.
  it('lists only what works today, with no other section or filter', async () => {
    await mount();

    expect(document.querySelectorAll('section')).toHaveLength(2);
    expect(
      document.querySelectorAll('[role="radiogroup"], [role="group"], select')
    ).toHaveLength(1);
    expect(document.querySelectorAll('input')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(
      /coming soon|notify me|suggest|recently used/i
    );
  });

  // FR-010: no sparkle on a card or on the banner, which shows without AI.
  it.each([true, false])(
    'shows no sparkle anywhere, AI on the plan: %s',
    async (ai) => {
      user = { tier: { ai } };
      await mount();

      expect(document.body.textContent).not.toContain('✦');
    }
  );

  // FR-016: on a phone the search spans the width and the chips scroll
  // sideways in one row, with the scrollbar hidden as Samy's attachment row
  // hides it.
  it('stacks the row and keeps the chips in one sideways row on a phone', async () => {
    await mount();

    const row = topRow();
    const searchBox = Array.from(row.children).find((node) =>
      node.contains(search())
    );
    expect(classes(row)).toEqual(
      expect.arrayContaining(['flex', 'phone:flex-col'])
    );
    expect(classes(searchBox)).toEqual(
      expect.arrayContaining(['w-[340px]', 'phone:w-full'])
    );
    expect(classes(chipGroup())).toEqual(
      expect.arrayContaining([
        'flex-wrap',
        'phone:flex-nowrap',
        'phone:overflow-x-auto',
        '[scrollbar-width:none]',
        '[&::-webkit-scrollbar]:hidden',
      ])
    );
  });

  // D4: the Studio page and a tool page list, lock and address the same
  // tools, so both build the catalog through one hook.
  it('builds its catalog through useStudioCatalog, as a tool page does', async () => {
    await mount();

    expect(catalogHook).toHaveBeenCalled();
    expect(listed('Tools')).toEqual([
      'AI image generator',
      'Image Text Slides',
      'Image editor',
    ]);
  });
});

describe('the chips', () => {
  it('offers All and each category holding a listing, with its count and no dot', async () => {
    await mount();

    expect(
      chips().map((node) =>
        Array.from(node.children).map((part) => part.textContent)
      )
    ).toEqual([
      ['All', '4'],
      ['Images', '1'],
      ['Video', '2'],
      ['Edit & enhance', '1'],
    ]);
    expect(chips().some((node) => node.querySelector('svg'))).toBe(false);
  });

  it('checks All on arrival', async () => {
    await mount();

    expect(chips().map((node) => node.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
  });

  // the arrow keys move to the next chip or the one before and pick it,
  // wrapping, the horizontal pair the other way in Arabic, as the chips run.
  it.each([
    ['ltr', 'ArrowRight', 'ArrowLeft'],
    ['rtl', 'ArrowLeft', 'ArrowRight'],
  ])(
    'makes the chips one Tab stop, and in %s moves on with %s and back with %s, picking as it goes, wrapping',
    async (dir, next, back) => {
      document.dir = dir;
      await mount();
      const tabStops = () =>
        chips().map((node) => node.getAttribute('tabindex'));
      expect(tabStops()).toEqual(['0', '-1', '-1', '-1']);

      await press(chips()[0], next);
      expect(document.activeElement).toBe(chips()[1]);
      expect(checkedChips()).toEqual(['Images']);
      expect(tabStops()).toEqual(['-1', '0', '-1', '-1']);

      await press(chips()[1], back);
      expect(checkedChips()).toEqual(['All']);
      // before the first, the last
      await press(chips()[0], back);
      expect(checkedChips()).toEqual(['Edit & enhance']);
      expect(document.activeElement).toBe(chips()[3]);
    }
  );

  it('narrows both sections to the Video chip', async () => {
    await mount();

    await click(chip('Video'));

    expect(checkedChips()).toEqual(['Video']);
    expect(listed('Tools')).toEqual(['Image Text Slides']);
    expect(listed('Models')).toEqual(['Veo 3']);
  });

  it('hides the Models section under the Images chip', async () => {
    await mount();

    await click(chip('Images'));

    expect(listed('Tools')).toEqual(['AI image generator']);
    expect(section('Models')).toBeUndefined();
    expect(headings()).toEqual(['Tools']);
  });

  // data-model §5: the chosen category may have no listing left once the
  // provider list reloads, and its chip goes with it.
  it('treats a chosen chip whose category is gone after a reload as All', async () => {
    await mount();
    await click(chip('Video'));

    providers = [];
    await rerender();

    expect(chipLabels()).toEqual(['All', 'Images', 'Edit & enhance']);
    expect(checkedChips()).toEqual(['All']);
    expect(chip('All')!.getAttribute('tabindex')).toBe('0');
    expect(listed('Tools')).toEqual(['AI image generator', 'Image editor']);
  });
});

describe('the search', () => {
  it('narrows the sections as it is typed, within the chosen chip', async () => {
    await mount();

    await type('image');
    expect(listed('Tools')).toEqual([
      'AI image generator',
      'Image Text Slides',
      'Image editor',
    ]);
    expect(section('Models')).toBeUndefined();

    await type('image e');
    expect(listed('Tools')).toEqual(['Image editor']);

    await click(chip('Video'));
    await type('image');
    expect(listed('Tools')).toEqual(['Image Text Slides']);
    expect(section('Models')).toBeUndefined();
  });

  it('says nothing matches, naming the typed text, and Clear search brings back every tool on All', async () => {
    await mount();
    await click(chip('Video'));

    await type('  zzz ');

    expect(document.querySelectorAll('section')).toHaveLength(0);
    expect(headings()).toEqual(['Nothing matches “⁨zzz⁩”']);
    expect(document.body.textContent).toContain(
      'Try another word, or clear the search to see every tool.'
    );

    await click(button('Clear search'));

    expect(search()!.value).toBe('');
    expect(checkedChips()).toEqual(['All']);
    expect(headings()).toEqual(['Tools', 'Models']);
    expect(button('Clear search')).toBeUndefined();
  });

  // Clear search leaves with the no-match block, so the focus goes to the
  // field rather than falling to the page: a keyboard user types again at once.
  it('puts the focus in the search field after Clear search', async () => {
    await mount();
    await type('zzz');

    button('Clear search')!.focus();
    await click(button('Clear search'));

    expect(document.activeElement).toBe(search());
  });
});

// A card (spec 055, US1 scenarios 5, 6 and 8, FR-008, FR-009, FR-013, FR-015,
// FR-017; research R4 to R7): a sample picture in a 16:9 frame, then the
// listing's text; on a phone, a row with the picture on the start side.
describe('a card', () => {
  it.each([
    ['AI image generator', '/studio/covers/ai-image.webp'],
    ['Image editor', '/studio/covers/image-editor.webp'],
    ['Image Text Slides', '/studio/covers/image-text-slides.webp'],
    ['Veo 3', '/studio/covers/veo3.webp'],
  ])(
    'frames the picture %s declares at 16:9, lazily and as decoration',
    async (name, cover) => {
      await mount();

      const frame = frameOf(name);
      expect(classes(frame)).toEqual(
        expect.arrayContaining([
          'relative',
          'aspect-video',
          'overflow-hidden',
          'bg-surface2',
        ])
      );
      expect(classes(frame)).not.toContain('aspect-[16/10]');
      const picture = frame.querySelector(`img[src="${cover}"]`);
      expect(
        ['width', 'height', 'loading', 'decoding', 'alt'].map((name) =>
          picture?.getAttribute(name)
        )
      ).toEqual(['640', '360', 'lazy', 'async', '']);
      expect(classes(picture)).toContain('object-cover');
      // the 56px tile is gone
      expect(card(name)!.querySelector('[class*="w-[56px]"]')).toBeNull();
    }
  );

  // spec 060 FR-009: the chip above already names the category, so a card
  // carries no category line.
  it.each([
    ['AI image generator', 'Turn a written prompt into a post-ready image.'],
    ['Image Text Slides', 'A narrated slideshow of AI images.'],
    [
      'Image editor',
      'Design and edit images — text, your brand colors, layers.',
    ],
  ])(
    'shows the tool %s’s name and description only',
    async (name, description) => {
      await mount();

      expect(linesOf(name)).toEqual([name, description]);
    }
  );

  // FR-017: a listing that declares no picture asks for none.
  it('shows the placeholder, the listing’s glyph on it, where no picture is declared', async () => {
    providers = [{ identifier: 'avatar-ad', title: 'Avatar Ad' }];
    await mount();

    const frame = frameOf('Avatar Ad');
    expect(frame.querySelector('img')).toBeNull();
    expect(classes(frame)).toEqual(
      expect.arrayContaining(['aspect-video', 'bg-surface2'])
    );
    expect(classes(frame)).not.toContain('aspect-[16/10]');
    expect(glyphOf(frame)?.querySelector('svg')).toBeTruthy();
  });

  it('swaps in that placeholder when the picture fails, and keeps the frame', async () => {
    await mount();

    await fail(frameOf('AI image generator').querySelector('img'));

    const frame = frameOf('AI image generator');
    expect(frame.querySelector('img')).toBeNull();
    expect(classes(frame)).toContain('aspect-video');
    expect(classes(frame)).not.toContain('aspect-[16/10]');
    expect(glyphOf(frame)?.querySelector('svg')).toBeTruthy();
  });

  // US1 scenario 5, FR-009.
  describe('a model with a maker', () => {
    it('puts the maker’s logo on a white plate at the picture’s start-bottom corner', async () => {
      await mount();

      const logo = frameOf('Veo 3').querySelector(
        'img[src="/studio/makers/google.svg"]'
      );
      expect(logo?.getAttribute('alt')).toBe('');
      expect(classes(logo!.parentElement)).toEqual(
        expect.arrayContaining([
          'absolute',
          'bottom-[10px]',
          'start-[10px]',
          'bg-white',
          'shadow-soft',
        ])
      );
    });

    // research R4: the maker line stands in for the category line.
    it('says who made it, the name isolated, in place of the category line', async () => {
      await mount();

      expect(linesOf('Veo 3').slice(0, 3)).toEqual([
        'Veo 3',
        'by ⁨Google⁩ · Video',
        'One continuous live-action shot.',
      ]);
      expect(
        translated.find((call) => call.key === 'studio_model_by')?.params
      ).toEqual({
        maker: '⁨Google⁩',
        category: 'Video',
        interpolation: { escapeValue: false },
      });
    });

    it('lists its facts as small chips', async () => {
      await mount();

      const facts = Array.from(textOf('Veo 3').children[3].children);
      expect(facts.map((node) => node.textContent)).toEqual([
        '~8 s',
        '1080p',
        'Sound',
      ]);
      facts.forEach((node) =>
        expect(classes(node)).toEqual(
          expect.arrayContaining(['text-[12px]', 'bg-panel'])
        )
      );
    });

    it('marks the picture as a video, its length at the end-bottom corner', async () => {
      await mount();

      const frame = frameOf('Veo 3');
      expect(playBadge(frame)).toBeTruthy();
      const length = Array.from(frame.children).find((node) =>
        classes(node).includes('end-[10px]')
      );
      expect(classes(length)).toEqual(
        expect.arrayContaining([
          'absolute',
          'bottom-[10px]',
          'bg-black/70',
          'text-white',
        ])
      );
      // The box follows the page, so its end is the left in Arabic; with
      // dir="ltr" on it, end- was the right and it sat on the maker's plate
      // (live walk 2026-11-11). Only the digits run left to right.
      expect(length?.hasAttribute('dir')).toBe(false);
      expect(length?.getAttribute('aria-hidden')).toBe('true');
      const digits = length?.querySelector('bdi');
      expect(digits?.getAttribute('dir')).toBe('ltr');
      expect(digits?.textContent).toBe('0:08');
    });

    // live walk 2026-11-11: the length sits in the picture, before the name,
    // so a screen reader announced "0:08 Veo 3 …".
    it('is announced by its name first, the length left to the eye', async () => {
      await mount();

      expect(nameOf(card('Veo 3')!)).toMatch(/^Veo 3/);
    });

    // FR-009, FR-017: a picture that fails leaves the placeholder, which has
    // no sample behind it to time.
    it('keeps the play mark and drops the length when the picture fails', async () => {
      await mount();

      await fail(
        frameOf('Veo 3').querySelector('img[src="/studio/covers/veo3.webp"]')
      );

      const frame = frameOf('Veo 3');
      expect(
        frame.querySelector('img[src="/studio/covers/veo3.webp"]')
      ).toBeNull();
      expect(classes(frame)).toEqual(
        expect.arrayContaining(['aspect-video', 'bg-surface2'])
      );
      expect(classes(frame)).not.toContain('aspect-[16/10]');
      expect(playBadge(frame)).toBeTruthy();
      expect(frame.textContent).not.toContain('0:08');
    });

    // research R6
    it('drops the plate when the logo fails, and keeps the maker line', async () => {
      await mount();

      await fail(
        frameOf('Veo 3').querySelector('img[src="/studio/makers/google.svg"]')
      );

      expect(
        frameOf('Veo 3').querySelector('img[src="/studio/makers/google.svg"]')
      ).toBeNull();
      expect(
        Array.from(frameOf('Veo 3').querySelectorAll('*')).some((node) =>
          classes(node).includes('bg-white')
        )
      ).toBe(false);
      expect(linesOf('Veo 3')[1]).toBe('by ⁨Google⁩ · Video');
    });
  });

  // FR-009, research R4: a model with no maker has no "by" line, and as a
  // tool no category line (spec 060 FR-009).
  it('gives a model with no maker no plate and no maker line, only its name and description', async () => {
    providers = [{ identifier: 'sora', title: 'Sora' }];
    await mount();

    expect(linesOf('Sora')).toEqual(['Sora', 'Generate a video with AI.']);
    expect(frameOf('Sora').querySelector('img')).toBeNull();
  });

  // FR-009 as reworded 2026-11-10. The play mark stands where the glyph would,
  // since both are centred and one would cover the other.
  it('draws the play mark on the placeholder of a provider Studio does not know, with no length', async () => {
    providers = [{ identifier: 'sora', title: 'Sora' }];
    await mount();

    const frame = frameOf('Sora');
    expect(classes(frame)).toEqual(
      expect.arrayContaining(['relative', 'aspect-video', 'bg-surface2'])
    );
    expect(classes(frame)).not.toContain('aspect-[16/10]');
    expect(playBadge(frame)).toBeTruthy();
    expect(frame.querySelector('[dir="ltr"]')).toBeNull();
    expect(frame.querySelector('svg')).toBeNull();
  });

  // FR-013, US1 scenario 6: the word with a glyph, so the lock survives a
  // reader who is not reading.
  it('badges a locked card’s picture with a lock and Upgrade, white on dark', async () => {
    user = { tier: { ai: false } };
    await mount();

    const badge = Array.from(frameOf('Veo 3').children).find(
      (node) => node.textContent === 'Upgrade'
    );
    expect(badge?.querySelector('svg')).toBeTruthy();
    expect(classes(badge)).toEqual(
      expect.arrayContaining([
        'absolute',
        'top-[10px]',
        'start-[10px]',
        'bg-black/70',
        'text-white',
      ])
    );
    expect(
      card('Veo 3')!.querySelector('[class*="text-brandText"]')
    ).toBeNull();
  });

  // research R14: badges, plate and length mirror in Arabic.
  it('places everything on the picture by logical sides only', async () => {
    user = { tier: { ai: false } };
    await mount();

    const names = [
      card('Veo 3')!,
      ...Array.from(card('Veo 3')!.querySelectorAll('*')),
    ].flatMap(classes);
    expect(
      names.filter((name) =>
        /(^|:)(left|right|m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-[tb][lr])-/.test(
          name
        )
      )
    ).toEqual([]);
  });

  // FR-015, US1 scenario 8: on a phone a row, the picture first, so on the
  // start side in either direction; the maker line stays.
  it('becomes a row on a phone, without its facts', async () => {
    await mount();

    expect(classes(card('Veo 3'))).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'phone:flex-row'])
    );
    expect(classes(frameOf('Veo 3'))).toEqual(
      expect.arrayContaining([
        'shrink-0',
        'phone:w-[128px]',
        'phone:aspect-auto',
        'phone:min-h-[100px]',
      ])
    );
    expect(classes(textOf('Veo 3').children[3])).toContain('phone:hidden');
    expect(classes(textOf('Veo 3').children[1])).not.toContain('phone:hidden');
  });

  // FR-015, research R7, spec 060 FR-008: five across at 1440, one column on
  // a phone.
  it('lays the cards out in a grid that fills the width', async () => {
    await mount();

    expect(classes(section('Tools')!.children[1])).toEqual(
      expect.arrayContaining([
        'grid',
        'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]',
        'gap-[16px]',
        'phone:grid-cols-1',
      ])
    );
  });

  // FR-032, research R15: with reduced motion a card gains its shadow and
  // does not move.
  it('lifts a card on hover only where motion is welcome', async () => {
    await mount();

    const names = classes(card('AI image generator'));
    expect(names).toEqual(
      expect.arrayContaining([
        'motion-safe:hover:-translate-y-[2px]',
        'hover:shadow-card',
      ])
    );
    expect(names.filter((name) => /^hover:-translate-y-/.test(name))).toEqual(
      []
    );
  });
});

describe('opening a card', () => {
  // No chooser and no window (FR-001): each video card is a link to its own
  // provider's page, the grid's cell itself, Image Text Slides under Tools
  // and Veo 3 under Models.
  it('gives each video provider a card that links to its own page, /studio/<slug>, the link the card’s root', async () => {
    await mount();

    expect(
      ['Image Text Slides', 'Veo 3'].map((name) => [
        card(name)!.tagName,
        card(name)!.getAttribute('href'),
      ])
    ).toEqual([
      ['A', '/studio/image-text-slides'],
      ['A', '/studio/veo3'],
    ]);
    expect(card('Image Text Slides')!.parentElement).toBe(
      section('Tools')!.children[1]
    );
    expect(card('Veo 3')!.parentElement).toBe(section('Models')!.children[1]);
  });

  // FR-033: the link carries what the button carried, so the card looks and
  // takes the focus as before, and holds no second control.
  it('puts the card’s classes and focus ring on each page tool’s link, with no button inside it', async () => {
    await mount();

    expect(card('AI image generator')!.getAttribute('href')).toBe(
      '/studio/ai-image'
    );
    ['AI image generator', 'Image Text Slides', 'Veo 3'].forEach((name) => {
      const link = card(name)!;
      expect(link.tagName).toBe('A');
      expect(classes(link)).toEqual(
        expect.arrayContaining([
          'flex',
          'flex-col',
          'phone:flex-row',
          'text-start',
          'bg-surface',
          'border',
          'border-line',
          'rounded-[12px]',
          'overflow-hidden',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
      expect(link.querySelector('button, a')).toBeNull();
    });
  });

  it('opens the image editor in one click', async () => {
    await mount();

    await click(card('Image editor'));

    expect(openModal).toHaveBeenCalledTimes(1);
    const [params] = openModal.mock.calls[0];
    expect(params.title).toBe('Design Media');
    const editor = params.children(jest.fn());
    expect(editor.props.closeModal).toEqual(expect.any(Function));
    expect(editor.props.setMedia).toEqual(expect.any(Function));
  });
});

// The results this page receives come from the image editor's window; a page
// tool raises its own notice on its page.
describe('when a creation finishes', () => {
  it('confirms where it went and opens nothing on its own', async () => {
    await mount();

    await saveFromEditor();

    expect(toast).toHaveBeenCalledWith('Saved to your Media library', 'success');
    // the editor's own window, and nothing after it
    expect(openModal).toHaveBeenCalledTimes(1);
  });

  it('offers a post with the result already attached', async () => {
    await mount();

    await saveFromEditor();
    await click(button('Create a post'));

    expect(openModal).toHaveBeenCalledTimes(2);
    const editor = openModal.mock.calls[1][0].children;
    expect(editor.props.onlyValues).toEqual([
      { content: '', id: expect.any(String), image: [PICTURE] },
    ]);
    expect(editor.props.allIntegrations).toEqual(integrations);
    expect(editor.props.integrations).toEqual(integrations);
  });

  it('withdraws the offer once that post is saved', async () => {
    await mount();
    await saveFromEditor();
    await click(button('Create a post'));

    const editor = openModal.mock.calls[1][0].children;
    await act(async () => {
      editor.props.mutate();
    });

    expect(button('Create a post')).toBeUndefined();
  });

  it('lets the offer be put away', async () => {
    await mount();
    await saveFromEditor();

    await click(document.querySelector('button[aria-label="Close"]'));

    expect(button('Create a post')).toBeUndefined();
  });

  // The editor renders nothing at all without a channel, and it opens with
  // no close button — an offer here would lead into a blank full-screen modal.
  it('keeps the offer to itself when there is no channel to post to', async () => {
    integrations = [];
    await mount();

    await saveFromEditor();

    expect(toast).toHaveBeenCalledWith('Saved to your Media library', 'success');
    expect(button('Create a post')).toBeUndefined();
  });
});

// D4: the notice's Create a post, which a tool page hands its tool as well.
describe('useCreatePost', () => {
  let createPost: ReturnType<typeof useCreatePost>;
  const Host = (): null => {
    createPost = useCreatePost();
    return null;
  };

  it('opens the post editor with the media attached and today’s options', async () => {
    await mount(<Host />);
    const onDone = jest.fn();

    await act(async () => {
      createPost!(PICTURE, onDone);
    });

    expect(openModal).toHaveBeenCalledTimes(1);
    const [params] = openModal.mock.calls[0];
    expect(params).toEqual(
      expect.objectContaining({
        id: 'add-edit-modal',
        closeOnClickOutside: false,
        removeLayout: true,
        closeOnEscape: false,
        withCloseButton: false,
        askClose: true,
        fullScreen: true,
        size: '80%',
      })
    );
    const editor = params.children;
    expect(editor.type).toBe(AddEditModal);
    expect(editor.props).toEqual(
      expect.objectContaining({
        allIntegrations: integrations,
        integrations,
        onlyValues: [{ content: '', id: expect.any(String), image: [PICTURE] }],
        reopenModal: expect.any(Function),
      })
    );
    editor.props.mutate();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // A tool page hands it on as onCreatePost, which gives the media alone, and
  // the editor calls mutate once the post is saved.
  it('lets that post be saved when nothing waits on it', async () => {
    await mount(<Host />);

    await act(async () => {
      createPost!(PICTURE);
    });

    const editor = openModal.mock.calls[0][0].children;
    expect(() => editor.props.mutate()).not.toThrow();
  });

  it('is undefined while there is no channel to post to', async () => {
    integrations = [];
    await mount(<Host />);

    expect(createPost).toBeUndefined();
  });
});

// SHOW_IMAGE_EDITOR unset: this deployment does not offer the editor, so it is
// absent rather than locked, and Edit & enhance, left with nothing, goes with
// it.
describe('while the image editor is switched off', () => {
  beforeEach(() => {
    showImageEditor = false;
  });

  it('lists neither the image editor nor its Edit & enhance chip', async () => {
    await mount();

    expect(card('Image editor')).toBeUndefined();
    expect(chipLabels()).toEqual(['All', 'Images', 'Video']);
  });

  it('does not show it locked to a plan that excludes the tools either', async () => {
    user = { tier: { ai: false } };
    await mount();

    expect(card('Image editor')).toBeUndefined();
    expect(lockedCards()).toHaveLength(3);
  });
});

describe('with nothing to list', () => {
  it('shows the teaching empty state', async () => {
    emptyCatalog = true;
    await mount();

    expect(headings()).toEqual(['No creative tools yet']);
    expect(card('Image editor')).toBeUndefined();
    expect(search()).toBeNull();
    expect(chipGroup()).toBeNull();
  });
});

describe('when the plan excludes the tools', () => {
  beforeEach(() => {
    user = { tier: { ai: false } };
  });

  it('keeps every excluded tool on the page rather than hiding it', async () => {
    await mount();

    expect(headings()).toEqual(['Tools', 'Models']);
    expect(lockedCards()).toHaveLength(4);
    expect(card('Veo 3')?.textContent).toContain('Upgrade');
  });

  // FR-013: a tool page opens locked with Upgrade in its bar, so a locked
  // card leads there as an entitled one does, and keeps its badge.
  it('links each locked page tool’s card to its page all the same, its badge kept', async () => {
    await mount();

    expect(
      ['AI image generator', 'Image Text Slides', 'Veo 3'].map((name) => [
        card(name)!.tagName,
        card(name)!.getAttribute('href'),
        Array.from(frameOf(name).children).some(
          (node) => node.textContent === 'Upgrade'
        ),
      ])
    ).toEqual([
      ['A', '/studio/ai-image', true],
      ['A', '/studio/image-text-slides', true],
      ['A', '/studio/veo3', true],
    ]);
    expect(card('Veo 3')!.querySelector('button')).toBeNull();
  });

  // The image editor opens in a window, so locked it is never mounted behind
  // its card, which leads to billing instead.
  it('still leads the locked image editor to billing, its window unopened', async () => {
    await mount();

    await click(card('Image editor'));

    expect(push).toHaveBeenCalledWith('/billing');
    expect(openModal).not.toHaveBeenCalled();
  });

  it('carries exactly one upgrade action, at the top of the page', async () => {
    await mount();

    expect(document.body.textContent).toContain('Unlock AI images and video');
    expect(upgradeActions()).toHaveLength(1);

    const [banner] = upgradeActions();
    expect(precedes(banner, search()!)).toBe(true);
  });

  it('sends that action to billing', async () => {
    await mount();

    await click(upgradeActions()[0]);

    expect(push).toHaveBeenCalledWith('/billing');
  });
});

describe('when nothing is locked', () => {
  it('shows no chip and no banner on a plan that includes the tools', async () => {
    await mount();

    expect(lockedCards()).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Upgrade');
  });

  it('shows no chip and no banner while billing is off', async () => {
    user = { tier: { ai: false } };
    billingEnabled = false;
    await mount();

    expect(lockedCards()).toHaveLength(0);
    expect(document.body.textContent).not.toContain('Upgrade');
  });
});

describe('the video catalog follows the platform', () => {
  it('lists one card per provider offered', async () => {
    await mount();

    await click(chip('Video'));

    expect(cards()).toHaveLength(2);
  });

  it('lists one when one is offered', async () => {
    providers = [{ identifier: 'veo3', title: 'Veo3 (Audio + Video)' }];
    await mount();

    await click(chip('Video'));

    expect(cards()).toHaveLength(1);
    expect(card('Veo 3')).toBeTruthy();
  });

  it('omits the category when none is offered', async () => {
    providers = [];
    await mount();

    expect(chipLabels()).toEqual(['All', 'Images', 'Edit & enhance']);
    expect(section('Models')).toBeUndefined();
  });

  // A provider that ships before its card does still gets a usable card: its
  // endpoint title and the generic line, never the prose written for the agent.
  it('names a provider without a card by its endpoint title', async () => {
    providers = [
      {
        identifier: 'sora',
        title: 'Sora',
        description: 'Generates a video. Use this when the user…',
      },
    ];
    await mount();

    // A provider that declares nothing for Studio is a model (FR-002).
    expect(listed('Models')).toEqual(['Sora']);
    const only = card('Sora')!;
    expect(only.textContent).toContain('Sora');
    expect(only.textContent).toContain('Generate a video with AI.');
    expect(only.textContent).not.toContain('Use this when');
  });

  it('draws the rest of the page while the list is still loading', async () => {
    providers = undefined;
    providersLoading = true;
    await mount();

    expect(chipLabels()).toEqual(['All', 'Images', 'Edit & enhance']);
    expect(headings()).toEqual(['Tools']);
    expect(card('Image editor')).toBeTruthy();
    // no video card while the list loads
    expect(listed('Tools')).toEqual(['AI image generator', 'Image editor']);
  });
});

// Studio was built at 12/13/14/15px against a product whose dominant tier is
// 14px and whose billing page sets body copy at 16 — it read as a smaller
// application than the one around it (2026-09-20). Each tier moves one step and
// nothing renders below 13.
//
// The card's two lines are asserted rather than the page's, because the card is
// the repeated object: a tier that moved on a heading but not on the card would
// look fixed on a screenshot of the top of the page and wrong everywhere else.
describe('the type scale', () => {
  // Scoped to the card rather than the document: the upsell banner carries the
  // same two tiers, so an unscoped lookup could pass on the wrong element.
  const lineOf = (name: string, text: string) =>
    Array.from(card(name)!.querySelectorAll('span')).find(
      (node) => node.textContent === text
    )!.className;

  // spec 060 FR-009: the category line is gone, a model keeps its maker line.
  it('sets a model’s maker line at 12px, muted', async () => {
    await mount();

    const maker = lineOf('Veo 3', 'by ⁨Google⁩ · Video');
    expect(maker).toContain('text-[12px]');
    expect(maker).toContain('text-muted');
  });

  // Long names (German, Portuguese, long Arabic) wrap to two lines at most.
  it('sets the card name at 15px, on two lines at most', async () => {
    await mount();

    const name = lineOf('AI image generator', 'AI image generator');
    expect(name).toContain('text-[15px]');
    expect(name).toContain('line-clamp-2');
  });

  // Cut after two lines and held at their height, so a row of cards keeps one
  // height.
  it('sets the card description at 13px, two lines held whatever its length', async () => {
    await mount();

    const description = lineOf(
      'AI image generator',
      'Turn a written prompt into a post-ready image.'
    );
    expect(description).toContain('text-[13px]');
    expect(description).toContain('line-clamp-2');
    expect(description).toContain('min-h-[3em]');
  });

  // The canvas's section head: a 20px semibold heading, its subtitle at 13px
  // beside it (spec 060 FR-010).
  it('sets the section heading at 20px semibold and its subtitle at 13px', async () => {
    await mount();

    expect(classes(section('Tools')!.querySelector('h2'))).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
    expect(classes(section('Tools')!.querySelector('p'))).toContain(
      'text-[13px]'
    );
  });
});

// Spec 059 (FR-026, FR-033 to FR-035, contracts/inventory.md D, E and G): the
// chips are the dashboard's one chip look, the search the page's 40px field
// rather than a side panel's 36px, the cards' corners 12px, and Create a
// post's icon 6px from its label. A chip is CHIP plus CHIP_ON or CHIP_IDLE,
// whole and alone, never both, as Tailwind emits the idle colours after the
// current ones; its count is CHIP_COUNT plus CHIP_COUNT_ON or CHIP_COUNT_IDLE.
describe("the dashboard's one look", () => {
  const words = (value: string) => value.split(' ');
  // Which half a node carries over its base: 'on', 'idle', or 'mixed' for
  // anything else.
  const half = (
    node: Element | undefined,
    base: string,
    on: string,
    idle: string
  ) => {
    const own = classes(node);
    expect(own).toEqual(expect.arrayContaining(words(base)));
    const has = (part: string) =>
      words(part).filter((name) => own.includes(name)).length;
    if (has(on) === words(on).length && !has(idle)) return 'on';
    if (has(idle) === words(idle).length && !has(on)) return 'idle';
    return 'mixed';
  };
  const looks = () =>
    chips().map((node) => [
      half(node, CHIP, CHIP_ON, CHIP_IDLE),
      half(node.children[1], CHIP_COUNT, CHIP_COUNT_ON, CHIP_COUNT_IDLE),
    ]);

  it('draws the chips and their counts in the chip look, All current on arrival and the current one moving with a click', async () => {
    await mount();

    expect(looks()).toEqual([
      ['on', 'on'],
      ['idle', 'idle'],
      ['idle', 'idle'],
      ['idle', 'idle'],
    ]);

    await click(chip('Video'));

    expect(looks()).toEqual([
      ['idle', 'idle'],
      ['idle', 'idle'],
      ['on', 'on'],
      ['idle', 'idle'],
    ]);
  });

  it("draws the search as the page's 40px field, not a side panel's 36px", async () => {
    await mount();

    expect(classes(search())).toEqual(
      expect.arrayContaining(['h-[40px]', 'coarse:h-[44px]'])
    );
    expect(classes(search())).not.toContain('h-[36px]');
  });

  it('rounds every card and the no-match box at 12px', async () => {
    await mount();

    expect(cards()).toHaveLength(4);
    cards().forEach((node) => {
      expect(classes(node)).toContain('rounded-[12px]');
      expect(classes(node)).not.toContain('rounded-[14px]');
    });

    await type('zzz');
    const box = document.querySelector('.border-dashed');

    expect(classes(box)).toContain('rounded-[12px]');
    expect(classes(box)).not.toContain('rounded-[14px]');
  });

  it("puts Create a post's 16px plus 6px from its label", async () => {
    await mount();
    await saveFromEditor();
    const inner = button('Create a post')!.children[0];

    expect(classes(inner)).toContain('gap-[6px]');
    expect(classes(inner)).not.toContain('gap-[8px]');
    expect(inner.querySelector('svg')!.getAttribute('width')).toBe('16');
  });
});
