import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

const request = jest.fn();
const reset = jest.fn();
const toast = jest.fn();
let confirmed = true;

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => confirmed,
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

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

// The handler awaits the dialog and the deletion request before it navigates.
const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

// Navigation is observed, not performed.
const location = window.location;

beforeEach(() => {
  confirmed = true;
  request.mockReset().mockResolvedValue({ status: 200 });
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
    request.mockResolvedValue({
      status: 500,
      json: async () => ({ message: 'x' }),
    });
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(toast).toHaveBeenCalledWith('x', 'warning');
    expect(reset).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });

  it('leaves everything alone when the dialog is cancelled', async () => {
    confirmed = false;
    const host = await render(<DeleteAccountComponent />);

    await click(host.querySelector('button')!);

    expect(request).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});
