// Finding 60 (spec 021, US7): at 390 the calendar painted a frame of the
// seven-column week grid before the width answer arrived, then replaced it with
// the agenda list — and because `effectiveDisplay` picks the SWR key as well as
// the component, that wrong first frame also fired the calendar request the
// phone never uses. Both halves are one defect: the width is read in an effect,
// which runs after the first render, so the first render answers "not a phone"
// on every device.
//
// This file pins the gate, not the grid: the provider is rendered for real with
// its four data-layer modules stubbed, and a probe records the context value at
// every render. What it asserts is the sequence, because a fix that only settles
// on the right answer eventually is the bug.
import { FC, act, useContext } from 'react';
import { createRoot } from 'react-dom/client';

const swrKeys: Array<string | null> = [];
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null) => {
    swrKeys.push(key);
    return { data: undefined, isLoading: false, mutate: () => undefined };
  },
}));

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => () => Promise.resolve({ json: () => Promise.resolve({}) }),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['week', () => undefined],
}));

import {
  CalendarContext,
  CalendarWeekProvider,
} from '@gitroom/frontend/components/launches/calendar.context';

// One entry per render of the consumer: what the calendar would have drawn, and
// whether the width had been asked for yet when it drew it.
const frames: Array<{ display: string | undefined; matchMediaCalls: number }> =
  [];

let matchMediaCalls = 0;

const Probe: FC = () => {
  const { display } = useContext(CalendarContext);
  frames.push({ display, matchMediaCalls });
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const mountAt = async (matches: boolean) => {
  matchMediaCalls = 0;
  frames.length = 0;
  swrKeys.length = 0;
  window.matchMedia = (query: string) => {
    matchMediaCalls++;
    return {
      media: query,
      matches,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <CalendarWeekProvider integrations={[]}>
        <Probe />
      </CalendarWeekProvider>
    );
  });
};

const postKeys = () => swrKeys.filter((k): k is string => !!k && k.startsWith('/posts'));

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
});

describe('calendar render gate', () => {
  it('never draws a grid arrangement on a narrow viewport, at any render', async () => {
    await mountAt(true);

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.map((f) => f.display)).not.toContain('week');
    expect(frames.map((f) => f.display)).not.toContain('month');
    // And it does settle — a gate that never resolves is not a fix.
    expect(frames[frames.length - 1].display).toBe('list');
  });

  it('never requests the calendar key on a narrow viewport', async () => {
    await mountAt(true);

    expect(postKeys().some((k) => k.startsWith('/posts-list-'))).toBe(true);
    expect(postKeys().filter((k) => !k.startsWith('/posts-list-'))).toEqual([]);
  });

  it('asks nothing until the width is known, rather than guessing', async () => {
    await mountAt(true);

    // The width is not read during the first render — that is the hydration
    // mismatch use.media.query.tsx documents avoiding — so the first frame
    // cannot be a guess, and it must not spend a request on one either.
    expect(frames[0].matchMediaCalls).toBe(0);
    expect(frames[0].display).toBeUndefined();
  });

  it('leaves the wide viewport on its saved grid, fetching only its own key', async () => {
    await mountAt(false);

    expect(frames[frames.length - 1].display).toBe('week');
    expect(frames.map((f) => f.display)).not.toContain('list');
    expect(postKeys().some((k) => k.startsWith('/posts-list-'))).toBe(false);
    expect(postKeys().some((k) => !k.startsWith('/posts-list-'))).toBe(true);
  });
});
