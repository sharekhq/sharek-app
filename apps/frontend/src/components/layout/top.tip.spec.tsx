import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The one tooltip every `data-tooltip-id="tooltip"` in the app opens. A touch
// screen never shows it: a tap fires the mouse events that open it, and it
// stayed on screen over whatever the tap opened, the Media Library among them.
// With a mouse it shows where it adds something, an icon-only button or the
// reason a control is off, and not over a control that already reads its text.

import { NO_HOVER_QUERY } from '@gitroom/react/helpers/use.media.query';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';

// The device, as its hover media query reports it.
const realMatchMedia = window.matchMedia;
let touch = false;

beforeAll(() => {
  // The tooltip finds its anchors with these, as a browser provides them.
  const globals = globalThis as unknown as Record<string, unknown>;
  const dom = window as unknown as Record<string, unknown>;
  globals.MutationObserver = dom.MutationObserver;
  globals.ResizeObserver = dom.ResizeObserver;
});

beforeEach(() => {
  touch = false;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return touch && query === NO_HOVER_QUERY;
    },
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
});

const mounted: Array<{ unmount: () => void }> = [];

// The anchors with the app's tooltip mounted beside them, and a way to show
// different anchors in the same place.
const mountTree = async (anchors: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const render = async (next: ReactNode) => {
    await act(async () => {
      root.render(
        <>
          {next}
          <ToolTip />
        </>
      );
    });
  };
  await render(anchors);
  return { host, render };
};
const mount = async (anchors: ReactNode) => (await mountTree(anchors)).host;

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
});

