import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Feature 029-arabic-audit-followup (T047, contracts/checks.md T1).
//
// CopilotKit ships its own English for every control in the chat window — the input
// placeholder, the error line, stop/regenerate, copy, the two feedback buttons and
// the "Copied!" confirmation — and exposes all of them on one `labels` prop. The
// composer passes two of the ten today, so eight English strings sit inside an
// Arabic modal and no check can see them: they are the vendor's defaults, not
// literals in this repo.
//
// The prop is the whole contract, so the prop is what this captures. `t` returns the
// key it is asked for, which makes a label that stopped going through `t` — or one
// that went through the wrong key — a visible difference here rather than on screen.
const capturedLabels: any[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@copilotkit/react-ui', () => ({
  CopilotPopup: ({ labels }: any) => {
    capturedLabels.push(labels);
    return null;
  },
}));
// Scenery, as in manage.modal.validation.spec.tsx: the modal has to mount for the
// popup it renders to receive its props.
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
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
jest.mock(
  '@gitroom/frontend/components/new-launch/providers/show.all.providers',
  () => ({ ShowAllProviders: () => null })
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
import { ASSISTANT_LABELS } from '@gitroom/frontend/components/ui/assistant.labels';

const render = () => {
  capturedLabels.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<ManageModal {...({} as any)} />);
  });
  expect(capturedLabels.length).toBeGreaterThan(0);
  return capturedLabels[capturedLabels.length - 1];
};

describe("the composer's assistant labels", () => {
  // The composer's own two: its assistant is not Samy and keeps its own name and
  // opening line, which is why the shared set below covers the other eight.
  it('keeps its own title and opening message', () => {
    const labels = render();

    expect(labels.title).toBe('your_assistant');
    expect(labels.initial).toBe('assistant_initial_message');
  });

  it.each(
    Object.entries(ASSISTANT_LABELS).map(([label, { key }]) => [label, key])
  )('names %s from %s', (label, key) => {
    expect(render()[label]).toBe(key);
  });

  // CopilotKit renders whatever it is not given from its own English, so a label
  // missing from the prop is the defect — an undefined value would pass a loose
  // assertion and show English.
  it('leaves none of the ten to the vendor', () => {
    const labels = render();

    for (const label of ['title', 'initial', ...Object.keys(ASSISTANT_LABELS)]) {
      expect(typeof labels[label]).toBe('string');
    }
  });
});
