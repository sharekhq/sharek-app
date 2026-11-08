import { act, ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

// The Generate Posts trigger is inherited upstream UI — the sparkle tile beside
// Create Post in the calendar's top bar (spec 051, R8), on wide screens and on
// the phone's first row, and the only way into the generator modal.
// Upstream shows it to a plan with AI while billing is on, and Sharek also
// hides it behind `showUpstreamExtras`, the default-off build-time flag that
// already hides the Chrome-extension icon, UGC and the Affiliate link
// (be378ddd), so nothing is deleted and SHOW_UPSTREAM_EXTRAS restores it.
//
// The gate is a condition in `Filters`' JSX, so the only thing that can see it
// is a render of the bar. The generator itself is replaced by a marker because
// what is under test is the call site deciding whether to mount it, not
// anything the generator does. Create Post gets the same treatment and is
// asserted alongside it: it sits in the same group behind the same channels
// half of the condition, so a change that hid both — or that emptied the group
// for an unrelated reason — would otherwise read as a pass.
const variables = { billingEnabled: true, showUpstreamExtras: false };
const user = { tier: { ai: true } };

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));
jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => <div data-testid="new-post" />,
}));
jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => <div data-testid="generator" />,
}));

// Everything below is scenery: the bar has to mount for its Create Post group
// to render. None of it is asserted on.
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => {
  const { createContext, useContext } = jest.requireActual('react');
  const CalendarContext = createContext(undefined);
  return {
    CalendarContext,
    useCalendar: () => useContext(CalendarContext),
  };
});
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (_key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name])
      ),
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    AddProviderButton: () => <div data-testid="add-provider" />,
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));

import { CalendarContext } from '@gitroom/frontend/components/launches/calendar.context';
import { Filters } from '@gitroom/frontend/components/launches/filters';

const mockChannel = (n: number) => ({
  id: `int-${n}`,
  internalId: `internal-${n}`,
  identifier: 'mastodon',
  name: `Channel ${n}`,
  picture: `/avatar-${n}.png`,
  type: 'social',
  disabled: false,
  customer: null,
});

const topBar = async (integrations = [mockChannel(1)]) => {
  const calendar = {
    display: 'week',
    startDate: '2020-01-06',
    endDate: '2020-01-12',
    integrations,
    selectedChannels: null,
    customer: null,
    listPage: 0,
    listTotalPages: 1,
    listState: 'all',
    setListState: () => undefined,
    setListPage: () => undefined,
    setSelectedChannels: () => undefined,
    setFilters: () => undefined,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <CalendarContext.Provider
        value={
          calendar as unknown as ComponentProps<
            typeof CalendarContext.Provider
          >['value']
        }
      >
        <Filters
          onOpenChannels={() => undefined}
          channelsOpen={false}
          update={() => undefined}
        />
      </CalendarContext.Provider>
    );
  });
  return container;
};

const count = (container: HTMLElement, id: string) =>
  container.querySelectorAll(`[data-testid="${id}"]`).length;

describe('the Generate Posts trigger', () => {
  beforeEach(() => {
    user.tier.ai = true;
    variables.billingEnabled = true;
    variables.showUpstreamExtras = false;
  });

  it('is not rendered while upstream extras are hidden', async () => {
    const container = await topBar();

    expect(count(container, 'generator')).toBe(0);
    expect(count(container, 'new-post')).toBe(1);
  });

  it('comes back beside Create Post when the flag is set, so nothing is deleted', async () => {
    variables.showUpstreamExtras = true;

    const container = await topBar();
    const generator = container.querySelector('[data-testid="generator"]');
    const create = container.querySelector('[data-testid="new-post"]');

    expect(count(container, 'generator')).toBe(1);
    expect(generator!.parentElement).toBe(create!.parentElement);
    expect(
      create!.compareDocumentPosition(generator!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each([
    ['a plan without AI', () => (user.tier.ai = false)],
    ['billing off', () => (variables.billingEnabled = false)],
  ])('is not rendered with %s, even with the flag set', async (_, turnOff) => {
    variables.showUpstreamExtras = true;
    turnOff();

    const container = await topBar();

    expect(count(container, 'generator')).toBe(0);
    expect(count(container, 'new-post')).toBe(1);
  });

  it('is not rendered, and neither is Create Post, with no channels', async () => {
    variables.showUpstreamExtras = true;

    const container = await topBar([]);

    expect(count(container, 'generator')).toBe(0);
    expect(count(container, 'new-post')).toBe(0);
  });
});
