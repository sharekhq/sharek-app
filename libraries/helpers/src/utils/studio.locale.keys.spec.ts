// Guards Studio's strings (spec 055, increment 1), the way billing.locale.keys.spec.ts guards
// the billing surfaces and brands.locale.keys.spec.ts pins the Brands page's words. Studio's
// keys live in en and ar only (spec 022's house rule), so only those two are read. The new
// words are data-model §6's Studio table, word for word, and the three category keys the old
// catalogue read are gone from both.
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);
const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;
const en = readLocale('en');
const ar = readLocale('ar');

const COMPONENTS_DIR = path.join(
  __dirname,
  '../../../../apps/frontend/src/components'
);

// Studio's components, their specs aside.
const STUDIO_DIR = path.join(COMPONENTS_DIR, 'studio');
const STUDIO_SOURCE = fs
  .readdirSync(STUDIO_DIR)
  .filter((file) => /\.tsx?$/.test(file) && !/\.spec\./.test(file))
  .map((file) => fs.readFileSync(path.join(STUDIO_DIR, file), 'utf8'))
  .join('\n');

// Veo 3 presents itself to Studio, so its facts are keys on its card, not t() calls.
const VEO3_SOURCE = fs.readFileSync(
  path.join(COMPONENTS_DIR, 'videos/providers/veo3.provider.tsx'),
  'utf8'
);

// [key, en, ar]: data-model §6's Studio table.
const STRINGS = [
  ['studio_category_images', 'Images', 'الصور'],
  ['studio_category_video', 'Video', 'الفيديو'],
  ['studio_category_edit', 'Edit & enhance', 'التحرير والتحسين'],
  ['studio_category_branding', 'Branding', 'الهوية البصرية'],
  ['studio_chip_all', 'All', 'الكل'],
  ['studio_chips_label', 'Filter by category', 'تصفية حسب الفئة'],
  ['studio_search', 'Search tools and models', 'ابحث في الأدوات والنماذج'],
  ['studio_section_tools', 'Tools', 'الأدوات'],
  [
    'studio_section_tools_sub',
    'Made for one job, like an image or a slideshow.',
    'جاهزة لمهمة واحدة، مثل صورة أو عرض شرائح.',
  ],
  ['studio_section_models', 'Models', 'النماذج'],
  [
    'studio_section_models_sub',
    'Choose the exact AI model when you want full control over the result.',
    'اختر نموذج الذكاء الاصطناعي بنفسك عندما تريد تحكمًا كاملًا في النتيجة.',
  ],
  [
    'studio_model_by',
    'by {{maker}} · {{category}}',
    'من {{maker}} · {{category}}',
  ],
  [
    'studio_no_match_title',
    'Nothing matches “{{query}}”',
    'لا توجد نتائج لـ «{{query}}»',
  ],
  [
    'studio_no_match_body',
    'Try another word, or clear the search to see every tool.',
    'جرب كلمة أخرى، أو امسح البحث لرؤية كل الأدوات.',
  ],
  ['studio_clear_search', 'Clear search', 'مسح البحث'],
  ['video_type_veo3_fact_sound', 'Sound', 'صوت'],
] as const;

const VEO3_KEYS: readonly string[] = ['video_type_veo3_fact_sound'];

// The old catalogue's categories, which the new four replace.
const REMOVED = [
  'studio_category_design',
  'studio_category_ai_images',
  'studio_category_ai_video',
];

const placeholders = (value: string) =>
  Array.from(value.matchAll(/{{\s*(\w+)\s*}}/g), (m) => m[1]).sort();

// Read off the components, not listed: a list cannot catch the next inline-default-only key.
const referenced = Array.from(
  new Set(
    Array.from(
      STUDIO_SOURCE.matchAll(
        /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*['"]([A-Za-z0-9_]+)['"]/g
      ),
      (match) => match[1]
    )
  )
).sort();

describe('Studio locale keys', () => {
  it.each(STRINGS)(
    'reads %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(en[key]).toBe(enText);
      expect(ar[key]).toBe(arText);
    }
  );

  // Identical bytes in both locales means the English was copied across rather than translated.
  it.each(STRINGS.map(([key]) => key))(
    'translates %s: its Arabic is not its English',
    (key) => {
      expect(typeof ar[key]).toBe('string');
      expect(ar[key]).not.toBe(en[key]);
    }
  );

  it.each([
    ['studio_model_by', ['category', 'maker']],
    ['studio_no_match_title', ['query']],
  ])('keeps the placeholders of %s in both languages', (key, names) => {
    expect(placeholders(en[key] ?? '')).toEqual(names);
    expect(placeholders(ar[key] ?? '')).toEqual(names);
  });
});

describe('every string Studio renders', () => {
  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(referenced.length).toBeGreaterThan(15);
    expect(referenced).toContain('studio_chip_all');
    expect(referenced).toContain('studio_category_images');
    expect(referenced).toContain('studio_upgrade');
    expect(referenced).toContain('studio_saved_to_media');
  });

  it.each(referenced)('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    expect(ar[key]).not.toBe(en[key]);
    // A placeholder missing from one side renders braces or drops the value.
    expect(placeholders(ar[key])).toEqual(placeholders(en[key]));
  });
});

describe('the words the old catalogue read', () => {
  it.each(REMOVED)('%s is gone from en and ar', (key) => {
    expect({ key, en: key in en, ar: key in ar }).toEqual({
      key,
      en: false,
      ar: false,
    });
  });
});

// Red until the page reads them (tasks.md T008 and T009): a key nothing reads is a string the
// app shows in English or not at all.
describe('every new word is read by the app', () => {
  it.each(
    STRINGS.map(([key]) => key).filter((key) => !VEO3_KEYS.includes(key))
  )("is read by a t() call in Studio's components: %s", (key) => {
    expect(referenced).toContain(key);
  });

  it.each(VEO3_KEYS)("is read as a key: on Veo 3's card: %s", (key) => {
    const keys = Array.from(
      VEO3_SOURCE.matchAll(/\bkey:\s*'([A-Za-z0-9_]+)'/g),
      (match) => match[1]
    );
    expect(keys).toContain(key);
  });
});
