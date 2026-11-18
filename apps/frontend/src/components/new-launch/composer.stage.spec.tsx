import { act, createRef, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { readFileSync } from 'fs';
import { join } from 'path';

// The composer's right side (spec 064, the one AI tab; plan D3, D4): a tab
// strip with Post preview and, while a Create with AI button has opened it,
// one Create with AI tab hosting the tool the member chose beside the post.
// The tool list is the Studio catalog narrowed to what the post takes, each
// tool through its own panel. A result lands through the media row's latest
// handler, or at the post's place through the store once the row is gone; a
// render's pending entry stays until it settles, where it was started, even
// after the tab closed; two tools can render at once; and the stage is the
// one writer of the composer's lock for AI work.

// The interface's words: the English fallbacks, their {{names}} filled.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
// The catalog the composer lists from: three tools that hand a post media,
// each panel a stand-in recording its latest props and counting its mounts,
// so a case calls its onChange, onAccept and setLoading as the real tool
// would, also while it is hidden. The narrowing is the catalog's own: the
// tools whose kind the row accepts.
const mockTools = {
  props: {} as Record<string, any>,
  mounts: {} as Record<string, number>,
};
jest.mock('@gitroom/frontend/components/studio/studio.tools', () => {
  const { useEffect } = require('react');
  const listing = (id: string, kind: 'image' | 'video') => ({
    state: 'entitled',
    entry: {
      id,
      post: {
        kind,
        panel: (props: any) => {
          mockTools.props[id] = props;
          useEffect(() => {
            mockTools.mounts[id] = (mockTools.mounts[id] || 0) + 1;
          }, []);
          return (
            <div data-tool={id}>
              <input data-typed={id} />
            </div>
          );
        },
      },
    },
  });
  const listings = [
    listing('ai-image', 'image'),
    listing('video:veo3', 'video'),
    listing('video:slides', 'video'),
  ];
  return {
    AI_IMAGE_TOOL: 'ai-image',
    useComposerCatalog: (accepts: string[]) => ({
      catalog: {
        listings: listings.filter(({ entry }) =>
          accepts.includes(entry.post.kind)
        ),
      },
      loading: false,
    }),
  };
});
// The tool switcher: a button per listed tool calling onPick, with the shown
// tool and the busy ids on its element.
jest.mock('@gitroom/frontend/components/studio/tool.switcher', () => ({
  ToolSwitcher: ({ current, catalog, onPick, busy }: any) => (
    <div
      data-switcher
      data-current={current.entry.id}
      data-busy={(busy || []).join(',')}
    >
      {catalog.listings.map(({ entry }: any) => (
        <button
          key={entry.id}
          data-pick={entry.id}
          onClick={() => onPick(entry.id)}
        />
      ))}
    </div>
  ),
}));
// The one-tab stage no longer imports the tools themselves; these keep the
// uppy-heavy modules out of the suite whichever stage is under test.
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImageTool: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideoChooser: () => null,
  useAiVideoTypes: () => ({ data: [], isLoading: false }),
}));
// The preview, recording the ref it is handed; the fit, a box around it.
const mockPreview = { refs: [] as unknown[] };
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef } = require('react');
    return {
      ShowAllProviders: forwardRef((_props: any, ref: any) => {
        mockPreview.refs.push(ref);
        return <div data-show-all />;
      }),
    };
  }
);
jest.mock('@gitroom/frontend/components/new-launch/preview.fit', () => ({
  PreviewFit: ({ children }: { children: ReactNode }) => (
    <div data-fit>{children}</div>
  ),
}));
// The scroll box's overflow check needs a MutationObserver, which this DOM
// lacks; scenery, as in manage.modal.layout.spec.tsx.
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));

import { STAGE_BACKGROUND } from '@gitroom/frontend/components/studio/workspace.frame';
import { ComposerStage } from '@gitroom/frontend/components/new-launch/composer.stage';
import {
  ComposerTabs,
  ComposerTabsProvider,
  PreviewPlace,
  useComposerTabs,
} from '@gitroom/frontend/components/new-launch/composer.tabs';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const NAME = 'Create with AI';
const IMAGE = 'ai-image';
const VEO = 'video:veo3';
const SLIDES = 'video:slides';
const BOTH = ['image', 'video'] as ('image' | 'video')[];
const STORAGE_KEY = 'composerAiTool';
const media = { id: 'm-1', path: 'https://media/m-1.png' };
const first: PreviewPlace = { channel: 'global', index: 0 };
const second: PreviewPlace = { channel: 'int-1', index: 1 };

// What a trigger reads through the context, from a child of the provider.
let tabs: ComposerTabs | null;
const Probe = (): null => {
  tabs = useComposerTabs();
  return null;
};

const previewRef = createRef<unknown>();
const mounted: Root[] = [];
let host: HTMLElement;
let root: Root;

