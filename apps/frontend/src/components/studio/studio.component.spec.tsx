import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

type Media = { id: string; path: string };
/** What the page hands each AI tool: a result sink and its own card as trigger. */
type Trigger = {
  onChange: (media: Media) => void;
  renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  only?: string;
  destination?: string;
};

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
const videoTriggers: Trigger[] = [];
const imageTriggers: Trigger[] = [];
const push = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  // The fallback with {{var}} filled in, because that is what t() renders.
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
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
// The two AI tools stand in for themselves as triggers whose "open" completes
// at once, so the page's own wiring — the trigger it renders, the provider it
// seeds, what it does with a result — is all that is under test here. Their
// own behaviour has specs of its own.
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
};
const registryCard = (identifier: string) => registryCards[identifier];

jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: (props: Trigger) => {
    imageTriggers.push(props);
    return props.renderTrigger(
      () => props.onChange({ id: 'img-1', path: 'https://media/img-1.png' }),
      false
    );
  },
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: (props: Trigger) => {
    videoTriggers.push(props);
    return props.renderTrigger(
      () => props.onChange({ id: 'vid-1', path: 'https://media/vid-1.mp4' }),
      false
    );
  },
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
// The catalog has its own spec; the page only needs a way to be handed an
// empty one, which no real deployment produces while the fixed tools exist.
jest.mock('@gitroom/frontend/components/studio/studio.tools', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/studio/studio.tools'
  );
  return {
    ...actual,
    buildStudioCatalog: (params: unknown) =>
      emptyCatalog
        ? { listings: [], chips: [], hasLockedTools: false, empty: true }
        : actual.buildStudioCatalog(params),
  };
});

import { StudioComponent } from '@gitroom/frontend/components/studio/studio.component';

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<StudioComponent />);
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
const card = (name: string) =>
  buttons().find((node) => node.textContent?.includes(name));
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
  Array.from(section(heading)?.querySelectorAll('button') ?? []).map((node) =>
    NAMES.find((name) => node.textContent?.includes(name))
  );
/** A card carrying the chip. Cards live in a section; the banner does not. */
const lockedCards = () =>
  Array.from(document.querySelectorAll('section button')).filter((node) =>
    node.textContent?.includes('Upgrade')
  );
/** The banner's Upgrade action: the chips carry the word too, inside a card. */
const upgradeActions = () =>
  buttons().filter((node) => node.textContent?.trim() === 'Upgrade');
const introLine = () => document.querySelector('p');
const search = () =>
  document.querySelector<HTMLInputElement>('input[type="search"]');
