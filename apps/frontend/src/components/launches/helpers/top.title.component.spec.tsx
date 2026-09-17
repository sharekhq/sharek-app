import { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// Feature 029-arabic-audit-followup (T006, contracts/checks.md T6).
//
// A regression pin, not a defect test: it passes before the refactor and after it.
// T007 lifts the key-derivation formula out of TranslatedLabel and TopTitle — two
// inline copies today — into translation/derive-key.ts, so that the C6 guard and the
// render sites cannot drift apart. The formula decides which locale key a label
// resolves, so getting it subtly wrong renames keys silently: the string still
// renders, in English, and tsc and lint both stay green. That is exactly how 028's
// first wiring pass broke TranslatedLabel's derivation and moved five strings onto
// keys that did not exist.
//
// So the derivation is pinned to real keys. t is mocked to return the key it is
// asked for, which makes the rendered text the key, and each expected key is also
// asserted to exist in en — a formula that produced a well-formed key nobody
// translated would otherwise look correct here.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/frontend/components/ui/icons', () => ({
  ExpandIcon: () => null,
  CollapseIcon: () => null,
}));

import { TranslatedLabel } from '@gitroom/react/translation/translated-label';
import { TopTitle } from '@gitroom/frontend/components/launches/helpers/top.title.component';

const en = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      '../../../../../../libraries/react-shared-libraries/src/translation/locales/en/translation.json'
    ),
    'utf8'
  )
);

const textOf = (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(element);
  });
  return container.textContent?.trim();
};

// Labels and titles whose keys are already in the locale, so a changed formula
// shows up as a key that is not there rather than as a cosmetic difference.
const LABELS: ReadonlyArray<readonly [string, string]> = [
  ['Post Type', 'label_post_type'],
  ['Graduation Strategy', 'label_graduation_strategy'],
  ['Delay', 'label_delay'],
];

const TITLES: ReadonlyArray<readonly [string, string]> = [
  ['Media Library', 'top_title_media_library'],
  ['Configure Provider', 'top_title_configure_provider'],
  ['Add Member', 'top_title_add_member'],
];

describe('derived translation keys', () => {
  it.each(LABELS)('TranslatedLabel resolves %s through %s', (label, key) => {
    expect(textOf(<TranslatedLabel label={label} />)).toBe(key);
  });

  it.each(TITLES)('TopTitle resolves %s through %s', (title, key) => {
    expect(textOf(<TopTitle title={title} />)).toBe(key);
  });

  // Without this, a formula that derived label_post_type_ from "Post Type" would
  // still satisfy the table above if the table were updated to match it.
  it.each([...LABELS, ...TITLES])(
    'the key %s derives is one the locale actually carries (%s)',
    (_text, key) => {
      expect(typeof en[key]).toBe('string');
    }
  );

  // An explicit translationKey must keep overriding the derivation; the wrappers
  // T040-T044 add pass a derived key positionally and would silently lose this.
  it('honours an explicit translationKey over the derived one', () => {
    expect(
      textOf(<TranslatedLabel label="Post Type" translationKey="label_delay" />)
    ).toBe('label_delay');
  });
});
