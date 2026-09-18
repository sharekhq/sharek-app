import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Feature 029-arabic-audit-followup (T039, contracts/checks.md T4).
//
// A plug's title, description and field placeholders are declared in the provider —
// `@Plug` decorators in x, bluesky, linkedin.page and threads — and travel to the
// browser as data. Nothing on the way translates them, so the plugs page and its
// modal are English on an Arabic screen. They are translated here by a key derived
// from the declared English, which is how `TranslatedLabel` has always handled the
// field labels beside them.
//
// t is mocked to return the key it is asked for, so the rendered text IS the derived
// key. That catches the failure this feature exists to prevent twice over: a missing
// wrapper shows the English, and a wrapper deriving `plug_auto_plug_post_` shows a
// key that is not in the locale — and neither is visible to tsc, to lint, or to a
// screenshot taken in English.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => {} }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
// The rich-text field is CopilotKit's textarea; only the placeholder it is handed
// matters here, and the real one pulls the whole assistant runtime in.
jest.mock('@copilotkit/react-textarea', () => ({
  CopilotTextarea: ({ placeholder }: any) => (
    <textarea readOnly placeholder={placeholder} />
  ),
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  ExpandIcon: () => null,
  CollapseIcon: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/modal.wrapper.component',
  () => ({ ModalWrapperComponent: ({ children }: any) => <div>{children}</div> })
);

// The list loads its saved rows through SWR; the fixture below stands in for what
// GET /integrations/:id/plugs returns for an account that has already set one up.
const savedPlugs = [{ plugFunction: 'autoPlugPost', id: 'p-1', activated: true, data: '[]', integrationId: 'int-1', organizationId: 'org-1' }];
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: savedPlugs, isLoading: false, mutate: () => {} }),
  mutate: () => {},
}));

import { Plug, PlugItem, PlugPop } from '@gitroom/frontend/components/plugs/plug';
import {
  PlugsContext,
  PlugsInterface,
} from '@gitroom/frontend/components/plugs/plugs.context';

// x.provider.ts's second @Plug, verbatim — the strings a real card and modal carry.
const PLUG: PlugsInterface = {
  title: 'Auto plug post',
  description:
    'When a post reached a certain number of likes, add another post to it so you followers get a notification about your promotion',
  runEveryMilliseconds: 21600000,
  methodName: 'autoPlugPost',
  fields: [
    {
      name: 'likesAmount',
      type: 'number',
      placeholder: 'Amount of likes',
      description: 'The amount of likes to trigger the repost',
      validation: String(/^\d+$/),
    },
    {
      name: 'post',
      type: 'richtext',
      placeholder: 'Post to plug',
      description: 'Message content to plug',
      validation: String(/^[\s\S]{3,}$/g),
    },
  ],
};

const SETTINGS = { providerId: 'int-1', name: 'X', identifier: 'x' };

const mount = (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container;
};

describe('the plug card', () => {
  it('renders the declared title and description through derived keys', () => {
    const text = mount(
      <PlugItem plug={PLUG} addPlug={() => {}} />
    ).textContent;

    expect(text).toContain('plug_auto_plug_post');
    expect(text).toContain(
      'plug_when_a_post_reached_a_certain_number_of_likes_add_another_post_to_it_so_you_followers_get_a_notification_about_your_promotion'
    );
  });

  // The card's label says which of the two states it is in, and both arms were
  // English literals sitting in one conditional — the shape 028's detector could
  // not see, and the reason this feature exists.
  it('names both states of the button from keys', () => {
    expect(mount(<PlugItem plug={PLUG} addPlug={() => {}} />).textContent).toContain(
      'set_plug'
    );
    expect(
      mount(
        <PlugItem
          plug={PLUG}
          addPlug={() => {}}
          data={{
            activated: true,
            data: '[]',
            id: 'p-1',
            integrationId: 'int-1',
            organizationId: 'org-1',
            plugFunction: 'autoPlugPost',
          }}
        />
      ).textContent
    ).toContain('edit_plug');
  });
});

describe('the plug modal', () => {
  it('renders the declared description, placeholders and field labels through derived keys', () => {
    const container = mount(<PlugPop plug={PLUG} settings={SETTINGS} />);
    const text = container.textContent;

    expect(text).toContain(
      'plug_when_a_post_reached_a_certain_number_of_likes_add_another_post_to_it_so_you_followers_get_a_notification_about_your_promotion'
    );
    // Placeholders are attributes, not text — read off the elements themselves.
    const placeholders = [
      ...container.querySelectorAll('input, textarea'),
    ].map((element) => element.getAttribute('placeholder'));
    expect(placeholders).toContain('placeholder_amount_of_likes');
    expect(placeholders).toContain('placeholder_post_to_plug');

    // These two were already derived, by TranslatedLabel inside Input; they are
    // asserted here so that a wrapper added around them would show up as a
    // double-translation rather than pass unnoticed.
    expect(text).toContain('label_the_amount_of_likes_to_trigger_the_repost');
  });
});

// The card finds its saved row by `methodName`, and translating the title must not
// reach that. A wrapper that assigned the Arabic back into `plug.title` would still
// match here — but one that keyed the lookup on the rendered text would not, and the
// activated slider is what says the row was found.
describe('a translated card still finds its saved data', () => {
  it('matches the saved row on methodName', () => {
    const container = mount(
      <PlugsContext.Provider
        value={{ ...SETTINGS, plugs: [PLUG] }}
      >
        <Plug />
      </PlugsContext.Provider>
    );

    // Only a card that found its row says edit_plug; an unmatched one says set_plug.
    expect(container.textContent).toContain('edit_plug');
    expect(container.textContent).not.toContain('set_plug');
  });
});
