// The billing page: the trunk's plan change, cancel and reactivation cases, on a harness that
// mocks what upstream's redesign reads (SWR's default export for the billing cycle, the invoice
// history, the 3D Secure hook, the feature hook, the cookies, the debounce and the timer), and
// the redesign's states.
import { act, ComponentProps, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

// What the feedback modal is opened with: the Info form it renders.
type OpenedModal = {
  children: ReactElement<{ proceed?: (feedback: string) => void }>;
};

// Returns the English default with its {{placeholders}} filled, so a case reads the sentence the
// customer reads, and remembers the key each sentence was asked for by.
const mockKeys = new Map<string, string>();
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, fallback: string, options?: Record<string, unknown>) => {
      const text = (fallback || '').replace(/{{(\w+)}}/g, (_m, name) =>
        String(options?.[name] ?? '')
      );
      mockKeys.set(text, key);
      return text;
    },
}));

const mockShow = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));

// Each case answers the endpoints it is about; anything else answers {}.
let mockRoutes: Record<string, () => Response | Promise<Response>> = {};
const mockFetch = jest.fn(async (url: string) =>
  mockRoutes[url] ? mockRoutes[url]() : new Response('{}')
);
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));

// The billing cycle reads the renewal date and the credits through SWR.
let mockSwrData: Record<string, unknown> = {};
const mockMutate = jest.fn();
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => ({ data: mockSwrData[key] }),
  useSWRConfig: () => ({ mutate: mockMutate }),
}));

// The cancel flow asks for feedback in a modal; the double answers it at once.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: ({ children }: OpenedModal) =>
      children.props.proceed?.('the feedback the customer typed in'),
    closeAll: jest.fn(),
  }),
}));
const mockDeleteDialog = jest.fn();
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => mockDeleteDialog(...args),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isGeneral: true, billingEnabled: true }),
}));
let mockUser: Record<string, unknown> = {};
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
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
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [''],
}));
// The prorate preview waits 500 ms and the confirmed-plan check polls once a second; both run at
// once here.
jest.mock('use-debounce', () => ({
  useDebouncedCallback: (fn: (...args: unknown[]) => unknown) => fn,
}));
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: () => Promise.resolve(),
}));
const mockPaymentAction = jest.fn();
jest.mock('@gitroom/frontend/components/billing/use.payment.action', () => ({
  usePaymentAction: () => mockPaymentAction,
}));
// Each card lists what Sharek's billingFeatures() gives its plan, labelled by key here; that
// first.billing renders those keys through t() is first.billing.component.spec.tsx's job.
jest.mock(
  '@gitroom/frontend/components/billing/first.billing.component',
  () => {
    const { billingFeatures } = jest.requireActual(
      '@gitroom/frontend/components/billing/billing.features'
    );
    const { pricing } = jest.requireActual(
      '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing'
    );
    return {
      useBillingFeatures: (tier: string) =>
        billingFeatures(pricing[tier]).map((feature: { key: string }) => ({
          key: feature.key,
          label: feature.key,
        })),
    };
  }
);
// Scenery: none of these take part in a plan change, a cancel or a reactivation.
jest.mock(
  '@gitroom/frontend/components/billing/billing.history.component',
  () => ({
    BillingHistory: () => null,
  })
);
jest.mock('@gitroom/frontend/components/billing/faq.component', () => ({
  FAQComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/billing/finish.trial', () => ({
  FinishTrial: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => null,
}));
jest.mock('@gitroom/react/form/textarea', () => ({ Textarea: () => null }));

import { MainBillingComponent } from '@gitroom/frontend/components/billing/main.billing.component';

type Sub = NonNullable<ComponentProps<typeof MainBillingComponent>['sub']>;

const subscription = (tier: string, extra: Record<string, unknown> = {}) =>
  ({
    id: 'subscription-row',
    subscriptionTier: tier,
    period: 'MONTHLY',
    totalChannels: 10,
    ...extra,
  } as unknown as Sub);
