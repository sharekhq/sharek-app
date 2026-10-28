// The app shell on small screens (≤1025px, Tailwind `mobile`): phones and iPads
// held upright share one shell with no rail, a 64px header and Sharek's drawer
// behind the menu button. The drawer locks the page, closes on Escape, the
// scrim and a tap inside it, is `inert` while it is closed, and moves focus in
// on open and back to the menu button on Escape and the scrim. At ≥1026px none
// of that runs, and the rail is never inert.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Scenery: everything the shell mounts around the parts under test.
const mockPassThrough = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);
const mockNothing = (): null => null;

jest.mock('@gitroom/frontend/app/fonts', () => ({
  fontVariables: 'font-variables-stub',
}));
jest.mock('@gitroom/frontend/components/new-layout/logo', () => ({
  Logo: () => null,
}));
// ModeComponent is the only dynamic import.
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => () => null,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
const mockVariables = {
  backendUrl: 'http://backend',
  billingEnabled: true,
  isGeneral: true,
  showUpstreamExtras: false,
};
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: {
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      tier: 'STANDARD',
      admin: false,
    },
    mutate: jest.fn(),
  }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/sentry/initialize.sentry.client', () => ({
  setSentryUser: jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/set.timezone', () => ({
  setUserTimezone: jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/check.payment', () => ({
  CheckPayment: mockPassThrough,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  ContextWrapper: mockPassThrough,
}));
jest.mock('@copilotkit/react-core', () => ({ CopilotKit: mockPassThrough }));
jest.mock('@gitroom/react/helpers/mantine.wrapper', () => ({
  MantineWrapper: mockPassThrough,
}));
// D-51 and D-62: one must stay mounted, the other must never come back.
jest.mock('@gitroom/react/helpers/posthog', () => ({
  PostHogIdentify: () => <span data-testid="posthog-identify" />,
}));
jest.mock('@gitroom/frontend/components/layout/invoices.component', () => ({
  InvoicesComponent: () => <span data-testid="invoices" />,
}));
// Two items, the second the current page unless a case says there is none.
let mockHasCurrentItem = true;
jest.mock('@gitroom/frontend/components/layout/top.menu', () => ({
  TopMenu: () => (
    <>
      <a href="/launches">Calendar</a>
      <a href="/media" aria-current={mockHasCurrentItem ? 'page' : undefined}>
        Media
      </a>
    </>
  ),
}));
jest.mock('@gitroom/frontend/components/layout/title', () => ({
  Title: () => <span data-testid="title">Calendar</span>,
}));
jest.mock('@gitroom/frontend/components/layout/streak.component', () => ({
  StreakComponent: () => <span data-testid="streak" />,
}));
jest.mock(
  '@gitroom/frontend/components/new-layout/sentry.feedback.component',
  () => ({ AttachToFeedbackIcon: () => <span data-testid="feedback" /> })
);
jest.mock(
  '@gitroom/frontend/components/layout/chrome.extension.component',
  () => ({ ChromeExtensionComponent: () => <span data-testid="chrome" /> })
);
jest.mock(
  '@gitroom/frontend/components/notifications/notification.component',
  () => ({
    __esModule: true,
    default: mockNothing,
  })
);
jest.mock('@gitroom/frontend/components/layout/top.tip', () => ({
  ToolTip: mockNothing,
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  ShowMediaBoxModal: mockNothing,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/linkedin.component',
  () => ({
    ShowLinkedinCompany: mockNothing,
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/media.settings.component',
  () => ({ MediaSettingsLayout: mockNothing })
);
jest.mock('@gitroom/react/toaster/toaster', () => ({ Toaster: mockNothing }));
jest.mock(
  '@gitroom/frontend/components/post-url-selector/post.url.selector',
  () => ({
    ShowPostSelector: mockNothing,
  })
);
jest.mock('@gitroom/frontend/components/layout/support', () => ({
  Support: mockNothing,
}));
jest.mock('@gitroom/frontend/components/layout/continue.provider', () => ({
  ContinueProvider: mockNothing,
}));
jest.mock('@gitroom/frontend/components/layout/impersonate', () => ({
  Impersonate: mockNothing,
}));
jest.mock('@gitroom/frontend/components/layout/announcement.banner', () => ({
  AnnouncementBanner: mockNothing,
}));
jest.mock('@gitroom/frontend/components/layout/language.component', () => ({
  LanguageComponent: mockNothing,
}));
jest.mock('@gitroom/frontend/components/layout/organization.selector', () => ({
  OrganizationSelector: mockNothing,
}));
jest.mock(
  '@gitroom/frontend/components/layout/pre-condition.component',
  () => ({
    PreConditionComponent: mockNothing,
  })
);
jest.mock(
  '@gitroom/frontend/components/billing/first.billing.component',
  () => ({
    FirstBillingComponent: mockNothing,
  })
);
jest.mock('@gitroom/frontend/components/layout/gtm.component', () => ({
  TrialTracker: mockNothing,
}));

import { LayoutComponent } from '@gitroom/frontend/components/new-layout/layout.component';

// The viewport the media queries answer for, and the listeners the shell
// registered, so a case can resize the window under an open drawer.
let width = 820;
const listeners = new Set<() => void>();
const matchesAt = (query: string) => {
  const max = /max-width:\s*(\d+)px/.exec(query);
  return !max || width <= +max[1];
};
const originalMatchMedia = window.matchMedia;

const resizeTo = async (next: number) => {
  width = next;
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <LayoutComponent>
        <div data-testid="page">
          <input data-testid="field" />
        </div>
      </LayoutComponent>
    );
  });

  const byTestId = (id: string) =>
    host.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const drawer = host.querySelector('#left-menu') as HTMLElement;
  const button = host.querySelector(
    'button[aria-controls="left-menu"]'
  ) as HTMLButtonElement;
  const row = drawer.parentElement as HTMLElement;
  const streakWrapper = byTestId('streak').parentElement as HTMLElement;

  return {
    host,
    drawer,
    button,
    header: button.parentElement as HTMLElement,
    // the page card: header and page, everything but the rail/drawer and scrim
    card: (button.parentElement as HTMLElement).parentElement as HTMLElement,
    field: byTestId('field') as HTMLInputElement,
    title: byTestId('title').parentElement as HTMLElement,
    iconGroup: streakWrapper.parentElement as HTMLElement,
    streakWrapper,
    streakSeparator: streakWrapper.nextElementSibling as HTMLElement,
    feedbackWrapper: byTestId('feedback').parentElement as HTMLElement,
    chromeWrapper: () => byTestId('chrome')?.parentElement as HTMLElement,
    pageWrapper: host.querySelector('.font-variables-stub') as HTMLElement,
    contentWrapper: byTestId('page').parentElement as HTMLElement,
    reserve: Array.from(row.children).find(
      (el) => el.id !== 'left-menu' && el.classList.contains('w-[84px]')
    ) as HTMLElement,
    scrim: () =>
      Array.from(row.children).find((el) =>
        el.classList.contains('inset-0')
      ) as HTMLElement | undefined,
    open: async () => {
      await act(async () => {
        button.click();
      });
    },
    escape: async () => {
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
      });
    },
  };
};

