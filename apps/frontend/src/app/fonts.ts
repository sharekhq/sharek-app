import {
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  IBM_Plex_Mono,
} from 'next/font/google';

// Sharek brand typeface: a single IBM Plex superfamily across Latin + Arabic,
// plus Plex Mono for tabular data UI. Loaded as CSS variables so the sans stack
// can fall back from Latin (Plex Sans) to Arabic (Plex Sans Arabic) per glyph.
export const ibmPlexSans = IBM_Plex_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
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
