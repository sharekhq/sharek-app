import {
  MOBILE_QUERY,
  PHONE_QUERY,
} from '@gitroom/react/helpers/use.media.query';

// The Tailwind config is CommonJS — PostCSS consumes it directly — so this is
// the only way to read the screens the components' classes resolve against.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require('../../../../apps/frontend/tailwind.config.cjs');

// MOBILE_QUERY is the JavaScript half of the `mobile:` breakpoint: the shell,
// the composer and the calendar decide in JS what their `mobile:` classes
// already draw. If the two drift, they disagree about which screens are small.
describe('the small-screen query mirrors Tailwind', () => {
  it('MOBILE_QUERY matches the mobile screen', () => {
    expect(MOBILE_QUERY).toBe(tailwind.theme.extend.screens.mobile.raw);
  });
});

// PHONE_QUERY is read in JavaScript by the components that keep Sharek's ≤768
// layout, so the drift its own comment warns about is a live risk and this
// pins it.
describe('the phone query mirrors Tailwind', () => {
  it('PHONE_QUERY matches the phone screen', () => {
    expect(PHONE_QUERY).toBe(tailwind.theme.extend.screens.phone.raw);
  });

  it('the mobile screen is the wider band the small-screen layout uses', () => {
    const width = (q: string) => Number(/(\d+)/.exec(q)?.[1]);
    const screens = tailwind.theme.extend.screens;

    expect(width(screens.mobile.raw)).toBeGreaterThan(width(screens.phone.raw));
  });
});
