// The parts of upstream's timezone that Sharek's own screens rely on.
//
// The machine's zone comes from TZ when jest starts: a spec cannot change it
// (jest hands the test a copy of process.env). So every case here chooses an
// account zone that differs from the machine's, and the gate runs this file
// under the machine's zone, TZ=UTC and TZ=America/New_York (run-tz-matrix.sh).
import dayjs from 'dayjs';
import i18next from 'i18next';
// The timezone first, the layout's dayjs setup second: html.component.spec.tsx
// loads them the other way round, so the two files cover both orders.
import {
  browserTimezone,
  fromUtc,
  getTimezone,
  newDayjs,
  setUserTimezone,
  toPickerDate,
} from '@gitroom/frontend/components/layout/set.timezone';
import 'dayjs/locale/ar';
import '@gitroom/frontend/components/layout/html.component';

// No daylight saving, and not the zone of any machine the gate runs on.
const ZONE = 'Asia/Tokyo';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and the timezone remembers the last zone there.
globalThis.localStorage = window.localStorage;

// The singleton, set up with the pair the Arabic locale ships.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: {} },
      ar: { translation: { am: 'ص', pm: 'م' } },
    },
  });
});

afterEach(async () => {
  setUserTimezone(null);
  localStorage.clear();
  await i18next.changeLanguage('en');
  dayjs.locale('en');
});

it('runs on a machine outside the chosen zone', () => {
  expect(browserTimezone()).not.toBe(ZONE);
});

describe('with a zone chosen', () => {
  beforeEach(() => setUserTimezone(ZONE));

  it('reads a picked wall clock as that time in the zone', () => {
    expect(newDayjs('2026-10-21 10:00:00').utc().format()).toBe(
      '2026-10-21T01:00:00Z'
    );
  });

  it('shows a date from the server in the zone, with or without the Z', () => {
    expect(fromUtc('2026-10-21T03:30:00.000Z').format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-21 12:30'
    );
    expect(fromUtc('2026-10-21 03:30:00').format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-21 12:30'
    );
    // past the zone's midnight it is already the next day there
    expect(fromUtc('2026-10-21T16:30:00.000Z').format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-22 01:30'
    );
  });

  it("hands the pickers the zone's wall clock as a machine-local date", () => {
    const date = toPickerDate(newDayjs('2026-10-21 21:30:00'));

    expect([
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
    ]).toEqual([2026, 9, 21, 21, 30]);
  });

  it('names the zone for the dates formatted outside dayjs', () => {
    expect(getTimezone()).toBe(ZONE);
  });

  // The calendar asks the server for the zone's week, not the machine's
  // (calendar.context.tsx loadData).
  it("turns the zone's days into the moments the server is asked for", () => {
    expect(newDayjs('2026-10-19').startOf('day').utc().format()).toBe(
      '2026-10-18T15:00:00Z'
    );
    expect(newDayjs('2026-10-25').endOf('day').utc().format()).toBe(
      '2026-10-25T14:59:59Z'
    );
  });
});

describe('daylight saving in the chosen zone', () => {
  beforeEach(() => setUserTimezone('Europe/London'));

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe('Europe/London');
  });

  it('keeps a picked wall clock on the day the clocks go back', () => {
    expect(newDayjs('2026-10-25 10:00:00').utc().format()).toBe(
      '2026-10-25T10:00:00Z'
    );
  });

  it('takes the earlier moment of a repeated hour', () => {
    expect(newDayjs('2026-10-25 01:30:00').utc().format()).toBe(
      '2026-10-25T00:30:00Z'
    );
  });

  it('moves a skipped time forward, as a local date does', () => {
    const skipped = newDayjs('2026-03-29 01:30:00');

    expect(skipped.format('HH:mm')).toBe('02:30');
    expect(skipped.utc().format()).toBe('2026-03-29T01:30:00Z');
  });
});

// Every user has Automatic after the migration (SC-002): plain dayjs, the
// browser's zone, exactly as before the timezone existed.
describe('Automatic', () => {
  it('is plain dayjs in the browser’s zone', () => {
    expect(newDayjs('2026-10-21 10:00:00').valueOf()).toBe(
      dayjs('2026-10-21 10:00:00').valueOf()
    );
    expect(fromUtc('2026-10-21T03:30:00.000Z').format()).toBe(
      dayjs.utc('2026-10-21T03:30:00.000Z').local().format()
    );
    expect(getTimezone()).toBe(browserTimezone());
  });

  it("treats the browser's own zone and an unknown name as Automatic", () => {
    setUserTimezone(browserTimezone());
    expect(getTimezone()).toBe(browserTimezone());

    setUserTimezone('Not/AZone');
    expect(getTimezone()).toBe(browserTimezone());
  });
});

// Pages that do not load the user (connecting a channel, the extension) start
// from the zone this browser applied last (FR-010, US5 AC4).
describe('the zone the browser remembers', () => {
  it('is where a page that does not load the user starts', async () => {
    setUserTimezone(ZONE);
    expect(localStorage.getItem('timezoneName')).toBe(ZONE);

    await jest.isolateModulesAsync(async () => {
      const fresh = await import(
        '@gitroom/frontend/components/layout/set.timezone'
      );
      expect(fresh.getTimezone()).toBe(ZONE);
    });
  });

  it('is forgotten when the user goes back to Automatic', () => {
    setUserTimezone(ZONE);
    setUserTimezone(null);

    expect(localStorage.getItem('timezoneName')).toBeNull();
  });
});
