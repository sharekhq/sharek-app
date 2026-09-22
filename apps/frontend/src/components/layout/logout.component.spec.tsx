import { act } from 'react';
import { createRoot } from 'react-dom/client';

// For the first cases the seam is the className, so everything the component
// reaches for on the way to rendering is stubbed. What they test is which
// variant gets a touch target: the icon one is 24px of SVG and needs a floor,
// the text one is as wide as its sentence and must not gain one, because
// widening it would push the rest of a row that is already tight.
const request = jest.fn();
const reset = jest.fn();
let confirmed = false;
const variables = { isGeneral: true, isSecured: false };

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => confirmed,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/layout/layout.context', () => ({
  setCookie: () => {},
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/helpers/posthog', () => ({
  resetAnalyticsIdentity: () => reset(),
}));

import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = (isIcon?: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<LogoutComponent isIcon={isIcon} />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

// The clickable element is the outer div; the SVG or the span sits inside it.
const target = (host: HTMLElement) => {
  const el = host.querySelector('div');
  if (!el) throw new Error('no logout target');
  return el;
};

describe('LogoutComponent touch target', () => {
  // Measured on the deployed paywall header at 390px under a forced coarse
  // pointer: 24x44, while mode, language, feedback and developer all read
  // 44x44. min-h was there; min-w was not.
  it('gives the icon variant a 44px floor on both axes', () => {
    const cls = target(render(true)).className;
    expect(cls).toContain('coarse:min-w-[44px]');
    expect(cls).toContain('coarse:min-h-[44px]');
    // Without this the 24px glyph sits against the inline-start edge of a 44px
    // box, so the target grows but the icon does not look centred in it.
    expect(cls).toContain('coarse:justify-center');
  });

  // The paywall header is the only isIcon call site; every other one renders the
  // sentence, which is already wider than 44px and shares a row with nothing.
  it('leaves the text variant without a width floor', () => {
    const cls = target(render(false)).className;
    expect(cls).not.toContain('coarse:min-w-[44px]');
    expect(cls).toContain('coarse:min-h-[44px]');
  });
});

describe('LogoutComponent direction', () => {
  const glyph = (host: HTMLElement) => {
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('no logout glyph');
    return svg.getAttribute('class') || '';
  };

  // The glyph is an arrow leaving through a bar. It points at the edge the
  // reader exits towards, so under `dir="rtl"` — where the control itself moves
  // to the other end of the header — it has to point the other way. A mirror,
  // not a rotation: `rtl:-scale-x-100` is the form already used at
  // limit.reached.modal.tsx for the same reason.
  it('mirrors the icon under rtl', () => {
    expect(glyph(render(true))).toContain('rtl:-scale-x-100');
  });

  // The text variant has no arrow to mirror, and flipping a span would reverse
  // the sentence inside it.
  it('leaves the text variant unmirrored', () => {
    const host = render(false);
    expect(host.querySelector('svg')).toBeNull();
    expect(host.innerHTML).not.toContain('-scale-x-100');
  });
});

// Signing out drives the stubs above: the dialog's answer, the logout request
// and the navigation it ends with, which is observed rather than performed.
describe('LogoutComponent sign-out', () => {
  const location = window.location;

  // The handler awaits the dialog and the logout request before it navigates.
  const click = async (element: Element) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };

  beforeEach(() => {
    confirmed = true;
    variables.isSecured = true;
    request.mockReset().mockResolvedValue({ status: 200 });
    reset.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    confirmed = false;
    variables.isSecured = false;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
  });

  it('resets the analytics identity before leaving the app', async () => {
    let hrefAtReset: string | undefined;
    reset.mockImplementation(() => {
      hrefAtReset = window.location.href;
    });

    await click(target(render()));

    expect(request).toHaveBeenCalledWith('/user/logout', { method: 'POST' });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(hrefAtReset).toBe('');
    expect(window.location.href).toBe('/');
  });

  it('leaves everything alone when the dialog is cancelled', async () => {
    confirmed = false;

    await click(target(render()));

    expect(reset).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});
