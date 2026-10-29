// Finding 69 (spec 021): the post card's actions were revealed inside the
// strip, and the week grid gives that strip a 58px column — ~200px of coarse
// controls, ~79px on the mouse path, painting over the days on either side.
// `coarse:hidden` bought the touch half at the cost of the actions; this
// component buys both by taking the list out of the cell entirely.
//
// What is pinned here is that contract: nothing but the trigger is in the cell
// until it is asked for, and what opens is positioned against the viewport
// rather than laid out in the column. The pixel geometry is the probe's job —
// happy-dom has no layout — so these assert the structure that makes the
// geometry impossible to get wrong.
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

import {
  PostAction,
  PostActionsMenu,
  PostActionsMenuHandle,
} from '@gitroom/frontend/components/launches/post.actions.menu';

const calls: string[] = [];

const actions = (): PostAction[] => [
  {
    key: 'duplicate',
    icon: <i data-testid="icon-duplicate" />,
    label: 'Duplicate Post',
    onClick: () => calls.push('duplicate'),
  },
  {
    key: 'preview',
    icon: <i data-testid="icon-preview" />,
    label: 'Preview Post',
    onClick: () => calls.push('preview'),
  },
  {
    key: 'delete',
    icon: <i data-testid="icon-delete" />,
    label: 'Delete Post',
    onClick: () => calls.push('delete'),
    danger: true,
  },
];

const mounted: Array<{ unmount: () => void }> = [];
let host: HTMLElement;

const mount = async (list: PostAction[] = actions()) => {
  calls.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<PostActionsMenu actions={list} label="Post actions" />);
  });
};

const trigger = () =>
  host.querySelector('[aria-haspopup="menu"]') as HTMLElement;
const panel = () => document.querySelector('[role="menu"]');
const labels = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((n) =>
    (n.textContent || '').trim()
  );
const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
    (n.textContent || '').includes(label)
  )!;

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

