// The posting streak in the top bar: a 40px pill with the bar's hover square,
// hidden on phones by its own root. The layout puts it straight into the peer
// group whose separator hides while the group is empty (research R8), so it
// carries phone:hidden itself and, without a streak, renders nothing at all.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

let mockUser: { streakSince: string | null } | undefined;

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (key: string, fallback: string, values?: { streakDays?: number }) =>
      `${key}:${fallback.replace(
        '{{streakDays}}',
        String(values?.streakDays ?? '')
      )}`,
}));

import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';

// Wednesday 11 November 2026 at 10:00, local time. A streak that began on
// Sunday the 8th at 09:00 is in its fourth day.
const NOW = new Date(2026, 10, 11, 10, 0);
const FOURTH_DAY = new Date(2026, 10, 8, 9, 0).toISOString();
const FIRST_DAY = new Date(2026, 10, 11, 8, 0).toISOString();

const mounted: Array<{ unmount: () => void }> = [];

const render = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<StreakComponent />);
  });
  return host;
};

// Class names are matched as words in className, not as CSS selectors, so the
// brackets of Tailwind's arbitrary values need no escaping.
const classesOf = (el: Element) => el.getAttribute('class')?.split(/\s+/) ?? [];

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockUser = { streakSince: FOURTH_DAY };
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('with a streak', () => {
  it('is one root that hides on phones itself', () => {
    const host = render();

    expect(host.children).toHaveLength(1);
    expect(classesOf(host.firstElementChild!)).toContain('phone:hidden');
  });

  it('is a 40px pill with the hover square', () => {
    const root = render().firstElementChild!;

    expect(classesOf(root)).toEqual(
      expect.arrayContaining([
        'h-[40px]',
        'px-[10px]',
        'rounded-[10px]',
        'hover:bg-boxFocused',
      ])
    );
  });

  it('keeps its row, its orange and its default cursor', () => {
    const root = render().firstElementChild!;

    expect(classesOf(root)).toEqual(
      expect.arrayContaining([
        'flex',
        'items-center',
        'gap-[6px]',
        'text-orange-500',
        'hover:text-orange-400',
        'cursor-default',
      ])
    );
  });

  it('counts the days and says so in its tooltip', () => {
    const root = render().firstElementChild!;
    const count = root.querySelector('span')!;

    expect(count.textContent).toBe('4');
    expect(classesOf(count)).toEqual(['text-[14px]', 'font-semibold']);
    expect(root.getAttribute('data-tooltip-id')).toBe('tooltip');
    expect(root.getAttribute('data-tooltip-content')).toBe(
      "you_re_on_a_day_posting_streak_keep_it_going:You're on a 4 day posting streak! Keep it going!"
    );
  });

  it('on its first day counts one and says it started today', () => {
    mockUser = { streakSince: FIRST_DAY };
    const root = render().firstElementChild!;

    expect(root.querySelector('span')!.textContent).toBe('1');
    expect(root.getAttribute('data-tooltip-content')).toBe(
      'you_started_your_streak_today_keep_posting_daily_to:You started your streak today! Keep posting daily to maintain it.'
    );
  });

  it('keeps its flame at 24px', () => {
    const svg = render().querySelector('svg')!;

    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('viewBox')).toBe('0 0 22 27');
  });
});

describe('without a streak', () => {
  // Not even a text node: the layout's separator hides on :empty.
  it.each([
    ['no streak has started', { streakSince: null }],
    ['the member is still loading', undefined],
  ])('leaves its container empty while %s', (_, user) => {
    mockUser = user;

    expect(render().childNodes).toHaveLength(0);
  });
});
