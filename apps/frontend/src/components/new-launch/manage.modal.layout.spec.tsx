import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Compose's narrow-layout DOM facts — the ones manage.modal.narrow.spec.tsx
// deliberately does not cover, because they are class lists rather than store
// state and no amount of store testing can see them.
//
// The stub set below is the one manage.modal.validation.spec.tsx established:
// none of them is asserted on, they exist so the modal can mount. That spec's
// note applies here too — these questions have no seam other than the rendered
// modal, because what changed is a class on a wrapper.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({}));
jest.mock(
  '@gitroom/frontend/components/new-launch/picks.socials.component',
  () => ({ PicksSocialsComponent: () => <div data-picks /> })
);
jest.mock('@gitroom/frontend/components/new-launch/editor', () => ({
  EditorWrapper: () => null,
}));
jest.mock('@gitroom/frontend/components/new-launch/select.current', () => ({
  SelectCurrent: () => <div data-current />,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useImperativeHandle } = require('react');
    return {
      ShowAllProviders: forwardRef((_props: any, ref: any): null => {
        useImperativeHandle(ref, () => ({
          getAllValues: async (): Promise<unknown[]> => [],
        }));
        return null;
      }),
    };
  }
);
jest.mock('@gitroom/frontend/components/launches/helpers/date.picker', () => ({
  DatePicker: () => <div data-date />,
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
  useModals: () => ({ closeAll: () => undefined, openModal: () => undefined }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/platform-label',
  () => ({ platformLabel: (identifier: string) => identifier })
);
jest.mock('@gitroom/frontend/components/launches/select.customer', () => ({
  SelectCustomer: () => <div data-customer />,
}));
jest.mock('@copilotkit/react-ui', () => ({ CopilotPopup: () => null }));
jest.mock(
  '@gitroom/frontend/components/new-launch/dummy.code.component',
  () => ({ DummyCodeComponent: () => null })
);
jest.mock('@gitroom/frontend/components/launches/creation.method.badge', () => ({
  CreationMethodBadge: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  SettingsIcon: () => null,
  ChevronDownIcon: () => null,
  CloseIcon: () => null,
  TrashIcon: () => null,
  DropdownArrowSmallIcon: () => null,
  // the top bar and the preview button at 1025px and below
  ChevronLeftIcon: () => null,
  DropdownArrowIcon: () => null,
  EyeIcon: () => null,
  PlusIcon: () => null,
}));
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: undefined }) })
);

// Set per test: a post that already exists carries an integration.
let existing: Record<string, unknown> = {};
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.existing.data',
  () => ({ useExistingData: () => existing })
);

import { ManageModal } from '@gitroom/frontend/components/new-launch/manage.modal';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const integration = {
  id: 'int-1',
  identifier: 'youtube',
  name: 'A channel',
} as any;

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    useLaunchStore.getState().reset();
    useLaunchStore.setState({
      integrations: [integration],
      selectedIntegrations: [{ integration, settings: {} }] as any,
    });
    createRoot(host).render(<ManageModal {...({} as any)} />);
  });
  return host;
};

// A post that already exists keeps the channels and the customer it was saved
// with. Its channel tabs only show when it was saved for several channels,
// where they switch between each channel's own post.
describe('an existing post', () => {
  const saved = { integration: 'int-1', posts: [{ state: 'QUEUE' }] };

  it('offers the customer control for a new post only', async () => {
    existing = {};
    expect((await render()).querySelector('[data-customer]')).toBeTruthy();

    existing = saved;
    expect((await render()).querySelector('[data-customer]')).toBeNull();
  });

  it('shows the channel tabs for a new post', async () => {
    existing = {};

    expect((await render()).querySelector('[data-current]')).toBeTruthy();
  });

  it('shows the channel tabs for a post saved with other channels', async () => {
    existing = {
      ...saved,
      siblings: [{ integration: 'int-2', posts: [{ state: 'QUEUE' }] }],
    };

    expect((await render()).querySelector('[data-current]')).toBeTruthy();
  });

  it('shows no channel tabs for a post saved alone', async () => {
    existing = saved;

    expect((await render()).querySelector('[data-current]')).toBeNull();
  });
});
