import { ShortLinkService } from './short.link.service';
import { ShortLinking } from './short-linking.interface';

describe('ShortLinkService', () => {
  const service = new ShortLinkService();
  const originalProvider = ShortLinkService.provider;

  afterEach(() => {
    ShortLinkService.provider = originalProvider;
  });

  it('replaces URLs with the shortened links from the provider', async () => {
    ShortLinkService.provider = {
      shortLinkDomain: 'go.example.com',
      convertLinkToShortLink: async () => 'https://go.example.com/abc',
    } as unknown as ShortLinking;

    const [text] = await service.convertTextToShortLinks('org-1', [
      'Check https://example.com/page now',
    ]);

    expect(text).toBe('Check https://go.example.com/abc now');
  });

  it('keeps the original URL when the provider fails to shorten it', async () => {
    ShortLinkService.provider = {
      shortLinkDomain: 'go.example.com',
      convertLinkToShortLink: async () => undefined,
    } as unknown as ShortLinking;

    const [text] = await service.convertTextToShortLinks('org-1', [
      'Check https://example.com/page now',
    ]);

    expect(text).toBe('Check https://example.com/page now');
  });

  it('keeps the original short link when expanding it fails', async () => {
    ShortLinkService.provider = {
      shortLinkDomain: 'go.example.com',
      convertShortLinkToLink: async () => undefined,
    } as unknown as ShortLinking;

    const [text] = await service.convertShortLinksToLinks([
      'Was https://go.example.com/abc here',
    ]);

    expect(text).toBe('Was https://go.example.com/abc here');
  });
});
