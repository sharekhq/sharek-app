// Guards the Studio workspace's strings (spec 061, part 2): each tool's page, its sample, its
// stage and the top bar's tool switcher, the way studio.locale.keys.spec.ts guards the Studio
// page. Like Studio's, these keys live in en and ar only, so only those two are read. The new
// words are plan.md § i18n's "Part 2 (new)" table, word for word; the four keys the windows'
// result steps read are gone from both, and the window notes that still have a window stay.
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

const FRONTEND_DIR = path.join(__dirname, '../../../../apps/frontend/src');
const COMPONENTS_DIR = path.join(FRONTEND_DIR, 'components');

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

// The workspace's parts, the two tools and Image Text Slides on them, and the layouts, the
// tool page's (layout.studio.tool.component.tsx) among them.
const WORKSPACE_READS = keysRead([
  ...sourcesIn(path.join(COMPONENTS_DIR, 'studio')),
  path.join(COMPONENTS_DIR, 'launches/ai.image.tsx'),
  path.join(COMPONENTS_DIR, 'launches/ai.video.tsx'),
  path.join(COMPONENTS_DIR, 'videos/providers/image-text-slides.provider.tsx'),
  ...sourcesIn(path.join(COMPONENTS_DIR, 'new-layout')),
]).filter((key) => /^(workspace|slides_empty)_/.test(key));
const APP_READS = keysRead(sourcesIn(FRONTEND_DIR));

// [key, en, ar]: plan.md § i18n, "Part 2 (new)".
const STRINGS = [
  ['workspace_sample', 'Sample', 'مثال'],
  ['workspace_image_empty_title', 'Your image appears here', 'ستظهر صورتك هنا'],
  [
    'workspace_image_empty_body',
    'Describe it, pick a shape and a style, then press Generate.',
    'صف الصورة واختر شكلها ونمطها، ثم اضغط توليد.',
  ],
  ['workspace_try_one', 'Try one', 'جرب مثالًا'],
  [
    'workspace_example_1',
    'Iced lemonade on a sunny terrace',
    'ليموناضة مثلجة على شرفة مشمسة',
  ],
  [
    'workspace_example_2',
    'Coffee on a marble table, morning light',
    'قهوة على طاولة رخامية في ضوء الصباح',
  ],
  [
    'workspace_example_3',
    'Ramadan sweets from above',
    'حلويات رمضان من الأعلى',
  ],
  [
    'workspace_video_empty_title',
    'Your video appears here',
    'سيظهر الفيديو هنا',
  ],
  [
    'workspace_video_empty_body',
    'Fill in the settings, then press Generate.',
    'املأ الإعدادات، ثم اضغط توليد.',
  ],
  ['slides_empty_title', 'Your script appears here', 'سيظهر النص هنا'],
  [
    'slides_empty_body',
    'Press Continue and Sharek writes a script, slide by slide. You edit it here before anything is charged.',
    'اضغط متابعة وسيكتب شارك النص شريحة بشريحة، ثم تعدله هنا قبل خصم أي رصيد.',
  ],
  [
    'workspace_leave_note_image',
    "You can leave this page. The image is saved to your Media library when it's ready.",
    'يمكنك مغادرة هذه الصفحة. ستحفظ الصورة في مكتبة الوسائط عند جاهزيتها.',
  ],
  [
    'workspace_leave_note_video',
    "You can leave this page. The video is saved to your Media library when it's ready.",
    'يمكنك مغادرة هذه الصفحة. سيحفظ الفيديو في مكتبة الوسائط عند جاهزيته.',
  ],
  ['workspace_download', 'Download', 'تنزيل'],
  ['workspace_generate_again', 'Generate again', 'توليد مرة أخرى'],
  ['workspace_working', 'Creating…', 'جاري الإنشاء…'],
  [
    'workspace_settings_summary_image',
    'Prompt, brand, shape and style',
    'الموجه والعلامة التجارية والشكل والنمط',
  ],
  [
    'workspace_settings_summary_video',
    'Prompt and settings',
    'الموجه والإعدادات',
  ],
  ['workspace_switch_tool', 'Switch tool: {{name}}', 'تبديل الأداة: {{name}}'],
  ['workspace_ready_image', 'Your image is ready', 'صورتك جاهزة'],
  ['workspace_ready_video', 'Your video is ready', 'الفيديو جاهز'],
  ['workspace_open', 'Open', 'فتح'],
] as const;

// The way back to the prompt is gone (the prompt is always on screen), so the refusal for an
// edited image that is gone names the prompt field instead (tasks.md D15(d)). The Arabic names
// the field by its label, the prompt key's الموجه.
const REWORDED = [
  [
    'image_edit_missing',
    "The image you're editing is no longer in your Media library. Use the prompt to make a new one.",
    'لم تعد الصورة التي تعدلها موجودة في مكتبة الوسائط. استخدم الموجه لإنشاء صورة جديدة.',
  ],
] as const;

// What the windows' result steps read: the AI image window's Back to prompt, Regenerate and
// Edit prompt, which the page's settings beside the result replace, and the image's
// close-the-window note for Studio, which always has a page now.
const REMOVED = [
  'back_to_prompt',
  'regenerate',
  'edit_prompt',
  'close_window_note_media',
];

// Image Text Slides' Edit script after a video (tasks.md D7), and the video window notes: a
// provider with no page still opens a window for Studio, and the composer's video window
// stays until part 3 (D8).
const KEPT = [
  'edit_script',
  'close_window_video_note_media',
  'close_window_video_note',
];

const placeholders = (value: string) =>
  Array.from(value.matchAll(/{{\s*(\w+)\s*}}/g), (m) => m[1]).sort();

describe('Studio workspace locale keys', () => {
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

  it.each([['workspace_switch_tool', ['name']]])(
    'keeps the placeholders of %s in both languages',
    (key, names) => {
      expect(placeholders(en[key] ?? '')).toEqual(names);
      expect(placeholders(ar[key] ?? '')).toEqual(names);
    }
  );
});

describe('the refusal part 2 rewords', () => {
  it.each(REWORDED)(
    'reads %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(en[key]).toBe(enText);
      expect(ar[key]).toBe(arText);
    }
  );
});

describe('every workspace string the tools render', () => {
  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(WORKSPACE_READS.length).toBeGreaterThan(15);
    expect(WORKSPACE_READS).toContain('workspace_sample');
    expect(WORKSPACE_READS).toContain('workspace_switch_tool');
    expect(WORKSPACE_READS).toContain('workspace_image_empty_title');
    expect(WORKSPACE_READS).toContain('workspace_video_empty_title');
    expect(WORKSPACE_READS).toContain('slides_empty_title');
    expect(APP_READS.length).toBeGreaterThan(1000);
    expect(APP_READS).toContain('edit_script');
  });

  it.each(WORKSPACE_READS)('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    expect(ar[key]).not.toBe(en[key]);
    // A placeholder missing from one side renders braces or drops the value.
    expect(placeholders(ar[key])).toEqual(placeholders(en[key]));
  });
});

describe("the words the windows' result steps read", () => {
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

describe('the words that stay', () => {
  it.each(KEPT)('%s is kept in en and ar', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    expect(ar[key]).not.toBe(en[key]);
  });
});