const SUB = subscription('STANDARD');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const mounted: Array<{ unmount: () => void }> = [];
// Upstream's handlers chain several awaits (the team list, the 3D Secure check, the confirmed
// plan); a few macrotask turns let each case read the settled page.
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};
const render = async (sub: Sub) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<MainBillingComponent sub={sub} />);
  });
  await flush();
  return host;
};
const press = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const click = async (host: HTMLElement, label: string) =>
  press(
    Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label
    )!
  );
// The plan card whose heading is `name` ("Team"). Walked up by class, since happy-dom's selector
// engine does not match a bracketed class such as rounded-[12px].
const card = (host: HTMLElement, name: string) => {
  let el: HTMLElement | null = Array.from(host.querySelectorAll('div')).find(
    (div) => div.textContent === name && div.children.length === 0
  )!;
  while (el && !el.classList.contains('rounded-[12px]')) {
    el = el.parentElement;
  }
  return el!;
};
// A billing period by the label its control starts with ("Yearly" carries its discount after it).
const period = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll('*')).find(
    (el) =>
      el.firstChild?.nodeName === '#text' && el.firstChild.textContent === label
  )!;
const toasts = () => mockShow.mock.calls.map(([text, type]) => [text, type]);
// The key a sentence on the page was asked for by; undefined for a literal, which reads English in
// every language.
const keyOf = (text: string) => mockKeys.get(text);
const classes = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('*')).map(
    (el) => el.getAttribute('class') || ''
  );

// Stands in for the old single /billing/cancel answer of the trunk's cases.
let mockCancelResponse: () => Response;

