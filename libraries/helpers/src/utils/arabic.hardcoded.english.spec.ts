// Feature 028-arabic-language-audit (C3).
// Guards the in-scope frontend against user-visible English that never reaches a
// translation key. This is the defect the reported "Arabic is half English" actually
// was: ar carries every one of en's keys with nothing missing, so no comparison of
// locale files could ever have found it — the English was in the components.
//
// Scoped by directory minus exclusions, NOT by a list of the files this feature
// cleaned. An allow-list cannot fail for the one reason this check most needs to: if
// confirmation wrongly discards a true finding, that file is simply absent from the
// list and the check stays green, and the same is true of any literal a later feature
// adds. Excluding the surfaces nobody agreed to clean gets the same protection without
// blinding the check to everything else.
//
// The detector mirrors the audit survey that produced the findings (T008). It has to:
// a check that reports literals the audit never confirmed can never go green, and one
// that reports fewer is not guarding what was fixed.
import * as fs from 'fs';
import * as path from 'path';
import {
  KEEP_LATIN_PRODUCTS,
  KEEP_LATIN_TOKENS,
} from '@gitroom/react/translation/arabic-policy';

const REPO_ROOT = path.join(__dirname, '../../../..');

const ROOTS = ['apps/frontend/src/components', 'apps/frontend/src/app'];

// Surfaces nobody agreed to clean. Test files render to nobody.
const EXCLUDE = [
  /\/admin\//,
  /impersonate/,
  /\/third-parties\//,
  /analytics\.component/,
  /\.spec\.tsx$/,
];

// The attributes that reach a reader or a screen reader.
const ATTRS = ['placeholder', 'title', 'label', 'alt', 'aria-label'];

const KEEP_LATIN = new Set<string>([
  ...KEEP_LATIN_PRODUCTS,
  ...KEEP_LATIN_TOKENS,
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
];

// Components that route their `label` prop through TranslatedLabel, which derives
// label_<normalised> and calls t() itself. A bare `label="Title"` on one of these is
// NOT a hard-coded English literal — it resolves label_title. What can still be wrong
// is the locale: if the derived key is missing, t() falls back to the English label
// and the Arabic reader sees English, which is the same defect by a different route.
// So for these the check asks whether the key exists, not whether the JSX holds a
// string. WordpressTerms forwards its label straight to a <Select>.
//
// Everything else — HashnodeTags, DevtoTags, MediumTags, MediaComponent — renders
// {label} raw, so a literal there is a literal.
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

const deriveLabelKey = (label: string) =>
  'label_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');

const elementAt = (source: string, index: number) => {
  const open = source.lastIndexOf('<', index);
  if (open === -1) return null;
  const m = source.slice(open, index).match(/^<([A-Za-z][\w.]*)/);
  return m ? m[1] : null;
};

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

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules' ? [] : walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

// Blank the spans a literal is allowed to live in, preserving length and line breaks
// so every offset still maps to its original line: comments, imports, and t() calls —
// an inline default is the documented fix shape, not a defect.
const blank = (source: string) => {
  let out = source;
  const mask = (re: RegExp) => {
    out = out.replace(re, (m) => m.replace(/[^\n]/g, ' '));
  };
  mask(/\/\*[\s\S]*?\*\//g);
  mask(/(^|[^:])\/\/[^\n]*/g);
  mask(/^import[\s\S]*?from\s*['"][^'"]*['"];?/gm);
  mask(/\bt\(\s*['"][^'"]*['"]\s*(,\s*['"][^'"]*['"]\s*)?(,[^)]*)?\)/g);
  return out;
};

// Blank the inside of every string literal, keeping length. A JSX text node never
// lives inside quotes, but an HTML string does look like one: the aspect-ratio
// tooltips hold <strong> markup inside a quoted string that the component passes to
// t() as a default, so the text pass read them as text nodes when they were already
// translated.
const blankStrings = (source: string) => {
  const out = [...source];
  let quote: string | null = null;
  for (let i = 0; i < out.length; i += 1) {
    const c = out[i];
    if (quote) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      else if (c !== '\n') out[i] = ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    }
  }
  return out.join('');
};