const chipGroup = () => document.querySelector('[role="radiogroup"]');
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
  videoTriggers.length = 0;
  imageTriggers.length = 0;
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
// FR-011, FR-016): the intro and the search on one row, the category chips,
// then Tools and then Models, each section hidden while it has nothing to show.
describe('the page', () => {
  it('shows the intro and the search on one row, then the chips, then Tools, then Models', async () => {
    await mount();

    const row = introLine()!.parentElement!;
    expect(introLine()!.textContent).toBe(
      'Create designs, images and videos for your posts. Everything you make is saved to your Media library.'
    );
    expect(row.contains(search())).toBe(true);
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
    expect(precedes(row, chipGroup()!)).toBe(true);
    expect(precedes(chipGroup()!, section('Tools')!)).toBe(true);
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

    const row = introLine()!.parentElement!;
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
});

describe('opening a card', () => {
  // No chooser: each video card is its own provider's trigger.
  it('gives each video provider a card that opens that provider alone', async () => {
    await mount();

    expect(videoTriggers.map((props) => props.only)).toEqual([
      'veo3',
      'image-text-slides',
    ]);
  });

  // Nothing is being composed on this page, so the generators must not promise
  // a post they cannot deliver — their waiting screens name the Media library.
  it('tells every generator its result is not going into a post', async () => {
    await mount();

    expect(imageTriggers.map((props) => props.destination)).toEqual(['media']);
    expect(videoTriggers.map((props) => props.destination)).toEqual([
      'media',
      'media',
    ]);
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

describe('when a creation finishes', () => {
  it('confirms where it went and opens nothing on its own', async () => {
    await mount();

    await click(card('AI image generator'));

    expect(toast).toHaveBeenCalledWith('Saved to your Media library', 'success');
    expect(openModal).not.toHaveBeenCalled();
  });

  it('offers a post with the result already attached', async () => {
    await mount();

    await click(card('Veo 3'));
    await click(button('Create a post'));

    expect(openModal).toHaveBeenCalledTimes(1);
    const editor = openModal.mock.calls[0][0].children;
    expect(editor.props.onlyValues).toEqual([
      {
        content: '',
        id: expect.any(String),
        image: [{ id: 'vid-1', path: 'https://media/vid-1.mp4' }],
      },
    ]);
    expect(editor.props.allIntegrations).toEqual(integrations);
    expect(editor.props.integrations).toEqual(integrations);
  });

  it('withdraws the offer once that post is saved', async () => {
    await mount();
    await click(card('Veo 3'));
    await click(button('Create a post'));

    const editor = openModal.mock.calls[0][0].children;
    await act(async () => {
      editor.props.mutate();
    });

    expect(button('Create a post')).toBeUndefined();
  });

  it('lets the offer be put away', async () => {
    await mount();
    await click(card('AI image generator'));

    await click(document.querySelector('button[aria-label="Close"]'));

    expect(button('Create a post')).toBeUndefined();
  });

  // The editor renders nothing at all without a channel, and it opens with
  // no close button — an offer here would lead into a blank full-screen modal.
  it('keeps the offer to itself when there is no channel to post to', async () => {
    integrations = [];
    await mount();

    await click(card('AI image generator'));

    expect(toast).toHaveBeenCalledWith('Saved to your Media library', 'success');
    expect(button('Create a post')).toBeUndefined();
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

  // The chip says it with a glyph as well as a word, so the lock survives a
  // reader who is not reading.
  it('marks a locked card with a lock glyph beside the word', async () => {
    await mount();

    expect(card('Veo 3')?.querySelectorAll('svg')).toHaveLength(2);
  });

  it('leads a locked card to billing and never opens the tool', async () => {
    await mount();

    await click(card('Veo 3'));

    expect(push).toHaveBeenCalledWith('/billing');
    expect(openModal).not.toHaveBeenCalled();
    // The tool is not even mounted behind the card, so there is nothing to open.
    expect(videoTriggers).toHaveLength(0);
  });

  it('carries exactly one upgrade action, at the top of the page', async () => {
    await mount();

    expect(document.body.textContent).toContain('Unlock AI images and video');
    expect(upgradeActions()).toHaveLength(1);

    const [banner] = upgradeActions();
    expect(precedes(banner, introLine()!)).toBe(true);
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

    expect(document.querySelectorAll('section button')).toHaveLength(2);
  });

  it('lists one when one is offered', async () => {
    providers = [{ identifier: 'veo3', title: 'Veo3 (Audio + Video)' }];
    await mount();

    await click(chip('Video'));

    expect(document.querySelectorAll('section button')).toHaveLength(1);
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
    expect(videoTriggers).toHaveLength(0);
  });
});

// Studio was built at 12/13/14/15px against a product whose dominant tier is
// 14px and whose billing page sets body copy at 16 — it read as a smaller
// application than the one around it (2026-09-20). Each tier moves one step and
// nothing renders below 13.
//
// The card's two lines are asserted rather than the page's, because the card is
// the repeated object: a tier that moved on the intro but not on the card would
// look fixed on a screenshot of the top of the page and wrong everywhere else.
describe('the type scale', () => {
  // Scoped to the card rather than the document: the upsell banner carries the
  // same two tiers, so an unscoped lookup could pass on the wrong element.
  const lineOf = (name: string, text: string) =>
    Array.from(card(name)!.querySelectorAll('span')).find(
      (node) => node.textContent === text
    )!.className;

  it('sets the card name at 15px', async () => {
    await mount();

    expect(lineOf('AI image generator', 'AI image generator')).toContain(
      'text-[15px]'
    );
  });

  it('sets the card description at 13px', async () => {
    await mount();

    expect(
      lineOf('AI image generator', 'Turn a written prompt into a post-ready image.')
    ).toContain('text-[13px]');
  });

  // The canvas's section head: an 18px heading, its subtitle at 13px beside it.
  it('sets the section heading at 18px and its subtitle at 13px', async () => {
    await mount();

    expect(classes(section('Tools')!.querySelector('h2'))).toContain(
      'text-[18px]'
    );
    expect(classes(section('Tools')!.querySelector('p'))).toContain(
      'text-[13px]'
    );
  });

  it('sets the page intro at 14px and lets it run', async () => {
    await mount();
    const intro = document.querySelector('p')!;

    expect(intro.className).toContain('text-[14px]');
    // Fix 04: a one-sentence subtitle capped at 72ch broke onto two lines at
    // every desktop width. It is a subtitle, not a paragraph.
    expect(intro.className).not.toContain('max-w-[72ch]');
  });
});
