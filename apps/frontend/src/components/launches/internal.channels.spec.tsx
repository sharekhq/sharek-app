import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useForm, FormProvider } from 'react-hook-form';

// Feature 029-arabic-audit-followup (T039, contracts/checks.md T4).
//
// Post settings → automations renders the `@PostPlug` declarations the way the plugs
// page renders `@Plug`: title, description and field placeholders straight from the
// provider, in English, inside a panel that is otherwise Arabic. The same derived-key
// treatment applies here, and the delay dropdown beside them is a plain object-literal
// table of English names — one of the shapes 028's regex detector could not see.
//
// t returns the key it is asked for, so every assertion below reads as the key the
// component derived rather than as text that merely looks translated.
const allIntegrations = [
  { id: 'int-2', identifier: 'linkedin', name: 'A page' },
  { id: 'int-3', identifier: 'linkedin-page', name: 'Another page' },
];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({
      allIntegrations,
      integration: { id: 'int-1' },
    }),
  })
);
// The channel picker is a grid of avatars; which accounts it offers is settled by
// `allowedIntegrations` above it, and none of its own text is in scope here.
jest.mock(
  '@gitroom/frontend/components/launches/helpers/pick.platform.component',
  () => ({ PickPlatforms: () => null })
);

import { InternalChannels } from '@gitroom/frontend/components/launches/internal.channels';

// linkedin.provider.ts's first @PostPlug, verbatim.
const PLUG = {
  identifier: 'linkedin-add-comment',
  title: 'Add comments by a different account',
  description: 'Add accounts to comment on your post',
  pickIntegration: ['linkedin', 'linkedin-page'],
  fields: [
    {
      name: 'comment',
      description: 'The comment to add to the post',
      type: 'textarea',
      placeholder: 'Enter your comment here',
    },
  ],
};

// `Plug` waits a tick before it renders anything, so the panel is mounted inside a
// form context and then the timer is run out.
const Harness = ({ plugs }: { plugs: any[] }) => {
  const form = useForm({
    defaultValues: {
      [`plug--${PLUG.identifier}--active`]: true,
      [`plug--${PLUG.identifier}--integrations`]: [],
    },
  });
  return (
    <FormProvider {...form}>
      <InternalChannels plugs={plugs} />
    </FormProvider>
  );
};

const mount = (plugs: any[] = [PLUG]) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<Harness plugs={plugs} />);
  });
  act(() => {
    jest.runOnlyPendingTimers();
  });
  return container;
};

describe('post settings automations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the declared title, description and placeholder through derived keys', () => {
    const container = mount();
    const text = container.textContent;

    expect(text).toContain('plug_add_comments_by_a_different_account');
    expect(text).toContain('plug_add_accounts_to_comment_on_your_post');
    expect(text).toContain('label_the_comment_to_add_to_the_post');
    expect(
      container.querySelector('textarea')?.getAttribute('placeholder')
    ).toBe('placeholder_enter_your_comment_here');
  });

  // Eight option names in one object literal, read by a `<Select>` — a shape whose
  // strings never reach a text node, which is why nothing reported them.
  it('names every delay option from a key', () => {
    const options = [...mount().querySelectorAll('option')].map(
      (option) => option.textContent
    );

    expect(options).toEqual([
      'immediately',
      '1_hour',
      '2_hours',
      '3_hours',
      '8_hours',
      '12_hours',
      '15_hours',
      '24_hours',
    ]);
  });

  // The empty state is a bare string in a conditional arm — the shape that set this
  // whole feature off.
  it('names the empty state from a key', () => {
    const container = mount([{ ...PLUG, pickIntegration: ['mastodon'] }]);

    expect(container.textContent).toContain('no_available_accounts');
  });
});
