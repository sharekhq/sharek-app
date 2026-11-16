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

/** The frame is the box the <input> sits in: with no icon, its direct parent. */
const frameClasses = (): string[] => {
  const frame = render().match(/class="([^"]*)"><input /);
  if (!frame) throw new Error(`no field frame found in markup: ${render()}`);
  return frame[1].split(/\s+/);
};

/** The <input>'s own classes. */
const inputClasses = (): string[] => {
  const input = render().match(/<input [^>]*?class="([^"]*)"/);
  if (!input) throw new Error(`no <input> found in markup: ${render()}`);
  return input[1].split(/\s+/);
};

describe('Input outside a FormProvider', () => {
  it('renders instead of throwing on the missing form context', () => {
    expect(() => render()).not.toThrow();
    expect(render()).toContain(
      'placeholder="Describe the image or video content…"'
    );
  });

  it('paints the app field chrome, not a filled-button surface', () => {
    const shell = frameClasses();

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

  // FR-034: every field is 40px, and 44px under a finger, the same as a
  // button beside it.
  it('is 40px tall, 44px under a coarse pointer', () => {
    const shell = frameClasses();

    expect(shell).toEqual(
      expect.arrayContaining(['h-[40px]', 'coarse:h-[44px]'])
    );
    expect(shell).not.toContain('h-[42px]');
    expect(shell).not.toContain('coarse:h-[46px]');
  });

  // Below 16px iOS Safari zooms the page on focus.
  it('keeps its 16px text under a coarse pointer', () => {
    expect(inputClasses()).toEqual(
      expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
    );
  });

  it('omits the error slot when asked, so the modal spacing stays even', () => {
    expect(render()).not.toContain('text-error');
  });
});
