import { act, ComponentProps, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// What the feedback modal is opened with: the Info form it renders.
type OpenedModal = {
  children: ReactElement<{ proceed?: (feedback: string) => void }>;
};

// Returns the English default, so a case reads the sentence the customer reads.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

const mockShow = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));

// Each case answers /billing/cancel with the Response it is about.
let mockCancelResponse: () => Response;
const mockFetch = jest.fn(async (url: string) =>
  url === '/billing/check-discount'
    ? new Response(JSON.stringify({ offerCoupon: false }))
    : mockCancelResponse()
);
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

// The cancel flow asks for feedback in a modal; the double answers it at once.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: ({ children }: OpenedModal) =>
      children.props.proceed?.('the feedback the customer typed in'),
    closeAll: jest.fn(),
  }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: jest.fn().mockResolvedValue(true),
}));
jest.mock('swr', () => ({ useSWRConfig: () => ({ mutate: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: 'STANDARD' }),
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => jest.fn(),
}));
jest.mock('@gitroom/helpers/utils/utm.saver', () => ({ useUtmUrl: () => '' }));
jest.mock('@gitroom/react/helpers/use.track', () => ({
  useTrack: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/dubAnalytics', () => ({
  useDubClickId: () => undefined,
}));
// Scenery: none of these take part in a cancel or a reactivation.
jest.mock('@gitroom/frontend/components/billing/faq.component', () => ({
  FAQComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/billing/finish.trial', () => ({
  FinishTrial: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => null,
}));
jest.mock('@gitroom/react/form/slider', () => ({ Slider: () => null }));
jest.mock('@gitroom/react/form/textarea', () => ({ Textarea: () => null }));

import { MainBillingComponent } from '@gitroom/frontend/components/billing/main.billing.component';

type Sub = NonNullable<ComponentProps<typeof MainBillingComponent>['sub']>;

const SUB = {
  id: 'subscription-row',
  subscriptionTier: 'STANDARD',
  period: 'MONTHLY',
  totalChannels: 10,
} as unknown as Sub;

const mounted: Array<{ unmount: () => void }> = [];
const render = async (sub: Sub) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<MainBillingComponent sub={sub} />);
  });
  return host;
};
const click = async (host: HTMLElement, label: string) => {
  const button = Array.from(host.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label
  )!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const toasts = () => mockShow.mock.calls.map(([text, type]) => [text, type]);

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Reactivate subscription', () => {
  const cancelling = { ...SUB, cancelAt: new Date('2026-11-01T00:00:00.000Z') };

  it('says it was reactivated when the request reactivated it', async () => {
    mockCancelResponse = () => new Response(JSON.stringify({ id: 'x' }));
    const host = await render(cancelling);

    await click(host, 'Reactivate subscription');

    expect(toasts()).toEqual([
      ['Subscription reactivated successfully', 'success'],
    ]);
  });

  it('says so when the click set an active subscription to cancel instead', async () => {
    mockCancelResponse = () =>
      new Response(
        JSON.stringify({ id: 'x', cancel_at: '2026-11-01T00:00:00.000Z' })
      );
    const host = await render(cancelling);

    await click(host, 'Reactivate subscription');

    expect(toasts()).toEqual([
      [
        'Your subscription was already active, so it is now set to cancel. Click Reactivate subscription again to keep it.',
        'warning',
      ],
    ]);
  });

  it('shows an error and keeps the page as it was when the request is refused', async () => {
    mockCancelResponse = () =>
      new Response(
        JSON.stringify({ message: 'No active subscription found' }),
        {
          status: 400,
        }
      );
    const host = await render(cancelling);

    await click(host, 'Reactivate subscription');

    expect(toasts()).toEqual([
      [
        'Your subscription could not be changed. Please try again, or contact support if this keeps happening.',
        'warning',
      ],
    ]);
    expect(host.textContent).toContain('Reactivate subscription');
  });
});

describe('Cancel subscription', () => {
  it('says it was set to cancel when the request set it to cancel', async () => {
    mockCancelResponse = () =>
      new Response(
        JSON.stringify({ id: 'x', cancel_at: '2026-11-01T00:00:00.000Z' })
      );
    const host = await render(SUB);

    await click(host, 'Cancel subscription');

    expect(toasts()).toEqual([
      ['Subscription set to canceled successfully', 'success'],
    ]);
    expect(host.textContent).toContain('Your subscription will be canceled at');
  });

  it('says so when the click reactivated a subscription already set to cancel', async () => {
    mockCancelResponse = () => new Response(JSON.stringify({ id: 'x' }));
    const host = await render(SUB);

    await click(host, 'Cancel subscription');

    expect(toasts()).toEqual([
      [
        'Your subscription was already set to cancel, so it has been reactivated. Click Cancel subscription again to cancel it.',
        'warning',
      ],
    ]);
  });

  // A comped plan has no Stripe subscription, so the server refuses with a 400.
  it('shows an error and never a success when the request is refused', async () => {
    mockCancelResponse = () =>
      new Response(
        JSON.stringify({ message: 'No active subscription found' }),
        {
          status: 400,
        }
      );
    const host = await render(SUB);

    await click(host, 'Cancel subscription');

    expect(toasts()).toEqual([
      [
        'Your subscription could not be changed. Please try again, or contact support if this keeps happening.',
        'warning',
      ],
    ]);
    expect(host.textContent).not.toContain(
      'Your subscription will be canceled at'
    );
  });
});