beforeEach(() => {
  mockKeys.clear();
  mockUser = { id: 'me', tier: { current: 'STANDARD' }, isTrailing: false };
  mockSwrData = {};
  mockDeleteDialog.mockResolvedValue(true);
  mockPaymentAction.mockResolvedValue({});
  mockRoutes = {
    '/billing/check-discount': () => json({ offerCoupon: false }),
    '/billing/cancel': () => mockCancelResponse(),
    '/billing/prorate': () => json({ price: 13.2 }),
  };
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('Reactivate subscription', () => {
  const cancelling = subscription('STANDARD', {
    cancelAt: new Date('2026-11-01T00:00:00.000Z'),
  });

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

  it('offers to keep the subscription in the interface language', async () => {
    mockDeleteDialog.mockResolvedValue(false);
    const host = await render(SUB);

    await click(host, 'Cancel subscription');

    expect(mockDeleteDialog.mock.calls[0][3]).toBe('No, keep it');
    expect(keyOf('No, keep it')).toBe('no_keep_subscription');
  });
});

describe('the plan cards', () => {
  it('fills the current plan with the brand colour and leaves the others on white cards', async () => {
    const host = await render(subscription('TEAM'));

    expect(card(host, 'Team').className).toContain('bg-brand');
    expect(card(host, 'Team').textContent).toContain('Active');
    for (const other of ['Standard', 'Pro', 'Ultimate']) {
      expect(card(host, other).className).toContain('bg-newBgColorInner');
      expect(card(host, other).className).not.toContain('bg-brand');
    }
  });

  it("lists Sharek's features on every card", async () => {
    const host = await render(subscription('TEAM'));

    expect(card(host, 'Standard').textContent).toContain(
      'billing_samy_ai_agent'
    );
    expect(card(host, 'Team').textContent).toContain(
      'billing_unlimited_team_members'
    );
    expect(card(host, 'Ultimate').textContent).toContain(
      'billing_priority_support_sla'
    );
    expect(host.textContent).not.toMatch(
      /billing_ai_copilots|billing_clipping/
    );
  });

  it('says Upgrade above the current plan and Downgrade below it', async () => {
    const host = await render(subscription('TEAM'));

    expect(card(host, 'Standard').querySelector('button')!.textContent).toBe(
      'Downgrade'
    );
    expect(card(host, 'Pro').querySelector('button')!.textContent).toBe(
      'Upgrade'
    );
    expect(card(host, 'Team').querySelector('button')!.textContent).toBe(
      'Current Plan'
    );
    expect(card(host, 'Team').querySelector('button')!.disabled).toBe(true);
  });

  it('shows four plans across, two on an iPad and one on a phone', async () => {
    const host = await render(SUB);
    const grid = card(host, 'Team').parentElement!;

    expect(grid.className).toMatch(/\bgrid-cols-4\b/);
    expect(grid.className).toContain('mobile:grid-cols-2');
    expect(grid.className).toContain('phone:grid-cols-1');
    expect(grid.className).not.toContain('tablet:');
  });

  it('keeps "Pay today" amounts in reading order', async () => {
    const host = await render(SUB);
    const amount = card(host, 'Pro').querySelector('bdi[dir="ltr"]');

    expect(amount?.textContent).toBe('$13.20');
  });
});

describe('the billing period', () => {
  it('is a pair of real buttons that say which period is shown', async () => {
    const host = await render(SUB);
    const [monthly, yearly] = Array.from(
      host.querySelectorAll('button[aria-pressed]')
    );

    expect(monthly.getAttribute('aria-pressed')).toBe('true');
    expect(yearly.textContent).toContain('20% Off');
    await press(yearly);
    expect(yearly.getAttribute('aria-pressed')).toBe('true');
    expect(monthly.getAttribute('aria-pressed')).toBe('false');
  });

  it('groups the thousands of a yearly price', async () => {
    const host = await render(SUB);

    await press(period(host, 'Yearly'));

    expect(card(host, 'Ultimate').textContent).toContain('$2,352');
  });

  it('offers a monthly subscriber the switch to yearly', async () => {
    const host = await render(SUB);

    await press(period(host, 'Yearly'));

    expect(card(host, 'Standard').querySelector('button')!.textContent).toBe(
      'Switch to yearly'
    );
  });
});

describe('a plan change', () => {
  it('shows an error and no success when the server refuses it', async () => {
    mockRoutes['/billing/subscribe'] = () => json({ message: 'refused' }, 400);
    const host = await render(SUB);

    await press(card(host, 'Pro').querySelector('button')!);

    expect(toasts()).toEqual([
      [
        'Your subscription could not be changed. Please try again, or contact support if this keeps happening.',
        'warning',
      ],
    ]);
    expect(
      keyOf(
        'Your subscription could not be changed. Please try again, or contact support if this keeps happening.'
      )
    ).toBe('subscription_change_failed');
    expect(card(host, 'Pro').querySelector('button')!.textContent).toBe(
      'Upgrade'
    );
  });

  it("runs the bank's 3D Secure check inside the page before it reports the new plan", async () => {
    mockRoutes['/billing/subscribe'] = () =>
      json({ requiresAction: true, clientSecret: 'pi_secret' });
    mockRoutes['/user/subscription'] = () =>
      json({ subscription: { subscriptionTier: 'PRO', period: 'MONTHLY' } });
    const host = await render(SUB);

    await press(card(host, 'Pro').querySelector('button')!);

    expect(mockPaymentAction).toHaveBeenCalledWith('pi_secret');
    expect(toasts()).toEqual([
      ['Subscription updated successfully', undefined],
    ]);
    expect(mockMutate).toHaveBeenCalledWith('/billing/invoices');
    expect(mockMutate).toHaveBeenCalledWith('/billing/renewal');
  });

  it('reports a declined 3D Secure check and keeps the plan', async () => {
    mockRoutes['/billing/subscribe'] = () =>
      json({ requiresAction: true, clientSecret: 'pi_secret' });
    mockPaymentAction.mockResolvedValue({ error: 'Your card was declined.' });
    const host = await render(SUB);

    await press(card(host, 'Pro').querySelector('button')!);

    expect(toasts()).toEqual([['Your card was declined.', 'warning']]);
    expect(card(host, 'Standard').querySelector('button')!.textContent).toBe(
      'Current Plan'
    );
  });

  // A declined charge without 3D Secure answers with the billing portal.
  it('asks for a new payment method when the charge is declined', async () => {
    mockRoutes['/billing/subscribe'] = () =>
      json({ portal: 'https://billing.stripe.com/p/session' });
    mockDeleteDialog.mockResolvedValue(false);
    const host = await render(SUB);

    await press(card(host, 'Pro').querySelector('button')!);

    expect(mockDeleteDialog).toHaveBeenCalledWith(
      'We could not charge your credit card, please update your payment method',
      'Update',
      'Payment Method Required'
    );
    expect(toasts()).toEqual([]);
  });

  it('says another account holds the subscription instead of charging', async () => {
    mockRoutes['/billing/subscribe'] = () => json({ blocked: true });
    const host = await render(SUB);

    await press(card(host, 'Pro').querySelector('button')!);

    expect(mockDeleteDialog.mock.calls[0][0]).toContain(
      'Another account with this email already has an active subscription'
    );
    expect(toasts()).toEqual([]);
  });
});

describe('the downgrade warning', () => {
  const downgrade = async (team: () => Response | Promise<Response>) => {
    mockRoutes['/settings/team'] = team;
    mockDeleteDialog.mockResolvedValue(false);
    const host = await render(subscription('TEAM'));
    await press(card(host, 'Standard').querySelector('button')!);
  };
  const WARNING =
    'Your team members will be disabled and lose access to your organization until you upgrade to a plan that includes team members again';

  it('says the other members will be disabled when there are any', async () => {
    await downgrade(() =>
      json({ users: [{ user: { id: 'me' } }, { user: { id: 'colleague' } }] })
    );

    expect(mockDeleteDialog).toHaveBeenCalledWith(WARNING, 'Yes, continue');
  });

  it('words the warning in the interface language', async () => {
    await downgrade(() =>
      json({ users: [{ user: { id: 'me' } }, { user: { id: 'colleague' } }] })
    );

    expect(keyOf(WARNING)).toBe('billing_team_members_will_be_disabled');
  });

  it('says nothing when the owner is the only member', async () => {
    await downgrade(() => json({ users: [{ user: { id: 'me' } }] }));

    expect(mockDeleteDialog).not.toHaveBeenCalled();
  });

  it('keeps the warning when the team list cannot be loaded', async () => {
    await downgrade(() => Promise.reject(new Error('offline')));

    expect(mockDeleteDialog).toHaveBeenCalledWith(WARNING, 'Yes, continue');
  });
});

describe('the billing cycle', () => {
  // noon UTC, so the date reads the same in every machine timezone
  const RENEWS = Date.UTC(2026, 10, 14, 12) / 1000;

  it("shows the AI images and videos left of the plan's totals, and no clipping row", async () => {
    mockSwrData = {
      '/billing/renewal': { renewsAt: RENEWS, trialing: false },
      '/copilot/credits?type=ai_images': { credits: 112 },
      '/copilot/credits?type=ai_videos': { credits: 9 },
      '/copilot/credits?type=clipping_minutes': { credits: 0 },
    };
    const host = await render(subscription('TEAM'));

    expect(host.textContent).toContain('Your plan renews on 14 Nov, 2026');
    expect(host.textContent).toContain('112 / 150');
    expect(host.textContent).toContain('9 / 15');
    expect(host.textContent).not.toContain('Clipping minutes');
  });

  it('says when the trial ends and the first payment is taken', async () => {
    mockUser = { ...mockUser, isTrailing: true };
    mockSwrData = { '/billing/renewal': { renewsAt: RENEWS, trialing: true } };
    const host = await render(subscription('TEAM'));

    expect(host.textContent).toContain(
      'Your free trial ends and your first payment is charged on 14 Nov, 2026'
    );
  });
});

describe('the renewal date with a zone chosen', () => {
  const ZONE = 'Asia/Tokyo';
  // 16:00 UTC on 31 October is already 1 November in Tokyo, and still 31 October on every machine
  // the gate uses
  const RENEWS = Date.UTC(2026, 9, 31, 16) / 1000;

  beforeEach(() => {
    mockSwrData = { '/billing/renewal': { renewsAt: RENEWS, trialing: false } };
  });
  afterEach(() => setUserTimezone(null));

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('is the day in the zone', async () => {
    setUserTimezone(ZONE);
    const host = await render(subscription('TEAM'));

    expect(host.textContent).toContain('Your plan renews on 1 Nov, 2026');
  });

  it("is the day in the browser's zone on Automatic", async () => {
    const host = await render(subscription('TEAM'));

    expect(host.textContent).toContain('Your plan renews on 31 Oct, 2026');
  });
});

describe('ending the trial early', () => {
  // The charge is stated before the user confirms.
  it('says what it charges before it starts', async () => {
    mockUser = { ...mockUser, isTrailing: true };
    mockDeleteDialog.mockResolvedValue(false);
    const host = await render(subscription('TEAM'));

    await click(host, 'Finish trial');

    expect(mockDeleteDialog).toHaveBeenCalledWith(
      "Ending the trial charges your plan's first payment today instead of at the end of the trial. Nothing extra is added. Continue?",
      'End trial and pay now',
      'Trial'
    );
  });

  it('is offered only during a trial', async () => {
    const host = await render(subscription('TEAM'));

    expect(host.textContent).not.toContain('Finish trial');
  });
});

describe("Sharek's style", () => {
  const FORBIDDEN =
    /#[0-9a-f]{6}|\b(bg|text|border|from|to|shadow)-(red|green|amber|yellow|purple|pink|fuchsia|violet)-\d{3}|\bseventh\b|btnPrimary|(brand|success|warning|error)\/\d+/i;

  it.each([
    ['paying', subscription('TEAM')],
    [
      'cancelled',
      subscription('TEAM', { cancelAt: new Date('2026-11-01T00:00:00Z') }),
    ],
  ])(
    'uses no purple, magenta, pink or stock palette class (%s)',
    async (_state, sub) => {
      mockSwrData = {
        '/copilot/credits?type=ai_images': { credits: 1 },
        '/copilot/credits?type=ai_videos': { credits: 1 },
      };
      const host = await render(sub);

      expect(classes(host).filter((c) => FORBIDDEN.test(c))).toEqual([]);
    }
  );

  it('gives every button a focus ring', async () => {
    mockUser = { ...mockUser, isTrailing: true };
    const host = await render(subscription('TEAM'));
    const buttons = Array.from(host.querySelectorAll('button'));

    expect(buttons.length).toBeGreaterThan(6);
    expect(
      buttons.filter((b) => !b.className.includes('focus-visible:ring-2'))
    ).toEqual([]);
  });

  it("draws the cancellation notice in Sharek's warning tint", async () => {
    const host = await render(
      subscription('TEAM', { cancelAt: new Date('2026-11-01T00:00:00Z') })
    );
    const notice = Array.from(host.querySelectorAll('div')).find((el) =>
      el.className.includes('var(--warning)')
    );

    expect(notice?.textContent).toContain(
      'Your subscription will be canceled at'
    );
  });

  // On an iPad the trial's payment card holds three buttons. Beside the text they squeezed it to a
  // word per line, since the text column shrinks to its longest word and the row never wraps, so
  // from the iPad breakpoint the card wraps and the buttons take a line of their own, at its end.
  it("puts the payment card's buttons under its text on an iPad", async () => {
    mockUser = { ...mockUser, isTrailing: true };
    const host = await render(subscription('TEAM'));
    const row = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Update payment method'
    )!.parentElement!;

    expect(row.parentElement!.className.split(/\s+/)).toContain(
      'mobile:flex-wrap'
    );
    expect(row.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['mobile:basis-full', 'flex-wrap', 'justify-end'])
    );
  });
});
