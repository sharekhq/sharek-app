// The two addresses Settings replaced: both pages are server components that
// only redirect, so the redirect is the whole behaviour, and next/navigation's
// `redirect` is replaced by a recorder. What Settings does with each address is
// settings.component.spec.tsx's: with SHOW_THIRD_PARTY blank,
// `?tab=integrations` opens the first tab and reveals no Integrations tab.
const mockRedirect = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import PlugsPage from '../plugs/page';
import ThirdPartyPage from '../third-party/page';

beforeEach(() => {
  mockRedirect.mockClear();
});

describe('the addresses Settings replaced', () => {
  it('sends the old Plugs address to Settings on Plugs', async () => {
    await PlugsPage();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith('/settings?tab=plugs');
  });

  // The trunk sent this address to /launches while SHOW_THIRD_PARTY was blank;
  // Settings now decides what it shows, so the page no longer reads the switch.
  it('sends the old Integrations address to Settings on Integrations, whatever the switch says', async () => {
    const before = process.env.SHOW_THIRD_PARTY;
    try {
      for (const value of [undefined, 'true']) {
        if (value === undefined) delete process.env.SHOW_THIRD_PARTY;
        else process.env.SHOW_THIRD_PARTY = value;
        mockRedirect.mockClear();

        await ThirdPartyPage();

        expect(mockRedirect).toHaveBeenCalledTimes(1);
        expect(mockRedirect).toHaveBeenCalledWith('/settings?tab=integrations');
      }
    } finally {
      if (before === undefined) delete process.env.SHOW_THIRD_PARTY;
      else process.env.SHOW_THIRD_PARTY = before;
    }
  });
});