beforeEach(() => {
  tabs = null;
  mockTools.props = {};
  mockTools.mounts = {};
  mockPreview.refs.length = 0;
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

const render = async (
  options: {
    onActiveChange?: (active: ComposerTabs['active']) => void;
    onClose?: () => void;
  } = {}
) => {
  await act(async () => {
    root.render(
      <ComposerTabsProvider
        defaultTool={IMAGE}
        onActiveChange={options.onActiveChange}
      >
        <Probe />
        <ComposerStage
          previewRef={previewRef}
          onClose={options.onClose || jest.fn()}
        />
      </ComposerTabsProvider>
    );
  });
};

// A tab's accessible name: its text, the glyph and the spinner aria-hidden.
const label = (element: Element) => {
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll('[aria-hidden="true"]')
    .forEach((node) => node.remove());
  return copy.textContent;
};
const strip = () => host.querySelector<HTMLElement>('[role="tablist"]')!;
const tabsShown = () =>
  Array.from(strip().querySelectorAll<HTMLElement>('[role="tab"]'));
const tab = (name: string) => tabsShown().find((each) => label(each) === name);
const selected = () =>
  tabsShown()
    .filter((each) => each.getAttribute('aria-selected') === 'true')
    .map(label);
const panel = (name: string) =>
  document.getElementById(tab(name)!.getAttribute('aria-controls')!)!;
const buttonNamed = (name: string, scope: ParentNode = host) =>
  Array.from(scope.querySelectorAll<HTMLElement>('button')).find(
    (button) => button.getAttribute('aria-label') === name
  );
const toolElement = (id: string) =>
  host.querySelector<HTMLElement>(`[data-tool="${id}"]`);
// The tools on screen: mounted, and with no hidden box around them.
const onScreen = () =>
  Array.from(host.querySelectorAll<HTMLElement>('[data-tool]'))
    .filter((each) => !each.closest('[hidden]'))
    .map((each) => each.getAttribute('data-tool'));
const mountedTools = () =>
  Array.from(host.querySelectorAll<HTMLElement>('[data-tool]')).map((each) =>
    each.getAttribute('data-tool')
  );
const switcher = () => host.querySelector<HTMLElement>('[data-switcher]')!;
const listed = () =>
  Array.from(switcher().querySelectorAll<HTMLElement>('[data-pick]')).map(
    (each) => each.getAttribute('data-pick')
  );
const busyIds = () =>
  (switcher().getAttribute('data-busy') || '').split(',').filter(Boolean);

const open = async (
  target: () => ((m: typeof media) => void) | undefined = () => undefined,
  index = 0,
  opener?: HTMLElement,
  accepts: ('image' | 'video')[] = BOTH
) => {
  await act(async () => {
    tabs!.open(target, index, opener, accepts);
  });
};
const pick = async (id: string) => {
  await act(async () => {
    switcher().querySelector<HTMLElement>(`[data-pick="${id}"]`)!.click();
  });
};
// The composer's store as a button press finds it: the channel on screen, and
// the channels holding values of their own.
const composing = (current: string, own: string[] = [current]) => {
  useLaunchStore.setState({
    current,
    internal: own.map((id) => ({
      integration: { id } as any,
      integrationValue: [],
    })),
  });
};
const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
  });
};
const press = async (element: HTMLElement, key: string) => {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
};
// The tool's calls, as the real tool makes them.
const loading = async (id: string, value: boolean) => {
  await act(async () => {
    mockTools.props[id].setLoading(value);
  });
};
const lands = async (id: string) => {
  await act(async () => {
    mockTools.props[id].setLoading(false);
    mockTools.props[id].onChange(media);
  });
};
const closeTab = (scope: ParentNode = strip()) =>
  buttonNamed(`Close ${NAME}`, scope)!;

