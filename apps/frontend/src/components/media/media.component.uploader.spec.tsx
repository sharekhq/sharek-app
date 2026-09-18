import { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Feature 029-arabic-audit-followup (T048, contracts/checks.md T2).
//
// The media library's upload bar is Uppy's Dashboard, and every word in it — the drop
// hint, "browse files", the progress line, the failure — is Uppy's own English. Like
// CopilotKit's labels these are vendor defaults, invisible to every check in this
// repository, and they sit inside an otherwise Arabic modal. Uppy takes replacements
// on `locale.strings`, which the Dashboard forwards to the status bar it mounts
// (research R5), and it prints its own badge unless told not to.
//
// The props are the contract, so the props are what this captures, the way
// manage.modal.assistant.spec.tsx captures CopilotKit's. `t` returns the key it is
// asked for, so a string that stopped going through `t` reads as English here.
const capturedDashboard: any[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@uppy/react', () => ({
  Dashboard: (props: any) => {
    capturedDashboard.push(props);
    return null;
  },
}));
// Scenery. None of it is asserted on; the media box has to mount for the Dashboard
// inside it to receive its props.
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: { results: [], count: 0 },
    mutate: () => {},
    isLoading: false,
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({ results: [] }) }),
}));
jest.mock('@gitroom/frontend/components/media/new.uploader', () => ({
  useUppyUploader: () => ({
    on: () => {},
    off: () => {},
    addFiles: () => {},
    addFile: () => {},
  }),
}));
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (p: string) => p }),
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => undefined,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => {} }),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: {}, totalChannels: 1 }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => {}, openModal: () => {} }),
  ModalHeaderSlotTarget: () => null,
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('@gitroom/frontend/components/launches/ai.image', () => ({
  AiImage: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/ai.video', () => ({
  AiVideo: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@gitroom/frontend/components/third-parties/third-party.media', () => ({
  ThirdPartyMedia: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.media-library',
  () => ({ ThirdPartyMediaLibrary: () => null })
);
jest.mock(
  '@gitroom/frontend/components/launches/helpers/media.settings.component',
  () => ({ MediaComponentInner: () => null })
);
jest.mock('@gitroom/frontend/components/media/media.preview', () => ({
  MediaPreview: () => null,
}));
jest.mock('@gitroom/react/helpers/video.frame', () => ({ VideoFrame: () => null }));
jest.mock('react-sortablejs', () => ({
  ReactSortable: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@gitroom/frontend/components/ui/empty.state', () => ({
  EmptyState: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock('next/dynamic', () => ({ __esModule: true, default: () => () => null }));

import { MediaBox } from '@gitroom/frontend/components/media/media.component';

const locale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

// Uppy's own names on the left, ours on the right. The set is the one research R5
// established is reachable in this Dashboard's configuration — height 46, progress
// details on, every button hidden.
const PLAIN = {
  dropPasteFiles: 'uploader_drop_paste_files',
  browseFiles: 'uploader_browse_files',
  dropHint: 'uploader_drop_hint',
  uploading: 'uploader_uploading',
  complete: 'uploader_complete',
  uploadFailed: 'uploader_upload_failed',
  xTimeLeft: 'uploader_x_time_left',
  dataUploadedOfTotal: 'uploader_data_uploaded_of_total',
  addMore: 'uploader_add_more',
};

// Uppy pluralises these three itself and expects a {0, 1} object, picking form 0 at
// one file. Arabic uses one wording at every count (R5), so both forms resolve the
// same key; English differs, and gets its singular from `<key>_one` in en.
const COUNTED = {
  uploadingXFiles: 'uploader_uploading_x_files',
  processingXFiles: 'uploader_processing_x_files',
  xFilesSelected: 'uploader_x_files_selected',
};

const render = () => {
  capturedDashboard.length = 0;
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
    );
  });
  expect(capturedDashboard.length).toBeGreaterThan(0);
  return capturedDashboard[capturedDashboard.length - 1];
};

describe('the media uploader', () => {
  it('hides the vendor badge', () => {
    expect(render().proudlyDisplayPoweredByUppy).toBe(false);
  });

  it.each(Object.entries(PLAIN))('names %s from %s', (name, key) => {
    expect(render().locale.strings[name]).toBe(key);
  });

  it.each(Object.entries(COUNTED))(
    'names both plural forms of %s from %s',
    (name, key) => {
      expect(render().locale.strings[name]).toEqual({ 0: key, 1: key });
    }
  );

  // A string Uppy does not know is a string Uppy ignores, silently, so the set is
  // asserted whole: an invented name would sit in the object doing nothing.
  it('replaces the reachable set and nothing else', () => {
    expect(Object.keys(render().locale.strings).sort()).toEqual(
      [...Object.keys(PLAIN), ...Object.keys(COUNTED)].sort()
    );
  });
});

// Uppy substitutes %{browseFiles}, %{time}, %{complete}, %{total} and %{smart_count}
// itself; i18next leaves `%{…}` alone, which is why the two mechanisms can share one
// string. A wording that dropped a token renders it as nothing at all, so the tokens
// are checked on the values that ship rather than on the mocked keys above.
describe("the uploader's shipped values", () => {
  const en = locale('en');
  const ar = locale('ar');
  const tokensOf = (value: string) => (value.match(/%\{[^}]+\}/g) || []).sort();

  it.each(Object.values({ ...PLAIN, ...COUNTED }))(
    '%s carries the same %%{} tokens in en and ar',
    (key) => {
      expect(typeof en[key]).toBe('string');
      expect(tokensOf(ar[key])).toEqual(tokensOf(en[key]));
    }
  );

  // Only `en` carries the singular, and only for the three Uppy pluralises: Arabic
  // reads the same at every count, so adding it there would be a second spelling of
  // one decision. Its value is Uppy's own English, which is what the English screen
  // shows today (SC-007).
  it.each(Object.values(COUNTED))(
    '%s has an English singular and no Arabic one',
    (key) => {
      expect(typeof en[`${key}_one`]).toBe('string');
      expect(en[`${key}_one`]).toContain('%{smart_count}');
      expect(ar[`${key}_one`]).toBeUndefined();
    }
  );
});
