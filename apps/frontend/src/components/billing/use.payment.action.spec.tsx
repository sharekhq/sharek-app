// The bank's 3D Secure check inside the page: Stripe.js runs the intent's next action, and the
// caller reads only `error`.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const mockHandleNextAction = jest.fn();
const mockLoadStripe = jest.fn();
jest.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ stripeClient: 'pk_live_sharek' }),
}));

import { usePaymentAction } from '@gitroom/frontend/components/billing/use.payment.action';

let action: (clientSecret: string) => Promise<{ error?: string }>;
const Harness = (): null => {
  const run = usePaymentAction();
  useEffect(() => {
    action = run;
  }, [run]);
  return null;
};
const mounted: Array<{ unmount: () => void }> = [];

beforeEach(async () => {
  mockHandleNextAction.mockReset().mockResolvedValue({});
  mockLoadStripe
    .mockReset()
    .mockResolvedValue({ handleNextAction: mockHandleNextAction });
  const root = createRoot(document.createElement('div'));
  mounted.push(root);
  await act(async () => {
    root.render(<Harness />);
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
});

describe("the bank's 3D Secure check", () => {
  it('runs the check with the intent it was given and reports no error when it passes', async () => {
    await expect(action('pi_secret')).resolves.toEqual({ error: undefined });
    expect(mockHandleNextAction).toHaveBeenCalledWith({
      clientSecret: 'pi_secret',
    });
  });

  it("passes on Stripe's own message when the bank declines", async () => {
    mockHandleNextAction.mockResolvedValue({
      error: { message: 'Your card was declined.' },
    });

    await expect(action('pi_secret')).resolves.toEqual({
      error: 'Your card was declined.',
    });
  });
});
