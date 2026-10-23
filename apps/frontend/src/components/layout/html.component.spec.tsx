import dayjs from 'dayjs';
import i18next from 'i18next';
// The Arabic locale is loaded here as well, so what fails is the word and not a
// missing locale. The layout's dayjs setup runs when its module loads.
import 'dayjs/locale/ar';
import '@gitroom/frontend/components/layout/html.component';
// The timezone second; set.timezone.spec.tsx loads them the other way round.
import {
  browserTimezone,
  fromUtc,
  newDayjs,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

// The word comes from the translations, as the week's hour labels take it, so
// the singleton is set up with the pair the Arabic locale ships.
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
  await i18next.changeLanguage('en');
  dayjs.locale('en');
});

const timeAt = (hour: number, minute: number) =>
  dayjs(new Date(2026, 9, 21, hour, minute)).format('h:mm A');

describe('the time of day dayjs prints', () => {
  describe('in Arabic', () => {
    beforeEach(async () => {
      await i18next.changeLanguage('ar');
      dayjs.locale('ar');
    });

    // dayjs's own Arabic locale calls 12:00 to 12:59 morning; the afternoon
    // starts at noon, as the browser's own Arabic format has it.
    it.each([
      { time: '00:30', hour: 0, minute: 30, expected: '12:30 ص' },
      { time: '11:59', hour: 11, minute: 59, expected: '11:59 ص' },
      { time: '12:05', hour: 12, minute: 5, expected: '12:05 م' },
      { time: '12:37', hour: 12, minute: 37, expected: '12:37 م' },
      { time: '13:05', hour: 13, minute: 5, expected: '1:05 م' },
    ])('reads $expected at $time', ({ hour, minute, expected }) => {
      expect(timeAt(hour, minute)).toBe(expected);
    });
  });

  it('keeps English as dayjs prints it', () => {
    expect(timeAt(12, 5)).toBe('12:05 PM');
  });
});

// The bell and the public preview print dates on pages that never load the
// calendar, so the language comes from the layout every page mounts.
describe('the language dayjs prints in', () => {
  it('follows the interface into Arabic', async () => {
    await i18next.changeLanguage('ar');

    expect(dayjs.locale()).toBe('ar');
    expect(dayjs(new Date(2026, 9, 21)).format('MMMM')).toBe('أكتوبر');
  });

  it('follows the interface back to English', async () => {
    dayjs.locale('ar');
    await i18next.changeLanguage('ar');
    await i18next.changeLanguage('en');

    expect(dayjs.locale()).toBe('en');
    expect(dayjs(new Date(2026, 9, 21)).format('MMMM')).toBe('October');
  });
});

// Upstream's timezone patches the same dayjs the layout sets up (its parse,
// init, clone, format, add, utcOffset, fromNow, diff): a chosen zone must not
// reset the language or the word for the half of the day.
describe('with a zone chosen', () => {
  const ZONE = 'Asia/Tokyo';

  beforeEach(() => setUserTimezone(ZONE));
  afterEach(() => setUserTimezone(null));

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  describe('in Arabic', () => {
    beforeEach(async () => {
      await i18next.changeLanguage('ar');
    });

    // 03:30, 02:05, 04:05 and 15:05 UTC are 12:30, 11:05, 13:05 and 00:05
    // in Tokyo
    it.each([
      { utc: '2026-10-21T03:30:00Z', expected: '12:30 م' },
      { utc: '2026-10-21T02:05:00Z', expected: '11:05 ص' },
      { utc: '2026-10-21T04:05:00Z', expected: '1:05 م' },
      { utc: '2026-10-21T15:05:00Z', expected: '12:05 ص' },
    ])('reads $expected at $utc', ({ utc, expected }) => {
      expect(fromUtc(utc).format('h:mm A')).toBe(expected);
    });

    it('keeps the language through the zone’s own arithmetic', () => {
      const date = newDayjs('2026-10-21 12:30:00');

      expect(date.format('MMMM D h:mm A')).toBe('أكتوبر 21 12:30 م');
      expect(date.add(1, 'hour').format('h:mm A')).toBe('1:30 م');
      expect(date.clone().format('MMMM')).toBe('أكتوبر');
      expect(dayjs.locale()).toBe('ar');
    });
  });

  it('keeps English as dayjs prints it', () => {
    expect(fromUtc('2026-10-21T03:30:00Z').format('h:mm A')).toBe('12:30 PM');
  });
});
