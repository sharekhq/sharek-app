import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The request interceptor is what signs a session out when the API says so.
// It is captured from the fetch wrapper and handed responses directly; the
// navigation it ends with is observed rather than performed.
type AfterRequest = (
  url: string,
  options: RequestInit,
  response: Response
) => Promise<boolean>;
let afterRequest: AfterRequest;
const reset = jest.fn();
const variables = { backendUrl: '', isGeneral: true, isSecured: true };

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  FetchWrapperComponent: (props: {
    afterRequest: AfterRequest;
    children: ReactNode;
  }) => {
    afterRequest = props.afterRequest;
    return props.children;
  },
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/react/helpers/posthog', () => ({
  resetAnalyticsIdentity: () => reset(),
}));
// Scenery: reached only by rendering, or by the trial and limit branches.
jest.mock('@mantine/core', () => ({
  MantineProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/billing/limit.reached.modal', () => ({
  showLimitReachedModal: jest.fn(),
}));
jest.mock('@gitroom/frontend/app/(app)/auth/return.url.component', () => ({
  useReturnUrl: () => ({ getAndClear: () => null }),
}));

import LayoutContext from '@gitroom/frontend/components/layout/layout.context';

const mounted: Array<{ unmount: () => void }> = [];
const location = window.location;

const intercept = async (response: Response) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <LayoutContext>
        <div />
      </LayoutContext>
    );
  });
  await act(async () => {
    await afterRequest('/user/self', {}, response);
  });
};

beforeEach(() => {
  variables.isSecured = true;
  reset.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: 'http://localhost/launches', pathname: '/launches' },
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

describe('the request interceptor signing a session out', () => {
  it('resets the analytics identity before leaving on a 401', async () => {
    let hrefAtReset: string | undefined;
    reset.mockImplementation(() => {
      hrefAtReset = window.location.href;
    });

    await intercept(new Response(null, { status: 401 }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(hrefAtReset).toBe('http://localhost/launches');
    expect(window.location.href).toBe('/');
  });

  it('resets the analytics identity when a non-secured install is told to log out', async () => {
    variables.isSecured = false;
    let hrefAtReset: string | undefined;
    reset.mockImplementation(() => {
      hrefAtReset = window.location.href;
    });

    await intercept(
      new Response(null, { status: 200, headers: { logout: 'true' } })
    );

    expect(reset).toHaveBeenCalledTimes(1);
    expect(hrefAtReset).toBe('http://localhost/launches');
    expect(window.location.href).toBe('/');
  });

  it('keeps the identity on an ordinary response', async () => {
    await intercept(new Response('{}', { status: 200 }));

    expect(reset).not.toHaveBeenCalled();
    expect(window.location.href).toBe('http://localhost/launches');
  });
});
