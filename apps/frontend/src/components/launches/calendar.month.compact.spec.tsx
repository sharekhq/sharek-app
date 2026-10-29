import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';

// Week and Month at 1025px and below (phones and iPads held upright), as
// upstream draws them in Sharek's skin. Week is a 72px hour column and seven
// day columns at least 100px wide, with full day names and dates; the hour
// labels and the corner keep sticking to the start edge while the days scroll
// sideways (Q3). Month is compact: seven equal columns, 36px headers, 2px gaps,
// avatar-only post chips and "+N" for the posts past three. jsdom-like DOMs
// apply no media queries, so the width rules are pinned by the classes that
// carry them (the emitted CSS is read by tools/tailwind-emit).
//
// The scenery is calendar.now.line.spec.tsx's.
const mockCalendar = {
  startDate: '2026-10-19',
  endDate: '2026-10-25',
  display: 'week',
  integrations: [] as Array<Record<string, unknown>>,
  posts: [] as unknown[],
  loading: false,
  sets: [] as unknown[],
  signature: undefined as unknown,
  changeDate: jest.fn(),
  reloadCalendarView: jest.fn(),
  currentHour: dayjs(),
  postDates: new Map<object, dayjs.Dayjs>(),
};
const mockUseCalendar = jest.fn(() => mockCalendar);
// What each card hands the drag, for the preview to match it.
const mockDragged: Array<Record<string, unknown>> = [];

jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: undefined,
    isLoading: false,
    mutate: () => undefined,
  }),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: (_key: string, initial: string) => [initial, () => undefined],
}));
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  ...jest.requireActual(
    '@gitroom/frontend/components/launches/calendar.context'
  ),
  useCalendar: () => mockUseCalendar(),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (_key: string, fallback: string, values?: Record<string, string>) =>
      fallback.replace(/{{(\w+)}}/g, (_, name) => String(values?.[name])),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({}),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ disableXAnalytics: false }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: () => undefined,
    closeCurrent: () => undefined,
  }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('react-dnd', () => ({
  useDrop: () => [{}, jest.fn()],
}));
jest.mock('@gitroom/frontend/components/launches/calendar.drag.layer', () => ({
  usePostCardDrag: (card: Record<string, unknown>) => {
    mockDragged.push(card);
    return { attach: () => undefined, opacity: 1 };
  },
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({ useAddProvider: () => () => undefined })
);
jest.mock('@gitroom/frontend/components/launches/statistics', () => ({
  StatisticsModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/missing-release.modal',
  () => ({
    MissingReleaseModal: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({
    CreationMethodBadge: () => null,
  })
);
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));

import '@gitroom/frontend/components/layout/html.component';
import {
  fromUtc,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';
import {
  MonthView,
  WeekView,
} from '@gitroom/frontend/components/launches/calendar';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and isUSCitizen reads it.
globalThis.localStorage = window.localStorage;

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } });
});

// Wednesday 21 October 2026 at 13:37, local time
const WEDNESDAY = new Date(2026, 9, 21, 13, 37);
// Friday 23 October 2026 at 10:00, local time: a day still to come
const FRIDAY_TEN = new Date(2026, 9, 23, 10, 0);
// Monday 19 October 2026 at 10:00, local time: a day gone by
const MONDAY_TEN = new Date(2026, 9, 19, 10, 0);

const post = (id: string, state = 'QUEUE', when = FRIDAY_TEN) => ({
  id,
  group: `g-${id}`,
  content: `<p>post ${id}</p>`,
  publishDate: dayjs(when).utc().format(),
  state,
  error: null as string | null,
  releaseURL: null as string | null,
  releaseId: null as string | null,
  intervalInDays: null as number | null,
  integration: {
    id: 'i1',
    picture: '/pic.jpg',
    providerIdentifier: 'x',
    name: 'X',
  },
  tags: [] as unknown[],
});

const withPosts = (posts: Array<ReturnType<typeof post>>) => {
  mockCalendar.posts = posts;
  mockCalendar.postDates = new Map(
    posts.map((p) => [p, fromUtc(p.publishDate)] as [object, dayjs.Dayjs])
  );
};

