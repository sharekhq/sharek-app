import {
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  IBM_Plex_Mono,
} from 'next/font/google';

// Sharek brand typeface: a single IBM Plex superfamily across Latin + Arabic,
// plus Plex Mono for tabular data UI. Loaded as CSS variables so the sans stack
// can fall back from Latin (Plex Sans) to Arabic (Plex Sans Arabic) per glyph.
//
// adjustFontFallback MUST stay false here. When true, next/font injects an
// unrestricted `local("Arial")` face ("IBM Plex Sans Fallback") with no
// unicode-range. Because the Tailwind `sans` stack puts --font-sans before
// --font-arabic, and Arial covers Arabic, that face greedily paints every
// Arabic glyph — so Arabic renders as system Arial and --font-arabic (the real
// IBM Plex Sans Arabic) is never reached. Disabling it lets Arabic fall through
// to the brand font. Trade-off: Latin loses its metric-matched swap fallback
// (minor CLS on first paint) — acceptable in an Arabic-first product.
export const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  adjustFontFallback: false,
});

export const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500', '600', '700'],
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontVariables = `${ibmPlexSans.variable} ${ibmPlexSansArabic.variable} ${ibmPlexMono.variable}`;
