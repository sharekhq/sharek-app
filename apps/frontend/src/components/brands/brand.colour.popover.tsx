'use client';

import { FC, KeyboardEvent, useRef, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { BRAND_COLOURS_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { Button } from '@gitroom/react/form/button';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';

// The popover's width on boards ColourPicker and ColourPickerAR:
// react-colorful's 200px square, 16px inside each edge.
const WIDTH = 234;
// The phone page's side gutter, which the popover keeps clear of.
const GUTTER = 16;

// A whole colour. react-colorful's field passes a three-digit code on as
// well, which the kit refuses.
const FULL_CODE = /^#[0-9a-f]{6}$/i;

// What HexColorInput shows after its # of what is typed or pasted: the hex
// digits, the first six. It tells its onChange only once they make a colour,
// so Add reads them here and follows the code in the field (FR-013).
const fieldDigits = (value: string) =>
  value.replace(/[^0-9a-f]/gi, '').slice(0, 6);

// Mounted only while open, so each opening starts from an empty field.
const ColourForm: FC<{
  colours: string[];
  align: 'start' | 'end';
  onAdd: (code: string) => void;
  onCancel: () => void;
}> = ({ colours, align, onAdd, onCancel }) => {
  const t = useT();
  // The last colour the square or the field made, which the square and the
  // swatch keep showing while the field holds less than a colour.
  const [code, setCode] = useState('');
  // The field's digits, which also give it its text back: leaving a field
  // that holds less than a colour keeps what it holds.
  const [digits, setDigits] = useState('');
  const typed = `#${digits}`.toUpperCase();
  // A colour the kit holds already is refused quietly: Add stays disabled.
  const held = colours.some((colour) => colour.toUpperCase() === typed);

  const pick = (colour: string) => {
    setCode(colour);
    setDigits(colour.slice(1));
  };

  return (
    <div
      role="dialog"
      aria-label={t('brands_add_colour', 'Add a colour')}
      style={{ width: WIDTH }}
      className={clsx(
        'absolute top-[calc(100%+8px)] z-[60] flex flex-col gap-[12px] pt-[14px] px-[16px] pb-[16px] bg-surface border border-line rounded-[12px] shadow-card text-ink',
        align === 'start' ? 'start-0' : 'end-0'
      )}
    >
      <div className="text-[14px] font-[600]">
        {t('brands_add_colour', 'Add a colour')}
      </div>
      {/* A colour square reads the same in either language. */}
      <HexColorPicker dir="ltr" color={code || undefined} onChange={pick} />
      <div className="flex items-center gap-[8px]">
        <span
          aria-hidden="true"
          className="flex-none w-[40px] h-[40px] rounded-[8px] ring-1 ring-inset ring-line bg-surface2"
          style={{ backgroundColor: FULL_CODE.test(code) ? code : undefined }}
        />
        <HexColorInput
          prefixed
          autoFocus
          dir="ltr"
          color={`#${digits}`}
          onChange={setCode}
          onInput={(e) => setDigits(fieldDigits(e.currentTarget.value))}
          aria-label={t('brands_hex_code', 'Hex code')}
          className="flex-1 min-w-0 h-[40px] coarse:h-[44px] px-[10px] rounded-[8px] border border-line bg-surface text-ink text-[14px] coarse:text-[16px] tracking-[0.02em] tabular-nums uppercase outline-none focus:border-brand focus:ring-[3px] focus:ring-brandSoft"
        />
      </div>
      <div className="flex justify-end gap-[8px]">
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button
          disabled={digits.length < 6 || held}
          onClick={() => onAdd(typed)}
        >
          {t('add', 'Add')}
        </Button>
      </div>
    </div>
  );
};

// The colours card's +, and the popover it opens to add one colour. The card
// saves what onAdd hands it, a #RRGGBB code in capitals.
export const BrandColourPopover: FC<{
  colours: string[];
  onAdd: (code: string) => void;
}> = ({ colours, onAdd }) => {
  const t = useT();
  const [open, setOpen] = useState<false | 'start' | 'end'>(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const button = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  // The popover hangs from the +'s start edge, as the boards draw it, unless
  // that runs it off the screen (a + late in its row on a phone): then it
  // hangs from the +'s end edge.
  const toggle = () => {
    if (open || !button.current) {
      setOpen(false);
      return;
    }
    const box = button.current.getBoundingClientRect();
    const rtl = getComputedStyle(button.current).direction === 'rtl';
    const room = rtl ? box.right : window.innerWidth - box.left;
    setOpen(room < WIDTH + GUTTER ? 'end' : 'start');
  };

  // Escape is the popover's alone while it is open, or the page behind would
  // hear it too.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) {
      return;
    }
    e.stopPropagation();
    close();
  };

  if (colours.length >= BRAND_COLOURS_MAX) {
    return null;
  }

  return (
    <div ref={ref} onKeyDown={onKeyDown} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        aria-label={t('brands_add_colour', 'Add a colour')}
        aria-haspopup="dialog"
        aria-expanded={!!open}
        onClick={toggle}
        className={clsx(
          'flex items-center justify-center w-[44px] h-[44px] rounded-[10px] border-[1.5px] border-dashed cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-brand',
          open
            ? 'border-brand bg-brandSoft text-brandText'
            : 'border-line text-muted hover:text-ink'
        )}
      >
        <PlusIcon size={16} aria-hidden="true" />
      </button>
      {open && (
        <ColourForm
          colours={colours}
          align={open}
          onAdd={(code) => {
            onAdd(code);
            close();
          }}
          onCancel={close}
        />
      )}
    </div>
  );
};
