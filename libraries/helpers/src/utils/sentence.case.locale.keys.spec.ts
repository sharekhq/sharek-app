// Guards English sentence case on the dashboard's buttons, tabs, menus,
// headings and window titles (spec 059, FR-037, contracts/strings.md §3): only
// the en values change, so every key stays as it is and the Arabic each key
// carried on main stays word for word. Names and acronyms keep their capitals
// (Sharek, Samy, platform names, AI, API, CLI, ID, MCP, N8N, OAuth), and the
// five feature names written as names keep theirs (Question 5).
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

// [key, en in sentence case, ar as it is on main]
const SENTENCE_CASE = [
  ['global_settings', 'Global settings', 'الإعدادات العامة'],
  ['auto_post', 'Auto post', 'نشر تلقائي'],
  ['team_members', 'Team members', 'أعضاء الفريق'],
  ['email_notifications', 'Email notifications', 'إشعارات البريد الإلكتروني'],
  ['success_emails', 'Success emails', 'رسائل النجاح'],
  ['failure_emails', 'Failure emails', 'رسائل الفشل'],
  ['streak_emails', 'Streak reminder emails', 'رسائل تذكير التتابع'],
  ['date_metrics', 'Date metrics', 'تنسيق الوقت'],
  ['shortlink_settings', 'Shortlink settings', 'إعدادات الروابط المختصرة'],
  ['shortlink_preference', 'Shortlink preference', 'تفضيل الروابط المختصرة'],
  ['approved_apps', 'Approved apps', 'التطبيقات المصرح لها'],
  ['create_oauth_app', 'Create OAuth app', 'إنشاء تطبيق OAuth'],
  ['oauth_application', 'OAuth application', 'تطبيق OAuth'],
  ['edit_app', 'Edit app', 'تعديل التطبيق'],
  ['delete_app', 'Delete app', 'حذف التطبيق'],
  ['copy_id', 'Copy channel ID', 'نسخ معرف القناة'],
  ['copy_secret', 'Copy secret', 'نسخ السر'],
  ['rotate_secret', 'Rotate secret', 'تدوير السر'],
  ['choose_image', 'Choose image', 'اختيار صورة'],
  ['api_key', 'API key', 'مفتاح API'],
  ['rotate_key', 'Rotate key', 'تدوير المفتاح'],
  ['open_wizard', 'Open wizard', 'فتح المعالج'],
  ['copy_all', 'Copy all', 'نسخ الكل'],
  ['n8n_node', 'N8N node', 'عقدة N8N'],
  ['cli_and_skills', 'CLI & AI skills', 'CLI ومهارات الذكاء الاصطناعي'],
  ['mcp_client_configuration', 'MCP client configuration', 'إعدادات عميل MCP'],
  ['use_signature', 'Use signature', 'استخدم التوقيع'],
  ['top_title_edit_signature', 'Edit signature', 'تعديل التوقيع'],
  ['send_test', 'Send test', 'إرسال اختبار'],
  ['add_autopost_title', 'Add autopost', 'إضافة نشر تلقائي'],
  ['edit_autopost', 'Edit autopost', 'تعديل النشر التلقائي'],
  ['send_invitation_link', 'Send invitation link', 'إرسال رابط الدعوة'],
  ['copy_link', 'Copy link', 'نسخ الرابط'],
  ['top_title_add_member', 'Add member', 'إضافة عضو'],
  ['set_plug', 'Set plug', 'ضبط المهمة'],
  ['edit_plug', 'Edit plug', 'تعديل المهمة'],
  ['add_integration', 'Add integration', 'إضافة تكامل'],
  ['delete_integration', 'Delete integration', 'حذف التكامل'],
  ['save_as_set', 'Save as set', 'حفظ كمجموعة'],
  ['cancel_subscription', 'Cancel subscription', 'إلغاء الاشتراك'],
  ['payment_method_required', 'Payment method required', 'طريقة الدفع مطلوبة'],
  ['pay_today', 'Pay today', 'ادفع اليوم'],
  ['try_again', 'Try again', 'المحاولة مرة أخرى'],
  ['create_new_post', 'Create post', 'إنشاء منشور'],
  ['create_post_title', 'Create post', 'إنشاء منشور'],
  ['select_set', 'Select a set', 'اختر مجموعة'],
  ['add_to_calendar', 'Add to calendar', 'أضف إلى التقويم'],
  ['delete_post', 'Delete post', 'حذف المنشور'],
  ['save_set', 'Save set', 'حفظ المجموعة'],
  ['select_channels', 'Select channels', 'اختر القنوات'],
  ['channels_settings', 'Channel settings', 'إعدادات القنوات'],
  ['post_preview', 'Post preview', 'معاينة المنشور'],
  ['repeat_post', 'Repeat post', 'تكرار المنشور'],
  ['add_tag', 'Add tag', 'إضافة وسم'],
  ['change_date_or_time', 'Change date or time', 'تغيير التاريخ أو الوقت'],
  ['your_assistant', 'Your assistant', 'مساعدك'],
  ['connect_post', 'Connect post', 'ربط المنشور'],
  ['install_extension', 'Install extension', 'تثبيت الإضافة'],
  ['register_agent', 'Register agent', 'تسجيل الوكيل'],
  ['add_channel', 'Add channel', 'إضافة قناة'],
  ['add_community', 'Add community', 'أضف مجتمع'],
  ['add_subreddit', 'Add subreddit', 'أضف منتدى فرعي'],
  ['copy_code', 'Copy code', 'نسخ الرمز'],
  ['media_settings', 'Media settings', 'إعدادات الوسائط'],
  ['media_editor', 'Media editor', 'محرر الوسائط'],
] as const;

