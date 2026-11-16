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
const dialog = jest.fn(async (_message: string, _confirm: string) => confirmed);
const variables = { isGeneral: true, isSecured: false };

jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: (message: string, confirm: string) => dialog(message, confirm),
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

import {
  LogoutComponent,
  useLogout,
} from '@gitroom/frontend/components/layout/logout.component';

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

// LogoutComponent keeps drawing exactly what it drew before Log out became a
// hook other menus can call (spec 059): the sentence in its error colour, and
// the glyph alone in its touch box.
describe('LogoutComponent markup', () => {
  it('renders the text variant as today', () => {
    expect(render(false).innerHTML).toBe(
      '<div class="cursor-pointer coarse:min-h-[44px] coarse:flex coarse:items-center">' +
        '<span class="text-error">Logout from Sharek</span></div>'
    );
  });

  it('renders the icon variant as today', () => {
    const box = target(render(true));
    expect(box.className).toBe(
      'cursor-pointer coarse:min-h-[44px] coarse:flex coarse:items-center coarse:min-w-[44px] coarse:justify-center'
    );
    expect(box.children).toHaveLength(1);
    expect(box.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });
});

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

// The app's tooltip does not show on a touch screen, so the icon variant
// carries the name the tooltip used to give it; the text variant reads its own.
describe('LogoutComponent name', () => {
  it('names the icon variant', () => {
    expect(target(render(true)).getAttribute('aria-label')).toBe(
      'Logout from Sharek'
    );
  });

  it('leaves the text variant to its text', () => {
    expect(target(render(false)).getAttribute('aria-label')).toBeNull();
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

// The arrow is drawn on its own 25 by 24 grid at 24px, and it carries the
// tooltip that names it on a pointer screen (spec 059).
describe('LogoutComponent glyph', () => {
  it('draws the icon variant 24px on its 25 by 24 grid, with its tooltip', () => {
    const svg = render(true).querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 25 24');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
    expect(svg?.getAttribute('class')).toContain('rtl:-scale-x-100');
    expect(svg?.getAttribute('data-tooltip-id')).toBe('tooltip');
    expect(svg?.getAttribute('data-tooltip-content')).toBe(
      'Logout from Sharek'
    );
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
    dialog.mockClear();
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

  // The callback LogoutComponent runs, as a hook, so another menu can draw its
  // own Log out row and keep the same confirmation (spec 059, the Settings
  // menu's foot). A probe holds what the hook returns.
  describe('useLogout', () => {
    const hook = () => {
      let logout: (() => Promise<void>) | undefined;
      const Probe = () => {
        logout = useLogout();
        return null;
      };
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);
      mounted.push(root);
      act(() => {
        root.render(<Probe />);
      });
      if (!logout) throw new Error('useLogout returned nothing');
      return logout;
    };

    it('asks for confirmation, then logs out', async () => {
      const logout = hook();
      expect(dialog).not.toHaveBeenCalled();

      await act(() => logout());

      expect(dialog).toHaveBeenCalledTimes(1);
      expect(dialog).toHaveBeenCalledWith(
        'Are you sure you want to logout?',
        'Yes logout'
      );
      expect(request).toHaveBeenCalledWith('/user/logout', { method: 'POST' });
      expect(request.mock.invocationCallOrder[0]).toBeGreaterThan(
        dialog.mock.invocationCallOrder[0]
      );
      expect(reset).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe('/');
    });

    it('does nothing when the confirmation is refused', async () => {
      confirmed = false;
      const logout = hook();

      await act(() => logout());

      expect(dialog).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
      expect(reset).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
    });
  });
});
