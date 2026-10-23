// The invoice history icon in the header and the paywall: it opens the history in a window, for
// the people who manage billing on a hosted install.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
const mockVariables = { billingEnabled: true, isGeneral: true };
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
let mockRole = 'ADMIN';
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ role: mockRole }),
}));
const mockOpenModal = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: mockOpenModal }),
}));
jest.mock(
  '@gitroom/frontend/components/billing/billing.history.component',
  () => ({
    BillingHistory: () => null,
  })
);

import { InvoicesComponent } from '@gitroom/frontend/components/layout/invoices.component';
import { BillingHistory } from '@gitroom/frontend/components/billing/billing.history.component';

const mounted: Array<{ unmount: () => void }> = [];
const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<InvoicesComponent />);
  });
  return host;
};

beforeEach(() => {
  mockRole = 'ADMIN';
  Object.assign(mockVariables, { billingEnabled: true, isGeneral: true });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('the invoice history icon in the header and the paywall', () => {
  it('opens the invoice history in a window', async () => {
    const host = await render();

    await act(async () => {
      (
        host.querySelector(
          '[data-tooltip-content="Billing History"]'
        ) as HTMLElement
      ).click();
    });

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const opened = mockOpenModal.mock.calls[0][0];
    expect(opened.title).toBe('Billing History');
    expect(opened.size).toBe('1000px');
    expect(opened.children.type).toBe(BillingHistory);
    expect(opened.children.props.modal).toBe(true);
  });

  it.each([
    ['the User role', () => (mockRole = 'USER')],
    [
      'an install without billing',
      () => (mockVariables.billingEnabled = false),
    ],
    ['a self-hosted install', () => (mockVariables.isGeneral = false)],
  ])('is not shown to %s', async (_who, arrange) => {
    arrange();
    const host = await render();

    expect(host.innerHTML).toBe('');
  });
});
