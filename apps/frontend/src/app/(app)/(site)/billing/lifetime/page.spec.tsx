// Billing's lifetime deal scrolls in its card (spec 059, FR-001, FR-002,
// contracts/routes.md). The page rendered LifetimeDeal bare, so once it was
// taller than the screen it grew the shell and the window scrolled, and it had
// none of Billing's surface or inset. It now renders inside PageScroll's box,
// the dashboard page's one scroller, with a 20px inset on the box. happy-dom
// applies no media queries or Tailwind, so the widths are pinned by the
// classes that carry them (page.scroll.spec pins PageScroll's own).
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/frontend/components/billing/lifetime.deal', () => ({
  LifetimeDeal: () => <p data-testid="lifetime">Lifetime deal</p>,
}));

import Page from './page';

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

const mounted: Root[] = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const page = await Page();
  await act(async () => {
    root.render(page);
  });
  const outer = host.firstElementChild as HTMLElement;
  return { outer, box: outer.firstElementChild as HTMLElement };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

describe('the lifetime deal page', () => {
  it("renders the lifetime deal inside PageScroll's box, with a 20px inset on the box", async () => {
    const { outer, box } = await mount();

    expect(classesOf(outer)).toEqual(HOST);
    expect(classesOf(box)).toEqual([...BOX, 'p-[20px]']);
    expect(box.children).toHaveLength(1);
    expect(box.querySelector('[data-testid="lifetime"]')?.textContent).toBe(
      'Lifetime deal'
    );
  });
});
