// Guards the strings of a post saved for several channels (the composer's save
// and delete questions, and Open Post's three messages). Upstream labels the
// "only" buttons by gluing a translated prefix to the channel name, which no
// language can reorder: Arabic puts فقط after what it restricts. Sharek reads
// two sentence keys instead, and gives them to every offered language, because
// keys in en and ar alone would drop the other six to English.
import * as fs from 'fs';
import * as path from 'path';
import { languages } from '@gitroom/react/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const KEYS = [
  'post_link_not_ready',
  'post_has_no_public_link',
  'post_link_reconnect_channel',
  'delete_post_from_all_channels_question',
  'delete_from_all_channels',
  'delete_only_from_named',
  'only_channel_named',
  'draft_post_in_all_channels_question',
  'draft_all_channels',
  'post_now_in_all_channels_question',
  'post_now_all_channels',
  'schedule_post_in_all_channels_question',
  'schedule_all_channels',
];

// Each sentence key and the glued prefix it replaces.
const SENTENCES = {
  delete_only_from_named: 'delete_only_from',
  only_channel_named: 'only_channel',
} as const;

// Upstream's glue, its concatenated "Delete Selected" and the phone calendar's
// `list`: read by nothing Sharek keeps. The phone composer's own texts came in
// with spec 044 (D-13). `done` is the trunk's own key, so it stays.
const ABSENT = ['delete_only_from', 'only_channel', 'list', 'delete_selected'];

describe('linked post locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(KEYS)('has %s in en and ar, translated', (key) => {
    expect(typeof locales.en[key]).toBe('string');
    expect(locales.en[key].length).toBeGreaterThan(0);
    expect(typeof locales.ar[key]).toBe('string');
    expect(locales.ar[key]).not.toBe(locales.en[key]);
  });

  // A translation that drops the placeholder renders the button with no name.
  it.each(
    languages.flatMap((lng) => Object.keys(SENTENCES).map((key) => [lng, key]))
  )('keeps exactly the {{name}} placeholder in %s.%s', (lng, key) => {
    expect(locales[lng][key].match(/\{\{\w+\}\}/g)).toEqual(['{{name}}']);
  });

  // Where Sharek has no translator of its own, the sentence renders exactly
  // what upstream's glue renders.
  it.each(
    languages
      .filter((lng) => lng !== 'en' && lng !== 'ar')
      .flatMap((lng) =>
        Object.entries(SENTENCES).map(([key, glue]) => [lng, key, glue])
      )
  )("builds %s.%s from upstream's %s", (lng, key, glue) => {
    expect(locales[lng][key]).toBe(`${locales[lng][glue]} {{name}}`);
  });

  it.each(ABSENT)('has no %s in en or ar', (key) => {
    expect(locales.en).not.toHaveProperty(key);
    expect(locales.ar).not.toHaveProperty(key);
  });

  it('labels the "only" buttons with the sentence keys, never the glue', () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        '../../../../apps/frontend/src/components/new-launch/manage.modal.tsx'
      ),
      'utf8'
    );
    const read = [...source.matchAll(/\bt\(\s*'(\w+)'/g)].map(([, key]) => key);
    for (const [key, glue] of Object.entries(SENTENCES)) {
      expect(read).toContain(key);
      expect(read).not.toContain(glue);
    }
  });
});
