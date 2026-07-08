// Guards the locale files against duplicate JSON keys. JSON.parse silently keeps
// the last occurrence, so a re-added key overrides the original for every caller
// (add_provider_title regression: customFields modals rendered "Add {{provider}}").
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

// JSON.parse cannot report duplicates, so scan the raw text: a string followed by
// ':' is a key; a Set per '{' depth catches re-declarations within the same object.
const findDuplicateKeys = (raw: string): string[] => {
  const duplicates: string[] = [];
  const objectKeys: Array<Set<string>> = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      let j = i + 1;
      let key = '';
      while (j < raw.length && raw[j] !== '"') {
        key += raw[j] === '\\' ? raw[j] + raw[j + 1] : raw[j];
        j += raw[j] === '\\' ? 2 : 1;
      }
      let k = j + 1;
      while (k < raw.length && ' \t\r\n'.includes(raw[k])) {
        k += 1;
      }
      if (raw[k] === ':' && objectKeys.length > 0) {
        const keys = objectKeys[objectKeys.length - 1];
        if (keys.has(key)) {
          duplicates.push(key);
        }
        keys.add(key);
      }
      i = j + 1;
    } else {
      if (ch === '{') {
        objectKeys.push(new Set());
      } else if (ch === '}') {
        objectKeys.pop();
      }
      i += 1;
    }
  }
  return duplicates;
};

describe('findDuplicateKeys', () => {
  it('reports a key declared twice in the same object', () => {
    expect(findDuplicateKeys('{"a": "1", "b": "2", "a": "3"}')).toEqual(['a']);
  });

  it('ignores values and same-named keys in different objects', () => {
    expect(
      findDuplicateKeys('{"a": "a", "b": {"a": "{}"}, "c": ["a", "b"]}')
    ).toEqual([]);
  });
});

describe('translation locale files', () => {
  const locales = fs
    .readdirSync(LOCALES_DIR)
    .filter((lng) =>
      fs.existsSync(path.join(LOCALES_DIR, lng, 'translation.json'))
    );

  it.each(locales)('%s/translation.json has no duplicate keys', (lng) => {
    const raw = fs.readFileSync(
      path.join(LOCALES_DIR, lng, 'translation.json'),
      'utf8'
    );
    expect(findDuplicateKeys(raw)).toEqual([]);
  });
});