const mounted: Array<{ unmount: () => void }> = [];

const render = async (node: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(node);
  });
  return host;
};

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// Class names are matched as words, not as CSS selectors, so the brackets and
// parentheses of Tailwind's arbitrary values need no escaping.
const all = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('*'));
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
const withClass = (host: HTMLElement, ...names: string[]) =>
  all(host).filter((el) => names.every((name) => classes(el).includes(name)));
// a post card's parts
const cards = (host: HTMLElement) => withClass(host, 'shadow-soft');
const strip = (card: HTMLElement) =>
  Array.from(card.children).find((el) =>
    classes(el).includes('bg-surface2')
  ) as HTMLElement;
const body = (card: HTMLElement) =>
  Array.from(card.children).find((el) =>
    classes(el).includes('bg-surface')
  ) as HTMLElement;
const textColumn = (card: HTMLElement) =>
  Array.from(body(card).children).find((el) =>
    classes(el).includes('min-h-[40px]')
  ) as HTMLElement;
const badge = (card: HTMLElement) =>
  Array.from(card.children).find((el) => classes(el).includes('bg-error')) as
    | HTMLElement
    | undefined;
const byText = (host: HTMLElement, text: string) =>
  all(host).find((el) => el.children.length === 0 && el.textContent === text);
// the post's status in words, read out at 1025px and below and hidden above
const statusName = (card: HTMLElement) =>
  withClass(body(card), 'mobile:sr-only')[0];
// every class a month chip's status adds at 1025px and below
const STATUS_CLASSES = [
  'mobile:ring-2',
  'mobile:ring-info',
  'mobile:ring-success',
  'mobile:border-2',
  'mobile:border-dashed',
  'mobile:border-muted',
];

beforeEach(() => {
  jest.useFakeTimers({ now: WEDNESDAY });
  mockCalendar.currentHour = dayjs(WEDNESDAY).startOf('hour');
  mockDragged.length = 0;
  localStorage.setItem('isUS', 'GLOBAL');
  Object.assign(mockCalendar, {
    startDate: '2026-10-19',
    endDate: '2026-10-25',
    display: 'week',
    integrations: [],
  });
  withPosts([]);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
  setUserTimezone(null);
});

const asMonth = () =>
  Object.assign(mockCalendar, {
    display: 'month',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });

describe('the week at 1025px and below', () => {
  it('is a 72px hour column and seven day columns at least 100px wide', async () => {
    const host = await render(<WeekView />);
    const grid = withClass(
      host,
      '[grid-template-columns:136px_repeat(7,_minmax(0,_1fr))]'
    )[0];

    expect(classes(grid)).toContain(
      'mobile:[grid-template-columns:72px_repeat(7,_minmax(100px,_1fr))]'
    );
  });

  it('writes the full day name and date in every header', async () => {
    const host = await render(<WeekView />);
    const headers = withClass(host, 'cal-weekday', 'z-[20]');

    expect(headers).toHaveLength(7);
    expect(headers[0].textContent).toBe(
      `Monday${dayjs('2026-10-19').format('L')}`
    );
    headers.forEach((header) =>
      expect(withClass(header, 'hidden', 'mobile:inline')).toEqual([])
    );
  });

  it('keeps the hour labels sticky in the 72px column, on one line', async () => {
    const host = await render(<WeekView />);
    const labels = withClass(host, 'mobile:sticky');

    expect(labels).toHaveLength(24);
    labels.forEach((label) => {
      expect(classes(label)).toEqual(
        expect.arrayContaining([
          'mobile:start-0',
          'mobile:z-[17]',
          'mobile:bg-newBgColorInner',
          'mobile:px-[4px]',
          'mobile:text-[12px]',
          'mobile:whitespace-nowrap',
        ])
      );
      expect(classes(label)).not.toContain('mobile:ps-[2px]');
      expect(classes(label)).not.toContain('mobile:pe-[2px]');
    });
  });

  it('keeps the corner sticking over the labels and the headers', async () => {
    const host = await render(<WeekView />);
    const corner = withClass(host, 'cal-weekday')[0];

    expect(corner).toBe(corner.parentElement!.firstElementChild);
    expect(classes(corner)).toEqual(
      expect.arrayContaining([
        'sticky',
        'top-0',
        'mobile:z-30',
        'mobile:start-0',
      ])
    );
  });

  it("keeps Sharek's full post cards, with no compact classes", async () => {
    withPosts([post('p1', 'ERROR')]);
    const host = await render(<WeekView />);
    const [card] = cards(host);

    expect(card).toBeDefined();
    expect(classes(strip(card))).not.toContain('mobile:hidden');
    expect(classes(textColumn(card))).not.toContain('mobile:hidden');
    expect(classes(body(card))).not.toContain('mobile:p-[4px]');
    expect(mockDragged.every((dragged) => !dragged.compact)).toBe(true);
  });

  it('adds no status ring and no hidden status name to a week card', async () => {
    // an hour each, since an hour shows three posts before "+N"
    withPosts([
      post('p1'),
      post('p2', 'PUBLISHED', new Date(2026, 9, 23, 11, 0)),
      post('p3', 'DRAFT', new Date(2026, 9, 23, 12, 0)),
      post('p4', 'ERROR', new Date(2026, 9, 23, 13, 0)),
      post('p5', 'QUEUE', MONDAY_TEN),
    ]);
    const host = await render(<WeekView />);

    expect(cards(host)).toHaveLength(5);
    cards(host).forEach((card) => {
      STATUS_CLASSES.forEach((name) =>
        expect(classes(card)).not.toContain(name)
      );
      expect(statusName(card)).toBeUndefined();
    });
  });
});

