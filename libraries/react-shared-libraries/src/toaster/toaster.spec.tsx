import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { Toaster, useToaster } from './toaster';

// The ready notice (spec 061, FR-014): a render that finishes while the member
// is elsewhere raises a toast whose action opens the result. A toast with an
// action stays 10 s, with a close control beside it; a toast without one is
// today's: the text alone for 4.2 s.

let show: ReturnType<typeof useToaster>['show'];
const Harness = (): null => {
  const toaster = useToaster();
  useEffect(() => {
    show = toaster.show;
  }, [toaster.show]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <>
        <Toaster />
        <Harness />
      </>
    );
  });
  return host;
};

const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

// The harness renders nothing, so the toast is the host's one child while shown.
const toast = (host: HTMLElement) => host.firstElementChild;

// A button by its name: its label, or the words it shows.
const button = (host: HTMLElement, name: string) => {
  const found = Array.from(host.querySelectorAll('button')).find(
    (el) => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name
  );
  if (!found) {
    throw new Error(`no button named ${name} in: ${host.innerHTML}`);
  }
  return found;
};

const press = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('Toaster', () => {
  it('shows the text alone, with no button, and hides it after 4.2 s', async () => {
    const host = await mount();
    await act(async () => show('Saved'));

    expect(toast(host)?.textContent).toBe('Saved');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    await tick(4199);
    expect(toast(host)).not.toBeNull();
    await tick(1);
    expect(toast(host)).toBeNull();
  });

  it('adds the action and a close control to a toast that carries one, and keeps it 10 s', async () => {
    const host = await mount();
    await act(async () =>
      show('Ready', 'success', { label: 'Open', onClick: jest.fn() })
    );

    expect(toast(host)?.textContent).toContain('Ready');
    button(host, 'Open');
    button(host, 'Close');
    await tick(9000);
    expect(toast(host)).not.toBeNull();
    await tick(1000);
    expect(toast(host)).toBeNull();
  });

  it('runs the action once and closes when its button is pressed', async () => {
    const onClick = jest.fn();
    const host = await mount();
    await act(async () => show('Ready', 'success', { label: 'Open', onClick }));

    await press(button(host, 'Open'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(toast(host)).toBeNull();
  });

  it('closes without running the action when the close control is pressed', async () => {
    const onClick = jest.fn();
    const host = await mount();
    await act(async () => show('Ready', 'success', { label: 'Open', onClick }));

    await press(button(host, 'Close'));
    expect(onClick).not.toHaveBeenCalled();
    expect(toast(host)).toBeNull();
  });

  it('lets a second toast replace the first for its own time, never cut short by an earlier timer', async () => {
    const host = await mount();
    await act(async () => show('Saved'));
    await tick(3000);
    await act(async () =>
      show('Ready', 'success', { label: 'Open', onClick: jest.fn() })
    );

    expect(toast(host)?.textContent).toContain('Ready');
    await tick(1200); // 4.2 s: the first toast's time is up, not the second's
    expect(toast(host)?.textContent).toContain('Ready');

    await tick(7800); // 12 s: a toast without an action replaces this one
    await act(async () => show('Copied'));
    expect(toast(host)?.textContent).toBe('Copied');
    expect(host.querySelectorAll('button')).toHaveLength(0);
    await tick(1000); // 13 s: the action toast's 10 s are up, not this one's
    expect(toast(host)?.textContent).toBe('Copied');
    await tick(3199);
    expect(toast(host)).not.toBeNull();
    await tick(1);
    expect(toast(host)).toBeNull();
  });

  it('marks the toast as a status', async () => {
    const host = await mount();
    await act(async () => show('Saved'));

    expect(toast(host)?.getAttribute('role')).toBe('status');
  });
});
