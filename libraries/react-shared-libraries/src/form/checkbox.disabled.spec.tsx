import { FC, act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { Checkbox } from './checkbox';

// Mirrors the real call site, spread included — TikTok disables these in Upload mode:
//   <Checkbox label="Duet" disabled={isUploadMode} {...register('duet', { value: false })} />
const Row: FC<{ disabled?: boolean; onChange?: () => void }> = ({
  disabled,
  onChange,
}) => {
  const { register } = useFormContext();
  return (
    <Checkbox
      label="Duet"
      disabled={disabled}
      {...register('duet')}
      onChange={onChange}
    />
  );
};

const Harness: FC<{ disabled?: boolean; onChange?: () => void }> = ({
  disabled,
  onChange,
}) => {
  const form = useForm({ defaultValues: { duet: false } });
  return (
    <FormProvider {...form}>
      <Row disabled={disabled} onChange={onChange} />
    </FormProvider>
  );
};

const markup = (disabled?: boolean) =>
  renderToStaticMarkup(<Harness disabled={disabled} />);

/** Mounts into a real DOM and hands back the 24px box. */
const mount = (props: { disabled?: boolean; onChange?: () => void }) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<Harness {...props} />);
  });

  // Not a [class*="w-[24px]"] selector: happy-dom's parser trips on the nested brackets.
  const box = [...host.querySelectorAll('div')].find((d) =>
    d.className.includes('w-[24px]')
  ) as HTMLElement;
  if (!box) throw new Error(`no 24px box in: ${host.innerHTML}`);

  return {
    box,
    click: () => act(() => box.dispatchEvent(new MouseEvent('click', { bubbles: true }))),
    isChecked: () => box.className.includes('bg-brand'),
  };
};

describe('Checkbox disabled', () => {
  it('dims itself the way a disabled Button does', () => {
    expect(markup(true)).toContain('opacity-50');
    expect(markup(true)).toContain('pointer-events-none');
  });

  it('stops advertising itself as clickable', () => {
    expect(markup(true)).not.toContain('cursor-pointer');
    expect(markup(false)).toContain('cursor-pointer');
  });

  it('tells assistive tech it is unavailable', () => {
    expect(markup(true)).toContain('aria-disabled="true"');
    expect(markup(false)).not.toContain('aria-disabled');
  });

  it('leaves the enabled rendering untouched', () => {
    expect(markup(false)).toBe(markup(undefined));
    expect(markup(false)).not.toMatch(/opacity-50|pointer-events-none|aria-disabled/);
  });

  it('does not toggle when clicked', () => {
    const cb = mount({ disabled: true });

    expect(cb.isChecked()).toBe(false);
    cb.click();
    expect(cb.isChecked()).toBe(false);
  });

  it('does not notify the consumer when clicked', () => {
    const onChange = jest.fn();
    mount({ disabled: true, onChange }).click();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still toggles when enabled', () => {
    const cb = mount({ disabled: false });

    expect(cb.isChecked()).toBe(false);
    cb.click();
    expect(cb.isChecked()).toBe(true);
  });
});
