const { join } = require('path');
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}', '../../libraries/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Brand vocabulary (preferred) — specs/001-brand-colors/contracts/brand-token-api.md
        brand: 'var(--brand)',
        brandText: 'var(--brand-text)',
        ink: 'var(--ink)',
        inkSoft: 'var(--ink-soft)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        muted: 'var(--muted)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
        // v3 supporting tier (2026-07-18) — panel plane, quiet controls, AI accent, categorical slots
        brandSoft: 'var(--brand-soft)',
        brandSoft2: 'var(--brand-soft-2)',
        panel: 'var(--panel)',
        quiet: 'var(--quiet)',
        aiAccent: 'var(--ai-accent)',
        aiSoft: 'var(--ai-soft)',
        catPomegranate: 'var(--cat-pomegranate)',
        catSaffron: 'var(--cat-saffron)',
        catFayrouz: 'var(--cat-fayrouz)',
        catPalm: 'var(--cat-palm)',
        catLapis: 'var(--cat-lapis)',
        catClay: 'var(--cat-clay)',
        catClayText: 'var(--cat-clay-text)',
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        textColor: 'var(--new-btn-text)',
        third: 'var(--color-third)',
        forth: 'var(--color-forth)',
        fifth: 'var(--color-fifth)',
        sixth: 'var(--color-sixth)',
        seventh: 'var(--color-seventh)',
        gray: 'var(--color-gray)',
        input: 'var(--color-input)',
        inputText: 'var(--color-input-text)',
        tableBorder: 'var(--color-table-border)',
        customColor16: 'var(--color-custom16)',

        newBgColor: 'var(--new-bgColor)',
        newBackdrop: 'var(--new-back-drop)',
        newSep: 'var(--new-sep)',
        newBorder: 'var(--new-border)',
        newBgColorInner: 'var(--new-bgColorInner)',
        newBgLineColor: 'var(--new-bgLineColor)',
        textItemFocused: 'var(--new-textItemFocused)',
        textItemBlur: 'var(--new-textItemBlur)',
        boxFocused: 'var(--new-boxFocused)',
        newTextColor: 'rgb(var(--new-textColor) / <alpha-value>)',
        blockSeparator: 'var(--new-blockSeparator)',
        btnSimple: 'var(--new-btn-simple)',
        btnText: 'var(--new-btn-text)',
        btnPrimary: 'var(--new-btn-primary)',
        ai: 'var(--new-ai-btn)',
        boxHover: 'var(--new-box-hover)',
        newTableBorder: 'var(--new-table-border)',
        newTableHeader: 'var(--new-table-header)',
        newTableText: 'var(--new-table-text)',
        newTableTextFocused: 'var(--new-table-text-focused)',
        newColColor: 'var(--new-col-color)',
        newSettings: 'var(--new-settings)',
        menuDots: 'var(--new-menu-dots)',
        menuDotsHover: 'var(--new-menu-hover)',
        bigStrip: 'var(--new-big-strips)',
        popup: 'var(--popup-color)',
        bgLinkedin: 'var(--linkedin-bg)',
        bgFacebook: 'var(--facebook-bg)',
        bgInstagram: 'var(--instagram-bg)',
        bgTiktokItem: 'var(--tiktok-item-bg)',
        bgTiktokItemIcon: 'var(--tiktok-item-icon-bg)',
        bgYoutube: 'var(--youtube-bg)',
        bgCommentFacebook: 'var(--facebook-bg-comment)',
        textLinkedin: 'var(--linkedin-text)',
        borderPreview: 'var(--border-preview)',
        borderLinkedin: 'var(--linkedin-border)',
        youtubeButton: 'var(--youtube-button)',
        youtubeBgAction: 'var(--youtube-action-color)',
        youtubeSvg: 'var(--youtube-svg-border)',
      },
      gridTemplateColumns: {
        13: 'repeat(13, minmax(0, 1fr));',
      },
      backgroundImage: {
        loginBox: 'url(/auth/login-box.png)',
        loginBg: 'url(/auth/bg-login.png)',
      },
      fontFamily: {
        // Reference the real "IBM Plex Sans" family by name rather than
        // var(--font-sans). next/font expands var(--font-sans) to
        // `"IBM Plex Sans", "IBM Plex Sans Fallback"`, where the Fallback face is
        // an unrestricted local("Arial"). Placed before var(--font-arabic), that
        // Arial face greedily paints every Arabic glyph (Arial covers Arabic),
        // so Arabic rendered as system Arial and the brand IBM Plex Sans Arabic
        // was never reached. adjustFontFallback:false would drop that face, but
        // Next 16's Turbopack build does not honor it — so we keep the Arial
        // face out of the cascade by naming the real Latin family directly.
        // Latin still gets Plex Sans; Arabic glyphs (outside Plex Sans's Latin
        // unicode-range) fall through to var(--font-arabic) = IBM Plex Sans Arabic.
        sans: ['"IBM Plex Sans"', 'var(--font-arabic)', 'Helvetica Neue', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-sans)', 'Helvetica Neue', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        fade: 'fadeOut 0.5s ease-in-out',
        normalFadeIn: 'normalFadeIn 0.5s ease-in-out',
        fadeIn: 'normalFadeIn 0.2s ease-in-out forwards',
        normalFadeOut: 'normalFadeOut 0.5s linear 5s forwards',
        overflow: 'overFlow 0.5s ease-in-out forwards',
        overflowReverse: 'overFlowReverse 0.5s ease-in-out forwards',
        fadeDown: 'fadeDown 4s ease-in-out forwards',
        normalFadeDown: 'normalFadeDown 0.5s ease-in-out forwards',
        newMessages: 'newMessages 1s ease-in-out 4s forwards',
        marqueeUp: 'marquee-up 100s linear infinite',
        marqueeDown: 'marquee-down 100s linear infinite',
      },
      boxShadow: {
        yellow: '0 0 60px 20px rgba(0, 0, 0, 0.12)',
        yellowToast: '0px 0px 50px rgba(0, 0, 0, 0.18)',
        greenToast: '0px 0px 50px rgba(0, 0, 0, 0.18)',
        menu: 'var(--menu-shadow)',
        previewShadow: 'var(--preview-box-shadow)',
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)',
      },
      dropShadow: {
        glow: [
          '0 0 6px rgba(0,0,0,0.25)',
          '0 0 12px rgba(0,0,0,0.15)',
          '0 0 24px rgba(0,0,0,0.08)',
        ],
      },
      // that is actual animation
      keyframes: (theme) => ({
        fadeOut: {
          '0%': {
            opacity: 0,
            transform: 'translateY(30px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
        normalFadeOut: {
          '0%': {
            opacity: 1,
          },
          '100%': {
            opacity: 0,
          },
        },
        normalFadeIn: {
          '0%': {
            opacity: 0,
          },
          '100%': {
            opacity: 1,
          },
        },
        overFlow: {
          '0%': {
            overflow: 'hidden',
          },
          '99%': {
            overflow: 'hidden',
          },
          '100%': {
            overflow: 'visible',
          },
        },
        overFlowReverse: {
          '0%': {
            overflow: 'visible',
          },
          '99%': {
            overflow: 'visible',
          },
          '100%': {
            overflow: 'hidden',
          },
        },
        fadeDown: {
          '0%': {
            opacity: 0,
            marginTop: -30,
          },
          '10%': {
            opacity: 1,
            marginTop: 0,
          },
          '85%': {
            opacity: 1,
            marginTop: 0,
          },
          '90%': {
            opacity: 1,
            marginTop: 10,
          },
          '100%': {
            opacity: 0,
            marginTop: -30,
          },
        },
        normalFadeDown: {
          '0%': {
            opacity: 0,
            transform: 'translateY(-30px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
        newMessages: {
          '0%': {
            backgroundColor: 'var(--color-seventh)',
            fontWeight: 'bold',
          },
          '99%': {
            backgroundColor: 'var(--color-third)',
            fontWeight: 'bold',
          },
          '100%': {
            backgroundColor: 'var(--color-third)',
            fontWeight: 'normal',
          },
        },
      }),
      screens: {
        mobile: {
          raw: '(max-width: 1025px)',
        },
        phone: {
          raw: '(max-width: 768px)',
        },
        tablet: {
          raw: '(max-width: 1300px)',
        },
        iconBreak: {
          raw: '(max-width: 1560px)',
        },
        maxMedia: {
          raw: '(max-width: 1400px)',
        },
        minCustom: {
          raw: '(min-height: 800px)',
        },
        custom: {
          raw: '(max-height: 800px)',
        },
        xs: {
          max: '401px',
        },
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
    require('tailwindcss-rtl'),
    function ({ addVariant }) {
      addVariant('child', '& > *');
      addVariant('child-hover', '& > *:hover');
    },
  ],
};
