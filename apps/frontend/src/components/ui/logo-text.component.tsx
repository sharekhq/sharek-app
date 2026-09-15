import React from 'react';
import { FC } from 'react';
import { LogoMark } from '@gitroom/frontend/components/ui/logo-mark';

/**
 * The brand lockup, in both scripts.
 *
 * Both render and `global.scss` picks one off the document's `lang`. Two of the
 * three call sites — `auth/layout.tsx` and the public preview page — are async
 * server components, so reading `i18next.resolvedLanguage` here would be a
 * hydration mismatch; the document already carries the language the server
 * resolved. It also means one edit covers the paywall, the sign-in pages and the
 * preview page at once.
 *
 * At phone width the wordmark goes and the badge stands alone, which
 * `DESIGN.md:401` sanctions for tight functional spaces — a 137px wordmark on a
 * 390px screen is that case, and the badge carries no wordmark, so the phone
 * form is script-neutral apart from the name it is announced by.
 *
 * Geometry is `DESIGN.md` §Logo on the 48-unit grid: badge 40 tall at y 4, gap 13
 * to the wordmark. The Arabic lockup mirrors the composition rather than reusing
 * the Latin one — badge on the right, wordmark flowing left of it
 * (`DESIGN.md:400`) — and both paint through `--badge-tile` / `--badge-s` /
 * `--ink`, which is what inverts the badge on dark without reintroducing the
 * retired rose mark (`DESIGN.md:391`).
 */
const Badge: FC<{ className: string; label: string }> = ({
  className,
  label,
}) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    width="40"
    height="40"
    viewBox="0 0 512 512"
    fill="none"
    role="img"
    aria-label={label}
  >
    <LogoMark />
  </svg>
);

