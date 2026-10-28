import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';

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
