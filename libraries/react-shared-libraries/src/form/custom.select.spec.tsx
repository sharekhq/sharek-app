import { FC } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';

// react-i18next suspends during a static render (no initialized backend here), and the label
// is not what these specs assert — stub it down to its fallback text.
jest.mock('../translation/translated-label', () => ({
  TranslatedLabel: (props: { label: string }) => props.label,
}));

import { CustomSelect } from './custom.select';

// FR-034: the custom select draws its own frame, so it must match the other fields by hand:
// 40px tall (44px under a finger) with the same 8px corners as Input and Select.
const Harness: FC = () => {
  const form = useForm({ defaultValues: { field: undefined } });
  return (
    <FormProvider {...form}>
      <CustomSelect
        name="field"
        label="Pick one"
        placeholder="Choose…"
        options={[
          { value: 'a', label: 'First' },
          { value: 'b', label: 'Second' },
        ]}
      />
    </FormProvider>
  );
};

const classLists = (): string[][] =>
  [...renderToStaticMarkup(<Harness />).matchAll(/class="([^"]*)"/g)].map((m) =>
    m[1].split(/\s+/)
  );

/** With the option list closed, the frame is the one bordered box. */
const frameClasses = (): string[] => {
  const framed = classLists().filter((c) => c.includes('border'));
  expect(framed).toHaveLength(1);
  return framed[0];
};

describe('CustomSelect', () => {
  it('is 40px tall, 44px under a coarse pointer', () => {
    const classes = frameClasses();
    expect(classes).toEqual(
      expect.arrayContaining(['h-[40px]', 'coarse:h-[44px]'])
    );
    expect(classes).not.toContain('h-[44px]');
  });

  it('rounds its corners 8px, as Input and Select do', () => {
    const classes = frameClasses();
    expect(classes).toContain('rounded-[8px]');
    expect(classes).not.toContain('rounded-[4px]');
  });
});
