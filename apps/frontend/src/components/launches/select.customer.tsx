'use client';

import { uniqBy } from 'lodash';
import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { UserIcon, DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';
import { customerHue } from '@gitroom/frontend/components/launches/helpers/customer-hue';

export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
  list?: boolean;
}> = (props) => {
  const { onChange, integrations, customer: currentCustomer, list } = props;
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({
      setCurrent: state.setCurrent,
    }))
  );
  const toaster = useToaster();
  const t = useT();
  // The calendar hands its customer in, and both of its selectors (the inline
  // one and the Select Channels sheet's) show that one value, so a pick in
  // either shows in the other; the composer hands none, and the selector keeps
  // the one picked in it.
  const [pickedCustomer, setCustomer] = useState('');
  const customer =
    currentCustomer === undefined ? pickedCustomer : currentCustomer || '';
  const [pos, setPos] = useState<any>({});
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => {
    if (open) {
      setOpen(false);
    }
  });

  const openClose = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    const { x, y, width, height } = ref.current?.getBoundingClientRect();
    setPos({ top: y + height, left: x });
    setOpen(true);
  }, [open]);

  const totalCustomers = useMemo(() => {
    return uniqBy(integrations, (i) => i?.customer?.id).length;
  }, [integrations]);

  const activeCustomer = useMemo(() => {
    return integrations.find((i) => i?.customer?.id === customer)?.customer;
  }, [integrations, customer]);

  const selectCustomer = useCallback(
    (id: string) => () => {
      toaster.show(
        t('customer_socials_selected', 'Customer socials selected'),
        'success'
      );
      setCustomer(id);
      onChange(id);
      setOpen(false);
      setCurrent('global');
    },
    [onChange, toaster, t, setCurrent]
  );

  if (totalCustomers <= 1) {
    return null;
  }

  const customers = uniqBy(integrations, (u) => u?.customer?.name).filter(
    (f) => f.customer?.name
  );

  if (list) {
    return (
      <div className="flex flex-col gap-[8px] pb-[16px]">
        <div className="text-[14px] font-[600] text-textItemBlur">
          {t('customers', 'Customers')}
        </div>
        <div
          role="radiogroup"
          aria-label={t('customers', 'Customers')}
          className="flex flex-col gap-[8px]"
        >
          {customers.map((p) => {
            const selected = customer === p.customer?.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={selectCustomer(p.customer?.id)}
                key={p.customer?.id}
                className="w-full min-h-[44px] flex items-center justify-between gap-[12px] py-[8px] text-start rounded-[8px] cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="text-[14px] font-[600] truncate">
                  {p.customer?.name}
                </span>
                <span
                  className={clsx(
                    'w-[24px] h-[24px] min-w-[24px] rounded-full border-[1.5px] flex justify-center items-center',
                    selected ? 'border-brand' : 'border-line'
                  )}
                >
                  {selected && (
                    <span className="w-[12px] h-[12px] rounded-full bg-brand" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative select-none" ref={ref}>
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('select_customer_tooltip', 'Select Customer')}
        onClick={openClose}
        className={clsx(
          'relative z-[20] cursor-pointer h-[42px] coarse:h-[54px] rounded-[8px] pl-[16px] pr-[12px] gap-[8px] border flex items-center text-[14px] font-[600]',
          activeCustomer
            ? 'bg-brandSoft text-brandText'
            : 'bg-btnSimple text-btnText',
          open
            ? 'border-brand'
            : activeCustomer
            ? 'border-transparent'
            : 'border-newColColor'
        )}
      >
        <div>
          <UserIcon />
        </div>
        <div>{activeCustomer?.name || t('select_customer', 'Select Customer')}</div>
        <div>
          <DropdownArrowIcon rotated={open} />
        </div>
      </div>
      {open && (
        <div
          style={pos}
          className="flex flex-col fixed z-[500] pt-[12px] bg-newBgColorInner menu-shadow rounded-[12px] overflow-hidden min-w-[250px]"
        >
          <div className="text-[11px] font-[600] uppercase tracking-[0.08em] text-muted px-[12px] mb-[5px]">
            {t('customers', 'Customers')}
          </div>
          {customers.map((p) => (
            <div
              onClick={selectCustomer(p.customer?.id)}
              key={p.customer?.id}
              className="p-[12px] cursor-pointer hover:bg-surface2 text-[14px] font-[500] h-[32px] flex items-center gap-[8px]"
            >
              <div
                className={clsx(
                  'w-[8px] h-[8px] rounded-full flex-none',
                  customerHue(p.customer?.name || '')
                )}
              />
              {p.customer?.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
