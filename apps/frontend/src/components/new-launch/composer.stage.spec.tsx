import { act, createRef, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The composer's right side (spec 061 part 3, contracts/composer-and-preview.md
// §4): a tab strip with Post preview and up to one AI image and one AI video
// tab, each hosting its tool beside the post (FR-021). A result lands through
// the media row's latest handler, or at the post's place through the store
// once the row is gone; a render's pending entry stays until it settles,
// where its tab was started, even after the tab closed (tasks D10); and the
// stage is the one writer of the composer's lock for AI work (D14).

// The interface's words: the English fallbacks, their {{names}} filled.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback?: string, params?: Record<string, unknown>) =>
      (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      ),
}));
// Each tool as a tab hosts it: a stand-in recording its latest props and
// counting its mounts, so a case calls its onChange, onAccept and setLoading
// as the real tool would, also after its tab closed and it unmounted.
const mockTools = {
  props: {} as Record<string, any>,
  mounts: { image: 0, video: 0 } as Record<string, number>,
};
jest.mock('@gitroom/frontend/components/launches/ai.image', () => {
  const { useEffect } = require('react');
  return {
    AiImageTool: (props: any) => {
      mockTools.props.image = props;
      useEffect(() => {
        mockTools.mounts.image += 1;
      }, []);
      return <div data-tool="image" />;
    },
  };
});
const mockVideoTypes = [{ identifier: 'veo3', title: 'Veo 3' }];
jest.mock('@gitroom/frontend/components/launches/ai.video', () => {
  const { useEffect } = require('react');
  return {
    AiVideoChooser: (props: any) => {
      mockTools.props.video = props;
      useEffect(() => {
        mockTools.mounts.video += 1;
      }, []);
      return <div data-tool="video" />;
    },
    useAiVideoTypes: () => ({ data: mockVideoTypes, isLoading: false }),
  };
});
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

import {
  ComposerStage,
  ComposerTabs,
  ComposerTabsProvider,
  PreviewPlace,
  useComposerTabs,
} from '@gitroom/frontend/components/new-launch/composer.stage';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const IMAGE = 'AI image generator';
const VIDEO = 'AI Video';
const media = { id: 'm-1', path: 'https://media/m-1.png' };
const first: PreviewPlace = { channel: 'global', index: 0 };
const second: PreviewPlace = { channel: 'int-1', index: 1 };

// What a trigger reads through the context, from a child of the provider.
let tabs: ComposerTabs | null;
const Probe = () => {
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
  mockTools.mounts = { image: 0, video: 0 };
  mockPreview.refs.length = 0;
  useLaunchStore.getState().reset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mounted.push(root);
});

