/**
 * The words Uppy's Dashboard renders, and the keys that translate them.
 *
 * Uppy draws its own drop zone and status bar from its own English, and takes
 * replacements on `locale.strings` — which the Dashboard forwards to the status bar it
 * mounts, so one object covers both. None of these strings is a literal in this
 * repository, so no check can see them: a Dashboard that is simply not given this
 * object shows English inside an otherwise Arabic panel, and everything stays green.
 * That is exactly what happened — the media library was given it and the compose
 * modal's drop zone was not, because nothing knew there were two.
 *
 * Shared by `media/media.component.tsx` and `new-launch/editor.tsx`, so it lives here
 * rather than in either of them, the same reason `tutorial.video.ts` and
 * `assistant.labels.ts` sit beside it. `uploader.locale.spec.ts` fails if a third
 * Dashboard appears without it.
 *
 * The set is the one this configuration can show (height 46, progress details on,
 * every button hidden). A name Uppy does not know is a string Uppy ignores.
 */
export interface UploaderString {
  key: string;
  defaultValue: string;
}

export const UPLOADER_STRINGS: Readonly<Record<string, UploaderString>> = {
  dropPasteFiles: {
    key: 'uploader_drop_paste_files',
    defaultValue: 'Drop files here or %{browseFiles}',
  },
  browseFiles: { key: 'uploader_browse_files', defaultValue: 'browse files' },
  dropHint: { key: 'uploader_drop_hint', defaultValue: 'Drop your files here' },
  uploading: { key: 'uploader_uploading', defaultValue: 'Uploading' },
  complete: { key: 'uploader_complete', defaultValue: 'Complete' },
  uploadFailed: { key: 'uploader_upload_failed', defaultValue: 'Upload failed' },
  xTimeLeft: { key: 'uploader_x_time_left', defaultValue: '%{time} left' },
  dataUploadedOfTotal: {
    key: 'uploader_data_uploaded_of_total',
    defaultValue: '%{complete} of %{total}',
  },
  addMore: { key: 'uploader_add_more', defaultValue: 'Add more' },
};

/**
 * The three Uppy pluralises itself, as its own `{0, 1}` object: it picks form 0 at one
 * file and form 1 above it, and its English differs between them.
 *
 * Both forms ask for the SAME key, because the decided Arabic reads correctly at any
 * count (research R5). English differs, and i18next answers form 0 from `<key>_one`,
 * which only `en` carries. A language with neither gets the default below — Uppy's own
 * English for that form — so nothing that is English today stops being English.
 */
export const UPLOADER_COUNTED: Readonly<
  Record<string, { one: UploaderString; other: UploaderString }>
> = {
  uploadingXFiles: {
    one: {
      key: 'uploader_uploading_x_files',
      defaultValue: 'Uploading %{smart_count} file',
    },
    other: {
      key: 'uploader_uploading_x_files',
      defaultValue: 'Uploading %{smart_count} files',
    },
  },
  processingXFiles: {
    one: {
      key: 'uploader_processing_x_files',
      defaultValue: 'Processing %{smart_count} file',
    },
    other: {
      key: 'uploader_processing_x_files',
      defaultValue: 'Processing %{smart_count} files',
    },
  },
  xFilesSelected: {
    one: {
      key: 'uploader_x_files_selected',
      defaultValue: '%{smart_count} file selected',
    },
    other: {
      key: 'uploader_x_files_selected',
      defaultValue: '%{smart_count} files selected',
    },
  },
};

/** What every Uppy Dashboard passes as its `locale`. */
export const uploaderLocale = (
  t: (key: string, fallback: string, options?: Record<string, unknown>) => string
) => ({
  strings: {
    ...Object.fromEntries(
      Object.entries(UPLOADER_STRINGS).map(([name, { key, defaultValue }]) => [
        name,
        t(key, defaultValue),
      ])
    ),
    ...Object.fromEntries(
      Object.entries(UPLOADER_COUNTED).map(([name, form]) => [
        name,
        {
          0: t(form.one.key, form.one.defaultValue, { count: 1 }),
          1: t(form.other.key, form.other.defaultValue, { count: 2 }),
        },
      ])
    ),
  },
});
