// A Studio tool's page, /studio/<tool> (spec 061 FR-001, FR-002, FR-013,
// FR-014, SC-004; contracts/studio-addresses.md § Resolution): built from the
// catalog the Studio page lists, it draws the tool's own page with the switcher
// in the top bar, or sends the member back to Studio for an address with no
// page. A render that ends while nobody watches raises the ready notice
// (data-model §5), which works after the page has gone (plan.md § Risks).
// happy-dom applies no media queries or Tailwind, so the page's height is
// pinned by the classes that carry it.
import { act, FC, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';

// t() renders the fallback with {{var}} filled in, and keeps the keys it was
// asked for, so a case can tell which words a line reads.
const mockTranslated: string[] = [];
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, params?: Record<string, unknown>) => {
      mockTranslated.push(key);
      return fallback.replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      );
    },
}));
const mockToast = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
// The real hook hands a new object to every render of the layout
// (layout/user.context.tsx), so this one does too.
let mockUser: { tier: { ai: boolean } } = { tier: { ai: true } };
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ ...mockUser }),
}));
let mockBillingEnabled = true;
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    billingEnabled: mockBillingEnabled,
    showImageEditor: true,
  }),
}));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: mockOpenModal,
    closeAll: jest.fn(),
    closeById: jest.fn(),
  }),
  ModalHeaderSlotTarget: () => null,
  ModalHeaderSlot: () => null,
}));
let mockIntegrations: Array<{ id: string; name: string }> = [];
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({ data: mockIntegrations }),
  })
);
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({
  PlayBadge: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: unknown) => unknown) =>
    select({ setLocked: jest.fn(), setActivateExitButton: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
// The provider list, steered by the cases (undefined while it loads), and the
// video credits the AI video tool reads, under the keys they share.
let mockProviders: Array<{ identifier: string; title: string }> | undefined;
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) =>
    key === 'load-videos-ai'
      ? { data: mockProviders, isLoading: !mockProviders }
      : key === 'copilot-credits'
      ? { data: { credits: 7 }, mutate: jest.fn() }
      : { data: undefined, mutate: jest.fn() },
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  ...jest.requireActual('@gitroom/frontend/components/layout/loading'),
  LoadingComponent: () => <div data-testid="loading" />,
}));
// The viewer has its own spec; this keeps what Open hands the modal manager.
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  mediaPreviewModal: (items: unknown, index: number) => ({
    preview: items,
    index,
  }),
}));
// The provider registry, as the tool switcher's spec has it: a provider
// registers through videoWrapper and is read back from the registry, so the
// stub provider below gets its page the way a new one would (SC-004).
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => {
  const { videosList } = jest.requireActual(
    '@gitroom/frontend/components/videos/video.wrapper'
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
// The AI image generator is a probe: what its page is handed, and how often it
// mounts. The cover mirrors ai.image.tsx's export.
const mockImageTool = jest.fn();
let mockImageMounts = 0;
const ImageProbe: FC<Record<string, unknown>> = (props) => {
  mockImageTool(props);
  useEffect(() => {
    mockImageMounts += 1;
  }, []);
  return <div data-testid="ai-image-tool" />;
};
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImageTool: (props: Record<string, unknown>) => <ImageProbe {...props} />,
  AI_IMAGE_COVER: '/studio/covers/ai-image.webp',
}));
// The AI video tool is the real one, watched for what its page hands it.
const mockVideoTool = jest.fn();
jest.mock('@gitroom/frontend/components/launches/ai.video', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/launches/ai.video'
  );
  return {
    ...actual,
    AiVideoTool: (props: Record<string, unknown>) => {
      mockVideoTool(props);
      return <actual.AiVideoTool {...props} />;
    },
  };
});
// The switcher has its own spec; this keeps what it is handed. TopBarSlot is
// the real one, which portals into the top bar.
const mockSwitcher = jest.fn();
jest.mock('@gitroom/frontend/components/studio/tool.switcher', () => ({
  ...jest.requireActual('@gitroom/frontend/components/studio/tool.switcher'),
  ToolSwitcher: (props: Record<string, unknown>) => {
    mockSwitcher(props);
    return <span data-testid="switcher" />;
  },
}));

import { StudioToolLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.studio.tool.component';
import { videoWrapper } from '@gitroom/frontend/components/videos/video.wrapper';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';

// A video provider that registers itself with a Studio card, as a new one
// would (SC-004): a model with a maker and a fact.
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
      maker: { name: 'Acme', logo: '/studio/makers/acme.svg' },
      facts: [{ key: 'video_type_stub_model_fact', fallback: '4K' }],
    },
  },
});

// What /media/video-options answers.
const PROVIDERS = [{ identifier: 'stub-model', title: 'Stub (Video)' }];
const IMAGE = { id: 'media-1', path: 'https://uploads.example/2026/11/a1.png' };
const VIDEO = { id: 'media-2', path: 'https://uploads.example/2026/11/v2.mp4' };

const mounted: Root[] = [];

beforeEach(() => {
  mockUser = { tier: { ai: true } };
  mockBillingEnabled = true;
  mockIntegrations = [];
  mockProviders = PROVIDERS;
  mockImageMounts = 0;
  mockTranslated.splice(0);
  // The top bar's slot, as layout/title.tsx draws it.
  const slot = document.createElement('span');
  slot.id = 'top-bar-slot';
  document.body.appendChild(slot);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const mount = async (tool: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<StudioToolLayoutComponent tool={tool} />);
  });
  return host;
};

// The page drawn again, as on every render of the dashboard's layout.
const rerender = async (tool: string) => {
  await act(async () => {
    mounted[mounted.length - 1].render(
      <StudioToolLayoutComponent tool={tool} />
    );
  });
};

const slot = () => document.getElementById('top-bar-slot')!;
const lastProps = (probe: jest.Mock) =>
  probe.mock.calls[probe.mock.calls.length - 1][0];
