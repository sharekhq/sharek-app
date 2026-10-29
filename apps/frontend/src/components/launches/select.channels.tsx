'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { uniqBy } from 'lodash';
import { useClickOutside } from '@mantine/hooks';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { FilterIcon } from '@gitroom/frontend/components/ui/icons';
import { Check } from '@gitroom/frontend/components/launches/tags.component';
import { IntegrationListRow } from '@gitroom/frontend/components/new-launch/picks.socials.component';

export const SelectChannels: FC<{
  list?: boolean;
}> = ({ list }) => {
  const { integrations, customer, selectedChannels, setSelectedChannels } =
    useCalendar();
  const t = useT();
  const [pos, setPos] = useState<any>({});
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => {
    if (open) {
      setOpen(false);
    }
  });

  const channels = useMemo(
    () =>
      integrations.filter((i) => !customer || i.customer?.id === customer),
    [integrations, customer]
  );

  const selectedIds = selectedChannels ?? channels.map((c) => c.id);
  const allSelected = channels.every((c) => selectedIds.includes(c.id));

  const openClose = useCallback(() => {
    if (open) {
      setOpen(false);
      return;
    }

    const { x, y, width, height } = ref.current?.getBoundingClientRect();
    // the list hangs from the trigger's start edge, so in Arabic it opens
    // leftwards from the trigger's right edge, clamped like the left case
    setPos(
      document.dir === 'rtl'
        ? {
            top: y + height,
            right: Math.min(
              window.innerWidth - (x + width),
              window.innerWidth - 270
            ),
          }
        : { top: y + height, left: Math.min(x, window.innerWidth - 270) }
    );
    setOpen(true);
  }, [open]);

  const toggleAll = useCallback(() => {
    setSelectedChannels(allSelected ? [] : null);
  }, [allSelected]);

  const toggle = useCallback(
    (id: string) => () => {
      const next = selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id];
      setSelectedChannels(next.length === channels.length ? null : next);
    },
    [selectedIds, channels]
  );

  if (channels.length <= 1) {
    return null;
  }

  if (list) {
    // the customers are listed above the channels when there are any
    const hasCustomers =
      uniqBy(integrations, (i) => i?.customer?.id).length > 1;
    return (
      <div className="flex flex-col gap-[4px]">
        {hasCustomers && (
          <div className="text-[14px] font-[600] text-textItemBlur">
            {t('channels', 'Channels')}
          </div>
        )}
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected}
          onClick={toggleAll}
          className="w-full min-h-[44px] flex items-center gap-[12px] py-[8px] text-start rounded-[8px] cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="flex-1 text-[14px] font-[600]">
            {t('select_all', 'Select all')}
          </span>
          <Check onChange={() => {}} value={allSelected} />
        </button>
        {channels.map((p) => (
          <IntegrationListRow
            key={p.id}
            integration={p}
            selected={selectedIds.includes(p.id)}
            onClick={toggle(p.id)}
          />
        ))}
      </div>
    );
  }

  // a filtered calendar hides posts, so the trigger says so by its name and a
  // corner mark, not by its border colour alone
  const name = allSelected
    ? t('select_channels_tooltip', 'Select Channels')
    : t('select_channels_filtered', 'Select Channels (filter on)');

  return (
    <div className="relative select-none" ref={ref}>
      <button
        type="button"
        data-tooltip-id="tooltip"
        data-tooltip-content={name}
        aria-label={name}
        aria-expanded={open}
        onClick={openClose}
        className={clsx(
          'relative z-[20] cursor-pointer h-[42px] coarse:h-[54px] rounded-[8px] px-[12px] border flex items-center focus-visible:ring-2 focus-visible:ring-brand',
          open || !allSelected ? 'border-brand' : 'border-newColColor'
        )}
      >
        <FilterIcon />
        {!allSelected && (
          <span
            aria-hidden="true"
            className="w-[8px] h-[8px] bg-brand -top-[1px] -end-[3px] absolute rounded-full"
          />
        )}
      </button>
      {open && (
        <div
          style={pos}
          className="flex flex-col fixed z-[500] py-[12px] bg-newBgColorInner menu-shadow min-w-[250px] max-h-[320px] overflow-y-auto"
        >
          <div className="p-[12px] hover:bg-newBgColor text-[14px] font-[600] flex items-center">
            <Checkbox
              disableForm={true}
              checked={allSelected}
              onChange={toggleAll}
              label={t('select_all', 'Select all')}
            />
          </div>
          {channels.map((p) => (
            <div
              key={p.id}
              className="p-[12px] hover:bg-newBgColor text-[14px] font-[500] flex items-center gap-[10px]"
            >
              <Checkbox
                disableForm={true}
                checked={selectedIds.includes(p.id)}
                onChange={toggle(p.id)}
              />
              <img
                className="w-[24px] h-[24px] rounded-full"
                src={p.picture || '/no-picture.jpg'}
                alt=""
              />
              <div className="truncate">{p.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