// Worth a reader's attention only if it reads like prose or a label.
const isProse = (value: string) => {
  const text = value.trim();
  if (text.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  if (/[؀-ۿ]/.test(text)) return false; // already Arabic
  if (/^https?:|^\/|^\.{1,2}\//.test(text)) return false; // urls and paths
  if (/[{}<>$\\]/.test(text)) return false; // expressions, markup, template guts
  // A generic type argument closes with the same '>' a JSX tag does. Prose carries no
  // statement terminator, no assignment, and no line break mid-sentence.
  if (/[;=]/.test(text) || text.includes('\n')) return false;
  if (/^[a-z0-9_.:-]+$/.test(text)) return false; // identifiers, css values, keys
  if (/^[A-Za-z0-9_]+$/.test(text) && /[a-z][A-Z]/.test(text)) return false; // camelCase
  if (KEEP_LATIN.has(text)) return false;
  return true;
};

const lineOf = (source: string, index: number) =>
  source.slice(0, index).split('\n').length;

interface Literal {
  file: string;
  line: number;
  text: string;
}

const isExempt = (literal: Literal) =>
  EXEMPT.some(
    (exemption) =>
      literal.text === exemption.text &&
      literal.file.endsWith(exemption.file)
  );

const literalsIn = (file: string, source: string): Literal[] => {
  const masked = blank(source);
  const found: Literal[] = [];
  const record = (text: string, index: number, from: string) =>
    found.push({ file, line: lineOf(from, index), text: text.trim() });

  // JSX text between tags. Requiring a real closing tag is what separates a text node
  // from a generic's '>', which is never followed by a slash.
  const text = blankStrings(masked);
  for (const m of text.matchAll(/>([^<>{}\n][^<>{}\n]*)<\//g)) {
    if (isProse(m[1])) record(m[1], m.index ?? 0, text);
  }
  // A bare string rendered through an expression container: {'Save changes'}
  for (const m of masked.matchAll(/\{\s*(['"])([^'"\n]+)\1\s*\}/g)) {
    if (isProse(m[2])) record(m[2], m.index ?? 0, masked);
  }
  const attr = new RegExp(
    `\\b(${ATTRS.join('|')})\\s*=\\s*(?:(['"])([^'"\\n]+)\\2|\\{\\s*(['"])([^'"\\n]+)\\4\\s*\\})`,
    'g'
  );
  for (const m of masked.matchAll(attr)) {
    const value = m[3] ?? m[5];
    if (!isProse(value)) continue;
    if (m[1] === 'label' && TRANSLATES_LABEL.has(elementAt(masked, m.index ?? 0))) {
      // Translated by the component. The only thing that can be wrong is a missing
      // key, which renders the English label to an Arabic reader.
      const key = deriveLabelKey(value.trim());
      if (typeof en[key] !== 'string' || typeof arLocale[key] !== 'string') {
        found.push({
          file,
          line: lineOf(masked, m.index ?? 0),
          text: `${value.trim()}  (label prop: ${key} missing from the locale)`,
        });
      }
      continue;
    }
    record(value, m.index ?? 0, masked);
  }
  return found.filter((literal) => !isExempt(literal));
};

const scan = () => {
  const files = ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root)))
    .map((file) => path.relative(REPO_ROOT, file))
    .filter((file) => !EXCLUDE.some((re) => re.test(file)))
    .sort();
  return {
    files,
    literals: files.flatMap((file) =>
      literalsIn(file, fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))
    ),
  };
};

describe('hard-coded English on Arabic screens', () => {
  it('renders no user-visible English literal outside a translation key', () => {
    // file:line and the literal itself, because the fix is per line.
    expect(
      scan().literals.map((l) => `${l.file}:${l.line}  ${l.text}`)
    ).toEqual([]);
  });

  it('gives a reason for every exemption', () => {
    expect(EXEMPT.filter((e) => !e.reason.trim())).toEqual([]);
  });

  // An exemption outliving the literal it excused becomes a silent licence for the
  // next one at that path.
  it('lists no exemption for a literal that is no longer there', () => {
    const stale = EXEMPT.filter((exemption) => {
      const full = path.join(REPO_ROOT, 'apps/frontend/src', exemption.file);
      return (
        !fs.existsSync(full) ||
        !fs.readFileSync(full, 'utf8').includes(exemption.text)
      );
    });
    expect(stale).toEqual([]);
  });

  // Guards the guard: a walk that silently stopped finding files would pass loudest
  // at the moment it stopped checking anything.
  it('actually walks the in-scope tree', () => {
    expect(scan().files.length).toBeGreaterThan(300);
  });
});
