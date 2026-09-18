// Feature 029-arabic-audit-followup (C3 v2) — rewrite of 028's regex detector.
//
// Guards the in-scope frontend against user-visible English that never reaches a
// translation key. That was the defect behind the reported "Arabic is half English":
// ar carries every one of en's keys with nothing missing, so no comparison of locale
// files could ever have found it — the English was in the components.
//
// 028's detector found 134 of them with regular expressions, and then the rollout walk
// found more, in five shapes it could not see: a text node mixing a translated
// expression with a literal, a string in a conditional arm, an apostrophe in an
// attribute, an apostrophe inside a text node (the string-blanking pass read it as a
// quote and went blind to the rest of the file), and option lists in channel panels.
// Messages handed to toasts, titles in object literals, template literals and browser
// tab titles were never candidates at all.
//
// So the detector is rewritten on the compiler's syntax tree, and its bias is
// INVERTED. 028 reported only shapes it recognised and tolerated everything else,
// which is why each new shape escaped in silence. This one reports every prose literal
// by default and tolerates one only when its syntactic context is on the deny-list
// below with a written reason. A new shape is caught without anyone anticipating it; a
// new non-user-facing context produces a false positive somebody has to name. That
// trade is the point: the failure mode moves from silence to noise.
//
// Scoped by directory minus exclusions, NOT by a list of the files this feature
// cleaned. An allow-list cannot fail for the one reason this check most needs to: if
// confirmation wrongly discards a true finding, that file is simply absent from the
// list and the check stays green.
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import {
  KEEP_LATIN_AGENTS,
  KEEP_LATIN_PRODUCTS,
  KEEP_LATIN_TOKENS,
} from '@gitroom/react/translation/arabic-policy';
import { deriveTranslationKey } from '@gitroom/react/translation/derive-key';

const REPO_ROOT = path.join(__dirname, '../../../..');

const ROOTS = ['apps/frontend/src/components', 'apps/frontend/src/app'];

interface Exclusion {
  /** Matched against the repo-relative path. */
  pattern: RegExp;
  /** Why nothing in this file reaches an Arabic reader. */
  reason: string;
}

// Whole files the detector does not walk. Reachability is a human trace to an entry
// point (FR-002), never an inference, so each reason names the trace that failed.
const EXCLUDE: readonly Exclusion[] = [
  {
    pattern: /\/admin\//,
    reason:
      'The super-admin surface. Reached only by a Sharek operator through the impersonation bar, never by a customer, and nobody agreed to translate it.',
  },
  {
    pattern: /impersonate/,
    reason: 'Part of the same super-admin surface as /admin/.',
  },
  {
    pattern: /\/third-parties\//,
    reason:
      'The Integrations screen is hidden behind SHOW_THIRD_PARTY, which is unset in production, so no reader reaches it.',
  },
  {
    pattern: /analytics\.component/,
    reason:
      'Excluded by 028 and still out of scope: the third-party analytics embed renders vendor markup, not our copy.',
  },
  {
    pattern: /\.spec\.tsx$/,
    reason: 'Test files render to nobody.',
  },
  {
    pattern: /import-debug-post\.modal/,
    reason:
      'Opened from exactly one place: ImportDebugPost in layout/impersonate.tsx:841, inside the super-admin impersonation bar. The /impersonate/ pattern above covers the bar but not this modal, which lives under components/launches, so it needs its own entry.',
  },
  {
    pattern: /chatbase\.component/,
    reason:
      'The Chatbase support widget and its refund flow render only when isChatBase is true, which is !!process.env.CHATBASE_TOKEN. CHATBASE_TOKEN is referenced in exactly two files of code and declared in no .env.example and no compose file, so this deployment never sets it and the support surface is the Discord path beside it. The day someone sets it, these nine strings are defects again — the reason, not the file, is what would have changed.',
  },
  {
    pattern: /\/route\.ts$/,
    reason:
      'Route handlers return HTTP responses. Their strings are protocol, not UI, and no component renders them.',
  },
];

const KEEP_LATIN = new Set<string>([
  ...KEEP_LATIN_PRODUCTS,
  ...KEEP_LATIN_TOKENS,
  ...KEEP_LATIN_AGENTS,
]);

