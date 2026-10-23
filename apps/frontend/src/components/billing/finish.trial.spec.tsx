// Ending the trial early: the charge, the bank's 3D Secure check inside the page, a declined card
// and a payment form that fails to load, and the window's own controls.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Returns the key, so a case can tell a keyed sentence from upstream's raw English.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
const mockShow = jest.fn();
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));
let mockRoutes: Record<string, () => unknown> = {};
const mockFetch = jest.fn(async (url: string) => ({
  json: async () => (mockRoutes[url] ? mockRoutes[url]() : {}),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: () => Promise.resolve(),
}));
const mockPaymentAction = jest.fn();
jest.mock('@gitroom/frontend/components/billing/use.payment.action', () => ({
  usePaymentAction: () => mockPaymentAction,
}));
// Scenery.
jest.mock(
  '@gitroom/frontend/components/launches/helpers/top.title.component',
  () => ({
    TopTitle: ({ title }: { title: string }) => <div>{title}</div>,
  })
);
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>loading</div>,
}));

import { FinishTrial } from '@gitroom/frontend/components/billing/finish.trial';

const close = jest.fn();
const mounted: Array<{ unmount: () => void }> = [];
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};
const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  await flush();
  return host;
};
const button = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label
  )!;
const posts = () =>
  mockFetch.mock.calls.filter(([url]) => url === '/billing/finish-trial');

beforeEach(() => {
  mockRoutes = {
    '/billing/finish-trial': () => ({ finish: true }),
    '/billing/is-trial-finished': () => ({ finished: true }),
  };
  mockPaymentAction.mockResolvedValue({});
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('ending the trial early', () => {
  it("says the trial ended and the plan's first payment was charged", async () => {
    const host = await render(<FinishTrial close={close} />);

    expect(host.textContent).toContain('trial_ended_first_payment_charged');
  });

  it("runs the bank's 3D Secure check inside the page when the bank asks for it", async () => {
    mockRoutes['/billing/finish-trial'] = () => ({
      finish: false,
      requiresAction: true,
      clientSecret: 'pi_secret',
    });
    await render(<FinishTrial close={close} />);

    expect(mockPaymentAction).toHaveBeenCalledWith('pi_secret');
    expect(mockFetch).toHaveBeenCalledWith('/billing/is-trial-finished');
  });

  // A declined charge answers finish: false.
  it('reports a declined card and lets the user try again', async () => {
    mockRoutes['/billing/finish-trial'] = () => ({ finish: false });
    const host = await render(<FinishTrial close={close} />);

    expect(mockShow).toHaveBeenCalledWith('finish_trial_failed', 'warning');
    expect(host.textContent).toContain('finish_trial_failed_description');
    expect(host.textContent).not.toContain('loading');
    await act(async () => {
      button(host, 'try_again').click();
    });
    await flush();
    expect(posts()).toHaveLength(2);
  });

  // use.payment.action.spec.tsx pins the message itself.
  it('reports a payment form that fails to load instead of spinning', async () => {
    mockRoutes['/billing/finish-trial'] = () => ({
      finish: false,
      requiresAction: true,
      clientSecret: 'pi_secret',
    });
    mockPaymentAction.mockResolvedValue({
      error: 'billing_stripe_load_failed',
    });
    const host = await render(<FinishTrial close={close} />);

    expect(mockShow).toHaveBeenCalledWith(
      'billing_stripe_load_failed',
      'warning'
    );
    expect(host.textContent).toContain('try_again');
    expect(mockFetch).not.toHaveBeenCalledWith('/billing/is-trial-finished');
  });

  // The page opened from the 406 dialog is a new window; the billing page's is not.
  it('closes the dialog when it was not opened in a window of its own', async () => {
    const host = await render(<FinishTrial close={close} />);

    await act(async () => {
      button(host, 'close').click();
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("covers the page in Sharek's popup colour under a translated title", async () => {
    const host = await render(<FinishTrial close={close} />);
    const overlay = host.firstElementChild as HTMLElement;

    expect(overlay.className).toContain('bg-popup');
    expect(overlay.className).not.toMatch(/bg-primary\/80|bg-black\/50/);
    expect(host.textContent).toContain('finishing_trial');
  });

  // The box is 500px wide inside a 60px frame; on a phone it takes the screen's width instead of
  // running off both sides. Its wrapper is a flex item, which keeps the box's 500px as its minimum
  // width unless told otherwise.
  it('fits the dialog on a phone', async () => {
    const host = await render(<FinishTrial close={close} />);
    const overlay = host.firstElementChild as HTMLElement;
    const box = Array.from(host.querySelectorAll('div')).find((el) =>
      el.classList.contains('w-[500px]')
    )!;

    expect(box.className.split(/\s+/)).toContain('max-w-full');
    expect(box.parentElement!.className.split(/\s+/)).toContain('min-w-0');
    expect(overlay.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['p-[60px]', 'phone:p-[16px]'])
    );
  });
});
