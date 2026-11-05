// The page a customer lands on after checkout. It waits behind a spinner until
// the server says how the checkout ended, so an answer it never gets, or one it
// ignores, leaves them there for good.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
let mockSearch = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearch,
}));
const mockModalOpen = jest.fn();
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: mockModalOpen }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
// The real wait is a second per poll.
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: () => Promise.resolve(),
}));

import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';

const answer = (status: number) =>
  Promise.resolve(new Response(JSON.stringify({ status })));

const mounted: Array<{ unmount: () => void }> = [];
const render = async (mutate: () => void = jest.fn()) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  await act(async () => {
    root.render(
      <CheckPayment check="v0R882f9Rs" mutate={mutate}>
        <main>the app</main>
      </CheckPayment>
    );
  });
  return container;
};

beforeEach(() => {
  mockSearch = new URLSearchParams();
  mockFetch.mockReset().mockImplementation(() => answer(2));
  mockModalOpen.mockReset();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
});

describe('CheckPayment', () => {
  it('asks about the session Stripe named on the return url', async () => {
    mockSearch = new URLSearchParams('check=v0R882f9Rs&session=cs_live_a1b2c3');

    await render();

    expect(mockFetch).toHaveBeenCalledWith(
      '/billing/check/v0R882f9Rs?session=cs_live_a1b2c3'
    );
  });

  // A session opened before this shipped comes back with no session in its url.
  it('asks without a session when the url names none', async () => {
    mockSearch = new URLSearchParams('check=v0R882f9Rs');

    await render();

    expect(mockFetch).toHaveBeenCalledWith('/billing/check/v0R882f9Rs');
  });

  it('tells the customer and lets them back in when the checkout did not finish', async () => {
    mockFetch.mockImplementation(() => answer(1));

    const container = await render();

    expect(mockModalOpen).toHaveBeenCalledTimes(1);
    expect(mockModalOpen.mock.calls[0][0].title).toBe('invalid_payment');
    expect(container.textContent).toContain('the app');
  });

  it('keeps waiting while the webhook is on its way, then opens the app', async () => {
    mockSearch = new URLSearchParams('check=v0R882f9Rs&session=cs_live_a1b2c3');
    mockFetch
      .mockImplementationOnce(() => answer(0))
      .mockImplementationOnce(() => answer(0))
      .mockImplementation(() => answer(2));
    const mutate = jest.fn();

    const container = await render(mutate);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenLastCalledWith(
      '/billing/check/v0R882f9Rs?session=cs_live_a1b2c3'
    );
    expect(mockModalOpen).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('the app');
  });
});