afterEach(() => {
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
      <ComposerTabsProvider onActiveChange={options.onActiveChange}>
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

const open = async (
  kind: 'image' | 'video',
  target: () => ((m: typeof media) => void) | undefined = () => undefined,
  place: PreviewPlace = first
) => {
  await act(async () => {
    tabs!.open(kind, target, place);
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
const loading = async (props: any, value: boolean) => {
  await act(async () => {
    props.setLoading(value);
  });
};
const lands = async (props: any) => {
  await act(async () => {
    props.setLoading(false);
    props.onChange(media);
  });
};

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

  it('adds AI image generator after Post preview when a button opens it, and selects it', async () => {
    await render();
    await open('image');

    expect(tabsShown().map(label)).toEqual(['Post preview', IMAGE]);
    expect(selected()).toEqual([IMAGE]);
    expect(panel(IMAGE).getAttribute('role')).toBe('tabpanel');
  });

  it('keeps the video tab after the image tab, whichever opened first', async () => {
    await render();
    await open('video');
    await open('image');

    expect(tabsShown().map(label)).toEqual(['Post preview', IMAGE, VIDEO]);
  });

  it('moves between the tabs with the arrow keys, wrapping, and selects the one it reaches', async () => {
    await render();
    await open('image');
    await open('video');
    await click(tab('Post preview')!);

    await press(tab('Post preview')!, 'ArrowRight');
    expect(selected()).toEqual([IMAGE]);
    expect(document.activeElement).toBe(tab(IMAGE));

    await press(tab(IMAGE)!, 'ArrowRight');
    expect(selected()).toEqual([VIDEO]);

    await press(tab(VIDEO)!, 'ArrowRight');
    expect(selected()).toEqual(['Post preview']);

    await press(tab('Post preview')!, 'ArrowLeft');
    expect(selected()).toEqual([VIDEO]);
    expect(document.activeElement).toBe(tab(VIDEO));
  });

  it('keeps every open panel mounted while switching, hidden when not shown, and tells each tool whether it is shown', async () => {
    await render();
    await open('image');
    await open('video');

    expect(panel(IMAGE).hidden).toBe(true);
    expect(panel(VIDEO).hidden).toBe(false);
    expect(panel('Post preview').hidden).toBe(true);
    expect(mockTools.props.image.active).toBe(false);
    expect(mockTools.props.video.active).toBe(true);

    await click(tab(IMAGE)!);
    expect(panel(IMAGE).hidden).toBe(false);
    expect(panel(VIDEO).hidden).toBe(true);
    expect(mockTools.props.image.active).toBe(true);
    expect(mockTools.props.video.active).toBe(false);

    await click(tab('Post preview')!);
    expect(panel('Post preview').hidden).toBe(false);
    expect(mockTools.props.image.active).toBe(false);
    expect(mockTools.props.video.active).toBe(false);
    expect(mockTools.mounts).toEqual({ image: 1, video: 1 });
  });

  it('gives each AI tab a close button named for it, which closes it', async () => {
    await render();
    await open('image');
    await open('video');

    const close = buttonNamed(`Close ${IMAGE}`, strip())!;
    expect(buttonNamed(`Close ${VIDEO}`, strip())).toBeTruthy();
    await click(close);

    expect(tabsShown().map(label)).toEqual(['Post preview', VIDEO]);
    expect(host.querySelector('[data-tool="image"]')).toBeNull();
  });

  it('shows a spinner on a working tab, busy with its name unchanged, while its tool holds a pending entry at its place', async () => {
    await render();
    await open('image', undefined, second);
    await loading(mockTools.props.image, true);

    const working = tab(IMAGE)!;
    expect(working.getAttribute('aria-busy')).toBe('true');
    expect(
      working.querySelector('[class~="motion-safe:animate-spin"]')
    ).toBeTruthy();
    expect(label(working)).toBe(IMAGE);
    expect(tabs!.pending).toEqual([
      { id: expect.any(String), kind: 'image', place: second },
    ]);

    await loading(mockTools.props.image, false);
    expect(tab(IMAGE)!.getAttribute('aria-busy')).not.toBe('true');
    expect(
      tab(IMAGE)!.querySelector('[class~="motion-safe:animate-spin"]')
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

// One tab of each kind (FR-021): a button pressed while one is open selects
// it. An idle tab takes the button's target and place, so pressing AI Image
// under another post sends Use image there; a busy one keeps where its render
// started (tasks D10).
describe('one tab of each kind', () => {
  it('selects the open tab, which, idle, takes the new target and place', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open('image', () => before, first);
    await click(tab('Post preview')!);
    await open('image', () => after, second);

    expect(tabsShown().map(label)).toEqual(['Post preview', IMAGE]);
    expect(selected()).toEqual([IMAGE]);
    expect(mockTools.mounts.image).toBe(1);

    await loading(mockTools.props.image, true);
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([second]);

    await lands(mockTools.props.image);
    expect(after).toHaveBeenCalledWith(media);
    expect(before).not.toHaveBeenCalled();
  });

  it('only selects a busy tab, whose render lands through its first target at its first place', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open('image', () => before, first);
    await loading(mockTools.props.image, true);
    await click(tab('Post preview')!);
    await open('image', () => after, second);

    expect(selected()).toEqual([IMAGE]);
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first]);

    await click(tab('Post preview')!);
    await lands(mockTools.props.image);
    expect(before).toHaveBeenCalledWith(media);
    expect(after).not.toHaveBeenCalled();
  });
});

// Where a result goes (FR-022, FR-024, FR-025; tasks D10).
describe('a result', () => {
  it('lands in the post from a hidden tab and closes it, leaving the AI tab on screen selected', async () => {
    const image = jest.fn();
    const video = jest.fn();
    await render();
    await open('video', () => video);
    await open('image', () => image);
    await loading(mockTools.props.video, true);
    await lands(mockTools.props.video);

    expect(video).toHaveBeenCalledWith(media);
    expect(tab(VIDEO)).toBeUndefined();
    expect(selected()).toEqual([IMAGE]);
    expect(image).not.toHaveBeenCalled();
  });

  it('lands in the post from a hidden tab and closes it, leaving Post preview on screen', async () => {
    const image = jest.fn();
    await render();
    await open('image', () => image);
    await loading(mockTools.props.image, true);
    await click(tab('Post preview')!);
    await lands(mockTools.props.image);

    expect(image).toHaveBeenCalledWith(media);
    expect(tab(IMAGE)).toBeUndefined();
    expect(selected()).toEqual(['Post preview']);
  });

  it('is added by Use image on the tab on screen, which closes the tab and selects Post preview', async () => {
    const image = jest.fn();
    await render();
    await open('image', () => image);
    await act(async () => {
      mockTools.props.image.onChange(media);
      mockTools.props.image.onAccept();
    });

    expect(image).toHaveBeenCalledWith(media);
    expect(image).toHaveBeenCalledTimes(1);
    expect(tab(IMAGE)).toBeUndefined();
    expect(selected()).toEqual(['Post preview']);
    expect(panel('Post preview').hidden).toBe(false);
  });

  it('from a tab closed while busy keeps its pending entry until it settles, then lands', async () => {
    const image = jest.fn();
    await render();
    await open('image', () => image);
    const tool = mockTools.props.image;
    await loading(tool, true);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);

    expect(tab(IMAGE)).toBeUndefined();
    expect(tabs!.pending).toHaveLength(1);

    await lands(tool);
    expect(tabs!.pending).toEqual([]);
    expect(image).toHaveBeenCalledWith(media);
  });

  it('from a closed tab lands through its own target and leaves a newer tab of its kind open', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open('image', () => before, first);
    const closed = mockTools.props.image;
    await loading(closed, true);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);
    await open('image', () => after, second);
    const newer = mockTools.props.image;
    await loading(newer, true);

    expect(newer).not.toBe(closed);
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first, second]);

    await lands(closed);
    expect(before).toHaveBeenCalledWith(media);
    expect(after).not.toHaveBeenCalled();
    expect(tabs!.pending.map((entry) => entry.place)).toEqual([second]);
    expect(selected()).toEqual([IMAGE]);
    expect(tab(IMAGE)!.getAttribute('aria-busy')).toBe('true');
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
    await open('image', () => handler, { channel: 'global', index: 1 });
    await loading(mockTools.props.image, true);
    // the button unmounts, and the post's media change while it works
    const gone = handler;
    handler = undefined;
    act(() => {
      useLaunchStore
        .getState()
        .appendGlobalValueMedia(1, [{ id: 'b', path: 'b' }]);
    });
    await click(tab('Post preview')!);
    await lands(mockTools.props.image);

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
      internal: [
        { integration: { id: 'int-1' } as any, integrationValue: value() },
        { integration: { id: 'int-2' } as any, integrationValue: value() },
      ],
    });
    await render();
    await open('image', () => undefined, second);
    await loading(mockTools.props.image, true);
    act(() => {
      useLaunchStore
        .getState()
        .appendInternalValueMedia('int-1', 1, [{ id: 'b', path: 'b' }]);
    });
    await click(tab('Post preview')!);
    await lands(mockTools.props.image);

    const [own, other] = useLaunchStore.getState().internal;
    expect(own.integrationValue[1].media.map((each) => each.id)).toEqual([
      'a',
      'b',
      'm-1',
    ]);
    expect(own.integrationValue[0].media).toEqual([]);
    expect(other.integrationValue).toEqual(value());
  });
});

