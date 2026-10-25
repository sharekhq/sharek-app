// The checkout's order summary and applied coupon, on a harness that mocks Stripe's checkout
// entry (the provider, a payment form that reports ready, and a checkout carrying a promo code),
// the cookie, the theme emitter and the toaster. Each amount glued to a sign or a bracket is
// isolated left to right, so Arabic reads it in order (FR-016).
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Stripe } from '@stripe/stripe-js';

// Returns the English default with its {{placeholders}} filled, so a case reads the sentence the
// customer reads.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (_key: string, fallback: string, options?: Record<string, unknown>) =>
      (fallback || '').replace(/{{(\w+)}}/g, (_m, name) =>
        String(options?.[name] ?? '')
      ),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/mode.component', () => ({
  modeEmitter: { on: jest.fn(), removeAllListeners: jest.fn() },
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['dark', jest.fn()],
}));

// A trial on Team with a 10% promotion code: the breakdown shows the discount, the next payment
// and the applied code.
const mockCheckout = {
  lineItems: [{ name: 'Team', unitAmount: { amount: '$45.00' } }],
  discountAmounts: [
    {
      amount: '$4.50',
      displayName: 'Launch',
      promotionCode: 'LAUNCH10',
      percentOff: 10,
    },
  ],
  total: { total: { amount: '$0.00' } },
  recurring: {
    interval: 'month',
    dueNext: { total: { amount: '$40.50' } },
    trial: { trialEnd: 1794528000 },
  },
  applyPromotionCode: jest.fn(),
  removePromotionCode: jest.fn(),
  confirm: jest.fn(),
};
// The breakdown and the coupon render only once the payment form reports ready.
jest.mock('@stripe/react-stripe-js/checkout', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    CheckoutProvider: ({ children }: { children: unknown }) => children,
    PaymentElement: ({ onReady }: { onReady: () => void }) => {
      useEffect(() => onReady(), [onReady]);
      return null;
    },
    BillingAddressElement: () => null,
    useCheckout: () => ({ type: 'success', checkout: mockCheckout }),
  };
});

import { EmbeddedBilling } from '@gitroom/frontend/components/billing/embedded.billing';

const mounted: Array<{ unmount: () => void }> = [];
const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <EmbeddedBilling
        stripe={Promise.resolve({} as Stripe)}
        secret="cs_test_secret"
        showCoupon
      />
    );
  });
  return host;
};
const isolated = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('bdi[dir="ltr"]'), (bdi) => bdi.textContent);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('the checkout amounts', () => {
  it('shows the discount, the next payment and the applied code', async () => {
    const host = await render();

    expect(host.textContent).toContain('-$4.50');
    expect(host.textContent).toContain('Then $40.50 on');
    expect(host.textContent).toContain('LAUNCH10applied (-10%)');
  });

  it.each([
    ['the discount', '-$4.50'],
    ['the next payment', '$40.50'],
    ["the applied code's saving", '(-10%)'],
  ])('keeps %s, %s, in reading order', async (_what, amount) => {
    const host = await render();

    expect(isolated(host)).toContain(amount);
  });
});
