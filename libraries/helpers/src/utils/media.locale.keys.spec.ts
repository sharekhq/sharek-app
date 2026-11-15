// Guards the media library's strings (en + ar). A key that exists only as an
// inline t() default renders English in every other language, which is how the
// fork's "half-translated Arabic" bug happened — and the duplicate-key spec
// does not catch it, because it never compares one locale against another.
// (feature 008-media-page-polish; feature 057-media-library adds the months,
// the preview, the window and selecting, word for word from its contracts/ui.md,
// and drops the fork's keys the old tiles read.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);
const FRONTEND_DIR = path.join(__dirname, '../../../../apps/frontend/src');

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;
const en = readLocale('en');
const ar = readLocale('ar');
const LOCALES: Record<string, Record<string, string>> = { en, ar };

// [key, en, ar]: contracts/ui.md's two "New words" tables, the keys that count
// nothing.
const WORDS: [string, string, string][] = [
  ['media_type_filter', 'File type', 'نوع الملف'],
  ['media_filter_all', 'All', 'الكل'],
  ['media_filter_images', 'Images', 'الصور'],
  ['media_filter_videos', 'Videos', 'الفيديو'],
  ['media_sort', 'Sort', 'الترتيب'],
  ['media_sort_newest', 'Newest first', 'الأحدث أولًا'],
  ['media_sort_oldest', 'Oldest first', 'الأقدم أولًا'],
  ['media_end', "That's all your files", 'هذه كل ملفاتك'],
  [
    'media_load_failed',
    "Couldn't load more files.",
    'تعذر تحميل المزيد من الملفات.',
  ],
  [
    'media_no_type_match',
    'No files of this type yet',
    'لا توجد ملفات من هذا النوع بعد',
  ],
  ['media_show_all', 'Show all files', 'عرض كل الملفات'],
  ['media_preview_video', 'Video', 'فيديو'],
  ['media_select_all', 'Select all', 'تحديد الكل'],
  ['media_clear_selection', 'Clear', 'إلغاء التحديد'],
  ['media_select_named', 'Select {{name}}', 'تحديد {{name}}'],
];

// i18next 25 reads <key>_<category>, the category Intl.PluralRules picks for
// the count: two in English, six in Arabic, which agrees a counted noun with
// its number. Zero and two are said in words.
const ARABIC_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'];

// The tables' counted keys by base name, each form in the tables' words.
const COUNTED: Record<
  string,
  { en: Record<string, string>; ar: Record<string, string> }
> = {
  media_month_files: {
    en: { one: '{{value}} file', other: '{{value}} files' },
    ar: {
      zero: 'لا ملفات',
      one: 'ملف واحد',
      two: 'ملفان',
      few: '{{value}} ملفات',
      many: '{{value}} ملفًا',
      other: '{{value}} ملف',
    },
  },
  media_delete_title: {
    en: { one: 'Delete this file?', other: 'Delete {{value}} files?' },
    ar: {
      zero: 'حذف الملفات؟',
      one: 'حذف هذا الملف؟',
      two: 'حذف الملفين؟',
      few: 'حذف {{value}} ملفات؟',
      many: 'حذف {{value}} ملفًا؟',
      other: 'حذف {{value}} ملف؟',
    },
  },
  media_delete_body: {
    en: {
      one: "It'll be removed from your media library.",
      other: "They'll be removed from your media library.",
    },
    ar: {
      zero: 'ستزال من مكتبة الوسائط.',
      one: 'سيزال من مكتبة الوسائط.',
      two: 'سيزالان من مكتبة الوسائط.',
      few: 'ستزال من مكتبة الوسائط.',
      many: 'ستزال من مكتبة الوسائط.',
      other: 'ستزال من مكتبة الوسائط.',
    },
  },
  media_deleted: {
    en: { one: 'File deleted', other: '{{value}} files deleted' },
    ar: {
      zero: 'لم يحذف أي ملف',
      one: 'تم حذف الملف',
      two: 'تم حذف الملفين',
      few: 'تم حذف {{value}} ملفات',
      many: 'تم حذف {{value}} ملفًا',
      other: 'تم حذف {{value}} ملف',
    },
  },
  media_not_deleted: {
    en: {
      one: '{{value}} file was not deleted',
      other: '{{value}} files were not deleted',
    },
    ar: {
      zero: 'تعذر حذف الملفات',
      one: 'تعذر حذف ملف واحد',
      two: 'تعذر حذف ملفين',
      few: 'تعذر حذف {{value}} ملفات',
      many: 'تعذر حذف {{value}} ملفًا',
      other: 'تعذر حذف {{value}} ملف',
    },
  },
  media_selected: {
    en: { one: '{{value}} selected', other: '{{value}} selected' },
    ar: {
      zero: 'لم يتم تحديد أي ملف',
      one: 'تم تحديد ملف واحد',
      two: 'تم تحديد ملفين',
      few: 'تم تحديد {{value}} ملفات',
      many: 'تم تحديد {{value}} ملفًا',
      other: 'تم تحديد {{value}} ملف',
    },
  },
};

