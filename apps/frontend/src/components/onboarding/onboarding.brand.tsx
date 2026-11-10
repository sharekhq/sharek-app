'use client';

import { Dispatch, FC, SetStateAction, useId, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { BRAND_NAME_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import { useBrands } from '@gitroom/frontend/components/brands/use.brands';
import {
  MoveChannelsOffer,
  useCreateBrand,
} from '@gitroom/frontend/components/brands/brand.new';
import {
  useWebsiteLookup,
  WebsiteLookupFields,
} from '@gitroom/frontend/components/brands/brand.website';

// What the step has done, which the modal keeps for it, as each step change
// unmounts the step left: the name typed and, once Continue has created the
// brand, its id. Coming back shows that brand, its name read-only, and
// Continue then only saves suggestions to it.
export type OnboardingBrandDraft = { name: string; id?: string };

// "Your brand" (boards OnboardBrand and OnboardBrandPhone, FR-030): a name,
// the Brands page's website lookup, and on the organization's first brand the
// offer to put its channels in it, ticked. Skip creates nothing. Continue
// creates the brand, then saves what was kept of the suggestions to its kit,
// then moves on; a logo that couldn't be saved keeps the step, and Continue
// again saves to the brand already created. Sharek's own step, so it lives
// here and upstream's onboarding.modal.tsx only names it in its steps.
export const OnboardingBrand: FC<{
  draft: OnboardingBrandDraft;
  setDraft: Dispatch<SetStateAction<OnboardingBrandDraft>>;
  onBack: () => void;
  onNext: () => void;
}> = ({ draft, setDraft, onBack, onNext }) => {
  const t = useT();
  const id = useId();
  const lookup = useWebsiteLookup();
  const { ungrouped, create } = useCreateBrand();
  const { mutate: reloadBrands } = useBrands();
  const { mutate: reloadChannels } = useIntegrationList();
  const { name, id: created } = draft;
  const [move, setMove] = useState(true);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string>();
  const saving = creating || lookup.busy === 'save';

  // New brand's POST /brands, answering the new brand's id, which the draft
  // keeps; a refusal says why under the name, in New brand's words.
  const createBrand = async () => {
    setProblem(undefined);
    setCreating(true);
    const answer = await create(name, move);
    setCreating(false);
    if ('id' in answer) {
      setDraft((current) => ({ ...current, id: answer.id }));
      return answer.id;
    }
    setProblem(answer.problem);
    return undefined;
  };

  // The brand list and the channel list reload once the kit is saved, so the
  // new brand's kit and its channels show everywhere in the app.
  const next = async () => {
    const brandId = created ?? (await createBrand());
    if (!brandId) {
      return;
    }
    const saved = !lookup.kept || !!(await lookup.save(brandId));
    reloadBrands();
    reloadChannels();
    if (saved) {
      onNext();
    }
  };

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex gap-[4px] flex-col text-center">
        <div className="text-[24px] phone:text-[20px] font-semibold">
          {t('brands_onboard_title', 'Set up your brand')}
        </div>
        <div className="text-[14px] text-muted">
          {t(
            'brands_onboard_body',
            "Samy and Sharek's AI use its logo and look to keep your images on-brand. Add more brands later from Brands."
          )}
        </div>
      </div>

      <div className="flex flex-col gap-[16px] w-full max-w-[760px] mx-auto p-[20px] phone:p-[14px] rounded-[14px] bg-panel">
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={id} className="text-[13px] font-[600] text-inkSoft">
            {t('brands_onboard_name', 'Brand name')}
          </label>
          {/* An empty field keeps the interface's direction: dir="auto" with
              nothing typed resolves left to right. Once the brand is created,
              the name is the one it was created with. */}
          <input
            id={id}
            type="text"
            value={name}
            maxLength={BRAND_NAME_MAX}
            dir={name ? 'auto' : undefined}
            readOnly={!!created}
            onChange={(e) => setDraft({ name: e.target.value })}
            className={clsx(
              'h-[40px] coarse:h-[44px] px-[10px] rounded-[8px] border border-line bg-surface text-ink text-[14px] coarse:text-[16px] outline-none',
              FOCUS_RING
            )}
          />
          {problem && (
            <p role="alert" className="text-[13px] leading-[1.5] text-error">
              {problem}
            </p>
          )}
        </div>
        <WebsiteLookupFields
          lookup={lookup}
          label={t('brands_onboard_website', 'Your website')}
        />
        {!!ungrouped && (
          <MoveChannelsOffer
            checked={move}
            onToggle={() => setMove(!move)}
            disabled={!!created}
            title={t(
              'brands_onboard_put_channels',
              'Put my {{count}} channels in this brand',
              { count: ungrouped }
            )}
            hint={t(
              'brands_onboard_move_later',
              'You can move them later from Brands.',
              { count: ungrouped }
            )}
          />
        )}
      </div>

      <div className="flex items-center gap-[8px] w-full max-w-[760px] mx-auto">
        <Button
          variant="ghost"
          disabled={saving}
          onClick={onBack}
          className="me-auto"
        >
          {t('back', 'Back')}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onNext}>
          {t('brands_onboard_skip', 'Skip')}
        </Button>
        <Button
          loading={saving}
          disabled={!name.trim() || !!lookup.busy}
          onClick={next}
        >
          {t('continue', 'Continue')}
        </Button>
      </div>
    </div>
  );
};
