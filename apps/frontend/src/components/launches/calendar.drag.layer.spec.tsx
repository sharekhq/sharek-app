// A post card has never drawn its own drag preview, and the two backends the
// calendar runs under answer that differently. The HTML5 backend snapshots the
// card into a rectangle, so the corners the 10px radius cuts away come back
// filled — the white wedges around a dragged card. The touch backend draws
// nothing at all: `react-dnd-multi-backend` leaves that to a `Preview`
// component (dnd.provider.tsx imports only `DndProvider`), so on a phone the
// card went to `opacity: 0` and nothing took its place — it followed the finger
// invisibly until it was dropped.
//
// One layer answers both, because `useDragLayer` reads the drag monitor rather
// than the backend. What is pinned here is that contract: the browser is told
// not to draw its own preview, and what we draw instead is the card itself.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// What the monitor reports. Each test sets this before mounting.
let drag: {
  isDragging: boolean;
  item: any;
  offset: { x: number; y: number } | null;
} = { isDragging: false, item: null, offset: null };

const EMPTY_IMAGE = { emptyImage: true };
const previewedWith: any[][] = [];
const dragSpecs: any[] = [];
const connected: Array<HTMLElement | null> = [];

jest.mock('react-dnd', () => ({
  useDragLayer: (collect: any) =>
    collect({
      getItem: () => drag.item,
      isDragging: () => drag.isDragging,
      getSourceClientOffset: () => drag.offset,
    }),
  useDrag: (spec: any) => {
    const resolved = typeof spec === 'function' ? spec() : spec;
    dragSpecs.push(resolved);
    return [
      resolved.collect({ isDragging: () => drag.isDragging }),
      (node: HTMLElement | null) => connected.push(node),
      (...args: any[]) => previewedWith.push(args),
    ];
  },
}));
jest.mock('react-dnd-html5-backend', () => ({
  getEmptyImage: () => EMPTY_IMAGE,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({}),
}));
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({ CreationMethodBadge: () => null })
);

import {
  CalendarDragLayer,
  usePostCardDrag,
} from '@gitroom/frontend/components/launches/calendar.drag.layer';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

const post = {
  id: 'p1',
  content: '<p>THank you for that bro</p>',
  publishDate: '2099-09-17T10:00:00.000Z',
  state: 'DRAFT',
  intervalInDays: null,
  integration: { picture: '/pic.jpg', providerIdentifier: 'instagram' },
  tags: [],
} as any;

const card = () => ({
  id: post.id,
  interval: false,
  date: newDayjs(post.publishDate),
  post,
  state: 'DRAFT' as any,
  isBeforeNow: false,
  showTime: false,
});

const mounted: Array<{ unmount: () => void }> = [];

const mount = (element: any) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(element);
  });
  return host;
};

beforeEach(() => {
  drag = { isDragging: false, item: null, offset: null };
  previewedWith.length = 0;
  dragSpecs.length = 0;
  connected.length = 0;
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.innerHTML = '';
});

const layer = (host: HTMLElement) => host.firstElementChild as HTMLElement;

describe('the calendar draws its own drag preview', () => {
  it('draws nothing while nothing is being dragged', () => {
    expect(mount(<CalendarDragLayer />).innerHTML).toBe('');
  });

  it('draws nothing for a drag that is not a post card', () => {
    drag = { isDragging: true, item: { id: 'x' }, offset: { x: 10, y: 10 } };

    expect(mount(<CalendarDragLayer />).innerHTML).toBe('');
  });

  it('draws the card that was picked up, not a stand-in', () => {
    drag = { isDragging: true, item: card(), offset: { x: 40, y: 80 } };
    const host = mount(<CalendarDragLayer />);

    expect(host.textContent).toContain('THank you for that bro');
    expect(host.textContent).toContain('Draft');
    expect(host.querySelector('img[src="/pic.jpg"]')).not.toBeNull();
  });

  it('carries the card to where the card is', () => {
    drag = {
      isDragging: true,
      item: { ...card(), width: 210 },
      offset: { x: 40, y: 80 },
    };
    const host = mount(<CalendarDragLayer />);
    const held = layer(host).firstElementChild as HTMLElement;

    expect(held.style.transform).toBe('translate(40px, 80px)');
    // The source card's own width, measured when the drag began: a preview
    // that sizes itself to its content is a different card in a month cell.
    expect(held.style.width).toBe('210px');
  });

  it('holds the card above the grid rather than in it', () => {
    drag = { isDragging: true, item: card(), offset: { x: 0, y: 0 } };
    const host = mount(<CalendarDragLayer />);

    // One shadow, not two: `shadow-card` and `shadow-soft` are the same
    // property, so the card has to choose rather than stack them and let
    // Tailwind's emission order decide which one is drawn.
    const held = (layer(host).firstElementChild as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(held.className).toContain('shadow-card');
    expect(held.className).not.toContain('shadow-soft');
    expect(held.className).toContain('scale-[1.04]');
  });

  it('never stands between the pointer and the day underneath', () => {
    drag = { isDragging: true, item: card(), offset: { x: 0, y: 0 } };
    const host = mount(<CalendarDragLayer />);

    expect(layer(host).className).toContain('pointer-events-none');
    expect(layer(host).className).toContain('fixed');
  });
});

const Probe = () => {
  const { attach, opacity } = usePostCardDrag(card());
  return <div ref={attach} data-testid="source" style={{ opacity }} />;
};

describe('a post card hands its preview over', () => {
  it('tells the browser not to draw one of its own', () => {
    mount(<Probe />);

    expect(previewedWith).toEqual([
      [EMPTY_IMAGE, { captureDraggingState: true }],
    ]);
  });

  it('still hides the card it was lifted from', () => {
    drag = { isDragging: true, item: card(), offset: { x: 0, y: 0 } };
    const host = mount(<Probe />);

    expect((host.firstElementChild as HTMLElement).style.opacity).toBe('0');
  });

  it('measures the card it was lifted from, so the preview matches it', () => {
    const host = mount(<Probe />);
    const source = host.firstElementChild as HTMLElement;
    Object.defineProperty(source, 'offsetWidth', { value: 210 });

    expect(connected).toContain(source);
    expect(dragSpecs[0].item().width).toBe(210);
    expect(dragSpecs[0].item().id).toBe('p1');
  });
});
