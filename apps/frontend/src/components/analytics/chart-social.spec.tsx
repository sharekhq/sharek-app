import { chartColorSchemes } from '@gitroom/frontend/components/analytics/chart-social';

// The per-theme line and fill colours ChartSocial paints with, exported so
// Analytics' MetricChart takes the same brand entry (spec 051, R20). Chart.js
// paints on a canvas, which can't read the CSS tokens, so each theme's RGB is
// written out.
describe('chartColorSchemes', () => {
  it.each(['dark', 'light'])(
    'gives the brand, #B92D43, for purple in the %s theme',
    (mode) => {
      expect(chartColorSchemes(mode).purple).toEqual({
        start: 'rgba(185, 45, 67, 0.8)',
        end: 'rgba(185, 45, 67, 0.1)',
        border: 'rgb(185, 45, 67)',
      });
    }
  );

  it("holds every colour ChartSocial takes, in each theme's own shade", () => {
    const dark = chartColorSchemes('dark');
    const light = chartColorSchemes('light');

    expect(Object.keys(dark)).toEqual([
      'purple',
      'green',
      'blue',
      'pomegranate',
      'saffron',
      'fayrouz',
      'palm',
      'lapis',
      'mulberry',
    ]);
    expect(dark.green.border).toBe('rgb(61, 214, 140)');
    expect(light.green.border).toBe('rgb(30, 158, 90)');
    expect(dark.pomegranate.border).toBe('rgb(224, 99, 120)');
    expect(light.pomegranate.border).toBe('rgb(185, 45, 67)');
  });
});
