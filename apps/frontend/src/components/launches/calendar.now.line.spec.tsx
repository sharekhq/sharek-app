import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';

// The calendar's line at the current time, in Sharek's colours and on Sharek's
// grid. The week view draws it across the current hour's row with the time in
// a badge over the hour label; the day view draws it before the first slot
// still to come. Below 1025px Sharek's hour labels stick to the start edge
// while the days scroll sideways under them, so the badge has to stay over the
// labels and the line has to pass under them; jsdom-like DOMs have no stacking,
// so the layering is pinned by the classes that decide it (the browser check is
// the mockup's).
//
// The real WeekView, DayView and MonthView render; the real context module
// gives them its clock (useNow), and the calendar's data comes from the stub
// below. Everything else is the scenery of calendar.open.post.spec.tsx.
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
};
const mockUseCalendar = jest.fn(() => mockCalendar);

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
  useCalendar: () => mockUseCalendar(),
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

// The layout sets dayjs's language from the interface's and its Arabic word
// for the half of the day, as every page has them before the calendar loads.
import '@gitroom/frontend/components/layout/html.component';
import {
  DayView,
  MonthView,
  WeekView,
} from '@gitroom/frontend/components/launches/calendar';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and isUSCitizen reads it.
globalThis.localStorage = window.localStorage;

// The labels' AM and PM come from the translations, so the singleton is set up
// here, with the Arabic pair the locale ships.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: {} },
      ar: { translation: { am: 'ص', pm: 'م' } },
    },
  });
});

// Wednesday 21 October 2026 at 13:37, local time; the week view's week starts
// on Monday the 19th, so today is its third column.
const WEDNESDAY = new Date(2026, 9, 21, 13, 37);

const at = (now: Date) => {
  jest.useFakeTimers({ now });
  mockCalendar.currentHour = dayjs(now).startOf('hour');
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

const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

// Class names are matched as words in className, not as CSS selectors, so the
// brackets and parentheses of Tailwind's arbitrary values need no escaping.
const divs = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('div'));
const withClass = (host: HTMLElement, ...names: string[]) =>
  divs(host).filter((el) => {
    const own = el.className.split(/\s+/);
    return names.every((name) => own.includes(name));
  });
// every element the week's now line places in an hour's row: the badge's
// cover, from the hour column's start edge, then one piece per day
const rowOf = (host: HTMLElement, hour: number) =>
  divs(host).filter((el) => el.style.gridRow === `${hour + 2} / ${hour + 3}`);
const pieces = (host: HTMLElement, hour: number) =>
  rowOf(host, hour).filter((el) => !el.style.gridColumn.startsWith('1 /'));
// the time badge, the one element of the calendar set at a 20px leading; found
// by its shape, not its colour, so each case fails for its own reason
const badge = (host: HTMLElement) =>
  withClass(host, 'leading-[20px]')[0] ?? null;
const hourLabels = (host: HTMLElement) => withClass(host, 'mobile:sticky');
const zOf = (className: string) =>
  Number(
    /(?:^|\s)mobile:z-\[?(\d+)\]?(?:\s|$)/.exec(className)?.[1] ??
      /(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/.exec(className)?.[1]
  );

beforeEach(() => {
  mockUseCalendar.mockClear();
  Object.assign(mockCalendar, {
    startDate: '2026-10-19',
    endDate: '2026-10-25',
    display: 'week',
    integrations: [],
    posts: [],
  });
  localStorage.setItem('isUS', 'GLOBAL');
});

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
  await i18next.changeLanguage('en');
});

