import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's channel list: a rail beside the calendar above 1025px, and at
// 1025px and below (phones and iPads held upright) a bottom sheet the toolbar's
// channel chip opens: full width, at most 80% of the screen tall, 16px rounded
// top corners, a grab handle and 80px of room under the last row, over a
// scrim. It draws no header: its child draws its own, with the button that
// closes it. The scrim, Escape and the screen growing past 1025px close it.
// jsdom-like DOMs apply no media queries, so the width rules are pinned by the
// classes that carry them.
// While it is open at that width it is a modal dialog named by its label, as
// 044's sheets are: it takes the focus and keeps Tab inside, holds the page
// behind it still and hides the support chat bubble.
// Samy's chats open at that width as a drawer instead (R15): from the start
// side of the screen, the full height, as wide as the SamyPhoneChats board's
// 318px, with no grab handle. Only where it sits changes.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

// The window, as the media query reports it: 1025px or narrower unless a case
// widens it, and what listens for it to change.
const realMatchMedia = window.matchMedia;
let smallWindow = true;
const listeners = new Set<() => void>();

beforeEach(() => {
  smallWindow = true;
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;
});

// The window resized to 1025px or narrower, or wider, as the media query's
// listeners hear it.
const resize = async (small: boolean) => {
  smallWindow = small;
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
};

const mounted: Array<{ unmount: () => void }> = [];

// The panel in a host, and a way to open or close it again.
const mountPanel = async (
  open: boolean,
  onClose = jest.fn(),
  collapsed = false,
  variant?: 'sheet' | 'drawer'
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const render = async (isOpen: boolean) => {
    await act(async () => {
      root.render(
        <SplitPanel
          open={isOpen}
          onClose={onClose}
          label="Channels"
          collapsed={collapsed}
          variant={variant}
        >
          <button type="button">Done</button>
          <button type="button">Add Channel</button>
        </SplitPanel>
      );
    });
  };
  await render(open);
  return { host, render };
};
const mount = async (open: boolean, onClose = jest.fn(), collapsed = false) =>
  (await mountPanel(open, onClose, collapsed)).host;

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  document.body.className = '';
  window.matchMedia = realMatchMedia;
});

const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
const panel = (host: HTMLElement) => host.firstElementChild as HTMLElement;
// the sheet's grab handle comes first, when there is one
const scroller = (host: HTMLElement) =>
  panel(host).lastElementChild as HTMLElement;
const close = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('button[aria-label="Close"]');
// the collapse chevron, drawn by this path
const chevron = (host: HTMLElement) =>
  host.querySelector('path[d="M6 11.5L1 6.5L6 1.5"]')?.closest('svg')
    ?.parentElement as HTMLElement | undefined;
const byText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll<HTMLElement>('button')).find(
    (el) => el.textContent === text
  )!;