const classesOf = (el: Element | null | undefined) =>
  (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('the Studio tool page', () => {
  it('shows the loading state while the provider list loads, and neither redirects nor draws a tool', async () => {
    mockProviders = undefined;
    const host = await mount('ai-image');

    expect(host.querySelector('[data-testid="loading"]')).toBeTruthy();
    expect(mockImageTool).not.toHaveBeenCalled();
    expect(mockSwitcher).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['nope', 'a slug no listing has'],
    ['image-editor', 'the image editor, which opens in a window'],
  ])(
    'replaces the address with /studio, once, and draws nothing for %s (%s)',
    async (tool) => {
      const host = await mount(tool);

      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/studio');
      expect(mockRouter.push).not.toHaveBeenCalled();
      expect(host.childNodes).toHaveLength(0);
      expect(slot().childNodes).toHaveLength(0);
      expect(mockImageTool).not.toHaveBeenCalled();
      expect(mockOpenModal).not.toHaveBeenCalled();
    }
  );

  it("draws the AI image generator's page, unlocked on a plan with AI", async () => {
    const host = await mount('ai-image');

    expect(host.querySelector('[data-testid="ai-image-tool"]')).toBeTruthy();
    expect(lastProps(mockImageTool)).toMatchObject({
      layout: 'page',
      destination: 'media',
      locked: false,
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('locks the page when billing is on and the plan has no AI (FR-013)', async () => {
    mockUser = { tier: { ai: false } };
    await mount('ai-image');

    expect(lastProps(mockImageTool).locked).toBe(true);
  });

  it('offers Create a post only when the workspace has a channel, and it opens the post editor with the result', async () => {
    await mount('ai-image');
    expect(lastProps(mockImageTool).onCreatePost).toBeUndefined();

    mockIntegrations = [{ id: 'channel-1', name: 'Sharek' }];
    await rerender('ai-image');
    const { onCreatePost } = lastProps(mockImageTool);
    expect(onCreatePost).toEqual(expect.any(Function));

    act(() => onCreatePost(IMAGE));
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const editor = mockOpenModal.mock.calls[0][0];
    expect(editor.id).toBe('add-edit-modal');
    expect(editor.children.props.onlyValues[0].image).toEqual([IMAGE]);
  });

  it("puts the tool switcher in the top bar's slot, on the current listing", async () => {
    const host = await mount('ai-image');

    expect(slot().querySelector('[data-testid="switcher"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="switcher"]')).toBeNull();
    const { current, catalog } = lastProps(mockSwitcher);
    expect(current.entry.slug).toBe('ai-image');
    expect(catalog.listings).toContain(current);
  });

  it('keeps the tool mounted when the layout draws again with a new user object (H3, D4)', async () => {
    await mount('ai-image');
    const before = lastProps(mockSwitcher).catalog;

    await rerender('ai-image');

    // The catalog was built again, and the tool kept its identity.
    expect(lastProps(mockSwitcher).catalog).not.toBe(before);
    expect(mockImageTool.mock.calls.length).toBeGreaterThan(1);
    expect(mockImageMounts).toBe(1);
  });

  it('draws a provider that registers itself, with its maker and facts at the top of the settings, then the shared Orientation (SC-004)', async () => {
    const host = await mount('stub-model');

    expect(lastProps(mockVideoTool)).toMatchObject({
      type: PROVIDERS[0],
      layout: 'page',
      destination: 'media',
      locked: false,
    });
    expect(lastProps(mockSwitcher).current.entry.slug).toBe('stub-model');
    // The frame's settings panel, before its stage.
    const panel = host.querySelector('form > div > div');
    const head = panel?.firstElementChild;
    expect(head?.textContent).toContain('Stub model');
    expect(head?.textContent).toContain(`by ${isolate('Acme')} · Video`);
    expect(head?.textContent).toContain('4K');
    expect(head?.textContent).not.toContain('Orientation');
    const text = panel?.textContent ?? '';
    expect(text.indexOf('4K')).toBeLessThan(text.indexOf('Orientation'));
    expect(text.indexOf('Orientation')).toBeLessThan(text.indexOf('Vertical'));
    expect(text).toContain('Horizontal');
  });

  it('raises the ready notice for an image: Your image is ready, with Open, which opens it in the viewer', async () => {
    await mount('ai-image');

    act(() => lastProps(mockImageTool).onChange(IMAGE));

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Your image is ready', 'success', {
      label: 'Open',
      onClick: expect.any(Function),
    });
    expect(mockTranslated).toEqual(
      expect.arrayContaining(['workspace_ready_image', 'workspace_open'])
    );
    expect(mockOpenModal).not.toHaveBeenCalled();

    act(() => mockToast.mock.calls[0][2].onClick());
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledWith({
      preview: [{ id: IMAGE.id, path: IMAGE.path, name: 'a1.png' }],
      index: 0,
    });
  });

  it('raises the ready notice for a video: Your video is ready', async () => {
    await mount('stub-model');

    act(() => lastProps(mockVideoTool).onChange(VIDEO));

    expect(mockToast).toHaveBeenCalledWith('Your video is ready', 'success', {
      label: 'Open',
      onClick: expect.any(Function),
    });
    expect(mockTranslated).toContain('workspace_ready_video');

    act(() => mockToast.mock.calls[0][2].onClick());
    expect(mockOpenModal).toHaveBeenCalledWith({
      preview: [{ id: VIDEO.id, path: VIDEO.path, name: 'v2.mp4' }],
      index: 0,
    });
  });

  it('still raises the ready notice, and Open still opens the viewer, after the page has gone', async () => {
    await mount('ai-image');
    const { onChange } = lastProps(mockImageTool);
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });

    onChange(IMAGE);

    expect(mockToast).toHaveBeenCalledWith('Your image is ready', 'success', {
      label: 'Open',
      onClick: expect.any(Function),
    });
    mockToast.mock.calls[0][2].onClick();
    expect(mockOpenModal).toHaveBeenCalledWith({
      preview: [{ id: IMAGE.id, path: IMAGE.path, name: 'a1.png' }],
      index: 0,
    });
  });

  it('fills the page card, with no PageScroll', async () => {
    const host = await mount('ai-image');
    const root = host.firstElementChild;

    expect(classesOf(root)).toEqual([
      'bg-newBgColorInner',
      'flex-1',
      'min-w-0',
      'h-full',
      'min-h-0',
      'mobile:h-auto',
    ]);
    expect(host.children).toHaveLength(1);
    expect(host.querySelector('.overflow-y-auto')).toBeNull();
    expect(root?.querySelector('[data-testid="ai-image-tool"]')).toBeTruthy();
  });
});
