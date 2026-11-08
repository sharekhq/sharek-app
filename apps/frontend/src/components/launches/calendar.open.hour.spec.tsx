import { act, ReactElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import dayjs from 'dayjs';

// The week and the day open at 8 AM, or at the current hour when the view
// holds today, so next week doesn't open at 9 PM (FR-013, SC-009, research
// R9). The week puts that hour's row at the top of its grid, under the sticky
// day header; the day, which lists slots rather than hours, puts there the
// first slot at or after that hour, or its last slot when none is. Month and
// List don't scroll.
//
// happy-dom lays nothing out, so every offsetTop is 0 (C11). The rows the
// views mark, the week's hours (data-hour) and the day's slots (data-slot),
// get the tops a browser gives them, set below, and each case asks which row
// the scroll lands on.
//
// The real WeekView, DayView and Calendar render, on the scenery of
// calendar.now.line.spec.tsx: the real context module gives them its clock,
// and the calendar's data comes from the stub below.
const mockCalendar = {
  startDate: '2026-10-19',
  endDate: '2026-10-25',
  display: 'week',
  integrations: [] as Array<Record<string, unknown>>,
  posts: [] as unknown[],
  listPosts: [] as unknown[],
  listState: 'scheduled',
  loading: false,
  sets: [] as unknown[],
  signature: undefined as unknown,
  changeDate: jest.fn(),
  reloadCalendarView: jest.fn(),
  currentHour: dayjs(),
  postDates: new Map<object, dayjs.Dayjs>(),
};

// calendar.context's own data layer, stubbed as calendar.render.gate.spec.tsx does
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
  useCalendar: () => mockCalendar,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
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
  usePostCardDrag: () => ({ attach: () => undefined, opacity: 1 }),
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

import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import {
  Calendar,
  DayView,
  WeekView,
} from '@gitroom/frontend/components/launches/calendar';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and isUSCitizen reads it.
globalThis.localStorage = window.localStorage;

// The week's hour rows sit under the 62px day header and the grid's 4px gap,
// 104px apart; the day's slots, a label and its 60px box, 101px apart.
const WEEK_FIRST_ROW = 66;
const WEEK_ROW = 104;
const DAY_SLOT = 101;
const realOffsetTop = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetTop'
)!;
const indexAmong = (el: HTMLElement, marker: string) =>
  Array.from(el.parentElement!.querySelectorAll(`[${marker}]`)).indexOf(el);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-hour')) {
        return WEEK_FIRST_ROW + indexAmong(this, 'data-hour') * WEEK_ROW;
      }
      if (this.hasAttribute('data-slot')) {
        return indexAmong(this, 'data-slot') * DAY_SLOT;
      }
      return realOffsetTop.get!.call(this);
    },
  });
});

afterAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', realOffsetTop);
});

const at = (now: Date) => {
  jest.useFakeTimers({ now });
  mockCalendar.currentHour = dayjs(now).startOf('hour');
};

const mounted: Root[] = [];

const render = async (node: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(node);
  });
  return { host, root };
};

// the calendar moves to another week or day: the context hands the view new
// dates and it renders again
const moveTo = async (root: Root, node: ReactElement, startDate: string) => {
  mockCalendar.startDate = startDate;
  mockCalendar.endDate =
    mockCalendar.display === 'week'
      ? newDayjs(startDate).add(6, 'day').format('YYYY-MM-DD')
      : startDate;
  await act(async () => {
    root.render(node);
  });
};

const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

// The hour whose row sits at the top of the week's grid, right under the
// sticky day header: where the first row sits before any scroll. -1 when no
// row is there.
const hourAtTop = (host: HTMLElement) => {
  const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-hour]'));
  const scrolled = rows[0]?.parentElement!.scrollTop;
  return rows.findIndex(
    (row) => row.offsetTop - scrolled === rows[0].offsetTop
  );
};

// The time on the slot at the top of the day's list.
const slotAtTop = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[data-slot]')).find(
    (slot) => slot.offsetTop === slot.parentElement!.scrollTop
  )?.textContent;

// what a slot of the day in view at that local time reads
const label = (day: string, hour: number, minute: number) =>
  newDayjs(day).hour(hour).minute(minute).format('LT');

// One channel posting at these local times of the day in view. Posting times
// are minutes of the UTC day, which the day view moves to the day's clock.
const postingAt = (day: string, ...times: Array<[number, number]>) => {
  const offset = newDayjs(day).hour(12).utcOffset();
  return [
    {
      id: 'i1',
      identifier: 'x',
      name: 'X',
      picture: '',
      time: times.map(([hour, minute]) => ({
        time: hour * 60 + minute - offset,
      })),
    },
  ];
};

// Wednesday 21 October 2026, local time; this week runs from Monday the 19th.
const wednesdayAt = (hour: number, minute = 0) =>
  new Date(2026, 9, 21, hour, minute);