describe('the week view now line', () => {
  it('crosses the current hour at the current minute, strongest in today’s column', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    const row = pieces(host, 13);
    expect(row.map((el) => el.style.gridColumn)).toEqual([
      '2 / 3',
      '3 / 4',
      '4 / 5',
      '5 / 6',
      '6 / 7',
      '7 / 8',
      '8 / 9',
    ]);
    row.forEach((el) => expect(el.style.top).toBe(`${(37 / 60) * 100}%`));
    // today: a tick and a 3px line; every other day: a 1px line
    expect(row[2].children).toHaveLength(2);
    expect(row[2].lastElementChild!.className).toContain('h-[3px]');
    row
      .filter((_, index) => index !== 2)
      .forEach((el) =>
        expect(el.firstElementChild!.className).toContain('h-[1px]')
      );
  });

  it('draws nothing in a week that does not hold today', async () => {
    at(WEDNESDAY);
    mockCalendar.startDate = '2026-10-26';
    mockCalendar.endDate = '2026-11-01';
    const host = await render(<WeekView />);

    expect(rowOf(host, 13)).toEqual([]);
    expect(badge(host)).toBeNull();
  });

  it('writes the time as the hour labels do, 24-hour', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    expect(badge(host)!.textContent).toBe('13:37');
    expect(hourLabels(host)[13].textContent).toBe('13:00');
  });

  it('writes the time as the hour labels do, 12-hour', async () => {
    localStorage.setItem('isUS', 'US');
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    expect(badge(host)!.textContent).toBe('1:37 PM');
    expect(hourLabels(host)[13].textContent).toBe('1:00 PM');
  });

  // dayjs's Arabic meridiem calls 12:05 morning (`hour > 12`); the labels
  // take theirs from the translations, and the badge must agree with them
  it('says afternoon at noon in Arabic, as the labels do', async () => {
    await i18next.changeLanguage('ar');
    localStorage.setItem('isUS', 'US');
    at(new Date(2026, 9, 21, 12, 5));
    const host = await render(<WeekView />);

    expect(badge(host)!.textContent).toBe('12:05 م');
    expect(hourLabels(host)[12].textContent).toBe('12:00 م');
  });

  it('wears the brand colour, with white text on the badge', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    const row = pieces(host, 13);
    const classes = [badge(host)!, ...row]
      .flatMap((el) => [el, ...Array.from(el.querySelectorAll('div'))])
      .map((el) => el.className)
      .join(' ');
    expect(badge(host)!.className).toContain('text-white');
    expect(classes).toContain('bg-brand');
    expect(classes).not.toMatch(/newTableTextFocused|text-black/);
    // the other days only need a hint of where now is, quieter than today's
    // line, and never a faded brand, which reads as a light rose
    row
      .filter((_, index) => index !== 2)
      .forEach((el) => {
        expect(el.firstElementChild!.className).toContain('bg-line');
        expect(el.firstElementChild!.className).not.toMatch(
          /bg-brand|opacity-/
        );
      });
  });

  it('keeps the badge over the sticky hour labels and under the sticky headers below 1025px', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    const cover = badge(host)!.closest<HTMLElement>('.sticky')!;
    // the cover sticks to the start edge with the labels, from a track as
    // wide as the row, so a sideways scroll does not carry it away
    expect(cover.className).toContain('start-0');
    expect(cover.parentElement!.style.gridColumn).toBe('1 / -1');
    // it is as wide as the hour column, and a 12-hour time wraps inside it as
    // the labels do rather than overhang the first day
    expect(cover.className).toContain('mobile:w-[44px]');
    expect(badge(host)!.className).toContain('mobile:whitespace-normal');

    const label = zOf(hourLabels(host)[13].className);
    const header = zOf(withClass(host, 'cal-weekday', 'z-[20]')[0].className);
    // the grid's first child, the empty corner over the hour column
    const corner = zOf(withClass(host, 'cal-weekday')[0].className);
    const line = zOf(pieces(host, 13)[0].className);
    const add = zOf(withClass(host, 'max-w-[40px]')[0].className);
    expect(zOf(cover.className)).toBeGreaterThan(label);
    expect(zOf(cover.className)).toBeLessThan(header);
    expect(zOf(cover.className)).toBeLessThan(corner);
    // a tap on a label never lands on the add button of a day scrolled under it
    expect(label).toBeGreaterThan(add);
    expect(add).toBeGreaterThan(line);
  });

  it('keeps Sharek’s marks: past hours shaded and today’s header underlined', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);

    // Monday, Tuesday and Wednesday before 13:00
    expect(withClass(host, 'repeated-strip')).toHaveLength(24 + 24 + 13);
    expect(
      withClass(host, 'shadow-[inset_0_-2px_0_0_var(--brand)]')
    ).toHaveLength(1);
  });

  it('moves with the minute without drawing the grid again', async () => {
    at(WEDNESDAY);
    const host = await render(<WeekView />);
    const renders = mockUseCalendar.mock.calls.length;

    await tick(60_000);

    expect(badge(host)!.textContent).toBe('13:38');
    expect(pieces(host, 13)[0].style.top).toBe(`${(38 / 60) * 100}%`);
    expect(mockUseCalendar.mock.calls.length).toBe(renders);
  });
});