// Every value the tables write, one row each: [key, language, text].
const ROWS: [string, string, string][] = [
  ...WORDS.flatMap(([key, enText, arText]): [string, string, string][] => [
    [key, 'en', enText],
    [key, 'ar', arText],
  ]),
  ...Object.entries(COUNTED).flatMap(([key, words]) =>
    ['en', 'ar'].flatMap((lng) =>
      Object.entries(words[lng as 'en' | 'ar']).map(
        ([form, text]): [string, string, string] => [
          `${key}_${form}`,
          lng,
          text,
        ]
      )
    )
  ),
];

// [Arabic key, the English key it stands in for]: a counted Arabic form stands
// in for the English one for one, and for other otherwise.
const TRANSLATIONS: [string, string][] = [
  ...WORDS.map(([key]): [string, string] => [key, key]),
  ...Object.keys(COUNTED).flatMap((key) =>
    ARABIC_FORMS.map((form): [string, string] => [
      `${key}_${form}`,
      `${key}_${form === 'one' ? 'one' : 'other'}`,
    ])
  ),
];

// The fork's keys that only the old tiles read: the per-tile delete's name and
// question, and the phone's Delete Selected (N). Upstream's
// are_you_sure_you_want_to_delete_selected_media stays in every locale though
// nothing reads it any more (Rule 26), so nothing here is said about it.
const REMOVED = [
  'delete_selected_count',
  'delete_media_named',
  'are_you_sure_you_want_to_delete_this_file',
];

const placeholders = (value: string) =>
  Array.from(value.matchAll(/{{\s*(\w+)\s*}}/g), (m) => m[1]).sort();

const formsOf = (locale: Record<string, string>, key: string) =>
  ARABIC_FORMS.filter((form) => typeof locale[`${key}_${form}`] === 'string');

// Every component and hook under a directory, their specs aside.
const sourcesIn = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourcesIn(full);
    return /\.tsx?$/.test(entry.name) && !/\.spec\./.test(entry.name)
      ? [full]
      : [];
  });

// Read off the components, not listed: a list cannot catch the next
// inline-default-only key.
const keysRead = (files: string[]) =>
  Array.from(
    new Set(
      Array.from(
        files
          .map((file) => fs.readFileSync(file, 'utf8'))
          .join('\n')
          .matchAll(
            /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*['"]([A-Za-z0-9_]+)['"]/g
          ),
        (match) => match[1]
      )
    )
  ).sort();

const MEDIA_READS = keysRead(
  sourcesIn(path.join(FRONTEND_DIR, 'components/media'))
);
const APP_READS = keysRead(sourcesIn(FRONTEND_DIR));

describe('media page locale keys', () => {
  it.each(['open_original', 'open_preview'])(
    'has a non-empty English and Arabic %s',
    (key) => {
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
      expect(typeof ar[key]).toBe('string');
      expect(ar[key].length).toBeGreaterThan(0);
    }
  );

  it('translates the Arabic strings rather than echoing the English', () => {
    for (const key of ['open_original', 'open_preview']) {
      expect(ar[key]).not.toBe(en[key]);
    }
  });
});

describe('the media library’s new words', () => {
  it.each(ROWS)('reads %s in %s as "%s"', (key, lng, text) => {
    expect(LOCALES[lng][key]).toBe(text);
  });

  // Identical bytes in both locales means the English was copied across rather
  // than translated, which reads as done and is not.
  it.each(TRANSLATIONS)(
    'translates %s: its Arabic is not the English of %s',
    (arKey, enKey) => {
      expect(typeof ar[arKey]).toBe('string');
      expect(ar[arKey]).not.toBe(en[enKey]);
    }
  );

  it.each(Object.keys(COUNTED))(
    'counts %s in the English one and other and all six Arabic forms',
    (key) => {
      expect(formsOf(en, key)).toEqual(['one', 'other']);
      expect(formsOf(ar, key)).toEqual(ARABIC_FORMS);
    }
  );

  // A translation that drops a placeholder renders the sentence without its
  // value, and nothing fails loudly: {{value}} in every form whose words carry
  // the count, {{name}} in the circle's name.
  it.each(ROWS.filter(([, , text]) => placeholders(text).length > 0))(
    'keeps the placeholders of %s in %s',
    (key, lng, text) => {
      expect(placeholders(LOCALES[lng][key] ?? '')).toEqual(placeholders(text));
    }
  );
});

describe('every new word is read by the media library', () => {
  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(MEDIA_READS.length).toBeGreaterThan(30);
    expect(MEDIA_READS).toContain('open_original');
    expect(MEDIA_READS).toContain('open_preview');
    expect(MEDIA_READS).toContain('media_selection_limit');
    expect(APP_READS.length).toBeGreaterThan(1000);
    expect(APP_READS).toContain('add_selected_media');
  });

  it.each([...WORDS.map(([key]) => key), ...Object.keys(COUNTED)])(
    'is read by a t() call in the media components: %s',
    (key) => {
      expect(MEDIA_READS).toContain(key);
    }
  );
});

describe('the words the old tiles read', () => {
  it.each(REMOVED)('%s is gone from en and ar', (key) => {
    expect({ key, en: key in en, ar: key in ar }).toEqual({
      key,
      en: false,
      ar: false,
    });
  });

  it.each(REMOVED)('%s is read by no t() call in the app', (key) => {
    expect(APP_READS).not.toContain(key);
  });
});
