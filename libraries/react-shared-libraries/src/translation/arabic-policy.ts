// Arabic copy policy: which English text is English on purpose, and which Arabic
// words the product stopped using. Read by arabic.product.names.spec.ts (C2),
// arabic.hardcoded.english.spec.ts (C3) and arabic.glossary.spec.ts (C5), so the
// three cannot disagree. Sits beside i18n.config.ts, which the locale checks
// already import from.

// Products their own communities write in Latin. An Arabic spelling nobody uses
// reads worse than the Latin name, so a scan reporting these as untranslated is
// reporting a non-defect. The other nineteen platform_* labels are Arabic and C2
// enforces them in both directions, with the label as the source of truth.
export const KEEP_LATIN_PRODUCTS = [
  'Dev.to',
  'Dribbble',
  'Hashnode',
  'Lemmy',
  'Listmonk',
  'MeWe',
  'Moltbook',
  'Nostr',
  'Skool',
  'Whop',
  'Warpcast',
  'VK',
] as const;

// Technical tokens that stay Latin inside Arabic prose, per the fork's i18n rule.
export const KEEP_LATIN_TOKENS = [
  'API',
  'MCP',
  'OAuth',
  'CLI',
  'UGC',
  '1080p',
] as const;

// AI agents and editors the MCP and onboarding screens name. Product names like the
// twelve above, and Latin for the same reason: nobody writes كلود كود.
//
// A separate list rather than more entries in KEEP_LATIN_PRODUCTS, because that array
// is not a general keep-Latin list — C2 asserts it equals *exactly* the set of
// platform_* labels whose Arabic is left in Latin, in both directions. Folding
// fourteen agents into it would fail C2 on fourteen products that have no platform
// label at all, and the only way to make it pass again would be to weaken the
// assertion that catches a product silently left untranslated.
//
// The set is the union of the three lists the screens actually render:
// remoteMcpClients and chatOnlyMcpClients keys and mcpClients in
// public-api/public.component.tsx, and onboardingAgents in onboarding/onboarding.modal.tsx.
// Research R12 named eleven of these; OpenClaw, NanoClaw and ChatGPT were read off the
// code on 2026-09-17 and added, so the list matches what is on screen rather than what
// planning remembered.
export const KEEP_LATIN_AGENTS = [
  'Amp',
  'ChatGPT',
  'Claude',
  'Claude Code',
  'Codex',
  'Cursor',
  'Gemini CLI',
  'Grok Bot',
  'Hermes',
  'NanoClaw',
  'OpenClaw',
  'VS Code / Copilot',
  'Warp',
  'Windsurf',
] as const;

// The plugs concept, named once.
//
// The app called it three things in Arabic — إعلانات ("advertisements"), ملحقات and
// التوصيل التلقائي — so the navigation entry and the empty state beside it did not
// look like the same feature. sharek.app calls it الإضافات, and that settles it.
//
// Two of the three retire as terms below. إعلان cannot: seven keys use it correctly
// for Announcement (add_announcement, create_announcement, delete_announcement and
// friends), and a check that flags correct Arabic teaches the reader to ignore it. So
// the third is caught by scope instead — C5 applies this rule only to keys whose
// ENGLISH value names the concept, computed from en rather than listed here, so a
// future plug_ key whose English says "plug" joins automatically while "Auto Repost
// Posts" correctly does not.
//
// The word is المهام, decided 2026-09-17 after إضافات was drafted and rejected: إضاف is
// this locale's verb for "add" in 86 values (إضافة قناة، إضافة عضو), so an إضافة cannot
// be a thing that acts, and "إضافة تلقائية" is already shipped for the unrelated
// auto_add. أتمتة was considered and reserved for a later feature.
export const PLUG_CONCEPT = {
  /** Matches the English value of a key that names the concept. */
  english: /\bplugs?\b/i,
  /**
   * Matches the Arabic every such key must carry. A pattern rather than a stem,
   * because مهمة and مهام share no contiguous substring — the alef sits where the
   * second م would be — so `includes('مهم')` would pass the singular and fail every
   * plural. It is also why a stem test would be wrong here on meaning: مهم on its own
   * is the adjective "important".
   */
  arabic: /مهمة|مهام/,
  /** Stems that mean this key is still on one of the three old names. */
  forbidden: ['إعلان', 'ملحق', 'توصيل'],
} as const;

export interface RetiredTerm {
  /** The word the product stopped using, as it appears in an Arabic string. */
  term: string;
  /** The word that replaced it — what the marketing site says for this concept. */
  replacement: string;
  /** The concept both words name, so a failure reads as a sentence. */
  concept: string;
}

// Words the app used where sharek.app uses another for the same concept, measured
// over the site's Arabic corpus against the full ar locale (research R6).
//
// C5 matches whole words with attached particles stripped, never substrings —
// مشاركة is a substring of مشاركات, رق of رقم — and stripping a particle needs a
// floor: فرق ("difference", already shipped as الفرق) is not ف + رق. A stem under
// three letters is only ever matched whole.
export const RETIRED_TERMS: readonly RetiredTerm[] = [
  { term: 'باقة', replacement: 'خطة', concept: 'plan' },
  // Two forms of one word: رقِّ as written today, and رق as the vocalisation fix
  // would leave it — a different word entirely, so both are retired.
  { term: 'رقِّ', replacement: 'طور', concept: 'upgrade' },
  { term: 'رق', replacement: 'طور', concept: 'upgrade' },
  // Research R6 proposed two more. Both were dropped after reading the English
  // beside each use, and must not be added back: مشاركة translates *share* in all
  // four of its uses (share_with_a_client is "Share with a client"), and وصل has no
  // uses at all — R6's six were وصلت، وصلنا، الموصل caught as substrings. Retiring
  // either makes C5 fail on correct Arabic.
  //
  // Analytics: the app wrote it three ways — تحليلات on six keys, إحصاءات on four,
  // إحصائيات on three. Settled by R6's own rule, the one the other four concepts were
  // decided by: adopt the marketing site's word, and the site writes تحليلات thirty
  // times against إحصاءات twice. Both losing forms retire, so this is two entries
  // rather than the one R6 anticipated when it read the pair as a spelling choice.
  { term: 'إحصاءات', replacement: 'تحليلات', concept: 'analytics' },
  { term: 'إحصائيات', replacement: 'تحليلات', concept: 'analytics' },
  //
  // Plugs, the sixth concept, found by feature 029 on the deployed build: the
  // navigation said إعلانات while the empty state under it said ملحقات and the modal
  // title said التوصيل التلقائي. Two of the three retire here; the third is إعلان,
  // which is correct Arabic for Announcement on seven other keys and so is handled by
  // PLUG_CONCEPT's scoped rule above instead of by a global retirement.
  //
  // التوصيل التلقائي is two words, so C5 matches it as a phrase. The word-by-word
  // matcher with its three-letter floor cannot see it: وصل — which R6 already found
  // has no real uses and must not be retired — is the only single word in it that
  // would match, and it would match الموصل too.
  { term: 'ملحقات', replacement: 'مهام', concept: 'plugs' },
  { term: 'التوصيل التلقائي', replacement: 'مهام', concept: 'plugs' },
];