describe('the month view day numbers', () => {
  it('fills today’s number in the brand colour and strikes the past days', async () => {
    at(WEDNESDAY);
    mockCalendar.display = 'month';
    mockCalendar.startDate = '2026-10-01';
    mockCalendar.endDate = '2026-10-31';
    const host = await render(<MonthView />);

    const day = (n: number) =>
      withClass(host, 'min-w-[24px]').find((el) => el.textContent === `${n}`)!;
    expect(day(21).className).toContain('bg-brand');
    expect(day(21).className).toContain('text-white');
    expect(day(21).className).not.toContain('line-through');
    expect(day(20).className).toContain('line-through');
    expect(day(22).className).not.toMatch(/bg-brand|line-through/);
  });
});

describe('the day view now line', () => {
  // 12:37 UTC; the day view's slots are minutes from the UTC midnight
  const NOON = new Date(Date.UTC(2026, 9, 21, 12, 37));
  const slots = (...times: number[]) => [
    {
      id: 'i1',
      identifier: 'x',
      name: 'X',
      picture: '',
      time: times.map((time) => ({ time })),
    },
  ];
  const nowLine = (host: HTMLElement) =>
    badge(host)?.parentElement as HTMLElement | undefined;

  beforeEach(() => {
    mockCalendar.display = 'day';
    mockCalendar.startDate = '2026-10-21';
    mockCalendar.endDate = '2026-10-21';
    // 10:37 and 14:37 UTC
    mockCalendar.integrations = slots(10 * 60 + 37, 14 * 60 + 37);
  });

  it('sits right before the first slot still to come, in the gap under the one before', async () => {
    at(NOON);
    const host = await render(<DayView />);

    const line = nowLine(host)!;
    expect(line.className).toContain('-mt-[20px]');
    // the next sibling is the 14:37 slot's label
    expect(line.nextElementSibling!.textContent).toBe(
      dayjs
        .utc('2026-10-21')
        .add(14 * 60 + 37, 'minute')
        .local()
        .format('LT')
    );
  });

  it('writes the time as the slot labels do', async () => {
    at(NOON);
    const host = await render(<DayView />);

    expect(badge(host)!.textContent).toBe(dayjs(NOON).format('LT'));
  });

  it('wears the brand colour, with white text on the badge', async () => {
    at(NOON);
    const host = await render(<DayView />);

    expect(badge(host)!.className).toContain('bg-brand');
    expect(badge(host)!.className).toContain('text-white');
    expect(nowLine(host)!.lastElementChild!.className).toContain('bg-brand');
    expect(nowLine(host)!.outerHTML).not.toMatch(
      /newTableTextFocused|text-black/
    );
  });

  it.each([
    ['two days ahead', '2026-10-23'],
    ['two days back', '2026-10-19'],
  ])('is not drawn on the page %s', async (_name, startDate) => {
    at(NOON);
    mockCalendar.startDate = startDate;
    mockCalendar.endDate = startDate;
    const host = await render(<DayView />);

    expect(badge(host)).toBeNull();
  });

  it('moves with the minute without drawing the slots again', async () => {
    at(NOON);
    const host = await render(<DayView />);
    const renders = mockUseCalendar.mock.calls.length;

    await tick(60_000);

    expect(badge(host)!.textContent).toBe(
      dayjs(NOON).add(1, 'minute').format('LT')
    );
    // the day view itself reads the calendar again; its slots do not
    expect(mockUseCalendar.mock.calls.length).toBe(renders + 1);
  });
});
