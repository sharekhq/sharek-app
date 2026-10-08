import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
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
jest.mock('@stripe/stripe-js', () => ({
  loadStripe: () => new Promise(() => undefined),
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

import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';

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
