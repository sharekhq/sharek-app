// The admin tools scroll in their card (spec 059, FR-001, FR-002,
// contracts/routes.md). Each page's root sat in flow, so a long list grew the
// shell and the window scrolled. Each now renders inside PageScroll's box, the
// dashboard page's one scroller, with the page's own 20px inset and 12px gap
// on the box (stats' min-w-0 is the host's already); what they render inside
// is untouched. happy-dom applies no media queries or Tailwind, so the widths
// are pinned by the classes that carry them (page.scroll.spec pins
// PageScroll's own).
import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/frontend/components/admin/admin-errors.component', () => ({
  AdminErrorsComponent: () => <p data-testid="errors">Admin errors</p>,
}));
jest.mock('@gitroom/frontend/components/admin/admin-stats.component', () => ({
  AdminStatsComponent: () => <p data-testid="stats">Admin stats</p>,
}));

import ErrorsPage from './errors/page';
import StatsPage from './stats/page';

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

const mount = async (page: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
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

describe('the admin pages', () => {
  it.each([
    ['errors', ErrorsPage, 'Admin errors'],
    ['stats', StatsPage, 'Admin stats'],
  ])(
    "renders admin %s inside PageScroll's box, with the page's inset and gap on the box",
    async (id, Page, text) => {
      const { outer, box } = await mount(await Page());

      expect(classesOf(outer)).toEqual(HOST);
      expect(classesOf(box)).toEqual([...BOX, 'p-[20px]', 'gap-[12px]']);
      expect(box.children).toHaveLength(1);
      expect(box.querySelector(`[data-testid="${id}"]`)?.textContent).toBe(
        text
      );
    }
  );
});
