import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's channel list: a rail beside the calendar above 1025px, and at
// 1025px and below (phones and iPads held upright) a bottom sheet the toolbar's
// channel chip opens: full width, at most 80% of the screen tall, 16px rounded
// top corners and 80px of room under the last row, over a scrim. Its close
// button, the scrim and Escape close it. jsdom-like DOMs apply no media
// queries, so the width rules are pinned by the classes that carry them.
// While it is open at that width it is a modal dialog, as 044's sheets are: it
// takes the focus and keeps Tab inside, holds the page behind it still and
// hides the support chat bubble.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

// The window, as the media query reports it: 1025px or narrower unless a case
// widens it.
const realMatchMedia = window.matchMedia;
let smallWindow = true;

beforeEach(() => {
  smallWindow = true;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
});

const mounted: Array<{ unmount: () => void }> = [];

// The panel in a host, and a way to open or close it again.
const mountPanel = async (open: boolean, onClose = jest.fn()) => {
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
          onToggleCollapse={() => undefined}
          title="Channels"
        >
          <button type="button">Add Channel</button>
        </SplitPanel>
      );
    });
  };
  await render(open);
  return { host, render };
};
const mount = async (open: boolean, onClose = jest.fn()) =>
  (await mountPanel(open, onClose)).host;

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
const scroller = (host: HTMLElement) =>
  panel(host).firstElementChild as HTMLElement;
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

  it('has a 44px close button named Close, and no collapse chevron', async () => {
    const host = await mount(true);

    expect(close(host)).not.toBeNull();
    expect(classes(close(host))).toEqual(
      expect.arrayContaining([
        'hidden',
        'mobile:flex',
        'mobile:w-[44px]',
        'mobile:h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(classes(chevron(host))).toContain('mobile:hidden');
  });

  it('closes from its close button, the scrim and Escape', async () => {
    const onClose = jest.fn();
    const host = await mount(true, onClose);

    await act(async () => {
      close(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(classes(scrim(host))).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block'])
    );
    await act(async () => {
      scrim(host)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(3);
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

  it('is a modal dialog named by its title', async () => {
    const host = await mount(true);
    const sheet = panel(host);

    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(
      sheet.getAttribute('aria-labelledby') ?? ''
    );
    expect(title?.textContent).toBe('Channels');
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
    const first = close(host)!;
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
      expect(rail.hasAttribute('aria-labelledby')).toBe(false);
      expect(rail.hasAttribute('tabindex')).toBe(false);
      expect(host.querySelector('h2')!.hasAttribute('id')).toBe(false);
    }
    expect(document.body.classList.contains('bottomSheetOpen')).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
