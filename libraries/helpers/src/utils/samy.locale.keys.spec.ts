// Guards the "Samy" assistant persona strings (en + ar): the display name, and
// the welcome block an empty chat shows (spec 059, contracts/strings.md §1
// Samy's welcome; the words are spec.md's, User Story 3 and Assumptions),
// which replaces the old one-paragraph welcome. (feature 004-brand-ui-refresh,
// US3 — Samy, the humanized assistant.)
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

// The welcome block an empty chat shows, [key, en, ar]: the heading, the line,
// the four ideas, the hint, and the ideas' list name for screen readers.
const WELCOME = [
  ['samy_welcome_title', "Hi, I'm Samy 👋", 'مرحبًا، أنا سامي 👋'],
  [
    'samy_welcome_line',
    "Tell me what you want to post. I'll write it, make the pictures and schedule it on your channels.",
    'أخبرني ماذا تريد أن تنشر، وسأكتبه وأصنع صوره وأجدوله على قنواتك.',
  ],
  [
    'samy_idea_plan_week',
    "Plan next week's posts",
    'خطط لمنشورات الأسبوع القادم',
  ],
  [
    'samy_idea_offer_post',
    'Write a post about an offer',
    'اكتب منشورًا عن عرض',
  ],
  [
    'samy_idea_instagram_image',
    'Make an image for Instagram',
    'اصنع صورة لإنستغرام',
  ],
  [
    'samy_idea_month_ideas',
    'Give me post ideas for this month',
    'اقترح أفكار منشورات لهذا الشهر',
  ],
  [
    'samy_welcome_hint',
    "Tick channels in the Channels panel and I'll post to those.",
    'اختر القنوات من لوحة القنوات وسأنشر عليها.',
  ],
  ['samy_welcome_ideas', 'Ideas to start', 'أفكار للبدء'],
] as const;

describe('Samy persona locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it('names the assistant "Samy" / "سامي"', () => {
    expect(en.samy).toBe('Samy');
    expect(ar.samy).toBe('سامي');
  });

  it.each(WELCOME)(
    'reads %s as "%s" in en and "%s" in ar',
    (key, english, arabic) => {
      expect(en[key]).toBe(english);
      expect(ar[key]).toBe(arabic);
    }
  );

  // Translated, not copied across, and no mark but tanween fath.
  it.each(WELCOME)('translates %s, with no mark but tanween fath', (key) => {
    expect(typeof ar[key]).toBe('string');
    expect(ar[key]).not.toBe(en[key]);
    expect(ar[key]).not.toMatch(/[ٌ-ْ]/);
  });

  // The old welcome pointed to the MCP setup; the new one does not
  // (contracts/strings.md §2).
  it.each(WELCOME)('names no MCP in %s, in either language', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(typeof ar[key]).toBe('string');
    expect(en[key]).not.toMatch(/MCP/);
    expect(ar[key]).not.toMatch(/MCP/);
  });

  it.each(languages)('has no samy_welcome_message in %s', (lng) => {
    expect(readLocale(lng)).not.toHaveProperty('samy_welcome_message');
  });
});

// Samy's box and the message it sends (spec 050, contracts/chat-ui.md). The
// preview set the first three, and the Arabic of the two "no longer available"
// strings waits on the maintainer's read at the walk.
describe("the strings of Samy's message box", () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each([
    ['samy_ai_image', 'AI Image', 'توليد صورة'],
    ['samy_drop_title', 'Drop your images here', 'أفلت صورك هنا'],
    [
      'samy_drop_subtitle',
      "They'll be added to your message",
      'ستضاف إلى رسالتك',
    ],
    ['samy_attached_image', 'Attached image {{n}}', 'الصورة المرفقة {{n}}'],
    ['samy_attached_video', 'Attached video {{n}}', 'الفيديو المرفق {{n}}'],
    ['samy_remove_attachment', 'Remove attachment {{n}}', 'إزالة المرفق {{n}}'],
    [
      'samy_image_unavailable',
      'This image is no longer available',
      'هذه الصورة لم تعد متاحة',
    ],
    [
      'samy_video_unavailable',
      'This video is no longer available',
      'هذا الفيديو لم يعد متاحًا',
    ],
    ['samy_created_image', 'Image Samy made', 'صورة أنشأها سامي'],
    ['samy_video_rendering', 'Your video is rendering', 'جاري تجهيز الفيديو'],
    [
      'samy_video_rendering_sub',
      "It will play here when it's ready. You can keep chatting.",
      'سيعمل هنا عند اكتماله، ويمكنك متابعة المحادثة.',
    ],
    [
      'samy_video_failed',
      "This video couldn't be made",
      'تعذر إنشاء هذا الفيديو',
    ],
    [
      'samy_video_pointer',
      "If this video finished, it's in your Media library",
      'إذا اكتمل هذا الفيديو فستجده في مكتبة الوسائط',
    ],
  ])(
    '%s reads the same in the app as in the contract',
    (key, english, arabic) => {
      expect(en[key]).toBe(english);
      expect(ar[key]).toBe(arabic);
    }
  );
});
