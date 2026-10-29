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
    toolsStyle?: { bottom?: number; paddingBottom?: number };
    toolBar?: ReactElement;
    toolBarEnd?: ReactElement;
  }) => (
    <div
      data-tools=""
      className={props.toolsClassName}
      data-bottom={props.toolsStyle?.bottom}
      data-pad={props.toolsStyle?.paddingBottom}
    >
      {props.toolBar}
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
        'mobile:pt-[12px]',
        // the home indicator's room under the bar, until the keyboard covers it
        'mobile:pb-[calc(12px+env(safe-area-inset-bottom))]',
        'mobile:z-[440]',
      ])
    );
  });

  it('rides on top of the keyboard as the visual viewport resizes and scrolls', async () => {
    const { host } = await render(post());

    expect(tools(host)[0].hasAttribute('data-bottom')).toBe(false);

    await move('resize', 360);
    expect(tools(host)[0].getAttribute('data-bottom')).toBe('300');
    // no home-indicator room above the keyboard
    expect(tools(host)[0].getAttribute('data-pad')).toBe('12');

    await move('scroll', 360, 40);
    expect(tools(host)[0].getAttribute('data-bottom')).toBe('260');

    await move('resize', 660);
    expect(tools(host)[0].hasAttribute('data-bottom')).toBe(false);
    expect(tools(host)[0].hasAttribute('data-pad')).toBe(false);
  });

  // The app's tooltip does not show on a touch screen, so the emoji tool
  // carries the name its tooltip gave it.
  it('names the emoji tool', async () => {
    const { host } = await render(post());

    expect(
      host
        .querySelector('[data-tooltip-content="Insert Emoji"]')
        ?.getAttribute('aria-label')
    ).toBe('Insert Emoji');
  });

  // The emoji picker opens from the bar, so it rides with it.
  it('opens the emoji picker just above the bar, the keyboard included', async () => {
    const { host } = await render(post());
    const picker = () =>
      Array.from(host.querySelectorAll<HTMLElement>('div')).find((node) =>
        node.className.includes('mobile:fixed mobile:inset-x-0')
      )!;

    expect(picker().className).toContain(
      'mobile:bottom-[calc(72px+env(safe-area-inset-bottom))]'
    );
    expect(picker().style.bottom).toBe('');

    await move('resize', 360);

    expect(picker().style.bottom).toBe('372px');
  });

  // From 1026px up a shrunken visual viewport is a pinch zoom, not a keyboard:
  // nothing moves.
  it('ignores the visual viewport from 1026px up', async () => {
    mobile = false;
    const { host } = await render(post());

    await move('resize', 360);

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
  const thread = async (texts = ['First', 'Second']) => {
    await act(async () => {
      useLaunchStore.getState().reset();
      useLaunchStore.setState({
        current: 'global',
        comments: true,
        global: texts.map((text, n) => ({
          id: `p-${n + 1}`,
          content: `<p>${text}</p>`,
          delay: 0,
          media: [],
        })) as unknown as Store['global'],
      });
    });
    return render(<EditorWrapper totalPosts={texts.length} value="" />);
  };

  // A comment's corner controls at 1025px and below: real buttons, named,
  // 44px each, reachable from the keyboard.
  it('makes a comment’s delete and delay named 44px buttons', async () => {
    const { host } = await thread();

    for (const name of ['Delete Post', 'Delay comment']) {
      const control = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${name}"]`
      )!;
      expect(control.getAttribute('type')).toBe('button');
      expect(control.className.split(' ')).toEqual(
        expect.arrayContaining([
          'mobile:w-[44px]',
          'mobile:h-[44px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
    }
  });

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

  // On a phone the page is one flat sheet, so a comment hangs off the post on
  // desktop's thread line instead of running on from it (spec 044, F-1).
  describe('the thread line', () => {
    // What each post draws beside its editor: nothing for the post, the L
    // (and the line running on) for a comment.
    const lines = (host: HTMLElement) =>
      Array.from(host.querySelectorAll('.flat-editor')).map((editor) =>
        Array.from(editor.parentElement!.children).filter(
          (child) => child !== editor
        )
      );
    const classes = (node: Element) =>
      (node.getAttribute('class') || '').split(' ').filter(Boolean);
    const phoneOnly = (tokens: string[]) =>
      tokens.filter((token) => token.startsWith('mobile:'));

    it('hangs every comment off the post on an L at 1025px and below, and draws none on the post', async () => {
      const { host } = await thread(['First', 'Second', 'Third']);
      const [post, ...comments] = lines(host);

      expect(post).toEqual([]);
      for (const [corner] of comments) {
        expect(classes(corner)).not.toContain('mobile:hidden');
        expect(classes(corner)).toEqual(
          expect.arrayContaining([
            'mobile:absolute',
            'mobile:start-[8px]',
            'mobile:top-0',
            'mobile:h-[35px]',
            'mobile:w-[14px]',
            'mobile:border-s-2',
            'mobile:border-b-2',
            'mobile:border-newSep',
            'mobile:rounded-es-[10px]',
          ])
        );
        // desktop's drawing gives way to the border there
        expect(classes(corner.querySelector('svg')!)).toContain(
          'mobile:hidden'
        );
      }
    });

    it('runs the line on to the next comment at 1025px and below, and stops at the last', async () => {
      const { host } = await thread(['First', 'Second', 'Third']);
      const [, first, last] = lines(host);

      expect(first).toHaveLength(2);
      expect(classes(first[1])).toEqual(
        expect.arrayContaining([
          'hidden',
          'mobile:block',
          'absolute',
          'start-[8px]',
          'top-[25px]',
          'bottom-0',
          'border-s-2',
          'border-newSep',
        ])
      );
      expect(last).toHaveLength(1);
    });

    it('steps a comment in 28px at 1025px and below, so its text starts after the line', async () => {
      const { host } = await thread();
      const [post, comment] = Array.from(
        host.querySelectorAll('.flat-editor')
      ).map((editor) => classes(editor.firstElementChild!));

      expect(post).not.toContain('mobile:ps-[28px]');
      expect(comment).toContain('mobile:ps-[28px]');
    });

    it('names no physical side, so it hangs down the right in Arabic', async () => {
      const { host } = await thread(['First', 'Second', 'Third']);
      const [, first] = lines(host);
      const comment = host.querySelectorAll('.flat-editor')[1];
      const tokens = [
        ...phoneOnly(classes(first[0])),
        ...classes(first[1]),
        ...phoneOnly(classes(comment.firstElementChild!)),
      ];

      expect(
        tokens.filter((token) =>
          /^(\w+:)*-?(p[lr]|m[lr]|left|right|border-[lr]|rounded-([lr]|[tb][lr]))(-|$)/.test(
            token
          )
        )
      ).toEqual([]);
    });

    // A guard, true before F-1 as after: desktop keeps its own drawing.
    it('keeps desktop’s ConnectionLineIcon from 1026px up', async () => {
      const { host } = await thread(['First', 'Second', 'Third']);
      const [, first] = lines(host);
      const desktop = (node: Element) =>
        classes(node).filter((token) => !token.startsWith('mobile:'));

      expect(desktop(first[0]).sort()).toEqual(
        ['flex', 'justify-center', 'pl-[12px]', 'text-newSep'].sort()
      );
      expect(first[0].querySelector('svg path')!.getAttribute('d')).toMatch(
        /^M0\.75 0\.75V79\.75/
      );
    });
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

// A channel edited on its own, at the end of the pinned bar at 1025px and
// below: icon only, still a named button.
describe('back to global', () => {
  it('is a button whose name stays for screen readers when the label hides', async () => {
    const integration = { id: 'int-1', identifier: 'instagram', name: 'Acme' };
    await act(async () => {
      useLaunchStore.getState().reset();
      useLaunchStore.setState({
        current: 'int-1',
        comments: true,
        integrations: [integration] as unknown as Store['integrations'],
        internal: [
          {
            integration,
            integrationValue: [
              { id: 'p-1', content: '<p>First</p>', delay: 0, media: [] },
            ],
          },
        ] as unknown as Store['internal'],
      });
    });
    const { host } = await render(<EditorWrapper totalPosts={1} value="" />);
    const back = Array.from(host.querySelectorAll('button')).find((button) =>
      (button.textContent || '').includes('Back to global')
    )!;
    const text = Array.from(back.querySelectorAll('span'))
      .filter((span) => span.textContent === 'Back to global')
      .at(-1)!;

    expect(back.getAttribute('type')).toBe('button');
    expect(back.className).toContain('focus-visible:ring-brand');
    expect(text.className.split(' ')).toContain('mobile:sr-only');
  });
});
