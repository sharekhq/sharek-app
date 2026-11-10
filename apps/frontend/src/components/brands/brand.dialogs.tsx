'use client';

import dynamic from 'next/dynamic';
import { FC, FormEvent, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { BRAND_NAME_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { Channel } from '@gitroom/frontend/components/launches/channel.panel';
import {
  Brand,
  useBrandChange,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';
import {
  MoveChannelsOffer,
  useCreateBrand,
} from '@gitroom/frontend/components/brands/brand.new';

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
// (FR-005). A refusal, a taken name among them, keeps the dialog open and
// says why in a toast.
const NewBrand: FC<{
  close: () => void;
  onCreated: (id: string) => void;
}> = ({ close, onCreated }) => {
  const t = useT();
  const toaster = useToaster();
  const { ungrouped, create } = useCreateBrand();
  const [name, setName] = useState('');
  const [move, setMove] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const created = await create(name, move);
    setSaving(false);
    if ('id' in created) {
      close();
      onCreated(created.id);
    } else if (created.problem) {
      toaster.show(created.problem, 'warning');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-[16px]">
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
        <MoveChannelsOffer
          checked={move}
          onToggle={() => setMove(!move)}
          title={t(
            'brands_move_ungrouped',
            'Move my {{count}} channels with no brand into it',
            { count: ungrouped }
          )}
          hint={t(
            'brands_move_ungrouped_hint',
            'Offered with your first brand only. You can move channels out later.'
          )}
        />
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
  const { mutate: reloadBrands } = useBrands();
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
