import dayjs from 'dayjs';
import i18next from 'i18next';
// The Arabic locale is loaded here as well, so what fails is the word and not a
// missing locale. The layout's dayjs setup runs when its module loads.
import 'dayjs/locale/ar';
import '@gitroom/frontend/components/layout/html.component';

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
