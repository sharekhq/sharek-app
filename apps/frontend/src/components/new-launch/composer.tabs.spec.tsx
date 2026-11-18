import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The one AI button and the one AI tab's state (spec 064, plan D3, D5, D6):
// Create with AI opens the tab for the row's post, remembering the last
// picked tool in composerAiTool.

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));

// The tools' own modules are scenery here, as in composer.stage.spec.tsx: they
// only reach this spec through the catalog's imports.
jest.mock('@gitroom/frontend/components/videos/video.render.component', () => ({
  VideoRenderComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImageTool: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideoChooser: () => null,
  useAiVideoTypes: () => ({ data: [], isLoading: false }),
}));

import { buttonClassName } from '@gitroom/react/form/button';
import { AI_IMAGE_TOOL } from '@gitroom/frontend/components/studio/studio.tools';
import {
  ComposerTabs,
  ComposerTabsProvider,
  CreateWithAi,
  PreviewPlace,
  useComposerTabs,
} from '@gitroom/frontend/components/new-launch/composer.tabs';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const KEY = 'composerAiTool';
const media = { id: 'm-1', path: 'https://media/m-1.png' };
const place: PreviewPlace = { channel: 'global', index: 0 };
const accepts = ['image', 'video'] as any;

let tabs: ComposerTabs | null;
const Probe = (): null => {
  tabs = useComposerTabs();
  return null;
};

const mounted: Root[] = [];
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  tabs = null;
  window.localStorage.clear();
  useLaunchStore.getState().reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mounted.push(root);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => {
    mounted.splice(0).forEach((each) => each.unmount());
  });
  document.body.innerHTML = '';
});

const render = async (children: ReactNode) => {
  await act(async () => {
    root.render(
      <ComposerTabsProvider defaultTool={AI_IMAGE_TOOL}>
        <Probe />
        {children}
      </ComposerTabsProvider>
    );
  });
};
const button = () => host.querySelector<HTMLButtonElement>('button')!;
const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};
const openTab = async (
  target: () => ((m: typeof media) => void) | undefined = () => undefined
) => {
  await act(async () => {
    (tabs as any).open(target, 0, undefined, accepts);
  });
};

describe('CreateWithAi', () => {
  it('is a button named Create with AI with the AI look and a tooltip', async () => {
    await render(
      <CreateWithAi onChange={jest.fn()} place={0} accepts={accepts} />
    );

    expect(button().getAttribute('aria-label')).toBe('Create with AI');
    expect(button().getAttribute('data-tooltip-content')).toBe(
      'Create with AI'
    );
    expect(button().hasAttribute('aria-haspopup')).toBe(false);
    expect(button().className.split(' ')).toEqual(
      expect.arrayContaining(
        buttonClassName({ variant: 'ai', size: 'small' }).split(' ')
      )
    );
  });

  it("pressing it opens and selects the AI tab with the row's place, opener and accepts", async () => {
    await render(
      <CreateWithAi onChange={jest.fn()} place={2} accepts={accepts} />
    );
    await click(button());

    expect(tabs!.active).toBe('ai');
    expect(tabs!.tab).toMatchObject({
      open: true,
      accepts,
      place: { channel: 'global', index: 2 },
    });
    expect(tabs!.tab!.opener).toBe(button());
  });

  it('renders nothing outside the composer or without a place', async () => {
    await act(async () => {
      root.render(
        <CreateWithAi onChange={jest.fn()} place={0} accepts={accepts} />
      );
    });
    expect(host.querySelector('button')).toBeNull();

    await render(
      <CreateWithAi onChange={jest.fn()} place={undefined} accepts={accepts} />
    );
    expect(host.querySelector('button')).toBeNull();
  });

  it("the row's latest onChange is the target, none once the row unmounts", async () => {
    const first = jest.fn();
    const latest = jest.fn();
    await render(<CreateWithAi onChange={first} place={0} accepts={accepts} />);
    await click(button());
    await render(
      <CreateWithAi onChange={latest} place={0} accepts={accepts} />
    );

    tabs!.tab!.target()!(media);
    expect(latest).toHaveBeenCalledWith(media);
    expect(first).not.toHaveBeenCalled();

    await render(null);
    expect(tabs!.tab!.target()).toBeUndefined();
  });
});

describe('the AI tab state', () => {
  it('open keeps the shown tool when the tab is already open', async () => {
    await render(null);
    await openTab();
    await act(async () => {
      tabs!.pick('veo3');
    });
    await openTab();

    expect(tabs!.tab!.tool).toBe('veo3');
  });

  it('pick writes composerAiTool; open reads it for a closed tab', async () => {
    await render(null);
    await openTab();
    expect(tabs!.tab!.tool).toBe(AI_IMAGE_TOOL);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    await act(async () => {
      tabs!.pick('veo3');
    });
    expect(window.localStorage.getItem(KEY)).toBe('veo3');

    await act(async () => {
      tabs!.close();
    });
    await openTab();
    expect(tabs!.tab!.tool).toBe('veo3');
  });

  it('a missing, unreadable or throwing storage reads as no remembered tool', async () => {
    await render(null);
    await openTab();
    expect(tabs!.tab!.tool).toBe(AI_IMAGE_TOOL);

    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      await act(async () => {
        tabs!.close();
      });
      await openTab();
      expect(tabs!.tab!.tool).toBe(AI_IMAGE_TOOL);
      await act(async () => {
        expect(() => tabs!.pick('veo3')).not.toThrow();
      });
    } finally {
      if (storage) {
        Object.defineProperty(globalThis, 'localStorage', storage);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    }
  });
});
