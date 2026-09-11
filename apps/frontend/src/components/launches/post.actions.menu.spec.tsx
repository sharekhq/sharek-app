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
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

import {
  PostAction,
  PostActionsMenu,
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
    await click(
      [...document.querySelectorAll('[role="menuitem"]')].find((n) =>
        (n.textContent || '').includes('Preview')
      )!
    );

    expect(calls).toEqual(['preview']);
    expect(panel()).toBeNull();
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

  it('drops an action the post does not have', async () => {
    await mount(actions().filter((a) => a.key !== 'preview'));
    await click(trigger());

    expect(labels()).toEqual(['Duplicate Post', 'Delete Post']);
  });
});
