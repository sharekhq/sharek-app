import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

type Media = { id: string; path: string };
/** What the page hands each AI tool: a result sink and its own card as trigger. */
type Trigger = {
  onChange: (media: Media) => void;
  renderTrigger: (open: () => void, loading: boolean) => ReactNode;
  only?: string;
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
let emptyCatalog = false;
const videoTriggers: Trigger[] = [];
const push = jest.fn();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled }),
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
// The registry knows Veo 3 and nothing else here, so a provider with a card
// and a provider without one can be told apart.
const veo3Card = {
  name: { key: 'video_type_veo3', fallback: 'Veo 3' },
  description: {
    key: 'video_type_veo3_desc',
    fallback: 'One continuous live-action shot.',
  },
  pills: [],
  diagram: null,
};
const registryCard = (identifier: string) =>
  identifier === 'veo3' ? veo3Card : undefined;

jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: ({ onChange, renderTrigger }: Trigger) =>
    renderTrigger(
      () => onChange({ id: 'img-1', path: 'https://media/img-1.png' }),
      false
    ),
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
        ? { categories: [], hasLockedTools: false, empty: true }
        : actual.buildStudioCatalog(params),
  };
});

import { StudioComponent } from '@gitroom/frontend/components/studio/studio.component';

const mounted: Array<{ unmount: () => void }> = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<StudioComponent />);
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
const videoCards = () =>
  Array.from(section('AI video')?.querySelectorAll('button') ?? []);
/** A card carrying the chip. Cards live in a category section; the banner does not. */
const lockedCards = () =>
  Array.from(document.querySelectorAll('section button')).filter((node) =>
    node.textContent?.includes('Upgrade')
  );
/** The banner's Upgrade action: the chips carry the word too, inside a card. */
const upgradeActions = () =>
  buttons().filter((node) => node.textContent?.trim() === 'Upgrade');
const tile = (name: string) =>
  Array.from(card(name)?.querySelectorAll('span') ?? []).find((node) =>
    node.className.includes('w-[56px]')
  );

beforeEach(() => {
  providers = [
    { identifier: 'veo3', title: 'Veo 3' },
    { identifier: 'image-text-slides', title: 'Image Text Slides' },
  ];
  integrations = [{ id: 'ig-1', name: 'Instagram' }];
  user = { tier: { ai: true } };
  billingEnabled = true;
  providersLoading = false;
  emptyCatalog = false;
  videoTriggers.length = 0;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('the catalog', () => {
  it('lists every category with its tools', async () => {
    await mount();

    expect(headings()).toEqual(['Design', 'AI images', 'AI video']);
    for (const name of [
      'Image editor',
      'AI image generator',
      'Veo 3',
      'Image Text Slides',
    ]) {
      expect(card(name)).toBeTruthy();
    }
  });

  // No chooser: each video card is its own provider's trigger.
  it('gives each video provider a card that opens that provider alone', async () => {
    await mount();

    expect(videoTriggers.map((props) => props.only)).toEqual([
      'veo3',
      'image-text-slides',
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

describe('with nothing to list', () => {
  it('shows the teaching empty state', async () => {
    emptyCatalog = true;
    await mount();

    expect(headings()).toEqual(['No creative tools yet']);
    expect(card('Image editor')).toBeUndefined();
  });
});

describe('when the plan excludes the tools', () => {
  beforeEach(() => {
    user = { tier: { ai: false } };
  });

  it('keeps every excluded tool on the page rather than hiding it', async () => {
    await mount();

    expect(headings()).toEqual(['Design', 'AI images', 'AI video']);
    expect(lockedCards()).toHaveLength(4);
    expect(card('Veo 3')?.textContent).toContain('Upgrade');
  });

  // The chip says it with a glyph as well as a word, so the lock survives a
  // reader who is not reading.
  it('marks a locked card with a lock glyph beside the word', async () => {
    await mount();

    expect(card('Veo 3')?.querySelectorAll('svg')).toHaveLength(2);
  });

  // Colour alone never carries the AI mark (FR-004), so the tint goes and the
  // spark stays when a tool is out of reach.
  it('drops the AI tint but keeps the spark', async () => {
    await mount();

    expect(tile('Veo 3')?.className).not.toContain('bg-aiSoft');
    expect(tile('Veo 3')?.className).toContain('bg-surface2');
    expect(tile('Veo 3')?.textContent).toContain('\u2726');
  });

  it('leads a locked card to billing and never opens the tool', async () => {
    await mount();

    await click(card('Veo 3'));

    expect(push).toHaveBeenCalledWith('/billing');
    expect(openModal).not.toHaveBeenCalled();
    // The tool is not even mounted behind the card, so there is nothing to open.
    expect(videoTriggers).toHaveLength(0);
  });

  it('carries exactly one upgrade action, above the categories', async () => {
    await mount();

    expect(document.body.textContent).toContain('Unlock AI images and video');
    expect(upgradeActions()).toHaveLength(1);

    const [banner] = upgradeActions();
    const [firstCategory] = document.querySelectorAll('h2');
    expect(
      banner.compareDocumentPosition(firstCategory) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

    expect(videoCards()).toHaveLength(2);
  });

  it('lists one when one is offered', async () => {
    providers = [{ identifier: 'veo3', title: 'Veo3 (Audio + Video)' }];
    await mount();

    expect(videoCards()).toHaveLength(1);
    expect(card('Veo 3')).toBeTruthy();
  });

  it('omits the category when none is offered', async () => {
    providers = [];
    await mount();

    expect(headings()).toEqual(['Design', 'AI images']);
    expect(section('AI video')).toBeUndefined();
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

    const [only] = videoCards();
    expect(only.textContent).toContain('Sora');
    expect(only.textContent).toContain('Generate a video with AI.');
    expect(only.textContent).not.toContain('Use this when');
  });

  it('draws the rest of the page while the list is still loading', async () => {
    providers = undefined;
    providersLoading = true;
    await mount();

    expect(headings()).toEqual(['Design', 'AI images']);
    expect(card('Image editor')).toBeTruthy();
    expect(videoTriggers).toHaveLength(0);
  });
});