const scrim = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[aria-hidden="true"].fixed');
const press = async (target: Element, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    code: 'Tab',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('the channel sheet at 1025px and below', () => {
  it('is hidden while closed', async () => {
    const host = await mount(false);

    expect(classes(panel(host))).toContain('mobile:hidden');
    expect(scrim(host)).toBeNull();
  });

  it('opens as a full-width sheet from the bottom, 80% tall at most, with rounded top corners', async () => {
    const host = await mount(true);

    expect(classes(panel(host))).toEqual(
      expect.arrayContaining([
        'mobile:fixed',
        'mobile:inset-x-0',
        'mobile:bottom-0',
        'mobile:z-[190]',
        'mobile:w-full',
        'mobile:max-h-[80vh]',
        'mobile:rounded-t-[16px]',
        'mobile:overflow-hidden',
      ])
    );
    expect(classes(panel(host))).not.toContain('mobile:hidden');
    expect(classes(scroller(host))).toEqual(
      expect.arrayContaining([
        'mobile:static',
        'mobile:h-auto',
        'mobile:max-h-[80vh]',
        'mobile:pb-[80px]',
      ])
    );
  });

  it('draws no title row, close button or chevron of its own, and its child comes first', async () => {
    for (const open of [true, false]) {
      const host = await mount(open);

      expect(host.querySelector('h2')).toBeNull();
      expect(close(host)).toBeNull();
      expect(chevron(host)).toBeUndefined();
      expect(Array.from(scroller(host).children)).toEqual([
        byText(host, 'Done'),
        byText(host, 'Add Channel'),
      ]);
    }
  });

  // A sticky header in a scroller with top padding sticks that far below the
  // scroller's top, and rows scroll through the band above it (C28), so the
  // child's header carries the top padding instead. At the sides it keeps the
  // board's 8px, the inset of the list's rows, which leaves a row's name and
  // state the board's 148px: at 20px "Disabled · over your plan" was cut.
  it('leaves its top unpadded for the child to fill, with 8px at the sides and 20px at the bottom', async () => {
    for (const open of [true, false]) {
      const host = await mount(open);
      const own = classes(scroller(host));
      // p-*, py-* and pt-*, under any variant
      const top = own.filter((name) => /^(?:[^:]+:)*p[ty]?-/.test(name));
      // px-*, ps-* and pe-*, under any variant
      const sides = own.filter((name) => /^(?:[^:]+:)*p[xse]-/.test(name));

      expect(top).toEqual([]);
      expect(sides).toEqual(['px-[8px]']);
      expect(own).toContain('pb-[20px]');
    }
  });

  // The icon rail is the board's: 64px wide, 6px at the sides, which leaves
  // its pictures a 52px column. A 36px picture with its 2px focus ring takes
  // 40 of it, and on a touch screen its 44px target with the ring 48.
  it('is 64px wide as the icon rail, with 6px at the sides', async () => {
    const host = await mount(false, jest.fn(), true);
    const own = classes(scroller(host));

    expect(
      classes(panel(host)).filter((name) => /^(?:[^:]+:)*w-/.test(name))
    ).toEqual(['w-[64px]']);
    expect(own.filter((name) => /^(?:[^:]+:)*p[xse]-/.test(name))).toEqual([
      'px-[6px]',
    ]);
  });

  // The board's sheet has a grab handle at its top: 36 by 4px with 2px round
  // ends, in the line colour, 8px under the top edge and centred
  // (contracts/channel-panel.md). It is only a picture, so assistive
  // technology skips it, and it stays put while the list scrolls under it.
  it('draws a grab handle at the top of the open sheet, and none on the rail', async () => {
    const host = await mount(true);
    const handle = panel(host).firstElementChild!;

    expect(handle).not.toBe(scroller(host));
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(handle.childNodes.length).toBe(0);
    expect(classes(handle)).toEqual(
      expect.arrayContaining([
        'hidden',
        'mobile:block',
        'flex-none',
        'self-center',
        'w-[36px]',
        'h-[4px]',
        'mt-[8px]',
        'rounded-[2px]',
        'bg-line',
      ])
    );
    // shown at 1025px and below only: no display of its own above that
    expect(
      classes(handle).filter((name) =>
        /^(?:block|flex|grid|inline(?:-\w+)?)$/.test(name)
      )
    ).toEqual([]);
    // on the sheet's own surface, as the scroller under it is, not over the
    // scrim
    expect(classes(panel(host))).toContain('mobile:bg-newBgColorInner');
  });

  it('draws no grab handle while closed', async () => {
    const host = await mount(false);

    expect(Array.from(panel(host).children)).toEqual([scroller(host)]);
  });

  it('closes from the scrim and Escape', async () => {
    const onClose = jest.fn();
    const host = await mount(true, onClose);

    expect(classes(scrim(host))).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block'])
    );
    await act(async () => {
      scrim(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes once the screen grows past 1025px, and not while it stays at 1025px or below', async () => {
    const onClose = jest.fn();
    await mount(true, onClose);

    await resize(true);
    expect(onClose).not.toHaveBeenCalled();

    await resize(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls nothing while closed, whatever the screen does', async () => {
    const onClose = jest.fn();
    await mount(false, onClose);

    await resize(false);
    await resize(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps none of the side drawer it replaces', async () => {
    for (const open of [true, false]) {
      const host = await mount(open);
      const all = [host, ...Array.from(host.querySelectorAll('*'))].flatMap(
        classes
      );

      expect(all.filter((name) => name.includes('translate-x'))).toEqual([]);
      expect(all.filter((name) => name.startsWith('phone:'))).toEqual([]);
    }
  });
});

describe('the open channel sheet at 1025px and below', () => {
  it('is a modal dialog named by its label', async () => {
    const host = await mount(true);
    const sheet = panel(host);

    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.getAttribute('aria-label')).toBe('Channels');
  });

  it('takes the focus when it opens and gives it back when it closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { host, render } = await mountPanel(true);

    expect(document.activeElement).toBe(panel(host));
    expect(panel(host).getAttribute('tabindex')).toBe('-1');

    await render(false);

    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside, from the last control to the first and back', async () => {
    const host = await mount(true);
    const first = panel(host).querySelector('button')!;
    const last = byText(host, 'Add Channel');
    last.focus();

    const forward = await press(last);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const back = await press(first, { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('holds the page behind it still and hides the support chat bubble, until it closes', async () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    document.body.appendChild(scroller);
    const { host, render } = await mountPanel(false);
    scroller.appendChild(host);

    await render(true);

    expect(scroller.style.overflowY).toBe('hidden');
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(true);

    await render(false);

    expect(scroller.style.overflowY).toBe('auto');
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(false);
  });

  it('is none of that while closed, or open above 1025px', async () => {
    const closed = await mount(false);
    smallWindow = false;
    const wide = await mount(true);

    for (const host of [closed, wide]) {
      const rail = panel(host);
      expect(rail.hasAttribute('role')).toBe(false);
      expect(rail.hasAttribute('aria-modal')).toBe(false);
      expect(rail.hasAttribute('aria-label')).toBe(false);
      expect(rail.hasAttribute('tabindex')).toBe(false);
    }
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});

// Samy's chats (R15, FR-041): at 1025px and below the panel opens from the
// start side of the screen rather than its bottom. Everything else is the
// sheet's: the scrim, the dialog, the focus, and what closes it (FR-043).
describe('the start-side drawer at 1025px and below', () => {
  const drawer = (open: boolean, onClose = jest.fn()) =>
    mountPanel(open, onClose, false, 'drawer');
  // a class on a physical side, which stays put when Arabic flips the page
  const physical = (name: string) => /^(?:[^:]+:)*-?(?:left|right)-/.test(name);
  const wide = (node: Element) =>
    classes(node).filter((name) => !name.startsWith('mobile:'));

  it('is hidden while closed', async () => {
    const { host } = await drawer(false);

    expect(classes(panel(host))).toContain('mobile:hidden');
    expect(scrim(host)).toBeNull();
  });

  // The SamyPhoneChats board's .drawer: top 0, bottom 0, inset-inline-start 0,
  // 318px wide, on the panel's surface with the card shadow.
  it('opens from the start edge, the full height of the screen and 318px wide, over a scrim', async () => {
    const { host } = await drawer(true);
    const own = classes(panel(host));

    expect(own).toEqual(
      expect.arrayContaining([
        'mobile:fixed',
        'mobile:inset-y-0',
        'mobile:start-0',
        'mobile:z-[190]',
        'mobile:w-[318px]',
        'mobile:bg-newBgColorInner',
        'mobile:shadow-card',
      ])
    );
    // none of the sheet's place: along the bottom, the screen's width, 80%
    // of its height at most, rounded at the top
    for (const name of [
      'mobile:hidden',
      'mobile:inset-x-0',
      'mobile:bottom-0',
      'mobile:w-full',
      'mobile:max-h-[80vh]',
      'mobile:rounded-t-[16px]',
    ])
      expect(own).not.toContain(name);
    // logical sides only, so in Arabic it comes in from the right
    expect([...own, ...classes(scroller(host))].filter(physical)).toEqual([]);
    // the sheet's scrim, under the drawer
    expect(classes(scrim(host))).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block', 'fixed', 'inset-0'])
    );
  });

  // The sheet's scroller sizes to its rows, up to 80% of the screen, with 80px
  // under the last; the drawer's keeps the rail's, filling it top to bottom.
  it('scrolls its child the whole height of the drawer, as the rail does', async () => {
    const { host } = await drawer(true);
    const own = classes(scroller(host));

    expect(own).toEqual(
      expect.arrayContaining([
        'absolute',
        'top-0',
        'h-full',
        'overflow-y-auto',
        'pb-[20px]',
        'px-[8px]',
      ])
    );
    expect(own.filter((name) => name.startsWith('mobile:'))).toEqual([]);
  });

  // The grab handle is the sheet's. The close button is the chats panel's.
  it('draws no grab handle and no close button of its own, and its child comes first', async () => {
    const { host } = await drawer(true);

    expect(Array.from(panel(host).children)).toEqual([scroller(host)]);
    expect(close(host)).toBeNull();
    expect(Array.from(scroller(host).children)).toEqual([
      byText(host, 'Done'),
      byText(host, 'Add Channel'),
    ]);
  });

  it('is the same rail as the sheet above 1025px, open or closed', async () => {
    for (const open of [true, false]) {
      const sheet = await mount(open);
      const { host } = await drawer(open);

      expect(wide(panel(host))).toEqual(wide(panel(sheet)));
      expect(wide(scroller(host))).toEqual(wide(scroller(sheet)));
    }
  });

  it('is a modal dialog named by its label, and not a dialog open above 1025px', async () => {
    const { host } = await drawer(true);

    expect(panel(host).getAttribute('role')).toBe('dialog');
    expect(panel(host).getAttribute('aria-modal')).toBe('true');
    expect(panel(host).getAttribute('aria-label')).toBe('Channels');

    smallWindow = false;
    const { host: wideHost } = await drawer(true);
    expect(panel(wideHost).hasAttribute('role')).toBe(false);
    expect(panel(wideHost).hasAttribute('aria-modal')).toBe(false);
    expect(panel(wideHost).hasAttribute('aria-label')).toBe(false);
    expect(panel(wideHost).hasAttribute('tabindex')).toBe(false);
  });

  it('takes the focus when it opens and gives it back when it closes', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { host, render } = await drawer(true);

    expect(document.activeElement).toBe(panel(host));
    expect(panel(host).getAttribute('tabindex')).toBe('-1');

    await render(false);

    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab inside, from the last control to the first and back', async () => {
    const { host } = await drawer(true);
    const first = byText(host, 'Done');
    const last = byText(host, 'Add Channel');
    last.focus();

    const forward = await press(last);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const back = await press(first, { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('holds the page behind it still and hides the support chat bubble, until it closes', async () => {
    const page = document.createElement('div');
    page.style.overflowY = 'auto';
    document.body.appendChild(page);
    const { host, render } = await drawer(false);
    page.appendChild(host);

    await render(true);

    expect(page.style.overflowY).toBe('hidden');
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(true);

    await render(false);

    expect(page.style.overflowY).toBe('auto');
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(false);
  });

  it('closes from the scrim and Escape, and once the screen grows past 1025px', async () => {
    const onClose = jest.fn();
    const { host } = await drawer(true, onClose);

    await act(async () => {
      scrim(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await resize(true);
    expect(onClose).toHaveBeenCalledTimes(2);

    await resize(false);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
