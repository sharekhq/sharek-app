import { resolveThemeClass } from './resolve.theme.mode';

describe('resolveThemeClass', () => {
  it('defaults to light when the mode cookie is missing', () => {
    expect(resolveThemeClass(undefined)).toBe('light');
  });

  it('returns dark when the mode cookie is "dark"', () => {
    expect(resolveThemeClass('dark')).toBe('dark');
  });

  it('returns light when the mode cookie is "light"', () => {
    expect(resolveThemeClass('light')).toBe('light');
  });

  it('falls back to light for an unknown value', () => {
    expect(resolveThemeClass('purple')).toBe('light');
  });
});