// Each AI panel hosts its tool in the stacked layout, for the post; Post
// preview is the scroll box around the fitted preview, which takes the
// composer's ref.
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

  it('hosts the image tool and the video chooser in the stacked layout for the post', async () => {
    await render();
    await open('image');
    await open('video');

    expect(mockTools.props.image).toMatchObject({
      layout: 'stacked',
      destination: 'post',
    });
    expect(mockTools.props.video).toMatchObject({
      list: mockVideoTypes,
      layout: 'stacked',
      destination: 'post',
    });
  });

  // The layer is the same element at every width, its phone look in
  // `mobile:` classes, so the tool never remounts across a breakpoint (D11).
  it('at 1025px and below makes an active AI tab a full-screen layer with Back to the post, its name and its close (FR-026)', async () => {
    await render();
    await open('image');
    const layer = panel(IMAGE);

    expect(Array.from(layer.classList)).toEqual(
      expect.arrayContaining([
        'mobile:fixed',
        'mobile:inset-0',
        'mobile:z-[600]',
        'bg-newBgColorInner',
      ])
    );
    const back = buttonNamed('Back to the post', layer)!;
    const row = back.parentElement!;
    expect(row.classList.contains('mobile:flex')).toBe(true);
    expect(
      back.querySelector('svg')!.getAttribute('class')!.split(/\s+/)
    ).toContain('rtl:rotate-180');
    expect(row.textContent).toContain(IMAGE);
    expect(buttonNamed(`Close ${IMAGE}`, row)).toBeTruthy();

    await click(back);
    expect(selected()).toEqual(['Post preview']);
    expect(tab(IMAGE)).toBeTruthy();
    expect(panel(IMAGE).hidden).toBe(true);
    expect(mockTools.mounts.image).toBe(1);
  });
});