const classesOf = (el: Element) =>
  (el.getAttribute('class') ?? '').split(/\s+/);

beforeEach(() => {
  width = 820;
  mockHasCurrentItem = true;
  mockVariables.showUpstreamExtras = false;
  document.body.style.overflow = '';
  window.matchMedia = (query: string) =>
    ({
      media: query,
      get matches() {
        return matchesAt(query);
      },
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener);
      },
      addListener: (): undefined => undefined,
      removeListener: (): undefined => undefined,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  listeners.clear();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
  window.matchMedia = originalMatchMedia;
});

describe('the app shell', () => {
  it('renders the header with the page title', async () => {
    const shell = await mount();
    expect(shell.header.contains(shell.title)).toBe(true);
    expect(shell.title.textContent).toBe('Calendar');
  });

  it('keeps PostHog identification mounted and the invoices icon out (D-51, D-62)', async () => {
    const shell = await mount();
    expect(
      shell.host.querySelector('[data-testid="posthog-identify"]')
    ).not.toBeNull();
    expect(shell.host.querySelector('[data-testid="invoices"]')).toBeNull();
  });
});

describe('the drawer on a small screen (820px, iPad portrait)', () => {
  it('opens from the menu button, slides in and locks the page', async () => {
    const shell = await mount();
    await shell.open();

    expect(shell.button.getAttribute('aria-expanded')).toBe('true');
    expect(classesOf(shell.drawer)).toContain('mobile:translate-x-0');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape and gives the page its previous overflow back', async () => {
    document.body.style.overflow = 'auto';
    const shell = await mount();
    await shell.open();
    expect(document.body.style.overflow).toBe('hidden');

    await shell.escape();

    expect(shell.button.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('auto');
  });

  it('closes on a scrim tap', async () => {
    const shell = await mount();
    await shell.open();
    const scrim = shell.scrim();
    expect(scrim).toBeDefined();

    await act(async () => {
      scrim?.click();
    });

    expect(shell.button.getAttribute('aria-expanded')).toBe('false');
    expect(shell.scrim()).toBeUndefined();
  });

  it('closes on a tap inside the drawer', async () => {
    const shell = await mount();
    await shell.open();

    await act(async () => {
      (shell.drawer.firstElementChild as HTMLElement).click();
    });

    expect(shell.button.getAttribute('aria-expanded')).toBe('false');
  });

  it('is inert while closed and not while open (FR-028)', async () => {
    const shell = await mount();
    expect(shell.drawer.hasAttribute('inert')).toBe(true);

    await shell.open();

    expect(shell.drawer.hasAttribute('inert')).toBe(false);
  });

  it('moves focus to the current item on open (FR-030)', async () => {
    const shell = await mount();
    await shell.open();

    expect(document.activeElement?.textContent).toBe('Media');
    expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
  });

  it('moves focus to the first item on open when none is current (FR-030)', async () => {
    mockHasCurrentItem = false;
    const shell = await mount();
    await shell.open();

    expect(document.activeElement?.textContent).toBe('Calendar');
  });

  it('gives focus back to the menu button on Escape (FR-030)', async () => {
    const shell = await mount();
    await shell.open();

    await shell.escape();

    expect(document.activeElement).toBe(shell.button);
  });

  it('gives focus back to the menu button on a scrim tap (FR-030)', async () => {
    const shell = await mount();
    await shell.open();

    await act(async () => {
      shell.scrim()?.click();
    });

    expect(document.activeElement).toBe(shell.button);
  });

  it('releases the lock when the window grows past 1025px while open', async () => {
    const shell = await mount();
    await shell.open();
    expect(document.body.style.overflow).toBe('hidden');

    await resizeTo(1440);

    expect(document.body.style.overflow).toBe('');
  });

  // An iPad opened in portrait and turned to landscape: the drawer closes
  // there, so turning back neither locks the page nor pulls focus out of the
  // field the user went on to type in.
  it('closes when the window grows past 1025px, and stays closed when it narrows again', async () => {
    const shell = await mount();
    await shell.open();

    await resizeTo(1440);
    expect(shell.button.getAttribute('aria-expanded')).toBe('false');

    shell.field.focus();
    await resizeTo(820);

    expect(shell.button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(shell.field);
    expect(document.body.style.overflow).toBe('');
  });

  // The mirror of FR-028: while the drawer is open, Tab cannot leave it for
  // the menu button or the page behind the scrim.
  it('makes the page card inert while open, and only then', async () => {
    const shell = await mount();
    expect(shell.card.contains(shell.button)).toBe(true);
    expect(shell.card.hasAttribute('inert')).toBe(false);

    await shell.open();
    expect(shell.card.hasAttribute('inert')).toBe(true);

    await shell.escape();
    expect(shell.card.hasAttribute('inert')).toBe(false);
  });

  // happy-dom focuses inert elements, so the spy records what a browser
  // would refuse: focus handed to a button that is still inside the inert card.
  it.each([
    ['Escape', (shell: Awaited<ReturnType<typeof mount>>) => shell.escape()],
    [
      'a scrim tap',
      (shell: Awaited<ReturnType<typeof mount>>) =>
        act(async () => {
          shell.scrim()?.click();
        }),
    ],
  ])(
    'hands focus back to a menu button that is no longer inert, on %s',
    async (_way, close) => {
      const shell = await mount();
      await shell.open();
      const inertAtFocus: boolean[] = [];
      const focus = shell.button.focus.bind(shell.button);
      jest.spyOn(shell.button, 'focus').mockImplementation(() => {
        inertAtFocus.push(!!shell.button.closest('[inert]'));
        focus();
      });

      await close(shell);

      expect(inertAtFocus).toEqual([false]);
      expect(document.activeElement).toBe(shell.button);
    }
  );
});

describe('the rail on desktop (1440px)', () => {
  beforeEach(() => {
    width = 1440;
  });

  // The menu button is hidden here; if it is pressed anyway the drawer does
  // not stay open, so nothing locks the page or listens for Escape.
  it('sets no lock, and the drawer does not stay open', async () => {
    const shell = await mount();
    await shell.open();

    expect(shell.button.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.style.overflow).toBe('');
  });

  it('is never inert (FR-028)', async () => {
    const shell = await mount();
    expect(shell.drawer.hasAttribute('inert')).toBe(false);
  });

  it('never makes the page card inert', async () => {
    const shell = await mount();
    await shell.open();
    expect(shell.card.hasAttribute('inert')).toBe(false);
  });
});

describe('the shell gives way at the mobile screen (≤1025px)', () => {
  it('drops the rail column and draws the drawer 100px wide from the start edge', async () => {
    const shell = await mount();

    expect(classesOf(shell.reserve)).toContain('mobile:hidden');
    expect(classesOf(shell.drawer)).toEqual(
      expect.arrayContaining([
        'mobile:w-[100px]',
        'mobile:px-[8px]',
        'mobile:start-0',
        'mobile:-translate-x-full',
        'mobile:rtl:translate-x-full',
      ])
    );
    await shell.open();
    expect(classesOf(shell.scrim() as HTMLElement)).toContain('mobile:block');
  });

  it('gives the header 64px, 12px gaps and a positioned box for the popup', async () => {
    const shell = await mount();

    expect(classesOf(shell.header)).toEqual(
      expect.arrayContaining([
        'relative',
        'mobile:h-[64px]',
        'mobile:gap-[12px]',
      ])
    );
    expect(classesOf(shell.button)).toContain('mobile:flex');
    expect(classesOf(shell.button)).not.toContain('me-[12px]');
    expect(classesOf(shell.title)).toContain('mobile:text-[18px]');
    expect(classesOf(shell.iconGroup)).toEqual(
      expect.arrayContaining(['mobile:items-center', 'mobile:gap-[14px]'])
    );
  });

  it('hides the streak on phones only, and feedback and Chrome on every small screen (FR-005, FR-006)', async () => {
    mockVariables.showUpstreamExtras = true;
    const shell = await mount();

    expect(classesOf(shell.streakWrapper)).toContain('phone:hidden');
    expect(classesOf(shell.streakSeparator)).toContain('phone:hidden');
    expect(classesOf(shell.feedbackWrapper)).toContain('mobile:hidden');
    expect(classesOf(shell.chromeWrapper())).toContain('mobile:hidden');
  });

  it('sets the page card 8px from every edge, at least the visible screen tall (FR-007, FR-027)', async () => {
    const shell = await mount();

    expect(classesOf(shell.pageWrapper)).toEqual(
      expect.arrayContaining(['mobile:py-[8px]', 'mobile:pe-[8px]'])
    );
    expect(classesOf(shell.pageWrapper)).toContain('mobile:min-h-dvh');
  });

  it('leaves page content in its own layout (FR-008)', async () => {
    const shell = await mount();
    expect(classesOf(shell.contentWrapper)).not.toContain('flex-col');
  });

  // `motion-reduce:transition-none` is emitted before `mobile:transition-transform`
  // at the same specificity, so it never reached the drawer; global.scss's
  // prefers-reduced-motion rule is what stills the slide.
  it('carries no motion-reduce: class on the drawer', async () => {
    const shell = await mount();
    expect(
      classesOf(shell.drawer).filter((c) => c.startsWith('motion-reduce:'))
    ).toEqual([]);
  });

  it('keeps no phone: class on the parts that now give way at mobile:', async () => {
    mockVariables.showUpstreamExtras = true;
    const shell = await mount();
    await shell.open();

    const parts = {
      drawer: shell.drawer,
      scrim: shell.scrim() as HTMLElement,
      reserve: shell.reserve,
      header: shell.header,
      button: shell.button,
      title: shell.title,
      iconGroup: shell.iconGroup,
      chrome: shell.chromeWrapper(),
      feedback: shell.feedbackWrapper,
    };
    for (const [name, el] of Object.entries(parts)) {
      expect([
        name,
        classesOf(el).filter((c) => c.startsWith('phone:')),
      ]).toEqual([name, []]);
    }
  });
});
