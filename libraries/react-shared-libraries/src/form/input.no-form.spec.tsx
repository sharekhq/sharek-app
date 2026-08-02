import { renderToStaticMarkup } from 'react-dom/server';

// react-i18next suspends during a static render (no initialized backend here), and the label
// is not what these specs assert — stub it down to its fallback text.
jest.mock('../translation/translated-label', () => ({
  TranslatedLabel: (props: { label: string }) => props.label,
}));

import { Input } from './input';

// The media settings modal (alt text + thumbnail) opens outside any FormProvider, so it drives
// Input as a plain controlled field via `disableForm`. Before that, it hand-rolled an <input>
// painted `bg-input` — which resolves to --surface-2, the same grey as a quiet *button* — so the
// field read as a button while the button beside it read as a field. These specs pin both halves
// of the contract: Input must survive with no form context, and it must paint the app's real
// field chrome.
const render = () =>
  renderToStaticMarkup(
    <Input
      label="Alt text (for accessibility)"
      translationKey="alt_text_accessibility"
      name="alt"
      disableForm={true}
      removeError={true}
      value=""
      onChange={() => {
        /* controlled by the caller */
      }}
      placeholder="Describe the image or video content…"
    />
  );

const classLists = (markup: string): string[][] =>
  [...markup.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));

describe('Input outside a FormProvider', () => {
  it('renders instead of throwing on the missing form context', () => {
    expect(() => render()).not.toThrow();
    expect(render()).toContain(
      'placeholder="Describe the image or video content…"'
    );
  });

  it('paints the app field chrome, not a filled-button surface', () => {
    const classes = classLists(render());
    const shell = classes.find((c) => c.includes('h-[42px]'));

    expect(shell).toBeDefined();
    expect(shell).toEqual(
      expect.arrayContaining([
        'bg-newBgColorInner',
        'border',
        'border-newTableBorder',
        'rounded-[8px]',
      ])
    );
    // --surface-2 is the quiet-button fill; a field painted with it is indistinguishable
    // from a button sitting next to it.
    expect(shell).not.toContain('bg-input');
    expect(shell).not.toContain('bg-surface2');
  });

  it('omits the error slot when asked, so the modal spacing stays even', () => {
    expect(render()).not.toContain('text-error');
  });
});
