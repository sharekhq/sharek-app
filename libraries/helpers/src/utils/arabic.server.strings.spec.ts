// Feature 029-arabic-audit-followup (C6) — server-declared strings have keys.
//
// Some of the English on an Arabic screen is not in the frontend at all. Plug cards and
// their modal, the automations under post settings, the labels on a connect form, the X
// "Verified" preference and every validation refusal are DECLARED on the server — in
// provider decorators, in customFields(), in checkValidity(), in DTO decorators — and
// rendered verbatim by a component. C3 walks apps/frontend and cannot see any of it.
//
// The providers are upstream-owned and merged weekly, so they are not edited. Instead
// the client translates what it receives, through a key derived from the English by
// deriveTranslationKey — the formula TranslatedLabel has always used for form labels.
// This check reads the declarations (READ ONLY — nothing under libraries/nestjs-libraries
// is written by this feature) and asserts that each derived key exists in en and ar.
//
// What it proves and what it does not: a key exists. It cannot prove a component renders
// through that key — the render-site tests in apps/frontend do that, one per surface.
// Both halves are needed; either alone is green while the screen shows English.
//
// When upstream changes a declared string, its derived key changes, Arabic silently
// falls back to the English, and this check turns red naming the provider and the
// string. That is the intended signal. The fix is always the new key, never an edit to
// the provider.
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { deriveTranslationKey } from '@gitroom/react/translation/derive-key';

const REPO_ROOT = path.join(__dirname, '../../../..');
const NEST = path.join(REPO_ROOT, 'libraries/nestjs-libraries/src');

const SOCIAL_DIR = path.join(NEST, 'integrations/social');
const DTO_DIR = path.join(NEST, 'dtos/posts');
const POSTS_SERVICE = path.join(NEST, 'database/prisma/posts/posts.service.ts');

const LOCALES_DIR = path.join(
  REPO_ROOT,
  'libraries/react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string): Record<string, unknown> =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const en = readLocale('en');
const ar = readLocale('ar');

type Family =
  | 'plug'
  | 'post-settings-plug'
  | 'custom-field'
  | 'preference'
  | 'validation';

interface ServerString {
  family: Family;
  /** The file it is declared in, repo-relative. */
  provider: string;
  /** Which declaration it came from, precise enough to find by eye. */
  declaration: string;
  /** The declared text, verbatim. Never modified, never written back. */
  english: string;
  prefix: string;
  key: string;
}

const walkDir = (dir: string, match: RegExp): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkDir(full, match);
    return match.test(entry.name) ? [full] : [];
  });

const parse = (file: string) =>
  ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

const propertyName = (property: ts.ObjectLiteralElementLike): string =>
  property.name &&
  (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ? property.name.text
    : '';

/**
 * The text of a property whose value is a string literal, or a same-file `const` that
 * holds one. tiktok.dto.ts hoists its visibility message into TIKTOK_VISIBILITY_MESSAGE
 * and uses it twice; reading only literals would miss it and quietly under-report.
 */
const stringValue = (
  node: ts.Expression | undefined,
  constants: Map<string, string>
): string | null => {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  return null;
};

const constantsIn = (source: ts.SourceFile): Map<string, string> => {
  const constants = new Map<string, string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    )
      constants.set(node.name.text, node.initializer.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
};

const propertyOf = (
  object: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined => {
  const match = object.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) && propertyName(property) === name
  );
  return match && ts.isPropertyAssignment(match) ? match.initializer : undefined;
};

/** Every object literal directly inside an array-valued property. */
const elementsOf = (
  object: ts.ObjectLiteralExpression,
  name: string
): ts.ObjectLiteralExpression[] => {
  const value = propertyOf(object, name);
  return value && ts.isArrayLiteralExpression(value)
    ? value.elements.filter(ts.isObjectLiteralExpression)
    : [];
};

