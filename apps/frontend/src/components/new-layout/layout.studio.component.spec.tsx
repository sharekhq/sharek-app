// Studio scrolls in its card (spec 059, FR-001 to FR-003, contracts/routes.md).
// Its content used to sit in flow, so a long Studio grew the shell and the
// window scrolled (993px at 900 tall). It now renders inside PageScroll's box,
// the dashboard page's one scroller, with Studio's own 20px inset and 15px
// gap on the box. happy-dom applies no media queries or Tailwind, so the
// widths are pinned by the classes that carry them (page.scroll.spec pins
// PageScroll's own).
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/frontend/components/studio/studio.component', () => ({
  StudioComponent: () => <p data-testid="studio">Studio</p>,
}));

import { StudioLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.studio.component';

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
  await act(async () => {
    root.render(<StudioLayoutComponent />);
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

describe('the Studio page', () => {
  it("renders Studio inside PageScroll's box, with Studio's inset and gap on the box", async () => {
    const { outer, box } = await mount();

    expect(classesOf(outer)).toEqual(HOST);
    expect(classesOf(box)).toEqual([
      ...BOX,
      'p-[20px]',
      'mobile:p-[12px]',
      'gap-[15px]',
    ]);
    expect(box.children).toHaveLength(1);
    expect(box.querySelector('[data-testid="studio"]')?.textContent).toBe(
      'Studio'
    );
  });
});
