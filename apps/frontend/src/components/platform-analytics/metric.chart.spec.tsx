import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';
import type { ChartConfiguration } from 'chart.js';

// Analytics' chart of one metric over its period (spec 051, R20, FR-032 and
// FR-052): every daily point on labelled axes with light gridlines, in the
// brand's colour, with a hover tooltip and the same readout from the keyboard,
// an empty state, and no motion under reduced motion (C26). chart.js paints on
// a canvas the test DOM can't draw, so it's replaced by a recorder of what each
// chart was built with and what it was then asked to do.
interface MockChart {
  canvas: HTMLCanvasElement;
  config: ChartConfiguration<'line'>;
  setActiveElements: jest.Mock;
  tooltip: { setActiveElements: jest.Mock };
  update: jest.Mock;
  destroy: jest.Mock;
}
const mockCharts: MockChart[] = [];

jest.mock('chart.js/auto', () => ({
  __esModule: true,
  default: class {
    setActiveElements = jest.fn();
    tooltip = { setActiveElements: jest.fn() };
    update = jest.fn();
    destroy = jest.fn();
    constructor(
      public canvas: HTMLCanvasElement,
      public config: ChartConfiguration<'line'>
    ) {
      mockCharts.push(this as unknown as MockChart);
    }
    // the drawn points, 10px apart at the same height
    getDatasetMeta() {
      return {
        data: this.config.data.datasets[0].data.map((_, i) => ({
          x: i * 10,
          y: 50,
        })),
      };
    }
  },
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
// The theme, as the mode cookie holds it.
let mockMode = 'dark';
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: (key: string, initial: string) => [
    key === 'mode' ? mockMode : initial,
    () => undefined,
  ],
}));

import i18next from 'i18next';
import { chartColorSchemes } from '@gitroom/frontend/components/analytics/chart-social';
import { REDUCED_MOTION_QUERY } from '@gitroom/react/helpers/use.media.query';
import { MetricChart } from '@gitroom/frontend/components/platform-analytics/metric.chart';

// The device, as its reduced-motion media query reports it.
const realMatchMedia = window.matchMedia;
let reduced = false;

// The page's language resolves only to one with translations, so the cases
// load the real en and ar.
const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: readLocale('en') },
      ar: { translation: readLocale('ar') },
    },
  });
});

beforeEach(() => {
  reduced = false;
  mockMode = 'dark';
  window.matchMedia = ((query: string) => ({
    get matches() {
      return reduced && query === REDUCED_MOTION_QUERY;
    },
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
});

const mounted: Root[] = [];

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockCharts.length = 0;
  window.matchMedia = realMatchMedia;
  await i18next.changeLanguage('en');
});

// The AnalyticsBody board's Reach: 30 days from 12 October to 10 November 2026.
const REACH = [
  1820, 2140, 1960, 2480, 3120, 2710, 1890, 1650, 2230, 2050, 2610, 2980, 3410,
  2560, 1780, 1940, 2270, 2390, 2120, 2860, 3260, 2440, 1710, 1880, 2150, 2530,
  2340, 2040, 1990, 2400,
];
// One point a day from 12 October 2026, as the providers send them.
const days = (totals: number[]) =>
  totals.map((total, i) => ({
    total,
    date: new Date(Date.UTC(2026, 9, 12 + i)).toISOString().slice(0, 10),
  }));

type Point = { total: number; date: string };

const mount = async (data: Point[], label = 'Reach') => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<MetricChart label={label} data={data} />);
  });
  return host;
};

// The chart on screen: the one built and not destroyed since.
const drawn = () => {
  const live = mockCharts.filter((c) => c.destroy.mock.calls.length === 0);
  expect(live).toHaveLength(1);
  return live[0];
};
const canvas = (host: HTMLElement) => host.querySelector('canvas')!;
const live = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('[aria-live="polite"]');
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
const press = async (target: Element, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
};
// The point the last key made active, on the chart and on its tooltip.
const active = (chart: MockChart) => ({
  chart: chart.setActiveElements.mock.calls.at(-1),
  tooltip: chart.tooltip.setActiveElements.mock.calls.at(-1),
});
const at = (index: number) => ({
  chart: [[{ datasetIndex: 0, index }]],
  tooltip: [[{ datasetIndex: 0, index }], { x: index * 10, y: 50 }],
});