describe('the tab strip', () => {
  it('is a tablist named for the post preview and the AI tools, with Post preview first, selected, and always there', async () => {
    await render();

    expect(strip().getAttribute('aria-label')).toBe(
      'Post preview and AI tools'
    );
    expect(tabsShown().map(label)).toEqual(['Post preview']);
    expect(selected()).toEqual(['Post preview']);
    expect(panel('Post preview').hidden).toBe(false);
  });

  it('adds one Create with AI tab after Post preview when a button opens it, and selects it', async () => {
    await render();
    await open();

    expect(tabsShown().map(label)).toEqual(['Post preview', NAME]);
    expect(selected()).toEqual([NAME]);
    expect(panel(NAME).getAttribute('role')).toBe('tabpanel');
  });

  it('keeps one tab however many times a button opens it, whatever the tool', async () => {
    await render();
    await open();
    await pick(VEO);
    await open(undefined, 1);

    expect(tabsShown().map(label)).toEqual(['Post preview', NAME]);
  });

  it('moves between the two tabs with the arrow keys, wrapping, and selects the one it reaches', async () => {
    await render();
    await open();
    await click(tab('Post preview')!);

    await press(tab('Post preview')!, 'ArrowRight');
    expect(selected()).toEqual([NAME]);
    expect(document.activeElement).toBe(tab(NAME));

    await press(tab(NAME)!, 'ArrowRight');
    expect(selected()).toEqual(['Post preview']);

    await press(tab('Post preview')!, 'ArrowLeft');
    expect(selected()).toEqual([NAME]);
    expect(document.activeElement).toBe(tab(NAME));
  });

  it('keeps the AI panel mounted while switching, hidden when not shown, and tells its tool whether it is shown', async () => {
    await render();
    await open();

    expect(panel(NAME).hidden).toBe(false);
    expect(panel('Post preview').hidden).toBe(true);
    expect(mockTools.props[IMAGE].active).toBe(true);

    await click(tab('Post preview')!);
    expect(panel('Post preview').hidden).toBe(false);
    expect(panel(NAME).hidden).toBe(true);
    expect(mockTools.props[IMAGE].active).toBe(false);

    await click(tab(NAME)!);
    expect(panel(NAME).hidden).toBe(false);
    expect(mockTools.props[IMAGE].active).toBe(true);
    expect(mockTools.mounts).toEqual({ [IMAGE]: 1 });
  });

  it('gives the AI tab a close button named for it, which closes it and returns to Post preview', async () => {
    await render();
    await open();

    // A tablist owns only tabs (WAI-ARIA's deletable tabs): the × is the
    // pointer's, out of the tab order and the accessibility tree, and Delete
    // closes the tab in focus, which moves to Post preview.
    const close = closeTab();
    expect(close.getAttribute('tabindex')).toBe('-1');
    expect(close.getAttribute('aria-hidden')).toBe('true');
    await click(close);

    expect(tabsShown().map(label)).toEqual(['Post preview']);
    expect(selected()).toEqual(['Post preview']);
    expect(toolElement(IMAGE)).toBeNull();

    await open();
    expect(tab(NAME)!.getAttribute('aria-keyshortcuts')).toBe('Delete');
    tab(NAME)!.focus();
    await press(tab(NAME)!, 'Delete');

    expect(tabsShown().map(label)).toEqual(['Post preview']);
    expect(toolElement(IMAGE)).toBeNull();
    expect(document.activeElement).toBe(tab('Post preview'));
  });

  it('shows a spinner in place of the glyph on the tab, busy with its name unchanged, while any tool holds a pending entry', async () => {
    await render();
    composing('int-1');
    await open(undefined, 1);
    expect(tab(NAME)!.textContent).toContain('✦');

    await loading(IMAGE, true);

    const working = tab(NAME)!;
    expect(working.getAttribute('aria-busy')).toBe('true');
    expect(
      working.querySelector('[class~="motion-safe:animate-spin"]')
    ).toBeTruthy();
    expect(label(working)).toBe(NAME);
    expect(tabs!.pending).toEqual([
      { id: expect.any(String), kind: 'image', place: second, tool: IMAGE },
    ]);

    await loading(IMAGE, false);
    expect(tab(NAME)!.getAttribute('aria-busy')).not.toBe('true');
    expect(
      tab(NAME)!.querySelector('[class~="motion-safe:animate-spin"]')
    ).toBeNull();
    expect(tabs!.pending).toEqual([]);
  });

  it('puts the composer’s close at the strip’s end', async () => {
    const onClose = jest.fn();
    await render({ onClose });

    const end = strip().parentElement!.lastElementChild as HTMLElement;
    expect(end.tagName).toBe('BUTTON');
    expect(end.getAttribute('aria-label')).toBe('Close');
    expect(
      strip().compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await click(end);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the tool the tab opens on', () => {
  it('is the remembered tool, else the AI image generator', async () => {
    await render();
    await open();
    expect(onScreen()).toEqual([IMAGE]);
    expect(switcher().getAttribute('data-current')).toBe(IMAGE);
    await click(closeTab());

    window.localStorage.setItem(STORAGE_KEY, VEO);
    await open();
    expect(onScreen()).toEqual([VEO]);
    expect(switcher().getAttribute('data-current')).toBe(VEO);
  });

  it('falls back to the AI image generator, and does not write it back, when the row does not offer the remembered tool', async () => {
    window.localStorage.setItem(STORAGE_KEY, VEO);
    await render();
    await open(undefined, 0, undefined, ['image']);

    expect(onScreen()).toEqual([IMAGE]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(VEO);
  });

  it('falls back to the AI image generator when the remembered tool is unknown', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'video:gone');
    await render();
    await open();

    expect(onScreen()).toEqual([IMAGE]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('video:gone');
  });

  it('leaves the AI image generator when storage throws, and still switches tools', async () => {
    const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      await render();
      await open();
      expect(onScreen()).toEqual([IMAGE]);

      await pick(VEO);
      expect(onScreen()).toEqual([VEO]);
    } finally {
      if (storage) {
        Object.defineProperty(globalThis, 'localStorage', storage);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it('shows the picked tool’s panel and remembers it', async () => {
    await render();
    await open();
    await pick(SLIDES);

    expect(onScreen()).toEqual([SLIDES]);
    expect(switcher().getAttribute('data-current')).toBe(SLIDES);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(SLIDES);
  });

  it('gives the switcher the busy tool ids, and an image-only row’s switcher image tools only', async () => {
    await render();
    await open();
    expect(listed()).toEqual([IMAGE, VEO, SLIDES]);
    expect(busyIds()).toEqual([]);

    await loading(IMAGE, true);
    expect(busyIds()).toEqual([IMAGE]);
    await loading(IMAGE, false);

    await open(undefined, 0, undefined, ['image']);
    expect(listed()).toEqual([IMAGE]);
  });

  // analysis A4: a tool switched away from keeps its settings while the tab
  // is open, as two tabs did; closing the tab resets the idle ones.
  it('keeps a tool switched away from, and what was typed in it, while the tab is open; closing the tab unmounts idle panels', async () => {
    await render();
    await open();
    const input = host.querySelector<HTMLInputElement>(
      `[data-typed="${IMAGE}"]`
    )!;
    input.value = 'a red door';
    await pick(VEO);

    expect(mountedTools()).toEqual([IMAGE, VEO]);
    expect(onScreen()).toEqual([VEO]);

    await pick(IMAGE);
    expect(
      host.querySelector<HTMLInputElement>(`[data-typed="${IMAGE}"]`)
    ).toBe(input);
    expect(input.value).toBe('a red door');
    expect(mockTools.mounts).toEqual({ [IMAGE]: 1, [VEO]: 1 });

    await click(closeTab());
    expect(mountedTools()).toEqual([]);
  });

  it('mounts no panel for a tool never shown', async () => {
    await render();
    await open();

    expect(mountedTools()).toEqual([IMAGE]);
  });

  // analysis A5: active is read at landing time through a ref.
  it('tells a panel it is active only when the tab is open, the AI tab is selected and it is the shown tool', async () => {
    await render();
    await open();
    expect(mockTools.props[IMAGE].active).toBe(true);

    await pick(VEO);
    expect(mockTools.props[IMAGE].active).toBe(false);
    expect(mockTools.props[VEO].active).toBe(true);

    await click(tab('Post preview')!);
    expect(mockTools.props[IMAGE].active).toBe(false);
    expect(mockTools.props[VEO].active).toBe(false);
  });

  it('hands every listing’s panel the stacked layout for the post', async () => {
    await render();
    await open();
    await pick(VEO);

    expect(mockTools.props[IMAGE]).toMatchObject({
      layout: 'stacked',
      destination: 'post',
    });
    expect(mockTools.props[VEO]).toMatchObject({
      layout: 'stacked',
      destination: 'post',
    });
  });

  // SC-002: a tool is added by a catalog entry, never by the stage.
  it('renders every listing through its own post.panel: the stage names no tool but the default', () => {
    const source = readFileSync(join(__dirname, 'composer.stage.tsx'), 'utf8');

    expect(source).not.toMatch(/AiImageTool|AiVideoChooser|useAiVideoTypes/);
    expect(source).not.toMatch(/ai\.image|ai\.video/);
    expect(source).not.toMatch(/'video:|"video:/);
    expect(source).toMatch(/AI_IMAGE_TOOL/);
  });
});

// One tab: a button pressed while it is open selects it. An idle panel takes
// the button's target and place; a busy one keeps where its render started.
// The post a button works for is read at the click.
describe('the post the tab works for', () => {
  it('works for the post its button is under, in the channel on screen when that channel holds its own values', async () => {
    await render();
    composing('c1');
    await open(undefined, 2);

    expect(tabs!.tab!.place).toEqual({ channel: 'c1', index: 2 });
  });

  it('works for the global post when the channel on screen holds no values of its own', async () => {
    composing('c1', ['c2']);
    await render();
    await open(undefined, 1);

    expect(tabs!.tab!.place).toEqual({ channel: 'global', index: 1 });
  });

  it('selects the open tab, which, idle, takes the new target and place', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open(() => before);
    await click(tab('Post preview')!);
    composing('int-1');
    await open(() => after, 1);

    expect(tabsShown().map(label)).toEqual(['Post preview', NAME]);
    expect(selected()).toEqual([NAME]);
    expect(mockTools.mounts[IMAGE]).toBe(1);

    await loading(IMAGE, true);
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([second]);

    await lands(IMAGE);
    expect(after).toHaveBeenCalledWith(media);
    expect(before).not.toHaveBeenCalled();
  });

  // FR-013
  it('only selects the tab while a render is busy, which lands through its first target at its first place', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open(() => before);
    await loading(IMAGE, true);
    await click(tab('Post preview')!);
    composing('int-1');
    await open(() => after, 1);

    expect(selected()).toEqual([NAME]);
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first]);

    await click(tab('Post preview')!);
    await lands(IMAGE);
    expect(before).toHaveBeenCalledWith(media);
    expect(after).not.toHaveBeenCalled();
  });

  it('keeps the button pressed last with the tab, and its row’s latest handler, not the click’s', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    const old = jest.fn();
    const latest = jest.fn();
    let handler: (m: typeof media) => void = old;
    await render();
    await open(() => handler, 0, opener);
    handler = latest;

    expect(tabs!.tab!.opener).toBe(opener);
    tabs!.tab!.target()!(media);
    expect(latest).toHaveBeenCalledWith(media);
    expect(old).not.toHaveBeenCalled();
  });

  it('hands the tab no handler once its button is gone, so the stage lands it through the store', async () => {
    let handler: ((m: typeof media) => void) | undefined = jest.fn();
    await render();
    await open(() => handler);
    expect(tabs!.tab!.target()).toBeDefined();

    handler = undefined;
    expect(tabs!.tab!.target()).toBeUndefined();
  });
});

// Where a result goes.
describe('a result', () => {
  it('lands in the post and closes the tab to Post preview when its tool is on screen', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await loading(IMAGE, true);
    await lands(IMAGE);

    expect(image).toHaveBeenCalledWith(media);
    expect(tab(NAME)).toBeUndefined();
    expect(selected()).toEqual(['Post preview']);
    expect(panel('Post preview').hidden).toBe(false);
  });

  it('is added by Use image on the tool on screen, which closes the tab and selects Post preview', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await act(async () => {
      mockTools.props[IMAGE].onChange(media);
      mockTools.props[IMAGE].onAccept();
    });

    expect(image).toHaveBeenCalledTimes(1);
    expect(tab(NAME)).toBeUndefined();
    expect(selected()).toEqual(['Post preview']);
  });

  it('lands in the post from a tab on Post preview and closes the tab, leaving Post preview on screen', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await loading(IMAGE, true);
    await click(tab('Post preview')!);
    await lands(IMAGE);

    expect(image).toHaveBeenCalledWith(media);
    expect(tab(NAME)).toBeUndefined();
    expect(selected()).toEqual(['Post preview']);
  });

  it('from a tab closed while busy keeps its pending entry until it settles, then lands', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await loading(IMAGE, true);
    await click(closeTab());

    expect(tab(NAME)).toBeUndefined();
    expect(tabs!.pending).toHaveLength(1);
    expect(toolElement(IMAGE)).not.toBeNull();

    await lands(IMAGE);
    expect(tabs!.pending).toEqual([]);
    expect(image).toHaveBeenCalledWith(media);
    expect(toolElement(IMAGE)).toBeNull();
  });

  it('does not close the tab when it comes from a tool that is not on screen', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await loading(IMAGE, true);
    await pick(VEO);
    await lands(IMAGE);

    expect(image).toHaveBeenCalledWith(media);
    expect(selected()).toEqual([NAME]);
    expect(onScreen()).toEqual([VEO]);
    expect(tab(NAME)!.getAttribute('aria-busy')).not.toBe('true');
  });

  // analysis A5: whether the tab closes is read at landing time.
  it('from a hidden busy tool lands in its post and leaves the tab as it is, read after the member switched', async () => {
    const image = jest.fn();
    await render();
    await open(() => image);
    await loading(IMAGE, true);
    await pick(SLIDES);
    await pick(VEO);
    await lands(IMAGE);

    expect(image).toHaveBeenCalledWith(media);
    expect(selected()).toEqual([NAME]);
    expect(onScreen()).toEqual([VEO]);

    await pick(SLIDES);
    expect(onScreen()).toEqual([SLIDES]);
  });

  it('keeps a running render mounted and busy while another tool is shown, and shows it again as the same panel', async () => {
    await render();
    await open();
    await loading(IMAGE, true);
    const element = toolElement(IMAGE);
    await pick(VEO);

    expect(mountedTools()).toEqual([IMAGE, VEO]);
    expect(onScreen()).toEqual([VEO]);
    expect(busyIds()).toEqual([IMAGE]);
    expect(tab(NAME)!.getAttribute('aria-busy')).toBe('true');

    await pick(IMAGE);
    expect(onScreen()).toEqual([IMAGE]);
    expect(toolElement(IMAGE)).toBe(element);
    expect(mockTools.mounts[IMAGE]).toBe(1);
  });

  // FR-011: the tool's own Generate is disabled by the same mounted panel.
  it('hands a busy tool shown again the same setLoading, onChange and onAccept, so its own Generate stays blocked', async () => {
    await render();
    await open();
    const before = mockTools.props[IMAGE];
    await loading(IMAGE, true);
    await pick(VEO);
    await pick(IMAGE);
    const after = mockTools.props[IMAGE];

    expect(after).not.toBe(before);
    expect(after.setLoading).toBe(before.setLoading);
    expect(after.onChange).toBe(before.onChange);
    expect(after.onAccept).toBe(before.onAccept);
    expect(mockTools.mounts[IMAGE]).toBe(1);
  });

  it('lets two tools render at once, each landing in its own row', async () => {
    const one = jest.fn();
    const two = jest.fn();
    await render();
    await open(() => one, 0);
    await loading(IMAGE, true);
    await open(() => two, 1);
    await pick(VEO);
    await loading(VEO, true);

    expect(
      tabs!.pending.map((entry) => [entry.tool, entry.place.index])
    ).toEqual([
      [IMAGE, 0],
      [VEO, 1],
    ]);
    expect(busyIds()).toEqual([IMAGE, VEO]);

    await lands(IMAGE);
    expect(one).toHaveBeenCalledWith(media);
    expect(two).not.toHaveBeenCalled();
    expect(selected()).toEqual([NAME]);

    await lands(VEO);
    expect(two).toHaveBeenCalledWith(media);
    expect(one).toHaveBeenCalledTimes(1);
    expect(tab(NAME)).toBeUndefined();
  });

  it('from a tab closed while busy lands through its own row and leaves a newer tab on another tool open', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open(() => before);
    await loading(IMAGE, true);
    await click(closeTab());
    composing('int-1');
    await open(() => after, 1);
    await pick(VEO);

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first]);

    await lands(IMAGE);
    expect(before).toHaveBeenCalledWith(media);
    expect(after).not.toHaveBeenCalled();
    expect(selected()).toEqual([NAME]);
    expect(onScreen()).toEqual([VEO]);
  });

  // analysis A6
  it('keeps a video render going, in its place, when an image-only row opens the tab, whose switcher then lists image tools only', async () => {
    const video = jest.fn();
    await render();
    await open(() => video, 0);
    await pick(VEO);
    await loading(VEO, true);
    await open(() => undefined, 1, undefined, ['image']);

    expect(listed()).toEqual([IMAGE]);
    expect(onScreen()).toEqual([IMAGE]);
    expect(mountedTools()).toContain(VEO);
    expect(tabs!.pending.map((entry) => [entry.tool, entry.place])).toEqual([
      [VEO, first],
    ]);

    await lands(VEO);
    expect(video).toHaveBeenCalledWith(media);
    expect(selected()).toEqual([NAME]);
  });

  it('is appended at its place in the general post through the store once the button is gone, after the post’s media changed', async () => {
    let handler: ((m: typeof media) => void) | undefined = jest.fn();
    useLaunchStore.setState({
      global: [
        { id: 'p0', content: '', delay: 0, media: [] },
        { id: 'p1', content: '', delay: 0, media: [{ id: 'a', path: 'a' }] },
      ],
    });
    await render();
    await open(() => handler, 1);
    await loading(IMAGE, true);
    // the button unmounts, and the post's media change while it works
    const gone = handler;
    handler = undefined;
    act(() => {
      useLaunchStore
        .getState()
        .appendGlobalValueMedia(1, [{ id: 'b', path: 'b' }]);
    });
    await click(tab('Post preview')!);
    await lands(IMAGE);

    const { global } = useLaunchStore.getState();
    expect(global[1].media.map((each) => each.id)).toEqual(['a', 'b', 'm-1']);
    expect(global[0].media).toEqual([]);
    expect(gone).not.toHaveBeenCalled();
  });

  it('is appended at its place in a channel’s own post through the store once the button is gone', async () => {
    const value = () => [
      { id: 'v0', content: '', delay: 0, media: [] },
      { id: 'v1', content: '', delay: 0, media: [{ id: 'a', path: 'a' }] },
    ];
    useLaunchStore.setState({
      current: 'int-1',
      internal: [
        { integration: { id: 'int-1' } as any, integrationValue: value() },
        { integration: { id: 'int-2' } as any, integrationValue: value() },
      ],
    });
    await render();
    await open(() => undefined, 1);
    await loading(IMAGE, true);
    act(() => {
      useLaunchStore
        .getState()
        .appendInternalValueMedia('int-1', 1, [{ id: 'b', path: 'b' }]);
    });
    await click(tab('Post preview')!);
    await lands(IMAGE);

    const [own, other] = useLaunchStore.getState().internal;
    expect(own.integrationValue[1].media.map((each) => each.id)).toEqual([
      'a',
      'b',
      'm-1',
    ]);
    expect(own.integrationValue[0].media).toEqual([]);
    expect(other.integrationValue).toEqual(value());
  });

  // research R1: once the composer has closed, the result is only in the
  // Media library; the store then holds the next composer's post (review C3).
  it('lands in no post once the composer has closed, not in the next composer’s', async () => {
    await render();
    await open(() => undefined, 1);
    await loading(IMAGE, true);
    const tool = mockTools.props[IMAGE];
    // the composer closes, its store is reset and another post is opened
    await act(async () => {
      root.render(null);
    });
    const next = () => [
      { id: 'n0', content: '', delay: 0, media: [] as (typeof media)[] },
      { id: 'n1', content: '', delay: 0, media: [] as (typeof media)[] },
    ];
    act(() => {
      useLaunchStore.getState().reset();
      useLaunchStore.setState({ global: next() });
    });
    await act(async () => {
      tool.setLoading(false);
      tool.onChange(media);
    });

    expect(useLaunchStore.getState().global).toEqual(next());
  });
});