// Feature names written as names: Media Library, Insert Media and Design Media
// keep their capitals.
const FEATURE_NAMES = [
  ['media_library', 'Media Library'],
  ['insert_media', 'Insert Media'],
  ['design_media', 'Design Media'],
] as const;

// The sign-in pages (spec 060, FR-031, contracts/strings.md §3): [key, en in
// sentence case, ar as it is on main].
const SIGN_IN_PAGES = [
  ['sign_in', 'Sign in', 'تسجيل الدخول'],
  ['sign_up', 'Sign up', 'تسجيل حساب'],
  ['continue_with', 'Continue with', 'المتابعة باستخدام'],
  ['or', 'or', 'أو'],
  ['email_address', 'Email address', 'عنوان البريد الإلكتروني'],
  ['don_t_have_an_account', "Don't have an account?", 'ليس لديك حساب؟'],
  [
    'already_have_an_account',
    'Already have an account?',
    'هل لديك حساب بالفعل؟',
  ],
  ['create_account', 'Create account', 'إنشاء حساب'],
  [
    'resend_activation_email',
    'Resend activation email',
    'إعادة إرسال بريد التفعيل',
  ],
  ['forgot_password_1', 'Forgot password', 'نسيت كلمة المرور'],
  [
    'send_password_reset_email',
    'Send password reset email',
    'إرسال بريد إعادة تعيين كلمة المرور',
  ],
  ['label_new_password', 'New password', 'كلمة المرور الجديدة'],
  ['label_repeat_password', 'Repeat password', 'أعد إدخال كلمة المرور'],
  ['change_password', 'Change password', 'تغيير كلمة المرور'],
] as const;

// Documents' names keep their capitals.
const DOCUMENT_NAMES = [
  ['terms_of_service', 'Terms of Service'],
  ['privacy_policy', 'Privacy Policy'],
] as const;

describe('Sentence case locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each(SENTENCE_CASE)('reads %s as "%s" in en', (key, enText) => {
    expect(en[key]).toBe(enText);
  });

  it.each(SENTENCE_CASE)(
    'keeps the Arabic of %s as it is on main',
    (key, _enText, arText) => {
      expect(ar[key]).toBe(arText);
    }
  );

  it.each(SIGN_IN_PAGES)('reads %s as "%s" in en', (key, enText) => {
    expect(en[key]).toBe(enText);
  });

  it.each(SIGN_IN_PAGES)(
    'keeps the Arabic of %s as it is on main',
    (key, _enText, arText) => {
      expect(ar[key]).toBe(arText);
    }
  );

  it.each(DOCUMENT_NAMES)(
    'keeps the document name %s as "%s" in en',
    (key, enText) => {
      expect(en[key]).toBe(enText);
    }
  );

  it.each(FEATURE_NAMES)(
    'keeps the feature name %s as "%s" in en',
    (key, enText) => {
      expect(en[key]).toBe(enText);
    }
  );
});
