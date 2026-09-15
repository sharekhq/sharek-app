import {
  TUTORIAL_VIDEO_IDS,
  tutorialVideoEmbedUrl,
} from '@gitroom/frontend/components/ui/tutorial.video';

const idOf = (url: string) => new URL(url).pathname.split('/').pop();

describe('tutorialVideoEmbedUrl', () => {
  it('plays the Arabic cut in Arabic', () => {
    expect(idOf(tutorialVideoEmbedUrl('ar'))).toBe(TUTORIAL_VIDEO_IDS.ar);
  });

  it('plays the English cut in English', () => {
    expect(idOf(tutorialVideoEmbedUrl('en'))).toBe(TUTORIAL_VIDEO_IDS.en);
  });

  // The tutorial exists in two languages and the selector offers eight, so
  // every language without a cut of its own has to land somewhere deliberate.
  it.each(['de', 'fr', 'es', 'it', 'pt', 'ru'])(
    'falls back to the English cut in %s',
    (language) => {
      expect(idOf(tutorialVideoEmbedUrl(language))).toBe(TUTORIAL_VIDEO_IDS.en);
    }
  );

  // i18next.resolvedLanguage is typed as possibly undefined, and both call
  // sites hand it straight over.
  it('falls back to the English cut when the language is unresolved', () => {
    expect(idOf(tutorialVideoEmbedUrl(undefined))).toBe(TUTORIAL_VIDEO_IDS.en);
  });

  // The regional forms the browser reports ('ar-SA', 'en-GB') are not the keys
  // i18next resolves to, but a cookie or a header can still carry one through.
  it('matches on the base language of a regional tag', () => {
    expect(idOf(tutorialVideoEmbedUrl('ar-SA'))).toBe(TUTORIAL_VIDEO_IDS.ar);
  });

  it('autoplays, because the frame only exists once the user asked for it', () => {
    expect(new URL(tutorialVideoEmbedUrl('en')).searchParams.get('autoplay')).toBe('1');
  });

  // A bare id would render a broken frame, and a full watch URL renders
  // YouTube's "refused to connect" page rather than a player.
  it('builds a youtube embed url', () => {
    const url = new URL(tutorialVideoEmbedUrl('ar'));
    expect(url.origin).toBe('https://www.youtube.com');
    expect(url.pathname.startsWith('/embed/')).toBe(true);
  });
});
