import { FC } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';

// react-i18next suspends during a static render (no initialized backend here), and the label
// is not what these specs assert — stub it down to its fallback text.
jest.mock('../translation/translated-label', () => ({
  TranslatedLabel: (props: { label: string }) => props.label,
}));

import { Select } from './select';

// A native <select> draws the browser's own arrow glued to the inline-end edge, so every
// dropdown looked cramped and rendered differently per platform. The component must hide the
// native glyph and draw the app chevron itself — and because Arabic is a first-class layout,
// both the asymmetric padding and the chevron position must use logical utilities (ps-/pe-/end-),
// never physical ones (pl-/pr-/left-/right-), so RTL mirrors for free.
const PHYSICAL_UTILITIES = /^(pl-|pr-|left-|right-|-left-|-right-)/;

const Harness: FC = () => {
  const form = useForm({ defaultValues: { field: 'no' } });
  return (
    <FormProvider {...form}>
      <Select name="field" label="Auto add signature?">
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </Select>
    </FormProvider>
  );
};

const classLists = (): string[][] =>
  [...renderToStaticMarkup(<Harness />).matchAll(/class="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/)
  );

/** The <select> paints h-[42px]; nothing else in the component does. */
const selectClasses = (): string[] => {
  const classes = classLists().find((c) => c.includes('h-[42px]'));
  if (!classes)
    throw new Error(
      `no h-[42px] select found in markup: ${renderToStaticMarkup(<Harness />)}`
    );
  return classes;
};

/** The chevron is the only pointer-events-none piece. */
const chevronClasses = (): string[] | undefined =>
  classLists().find((c) => c.includes('pointer-events-none'));

describe('Select', () => {
  it('replaces the native arrow with the app chevron', () => {
    expect(selectClasses()).toContain('appearance-none');

    const chevron = chevronClasses();
    expect(chevron).toBeDefined();
    expect(renderToStaticMarkup(<Harness />)).toContain('<svg');
  });

  it('insets the chevron from the edge instead of gluing it there', () => {
    expect(chevronClasses()).toContain('end-[16px]');
  });

  it('keeps text clear of the chevron with asymmetric logical padding', () => {
    const classes = selectClasses();
    expect(classes).toContain('ps-[16px]');
    expect(classes).toContain('pe-[40px]');
  });

  it('still fills its row from inside the positioning wrapper', () => {
    expect(selectClasses()).toContain('w-full');
  });

  it('uses no physical-direction utilities anywhere (RTL mirrors for free)', () => {
    for (const classes of classLists()) {
      const physical = classes.filter((c) => PHYSICAL_UTILITIES.test(c));
      expect(physical).toEqual([]);
    }
  });
});
