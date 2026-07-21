import { FC } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { Checkbox } from './checkbox';

// The box sits on a panel painted with --surface (bg-newSettings resolves to it). A checkbox
// whose fill *and* border both resolve to that token has no visible edge at all, which is how
// the `hollow` variant shipped: `border-surface border-2 bg-surface`. A filled state may set
// border == fill (the Slider does); what it may never do is match the panel on both.
const PANEL_TOKEN = 'surface';

const Harness: FC<{ checked: boolean }> = ({ checked }) => {
  const form = useForm({ defaultValues: { field: checked } });
  return (
    <FormProvider {...form}>
      <Checkbox name="field" label="Duet" />
    </FormProvider>
  );
};

/** The 24px box, not the flex wrapper around it. */
const boxClasses = (checked: boolean): string[] => {
  const markup = renderToStaticMarkup(<Harness checked={checked} />);
  const box = [...markup.matchAll(/class="([^"]*)"/g)]
    .map((m) => m[1])
    .find((c) => c.includes('w-[24px]'));

  if (!box) throw new Error(`no 24px box found in markup: ${markup}`);
  return box.split(/\s+/);
};

/** `bg-brand` -> `brand`. */
const fillToken = (classes: string[]) =>
  classes.find((c) => c.startsWith('bg-'))?.slice('bg-'.length);

/** `border-muted` -> `muted`; ignores width utilities (`border`, `border-2`). */
const borderToken = (classes: string[]) =>
  classes
    .find((c) => c.startsWith('border-') && !/^border-\d+$/.test(c))
    ?.slice('border-'.length);

describe('Checkbox', () => {
  describe.each([
    ['unchecked', false],
    ['checked', true],
  ] as const)('%s', (_name, checked) => {
    it('is distinguishable from the panel it sits on', () => {
      const classes = boxClasses(checked);

      expect(fillToken(classes)).toBeDefined();
      expect(borderToken(classes)).toBeDefined();
      expect([fillToken(classes), borderToken(classes)]).not.toEqual([
        PANEL_TOKEN,
        PANEL_TOKEN,
      ]);
    });

    it('renders a tick only when checked', () => {
      expect(renderToStaticMarkup(<Harness checked={checked} />).includes('<svg')).toBe(
        checked
      );
    });
  });

  // Unchecked, the fill *is* the panel token, so the border carries the whole edge on its
  // own. --muted clears WCAG 1.4.11's 3:1 against --surface in both themes (5.79:1 light,
  // 6.62:1 dark); --line, used for separators and input borders, does not (1.64:1 / 1.55:1).
  it('outlines the unchecked box in a token that clears 3:1 against the panel', () => {
    expect(borderToken(boxClasses(false))).toBe('muted');
  });

  it('fills the checked box with the brand, matching the Slider', () => {
    expect(fillToken(boxClasses(true))).toBe('brand');
    expect(borderToken(boxClasses(true))).toBe('brand');
  });
});
