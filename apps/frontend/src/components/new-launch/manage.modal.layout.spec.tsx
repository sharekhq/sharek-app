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
  SelectCurrent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => {
    const { forwardRef, useImperativeHandle } = require('react');
    return {
      ShowAllProviders: forwardRef((_props: any, ref: any) => {
        useImperativeHandle(ref, () => ({ getAllValues: async () => [] }));
        return null;
      }),
    };
  }
);
jest.mock('@gitroom/frontend/components/ui/segmented.control', () => ({
  SegmentedControl: () => null,
}));
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
}));
jest.mock('@gitroom/frontend/components/ui/is.scroll.hook', () => ({
  useHasScroll: () => false,
}));
jest.mock(
  '@gitroom/frontend/components/settings/shortlink-preference.component',
  () => ({ useShortlinkPreference: () => ({ data: undefined }) })
);

// Set per test: the footer's Delete Post only renders while editing a post that
// already exists, so the footer cases need this to carry an integration.
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

describe('the channels row', () => {
  beforeEach(() => {
    existing = {};
  });

  // The row holds the channel picker and the customer control side by side.
  const row = (host: HTMLElement) =>
    host.querySelector('[data-picks]')!.parentElement!.parentElement!;

  it('puts the customer control above the channels once they stack', async () => {
    const host = await render();

    expect(row(host).className).toContain('mobile:flex-col-reverse');
  });

  it('does not stack them the other way round', async () => {
    const host = await render();

    expect(row(host).className).not.toContain('mobile:flex-col ');
  });

  // Above 1025 the two sit side by side and source order is already right, so
  // the wide arrangement must not have been touched to get the narrow one.
  it('leaves the wide arrangement as a row', async () => {
    const host = await render();

    expect(row(host).className).toContain('flex w-full');
  });

  // Reversing the visual order must not reverse the reading order: the picker
  // still comes first in the DOM, so a screen reader and the tab sequence are
  // unchanged by a purely visual decision.
  it('keeps the picker first in the document', async () => {
    const host = await render();
    const [first] = Array.from(row(host).children);

    expect(first.querySelector('[data-picks]')).toBeTruthy();
  });
});

// Below 1025 the footer wraps and every control takes a row of its own. Tags
// and Repeat centre their own contents, so two of the four rows read centred
// and two did not: the date picker's wrapper overrode it to justify-start, and
// Delete Post had no width or alignment rule at all (2026-09-20 screenshot).
describe('the footer once it wraps', () => {
  beforeEach(() => {
    // Delete Post only renders while editing a post that already exists.
    existing = { integration: 'int-1', posts: [{ state: 'QUEUE' }] };
  });

  const dateWrapper = (host: HTMLElement) =>
    host.querySelector('[data-date]')!.parentElement!;

  const deleteButton = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('button')).find((node) =>
      (node.textContent || '').includes('Delete Post')
    )!;

  it('centres the date the way tag and repeat are centred', async () => {
    const host = await render();

    expect(dateWrapper(host).className).toContain(
      'mobile:[&>*]:!justify-center'
    );
    expect(dateWrapper(host).className).not.toContain(
      'mobile:[&>*]:!justify-start'
    );
  });

  // Already true before this change, and it must stay true: the date is the
  // one footer control whose row-width comes from its wrapper.
  it('gives the date a row of its own', async () => {
    const host = await render();

    expect(dateWrapper(host).className).toContain('mobile:basis-full');
  });

  it('centres Delete Post on a row of its own', async () => {
    const host = await render();

    expect(deleteButton(host).className).toContain('mobile:basis-full');
    expect(deleteButton(host).className).toContain('mobile:justify-center');
  });

  // The 44px floor is what makes Delete Post reachable with a thumb; centring
  // it must not have been achieved by rewriting the class list around it.
  it('keeps Delete Post at the touch floor', async () => {
    const host = await render();

    expect(deleteButton(host).className).toContain('coarse:min-h-[44px]');
  });
});
