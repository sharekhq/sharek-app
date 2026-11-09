'use client';

import dynamic from 'next/dynamic';
import { FC, FormEvent, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { BRAND_NAME_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  Channel,
  FOCUS_RING,
} from '@gitroom/frontend/components/launches/channel.panel';
import { Check } from '@gitroom/frontend/components/launches/tags.component';
import {
  Brand,
  useBrandChange,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';

// The calendar's rename dialog, loaded when it opens, so the calendar page's
// module (the calendar, the composer) stays out of the Brands page.
const EditGroupNameModal = dynamic(() =>
  import('@gitroom/frontend/components/launches/launches.component').then(
    (mod) => mod.EditGroupNameModal
  )
);

// The boards' dialogs are 520px wide, so a long sentence wraps rather than
// widening the card.
const DIALOG_WIDTH = 520;

// New brand (board BrandsNew): the name, and on the organization's first
// brand only, the offer to move the channels in no brand into it, ticked
// (FR-005). A taken name keeps the dialog open with the page's own words for
// the API's 400.
const NewBrand: FC<{
  ungrouped: number;
  close: () => void;
  onCreated: (id: string) => void;
}> = ({ ungrouped, close, onCreated }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [name, setName] = useState('');
  const [move, setMove] = useState(true);
  const [saving, setSaving] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/brands', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          moveUngrouped: !!ungrouped && move,
        }),
      });
      if (!response.ok) {
        toaster.show(
          response.status === 400
            ? t('brands_name_taken', 'A brand with this name already exists.')
            : t('could_not_save_group', 'Could not save the group.'),
          'warning'
        );
        return;
      }
      const { id } = await response.json();
      close();
      onCreated(id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={create} className="flex flex-col gap-[16px]">
      {/* An empty field keeps the interface's direction: dir="auto" with
          nothing typed resolves left to right. */}
      <Input
        name="name"
        disableForm={true}
        label={t('name', 'Name')}
        value={name}
        maxLength={BRAND_NAME_MAX}
        dir={name ? 'auto' : undefined}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      {!!ungrouped && (
        <button
          type="button"
          role="checkbox"
          aria-checked={move}
          onClick={() => setMove(!move)}
          className={clsx(
            'flex items-start gap-[12px] p-[12px] rounded-[10px] border text-start cursor-pointer transition-colors',
            move ? 'border-brand bg-brandSoft' : 'border-line',
            FOCUS_RING
          )}
        >
          {/* the channel list's Check, which the offer's button ticks */}
          <Check value={move} onChange={() => {}} />
          <span className="flex flex-col gap-[3px]">
            <span className="text-[14px] font-[600] text-ink">
              {t(
                'brands_move_ungrouped',
                'Move my {{count}} channels with no brand into it',
                { count: ungrouped }
              )}
            </span>
            <span className="text-[12.5px] leading-[1.45] text-muted">
              {t(
                'brands_move_ungrouped_hint',
                'Offered with your first brand only. You can move channels out later.'
              )}
            </span>
          </span>
        </button>
      )}
      <div className="flex justify-end gap-[8px]">
        <Button variant="ghost" onClick={close}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" loading={saving} disabled={!name.trim()}>
          {t('brands_create_brand', 'Create brand')}
        </Button>
      </div>
    </form>
  );
};

// The Brands page's dialogs, for its New brand button, its Rename button and
// its ⋯ menu. Each change reloads GET /brands and the channel list, which says
// each channel's brand everywhere in the app.
export const useBrandDialogs = () => {
  const t = useT();
  const send = useBrandChange();
  const modals = useModals();
  const { data: brands, mutate: reloadBrands } = useBrands();
  const { data: integrations, mutate: reloadChannels } = useIntegrationList();
  const channels: Channel[] = integrations;

  const reload = () => {
    reloadBrands();
    reloadChannels();
  };

  const openNewBrand = (onCreated?: (id: string) => void) =>
    modals.openModal({
      title: t('brands_new_brand', 'New brand'),
      size: DIALOG_WIDTH,
      children: (close) => (
        <NewBrand
          ungrouped={
            brands?.length
              ? 0
              : channels.filter((channel) => !channel.customer?.id).length
          }
          close={close}
          onCreated={(id) => {
            reload();
            onCreated?.(id);
          }}
        />
      ),
    });

  // Delete (board BrandsDelete) in the app's confirmation: what happens to the
  // brand's channels and kit images, then the delete (FR-006), whose refusal
  // says why and changes nothing. Its buttons
  // keep the app's order, Delete brand before Cancel, where the board ends
  // with Delete brand.
  const openDeleteBrand = async (brand: Pick<Brand, 'id' | 'name'>) => {
    if (
      !(await deleteDialog(
        t(
          'brands_delete_body',
          'Its {{count}} channels stay connected and move to No brand. The logo and example posts stay in your Media library.',
          {
            count: channels.filter(
              (channel) => channel.customer?.id === brand.id
            ).length,
          }
        ),
        t('brands_delete_brand', 'Delete brand'),
        t('brands_delete_named', 'Delete {{name}}?', {
          name: isolate(brand.name),
          interpolation: { escapeValue: false },
        }),
        t('cancel', 'Cancel'),
        true
      ))
    ) {
      return;
    }
    if (await send(`/brands/${brand.id}`, { method: 'DELETE' })) {
      reload();
    }
  };

  // The calendar's own rename dialog, on the route it uses (C3).
  const openRenameBrand = (brand: Pick<Brand, 'id' | 'name'>) =>
    modals.openModal({
      title: t('edit_group_name', 'Edit group name'),
      size: DIALOG_WIDTH,
      children: (close) => (
        <EditGroupNameModal
          id={brand.id}
          name={brand.name}
          close={close}
          resolve={reload}
        />
      ),
    });

  return { openNewBrand, openDeleteBrand, openRenameBrand };
};