describe('post actions menu', () => {
  it('puts nothing in the cell but the trigger until it is asked for', async () => {
    await mount();

    expect(trigger()).toBeTruthy();
    expect(panel()).toBeNull();
    // The icons themselves are what used to be laid out in the 58px column.
    expect(host.querySelector('[data-testid="icon-duplicate"]')).toBeNull();
  });

  it('opens the full list on click', async () => {
    await mount();
    await click(trigger());

    expect(labels()).toEqual(['Duplicate Post', 'Preview Post', 'Delete Post']);
  });

  it('opens against the viewport, not inside the column', async () => {
    await mount();
    await click(trigger());

    // `fixed` is the whole point: a panel positioned in the cell would inherit
    // the 58px the actions never fitted.
    expect(panel()!.className.split(' ')).toContain('fixed');
    expect((panel() as HTMLElement).style.left).not.toBe('');
    expect((panel() as HTMLElement).style.top).not.toBe('');
  });

  it('runs the action it was asked for, once, and closes', async () => {
    await mount();
    await click(trigger());
    await click(menuItem('Preview'));

    expect(calls).toEqual(['preview']);
    expect(panel()).toBeNull();
  });

  // Open Post opens its tab from the action, and a browser only lets a page
  // open one inside the click that asked for it: an action run a tick later
  // is blocked as a popup.
  it('runs the action inside the click that chose it', async () => {
    await mount();
    await click(trigger());

    // A synchronous act runs no timer, so an action deferred past the click
    // has not run when the assertion reads the calls.
    act(() => {
      menuItem('Preview').dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(calls).toEqual(['preview']);
  });

  it('closes on a press elsewhere without running anything', async () => {
    await mount();
    await click(trigger());
    expect(panel()).toBeTruthy();

    // useClickOutside listens on mousedown/touchstart, so that is what closing
    // it actually looks like.
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(panel()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('reports its state to assistive technology', async () => {
    await mount();

    expect(trigger().getAttribute('aria-label')).toBe('Post actions');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    await click(trigger());

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('opens from the keyboard, the way a button does', async () => {
    await mount();

    await act(async () => {
      trigger().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
    });

    expect(panel()).toBeTruthy();
  });

  // calendar.tsx:1172 paints the card's strip `text-white` when the post's first
  // tag carries a colour, and the panel is a DOM child of that strip however far
  // from it `fixed` puts it on screen. So a tagged post opened a white list on a
  // white surface: every label and every icon inherited the strip's colour, and
  // only the `text-error` delete icon was left visible. The panel names its own
  // foreground so nothing the card does to its text can reach inside it.
  it('keeps its own foreground colour inside a tag-coloured strip', async () => {
    await mount();
    // The two declarations Tailwind emits for this config, so the cascade under
    // test is the app's: `text-white` from calendar.tsx:1172 on the strip, and
    // the panel's own colour resolving through the body token (colors.scss).
    const style = document.createElement('style');
    style.textContent = `
      :root { --ink: #1A1413; --new-btn-text: var(--ink); }
      .text-white { color: rgb(255 255 255); }
      .text-textColor { color: var(--new-btn-text); }
    `;
    document.body.appendChild(style);
    host.className = 'text-white';

    await click(trigger());

    // Labels and non-danger icons both take this colour; `currentColor` carries
    // it into the SVGs.
    const item = document.querySelector('[role="menuitem"]') as HTMLElement;
    expect(getComputedStyle(item).color).not.toBe('rgb(255 255 255)');
    expect(getComputedStyle(item).color).toBe('#1A1413');
  });

  // The dots were painted only under the pointer (`hidden group-hover:block`),
  // so on a mouse the strip advertised nothing: the only way to learn a post
  // had actions was to hover it and notice something appear. Coarse pointers
  // have always had them outright, because there is no hover to wait for —
  // this is the same answer for the mouse.
  it('shows the dots whether or not the pointer is on the card', async () => {
    await mount();

    const dots = trigger().querySelector('svg')!;
    expect(dots.getAttribute('class')).not.toContain('hidden');
  });

  // calendar.tsx:1218 hangs the provider's platform badge off the avatar at
  // `z-10`, and the card body is a later sibling of the strip. The trigger used
  // to carry `z-[10]` itself, which made it a stacking context: the panel's
  // `z-[100]` then resolved *inside* the trigger rather than against the card,
  // so the whole list travelled at the trigger's 10 and lost the tie to the
  // badge on tree order. The provider's icon painted through the open menu.
  // Nothing in the strip needs a z-index — being positioned already puts the
  // trigger over the tag name — so the panel keeps its own.
  it('does not trap the panel under the card that opened it', async () => {
    await mount();

    expect(
      trigger()
        .className.split(' ')
        .filter((name) => name.startsWith('z-'))
    ).toEqual([]);
  });

  // Rows that run an action on click and answer nothing on hover read as a
  // caption list. `boxHover` is `--surface-2` against the panel's `--surface`,
  // the pairing launches.component.tsx:234 uses for a row on the same plane.
  it('marks the row the pointer is on', async () => {
    await mount();
    await click(trigger());

    [...document.querySelectorAll('[role="menuitem"]')].forEach((item) => {
      expect(item.className).toContain('hover:bg-boxHover');
    });
  });

  // A month chip at 1025px and below has no room for the button: what owns the
  // chip opens the list through the ref when a finger holds it still
  // (calendar.tsx). The menu covers the chip without taking its touches, and
  // its list takes them back.
  it('opens a held menu through its ref, with no button and touches let through', async () => {
    const menu = createRef<PostActionsMenuHandle>();
    host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <PostActionsMenu
          ref={menu}
          held
          actions={actions()}
          label="Post actions"
        />
      );
    });

    expect(trigger()).toBeNull();
    expect(host.querySelector('svg')).toBeNull();
    expect(
      (host.firstElementChild as HTMLElement).className.split(' ')
    ).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block', 'pointer-events-none'])
    );

    act(() => menu.current!.open());

    expect(labels()).toEqual(['Duplicate Post', 'Preview Post', 'Delete Post']);
    expect(panel()!.className.split(' ')).toContain('pointer-events-auto');
    expect(panel()!.getAttribute('aria-label')).toBe('Post actions');

    act(() => menu.current!.close());

    expect(panel()).toBeNull();
  });

  it('drops an action the post does not have', async () => {
    await mount(actions().filter((a) => a.key !== 'preview'));
    await click(trigger());

    expect(labels()).toEqual(['Duplicate Post', 'Delete Post']);
  });

  // Near the bottom of the screen the list used to be pulled up over the post
  // that opened it, so a finger still holding a month chip ended up on a menu
  // item and lit it. Where nothing fits below, it opens above.
  describe('placed against the post it opened from', () => {
    const PANEL_HEIGHT = 150;

    // happy-dom lays nothing out: the trigger answers the box it is given, and
    // the list a 150px box wherever its `top` puts it.
    const layout = (box: { top: number; bottom: number }) =>
      jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          const top =
            this.getAttribute('role') === 'menu'
              ? parseFloat(this.style.top) || 0
              : box.top;
          const height =
            this.getAttribute('role') === 'menu'
              ? PANEL_HEIGHT
              : box.bottom - box.top;
          return {
            top,
            bottom: top + height,
            height,
            left: 20,
            right: 220,
            width: 200,
            x: 20,
            y: top,
            toJSON: () => undefined,
          };
        });
    const panelTop = () => parseFloat((panel() as HTMLElement).style.top);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('opens below the post when the list fits there', async () => {
      layout({ top: 100, bottom: 144 });
      await mount();
      await click(trigger());

      expect(panelTop()).toBe(148);
    });

    it('opens above a post near the bottom of the screen, clear of it', async () => {
      const bottom = window.innerHeight - 20;
      layout({ top: bottom - 44, bottom });
      await mount();
      await click(trigger());

      expect(panelTop() + PANEL_HEIGHT).toBe(bottom - 44 - 4);
    });

    it('opens a held menu above a month chip near the bottom of the screen', async () => {
      const bottom = window.innerHeight - 20;
      layout({ top: bottom - 44, bottom });
      const menu = createRef<PostActionsMenuHandle>();
      host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      mounted.push(root);
      await act(async () => {
        root.render(
          <PostActionsMenu
            ref={menu}
            held
            actions={actions()}
            label="Post actions"
          />
        );
      });

      act(() => menu.current!.open());

      expect(panelTop() + PANEL_HEIGHT).toBe(bottom - 44 - 4);
    });
  });
});
