'use client';

import { Dispatch, FC, SetStateAction, useId, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  BRAND_COLOURS_MAX,
  BRAND_NAME_MAX,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useBrands } from '@gitroom/frontend/components/brands/use.brands';
import {
  MoveChannelsOffer,
  useCreateBrand,
} from '@gitroom/frontend/components/brands/brand.new';
import {
  TEXT_FIELD,
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
  const { websiteLookup } = useVariables();
  const { name, id: created } = draft;
  const { ungrouped, create } = useCreateBrand();
  const { data: brands, mutate: reloadBrands } = useBrands();
  const { mutate: reloadChannels } = useIntegrationList();
  // A new brand's kit has room for every colour and no font of its own; one
  // created already, come back to, has room for what its kit doesn't hold
  // yet, and its fonts are the ones a suggestion comes unticked beside.
  const kit = brands?.find((brand) => brand.id === created)?.kit;
  const lookup = useWebsiteLookup(
    BRAND_COLOURS_MAX - (kit?.colours.length ?? 0),
    kit
  );
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
            className={TEXT_FIELD}
          />
          {problem && (
            <p role="alert" className="text-[13px] leading-[1.5] text-error">
              {problem}
            </p>
          )}
        </div>
        {/* Without the server's web lookup (FIRECRAWL_API_KEY unset) the step
            asks for the name alone. */}
        {websiteLookup && (
          <WebsiteLookupFields
            lookup={lookup}
            label={t('brands_onboard_website', 'Your website')}
          />
        )}
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

      {/* The modal's own footer, as Connect Agents draws it, with Skip in
          Back's bordered style. */}
      <div className="flex items-center gap-[12px] pt-[8px] w-full max-w-[760px] mx-auto phone:flex-wrap">
        <button
          disabled={saving}
          onClick={onBack}
          className="group flex items-center justify-center gap-[8px] me-auto bg-transparent border-2 border-boxFocused font-medium px-[24px] phone:px-[18px] py-[12px] rounded-[12px] text-[15px] shrink-0 transition-all focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="rtl:rotate-180 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 transition-transform"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          {t('back', 'Back')}
        </button>
        <button
          disabled={saving}
          onClick={onNext}
          className="flex items-center justify-center bg-transparent border-2 border-boxFocused font-medium px-[24px] phone:px-[18px] py-[12px] rounded-[12px] text-[15px] shrink-0 transition-all focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none"
        >
          {t('brands_onboard_skip', 'Skip')}
        </button>
        <button
          disabled={!name.trim() || !!lookup.busy || saving}
          aria-busy={saving}
          onClick={next}
          className="group flex items-center justify-center gap-[12px] bg-brand hover:opacity-90 text-white font-semibold px-[32px] phone:px-[20px] py-[14px] rounded-[12px] text-[16px] phone:text-[15px] phone:flex-1 transition-all focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:pointer-events-none"
        >
          {t('continue', 'Continue')}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
