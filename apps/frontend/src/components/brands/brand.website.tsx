'use client';

import { CSSProperties, FC, ReactNode, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  BRAND_COLOURS_MAX,
  BRAND_FONT_MAX,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
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

// The kit's two font names, as the routes name them, the headings' first.
const FONTS = ['headingFont', 'bodyFont'] as const;
type Font = (typeof FONTS)[number];

// What POST /brands/website suggests for a site: its logo and, when that is
// big enough to be one, its icon; its colours; and the fonts its page names
// (spec 054's contracts/brands-website.md).
type Suggestions = {
  foundOn: string;
  logos: string[];
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

// A suggested font as the card holds it: which of the kit's two it is, its
// name as edited, and whether it goes in.
type FontChoice = { font: Font; name: string; ticked: boolean };

// Why there is nothing to offer: the lookup failed, it refuses to read this
// kind of site (its 403), it found nothing, the picked logo couldn't be saved
// (the save's 422), or the save failed otherwise.
type Problem = 'failed' | 'refused' | 'nothing' | 'logo' | 'error';

// A kit the lookup would fill: no logo (one deleted from Media still holds
// its place), no example and no colour. Fonts alone leave it empty, since the
// logo and colours the card is there for are still to come. While it is empty
// the kit starts with the full card; after that the lookup is a button beside
// Rename (FR-027).
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

// The app's focus ring standing off by a gap of the surface, where the
// control's own red would hide it (Add to kit) or read as it (the picked
// logo's border). Beside FOCUS_RING or the Button's own ring.
const RING_GAP =
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

// A logo's transparent parts read against this checkerboard (board Main,
// part 5), on the kit's logo tile and on each of the lookup's logo choices.
// A fixed grey, the same in both themes: on a board that followed the theme a
// white logo vanished on the light theme's and a dark one on the dark
// theme's, and both read against these two greys. Here, as TEXT_FIELD is,
// since the kit imports this module.
const CHECK = '#6C6C6C';
export const CHECKERBOARD: CSSProperties = {
  backgroundColor: '#8C8C8C',
  backgroundImage: `linear-gradient(45deg, ${CHECK} 25%, transparent 25%, transparent 75%, ${CHECK} 75%), linear-gradient(45deg, ${CHECK} 25%, transparent 25%, transparent 75%, ${CHECK} 75%)`,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
};

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
 * sends only the picked logo, the ticked colours and the ticked fonts to a
 * brand the caller names (onboarding's, once it has created it). One request
 * at a time. `room` is how many more colours that brand's kit takes: the
 * server keeps the kit's own first and drops what doesn't fit, so no more
 * than that are ticked. `kitFonts` is the font names that kit has now, each
 * of which a ticked font would replace: none for onboarding's new brand.
 */
export const useWebsiteLookup = (
  room: number,
  kitFonts?: Pick<Brand['kit'], Font>
) => {
  const fetch = useFetch();
  const { mutate: setBrands } = useBrands();
  const [address, setAddress] = useState('');
  // The address as typed now, which a lookup's answer is checked against
  // when it comes.
  const typedNow = useRef(address);
  const [busy, setBusy] = useState<'lookUp' | 'save'>();
  const [problem, setProblem] = useState<Problem>();
  const [found, setFound] = useState<Suggestions>();
  const [logo, setLogo] = useState<string>();
  const [ticked, setTicked] = useState<string[]>([]);
  const [fonts, setFonts] = useState<FontChoice[]>([]);

  // The colours that go in, in the order they were suggested.
  const colours = found?.colours.filter((code) => ticked.includes(code)) ?? [];
  // The fonts that go in.
  const keptFonts = fonts.filter((item) => item.ticked);

  // Back to the address alone, as typed.
  const reset = () => {
    setFound(undefined);
    setLogo(undefined);
    setTicked([]);
    setFonts([]);
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
  // https://. The first logo comes picked and every colour ticked. A font
  // comes ticked when the kit has none of its own and unticked when it has,
  // since adding it replaces the kit's; the name the kit has already isn't
  // offered. The two names are compared as they stand, case included: the
  // server cleans a suggestion's outer spaces and the kit stores a name
  // trimmed. With no logo, no colour and no font left to offer, nothing was
  // found: a site that gave only the names the kit has leaves nothing to add.
  // A site the lookup refuses to read (403) says so; any other refusal or no
  // answer says the site couldn't be read; one the fetch interceptor answered
  // (a redirect) says nothing more, and neither does an answer for an address
  // changed since it was asked.
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
        setProblem(response.status === 403 ? 'refused' : 'failed');
        return;
      }
      const offered: FontChoice[] = FONTS.flatMap((font) => {
        const name = answer[font];
        return name && name !== kitFonts?.[font]
          ? [{ font, name, ticked: !kitFonts?.[font] }]
          : [];
      });
      if (!answer.logos.length && !answer.colours.length && !offered.length) {
        setProblem('nothing');
        return;
      }
      setFound(answer);
      setLogo(answer.logos[0]);
      setTicked(answer.colours.slice(0, room));
      setFonts(offered);
    } catch (e) {
      if (asked() && !isAlreadyAnswered(e)) {
        setProblem('failed');
      }
    } finally {
      setBusy(undefined);
    }
  };

  // The other logo takes the picked one's place, and the picked logo clicked
  // again goes, so the colours and fonts can go in without one. Either way a
  // logo that couldn't be saved is no longer the one picked, so what the save
  // said goes.
  const pick = (link: string) => {
    if (busy) {
      return;
    }
    setProblem(undefined);
    setLogo(link === logo ? undefined : link);
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

  // A font's name as edited. Typing in one ticks it, and an emptied one loses
  // its tick, so a ticked font always has a name: an empty one sent would
  // clear the kit's.
  const renameFont = (font: Font, name: string) =>
    setFonts((list) =>
      list.map((item) =>
        item.font === font ? { ...item, name, ticked: !!name.trim() } : item
      )
    );

  // A font is ticked only while it has a name.
  const toggleFont = (font: Font) =>
    setFonts((list) =>
      list.map((item) =>
        item.font === font
          ? { ...item, ticked: !item.ticked && !!item.name.trim() }
          : item
      )
    );

  // The saved brand takes its place in GET /brands' list, as a kit change
  // does. A logo the server couldn't fetch (422) saves nothing. Each kept
  // font goes under the kit's name for it, trimmed as the kit stores one; a
  // font that isn't sent leaves the kit's as it is.
  const save = async (brandId: string) => {
    setProblem(undefined);
    setBusy('save');
    try {
      const response = await fetch(`/brands/${brandId}/kit/from-website`, {
        method: 'PUT',
        body: JSON.stringify({
          logo,
          colours,
          ...Object.fromEntries(
            keptFonts.map(({ font, name }) => [font, name.trim()] as const)
          ),
        }),
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
    fonts,
    kitFonts,
    // whether anything would go in
    kept: !!logo || !!colours.length || !!keptFonts.length,
    lookUp,
    pick,
    toggle,
    renameFont,
    toggleFont,
    save,
    reset,
  };
};

export type WebsiteLookup = ReturnType<typeof useWebsiteLookup>;

// The canvas's mark on what goes in: a white tick on the brand's red, on a
// logo's or a colour's corner (ON_CORNER) or before a font's label.
const Tick: FC<{ className: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={clsx(
      'flex items-center justify-center w-[20px] h-[20px] rounded-full bg-brand text-white',
      className
    )}
  >
    <CheckmarkIcon />
  </span>
);
const ON_CORNER = 'absolute -top-[7px] -end-[7px]';

// The small muted line under a part of what was found.
const NOTE = 'text-[12.5px] leading-[1.5] text-muted';

// A row of choices under its name, a group the name labels, and a note under
// it when there is one. The fonts' two fields stand further apart (`wide`)
// than the logos or the colours, by the found block's own gap.
const Choices: FC<{
  label: string;
  note?: string;
  wide?: boolean;
  className: string;
  children: ReactNode;
}> = ({ label, note, wide, className, children }) => {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={clsx('flex flex-col gap-[8px] min-w-0', className)}
    >
      <span id={id} className="text-[13px] font-[600] text-inkSoft">
        {label}
      </span>
      <div
        className={clsx('flex flex-wrap', wide ? 'gap-[14px]' : 'gap-[10px]')}
      >
        {children}
      </div>
      {note && <p className={NOTE}>{note}</p>}
    </div>
  );
};

/**
 * The lookup's address field and Look up, then what it found (board
 * BrandsWebsite and spec 054's mockup): "Found on" the address, the logos to
 * pick from, the site's colours each ticked to go in, across the card under
 * them its fonts, each a name to edit under its tick, and under those the
 * caller's own actions. A part the site didn't give says so under its
 * heading. A failed or refused lookup, one that found nothing and a failed
 * save say so last. The field's label is the caller's: the card's name, for
 * screen readers only, or onboarding's "Your website".
 */
export const WebsiteLookupFields: FC<{
  lookup: WebsiteLookup;
  label: string;
  hideLabel?: boolean;
  children?: ReactNode;
}> = ({ lookup, label, hideLabel, children }) => {
  const t = useT();
  const id = useId();
  const { address, busy, problem, found, logo, ticked, room, fonts, kitFonts } =
    lookup;

  const messages: Record<Problem, string> = {
    failed: t(
      'brands_website_failed',
      "Sharek couldn't read this site. Check the address, or try again later."
    ),
    refused: t(
      'brands_website_refused',
      "Sharek can't read this kind of site. Enter your own website's address, or upload your logo yourself."
    ),
    nothing: t(
      'brands_website_nothing_found',
      'Nothing was found at this address. Try another address, or upload your logo yourself.'
    ),
    logo: t(
      'brands_website_logo_failed',
      "This logo couldn't be saved, so nothing was added. Pick another logo or try again."
    ),
    error: t('error_occurred', 'An error occurred. Please try again.'),
  };

  const fontLabels: Record<Font, string> = {
    headingFont: t('brands_headings', 'Headings'),
    bodyFont: t('brands_body_text', 'Body text'),
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
            placeholder={t('brands_website_placeholder', 'yourbrand.com')}
            className={clsx(
              'flex-1 min-w-0 placeholder:text-muted',
              TEXT_FIELD
            )}
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
            {/* With no logo, the kit's own word for the part and a line that
                the site gave none, where the tiles would be. */}
            <Choices
              label={
                found.logos.length
                  ? t('brands_pick_a_logo', 'Pick a logo')
                  : t('brands_logo', 'Logo')
              }
              note={
                found.logos.length
                  ? undefined
                  : t(
                      'brands_website_no_logo',
                      'No logo was found on this site. You can upload your own.'
                    )
              }
              className="flex-[1_1_240px]"
            >
              {found.logos.map((link, index) => (
                <button
                  key={link}
                  type="button"
                  aria-pressed={link === logo}
                  disabled={!!busy}
                  onClick={() => lookup.pick(link)}
                  style={CHECKERBOARD}
                  className={clsx(
                    'relative flex items-center justify-center w-[76px] h-[76px] rounded-[10px] cursor-pointer disabled:cursor-default transition-colors',
                    link === logo
                      ? 'border-2 border-brand'
                      : 'border border-line hover:border-inkSoft',
                    FOCUS_RING,
                    RING_GAP
                  )}
                >
                  <SafeImage
                    src={link}
                    alt={t('brands_logo_n', 'Logo {{n}} of {{count}}', {
                      n: index + 1,
                      count: found.logos.length,
                    })}
                    className="max-w-[56px] max-h-[56px] object-contain"
                  />
                  {link === logo && <Tick className={ON_CORNER} />}
                </button>
              ))}
            </Choices>
            {/* How many fit, or that the site gave none. */}
            <Choices
              label={t('brands_colours', 'Colours')}
              note={
                room < found.colours.length
                  ? t(
                      'brands_website_colours_room',
                      'Your kit has room for {{count}} more colours.',
                      { count: room }
                    )
                  : found.colours.length
                  ? undefined
                  : t(
                      'brands_website_no_colours',
                      'No colours were found on this site.'
                    )
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
                  {ticked.includes(code) && <Tick className={ON_CORNER} />}
                </button>
              ))}
            </Choices>
            {/* Each font is a tick with its label, one checkbox, over its
                name in the kit's own font field, kept left to right, and
                under that the name the kit has now when it has one. With no
                font from the site, a line says so; a site whose fonts are
                the kit's already has none to offer and none missing, so the
                part isn't drawn. */}
            {(!!fonts.length || !FONTS.some((font) => found[font])) && (
              <Choices
                label={t('brands_fonts', 'Fonts')}
                note={
                  fonts.length
                    ? undefined
                    : t(
                        'brands_website_no_fonts',
                        'No fonts were found on this site.'
                      )
                }
                wide={true}
                className="w-full"
              >
                {fonts.map((item) => {
                  const now = kitFonts?.[item.font];
                  return (
                    <div
                      key={item.font}
                      className="flex-[1_1_220px] min-w-0 flex flex-col gap-[6px]"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.ticked}
                        disabled={!!busy || !item.name.trim()}
                        onClick={() => lookup.toggleFont(item.font)}
                        className={clsx(
                          'self-start flex items-center gap-[8px] coarse:min-h-[44px] rounded-[8px] text-[13px] text-ink cursor-pointer disabled:cursor-default',
                          FOCUS_RING
                        )}
                      >
                        {item.ticked ? (
                          <Tick className="flex-none" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex-none w-[20px] h-[20px] rounded-full border border-muted"
                          />
                        )}
                        {fontLabels[item.font]}
                      </button>
                      <input
                        dir="ltr"
                        type="text"
                        maxLength={BRAND_FONT_MAX}
                        aria-label={fontLabels[item.font]}
                        value={item.name}
                        onChange={(e) =>
                          lookup.renameFont(item.font, e.target.value)
                        }
                        className={TEXT_FIELD}
                      />
                      {now && (
                        <p className={NOTE}>
                          {t(
                            'brands_website_font_now',
                            'In your kit now: {{font}}',
                            {
                              font: isolate(now),
                              interpolation: { escapeValue: false },
                            }
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </Choices>
            )}
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
  const lookup = useWebsiteLookup(
    BRAND_COLOURS_MAX - brand.kit.colours.length,
    brand.kit
  );

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
          'Sharek reads your site and suggests a logo, colours and fonts. You choose what goes in.'
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
            className={RING_GAP}
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
// something in it. Wide enough for the logos beside their colours. The app's
// modal gives no dialog role, so the lookup's own content does, named by the
// modal's title; not aria-modal, which would hide that title and the modal's
// × from a screen reader, as they sit outside it.
export const useFillFromWebsite = () => {
  const t = useT();
  const modals = useModals();
  const titleId = useId();

  return (brand: Pick<Brand, 'id' | 'kit'>) =>
    modals.openModal({
      title: (
        <span id={titleId}>
          {t('brands_fill_from_website', 'Fill from my website')}
        </span>
      ),
      size: 600,
      children: (close) => (
        <div role="dialog" aria-labelledby={titleId}>
          <BrandWebsite brand={brand} onClose={close} />
        </div>
      ),
    });
};
