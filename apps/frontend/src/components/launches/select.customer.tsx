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

export const SelectCustomer: FC<{
  onChange: (value: string) => void;
  integrations: Integrations[];
  customer?: string;
}> = (props) => {
  const { onChange, integrations, customer: currentCustomer } = props;
  const { setCurrent } = useLaunchStore(
    useShallow((state) => ({
      setCurrent: state.setCurrent,
    }))
  );
  const toaster = useToaster();
  const t = useT();
  const [customer, setCustomer] = useState(currentCustomer || '');
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

  if (totalCustomers <= 1) {
    return null;
  }

  return (
    <div className="relative select-none z-[500]" ref={ref}>
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('select_customer_tooltip', 'Select Customer')}
        onClick={openClose}
        className={clsx(
          'relative z-[20] cursor-pointer h-[42px] rounded-[8px] pl-[16px] pr-[12px] gap-[8px] border flex items-center text-[14px] font-[600]',
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
          className="flex flex-col fixed pt-[12px] bg-newBgColorInner menu-shadow rounded-[12px] overflow-hidden min-w-[250px]"
        >
          <div className="text-[11px] font-[600] uppercase tracking-[0.08em] text-muted px-[12px] mb-[5px]">
            {t('customers', 'Customers')}
          </div>
          {uniqBy(integrations, (u) => u?.customer?.name)
            .filter((f) => f.customer?.name)
            .map((p) => (
              <div
                onClick={() => {
                  toaster.show(
                    t('customer_socials_selected', 'Customer socials selected'),
                    'success'
                  );
                  setCustomer(p.customer?.id);
                  onChange(p.customer?.id);
                  setOpen(false);
                  setCurrent('global')
                }}
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

/* v3 categorical slots, fixed order — same hash everywhere a customer wears
   a color, so a customer keeps one hue across the app */
const CUSTOMER_HUES = [
  'bg-catPomegranate',
  'bg-catSaffron',
  'bg-catFayrouz',
  'bg-catPalm',
  'bg-catLapis',
  'bg-catClay',
];
const customerHue = (name: string) =>
  CUSTOMER_HUES[
    Math.abs(
      [...name].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0)
    ) % CUSTOMER_HUES.length
  ];
