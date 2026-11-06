// Guards the "Samy" assistant persona strings (en + ar): the display name and a
// non-empty first-person welcome that introduces Samy, covers the MCP path, and
// drops the direction-specific "left/right menu" wording that lies under RTL.
// (feature 004-brand-ui-refresh, US3 — Samy, the humanized assistant.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

describe('Samy persona locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it('names the assistant "Samy" / "سامي"', () => {
    expect(en.samy).toBe('Samy');
    expect(ar.samy).toBe('سامي');
  });

  it('has an English welcome that introduces Samy, mentions MCP, and is direction-neutral', () => {
    expect(typeof en.samy_welcome_message).toBe('string');
    expect(en.samy_welcome_message.length).toBeGreaterThan(0);
    expect(en.samy_welcome_message).toContain('Samy');
    expect(en.samy_welcome_message).toContain('MCP');
    expect(en.samy_welcome_message).not.toMatch(/left menu|right menu/i);
  });

  it('has an Arabic welcome that introduces سامي and mentions MCP', () => {
    expect(typeof ar.samy_welcome_message).toBe('string');
    expect(ar.samy_welcome_message.length).toBeGreaterThan(0);
    expect(ar.samy_welcome_message).toContain('سامي');
    expect(ar.samy_welcome_message).toContain('MCP');
  });

  // The MCP setup lives in Settings' Developers tab. "Public API" names no tab
  // Sharek has, and upstream's "Agents / Dev" is a rename Sharek did not take.
  it('sends the reader to Settings → Developers for the MCP setup, in both languages', () => {
    expect(en.samy_welcome_message).toContain('Settings → Developers');
    expect(ar.samy_welcome_message).toContain(ar.developers);
    for (const welcome of [en.samy_welcome_message, ar.samy_welcome_message]) {
      expect(welcome).not.toMatch(/Public API|Agents \/ Dev/);
    }
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
