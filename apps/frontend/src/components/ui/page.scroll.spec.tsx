import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// A dashboard page's scroll box (spec 059, contracts/ui.md §2). Above 1025px
// the page scrolls inside its content card, under the top bar, and the window
// never does: the host fills the card's row and the box sits over it, the
// page's only scroller. At 1025px and below the box is static and the window
// scrolls, as today. Brands and Analytics carried their own copy of these
// classes; this is the one they share. happy-dom applies no media queries or
// Tailwind, so the widths are pinned by the classes that carry them, and
// tools/tailwind-emit pins that they emit.
import {
  CARD_PADDING,
  PAGE_PADDING,
  PageScroll,
} from '@gitroom/frontend/components/ui/page.scroll';

const HOST = ['bg-newBgColorInner', 'flex-1', 'min-w-0', 'relative'];
const BOX = [
  'absolute',
  'inset-0',
  'overflow-y-auto',
  'flex',
  'flex-col',
  'mobile:static',
  'scrollbar',
  'scrollbar-thumb-fifth',
  'scrollbar-track-newBgColor',
];

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (className?: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <PageScroll className={className}>
        <p data-testid="page">The page</p>
      </PageScroll>
    );
  });
  const outer = host.firstElementChild as HTMLElement;
  return { outer, box: outer.firstElementChild as HTMLElement };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('PageScroll', () => {
  it('fills the card row with a host that holds the box', async () => {
    const { outer } = await mount();

    expect(classesOf(outer)).toEqual(HOST);
    expect(outer.children).toHaveLength(1);
  });

  it('scrolls the page in a box over the host above 1025px, and lets the window scroll at 1025px and below', async () => {
    const { box } = await mount();

    expect(classesOf(box)).toEqual(BOX);
  });

  it("adds the page's own classes to the box, not the host", async () => {
    const { outer, box } = await mount('gap-[16px] p-[20px]');

    expect(classesOf(box)).toEqual([...BOX, 'gap-[16px]', 'p-[20px]']);
    expect(classesOf(outer)).toEqual(HOST);
  });

  it('renders the page inside the box', async () => {
    const { box } = await mount();

    expect(box.querySelector('[data-testid="page"]')?.textContent).toBe(
      'The page'
    );
    expect(box.children).toHaveLength(1);
  });

  // Server route files render it, so it needs no client boundary of its own.
  it("has no 'use client', so a server page can render it", () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'page.scroll.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/['"]use client['"]/);
  });
});

// The padding every dashboard page and card shares (spec 060, contracts/ui.md
// §1): one string each, so a page or card never spells its own.
describe('PAGE_PADDING and CARD_PADDING', () => {
  it("pads a page's content 20px inside its card, 12px at 1025px and below", () => {
    expect(PAGE_PADDING).toBe('p-[20px] mobile:p-[12px]');
  });

  it("pads a card's content 20px, 16px at 1025px and below", () => {
    expect(CARD_PADDING).toBe('p-[20px] mobile:p-[16px]');
  });
});