// Capitalised words the prose heuristic would otherwise admit. They are keyboard keys
// compared against event.key, never text.
const KEY_NAMES = new Set([
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

interface Exemption {
  /** Path suffix the literal is allowed to live at. */
  file: string;
  /** The literal itself, exactly. */
  text: string;
  /** Why it is not a defect. An entry without one is a failure. */
  reason: string;
}

// Confirmed non-defects, each read in context during T012 and recorded in
// audit/confirmation-notes.md. Deliberately keyed by file as well as text: the same
// word can be correct in one place and a defect in another, and "Sharek" is exactly
// that — the Latin lockup owns it, the nav logo does not.
const EXEMPT: readonly Exemption[] = [
  {
    file: 'components/new-launch/providers/gmb/gmb.provider.tsx',
    text: 'SAVE20',
    reason:
      'A sample coupon code in a placeholder. Coupon codes are Latin alphanumeric, so this is a format example rather than prose.',
  },
  {
    file: 'components/ui/logo-text.component.tsx',
    text: 'Sharek',
    reason:
      'The component renders a Latin lockup beside an Arabic one and already gives the Arabic mark aria-label="شارك". The Latin name belongs to the Latin mark. The same word at new-layout/logo.tsx is a finding, because that file has no Arabic variant.',
  },
  // --- confirmed during 029's T012, each traced in audit/confirmation-notes.md ---
  {
    file: 'components/agents/agent.chat.tsx',
    text: '[--Media--]',
    reason:
      'A fence in the message text sent to the agent, marking where the attachment list starts and ends. The model parses it; nobody reads it. Translating it would break the parse.',
  },
  {
    file: 'components/agents/agent.chat.tsx',
    text: 'Video: {{path}}',
    reason:
      'Labels one attachment path inside the [--Media--] fence above. Part of the same agent-facing payload, not screen text.',
  },
  {
    file: 'components/agents/agent.chat.tsx',
    text: 'Image: {{path}}',
    reason: 'The image half of the same agent-facing attachment payload.',
  },
  {
    file: 'components/auth/register.tsx',
    text: 'Email already exists',
    reason:
      'Returned by getHelpfulReasonForRegistrationFailure, which is declared once and called nowhere in apps or libraries — pre-existing dead code. Mentioned rather than deleted (it is not this feature to remove), and exempted rather than translated, because translating a string nobody renders adds a key for nothing. If the function is ever wired up, all three of its strings become defects.',
  },
  {
    file: 'components/auth/register.tsx',
    text: 'Your browser got a 404 when trying to contact the API, the most likely reasons for this are the NEXT_PUBLIC_BACKEND_URL is set incorrectly, or the backend is not running.',
    reason:
      'Same dead function as above, and addressed to whoever is deploying the app rather than to a reader.',
  },
  {
    file: 'components/auth/register.tsx',
    text: 'Unhandled error:',
    reason: 'Same dead function as above.',
  },
  {
    file: 'components/launches/helpers/use.custom.provider.function.ts',
    text: 'Failed to fetch',
    reason:
      'Thrown, never rendered. None of the twenty-eight components that call useCustomProviderFunction catches it, so it reaches the root boundary, which renders <NextError statusCode={0} /> and never the message.',
  },
  {
    file: 'components/launches/add.provider.component.tsx',
    text: 'Extension not reachable',
    reason:
      "Thrown, never rendered — the sibling of 'Failed to fetch' above. The reject is caught by a bare `catch {}` that takes no binding, so the Error is discarded and the toast shows extension_not_installed, which is already translated. Found after the row was approved: the approval settled a wording, not whether a reader reaches it (FR-002), and a key nobody renders is one six locales would inherit for nothing.",
  },
  {
    file: 'components/post-url-selector/post.url.selector.tsx',
    text: '(post:{{id}})',
    reason:
      'Opens the (post:<id>) marker written into the post body and parsed again later. A token in the content, not text on a screen, and translating it would break the parse.',
  },
  {
    file: 'components/onboarding/onboarding.modal.tsx',
    text: 'Bearer {{apiKey}}',
    reason:
      'The HTTP authorization scheme in an Authorization header. Protocol, and the server rejects any other spelling.',
  },
  {
    file: 'components/public-api/public.component.tsx',
    text: 'Bearer {{apiKey}}',
    reason: 'The same Authorization scheme token, built once for the setup snippets.',
  },
  {
    file: 'components/public-api/public.component.tsx',
    text: 'Install the Sharek CLI with `npm install -g sharek-cli`, then install the Sharek skill with `npx skills add sharekhq/sharek-agent`. Ask me for my Sharek API key and set it as the SHAREK_API_KEY environment variable before using the CLI.',
    reason:
      'The instruction the user pastes into an English-reading agent, which then executes it. The file says so at the declaration. The hint above it, which is the part addressed to the user, is translated.',
  },
  {
    file: 'components/settings/github.component.tsx',
    text: 'Github Connect',
    reason:
      "The second argument of window.open is the window NAME — the handle a later open() reuses to target the same popup — not text anyone reads. The audit filed it as screen text; it is not one, and translating it would make the name change with the language. Every other window.open in this app passes '_blank' there.",
  },
  {
    file: 'components/onboarding/onboarding.modal.tsx',
    text: 'Other agents',
    reason:
      "The identifier of the tab that groups every MCP client with no tab of its own. It is compared against the selected tab and used as a literal type (typeof otherTab), never rendered as itself: the one place it reaches the screen reads `item === otherTab ? t('other_agents', 'Other agents') : item`.",
  },
];

// Tables whose every value is already handed to t() as its DEFAULT, under a key built
// from the entry's own id at the render site: ASPECT_TILES is read as
// t(`image_aspect_${id}`, tile.label) at all three of its render sites, and
// AUDIO_LABELS / AUDIO_HINTS as t(`veo3_audio_${option}`, …). The English in the table
// is what a reader sees only when that key is missing — which is exactly what the
// second argument of a t() call is, and this check already denies those. It cannot see
// it from the object literal, because the key is assembled where the value is rendered
// and not where it is declared.
//
// Listed literal by literal rather than as a file exclusion, so any OTHER literal in
// these two files is still reported.
const TABLE_OF_DEFAULTS_REASON =
  'A value in a table that every render site passes to t() as the default, under a key derived from the entry id (image_aspect_<id>, veo3_audio_<option>). It is a t() default declared away from its call, not an untranslated literal.';

const TABLE_OF_DEFAULTS_EXEMPT: readonly Exemption[] = [
  ['components/launches/ai.image.tsx', 'Square'],
  ['components/launches/ai.image.tsx', 'Portrait'],
  ['components/launches/ai.image.tsx', 'Story'],
  ['components/launches/ai.image.tsx', 'Landscape'],
  ['components/videos/providers/veo3.provider.tsx', 'Ambient'],
  ['components/videos/providers/veo3.provider.tsx', 'Narration'],
  ['components/videos/providers/veo3.provider.tsx', 'Silent'],
  [
    'components/videos/providers/veo3.provider.tsx',
    'Natural sound and music that suit the scene, with no speech.',
  ],
  [
    'components/videos/providers/veo3.provider.tsx',
    'A voiceover describing the scene, spoken in the language of your prompt.',
  ],
  [
    'components/videos/providers/veo3.provider.tsx',
    'No speech and no music — only quiet ambience.',
  ],
].map(([file, text]) => ({ file, text, reason: TABLE_OF_DEFAULTS_REASON }));

// The Sentry report dialog in app/global-error.tsx. Its six labels are English on
// purpose and the file explains why: global-error replaces the root layout, so it is a
// Client Component that cannot read cookies and therefore cannot know the language,
// direction or theme. There is no t() to call. The call passes lang: 'en' deliberately.
//
// Listed as six entries rather than one file exclusion so that any OTHER literal
// appearing in that file is still reported.
const GLOBAL_ERROR_REASON =
  'A label of the Sentry report dialog in the one root layout that cannot resolve a language: global-error.tsx replaces the root layout as a Client Component with no cookie access, so no translation is available to it. The call sets lang: "en" for the same reason.';

const SENTRY_DIALOG_EXEMPT: readonly Exemption[] = [
  'Something broke!',
  'Please help us fix the issue by providing some details.',
  'What happened?',
  'Your name',
  'Your email',
  'Send Report',
].map((text) => ({ file: 'app/global-error.tsx', text, reason: GLOBAL_ERROR_REASON }));

// Components that route their `label` prop through TranslatedLabel, which derives
// label_<normalised> and calls t() itself. A bare label="Title" on one of these is NOT
// a hard-coded literal — it resolves label_title. What can still be wrong is the
// locale: if the derived key is missing, t() falls back to the English label and the
// Arabic reader sees English, which is the same defect by a different route.
//
// This distinction is why 028's confirmation pass over-counted by 37 rows, and why its
// first wiring pass then broke the derivation by "fixing" them. So for these the check
// asks whether the key exists, not whether the JSX holds a string. Everything else —
// HashnodeTags, DevtoTags, MediumTags, MediaComponent — renders {label} raw, so a
// literal there is a literal.
const TRANSLATES_LABEL = new Set([
  'Input',
  'Select',
  'Textarea',
  'Canonical',
  'MultiSelect',
  'ColorPicker',
  'CustomSelect',
  'WordpressTerms',
]);

// ---------------------------------------------------------------------------
// Deny contexts: the only places a prose literal is tolerated without being listed
// per site. Every entry states why text there never reaches a reader.
// ---------------------------------------------------------------------------

// Attributes that carry no text to a reader or a screen reader. Everything NOT here is
// reported, so a new text-bearing attribute is caught without being anticipated.
const NON_TEXT_ATTRS = new Set([
  'className', 'class', 'id', 'key', 'name', 'type', 'src', 'href', 'rel',
  'target', 'htmlFor', 'dir', 'lang', 'role', 'accept', 'format', 'style',
  'method', 'action', 'autoComplete', 'inputMode', 'as', 'href2', 'value',
  'defaultValue', 'variant', 'size', 'color', 'align', 'side', 'position',
  'mode', 'layout', 'loading', 'sizes', 'crossOrigin', 'referrerPolicy',
  'charSet', 'httpEquiv', 'property', 'content', 'itemProp', 'slot', 'form',
  // SVG geometry and paint.
  'd', 'fill', 'stroke', 'viewBox', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'x2', 'y1', 'y2', 'points', 'transform', 'offset', 'stopColor',
  'stopOpacity', 'gradientUnits', 'gradientTransform', 'patternUnits',
  'clipPath', 'clipRule', 'fillRule', 'fillOpacity', 'strokeWidth',
  'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeOpacity',
  'preserveAspectRatio', 'xmlns', 'xmlnsXlink', 'version', 'filter',
  'floodColor', 'maskUnits', 'markerWidth', 'markerHeight', 'orient',
  // Prompts the AI reads, not prose the user reads. Translating them makes the
  // model answer worse; the hint above them, addressed to the user, is translated.
  'instructions',
  'textareaPurpose',
]);

// Calls whose arguments are never rendered.
const DENY_CALLEES = new Set([
  // The documented fix shape itself.
  't', 'i18next.t',
  // Logging and analytics.
  'console.log', 'console.warn', 'console.error', 'console.info',
  'console.debug', 'console.trace', 'fireEvents',
  // Class names.
  'clsx', 'cn', 'classNames', 'cva', 'twMerge',
  // Storage and DOM lookups: the argument is a key or a selector.
  'localStorage.getItem', 'localStorage.setItem', 'localStorage.removeItem',
  'sessionStorage.getItem', 'sessionStorage.setItem', 'sessionStorage.removeItem',
  'document.querySelector', 'document.querySelectorAll', 'document.getElementById',
  'document.getElementsByClassName', 'document.getElementsByTagName',
  'document.createElement',
  // Hotkeys: the argument is a key combination.
  'useHotkeys',
  // AI-facing hooks — everything under them, including nested parameters, is a
  // prompt the model reads.
  'useCopilotAction', 'useCopilotReadable', 'useCopilotChatSuggestions',
  'useCopilotAdditionalInstructions',
]);

// Namespaced calls denied by their object rather than their full name. Sentry is NOT
// here: Sentry.showReportDialog takes seven labels a user reads, and denying the whole
// namespace would hide them — the blanket version of this rule did exactly that until
// confirmation noticed global-error.tsx had gone silent.
const DENY_CALLEE_OBJECTS = new Set(['posthog', 'dayjs']);

// Sentry calls that only ever report. showReportDialog is deliberately absent.
const DENY_SENTRY_METHODS = new Set([
  'captureException', 'captureMessage', 'captureEvent', 'addBreadcrumb',
  'setTag', 'setTags', 'setContext', 'setUser', 'setExtra', 'withScope',
]);

// Method names denied wherever they are called: the argument is a format token or a
// selector, never prose.
const DENY_METHODS = new Set([
  'format', 'closest', 'matches', 'getAttribute', 'setAttribute',
  'removeAttribute', 'hasAttribute', 'addEventListener', 'removeEventListener',
  'startsWith', 'endsWith', 'includes', 'split', 'join', 'replace',
  'replaceAll', 'match', 'test', 'setProperty', 'getPropertyValue',
  // Keyed lookups: headers.get('Auth'), searchParams.get('name'), map.has(...).
  // The argument is always a key, never copy.
  'get', 'set', 'has',
  // A literal inside a request body is a constant or a default the API receives,
  // not something a component renders.
  'stringify',
]);

// The AI hooks whose ENTIRE argument tree is a prompt.
const AI_HOOKS = new Set([
  'useCopilotAction', 'useCopilotReadable', 'useCopilotChatSuggestions',
  'useCopilotAdditionalInstructions',
]);

const calleeName = (call: ts.CallExpression): string => {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) {
    const object = ts.isIdentifier(expression.expression)
      ? expression.expression.text
      : '';
    return object ? `${object}.${expression.name.text}` : expression.name.text;
  }
  return '';
};

const methodName = (call: ts.CallExpression): string =>
  ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : '';

const calleeObject = (call: ts.CallExpression): string =>
  ts.isPropertyAccessExpression(call.expression) &&
  ts.isIdentifier(call.expression.expression)
    ? call.expression.expression.text
    : '';

const attributeName = (attribute: ts.JsxAttribute): string =>
  ts.isIdentifier(attribute.name) ? attribute.name.text : attribute.name.text;

/**
 * Walks up from a literal and returns the reason its context tolerates it, or null
 * when nothing does — in which case it is reported.
 */
const denyReason = (node: ts.Node): string | null => {
  let child: ts.Node = node;
  let parent = node.parent;

  while (parent) {
    // A bare string statement is a directive: 'use client', 'use server'. Tested
    // against the literal itself, never against `child`: by the time the walk has
    // climbed to a statement, `child` is whatever expression that statement holds, and
    // comparing it here denied every literal inside a statement-level call — which is
    // most toasts, dialogs and Sentry's report dialog.
    if (ts.isExpressionStatement(parent) && parent.expression === node)
      return 'directive prologue — an instruction to the bundler';

    if (
      ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isImportTypeNode(parent) ||
      ts.isModuleDeclaration(parent)
    )
      return 'module specifier';

    if (ts.isExternalModuleReference(parent)) return 'require path';

    if (ts.isCaseClause(parent) && parent.expression === child)
      return 'case label — compared, never rendered';

    if (ts.isLiteralTypeNode(parent)) return 'type position';

    if (ts.isEnumMember(parent)) return 'enum member';

    if (ts.isComputedPropertyName(parent)) return 'computed key';

    if (
      (ts.isPropertyAssignment(parent) ||
        ts.isPropertySignature(parent) ||
        ts.isMethodDeclaration(parent) ||
        ts.isMethodSignature(parent)) &&
      parent.name === child
    )
      return 'property name, not a value';

    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === child)
      return 'property lookup';

    // A label prop beside an explicit translationKey. TranslatedLabel uses the key it
    // is given and only derives one when it is not, so the English here is the
    // fallback for a key that is named two attributes away — the same shape as an
    // inline default beside a key, written as JSX. The derived-label-key rule below
    // cannot see it, because it looks for the literal directly under the attribute and
    // these sit inside a conditional.
    if (ts.isJsxAttribute(parent) && attributeName(parent) === 'label') {
      const attributes = parent.parent;
      if (
        ts.isJsxAttributes(attributes) &&
        attributes.properties.some(
          (property) =>
            ts.isJsxAttribute(property) && attributeName(property) === 'translationKey'
        )
      )
        return 'label beside an explicit translationKey — TranslatedLabel resolves that key, never one derived from this text';
    }

    if (
      ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ].includes(parent.operatorToken.kind)
    )
      return 'comparison operand — matched against, never shown';

    // An inline default beside a key: the consumer translates it. `translationKey` is
    // the spelling an option table uses — the name TranslatedLabel already gives the
    // prop that overrides its derivation — and `name` the property a couple of those
    // tables call their English, so an entry that carries its own key is a t() default
    // wherever it is rendered.
    if (ts.isPropertyAssignment(parent) && parent.initializer === child) {
      const name = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)
        ? parent.name.text
        : '';
      if (
        ['defaultValue', 'fallback', 'titleDefault', 'text', 'label', 'name'].includes(
          name
        ) &&
        ts.isObjectLiteralExpression(parent.parent) &&
        parent.parent.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
            ['key', 'titleKey', 'translationKey'].includes(property.name.text)
        )
      )
        return 'inline default beside a key — its consumer calls t() with both';
    }

    // The AI-prompt props again, as object properties: autosuggestionsConfig passes
    // textareaPurpose through an object literal rather than as a JSX attribute, so the
    // attribute rule below never sees it. Same reason — the model reads it, not the user.
    if (
      ts.isPropertyAssignment(parent) &&
      parent.initializer === child &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
      ['instructions', 'textareaPurpose'].includes(parent.name.text)
    )
      return `value of "${parent.name.text}" — a prompt the model reads, not prose the user reads`;

    // A command or config snippet the reader copies into a terminal or a file.
    // public.component.tsx renders {step.code} verbatim beside a translated label;
    // translating the command would break the thing it is there to do.
    if (
      ts.isPropertyAssignment(parent) &&
      parent.initializer === child &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) &&
      ['code', 'config'].includes(parent.name.text)
    )
      return `value of a "${parent.name.text}" property — a command the user copies, which must stay as typed`;

    if (ts.isJsxAttribute(parent)) {
      const name = attributeName(parent);
      if (NON_TEXT_ATTRS.has(name))
        return `JSX attribute "${name}" carries no text to a reader`;
      if (name.startsWith('data-') && name !== 'data-tooltip-content')
        return `JSX attribute "${name}" is a data hook, not text`;
    }

    if (ts.isCallExpression(parent)) {
      const name = calleeName(parent);
      if (AI_HOOKS.has(name))
        return `argument of ${name} — a prompt the model reads, not prose the user reads`;
      if (parent.arguments.some((argument) => argument === child)) {
        if (DENY_CALLEES.has(name))
          return `argument of ${name}`;
        if (DENY_CALLEE_OBJECTS.has(calleeObject(parent)))
          return `argument of ${calleeObject(parent)}.*`;
        if (
          calleeObject(parent) === 'Sentry' &&
          DENY_SENTRY_METHODS.has(methodName(parent))
        )
          return `argument of Sentry.${methodName(parent)} — reported, never rendered`;
        if (DENY_METHODS.has(methodName(parent)))
          return `argument of .${methodName(parent)}() — a token or selector`;
      }
    }

    child = parent;
    parent = parent.parent;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Prose heuristic — 028's, with the leading-slash path rule narrowed.