const collectFrom = (file: string): ServerString[] => {
  const source = parse(file);
  const constants = constantsIn(source);
  const rel = path.relative(REPO_ROOT, file);
  const found: ServerString[] = [];

  const add = (
    family: Family,
    declaration: string,
    english: string | null,
    prefix: string
  ) => {
    if (!english || !english.trim()) return;
    found.push({
      family,
      provider: rel,
      declaration,
      english,
      prefix,
      key: deriveTranslationKey(prefix, english),
    });
  };

  const visit = (node: ts.Node) => {
    // @Plug({...}) / @PostPlug({...})
    if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
      const name = ts.isIdentifier(node.expression.expression)
        ? node.expression.expression.text
        : '';
      const options = node.expression.arguments[0];
      if (
        (name === 'Plug' || name === 'PostPlug') &&
        options &&
        ts.isObjectLiteralExpression(options)
      ) {
        const family: Family = name === 'Plug' ? 'plug' : 'post-settings-plug';
        const identifier =
          stringValue(propertyOf(options, 'identifier'), constants) ?? name;
        add(family, `@${name} ${identifier}.title`,
          stringValue(propertyOf(options, 'title'), constants), 'plug');
        add(family, `@${name} ${identifier}.description`,
          stringValue(propertyOf(options, 'description'), constants), 'plug');
        elementsOf(options, 'fields').forEach((field, index) => {
          const fieldName =
            stringValue(propertyOf(field, 'name'), constants) ?? String(index);
          add(family, `@${name} ${identifier}.fields.${fieldName}.placeholder`,
            stringValue(propertyOf(field, 'placeholder'), constants), 'placeholder');
          // Rendered as the form label by <Input label={field.description}>, which
          // already derives label_<…> through TranslatedLabel — so the prefix is
          // label_, not plug_, and these need keys and no code at all.
          add(family, `@${name} ${identifier}.fields.${fieldName}.description`,
            stringValue(propertyOf(field, 'description'), constants), 'label');
        });
      }
    }

    // async customFields() { return [ { label: '…' } ] }
    if (
      (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'customFields'
    ) {
      const inner = (child: ts.Node) => {
        if (ts.isObjectLiteralExpression(child)) {
          const key = stringValue(propertyOf(child, 'key'), constants) ?? '?';
          add('custom-field', `customFields().${key}.label`,
            stringValue(propertyOf(child, 'label'), constants), 'label');
        }
        ts.forEachChild(child, inner);
      };
      ts.forEachChild(node, inner);
    }

    // additionalSettings: [ { title, description } ]
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node) === 'additionalSettings' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      node.initializer.elements
        .filter(ts.isObjectLiteralExpression)
        .forEach((setting) => {
          const title = stringValue(propertyOf(setting, 'title'), constants);
          add('preference', `additionalSettings.${title ?? '?'}.title`, title, 'setting');
          add('preference', `additionalSettings.${title ?? '?'}.description`,
            stringValue(propertyOf(setting, 'description'), constants), 'setting');
        });
    }

    // checkValidity(...) { return 'Should have at least one media'; }
    if (
      ts.isMethodDeclaration(node) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'checkValidity'
    ) {
      const inner = (child: ts.Node) => {
        if (ts.isReturnStatement(child)) {
          const text = stringValue(child.expression, constants);
          if (text) add('validation', 'checkValidity() return', text, 'validation');
        }
        ts.forEachChild(child, inner);
      };
      ts.forEachChild(node, inner);
    }

    // { message: 'Board is required' } on a class-validator decorator.
    if (ts.isPropertyAssignment(node) && propertyName(node) === 'message') {
      const text = stringValue(node.initializer, constants);
      if (text) add('validation', 'DTO decorator message', text, 'validation');
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
};

// The service's fallback when a provider throws without a message. Named rather than
// discovered, because it is one literal in a 900-line service and a pattern broad
// enough to find it would drag in everything else that file throws.
const serviceFallback = (): ServerString[] => {
  const source = fs.readFileSync(POSTS_SERVICE, 'utf8');
  const english = 'Invalid media';
  if (!source.includes(`'${english}'`)) return [];
  return [
    {
      family: 'validation',
      provider: path.relative(REPO_ROOT, POSTS_SERVICE),
      declaration: "errors = err?.message || 'Invalid media'",
      english,
      prefix: 'validation',
      key: deriveTranslationKey('validation', english),
    },
  ];
};

const collect = (): ServerString[] => [
  ...walkDir(SOCIAL_DIR, /\.provider\.ts$/).flatMap(collectFrom),
  ...walkDir(DTO_DIR, /\.dto\.ts$/).flatMap(collectFrom),
  ...serviceFallback(),
];

/** One row per distinct key: `Amount of likes` is declared by seven providers. */
const distinct = (strings: ServerString[]) => {
  const byKey = new Map<string, ServerString[]>();
  for (const entry of strings) {
    const list = byKey.get(entry.key) ?? [];
    list.push(entry);
    byKey.set(entry.key, list);
  }
  return byKey;
};

const writeReport = (strings: ServerString[]) => {
  const out = process.env.ARABIC_AUDIT_OUT;
  if (!out) return;
  const target = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const byKey = distinct(strings);
  fs.writeFileSync(
    target,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        check: 'C6 — server-declared strings have keys',
        declarations: strings.length,
        distinct_keys: byKey.size,
        strings: [...byKey.entries()].map(([key, entries]) => ({
          key,
          family: entries[0].family,
          prefix: entries[0].prefix,
          english: entries[0].english,
          declared_by: entries.map(
            (entry) => `${entry.provider}  ${entry.declaration}`
          ),
          missing_from: (['en', 'ar'] as const).filter(
            (lng) => typeof (lng === 'en' ? en : ar)[key] !== 'string'
          ),
        })),
      },
      null,
      2
    )
  );
};

describe('server-declared strings', () => {
  const strings = collect();

  it('has a key in en and ar for every string the server declares for a reader', () => {
    writeReport(strings);
    const missing = [...distinct(strings).entries()].flatMap(([key, entries]) =>
      (['en', 'ar'] as const)
        .filter((lng) => typeof (lng === 'en' ? en : ar)[key] !== 'string')
        .map(
          (lng) =>
            `${entries[0].provider}  ${entries[0].declaration}  "${entries[0].english}"  → expected key ${key} missing from ${lng}`
        )
    );
    expect(missing).toEqual([]);
  });

  // In en the value must be the declared English itself, so that an English reader sees
  // exactly today's text and a key can never quietly change what the server said.
  it('carries the declared English verbatim as the en value', () => {
    const drifted = [...distinct(strings).entries()]
      .filter(([key, entries]) => typeof en[key] === 'string' && en[key] !== entries[0].english)
      .map(([key, entries]) => `${key}: en="${en[key]}" declared="${entries[0].english}"`);
    expect(drifted).toEqual([]);
  });

  // Guards the guard. A walk that found no @Plug would report nothing missing and pass
  // in silence, which is the loudest possible way to stop checking.
  it('finds declarations in every family', () => {
    const families = new Set(strings.map((entry) => entry.family));
    expect([...families].sort()).toEqual([
      'custom-field',
      'plug',
      'post-settings-plug',
      'preference',
      'validation',
    ]);
  });
});
