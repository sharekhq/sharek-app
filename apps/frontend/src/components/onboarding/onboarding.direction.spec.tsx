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