describe('the month at 1025px and below', () => {
  it('is seven equal columns with 36px headers and 2px gaps', async () => {
    asMonth();
    const host = await render(<MonthView />);
    const grid = withClass(host, 'grid', 'grid-cols-7')[0];
    const headers = withClass(host, 'cal-weekday');

    expect(classes(grid)).toEqual(
      expect.arrayContaining([
        'mobile:grid-rows-[36px_auto]',
        'mobile:gap-[2px]',
      ])
    );
    expect(headers).toHaveLength(7);
    headers.forEach((header) => {
      expect(classes(header)).toEqual(
        expect.arrayContaining(['mobile:h-[36px]', 'mobile:p-0'])
      );
      expect(
        withClass(header, 'hidden', 'mobile:inline', 'mobile:text-[13px]')
      ).toHaveLength(1);
    });
  });

  it('draws the day numbers small, the cells 44px tall at least, and no "Date passed" hint', async () => {
    asMonth();
    const host = await render(<MonthView />);
    const number = withClass(host, 'min-w-[24px]').find(
      (el) => el.textContent === '23'
    )!;
    const cells = withClass(host, 'min-h-[70px]');
    const lists = withClass(host, 'scrollbar-thumb-tableBorder', 'flex-col');

    expect(classes(number)).toEqual(
      expect.arrayContaining(['mobile:h-[20px]', 'mobile:min-w-[20px]'])
    );
    expect(cells).toHaveLength(42);
    cells.forEach((cell) =>
      expect(classes(cell)).toContain('mobile:min-h-[44px]')
    );
    lists.forEach((list) =>
      expect(classes(list)).toContain('mobile:before:hidden')
    );
    withClass(host, 'text-center', 'items-center', 'justify-center', 'flex')
      .filter((el) => el.parentElement === withClass(host, 'grid')[0])
      .forEach((day) => expect(classes(day)).toContain('mobile:min-w-0'));
  });

  it('shows three posts and "+2" for five, and folds them back with a chevron', async () => {
    asMonth();
    withPosts(['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => post(id)));
    const host = await render(<MonthView />);

    expect(cards(host)).toHaveLength(3);
    const more = byText(host, '+ Show more (2)');
    expect(classes(more)).toContain('mobile:hidden');
    const count = host.querySelector('bdi');
    expect(count).not.toBeNull();
    expect(count!.getAttribute('dir')).toBe('ltr');
    expect(count!.textContent).toBe('+2');
    expect(classes(count)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:inline'])
    );

    await click(count!);

    expect(cards(host)).toHaveLength(5);
    expect(classes(byText(host, '- Show less'))).toContain('mobile:hidden');
    const chevron = host.querySelector('path[d="M15 12.5L10 7.5L5 12.5"]');
    expect(chevron).not.toBeNull();
    expect(classes(chevron!.closest('svg'))).toEqual(
      expect.arrayContaining(['hidden', 'mobile:inline'])
    );
  });

  it('draws a post as its channel avatar alone, keeping the failed ring', async () => {
    asMonth();
    withPosts([post('p1', 'ERROR')]);
    const host = await render(<MonthView />);
    const [card] = cards(host);

    expect(card).toBeDefined();
    expect(classes(strip(card))).toContain('mobile:hidden');
    expect(classes(textColumn(card))).toContain('mobile:hidden');
    expect(classes(badge(card))).toContain('mobile:hidden');
    expect(classes(body(card))).toEqual(
      expect.arrayContaining([
        'mobile:p-[4px]',
        'mobile:rounded-[10px]',
        'mobile:justify-center',
      ])
    );
    expect(classes(card)).toEqual(
      expect.arrayContaining(['ring-2', 'ring-error'])
    );
    expect(host.innerHTML).not.toMatch(/ring-green/);
    // the preview of a dragged chip is the same compact chip
    expect(mockDragged.length).toBeGreaterThan(0);
    expect(mockDragged.every((dragged) => dragged.compact === true)).toBe(true);
  });

  // The status chip is hidden on a month chip, so the status rings the avatar
  // in the chip's colour: info, success, error, and a dashed muted edge for a
  // draft like the draft chip's. A post past its time reads as published, as
  // its chip does.
  it.each([
    ['a scheduled post', post('p1'), ['mobile:ring-2', 'mobile:ring-info']],
    [
      'a published post',
      post('p1', 'PUBLISHED'),
      ['mobile:ring-2', 'mobile:ring-success'],
    ],
    [
      'a post past its time',
      post('p1', 'QUEUE', MONDAY_TEN),
      ['mobile:ring-2', 'mobile:ring-success'],
    ],
    [
      'a draft',
      post('p1', 'DRAFT'),
      ['mobile:border-2', 'mobile:border-dashed', 'mobile:border-muted'],
    ],
    ['a failed post', post('p1', 'ERROR'), [] as string[]],
  ])('rings %s in its status colour', async (_name, item, ring) => {
    asMonth();
    withPosts([item]);
    const host = await render(<MonthView />);
    const [card] = cards(host);

    expect(card).toBeDefined();
    STATUS_CLASSES.forEach((name) =>
      ring.includes(name)
        ? expect(classes(card)).toContain(name)
        : expect(classes(card)).not.toContain(name)
    );
  });

  it('keeps a past post grey inside a ring in colour', async () => {
    asMonth();
    withPosts([post('p1', 'QUEUE', MONDAY_TEN)]);
    const host = await render(<MonthView />);
    const [card] = cards(host);

    expect(classes(body(card))).toContain('!grayscale');
    expect(classes(card)).not.toContain('!grayscale');
    expect(classes(card)).toEqual(
      expect.arrayContaining(['mobile:ring-2', 'mobile:ring-success'])
    );
  });

  // Colour alone does not say the status: the chip's name says it in words,
  // read out at 1025px and below, where the status chip is hidden, and absent
  // above, where the chip shows it.
  it.each([
    ['Scheduled', post('p1')],
    ['Published', post('p1', 'PUBLISHED')],
    ['Published', post('p1', 'QUEUE', MONDAY_TEN)],
    ['Draft', post('p1', 'DRAFT')],
    ['Failed', post('p1', 'ERROR')],
  ])('names a %s post by its status and channel', async (status, item) => {
    asMonth();
    withPosts([item]);
    const host = await render(<MonthView />);
    const [card] = cards(host);
    const name = statusName(card);

    expect(name).toBeDefined();
    expect(name.textContent).toBe(`${status}: X`);
    expect(classes(name)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:inline', 'mobile:sr-only'])
    );
  });
});