export const LogoTextComponent = () => {
  return (
    <>
      <svg
        className="logo-lockup-latin phone:hidden"
        xmlns="http://www.w3.org/2000/svg"
        width="137.33"
        height="40"
        viewBox="0 0 164.8 48"
        fill="none"
        role="img"
        aria-label="Sharek"
      >
        <g transform="translate(0 4) scale(0.078125)">
          <LogoMark />
        </g>
        <g
          transform="translate(53 34.9) scale(0.03 -0.03)"
          style={{ fill: 'var(--ink)' }}
        >
          <path d="M303 -12Q212 -12 147.5 20Q83 52 38 101L138 202Q173 162 217.5 142Q262 122 313 122Q369 122 396 145Q423 168 423 206Q423 225 416.5 240.5Q410 256 392.5 266.5Q375 277 342 281L273 290Q200 300 152.5 326.5Q105 353 82 396.5Q59 440 59 498Q59 561 90.5 608.5Q122 656 180.5 683Q239 710 321 710Q400 710 460 684.5Q520 659 563 612L462 510Q437 539 401.5 557.5Q366 576 312 576Q261 576 236 558Q211 540 211 508Q211 484 219.5 469Q228 454 246.5 446Q265 438 294 433L363 422Q435 411 482 385Q529 359 552 317Q575 275 575 215Q575 148 543.5 97Q512 46 451 17Q390 -12 303 -12Z" transform="translate(0.0 0)" />
          <path d="M69 0L69 740L217 740L217 436L223 436Q237 477 272 507Q307 537 369 537Q449 537 491 482.5Q533 428 533 329L533 0L385 0L385 317Q385 367 369 392Q353 417 312 417Q288 417 266.5 408.5Q245 400 231 383Q217 366 217 340L217 0Z" transform="translate(624.0 0)" />
          <path d="M539 0L457 0Q430 0 406.5 13.5Q383 27 369 53.5Q355 80 355 117L355 130L387 92L351 92Q339 41 298 14.5Q257 -12 197 -12Q118 -12 76 30.5Q34 73 34 141Q34 197 61.5 233Q89 269 139.5 287Q190 305 259 305L342 305L342 338Q342 376 322 398.5Q302 421 255 421Q211 421 185 402Q159 383 142 359L54 437Q86 484 135 510.5Q184 537 266 537Q377 537 433.5 487.5Q490 438 490 345L490 115L539 115ZM342 221L270 221Q227 221 205 206Q183 191 183 162L183 147Q183 119 201 105Q219 91 252 91Q277 91 297 98Q317 105 329.5 120Q342 135 342 159Z" transform="translate(1220.0 0)" />
          <path d="M217 0L69 0L69 525L217 525L217 411L222 411Q228 440 244 466Q260 492 287.5 508.5Q315 525 356 525L382 525L382 387L345 387Q302 387 273.5 379.5Q245 372 231 355Q217 338 217 307Z" transform="translate(1789.0 0)" />
          <path d="M288 -12Q208 -12 151.5 21.5Q95 55 65.5 117Q36 179 36 263Q36 346 64.5 407.5Q93 469 148 503Q203 537 282 537Q369 537 422.5 499.5Q476 462 501 401Q526 340 526 269L526 225L189 225L189 217Q189 165 217.5 134.5Q246 104 305 104Q352 104 380.5 123Q409 142 434 167L508 75Q473 35 416.5 11.5Q360 -12 288 -12ZM285 428Q255 428 233.5 414.5Q212 401 200.5 377Q189 353 189 320L189 312L373 312L373 321Q373 353 363.5 377Q354 401 334.5 414.5Q315 428 285 428Z" transform="translate(2188.0 0)" />
          <path d="M69 0L69 740L217 740L217 415L217 303L223 303L288 400L393 525L557 525L382 324L577 0L401 0L283 222L217 148L217 0Z" transform="translate(2750.0 0)" />
        </g>
      </svg>
      <svg
        className="logo-lockup-arabic phone:hidden"
        xmlns="http://www.w3.org/2000/svg"
        width="114.67"
        height="40"
        viewBox="0 0 137.6 48"
        fill="none"
        role="img"
        aria-label="شارك"
      >
        <g transform="translate(97.6 4) scale(0.078125)">
          <LogoMark />
        </g>
        <g
          transform="translate(13 32.5) scale(0.034 -0.034)"
          style={{ fill: 'var(--ink)' }}
        >
          <path d="M40 150L556 150Q616 150 616 210L616 741L736 741L736 210Q736 102 692.5 51Q649 0 556 0L40 0ZM254 311L411 385L409 392L329 392Q254 392 254 462Q254 497 277 519Q300 541 343 566L409 604L445 544L322 475L324 467L402 467Q479 467 479 405Q479 369 458.5 346Q438 323 396 302L287 247Z" transform="translate(0.0 0)" />
          <path d="M-60 -90L-20 -90Q71 -90 113.5 -53Q156 -16 155 70Q155 93 152 118.5Q149 144 144 173L123 306L232 323L247 230Q255 182 259.5 141.5Q264 101 264 75Q264 3 246 -55Q228 -113 192 -154.5Q156 -196 103 -218Q50 -240 -19 -240L-60 -240Z" transform="translate(796.0 0)" />
          <path d="M259 0Q158 0 109 48Q60 96 60 204L60 740L180 740L180 224Q180 179 198 164.5Q216 150 260 150L290 150L290 30L260 0Z" transform="translate(1095.0 0)" />
          <path d="M-30 120L0 150L1 150Q49 150 72.5 161.5Q96 173 110 202L149 283L248 235L213 162Q237 151 262 143.5Q287 136 313 136Q356 136 375 154.5Q394 173 394 220L394 283L504 283L504 220Q504 178 518.5 159Q533 140 558 140L568 140Q589 140 602 155.5Q615 171 615 205Q615 219 612 240.5Q609 262 604 293L595 344L704 362L712 311Q717 282 719 256.5Q721 231 721 205Q721 93 682.5 40.5Q644 -12 563 -12Q492 -12 456 22Q420 56 407 127L401 127Q393 55 365.5 21.5Q338 -12 293 -12Q264 -12 235.5 -1.5Q207 9 161 36L140 48Q109 18 69.5 9Q30 0 -30 0ZM518 363Q492 363 475.5 379Q459 395 459 430Q459 465 475.5 481Q492 497 518 497L538 497Q564 497 580.5 481Q597 465 597 430Q597 395 580.5 379Q564 363 538 363ZM360 363Q334 363 317.5 379Q301 395 301 430Q301 465 317.5 481Q334 497 360 497L380 497Q406 497 422.5 481Q439 465 439 430Q439 395 422.5 379Q406 363 380 363ZM439 509Q413 509 396.5 525Q380 541 380 576Q380 611 396.5 627Q413 643 439 643L459 643Q485 643 501.5 627Q518 611 518 576Q518 541 501.5 525Q485 509 459 509Z" transform="translate(1385.0 0)" />
        </g>
      </svg>
      <Badge className="logo-badge-latin hidden phone:block" label="Sharek" />
      <Badge
        className="logo-badge-arabic hidden phone:block"
        label="شارك"
      />
    </>
  );
};