describe('MetricChart', () => {
  it('draws every daily point, with no merge to 7', async () => {
    await mount(days(REACH));
    const { config } = drawn();

    expect(config.type).toBe('line');
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual(REACH);
    expect(config.data.labels).toHaveLength(30);
  });

  it('draws all 90 days of the longest period', async () => {
    const totals = Array.from({ length: 90 }, (_, i) => i * 3);
    await mount(days(totals));
    const { config } = drawn();

    expect(config.data.datasets[0].data).toEqual(totals);
    expect(config.data.labels).toHaveLength(90);
  });

  it("labels the time axis with short dates in the page's language, left to right", async () => {
    await mount(days(REACH));
    const { x } = drawn().config.options.scales;

    expect(x.display).not.toBe(false);
    expect(x.reverse).toBeFalsy();
    expect(drawn().config.data.labels.slice(0, 2)).toEqual([
      'Oct 12',
      'Oct 13',
    ]);
    expect(drawn().config.data.labels[20]).toBe('Nov 1');
    expect(drawn().config.data.labels[29]).toBe('Nov 10');
  });

  it('keeps the time axis left to right in Arabic, with Latin digits', async () => {
    await i18next.changeLanguage('ar');
    await mount(days(REACH));
    const { config } = drawn();

    expect(config.options.scales.x.reverse).toBeFalsy();
    expect(config.data.labels[0]).toBe('12 أكتوبر');
    expect(config.data.labels[29]).toBe('10 نوفمبر');
    expect(config.data.labels.join(' ')).not.toMatch(/[٠-٩]/);
  });

  // A provider may send a day as a datetime with no offset, which Date reads in
  // the browser's zone, so east of UTC it would be the day before at UTC. A
  // point is the calendar day its date names.
  it('labels each point with the day it names, east of UTC too, whatever time follows', async () => {
    const RealDate = Date;
    // a browser three hours east of UTC, where a time with no offset is local
    class EastOfUtc extends RealDate {
      constructor(...args: [] | [string | number | Date]) {
        const [value] = args;
        if (typeof value === 'string' && /T[\d:.]+$/.test(value)) {
          super(`${value}+03:00`);
        } else {
          super(...args);
        }
      }
    }
    globalThis.Date = EastOfUtc as DateConstructor;
    try {
      await mount([
        { total: 1, date: '2026-11-01T00:00:00' },
        { total: 2, date: '2026-11-02T23:30:00' },
        { total: 3, date: '2026-11-03' },
      ]);
    } finally {
      globalThis.Date = RealDate;
    }

    expect(drawn().config.data.labels).toEqual(['Nov 1', 'Nov 2', 'Nov 3']);
  });

  it('labels the value axis in thousands', async () => {
    await mount(days(REACH));
    const { y } = drawn().config.options.scales;

    expect(y.display).not.toBe(false);
    expect(y.ticks.callback(12400)).toBe('12.4K');
    expect(y.ticks.callback(3000)).toBe('3K');
    expect(y.ticks.callback(500)).toBe('500');
    expect(y.ticks.callback(0)).toBe('0');
  });

  it('labels the value axis in thousands in Arabic, with Latin digits', async () => {
    await i18next.changeLanguage('ar');
    await mount(days(REACH));
    const { y } = drawn().config.options.scales;

    // Intl keeps the number and the word together with a no-break space
    expect(y.ticks.callback(12400)).toBe('12.4\u00a0ألف');
    expect(y.ticks.callback(500)).toBe('500');
  });

  it.each([
    ['dark', 'rgba(255,255,255,0.14)', '#AEA09D'],
    ['light', '#CFC9C6', '#6F635F'],
  ])(
    'in the %s theme, draws light horizontal gridlines and the one data colour, the brand entry of the colour table',
    async (mode, line, muted) => {
      mockMode = mode;
      await mount(days(REACH));
      const { options, data } = drawn().config;
      const brand = chartColorSchemes(mode).purple;

      expect(options.scales.y.grid.color).toBe(line);
      expect(options.scales.x.grid.display).toBe(false);
      expect(options.scales.x.ticks.color).toBe(muted);
      expect(options.scales.y.ticks.color).toBe(muted);
      expect(options.plugins.legend.display).toBe(false);
      expect(data.datasets).toHaveLength(1);
      expect(data.datasets[0]).toEqual(
        expect.objectContaining({
          borderColor: brand.border,
          backgroundColor: brand.end,
          pointHoverBackgroundColor: brand.border,
        })
      );
    }
  );

  it.each([
    ['dark', '#1D1518', '#F7F1EF', '#AEA09D', 'rgba(255,255,255,0.14)'],
    ['light', '#F7F5F4', '#1A1413', '#6F635F', '#CFC9C6'],
  ])(
    "shows the hover tooltip in the %s theme's colours, with the value in the page's language",
    async (mode, backgroundColor, titleColor, bodyColor, borderColor) => {
      mockMode = mode;
      await mount(days(REACH));
      const { options } = drawn().config;

      expect(options.interaction).toEqual({ mode: 'index', intersect: false });
      expect(options.plugins.tooltip).toEqual(
        expect.objectContaining({
          enabled: true,
          backgroundColor,
          titleColor,
          bodyColor,
          borderColor,
        })
      );
      expect(
        options.plugins.tooltip.callbacks.label({ parsed: { y: 3410 } })
      ).toBe('3,410');
    }
  );

  it('is focusable and named by its metric, with an empty live line', async () => {
    const host = await mount(days(REACH));

    expect(canvas(host).getAttribute('tabindex')).toBe('0');
    expect(canvas(host).getAttribute('role')).toBe('img');
    expect(canvas(host).getAttribute('aria-label')).toBe('Reach');
    expect(classes(canvas(host))).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    expect(live(host)).not.toBeNull();
    expect(live(host)!.textContent).toBe('');
  });

  it('moves the active point with the arrow keys, on the chart and its tooltip, and the live line reads the date and value', async () => {
    const host = await mount(days(REACH));
    const chart = drawn();

    const first = await press(canvas(host), 'ArrowRight');
    expect(first.defaultPrevented).toBe(true);
    expect(active(chart)).toEqual(at(0));
    expect(chart.update).toHaveBeenCalled();
    expect(live(host)!.textContent).toBe('Oct 12: 1,820');

    await press(canvas(host), 'ArrowRight');
    expect(active(chart)).toEqual(at(1));
    expect(live(host)!.textContent).toBe('Oct 13: 2,140');

    await press(canvas(host), 'ArrowLeft');
    expect(active(chart)).toEqual(at(0));
    expect(live(host)!.textContent).toBe('Oct 12: 1,820');

    await press(canvas(host), 'ArrowLeft');
    expect(active(chart)).toEqual(at(0));
  });

  it('starts from the last day with ArrowLeft, and stops there with ArrowRight', async () => {
    const host = await mount(days(REACH));
    const chart = drawn();

    await press(canvas(host), 'ArrowLeft');
    expect(active(chart)).toEqual(at(29));
    expect(live(host)!.textContent).toBe('Nov 10: 2,400');

    await press(canvas(host), 'ArrowRight');
    expect(active(chart)).toEqual(at(29));
  });

  it('moves along the axis in Arabic too, ArrowRight to the next day', async () => {
    await i18next.changeLanguage('ar');
    const host = await mount(days(REACH));
    const chart = drawn();

    await press(canvas(host), 'ArrowRight');
    await press(canvas(host), 'ArrowRight');
    expect(active(chart)).toEqual(at(1));
    expect(live(host)!.textContent).toBe('13 أكتوبر: 2,140');
  });

  it('takes the readout away when the chart loses the focus', async () => {
    const host = await mount(days(REACH));
    const chart = drawn();

    await act(async () => {
      canvas(host).focus();
    });
    await press(canvas(host), 'ArrowRight');
    await act(async () => {
      canvas(host).blur();
    });

    expect(chart.setActiveElements.mock.calls.at(-1)).toEqual([[]]);
    expect(chart.tooltip.setActiveElements.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(live(host)!.textContent).toBe('');
  });

  it("with no data, shows no_data_for_period in the chart's place, and no canvas", async () => {
    const host = await mount([]);
    const full = await mount(days(REACH));

    expect(host.textContent).toBe('no_data_for_period');
    expect(host.querySelector('canvas')).toBeNull();
    expect(mockCharts).toHaveLength(1);
    expect(classes(host.firstElementChild)).toEqual(
      expect.arrayContaining(['h-[340px]', 'mobile:h-[200px]'])
    );
    expect(classes(canvas(full).parentElement)).toEqual(
      expect.arrayContaining(['h-[340px]', 'mobile:h-[200px]'])
    );
  });

  it('is built with animation: false under prefers-reduced-motion: reduce', async () => {
    reduced = true;
    await mount(days(REACH));

    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(drawn().config.options.animation).toBe(false);
  });

  it("is built with ChartSocial's animation otherwise", async () => {
    await mount(days(REACH));

    expect(drawn().config.options.animation).toEqual({
      duration: 750,
      easing: 'easeOutQuart',
    });
  });
});
