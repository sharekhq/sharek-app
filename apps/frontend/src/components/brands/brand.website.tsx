'use client';

import { FC, ReactNode, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { BRAND_COLOURS_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import {
  CheckmarkIcon,
  IconProps,
} from '@gitroom/frontend/components/ui/icons';
import {
  Brand,
  useBrands,
  withSavedBrand,
} from '@gitroom/frontend/components/brands/use.brands';

// What POST /brands/website suggests for a site: the logos, best first, and
// the colours of the one picked (contracts/brands-api.md, part 3). No fonts
// (research R15).
type Suggestions = { foundOn: string; logos: string[]; colours: string[] };

// Why there is nothing to offer: the lookup failed, it found nothing, the
// picked logo couldn't be saved (the save's 422), or the save failed
// otherwise.
type Problem = 'failed' | 'nothing' | 'logo' | 'error';

// A kit the lookup would fill: no logo (one deleted from Media still holds
// its place), no example and no colour. Fonts alone leave it empty, as the
// lookup never suggests them. While it is empty the kit starts with the full
// card; after that the lookup is a button beside Rename (FR-027).
export const kitIsEmpty = ({ kit }: Brand) =>
  !kit.logo && !kit.examples.length && !kit.colours.length;

// The boards' text field, as the lookup's address draws it: onboarding's
// brand name, the colour popover's hex code and the kit's font names too,
// 44px at every pointer as the canvas draws it (.inp.lg). Here rather than
// beside brand.kit.tsx's SMALL_BUTTON, since the kit imports this module and
// onboarding would pull the kit's Media library in with it.
export const TEXT_FIELD = clsx(
  'h-[44px] px-[10px] rounded-[8px] border border-line bg-surface text-ink text-[14px] coarse:text-[16px] outline-none',
  FOCUS_RING
);

// The canvas's globe, on the card's heading and the button beside Rename.
// Decoration: the words are beside it.
export const WebsiteIcon: FC<IconProps> = ({
  size = 20,
  className,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

/**
 * Fill from my website's lookup (FR-028, FR-029), for a brand's page and
 * onboarding's "Your brand" step: the address, what Look up suggests, what
 * the user keeps of it, and the save. Nothing is saved before `save`, which
 * sends only the picked logo and the ticked colours to a brand the caller
 * names (onboarding's, once it has created it). One request at a time.
 * `room` is how many more colours that brand's kit takes: the server keeps
 * the kit's own first and drops what doesn't fit, so no more than that are
 * ticked.
 */
export const useWebsiteLookup = (room: number) => {
  const fetch = useFetch();
  const { mutate: setBrands } = useBrands();
  const [address, setAddress] = useState('');
  // The address as typed now, which a lookup's answer is checked against
  // when it comes.
  const typedNow = useRef(address);
  const [busy, setBusy] = useState<'lookUp' | 'colours' | 'save'>();
  const [problem, setProblem] = useState<Problem>();
  const [found, setFound] = useState<Suggestions>();
  const [logo, setLogo] = useState<string>();
  const [ticked, setTicked] = useState<string[]>([]);

  // The colours that go in, in the order they were suggested.
  const colours = found?.colours.filter((code) => ticked.includes(code)) ?? [];

  // Back to the address alone, as typed.
  const reset = () => {
    setFound(undefined);
    setLogo(undefined);
    setTicked([]);
    setProblem(undefined);
  };

  // What was found belongs to the address it was found on: another address
  // drops it, and what the last lookup or save said, so one site's
  // suggestions never go into the kit for another.
  const changeAddress = (value: string) => {
    typedNow.current = value;
    setAddress(value);
    reset();
  };

  // The address goes as typed, trimmed: the server looks a bare domain up on
  // https://. The first logo comes picked and every colour ticked. A refusal or no answer says the site couldn't be
  // read; one the fetch interceptor answered (a redirect) says nothing more,
  // and neither does an answer for an address changed since it was asked.
  const lookUp = async () => {
    const typed = address.trim();
    if (!typed || busy) {
      return;
    }
    const asked = () => typedNow.current === address;
    reset();
    setBusy('lookUp');
    try {
      const response = await fetch('/brands/website', {
        method: 'POST',
        body: JSON.stringify({ url: typed }),
      });
      const answer: Suggestions | undefined = response.ok
        ? await response.json()
        : undefined;
      if (!asked()) {
        return;
      }
      if (!answer) {
        setProblem('failed');
        return;
      }
      if (!answer.logos.length && !answer.colours.length) {
        setProblem('nothing');
        return;
      }
      setFound(answer);
      setLogo(answer.logos[0]);
      setTicked(answer.colours.slice(0, room));
    } catch (e) {
      if (asked() && !isAlreadyAnswered(e)) {
        setProblem('failed');
      }
    } finally {
      setBusy(undefined);
    }
  };

  // Another logo brings its own colours, ticked as far as the room goes; a
  // logo whose colours
  // can't be read offers none. The picked logo clicked again goes, and the
  // colours can go in alone. Either way a logo that couldn't be saved is no
  // longer the one picked, so what the save said goes.
  const pick = async (link: string) => {
    if (busy) {
      return;
    }
    setProblem(undefined);
    if (link === logo) {
      setLogo(undefined);
      return;
    }
    setLogo(link);
    setBusy('colours');
    let next: string[] = [];
    try {
      const response = await fetch('/brands/website/colours', {
        method: 'POST',
        body: JSON.stringify({ logo: link }),
      });
      if (response.ok) {
        next = (await response.json()).colours;
      }
    } catch {
      // none to offer
    } finally {
      setBusy(undefined);
    }
    setFound((current) => current && { ...current, colours: next });
    setTicked(next.slice(0, room));
  };

  // A colour is ticked only while the kit has room for it.
  const toggle = (code: string) =>
    setTicked((list) =>
      list.includes(code)
        ? list.filter((item) => item !== code)
        : list.length < room
        ? [...list, code]
        : list
    );

  // The saved brand takes its place in GET /brands' list, as a kit change
  // does. A logo the server couldn't fetch (422) saves nothing.
  const save = async (brandId: string) => {
    setProblem(undefined);
    setBusy('save');
    try {
      const response = await fetch(`/brands/${brandId}/kit/from-website`, {
        method: 'PUT',
        body: JSON.stringify({ logo, colours }),
      });
      if (response.ok) {
        const saved: Brand = await response.json();
        setBrands(withSavedBrand(saved), false);
        return saved;
      }
      setProblem(response.status === 422 ? 'logo' : 'error');
    } catch (e) {
      if (!isAlreadyAnswered(e)) {
        setProblem('error');
      }
    } finally {
      setBusy(undefined);
    }
    return undefined;
  };

  return {
    address,
    setAddress: changeAddress,
    busy,
    problem,
    found,
    logo,
    ticked,
    room,
    // whether anything would go in
    kept: !!logo || !!colours.length,
    lookUp,
    pick,
    toggle,
    save,
    reset,
  };
};

export type WebsiteLookup = ReturnType<typeof useWebsiteLookup>;

// The canvas's mark on what goes in: a white tick on the brand's red, on the
// choice's corner.
const Tick: FC = () => (
  <span
    aria-hidden="true"
    className="absolute -top-[7px] -end-[7px] flex items-center justify-center w-[20px] h-[20px] rounded-full bg-brand text-white"
  >
    <CheckmarkIcon />
  </span>
);

// A row of choices under its name, a group the name labels, and a note under
// it when there is one.
const Choices: FC<{
  label: string;
  busy?: boolean;
  note?: string;
  className: string;
  children: ReactNode;
}> = ({ label, busy, note, className, children }) => {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      aria-busy={busy}
      className={clsx('flex flex-col gap-[8px] min-w-0', className)}
    >
      <span id={id} className="text-[13px] font-[600] text-inkSoft">
        {label}
      </span>
      <div className="flex flex-wrap gap-[10px]">{children}</div>
      {note && <p className="text-[12.5px] leading-[1.5] text-muted">{note}</p>}
    </div>
  );
};

/**
 * The lookup's address field and Look up, then what it found (board
 * BrandsWebsite): "Found on" the address, the logos to pick from, the picked
 * one's colours each ticked to go in, and under them the caller's own actions.
 * A failed lookup, one that found nothing and a failed save say so last. The
 * field's label is the caller's: the card's name, for screen readers only, or
 * onboarding's "Your website".
 */
export const WebsiteLookupFields: FC<{
  lookup: WebsiteLookup;
  label: string;
  hideLabel?: boolean;
  children?: ReactNode;
}> = ({ lookup, label, hideLabel, children }) => {
  const t = useT();
  const id = useId();
  const { address, busy, problem, found, logo, ticked, room } = lookup;

  const messages: Record<Problem, string> = {
    failed: t(
      'brands_website_failed',
      "Sharek couldn't read this site. Check the address, or try again later."
    ),
    nothing: t(
      'brands_website_nothing_found',
      'Nothing was found on this site. Try another address.'
    ),
    logo: t(
      'brands_website_logo_failed',
      "This logo couldn't be saved, so nothing was added. Pick another logo or try again."
    ),
    error: t('error_occurred', 'An error occurred. Please try again.'),
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup.lookUp();
        }}
        className="flex flex-col gap-[6px]"
      >
        <label
          htmlFor={id}
          className={
            hideLabel ? 'sr-only' : 'text-[13px] font-[600] text-inkSoft'
          }
        >
          {label}
        </label>
        <div className="flex items-center gap-[8px]">
          <input
            id={id}
            dir="ltr"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={address}
            onChange={(e) => lookup.setAddress(e.target.value)}
            className={clsx('flex-1 min-w-0', TEXT_FIELD)}
          />
          <Button
            type="submit"
            variant="quiet"
            loading={busy === 'lookUp'}
            aria-busy={busy === 'lookUp'}
            disabled={!address.trim() || !!busy}
            className="flex-none"
          >
            {t('brands_look_up', 'Look up')}
          </Button>
        </div>
      </form>
      {found && (
        <div className="flex flex-col gap-[14px] pt-[14px] border-t border-line">
          <p className="flex items-center gap-[8px] text-[13px] text-inkSoft">
            <span
              aria-hidden="true"
              className="flex-none w-[8px] h-[8px] rounded-full bg-success"
            />
            {t('brands_found_on', 'Found on {{address}}', {
              address: isolate(found.foundOn),
              interpolation: { escapeValue: false },
            })}
          </p>
          <div className="flex flex-wrap gap-[16px]">
            {!!found.logos.length && (
              <Choices
                label={t('brands_pick_a_logo', 'Pick a logo')}
                className="flex-[1_1_240px]"
              >
                {found.logos.map((link) => (
                  <button
                    key={link}
                    type="button"
                    aria-pressed={link === logo}
                    disabled={!!busy}
                    onClick={() => lookup.pick(link)}
                    className={clsx(
                      'relative flex items-center justify-center w-[76px] h-[76px] rounded-[10px] bg-surface cursor-pointer disabled:cursor-default transition-colors',
                      link === logo
                        ? 'border-2 border-brand'
                        : 'border border-line hover:border-inkSoft',
                      FOCUS_RING
                    )}
                  >
                    <SafeImage
                      src={link}
                      alt={t('brands_logo', 'Logo')}
                      className="max-w-[56px] max-h-[56px] object-contain"
                    />
                    {link === logo && <Tick />}
                  </button>
                ))}
              </Choices>
            )}
            <Choices
              label={t('brands_colours', 'Colours')}
              busy={busy === 'colours'}
              note={
                room < found.colours.length
                  ? t(
                      'brands_website_colours_room',
                      'Your kit has room for {{count}} more colours.',
                      { count: room }
                    )
                  : undefined
              }
              className="flex-[1_1_200px]"
            >
              {found.colours.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="checkbox"
                  aria-checked={ticked.includes(code)}
                  aria-label={code}
                  title={code}
                  disabled={
                    !!busy || (!ticked.includes(code) && ticked.length >= room)
                  }
                  onClick={() => lookup.toggle(code)}
                  className={clsx(
                    'relative flex w-[44px] h-[44px] rounded-[10px] cursor-pointer disabled:cursor-default',
                    FOCUS_RING
                  )}
                >
                  <span
                    className={clsx(
                      'w-full h-full rounded-[10px] ring-1 ring-inset ring-line transition-opacity',
                      !ticked.includes(code) && 'opacity-40'
                    )}
                    style={{ backgroundColor: code }}
                  />
                  {ticked.includes(code) && <Tick />}
                </button>
              ))}
            </Choices>
          </div>
          {children}
        </div>
      )}
      {problem && (
        <p role="alert" className="text-[13px] leading-[1.5] text-error">
          {messages[problem]}
        </p>
      )}
    </div>
  );
};

