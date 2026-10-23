import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// A row with a value comes back as key:value, so the feature rows can be read back; everything
// else reads its fallback.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string, options?: { value?: string }) =>
    options?.value !== undefined ? `${key}:${options.value}` : fallback,
}));

// What /billing/embedded answers is the whole question here, and SWR is where
// the component reads it.
let mockEmbedded: Record<string, unknown> = {};
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: mockEmbedded, isLoading: false }),
  useSWRConfig: () => ({ mutate: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
const mockLoadStripe = jest.fn<Promise<never>, unknown[]>(
  () => new Promise(() => undefined)
);
jest.mock('@stripe/stripe-js', () => ({
  loadStripe: (...args: unknown[]) => mockLoadStripe(...args),
}));
// The interface language, which the paywall reads for Stripe's locale and the tutorial video.
let mockLanguage = 'ar';
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    get resolvedLanguage() {
      return mockLanguage;
    },
  },
}));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ stripeClient: 'pk_test' }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { current: 'FREE' } }),
}));
jest.mock('@gitroom/frontend/components/layout/dubAnalytics', () => ({
  useDubClickId: () => undefined,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: jest.fn() }),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [''],
}));
jest.mock('@gitroom/frontend/components/billing/use.channel.catalogue', () => ({
  SHOWN_CHANNELS: [],
  useChannelCatalogue: () => ({ remainder: 0 }),
}));
// Scenery around the checkout column.
jest.mock('@gitroom/frontend/components/layout/organization.selector', () => ({
  OrganizationSelector: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/language.component', () => ({
  LanguageComponent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-layout/sentry.feedback.component',
  () => ({
    AttachToFeedbackIcon: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/notifications/notification.component',
  () => ({
    __esModule: true,
    default: () => null,
  })
);
jest.mock('@gitroom/frontend/components/ui/logo-text.component', () => ({
  LogoTextComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/developer/developer.icon.component',
  () => ({
    DeveloperIconComponent: () => null,
  })
);
jest.mock('@gitroom/frontend/components/billing/faq.component', () => ({
  FAQComponent: () => null,
  FAQSection: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/invoices.component', () => ({
  InvoicesComponent: () => <span data-testid="invoices-icon" />,
}));

import { billingFeatures } from '@gitroom/frontend/components/billing/billing.features';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  FirstBillingComponent,
  useBillingFeatures,
} from '@gitroom/frontend/components/billing/first.billing.component';

const mounted: Array<{ unmount: () => void }> = [];
const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<FirstBillingComponent />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('a refused checkout', () => {
  it('says the subscription is already active when this organization already has one', async () => {
    mockEmbedded = { blocked: true, alreadySubscribed: true };
    const host = await render();

    expect(host.textContent).toContain(
      'Your subscription is already active. Please refresh the page in a moment.'
    );
    expect(host.textContent).not.toContain('Another account with this email');
  });

  it('still points to the other account when another login holds the subscription', async () => {
    mockEmbedded = { blocked: true };
    const host = await render();

    expect(host.textContent).toContain('Another account with this email');
    expect(host.textContent).not.toContain('already active');
  });
});

describe('the paywall', () => {
  it('loads Stripe.js in the interface language', async () => {
    mockLanguage = 'ar';
    await render();

    expect(mockLoadStripe).toHaveBeenCalledWith('pk_test', { locale: 'ar' });
  });

  it('carries the invoice history icon in its header', async () => {
    mockEmbedded = {};
    const host = await render();

    expect(host.querySelector('[data-testid="invoices-icon"]')).not.toBeNull();
  });
});

describe("the plans' feature rows", () => {
  let rows: Array<{ key: string; label: string }> = [];
  const Rows = ({ tier }: { tier: string }): null => {
    const features = useBillingFeatures(tier);
    useEffect(() => {
      rows = features;
    }, [features]);
    return null;
  };

  // The billing page's cards read the same hook, so this is Sharek's list there too.
  it.each(['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'])(
    "are Sharek's billingFeatures() for %s, through t(key, default, feature)",
    async (tier) => {
      const host = document.createElement('div');
      const root = createRoot(host);
      mounted.push(root);
      await act(async () => {
        root.render(<Rows tier={tier} />);
      });

      const expected = billingFeatures(pricing[tier]);
      expect(rows.map((row) => row.key)).toEqual(expected.map((f) => f.key));
      expect(rows.map((row) => row.label)).toEqual(
        expected.map((f) =>
          f.value !== undefined ? `${f.key}:${f.value}` : f.defaultValue
        )
      );
    }
  );

  // Upstream's glue rendered "Unlimited posts per month" and "AI copilots"; Sharek's list never
  // names them.
  it("never lists upstream's retired rows", async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<Rows tier="PRO" />);
    });

    expect(rows.map((row) => row.key)).not.toEqual(
      expect.arrayContaining(['billing_ai_copilots'])
    );
    expect(rows.map((row) => row.label).join(' ')).not.toMatch(
      /Unlimited posts per month/
    );
  });
});