// The composer's lock for AI work follows whether any render is pending:
// two tabs can render at once and `locked` is one boolean (D14, FR-021a).
describe('the composer’s lock', () => {
  it('leaves a lock already taken, an upload’s, as it is on mount', async () => {
    useLaunchStore.setState({ locked: true });
    await render();

    expect(useLaunchStore.getState().locked).toBe(true);
  });

  it('is taken with the first render and given back when the last one settles', async () => {
    await render();
    await open('image');
    await open('video');

    await loading(mockTools.props.image, true);
    expect(useLaunchStore.getState().locked).toBe(true);
    await loading(mockTools.props.video, true);
    await loading(mockTools.props.image, false);
    expect(useLaunchStore.getState().locked).toBe(true);
    await loading(mockTools.props.video, false);
    expect(useLaunchStore.getState().locked).toBe(false);
  });

  it('stays taken by a busy tab closed until its render settles', async () => {
    await render();
    await open('image');
    const tool = mockTools.props.image;
    await loading(tool, true);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);

    expect(useLaunchStore.getState().locked).toBe(true);
    await lands(tool);
    expect(useLaunchStore.getState().locked).toBe(false);
  });

  it('is not taken by an idle tab, nor by one whose result is on screen', async () => {
    await render();
    await open('image');
    expect(useLaunchStore.getState().locked).toBe(false);

    await loading(mockTools.props.image, true);
    await loading(mockTools.props.image, false);
    expect(tab(IMAGE)).toBeTruthy();
    expect(useLaunchStore.getState().locked).toBe(false);
  });
});

describe('the context', () => {
  it('tells the composer which tab is active (D11)', async () => {
    const onActiveChange = jest.fn();
    await render({ onActiveChange });

    await open('image');
    expect(onActiveChange).toHaveBeenLastCalledWith('image');
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