// Fill from my website for a brand: the help line, the lookup, and under its
// suggestions Add to kit, Not now and the line that nothing is saved before.
// As a dialog, each closes it; as the kit's card, Not now goes back to the
// address, and once something is added the kit drops the card (kitIsEmpty).
const BrandWebsite: FC<{
  brand: Pick<Brand, 'id' | 'kit'>;
  onClose?: () => void;
}> = ({ brand, onClose }) => {
  const t = useT();
  const lookup = useWebsiteLookup(BRAND_COLOURS_MAX - brand.kit.colours.length);

  const add = async () => {
    if (await lookup.save(brand.id)) {
      lookup.reset();
      onClose?.();
    }
  };

  const notNow = () => {
    lookup.reset();
    onClose?.();
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="text-[13px] leading-[1.5] text-muted">
        {t(
          'brands_fill_from_website_help',
          'Sharek reads your site and suggests a logo and colours. You choose what goes in.'
        )}
      </p>
      <WebsiteLookupFields
        lookup={lookup}
        label={t('brands_fill_from_website', 'Fill from my website')}
        hideLabel={true}
      >
        <div className="flex flex-wrap items-center gap-[8px]">
          <Button
            loading={lookup.busy === 'save'}
            disabled={!lookup.kept || !!lookup.busy}
            onClick={add}
          >
            {t('brands_add_to_kit', 'Add to kit')}
          </Button>
          <Button
            variant="ghost"
            disabled={lookup.busy === 'save'}
            onClick={notNow}
          >
            {t('brands_not_now', 'Not now')}
          </Button>
          <span className="ms-[6px] text-[12.5px] leading-[1.5] text-muted">
            {t('brands_nothing_saved', 'Nothing is saved until you add it.')}
          </span>
        </div>
      </WebsiteLookupFields>
    </div>
  );
};

// The full card at the top of a kit while it is empty (board BrandsWebsite).
export const BrandWebsiteCard: FC<{ brand: Pick<Brand, 'id' | 'kit'> }> = ({
  brand,
}) => {
  const t = useT();
  return (
    <section className="flex flex-col gap-[12px] min-w-0 p-[16px] rounded-[12px] border border-line bg-surface">
      <div className="flex items-center gap-[8px]">
        <WebsiteIcon size={18} className="flex-none text-muted" />
        <h3 className="text-[15px] font-[600] text-ink">
          {t('brands_fill_from_website', 'Fill from my website')}
        </h3>
      </div>
      <BrandWebsite brand={brand} />
    </section>
  );
};

// The same lookup in a dialog, from the button beside Rename once the kit has
// something in it. Wide enough for the logos beside their colours.
export const useFillFromWebsite = () => {
  const t = useT();
  const modals = useModals();

  return (brand: Pick<Brand, 'id' | 'kit'>) =>
    modals.openModal({
      title: t('brands_fill_from_website', 'Fill from my website'),
      size: 600,
      children: (close) => <BrandWebsite brand={brand} onClose={close} />,
    });
};
