import { ShortLinking } from '@gitroom/nestjs-libraries/short-linking/short-linking.interface';

// Unlike dub.sh / kutt.it there is no shared public domain to fall back to:
// short.io only creates links on a domain registered in the account, so
// SHORT_IO_SHORT_LINK_DOMAIN must be set to that domain.
const SHORT_IO_SHORT_LINK_DOMAIN =
  process.env.SHORT_IO_SHORT_LINK_DOMAIN || 'short.io';

// short.io expects the raw API key, without a Bearer prefix
const getOptions = () => ({
  headers: {
    Authorization: process.env.SHORT_IO_SECRET_KEY,
    'Content-Type': 'application/json',
  },
});

export class ShortIo implements ShortLinking {
  shortLinkDomain = SHORT_IO_SHORT_LINK_DOMAIN;

  async linksStatistics(links: string[]) {
    return Promise.all(
      links.map(async (link) => {
        const url = `https://api.short.io/links/expand?domain=${
          this.shortLinkDomain
        }&path=${link.split('/').pop()}`;
        const response = await fetch(url, getOptions()).then((res) =>
          res.json()
        );

        const linkStatisticsUrl = `https://statistics.short.io/statistics/link/${response.id}?period=last30&tz=UTC`;

        const statResponse = await fetch(linkStatisticsUrl, getOptions()).then(
          (res) => res.json()
        );

        return {
          short: response.shortURL,
          original: response.originalURL,
          clicks: statResponse.totalClicks,
        };
      })
    );
  }

  async convertLinkToShortLink(id: string, link: string) {
    const response = await fetch(`https://api.short.io/links`, {
      ...getOptions(),
      method: 'POST',
      body: JSON.stringify({
        url: link,
        tenantId: id,
        domain: this.shortLinkDomain,
        originalURL: link,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data?.shortURL) {
      console.error(
        `short.io: failed to shorten ${link} (status ${response.status}): ${JSON.stringify(
          data
        )}`
      );
      return link;
    }

    return data.shortURL;
  }

  async convertShortLinkToLink(shortLink: string) {
    return await (
      await (
        await fetch(
          `https://api.short.io/links/expand?domain=${
            this.shortLinkDomain
          }&path=${shortLink.split('/').pop()}`,
          getOptions()
        )
      ).json()
    ).originalURL;
  }

  // recursive functions that gets maximum 100 links per request if there are less than 100 links stop the recursion
  async getAllLinksStatistics(
    id: string,
    page = 1
  ): Promise<{ short: string; original: string; clicks: string }[]> {
    const response = await (
      await fetch(
        `https://api.short.io/api/links?domain_id=${id}&limit=150`,
        getOptions()
      )
    ).json();

    const mapLinks = response.links.map(async (link: any) => {
      const linkStatisticsUrl = `https://statistics.short.io/statistics/link/${response.id}?period=last30&tz=UTC`;

      const statResponse = await fetch(linkStatisticsUrl, getOptions()).then(
        (res) => res.json()
      );

      return {
        short: link,
        original: response.url,
        clicks: statResponse.totalClicks,
      };
    });

    if (mapLinks.length < 100) {
      return mapLinks;
    }

    return [...mapLinks, ...(await this.getAllLinksStatistics(id, page + 1))];
  }
}