// ---------------------------------------------------------------------------

const normalise = (value: string) => value.replace(/\s+/g, ' ').trim();

// The two unit suffixes the pricing UI writes after a price. They are the whole reason
// 028's leading-slash path rule was dropped: it discarded them as paths and the billing
// page's "/month" and "/year" were never candidates.
//
// Named explicitly rather than inferred from shape, because research R1's rationale —
// "a real path carries a second segment or an extension" — does not survive contact
// with this codebase. The navigation declares /launches, /studio, /agents, /media,
// /analytics, /plugs, /support, /billing and /settings, every one a single segment and
// none of them text. A shape rule cannot separate /month from /plugs; a two-item list
// can, and it fails loudly the day a third suffix appears rather than quietly admitting
// nine routes.
const UNIT_SUFFIXES = new Set(['/month', '/year']);

const isProse = (raw: string) => {
  const text = normalise(raw);
  if (text.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  if (/[؀-ۿ]/.test(text)) return false; // already Arabic
  if (UNIT_SUFFIXES.has(text)) return true;
  if (/^https?:/.test(text)) return false; // urls
  if (/^\.{0,2}\//.test(text)) return false; // paths, absolute and relative
  if (/\//.test(text) && !/\s/.test(text)) return false; // mime types, module ids
  // A hex colour.
  if (/^#[0-9A-Fa-f]{3,8}$/.test(text)) return false;
  // CSS functional notation — rgba(), min(), calc(), var(), linear-gradient().
  // chart-social.tsx alone held fifty. A lowercase identifier followed by a bracket is
  // never a sentence; prose that opens a bracket has a capital or a space before it,
  // so "Auto (based on performance)" stays reportable.
  if (/^[a-z-]+\(/.test(text)) return false;
  // A class list, of one token or many. Every token must look like a utility class
  // and at least one must carry the hyphen, colon or bracket that makes it one, so
  // plain English is never mistaken for classes: "1 hour" and "24 hours" carry none
  // and stay reportable, and "Order Online" and "Post / Reel" fail on their capitals.
  const tokens = text.split(' ');
  if (
    tokens.every((token) => /^!?-?[a-z0-9][\w./%(),[\]#:!-]*$/.test(token)) &&
    tokens.some((token) => /[-:[]/.test(token))
  )
    return false;
  // A bare ALL-CAPS token is an enum member or a constant — ADMIN, SUPERADMIN, POST.
  // The acronyms a reader does see (API, MCP, CLI, UGC) are rejected here too, and
  // KEEP_LATIN_TOKENS below would reject them anyway; either way they are not defects.
  if (/^[A-Z][A-Z0-9_]*$/.test(text)) return false;
  if (/[{}<>$\\]/.test(text)) return false; // expressions, markup, template guts
  if (/[;=]/.test(text)) return false;
  if (/^[a-z0-9_.:-]+$/.test(text)) return false; // identifiers, css values, keys
  if (/^[A-Za-z0-9_]+$/.test(text) && /[a-z][A-Z]/.test(text)) return false; // camelCase
  if (KEEP_LATIN.has(text)) return false;
  if (KEY_NAMES.has(text)) return false;
  return true;
};

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

const LOCALES_DIR = path.join(
  REPO_ROOT,
  'libraries/react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string): Record<string, unknown> =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const en = readLocale('en');
const arLocale = readLocale('ar');

const walkDir = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : walkDir(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

interface Literal {
  file: string;
  line: number;
  text: string;
  shape: string;
}

/** The syntactic shape that hid this literal, for the reader and for the finding row. */
const shapeOf = (node: ts.Node): string => {
  if (ts.isJsxText(node)) return 'text-node';
  let parent = node.parent;
  let child: ts.Node = node;
  // Checked before the others: a browser-tab title is a string in the `metadata` export
  // and would otherwise read as whichever of conditional-arm, template or object-literal
  // it happens to be written as. Those describe how it hid; this describes what it is,
  // and it is what tells the reader the fix is generateMetadata rather than a t() call.
  while (parent) {
    if (
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name) &&
      parent.name.text === 'metadata'
    )
      return 'tab-title';
    parent = parent.parent;
  }
  parent = node.parent;
  while (parent) {
    if (ts.isJsxAttribute(parent)) return 'attribute';
    if (ts.isConditionalExpression(parent) && parent.condition !== child)
      return 'conditional-arm';
    if (
      ts.isBinaryExpression(parent) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(parent.operatorToken.kind)
    )
      return 'conditional-arm';
    if (ts.isArrayLiteralExpression(parent)) return 'option-list';
    if (ts.isCallExpression(parent)) return 'message-call';
    if (ts.isPropertyAssignment(parent)) return 'object-literal';
    child = parent;
    parent = parent.parent;
  }
  return 'string-literal';
};

const ALL_EXEMPT: readonly Exemption[] = [
  ...EXEMPT,
  ...TABLE_OF_DEFAULTS_EXEMPT,
  ...SENTRY_DIALOG_EXEMPT,
];

const isExempt = (literal: Literal) =>
  ALL_EXEMPT.some(
    (exemption) =>
      literal.text === exemption.text && literal.file.endsWith(exemption.file)
  );

/**
 * The component an attribute belongs to. An attribute's parent is the JsxAttributes
 * bag, whose parent is the opening or self-closing element — two hops, not one, which
 * is worth naming because getting it wrong returns '' and every TRANSLATES_LABEL
 * component quietly stops being recognised.
 */
const ownerTagName = (attribute: ts.JsxAttribute): string => {
  const owner = attribute.parent?.parent;
  if (!owner) return '';
  if (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner))
    return owner.tagName.getText();
  return '';
};

/**
 * A template rendered as one phrase, with each expression written as the
 * {{placeholder}} the translation key will interpolate.
 *
 * Reported once rather than span by span, for the same reason a mixed JSX node is: the
 * fix is a single key, and three rows reading `File type "`, `" is not allowed for file "`
 * and `". Allowed types:` ask a reviewer to approve Arabic for fragments no reader ever
 * sees in isolation.
 */
const placeholderName = (expression: ts.Expression, index: number): string => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  // A t() call inside the phrase is a word that is already translated; naming the
  // placeholder after its key is what tells the reviewer which word it is.
  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 't' &&
    expression.arguments[0] &&
    ts.isStringLiteral(expression.arguments[0])
  )
    return (expression.arguments[0] as ts.StringLiteral).text;
  return `value${index + 1}`;
};

const templateText = (template: ts.TemplateExpression): string =>
  template.head.text +
  template.templateSpans
    .map(
      (span, index) =>
        `{{${placeholderName(span.expression, index)}}}${span.literal.text}`
    )
    .join('');

/**
 * A mixed JSX element as the one phrase it renders, each expression written as the
 * {{placeholder}} its key will interpolate. Same reason as templateText: the fix is one
 * key, so `Sets (` and `)` are not two things to approve — `Sets ({{count}})` is one.
 */
const mixedNodeText = (element: ts.JsxElement): string => {
  let index = 0;
  return element.children
    .map((child) => {
      if (ts.isJsxText(child)) return child.text.replace(/\s+/g, ' ');
      if (ts.isJsxExpression(child) && child.expression)
        return `{{${placeholderName(child.expression, index++)}}}`;
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
};

const literalsIn = (file: string, source: ts.SourceFile): Literal[] => {
  const found: Literal[] = [];
  const at = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const report = (node: ts.Node, text: string, shape?: string) =>
    found.push({ file, line: at(node), text: normalise(text), shape: shape ?? shapeOf(node) });

  const visit = (node: ts.Node) => {
    // A text node mixing prose with an expression is ONE finding, at the first prose
    // child, because the fix is one phrase key rather than a key per fragment
    // ({t('ai','AI')} Image -> ai_image). Reported here so the children are not also
    // reported individually below.
    if (ts.isJsxElement(node)) {
      const proseChildren = node.children.filter(
        (child) => ts.isJsxText(child) && isProse(child.text)
      );
      const hasExpression = node.children.some(
        (child) =>
          ts.isJsxExpression(child) && child.expression !== undefined
      );
      if (proseChildren.length > 0 && hasExpression) {
        const first = proseChildren[0];
        if (denyReason(first) === null)
          report(
            first,
            mixedNodeText(node),
            shapeOf(first) === 'tab-title' ? 'tab-title' : 'mixed-text-node'
          );
        // Its prose children are accounted for; descend only into the expressions.
        node.children.forEach((child) => {
          if (!ts.isJsxText(child)) visit(child);
        });
        return;
      }
    }

    if (ts.isJsxText(node)) {
      if (isProse(node.text) && denyReason(node) === null)
        report(node, node.text);
      return;
    }

    if (ts.isTemplateExpression(node)) {
      const staticParts = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ];
      if (staticParts.some(isProse) && denyReason(node) === null)
        // shapeOf still decides, so a template in the `metadata` export reads as the tab
        // title it is rather than as the syntax it happens to be written in.
        report(
          node,
          templateText(node),
          shapeOf(node) === 'tab-title' ? 'tab-title' : 'template'
        );
      // The static parts are accounted for; the expressions may still hold literals.
      node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (isProse(text)) {
        // The label prop of a component that already translates it: the JSX is
        // correct, so what is checked is whether the derived key exists.
        const attribute = ts.isJsxAttribute(node.parent)
          ? node.parent
          : ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent)
          ? node.parent.parent
          : null;
        if (
          attribute &&
          attributeName(attribute) === 'label' &&
          TRANSLATES_LABEL.has(ownerTagName(attribute))
        ) {
          const key = deriveTranslationKey('label', normalise(text));
          if (typeof en[key] !== 'string' || typeof arLocale[key] !== 'string')
            found.push({
              file,
              line: at(node),
              text: `${normalise(text)}  (label prop: ${key} missing from the locale)`,
              shape: 'derived-label-key',
            });
        } else if (denyReason(node) === null) {
          report(node, text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found.filter((literal) => !isExempt(literal));
};

const inScope = () =>
  ROOTS.flatMap((root) => walkDir(path.join(REPO_ROOT, root)))
    .map((file) => path.relative(REPO_ROOT, file))
    .filter((file) => !EXCLUDE.some((exclusion) => exclusion.pattern.test(file)))
    .sort();

const scan = () => {
  const files = inScope();
  const literals = files.flatMap((file) => {
    const full = path.join(REPO_ROOT, file);
    const source = ts.createSourceFile(
      full,
      fs.readFileSync(full, 'utf8'),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    return literalsIn(file, source);
  });
  return { files, literals };
};

// The red run doubles as the survey: the same walk that fails the build writes the
// candidate list the confirmation pass reads, so the two cannot disagree about what
// was found.
//
// Both this check and the other one that walks (arabic.server.strings.spec.ts) read the
// SAME variable, and each writes the path it is given — so a run that sets it and lets
// both execute leaves one file, the second one's. That is why every recorded command
// passes a different filename per check (c3-candidates.json, server-candidates.json),
// and why the report names the check that wrote it in its own `check` field. Set it for
// one check at a time.
const writeReport = (result: ReturnType<typeof scan>) => {
  const out = process.env.ARABIC_AUDIT_OUT;
  if (!out) return;
  const target = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        check: 'C3 v2 — hard-coded English on the syntax tree',
        files_walked: result.files.length,
        count: result.literals.length,
        literals: result.literals,
      },
      null,
      2
    )
  );
};

describe('hard-coded English on Arabic screens', () => {
  it('renders no user-visible English literal outside a translation key', () => {
    const result = scan();
    writeReport(result);
    // file:line, the literal, and the shape that hid it — because the fix is per line
    // and differs by shape.
    expect(
      result.literals.map(
        (literal) => `${literal.file}:${literal.line}  ${literal.text}  (${literal.shape})`
      )
    ).toEqual([]);
  });

  it('gives a reason for every exemption', () => {
    expect(ALL_EXEMPT.filter((exemption) => !exemption.reason.trim())).toEqual([]);
  });

  it('gives a reason for every exclusion', () => {
    expect(EXCLUDE.filter((exclusion) => !exclusion.reason.trim())).toEqual([]);
  });

  // An exemption outliving the literal it excused becomes a silent licence for the
  // next one at that path.
  it('lists no exemption for a literal that is no longer there', () => {
    const stale = ALL_EXEMPT.filter((exemption) => {
      const full = path.join(REPO_ROOT, 'apps/frontend/src', exemption.file);
      if (!fs.existsSync(full)) return true;
      const source = fs.readFileSync(full, 'utf8');
      // A merged-template exemption carries {{placeholder}} names the source spells as
      // ${expressions}, so the file is searched for its static parts instead.
      return exemption.text
        .split(/\{\{[^}]+\}\}/)
        .filter((part) => part.trim())
        .some((part) => !source.includes(part));
    });
    expect(stale).toEqual([]);
  });

  // An exclusion that matches nothing is either a typo silently guarding nothing, or
  // a file that moved and is now being walked without anyone noticing either way.
  it('lists no exclusion that matches no file', () => {
    const all = ROOTS.flatMap((root) => walkDir(path.join(REPO_ROOT, root))).map(
      (file) => path.relative(REPO_ROOT, file)
    );
    const idle = EXCLUDE.filter(
      (exclusion) => !all.some((file) => exclusion.pattern.test(file))
    ).map((exclusion) => String(exclusion.pattern));
    expect(idle).toEqual([]);
  });

  // Guards the guard: a walk that silently stopped finding files would pass loudest
  // at the moment it stopped checking anything.
  it('actually walks the in-scope tree', () => {
    expect(scan().files.length).toBeGreaterThan(300);
  });
});

// Guards the guard, part two: the shapes themselves (T056).
//
// The assertion above is a list that is empty, and an empty list is exactly what a
// detector that stopped detecting produces. Everything else here — the reasons, the
// stale entries, the file count — checks the bookkeeping around the walk rather than
// the walk. These check the walk: one fixture per shape that got past the previous
// regex detector and was found on screen instead, parsed in memory and asserted
// reported.
//
// In memory rather than as files on disk, because a fixture file inside the walked
// tree would fail the real assertion, and one outside it would not be walked at all.
const shapesReportedIn = (source: string) =>
  literalsIn(
    'apps/frontend/src/components/fixture.tsx',
    ts.createSourceFile(
      'fixture.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
  );

// [what the shape is called, the source, the text the report must carry]
const SHAPES: ReadonlyArray<readonly [string, string, string]> = [
  [
    'a text node mixing prose with an expression',
    `export const C = () => <div>{t('ai', 'AI')} Image</div>;`,
    // The t() call inside the phrase is already-translated text, so it reports as a
    // placeholder named after its key rather than as its English.
    '{{ai}} Image',
  ],
  [
    'a string in a conditional arm',
    `export const C = () => <Button>{data ? 'Edit Plug' : 'Set Plug'}</Button>;`,
    'Set Plug',
  ],
  [
    'an attribute carrying an apostrophe',
    `export const C = () => <input placeholder="Who's replying to this post" />;`,
    "Who's replying to this post",
  ],
  [
    'an apostrophe inside a text node',
    `export const C = () => <div>We don't have autocomplete for this social media</div>;`,
    "We don't have autocomplete for this social media",
  ],
  [
    'an option list',
    `const delayOptions = [{ name: 'Immediately', value: 0 }];`,
    'Immediately',
  ],
  [
    'a message handed to a toast',
    `const save = () => { toaster.show('Plug updated', 'success'); };`,
    'Plug updated',
  ],
  [
    'a title in an object literal',
    `const open = () => modal.openModal({ title: 'Remove Social Account' });`,
    'Remove Social Account',
  ],
  [
    'a template literal',
    `const notice = () => \`Downgrade on \${date}\`;`,
    'Downgrade on {{date}}',
  ],
  [
    'a browser-tab title',
    `export const metadata = { title: 'Sharek Billing' };`,
    'Sharek Billing',
  ],
];

describe('the shapes the previous detector could not see', () => {
  it.each(SHAPES)('reports %s', (_name, source, text) => {
    expect(shapesReportedIn(source).map((literal) => literal.text)).toContain(
      text
    );
  });

  // The counterpart: the documented fix shape must not be reported, or every fix
  // this feature applied would read as a new defect.
  it('reports nothing once the same string goes through t()', () => {
    expect(
      shapesReportedIn(
        `export const C = () => <div>{t('set_plug', 'Set Plug')}</div>;`
      )
    ).toEqual([]);
  });

  // A file the parser gave up on produces no nodes, so it reports no literals and
  // the walk passes by finding nothing in it. Nothing else here would notice.
  it('parses every in-scope file without a syntax error', () => {
    const broken = inScope()
      .map((file) => {
        const full = path.join(REPO_ROOT, file);
        const source = ts.createSourceFile(
          full,
          fs.readFileSync(full, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
          file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );
        const diagnostics =
          (source as unknown as { parseDiagnostics?: ts.Diagnostic[] })
            .parseDiagnostics ?? [];
        return diagnostics.length ? `${file}: ${diagnostics.length}` : '';
      })
      .filter(Boolean);
    expect(broken).toEqual([]);
  });
});
