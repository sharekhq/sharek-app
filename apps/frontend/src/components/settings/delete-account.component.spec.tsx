// Deleting the account: the confirmation reads the account at the click and names what else goes
// (the subscription, the other members), and only a confirmed deletion that succeeds resets the
// analytics identity and leaves the app.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig } from 'swr';

type Info = { hasSubscription: boolean; hasAdditionalMembers: boolean };
let info: Info | Error = {
  hasSubscription: false,
  hasAdditionalMembers: false,
};
let deletion: { status: number; json?: () => Promise<unknown> } = {
  status: 200,
};
const request = jest.fn(async (url: string) => {
  if (url === '/user/delete-account-info') {
    if (info instanceof Error) throw info;
    const answer = info;
    return { status: 200, json: async () => answer };
  }
  return deletion;
});
const reset = jest.fn();
const toast = jest.fn();
const dialog = jest.fn<Promise<boolean>, unknown[]>(async () => true);

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (...args: unknown[]) => dialog(...args),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ isSecured: true }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: toast }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/react/helpers/posthog', () => ({
  resetAnalyticsIdentity: () => reset(),
}));
// Scenery: setCookie's module is the whole request interceptor.
jest.mock('@gitroom/frontend/components/layout/layout.context', () => ({
  setCookie: jest.fn(),
}));

import DeleteAccountComponent from '@gitroom/frontend/components/settings/delete-account.component';

const mounted: Array<{ unmount: () => void }> = [];

// A fresh SWR cache per render, so one case's account info never answers the next; no retry
// timers after a failed read. SWR 2.4.1's bound mutate() catches a failed fetcher and resolves
// to the cached data, so the click still reaches the dialog.
const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          dedupingInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        {element}
      </SWRConfig>
    );
  });
  return host;
};

// The handler awaits the account info, the dialog and the deletion request before it navigates.
const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  for (let i = 0; i < 3; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  }
};
const deletionRequests = () =>
  request.mock.calls.filter(([url]) => url === '/user/delete-account');

// Navigation is observed, not performed.
const location = window.location;

beforeEach(() => {
  info = { hasSubscription: false, hasAdditionalMembers: false };
  deletion = { status: 200 };
  request.mockClear();
  dialog.mockClear().mockResolvedValue(true);
  reset.mockReset();
  toast.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: location,
  });
});

describe('deleting the account', () => {
  it('resets the analytics identity before leaving the app', async () => {
    let hrefAtReset: string | undefined;
    reset.mockImplementation(() => {
      hrefAtReset = window.location.href;
    });
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(request).toHaveBeenCalledWith('/user/delete-account', {
      method: 'POST',
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(hrefAtReset).toBe('');
    expect(window.location.href).toBe('/');
  });

  it('keeps the identity when the deletion fails', async () => {
    deletion = { status: 500, json: async () => ({ message: 'x' }) };
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(toast).toHaveBeenCalledWith('x', 'warning');
    expect(reset).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });

  it('leaves everything alone when the dialog is cancelled', async () => {
    dialog.mockResolvedValue(false);
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(deletionRequests()).toEqual([]);
    expect(reset).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});

describe('the confirmation says what else goes', () => {
  it.each([
    [
      'the subscription and the other members',
      { hasSubscription: true, hasAdditionalMembers: true },
      'Your account, organizations, channels and posts will be deleted, your subscription will be cancelled and the additional team members will be removed from your organization. This action cannot be undone, are you sure?',
    ],
    [
      'the subscription',
      { hasSubscription: true, hasAdditionalMembers: false },
      'Your account, organizations, channels and posts will be deleted and your subscription will be cancelled. This action cannot be undone, are you sure?',
    ],
    [
      'the other members',
      { hasSubscription: false, hasAdditionalMembers: true },
      'Your account, organizations, channels and posts will be deleted and the additional team members will be removed from your organization. This action cannot be undone, are you sure?',
    ],
    [
      'nothing else',
      { hasSubscription: false, hasAdditionalMembers: false },
      'Your account, organizations, channels and posts will be deleted. This action cannot be undone, are you sure?',
    ],
  ])('names %s', async (_what, accountInfo, sentence) => {
    info = accountInfo;
    dialog.mockResolvedValue(false);
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(dialog).toHaveBeenCalledWith(sentence, 'Yes, delete my account');
  });

  // The read is fresh at the click, not the mount's.
  it('reads the account again when the button is pressed', async () => {
    const host = await render(<DeleteAccountComponent />);
    info = { hasSubscription: true, hasAdditionalMembers: false };
    dialog.mockResolvedValue(false);

    await click(host.querySelector('button')!);

    expect(dialog.mock.calls[0][0]).toContain(
      'your subscription will be cancelled'
    );
  });

  it('still asks, plainly, when the account cannot be read', async () => {
    info = new Error('offline');
    dialog.mockResolvedValue(false);
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(dialog).toHaveBeenCalledWith(
      'Your account, organizations, channels and posts will be deleted. This action cannot be undone, are you sure?',
      'Yes, delete my account'
    );
  });
});
