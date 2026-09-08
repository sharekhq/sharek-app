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
let providers: Array<{ identifier: string; title: string }> = [];
let integrations: Array<{ id: string; name: string }> = [];
let user: { tier: { ai: boolean } };
let billingEnabled = true;
let emptyCatalog = false;
const videoTriggers: Trigger[] = [];

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
  useAiVideoTypes: () => ({ data: providers, isLoading: false }),
  videoTypeLabel: (_t: unknown, type: { title: string }) => type.title,
}));
jest.mock(
  '@gitroom/frontend/components/videos/video.render.component',
  () => ({
    VideoWrapper: () => null,
    videoOwnsActions: () => false,
    videoTypeCard: () => undefined,
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

beforeEach(() => {
  providers = [
    { identifier: 'veo3', title: 'Veo 3' },
    { identifier: 'image-text-slides', title: 'Image Text Slides' },
  ];
  integrations = [{ id: 'ig-1', name: 'Instagram' }];
  user = { tier: { ai: true } };
  billingEnabled = true;
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
