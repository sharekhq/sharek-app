import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The calendar's channel list: a rail beside the calendar above 1025px, and at
// 1025px and below (phones and iPads held upright) a bottom sheet the toolbar's
// channel chip opens: full width, at most 80% of the screen tall, 16px rounded
// top corners and 80px of room under the last row, over a scrim. Its close
// button, the scrim and Escape close it. jsdom-like DOMs apply no media
// queries, so the width rules are pinned by the classes that carry them.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (open: boolean, onClose = jest.fn()) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SplitPanel
        open={open}
        onClose={onClose}
        onToggleCollapse={() => undefined}
        title="Channels"
      >
        <div>the channels</div>
      </SplitPanel>
    );
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
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