beforeEach(() => {
  Object.assign(mockCalendar, {
    startDate: '2026-10-19',
    endDate: '2026-10-25',
    display: 'week',
    integrations: [],
    posts: [],
    listPosts: [],
    postDates: new Map(),
  });
  localStorage.setItem('isUS', 'GLOBAL');
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('the week view', () => {
  it('opens a week that is not this one at 8 AM, under the sticky day header', async () => {
    at(wednesdayAt(21));
    mockCalendar.startDate = '2026-10-26';
    mockCalendar.endDate = '2026-11-01';
    const { host } = await render(<WeekView />);

    expect(hourAtTop(host)).toBe(8);
  });

  it('opens this week at the current hour once it is past 8 AM', async () => {
    at(wednesdayAt(21));
    const { host } = await render(<WeekView />);

    expect(hourAtTop(host)).toBe(21);
  });

  it('opens this week at 8 AM before 8 AM', async () => {
    at(wednesdayAt(6));
    const { host } = await render(<WeekView />);

    expect(hourAtTop(host)).toBe(8);
  });

  it('scrolls again on moving to another week, and only then', async () => {
    at(wednesdayAt(21));
    const { host, root } = await render(<WeekView />);
    expect(hourAtTop(host)).toBe(21);

    await moveTo(root, <WeekView />, '2026-10-26');
    expect(hourAtTop(host)).toBe(8);

    await moveTo(root, <WeekView />, '2026-10-19');
    expect(hourAtTop(host)).toBe(21);

    // the user's own scroll stays through the minute's tick and a render of
    // the same week
    const grid = host.querySelector<HTMLElement>('[data-hour]')!.parentElement!;
    grid.scrollTop = 0;
    await tick(60_000);
    await moveTo(root, <WeekView />, '2026-10-19');
    expect(hourAtTop(host)).toBe(0);
  });
});

describe('the day view', () => {
  beforeEach(() => {
    mockCalendar.display = 'day';
    mockCalendar.startDate = '2026-10-21';
    mockCalendar.endDate = '2026-10-21';
  });

  it('opens another day at its first slot at or after 8 AM', async () => {
    at(wednesdayAt(21));
    mockCalendar.startDate = '2026-10-23';
    mockCalendar.endDate = '2026-10-23';
    mockCalendar.integrations = postingAt(
      '2026-10-23',
      [6, 30],
      [9, 15],
      [17, 0]
    );
    const { host } = await render(<DayView />);

    expect(slotAtTop(host)).toBe(label('2026-10-23', 9, 15));
  });

  it('opens today at its first slot at or after the current hour', async () => {
    at(wednesdayAt(13, 37));
    mockCalendar.integrations = postingAt(
      '2026-10-21',
      [6, 30],
      [9, 15],
      [13, 20],
      [17, 0]
    );
    const { host } = await render(<DayView />);

    expect(slotAtTop(host)).toBe(label('2026-10-21', 13, 20));
  });

  it('opens today at its first slot at or after 8 AM before 8 AM', async () => {
    at(wednesdayAt(6));
    mockCalendar.integrations = postingAt(
      '2026-10-21',
      [6, 30],
      [9, 15],
      [17, 0]
    );
    const { host } = await render(<DayView />);

    expect(slotAtTop(host)).toBe(label('2026-10-21', 9, 15));
  });

  it('opens at its last slot when none is at or after that hour', async () => {
    at(wednesdayAt(21));
    mockCalendar.integrations = postingAt(
      '2026-10-21',
      [6, 30],
      [9, 15],
      [17, 0]
    );
    const { host } = await render(<DayView />);

    expect(slotAtTop(host)).toBe(label('2026-10-21', 17, 0));
  });

  it('scrolls again on moving to another day, and only then', async () => {
    at(wednesdayAt(13, 37));
    mockCalendar.integrations = postingAt(
      '2026-10-21',
      [6, 30],
      [9, 15],
      [13, 20],
      [17, 0]
    );
    const { host, root } = await render(<DayView />);
    expect(slotAtTop(host)).toBe(label('2026-10-21', 13, 20));

    await moveTo(root, <DayView />, '2026-10-22');
    expect(slotAtTop(host)).toBe(label('2026-10-22', 9, 15));

    // the user's own scroll stays through the minute's tick and a render of
    // the same day
    const list = host.querySelector<HTMLElement>('[data-slot]')!.parentElement!;
    list.scrollTop = 0;
    await tick(60_000);
    await moveTo(root, <DayView />, '2026-10-22');
    expect(slotAtTop(host)).toBe(label('2026-10-22', 6, 30));
  });
});

describe('the month and list views', () => {
  it.each(['month', 'list'])('%s does not scroll', async (display) => {
    at(wednesdayAt(21));
    mockCalendar.display = display;
    mockCalendar.startDate = '2026-10-01';
    mockCalendar.endDate = '2026-10-31';
    const { host } = await render(<Calendar />);

    expect(
      Array.from(host.querySelectorAll('*')).filter((el) => el.scrollTop)
    ).toEqual([]);
  });
});
