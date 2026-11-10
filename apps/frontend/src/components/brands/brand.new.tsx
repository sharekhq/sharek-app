'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import {
  Channel,
  FOCUS_RING,
} from '@gitroom/frontend/components/launches/channel.panel';
import { Check } from '@gitroom/frontend/components/launches/tags.component';
import { useBrands } from '@gitroom/frontend/components/brands/use.brands';

/**
 * Creating a brand, for the Brands page's New brand and onboarding's "Your
 * brand" step. `ungrouped` counts the channels in no brand, which the server
 * moves only into the organization's first brand (FR-005), so it is 0 once
 * there is a brand, and while GET /brands is still loading, so an
 * organization with brands never sees the offer come and go. `create` sends
 * POST /brands with the name trimmed and the move when there is one to make,
 * and answers the new brand's id, or the reason there is none in the page's
 * own words: a taken name (the API's 400) or another failure. One the fetch
 * interceptor answered already (the limit modal, a redirect) has no reason
 * to give.
 */
export const useCreateBrand = () => {
  const t = useT();
  const fetch = useFetch();
  const { data: brands } = useBrands();
  const { data: integrations } = useIntegrationList();
  const channels: Channel[] = integrations;
  const ungrouped =
    !brands || brands.length
      ? 0
      : channels.filter((channel) => !channel.customer?.id).length;

  const create = async (
    name: string,
    move: boolean
  ): Promise<{ id: string } | { problem?: string }> => {
    try {
      const response = await fetch('/brands', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          moveUngrouped: !!ungrouped && move,
        }),
      });
      if (response.ok) {
        return { id: (await response.json()).id };
      }
      return {
        problem:
          response.status === 400
            ? t('brands_name_taken', 'A brand with this name already exists.')
            : t('could_not_save_group', 'Could not save the group.'),
      };
    } catch (e) {
      return isAlreadyAnswered(e)
        ? {}
        : { problem: t('could_not_save_group', 'Could not save the group.') };
    }
  };

  return { ungrouped, create };
};

// The offer to move the channels in no brand into the new brand, ticked
// (board BrandsNew): New brand's and onboarding's, each in its own words. A
// checkbox the channel list's Check ticks; onboarding's is disabled once its
// brand is created.
export const MoveChannelsOffer: FC<{
  checked: boolean;
  onToggle: () => void;
  title: string;
  hint: string;
  disabled?: boolean;
}> = ({ checked, onToggle, title, hint, disabled }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    disabled={disabled}
    onClick={onToggle}
    className={clsx(
      'flex items-start gap-[12px] p-[12px] rounded-[10px] border text-start cursor-pointer disabled:cursor-default transition-colors',
      checked ? 'border-brand bg-brandSoft' : 'border-line',
      FOCUS_RING
    )}
  >
    {/* the channel list's Check, which the offer's button ticks */}
    <Check value={checked} onChange={() => {}} />
    <span className="flex flex-col gap-[3px]">
      <span className="text-[14px] font-[600] text-ink">{title}</span>
      <span className="text-[12.5px] leading-[1.45] text-muted">{hint}</span>
    </span>
  </button>
);
