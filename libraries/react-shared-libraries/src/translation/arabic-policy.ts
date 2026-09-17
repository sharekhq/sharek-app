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
];