// The editor tells the tabs when it adds or deletes a post or moves one a
// step: a place on that channel follows its post, landing through the store,
// since the row at its old index now shows another post; a deleted post's
// places go, its result then only in the Media library (research R1,
// review C7).
describe('a post deleted or moved while its result is made', () => {
  const thread = () =>
    useLaunchStore.setState({
      global: ['p0', 'p1', 'p2'].map((id) => ({
        id,
        content: '',
        delay: 0,
        media: [],
      })),
    });
  const posted = () =>
    useLaunchStore.getState().global.map((post) => post.media.map((m) => m.id));

  it('follows its post to the index before when an earlier post is deleted, and lands there through the store, not the old row’s handler', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open(() => handler, 2);
    await loading(IMAGE, true);
    await act(async () => {
      tabs!.postRemoved('global', 0);
      useLaunchStore.getState().deleteGlobalValue(0);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 1 },
    ]);

    await lands(IMAGE);
    expect(posted()).toEqual([[], ['m-1']]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lands in no post, its placeholder and lock gone, when its post is deleted', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open(() => handler, 1);
    await loading(IMAGE, true);
    await pick(VEO);
    await act(async () => {
      tabs!.postRemoved('global', 1);
      useLaunchStore.getState().deleteGlobalValue(1);
    });

    expect(tabs!.pending).toEqual([]);
    expect(useLaunchStore.getState().locked).toBe(false);

    await loading(VEO, true);
    expect(tabs!.pending).toEqual([]);

    await lands(IMAGE);
    await lands(VEO);
    expect(posted()).toEqual([[], []]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('follows its post when it is moved a step, and so does the post it swaps with', async () => {
    thread();
    await render();
    await open(() => undefined, 1);
    await loading(IMAGE, true);
    await open(() => undefined, 0);
    await pick(VEO);
    await act(async () => {
      tabs!.postMoved('global', 1, 'up');
      useLaunchStore.getState().changeOrderGlobal(1, 'up');
    });
    await loading(VEO, true);

    expect(
      tabs!.pending.map((entry) => [entry.tool, entry.place.index])
    ).toEqual([
      [IMAGE, 0],
      [VEO, 1],
    ]);

    await lands(IMAGE);
    expect(posted()).toEqual([['m-1'], [], []]);
  });

  // The first post's up arrow and the last one's down are dimmed, still
  // buttons a key presses; the store leaves those posts where they are.
  it('stays where it is when the first post is moved up or the last one down', async () => {
    thread();
    await render();
    await open(() => undefined, 2);
    await loading(IMAGE, true);
    await open(() => undefined, 0);
    await pick(VEO);
    await act(async () => {
      tabs!.postMoved('global', 0, 'up');
      tabs!.postMoved('global', 2, 'down');
    });
    await loading(VEO, true);

    expect(
      tabs!.pending.map((entry) => [entry.tool, entry.place.index])
    ).toEqual([
      [IMAGE, 2],
      [VEO, 0],
    ]);
  });

  it('follows its post to the index after when a post is added before it, and lands there through the store, not the old row’s handler', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open(() => handler, 1);
    await loading(IMAGE, true);
    await act(async () => {
      tabs!.postAdded('global', 0);
      useLaunchStore
        .getState()
        .addGlobalValue(0, [{ id: 'new', content: '', delay: 0, media: [] }]);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 2 },
    ]);

    await lands(IMAGE);
    expect(posted()).toEqual([[], [], ['m-1'], []]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps its place and its row’s handler when a post is added after it', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open(() => handler, 1);
    await loading(IMAGE, true);
    await act(async () => {
      tabs!.postAdded('global', 1);
      tabs!.postAdded('global', 2);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 1 },
    ]);

    await lands(IMAGE);
    expect(handler).toHaveBeenCalledWith(media);
  });

  it('from a tab closed while busy follows its post too', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open(() => handler, 2);
    await loading(IMAGE, true);
    await click(closeTab());
    await act(async () => {
      tabs!.postRemoved('global', 0);
      useLaunchStore.getState().deleteGlobalValue(0);
    });
    await lands(IMAGE);

    expect(posted()).toEqual([[], ['m-1']]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps its place and its row’s handler when a later post, or another channel’s, is deleted or moved', async () => {
    const handler = jest.fn();
    composing('int-1');
    await render();
    await open(() => handler, 1);
    await loading(IMAGE, true);
    await act(async () => {
      tabs!.postRemoved('int-1', 2);
      tabs!.postMoved('int-1', 2, 'down');
      tabs!.postRemoved('global', 0);
      tabs!.postMoved('global', 1, 'down');
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([second]);

    await lands(IMAGE);
    expect(handler).toHaveBeenCalledWith(media);
  });
});

// Post preview is the scroll box around the fitted preview, which takes the
// composer's ref; the AI panel is the one container for every tool.
describe('the panels', () => {
  it('draws Post preview as the scroll box around PreviewFit around the preview, which takes the composer’s ref', async () => {
    await render();

    const preview = host.querySelector('[data-show-all]')!;
    const fit = preview.parentElement!;
    const scroll = fit.parentElement!;
    expect(fit.hasAttribute('data-fit')).toBe(true);
    expect(scroll.classList.contains('overflow-y-auto')).toBe(true);
    expect(scroll.parentElement).toBe(panel('Post preview'));
    expect(mockPreview.refs.length).toBeGreaterThan(0);
    mockPreview.refs.forEach((ref) => expect(ref).toBe(previewRef));
  });

  it('draws the switcher above the tool inside the AI panel', async () => {
    await render();
    await open();

    expect(panel(NAME).contains(switcher())).toBe(true);
    expect(
      switcher().compareDocumentPosition(toolElement(IMAGE)!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('the preview panel and the AI panel use the shared stage background', async () => {
    await render();
    await open();

    const classes = (el: HTMLElement) => Array.from(el.classList).join(' ');
    expect(classes(panel('Post preview'))).toContain(STAGE_BACKGROUND);
    expect(classes(panel(NAME))).toContain(STAGE_BACKGROUND);
  });

  it('the phone AI layer stays opaque', async () => {
    await render();
    await open();

    const layer = Array.from(panel(NAME).classList);
    expect(layer).toContain('mobile:bg-newBgColorInner');
    expect(layer).toContain('mobile:[background-image:none]');
  });

  // The layer is the same element at every width, its phone look in
  // `mobile:` classes, so the tool never remounts across a breakpoint (D11).
  it('at 1025px and below makes the open AI tab a full-screen layer with Back to the post, its name and its close (FR-026)', async () => {
    await render();
    await open();
    const layer = panel(NAME);

    expect(Array.from(layer.classList)).toEqual(
      expect.arrayContaining([
        'mobile:fixed',
        'mobile:inset-0',
        'mobile:z-[600]',
        'mobile:bg-newBgColorInner',
      ])
    );
    const back = buttonNamed('Back to the post', layer)!;
    const row = back.parentElement!;
    expect(row.classList.contains('mobile:flex')).toBe(true);
    expect(
      back.querySelector('svg')!.getAttribute('class')!.split(/\s+/)
    ).toContain('rtl:rotate-180');
    expect(row.textContent).toContain(NAME);
    expect(closeTab(row)).toBeTruthy();

    await click(back);
    expect(selected()).toEqual(['Post preview']);
    expect(tab(NAME)).toBeTruthy();
    expect(panel(NAME).hidden).toBe(true);
    expect(mockTools.mounts[IMAGE]).toBe(1);
  });
});

// At 1025px and below the AI tab is a layer over the post (FR-026): its Back
// and its close give the focus back to the Create with AI button the tab was
// opened from while that button is still in the document; the strip's close
// and Delete keep their own.
describe('the focus after the layer', () => {
  /** A Create with AI button in the post. */
  const aiButton = () => {
    const element = document.createElement('button');
    document.body.appendChild(element);
    return element;
  };
  const back = () => buttonNamed('Back to the post', panel(NAME))!;
  const layerClose = () => closeTab(back().parentElement!);

  it('goes back to the button the tab was opened from on Back to the post', async () => {
    const opener = aiButton();
    await render();
    await open(undefined, 0, opener);
    back().focus();
    await click(back());

    expect(selected()).toEqual(['Post preview']);
    expect(document.activeElement).toBe(opener);
  });

  it('goes back to the button the tab was opened from on the layer’s close', async () => {
    const opener = aiButton();
    await render();
    await open(undefined, 0, opener);
    const close = layerClose();
    close.focus();
    await click(close);

    expect(tab(NAME)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  // The member came from the button pressed last, even when the tab, busy,
  // keeps the post its render started for.
  it('goes back to the button pressed last, a busy tool’s too', async () => {
    const before = aiButton();
    const after = aiButton();
    await render();
    await open(undefined, 0, before);
    await loading(IMAGE, true);
    await open(undefined, 1, after);
    await click(back());

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first]);
    expect(document.activeElement).toBe(after);
  });

  it('is left where it falls when that button is no longer in the document', async () => {
    const opener = aiButton();
    const focus = jest.spyOn(opener, 'focus');
    await render();
    await open(undefined, 0, opener);
    opener.remove();
    await click(back());
    await open(undefined, 0, opener);
    await click(layerClose());

    expect(tab(NAME)).toBeUndefined();
    expect(focus).not.toHaveBeenCalled();
  });

  it('is left to the strip’s close and Delete, Delete’s on Post preview', async () => {
    const opener = aiButton();
    await render();
    await open(undefined, 0, opener);
    await click(closeTab());

    expect(document.activeElement).not.toBe(opener);

    await open(undefined, 0, opener);
    tab(NAME)!.focus();
    await press(tab(NAME)!, 'Delete');

    expect(document.activeElement).toBe(tab('Post preview'));
  });
});

// The composer's lock for AI work follows whether any render is pending:
// two tools can render at once and `locked` is one boolean (D14, FR-021a).
describe('the composer’s lock', () => {
  it('leaves a lock already taken, an upload’s, as it is on mount', async () => {
    useLaunchStore.setState({ locked: true });
    await render();

    expect(useLaunchStore.getState().locked).toBe(true);
  });

  it('is taken with the first render and given back when the last one settles', async () => {
    await render();
    await open();
    await pick(VEO);

    await loading(IMAGE, true);
    expect(useLaunchStore.getState().locked).toBe(true);
    await loading(VEO, true);
    await loading(IMAGE, false);
    expect(useLaunchStore.getState().locked).toBe(true);
    await loading(VEO, false);
    expect(useLaunchStore.getState().locked).toBe(false);
  });

  it('stays taken by a busy tool whose tab closed until its render settles', async () => {
    await render();
    await open();
    await loading(IMAGE, true);
    await click(closeTab());

    expect(useLaunchStore.getState().locked).toBe(true);
    await lands(IMAGE);
    expect(useLaunchStore.getState().locked).toBe(false);
  });

  it('is not taken by an idle tool, nor by one whose result is on screen', async () => {
    await render();
    await open();
    expect(useLaunchStore.getState().locked).toBe(false);

    await loading(IMAGE, true);
    await loading(IMAGE, false);
    expect(tab(NAME)).toBeTruthy();
    expect(useLaunchStore.getState().locked).toBe(false);
  });

  // A start while the tool's request is open replaces its entry, so none is
  // left behind holding the lock and the placeholder (review C5).
  it('is given back when a render started twice settles, its first entry replaced', async () => {
    await render();
    await open();
    await loading(IMAGE, true);
    await loading(IMAGE, true);

    expect(tabs!.pending).toHaveLength(1);

    await loading(IMAGE, false);
    expect(tabs!.pending).toEqual([]);
    expect(useLaunchStore.getState().locked).toBe(false);
    expect(tab(NAME)!.getAttribute('aria-busy')).not.toBe('true');
  });
});

describe('the context', () => {
  it('tells the composer which tab is active (D11)', async () => {
    const onActiveChange = jest.fn();
    await render({ onActiveChange });

    await open();
    expect(onActiveChange).toHaveBeenLastCalledWith('ai');
    await click(tab('Post preview')!);
    expect(onActiveChange).toHaveBeenLastCalledWith('preview');
  });

  it('is null outside the composer', async () => {
    tabs = {} as ComposerTabs;
    await act(async () => {
      root.render(<Probe />);
    });

    expect(tabs).toBeNull();
  });
});
