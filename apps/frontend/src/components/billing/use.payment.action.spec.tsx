// The bank's 3D Secure check inside the page: Stripe.js runs the intent's next action, and the
// caller reads only `error`.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const mockHandleNextAction = jest.fn();
const mockLoadStripe = jest.fn();
jest.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}));
// The interface language Stripe.js is asked to speak.
let mockLanguage: string | undefined = 'ar';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get resolvedLanguage() {
      return mockLanguage;
    },
  },
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ stripeClient: 'pk_live_sharek' }),
}));
// Returns the key, so a case can tell which sentence the reader gets.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
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
  mockLanguage = 'ar';
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
  // Every card form loads Stripe.js in the interface language.
  it('loads Stripe.js in the interface language', async () => {
    await action('pi_secret');

    expect(mockLoadStripe).toHaveBeenCalledWith('pk_live_sharek', {
      locale: 'ar',
    });
  });

  it('lets Stripe choose when the interface language is unknown', async () => {
    mockLanguage = undefined;

    await action('pi_secret');

    expect(mockLoadStripe).toHaveBeenCalledWith('pk_live_sharek', {
      locale: 'auto',
    });
  });

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

  // Stripe.js's own messages for these are technical English: the reader gets a sentence in their
  // language, one for each cause.
  it.each([
    [
      'rejects',
      () =>
        mockLoadStripe.mockRejectedValue(new Error('Failed to load Stripe.js')),
    ],
    ['answers nothing', () => mockLoadStripe.mockResolvedValue(null)],
  ])(
    'reports a Stripe.js that cannot load (it %s) as the paywall does',
    async (_cause, arrange) => {
      arrange();

      await expect(action('pi_secret')).resolves.toEqual({
        error: 'billing_stripe_load_failed',
      });
    }
  );

  it('reports a check Stripe.js refuses to run as a failed payment', async () => {
    mockHandleNextAction.mockRejectedValue(
      new Error('IntegrationError: PaymentIntent is not in requires_action')
    );

    await expect(action('pi_secret')).resolves.toEqual({
      error: 'payment_failed',
    });
  });
});
