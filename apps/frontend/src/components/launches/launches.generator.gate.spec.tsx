import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The Generate Posts trigger is inherited upstream UI — the sparkle tile beside New
// Post in the calendar's channels panel, and the only way into the generator modal.
// Sharek hides it behind `showUpstreamExtras`, the default-off build-time flag that
// already hides the Chrome-extension icon, UGC and the Affiliate link (be378ddd), so
// nothing is deleted and SHOW_UPSTREAM_EXTRAS restores it.
//
// The gate is a condition in `LaunchesComponent`'s JSX, so the only thing that can
// see it is a render of that screen — hence the stubs below. The generator itself is
// replaced by a marker because what is under test is the call site deciding whether
// to mount it, not anything the generator does. New Post gets the same treatment and
// is asserted alongside it: it sits in the same row behind the same
// `sortedIntegrations` half of the condition, so a change that hid both — or that
// emptied the row for an unrelated reason — would otherwise read as a pass.
const variables = { billingEnabled: true, showUpstreamExtras: false };

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => <div data-testid="new-post" />,
}));
jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => <div data-testid="generator" />,
}));

// Everything below is scenery: the screen has to mount for its channels panel to
// render. None of it is asserted on.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true }, totalChannels: 10 }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: () => ({
    isLoading: false,
    data: [
      {
        id: 'int-1',
        internalId: 'internal-1',
        identifier: 'mastodon',
        name: 'A channel',
        picture: '',
        disabled: false,
        changeProfilePicture: false,
        changeNickName: false,
      },
    ],
    mutate: () => undefined,
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['0', () => undefined],
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => () => undefined,
}));
jest.mock('@gitroom/react/helpers/use.media.query', () => ({
  useMediaQuery: () => false,
  PHONE_QUERY: '(max-width: 768px)',
}));
jest.mock('react-dnd', () => ({
  useDrag: () => [{}, () => undefined, () => undefined],
  useDrop: () => [{}, () => undefined],
}));
jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/launches/calendar.drag.layer', () => ({
  CalendarDragLayer: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  CalendarWeekProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/launches/calendar', () => ({
  Calendar: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/filters', () => ({
  Filters: () => null,
}));
jest.mock('@gitroom/frontend/components/onboarding/onboarding', () => ({
  Onboarding: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: ({ children }: { children: ReactNode }) => children,
  SplitPanelToggle: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/add.provider.component', () => ({
  AddProviderButton: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/no-channels.illustration', () => ({
  NoChannelsIllustration: () => null,
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));

import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals onto
// globalThis and that is not one of them, so the channel groups' open/closed memory
// would throw during render.
globalThis.localStorage = window.localStorage;

const channelsPanel = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<LaunchesComponent />);
  });
  return container;
};

describe('the Generate Posts trigger', () => {
  beforeEach(() => {
    variables.showUpstreamExtras = false;
  });

  it('is not rendered while upstream extras are hidden', async () => {
    const container = await channelsPanel();

    expect(container.querySelector('[data-testid="generator"]')).toBeNull();
    expect(container.querySelector('[data-testid="new-post"]')).not.toBeNull();
  });

  it('comes back when the flag is set, so nothing is deleted', async () => {
    variables.showUpstreamExtras = true;

    const container = await channelsPanel();

    expect(container.querySelector('[data-testid="generator"]')).not.toBeNull();
  });
});
