import { resolveThemeClass } from './resolve.theme.mode';

describe('resolveThemeClass', () => {
  it('defaults to dark when the mode cookie is missing', () => {
    expect(resolveThemeClass(undefined)).toBe('dark');
  });

  it('defaults to dark for an empty cookie value', () => {
    expect(resolveThemeClass('')).toBe('dark');
  });

  it('returns dark when the mode cookie is "dark"', () => {
    expect(resolveThemeClass('dark')).toBe('dark');
  });

  it('returns light when the mode cookie is "light"', () => {
    expect(resolveThemeClass('light')).toBe('light');
  });

  it('falls back to dark for an unknown value', () => {
    expect(resolveThemeClass('purple')).toBe('dark');
  });
});
