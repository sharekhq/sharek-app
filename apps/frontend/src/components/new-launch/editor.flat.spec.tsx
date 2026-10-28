import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';

// The composer's flat editor at 1025px and below (spec 044, FR-009): the page
// is the editor, and the tool bar of the post being written is pinned to the
// bottom of the screen and lifted above the on-screen keyboard. Only that
// post's bar shows; the others' are hidden.
//
// The tool bar is MultiMediaComponent's row, so the stand-in below shows what
// the editor hands it. TipTap runs for real, as in editor.paste.spec.tsx.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => new Response('[]'),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@copilotkit/react-core', () => ({
  useCopilotAction: () => {},
  useCopilotReadable: () => {},
}));
jest.mock('emoji-picker-react', () => ({
  __esModule: true,
  default: () => null,
  Theme: {},
}));
jest.mock('@uppy/react', () => ({ Dashboard: () => null }));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({ on: () => {}, off: () => {}, addFile: () => {} }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: (props: {
    toolsClassName?: string;
    toolsStyle?: { bottom?: number };
    toolBarEnd?: ReactElement;
  }) => (
    <div
      data-tools=""
      className={props.toolsClassName}
      data-bottom={props.toolsStyle?.bottom}
    >
      {props.toolBarEnd}
    </div>
  ),
}));
jest.mock('@gitroom/frontend/components/signature', () => ({
  SignatureBox: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/information.component',
  () => ({ InformationComponent: () => null })
);
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('react-dropzone', () => ({
  useDropzone: () => ({ getRootProps: () => ({}), isDragActive: false }),
}));
jest.mock('@gitroom/frontend/components/new-launch/mention.component', () => ({
  suggestion: () => ({ items: async () => [], render: () => ({}) }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => ({}) })
);
jest.mock(
  '@gitroom/frontend/components/launches/general.preview.component',
  () => ({ GeneralPreviewComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/internal.channels', () => ({
  InternalChannels: () => null,
}));

import {
  Editor,
  EditorWrapper,
} from '@gitroom/frontend/components/new-launch/editor';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

type Store = ReturnType<typeof useLaunchStore.getState>;

// What the phone's visual viewport reports: its height shrinks by the
// keyboard's, and it scrolls when the page under the keyboard does.
// happy-dom's EventTarget, so it takes the Event the harness installs.
const DomEventTarget = (
  window as unknown as { EventTarget: typeof EventTarget }
).EventTarget;
class VisualViewport extends DomEventTarget {
  height = 660;
  offsetTop = 0;
}

let viewport: VisualViewport;
let mobile = true;
const mounted: Root[] = [];

beforeAll(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const dom = window as unknown as Record<string, unknown>;
  globals.MutationObserver = dom.MutationObserver;
  // the emoji picker's theme is read from here
  globals.localStorage = dom.localStorage;
});

beforeEach(() => {
  mobile = true;
  viewport = new VisualViewport();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 660,
  });
  window.matchMedia = ((query: string) => ({
    matches: mobile && query === MOBILE_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return { host, root };
};

const post = (props: { active?: boolean; flat?: boolean } = {}) => (
  <Editor
    flat={props.flat ?? true}
    active={props.active ?? true}
    totalPosts={1}
    num={0}
    value=""
    onChange={() => {}}
    setImages={() => {}}
    comments={true}
    selectedIntegration={[]}
    dummy={false}
    chars={{}}
  />
);

const tools = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[data-tools]'));

const move = async (event: 'resize' | 'scroll', height: number, top = 0) => {
  viewport.height = height;
  viewport.offsetTop = top;
  await act(async () => {
    viewport.dispatchEvent(new Event(event));
  });
};

describe('the tool bar of the post being written', () => {
  it('is pinned to the bottom of the screen, 44px tools in a 68px bar, over the top bar', async () => {
    const { host } = await render(post());

    expect(tools(host)[0].className.split(' ')).toEqual(
      expect.arrayContaining([
        'post-toolbar',
        'mobile:fixed',
        'mobile:bottom-0',
        'mobile:inset-x-0',
        'mobile:px-[16px]',
        'mobile:py-[12px]',
        'mobile:z-[440]',
      ])
    );
  });

  it('rides on top of the keyboard as the visual viewport resizes and scrolls', async () => {
    const { host } = await render(post());

    expect(tools(host)[0].hasAttribute('data-bottom')).toBe(false);

    await move('resize', 360);
    expect(tools(host)[0].getAttribute('data-bottom')).toBe('300');

    await move('scroll', 360, 40);
    expect(tools(host)[0].getAttribute('data-bottom')).toBe('260');

    await move('resize', 660);
    expect(tools(host)[0].hasAttribute('data-bottom')).toBe(false);
  });

  it('listens to the viewport only while its post is the one being written', async () => {
    const add = jest.spyOn(viewport, 'addEventListener');
    const remove = jest.spyOn(viewport, 'removeEventListener');
    const { root } = await render(post());

    expect(add.mock.calls.map(([name]) => name).sort()).toEqual([
      'resize',
      'scroll',
    ]);

    await act(async () => {
      root.render(post({ active: false }));
    });
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual([
      'resize',
      'scroll',
    ]);

    await act(async () => {
      root.render(post());
    });
    remove.mockClear();
    await act(async () => {
      root.unmount();
    });
    mounted.splice(0);
    expect(remove.mock.calls.map(([name]) => name).sort()).toEqual([
      'resize',
      'scroll',
    ]);
  });

  it('is hidden on a phone for a post not being written', async () => {
    const { host } = await render(post({ active: false }));

    expect(tools(host)[0].className).toBe('mobile:hidden');
  });

  // The thread finisher's editor is not the composer: it keeps its bar where it is.
  it('stays where it is in an editor that is not flat', async () => {
    const { host } = await render(post({ flat: false }));

    expect(tools(host)[0].getAttribute('class')).toBeNull();
  });
});

describe('a post with comments', () => {
  const thread = async () => {
    await act(async () => {
      useLaunchStore.getState().reset();
      useLaunchStore.setState({
        current: 'global',
        comments: true,
        global: [
          { id: 'p-1', content: '<p>First</p>', delay: 0, media: [] },
          { id: 'p-2', content: '<p>Second</p>', delay: 0, media: [] },
        ] as unknown as Store['global'],
      });
    });
    return render(<EditorWrapper totalPosts={2} value="" />);
  };

  it('pins the last post’s bar and hides the first one’s', async () => {
    const { host } = await thread();
    const [first, last] = tools(host);

    expect(first.className).toBe('mobile:hidden');
    expect(last.className).toContain('post-toolbar');
  });

  it('puts Add comment at the end of the pinned bar only', async () => {
    const { host } = await thread();
    const [first, last] = tools(host);

    expect(first.textContent).toBe('');
    expect(last.textContent).toContain('Add comment or post');
  });

  it('moves the bar to the post the writer goes to', async () => {
    const { host } = await thread();
    const firstText = host.querySelectorAll('.ProseMirror')[0].parentElement!;

    await act(async () => {
      firstText.dispatchEvent(
        new (window as unknown as { FocusEvent: typeof FocusEvent }).FocusEvent(
          'focusin',
          { bubbles: true }
        )
      );
    });
    const [first, last] = tools(host);

    expect(first.className).toContain('post-toolbar');
    expect(last.className).toBe('mobile:hidden');
  });
});

describe('a tap on an empty part of the post', () => {
  const editorOf = (host: HTMLElement) =>
    (
      host.querySelector('.ProseMirror') as unknown as {
        editor: { isFocused: boolean };
      }
    ).editor;

  it('starts typing in it on a phone', async () => {
    const { host } = await render(post());
    const flat = host.querySelector('.flat-editor')!;

    await act(async () => {
      flat.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(editorOf(host).isFocused).toBe(true);
  });

  it('does nothing from 1026px up', async () => {
    mobile = false;
    const { host } = await render(post());
    const flat = host.querySelector('.flat-editor')!;

    await act(async () => {
      flat.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(editorOf(host).isFocused).toBe(false);
  });
});
