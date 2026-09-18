import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Feature 029-arabic-audit-followup (T039, contracts/checks.md T4).
//
// When a post fails validation, the reason comes back from `/posts/valid` — it is a
// string a provider's `checkValidity()`, a DTO decorator or `posts.service.ts`
// declared in English — and the composer drops it into a toast verbatim. So the one
// message a user reads when publishing goes wrong is English on an Arabic screen.
// T043 wraps it in `t(deriveTranslationKey('validation', text), text)`, and C6 mints
// the key for every string those three sources declare.
//
// **Why this one renders the modal where manage.modal.narrow.spec.tsx refused to.**
// That spec tests view state, and the store proves the same guarantee without any of
// this; its note — "stubbing 31 modules ... tests the stubs" — is right about the
// question it was asking. This question has no such alternative. C3 cannot see
// `item.errors`: it is a variable, not a literal. C6 proves the key exists, not that
// anything looks it up. The only thing that can catch this wrapper being dropped is a
// test that runs the submit path, so the stubs below earn their place: none of them
// is asserted on, and the assertion is entirely about the message this file builds.
const shown: Array<[string, string]> = [];
const postsValid: any[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({
    show: (message: string, kind: string) => shown.push([message, kind]),
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async (url: string) => ({
    json: async () => (url === '/posts/valid' ? postsValid : {}),
  }),
}));
// Everything below is scenery: the modal has to mount for its submit handler to run.
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => null })
);
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => null,
}));
// The one stub with behaviour: `submit` reads the composed posts off this ref before
// it calls /posts/valid, so a stub returning nothing would stop the path short of the
// code under test.
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useImperativeHandle } = require('react');
    return {
      ShowAllProviders: forwardRef((_props: any, ref: any) => {
        useImperativeHandle(ref, () => ({
          getAllValues: async () => [{ id: 'int-1', settings: {}, values: [] }],
        }));
        return null;
      }),
    };
  }
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => ({}) })
);
jest.mock('@gitroom/frontend/components/ui/segmented.control', () => ({
  SegmentedControl: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/repeat.component', () => ({
  RepeatComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/tags.component', () => ({
  TagsComponent: () => null,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => {}, openModal: () => {} }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/platform-label', () => ({
  platformLabel: (identifier: string) => identifier,
}));
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => null,
}));
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock('@gitroom/frontend/components/new-launch/dummy.code.component', () => ({
  DummyCodeComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/creation.method.badge', () => ({
  CreationMethodBadge: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  SettingsIcon: () => null,
  ChevronDownIcon: () => null,
  CloseIcon: () => null,
  TrashIcon: () => null,
  DropdownArrowSmallIcon: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: undefined }) })
);

import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const integration = {
  id: 'int-1',
  identifier: 'youtube',
  name: 'A channel',
} as any;

const publish = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: [integration],
      selectedIntegrations: [{ integration, settings: {} }] as any,
    });
    createRoot(container).render(<ManageModal {...({} as any)} />);
  });
  // The publish control is the only button that is not disabled once a channel is
  // selected; `.btnSub` is what the stylesheet calls it.
  await act(async () => {
    container
      .querySelector('button.btnSub')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return shown;
};

describe('the validation toast', () => {
  beforeEach(() => {
    shown.length = 0;
    postsValid.length = 0;
  });

  it('names a refusal from checkValidity through a derived key', async () => {
    postsValid.push({
      id: 'int-1',
      identifier: 'youtube',
      name: 'A channel',
      valid: true,
      errors: 'Should have at least one media',
    });

    const [[message]] = await publish();

    expect(message).toContain('validation_should_have_at_least_one_media');
    expect(message).not.toContain('Should have at least one media');
  });

  // The settings refusal is the other arm of the same block and comes from the same
  // three sources, so it takes the same wrapper.
  it('names a settings refusal through a derived key', async () => {
    postsValid.push({
      id: 'int-1',
      identifier: 'youtube',
      name: 'A channel',
      valid: false,
      settingsError: 'Title is required',
      errors: true,
    });

    const [[message]] = await publish();

    expect(message).toContain('validation_title_is_required');
  });

  // `valid: false` with nothing to say already falls back to a translated string;
  // that must survive the wrapper rather than becoming `validation_undefined`.
  it('keeps the generic fallback when the server names no reason', async () => {
    postsValid.push({
      id: 'int-1',
      identifier: 'youtube',
      name: 'A channel',
      valid: false,
      errors: true,
    });

    const [[message]] = await publish();

    expect(message).toContain('please_fix_your_settings');
  });
});
