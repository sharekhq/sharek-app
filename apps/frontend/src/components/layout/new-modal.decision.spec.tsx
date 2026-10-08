import { FC, act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));

import i18next from '@gitroom/react/translation/i18next';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import {
  areYouSure,
  decisionModalEmitter,
  DecisionEverywhere,
  ModalManagerInner,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';

/**
 * Upstream's CAL-5 painted the delete confirmation red: a darker red approve
 * button inside a red-bordered card, switched on by a new `destructive` flag.
 * Sharek's confirmations already approve with the danger button, so the merge
 * kept the flag's plumbing and left it unread. Upstream also gave the dialog
 * English defaults; the merge kept Sharek's translated ones.
 */

const locale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

const en = locale('en');
const ar = locale('ar');

// i18next preloads every language only when it sees no `window`; the component
// specs install one, so the bundles are asked for explicitly here.
beforeAll(async () => {
  await i18next.loadLanguages(['en', 'ar']);
});

let closeEveryModal: (() => void) | undefined;
const CaptureModals: FC = () => {
  const { closeAll } = useModals();
  useEffect(() => {
    closeEveryModal = closeAll;
  }, [closeAll]);
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

const mount = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(
      <>
        <CaptureModals />
        <ModalManagerInner />
        <DecisionEverywhere />
      </>
    );
  });
};

// The dialog is opened from outside React, as the app's callers open it.
const decide = async (open: () => Promise<boolean>) => {
  await act(async () => {
    open();
  });
};

// The card's close cross is a button with no text; the decision's are labelled.
const buttons = () =>
  Array.from(document.querySelectorAll('button')).filter(
    (button) => button.textContent
  );

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
    closeEveryModal?.();
  });
  // DecisionEverywhere never unsubscribes, so each mount would add a listener.
  decisionModalEmitter.removeAllListeners('open');
  document.body.innerHTML = '';
  await i18next.changeLanguage('en');
});

describe('a destructive confirmation', () => {
  it('approves with the danger button and no red frame', async () => {
    await mount();

    await decide(() =>
      deleteDialog('m', undefined, undefined, undefined, true)
    );

    const approve = buttons().filter(
      (button) => button.textContent === en.yes_delete_it
    );
    expect(approve).toHaveLength(1);
    expect(approve[0].className).toContain('bg-error');
    expect(document.querySelector('[class*="red-"]')).toBeNull();
  });
});

describe('a confirmation with no text of its own', () => {
  it('asks in Arabic once the language is Arabic', async () => {
    await mount();
    await i18next.changeLanguage('ar');

    await decide(() => areYouSure());

    expect(document.body.textContent).toContain(ar.are_you_sure);
    expect(buttons().map((button) => button.textContent)).toEqual([
      ar.yes,
      ar.no,
    ]);
  });
});
