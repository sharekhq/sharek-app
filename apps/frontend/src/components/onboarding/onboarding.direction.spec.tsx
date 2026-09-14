import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The modal pulls the whole MCP page in at module scope for its client list and
// its config helpers. The shared contexts, SWR and the clipboard shim behind
// both are swapped for shells (same mock set as public.component.spec), which
// leaves the real button markup to assert against.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ publicApi: 'KEY', tier: { public_api: true } }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ billingEnabled: true, backendUrl: '', mcpUrl: '' }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: jest.fn() }),
  useDecisionModal: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/developer/developer.component', () => ({
  DeveloperComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/public-api/mcp.client.icons', () => ({
  McpClientIcon: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({ AddProviderComponent: () => null })
);
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('copy-to-clipboard', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('i18next', () => ({ __esModule: true, default: { t: (k: string) => k } }));
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: [] }),
  useSWRConfig: () => ({ mutate: jest.fn() }),
}));

import { OnboardingModal } from '@gitroom/frontend/components/onboarding/onboarding.modal';

const mount = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<OnboardingModal onClose={() => {}} />);
  });
  return container;
};

const button = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  )!;

const click = (container: HTMLElement, label: string) => {
  act(() => {
    button(container, label).dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
  });
};

// The icon each navigation button carries, by the button's own label.
const icon = (container: HTMLElement, label: string) =>
  button(container, label).querySelector('svg')!.getAttribute('class') ?? '';

const CONTINUE = 'Continue without channels';
const SKIP = 'Continue / Skip';

// Arabic flips the row, so the arrow already lands on the correct edge on its
// own — but the glyph is drawn pointing right either way. "Continue" ends up
// pointing back the way the reader came and "Back" points forward, and the
// hover nudge slides each one the wrong way as well, since Tailwind applies
// translate outside the rotation. Every other directional icon in the app
// carries rtl:rotate-180 at the call site; these four were missed.
describe('the onboarding arrows point the way the reader is going', () => {
  it('turns the continue arrow around on the channels step', () => {
    expect(icon(mount(), CONTINUE)).toContain('rtl:rotate-180');
  });

  it('turns both arrows around on the agents step', () => {
    const container = mount();
    click(container, CONTINUE);
    expect(icon(container, SKIP)).toContain('rtl:rotate-180');
    expect(icon(container, 'Back')).toContain('rtl:rotate-180');
  });

  it('turns the back arrow around on the tutorial step', () => {
    const container = mount();
    click(container, CONTINUE);
    click(container, SKIP);
    expect(icon(container, 'Back')).toContain('rtl:rotate-180');
  });

  it('leaves the finish tick alone, which has no direction to get wrong', () => {
    const container = mount();
    click(container, CONTINUE);
    click(container, SKIP);
    expect(icon(container, 'Get Started')).not.toContain('rtl:rotate-180');
  });
});

describe('the onboarding arrows drift the way they point', () => {
  it('nudges the continue arrow towards the next step', () => {
    const container = mount();
    expect(icon(container, CONTINUE)).toContain('rtl:group-hover:-translate-x-1');
    click(container, CONTINUE);
    expect(icon(container, SKIP)).toContain('rtl:group-hover:-translate-x-1');
  });

  it('nudges the back arrow towards the step behind it', () => {
    const container = mount();
    click(container, CONTINUE);
    expect(icon(container, 'Back')).toContain('rtl:group-hover:translate-x-1');
  });
});

// The modal opens full-screen with no card of its own to clamp it, so nothing
// upstream keeps it inside a phone. Every assertion below is a class that has
// to be on a specific element for that to hold; jsdom has no layout, so what it
// can prove is exactly that and no more. The geometry those classes produce is
// asserted in tools/tailwind-emit and read at 390 in the design review.
const classesOf = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll(selector)).map((n) => n.className);

const anyHas = (container: HTMLElement, selector: string, token: string) =>
  classesOf(container, selector).some((c) => c.split(/\s+/).includes(token));

describe('the onboarding modal gives its width back on a phone', () => {
  it('halves the two paddings that eat 112px of a 390px screen', () => {
    const container = mount();
    // The outer shell and the card's own inset, in that order.
    expect(anyHas(container, 'div', 'phone:p-[8px]')).toBe(true);
    expect(anyHas(container, 'div', 'phone:p-[16px]')).toBe(true);
  });

  it('drops the step labels, which are what make the rail 470px wide', () => {
    const container = mount();
    const labels = classesOf(container, 'span').filter((c) => c.includes('text-[14px]'));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.split(/\s+/)).toContain('phone:hidden');
    }
  });

  it('shortens the rules between the steps rather than leaving them at 40px', () => {
    expect(anyHas(mount(), 'div', 'phone:w-[20px]')).toBe(true);
  });
});

describe('the onboarding action rows fit the width they are given', () => {
  it('gives the lone continue button the full row on the channels step', () => {
    // Alone on its row, so it takes the whole of it: the label
    // "Continue without channels" is a 306px minimum otherwise.
    expect(button(mount(), CONTINUE).className.split(/\s+/)).toContain('phone:w-full');
  });

  it('lets the paired buttons share a row, with Back keeping its own width', () => {
    const container = mount();
    click(container, CONTINUE);
    expect(button(container, SKIP).className.split(/\s+/)).toContain('phone:flex-1');
    expect(button(container, 'Back').className.split(/\s+/)).toContain('shrink-0');
  });

  it('wraps the agents footer so its hint can take a line of its own', () => {
    const container = mount();
    click(container, CONTINUE);
    expect(anyHas(container, 'div', 'phone:flex-wrap')).toBe(true);
    expect(anyHas(container, 'div', 'phone:basis-full')).toBe(true);
  });

  it('stacks the MCP and CLI cards instead of halving a 280px column', () => {
    const container = mount();
    click(container, CONTINUE);
    expect(anyHas(container, 'div', 'phone:grid-cols-1')).toBe(true);
  });
});

describe('the tutorial video stops deriving its width from its height', () => {
  it('gives the wrapper the aspect ratio and lets the frame fill it', () => {
    const container = mount();
    click(container, CONTINUE);
    click(container, SKIP);
    // h-full aspect-video sizes the iframe from its height, so the taller the
    // phone the wider the video. On a phone the wrapper carries the ratio.
    expect(anyHas(container, 'div', 'phone:aspect-video')).toBe(true);
    expect(anyHas(container, 'div', 'phone:flex-none')).toBe(true);
    expect(container.querySelector('iframe')!.className.split(/\s+/)).toContain('phone:w-full');
  });
});
