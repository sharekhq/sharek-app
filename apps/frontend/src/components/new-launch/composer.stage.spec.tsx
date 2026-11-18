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

import { STAGE_BACKGROUND } from '@gitroom/frontend/components/studio/workspace.frame';
import { ComposerStage } from '@gitroom/frontend/components/new-launch/composer.stage';
import {
  ComposerTabKind,
  ComposerTabs,
  ComposerTabsProvider,
  PreviewPlace,
  useComposerTabs,
  useOpenTool,
} from '@gitroom/frontend/components/new-launch/composer.tabs';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';

const IMAGE = 'AI image generator';
const VIDEO = 'AI Video';
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
  index = 0,
  opener?: HTMLElement
) => {
  await act(async () => {
    tabs!.open(kind, target, index, opener);
  });
};
// The composer's store as a button press finds it: the channel on screen, and
// the channels holding values of their own (tasks D10).
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

    // A tablist owns only tabs (WAI-ARIA's deletable tabs): the × is the
    // pointer's, out of the tab order and the accessibility tree, and Delete
    // closes the tab in focus, which moves to the tab then selected.
    const close = buttonNamed(`Close ${IMAGE}`, strip())!;
    expect(buttonNamed(`Close ${VIDEO}`, strip())).toBeTruthy();
    expect(close.getAttribute('tabindex')).toBe('-1');
    expect(close.getAttribute('aria-hidden')).toBe('true');
    await click(close);

    expect(tabsShown().map(label)).toEqual(['Post preview', VIDEO]);
    expect(host.querySelector('[data-tool="image"]')).toBeNull();

    expect(tab(VIDEO)!.getAttribute('aria-keyshortcuts')).toBe('Delete');
    tab(VIDEO)!.focus();
    await press(tab(VIDEO)!, 'Delete');

    expect(tabsShown().map(label)).toEqual(['Post preview']);
    expect(host.querySelector('[data-tool="video"]')).toBeNull();
    expect(document.activeElement).toBe(tab('Post preview'));
  });

  it('shows a spinner on a working tab, busy with its name unchanged, while its tool holds a pending entry at its place', async () => {
    await render();
    composing('int-1');
    await open('image', undefined, 1);
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
// The post a button works for, read at the click (FR-024; tasks D10): the
// editor's appendImages makes the same choice.
describe('the post a tab works for', () => {
  it('works for the post its button is under, in the channel on screen when that channel holds its own values', async () => {
    await render();
    // Read at the click, not when the composer was drawn.
    composing('c1');
    await open('image', undefined, 2);

    expect(tabs!.tabs.image!.place).toEqual({ channel: 'c1', index: 2 });
  });

  it('works for the global post when the channel on screen holds no values of its own', async () => {
    composing('c1', ['c2']);
    await render();
    await open('video', undefined, 1);

    expect(tabs!.tabs.video!.place).toEqual({ channel: 'global', index: 1 });
  });
});

describe('one tab of each kind', () => {
  it('selects the open tab, which, idle, takes the new target and place', async () => {
    const before = jest.fn();
    const after = jest.fn();
    await render();
    await open('image', () => before);
    await click(tab('Post preview')!);
    composing('int-1');
    await open('image', () => after, 1);

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
    await open('image', () => before);
    await loading(mockTools.props.image, true);
    await click(tab('Post preview')!);
    composing('int-1');
    await open('image', () => after, 1);

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
    await open('image', () => before);
    const closed = mockTools.props.image;
    await loading(closed, true);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);
    composing('int-1');
    await open('image', () => after, 1);
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
    await open('image', () => handler, 1);
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
      current: 'int-1',
      internal: [
        { integration: { id: 'int-1' } as any, integrationValue: value() },
        { integration: { id: 'int-2' } as any, integrationValue: value() },
      ],
    });
    await render();
    await open('image', () => undefined, 1);
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

  // research R1: once the composer has closed, the result is only in the
  // Media library; the store then holds the next composer's post (review C3).
  it('lands in no post once the composer has closed, not in the next composer’s', async () => {
    await render();
    await open('image', () => undefined, 1);
    const tool = mockTools.props.image;
    await loading(tool, true);
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
    await lands(tool);

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
    await open('image', () => handler, 2);
    await loading(mockTools.props.image, true);
    await act(async () => {
      tabs!.postRemoved('global', 0);
      useLaunchStore.getState().deleteGlobalValue(0);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 1 },
    ]);

    await lands(mockTools.props.image);
    expect(posted()).toEqual([[], ['m-1']]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lands in no post, its placeholder and lock gone, when its post is deleted', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open('image', () => handler, 1);
    await loading(mockTools.props.image, true);
    await open('video', () => handler, 1);
    await act(async () => {
      tabs!.postRemoved('global', 1);
      useLaunchStore.getState().deleteGlobalValue(1);
    });

    expect(tabs!.pending).toEqual([]);
    expect(useLaunchStore.getState().locked).toBe(false);

    await loading(mockTools.props.video, true);
    expect(tabs!.pending).toEqual([]);

    await lands(mockTools.props.image);
    await lands(mockTools.props.video);
    expect(posted()).toEqual([[], []]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('follows its post when it is moved a step, and so does the post it swaps with', async () => {
    thread();
    await render();
    await open('video', () => undefined, 0);
    await open('image', () => undefined, 1);
    await loading(mockTools.props.image, true);
    await act(async () => {
      tabs!.postMoved('global', 1, 'up');
      useLaunchStore.getState().changeOrderGlobal(1, 'up');
    });
    await loading(mockTools.props.video, true);

    expect(
      tabs!.pending.map((entry) => [entry.kind, entry.place.index])
    ).toEqual([
      ['image', 0],
      ['video', 1],
    ]);

    await lands(mockTools.props.image);
    expect(posted()).toEqual([['m-1'], [], []]);
  });

  // The first post's up arrow and the last one's down are dimmed, still
  // buttons a key presses; the store leaves those posts where they are.
  it('stays where it is when the first post is moved up or the last one down', async () => {
    thread();
    await render();
    await open('video', () => undefined, 0);
    await open('image', () => undefined, 2);
    await act(async () => {
      tabs!.postMoved('global', 0, 'up');
      tabs!.postMoved('global', 2, 'down');
    });
    await loading(mockTools.props.video, true);
    await loading(mockTools.props.image, true);

    expect(
      tabs!.pending.map((entry) => [entry.kind, entry.place.index])
    ).toEqual([
      ['video', 0],
      ['image', 2],
    ]);
  });

  it('follows its post to the index after when a post is added before it, and lands there through the store, not the old row’s handler', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open('image', () => handler, 1);
    await loading(mockTools.props.image, true);
    await act(async () => {
      tabs!.postAdded('global', 0);
      useLaunchStore
        .getState()
        .addGlobalValue(0, [{ id: 'new', content: '', delay: 0, media: [] }]);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 2 },
    ]);

    await lands(mockTools.props.image);
    expect(posted()).toEqual([[], [], ['m-1'], []]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps its place and its row’s handler when a post is added after it', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open('image', () => handler, 1);
    await loading(mockTools.props.image, true);
    await act(async () => {
      tabs!.postAdded('global', 1);
      tabs!.postAdded('global', 2);
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([
      { channel: 'global', index: 1 },
    ]);

    await lands(mockTools.props.image);
    expect(handler).toHaveBeenCalledWith(media);
  });

  it('from a tab closed while busy follows its post too', async () => {
    const handler = jest.fn();
    thread();
    await render();
    await open('image', () => handler, 2);
    const tool = mockTools.props.image;
    await loading(tool, true);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);
    await act(async () => {
      tabs!.postRemoved('global', 0);
      useLaunchStore.getState().deleteGlobalValue(0);
    });
    await lands(tool);

    expect(posted()).toEqual([[], ['m-1']]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps its place and its row’s handler when a later post, or another channel’s, is deleted or moved', async () => {
    const handler = jest.fn();
    composing('int-1');
    await render();
    await open('image', () => handler, 1);
    await loading(mockTools.props.image, true);
    await act(async () => {
      tabs!.postRemoved('int-1', 2);
      tabs!.postMoved('int-1', 2, 'down');
      tabs!.postRemoved('global', 0);
      tabs!.postMoved('global', 1, 'down');
    });

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([second]);

    await lands(mockTools.props.image);
    expect(handler).toHaveBeenCalledWith(media);
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

  // The video tool builds its render's handlers on setLoading and keeps them
  // for the window's life (`startRequest`, `endRequest`): a new function each
  // render would change them under a render the provider holds (review C9).
  it('hands its tool the same setLoading, onChange and onAccept on every render', async () => {
    await render();
    await open('video');
    const before = mockTools.props.video;
    await loading(before, true);
    await click(tab('Post preview')!);
    const after = mockTools.props.video;

    expect(after).not.toBe(before);
    expect(after.setLoading).toBe(before.setLoading);
    expect(after.onChange).toBe(before.onChange);
    expect(after.onAccept).toBe(before.onAccept);
  });

  it('the preview panel and the AI panel use the shared stage background', async () => {
    await render();
    await open('image');

    const classes = (el: HTMLElement) => Array.from(el.classList).join(' ');
    expect(classes(panel('Post preview'))).toContain(STAGE_BACKGROUND);
    expect(classes(panel(IMAGE))).toContain(STAGE_BACKGROUND);
  });

  it('the phone AI layer stays opaque', async () => {
    await render();
    await open('image');

    const layer = Array.from(panel(IMAGE).classList);
    expect(layer).toContain('mobile:bg-newBgColorInner');
    expect(layer).toContain('mobile:[background-image:none]');
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
        'mobile:bg-newBgColorInner',
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

// At 1025px and below an AI tab is a layer over the post (FR-026): its Back
// and its close give the focus back to the ✦ button the tab was opened from
// while that button is still in the document; the strip's close and Delete
// keep their own.
describe('the focus after the layer', () => {
  /** A ✦ button in the post. */
  const aiButton = () => {
    const element = document.createElement('button');
    document.body.appendChild(element);
    return element;
  };
  const back = () => buttonNamed('Back to the post', panel(IMAGE))!;
  const layerClose = () =>
    buttonNamed(`Close ${IMAGE}`, back().parentElement!)!;

  it('goes back to the button the tab was opened from on Back to the post', async () => {
    const opener = aiButton();
    await render();
    await open('image', undefined, 0, opener);
    back().focus();
    await click(back());

    expect(selected()).toEqual(['Post preview']);
    expect(document.activeElement).toBe(opener);
  });

  it('goes back to the button the tab was opened from on the layer’s close', async () => {
    const opener = aiButton();
    await render();
    await open('image', undefined, 0, opener);
    const close = layerClose();
    close.focus();
    await click(close);

    expect(tab(IMAGE)).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  // The member came from the button pressed last, even when the tab, busy,
  // keeps the post its render started for.
  it('goes back to the button pressed last, a busy tab’s too', async () => {
    const before = aiButton();
    const after = aiButton();
    await render();
    await open('image', undefined, 0, before);
    await loading(mockTools.props.image, true);
    await open('image', undefined, 1, after);
    await click(back());

    expect(tabs!.pending.map((entry) => entry.place)).toEqual([first]);
    expect(document.activeElement).toBe(after);
  });

  it('is left where it falls when that button is no longer in the document', async () => {
    const opener = aiButton();
    const focus = jest.spyOn(opener, 'focus');
    await render();
    await open('image', undefined, 0, opener);
    opener.remove();
    await click(back());
    await open('image', undefined, 0, opener);
    await click(layerClose());

    expect(tab(IMAGE)).toBeUndefined();
    expect(focus).not.toHaveBeenCalled();
  });

  it('is left to the strip’s close and Delete, Delete’s on Post preview', async () => {
    const opener = aiButton();
    await render();
    await open('image', undefined, 0, opener);
    await click(buttonNamed(`Close ${IMAGE}`, strip())!);

    expect(document.activeElement).not.toBe(opener);

    await open('image', undefined, 0, opener);
    tab(IMAGE)!.focus();
    await press(tab(IMAGE)!, 'Delete');

    expect(document.activeElement).toBe(tab('Post preview'));
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

  // A start while the tool's request is open replaces its entry, so none is
  // left behind holding the lock and the placeholder (review C5).
  it('is given back when a render started twice settles, its first entry replaced', async () => {
    await render();
    await open('image');
    await loading(mockTools.props.image, true);
    await loading(mockTools.props.image, true);

    expect(tabs!.pending).toHaveLength(1);

    await loading(mockTools.props.image, false);
    expect(tabs!.pending).toEqual([]);
    expect(useLaunchStore.getState().locked).toBe(false);
    expect(tab(IMAGE)!.getAttribute('aria-busy')).not.toBe('true');
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

// The composer's ✦ AI Image and AI Video buttons (FR-021, FR-027; tasks D10):
// in the composer a button under a post (the editor gives it the post's
// index) opens its kind's tab beside it, never a window, and what the tab
// makes lands through that row's latest handler while the button is there.
// Samy, Studio, a reference row and a row that is not a post's keep the
// window (review C1).
describe("the AI buttons' opener", () => {
  const openWindow = jest.fn();
  beforeEach(() => {
    openWindow.mockClear();
  });

  // A button as the tools draw theirs: the opener on its click.
  const Button = ({
    kind,
    onChange,
    place,
    destination = 'post',
  }: {
    kind: ComposerTabKind;
    onChange: (m: typeof media) => void;
    place?: number;
    destination?: MediaDestination;
  }) => {
    const openTool = useOpenTool(
      kind,
      onChange,
      place,
      destination,
      openWindow
    );
    return <button onClick={openTool} />;
  };
  const aiButton = () => host.querySelector('button')!;

  /** Draws the composer around the button (none once it is gone), or the button alone outside it. */
  const draw = async (button: ReactNode, inComposer = true) => {
    await act(async () => {
      root.render(
        inComposer ? (
          <ComposerTabsProvider>
            <Probe />
            {button}
          </ComposerTabsProvider>
        ) : (
          button
        )
      );
    });
  };

  it("opens its kind's tab for the post at its index, never the window", async () => {
    await draw(<Button kind="video" onChange={jest.fn()} place={2} />);
    await click(aiButton());

    expect(tabs!.active).toBe('video');
    expect(tabs!.tabs.video!.place).toEqual({ channel: 'global', index: 2 });
    expect(openWindow).not.toHaveBeenCalled();
  });

  // The phone layer's Back and close give the focus back to it (FR-026).
  it('keeps the button pressed with the tab', async () => {
    await draw(<Button kind="image" onChange={jest.fn()} place={0} />);
    await click(aiButton());

    expect(tabs!.tabs.image!.opener).toBe(aiButton());
  });

  it('opens the window as before outside the composer, as Samy does', async () => {
    await draw(<Button kind="image" onChange={jest.fn()} />, false);
    await click(aiButton());

    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('opens the window as before outside the composer', async () => {
    await draw(<Button kind="video" onChange={jest.fn()} />, false);
    await click(aiButton());

    expect(openWindow).toHaveBeenCalledTimes(1);
  });

  it('opens the window as before for a reference row, in the composer too', async () => {
    await draw(
      <Button
        kind="image"
        onChange={jest.fn()}
        place={0}
        destination="reference"
      />
    );
    await click(aiButton());

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(tabs!.tabs).toEqual({});
  });

  // A row for the post that no editor drew, a channel's settings (Reddit's)
  // or a model's reference (Seedance's): no post to land in.
  it("opens the window for a row that is not a post's, in the composer too", async () => {
    await draw(<Button kind="video" onChange={jest.fn()} />);
    await click(aiButton());

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(tabs!.tabs).toEqual({});
  });

  // research R4: the row's handler changes with the post, so the click's copy
  // would land the result in the post as it was then.
  it("lands what it makes through the row's latest handler, not the click's", async () => {
    const first = jest.fn();
    const latest = jest.fn();
    await draw(<Button kind="image" onChange={first} place={0} />);
    await click(aiButton());
    await draw(<Button kind="image" onChange={latest} place={0} />);

    tabs!.tabs.image!.target()!(media);

    expect(latest).toHaveBeenCalledWith(media);
    expect(first).not.toHaveBeenCalled();
  });

  it('hands the tab no handler once its button is gone, so the stage lands it through the store', async () => {
    await draw(<Button kind="video" onChange={jest.fn()} place={0} />);
    await click(aiButton());

    expect(tabs!.tabs.video!.target()).toBeDefined();

    await draw(null);

    expect(tabs!.tabs.video!.target()).toBeUndefined();
  });
});