// The pointer comes to rest on the anchor, from a mouse or from a tap's
// compatibility events, and the tooltip's show delay passes.
const hover = async (anchor: Element | null) => {
  await act(async () => {
    anchor!.dispatchEvent(new MouseEvent('mouseenter'));
    anchor!.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

// The pointer moves off the anchor and the tooltip closes, then finishes
// closing: react-tooltip unmounts it on a timer its close starts.
const leave = async (anchor: Element | null) => {
  await act(async () => {
    anchor!.dispatchEvent(new MouseEvent('mouseleave'));
    anchor!.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
};

const tooltip = () => document.getElementById('tooltip');

const anchor = (host: HTMLElement) =>
  host.querySelector('[data-tooltip-id="tooltip"]');

const BellIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
  </svg>
);

describe('the app tooltip', () => {
  it('never opens on a touch screen', async () => {
    touch = true;
    const host = await mount(
      <>
        <button
          type="button"
          aria-label="Billing History"
          data-tooltip-id="tooltip"
          data-tooltip-content="Billing History"
        >
          <BellIcon />
        </button>
        <button
          type="button"
          data-tooltip-id="tooltip"
          data-tooltip-html="<strong>Vertical · 9:16</strong>"
        >
          Vertical
        </button>
      </>
    );

    for (const target of Array.from(
      host.querySelectorAll('[data-tooltip-id="tooltip"]')
    )) {
      await hover(target);
      expect(tooltip()).toBeNull();
    }
  });

  it('opens over an icon-only button with a mouse', async () => {
    const host = await mount(
      <button
        type="button"
        aria-label="Billing History"
        data-tooltip-id="tooltip"
        data-tooltip-content="Billing History"
      >
        <BellIcon />
      </button>
    );

    await hover(anchor(host));

    expect(tooltip()?.textContent).toBe('Billing History');
  });

  it('opens over an icon that is a bare svg', async () => {
    const host = await mount(
      <div>
        <svg
          width="24"
          height="24"
          data-tooltip-id="tooltip"
          data-tooltip-content="Logout from Sharek"
        >
          <path d="M20 12H9" />
        </svg>
      </div>
    );

    await hover(anchor(host));

    expect(tooltip()?.textContent).toBe('Logout from Sharek');
  });

  it('does not open over a control that already reads its text, whatever its case and spacing', async () => {
    const host = await mount(
      <div data-tooltip-id="tooltip" data-tooltip-content=" Select Customer ">
        <BellIcon />
        <div>
          {'  SELECT  '}
          <span>customer</span>
        </div>
      </div>
    );

    await hover(anchor(host));

    expect(tooltip()).toBeNull();
  });

  it('does not open over an icon in a menu item whose label reads its text', async () => {
    const host = await mount(
      <div role="menuitem" tabIndex={0}>
        <div>
          <svg
            width="15"
            height="15"
            data-tooltip-id="tooltip"
            data-tooltip-content="Duplicate Post"
          >
            <path d="M3 3h10v10H3z" />
          </svg>
        </div>
        <div>Duplicate Post</div>
      </div>
    );

    await hover(anchor(host));

    expect(tooltip()).toBeNull();
  });

  it('opens when the control reads something else', async () => {
    const picker = await mount(
      <div data-tooltip-id="tooltip" data-tooltip-content="Select Customer">
        <BellIcon />
        <div>Acme Inc.</div>
      </div>
    );

    await hover(anchor(picker));

    expect(tooltip()?.textContent).toBe('Select Customer');
  });

  it('opens when the control reads only part of the tooltip', async () => {
    const streak = await mount(
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content="You're on a 5 day posting streak! Keep it going!"
      >
        <BellIcon />
        <span>5</span>
      </div>
    );

    await hover(anchor(streak));

    expect(tooltip()?.textContent).toBe(
      "You're on a 5 day posting streak! Keep it going!"
    );
  });

  it('reads the control again each time it opens', async () => {
    const picker = (name: string) => (
      <div data-tooltip-id="tooltip" data-tooltip-content="Select Customer">
        <BellIcon />
        <div>{name}</div>
      </div>
    );
    const { host, render } = await mountTree(picker('Select Customer'));
    await hover(anchor(host));
    expect(tooltip()).toBeNull();
    await leave(anchor(host));

    await render(picker('Acme Inc.'));
    await hover(anchor(host));

    expect(tooltip()?.textContent).toBe('Select Customer');
  });

  it('opens when the text that matches is hidden', async () => {
    const host = await mount(
      <div data-tooltip-id="tooltip" data-tooltip-content="Insert Media">
        <BellIcon />
        <div style={{ display: 'none' }}>Insert Media</div>
      </div>
    );

    await hover(anchor(host));

    expect(tooltip()?.textContent).toBe('Insert Media');
  });

  // A name in the collapsed channel rail is clamped to one line: the tooltip
  // is the only place it reads in full.
  it('opens when the text that matches is cut short', async () => {
    const host = await mount(
      <div
        style={{ overflow: 'hidden' }}
        data-tooltip-id="tooltip"
        data-tooltip-content="Marketing Team Alpha"
      >
        Marketing Team Alpha
      </div>
    );
    const target = anchor(host)!;
    Object.defineProperty(target, 'scrollWidth', { value: 180 });
    Object.defineProperty(target, 'clientWidth', { value: 40 });

    await hover(target);

    expect(tooltip()?.textContent).toBe('Marketing Team Alpha');
  });

  it('counts text that spills out of a box that does not clip it as shown', async () => {
    const host = await mount(
      <div
        style={{ overflow: 'visible' }}
        data-tooltip-id="tooltip"
        data-tooltip-content="Select Customer"
      >
        Select Customer
      </div>
    );
    const target = anchor(host)!;
    Object.defineProperty(target, 'scrollWidth', { value: 121 });
    Object.defineProperty(target, 'clientWidth', { value: 120 });

    await hover(target);

    expect(tooltip()).toBeNull();
  });

  it('does not open over a control that already reads its Arabic text', async () => {
    const shown = await mount(
      <div data-tooltip-id="tooltip" data-tooltip-content="اختر العميل">
        <BellIcon />
        <div>{' اختر  العميل '}</div>
      </div>
    );

    await hover(anchor(shown));

    expect(tooltip()).toBeNull();
  });

  it('opens when an Arabic control reads something else', async () => {
    const other = await mount(
      <div data-tooltip-id="tooltip" data-tooltip-content="اختر العميل">
        <BellIcon />
        <div>شركة النخيل</div>
      </div>
    );

    await hover(anchor(other));

    expect(tooltip()?.textContent).toBe('اختر العميل');
  });
});
