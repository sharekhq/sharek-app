import { HttpException, Injectable, Logger } from '@nestjs/common';

export type SiteBranding = {
  url: string;
  logo?: string;
  icon?: string;
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

// The service's own failures are written for the model, which relays them to
// the user: tavily.service.ts's wording, word for word.
const UNREACHABLE =
  "The web lookup service couldn't be reached. Say the lookup failed and offer to try again.";
const TOO_LONG =
  'The web lookup took too long. Say it failed and offer to try again.';

// What Firecrawl says of the site itself, which a caller tells apart by
// status.
const REFUSED_SITE = "This kind of site can't be read.";
const UNREADABLE_SITE = "This site couldn't be read.";

// Firecrawl counts the time a call waits in its queue against `timeout`, so
// its own limit sits under ours: a queued call fails as one that took too
// long, rather than hanging until the abort.
const BRAND_TIMEOUT = 25_000;
const BRAND_ABORT = 30_000;

// The status decides: Firecrawl's 429 carries no code, and a gateway in front
// of it may not answer in JSON. The code only tells a site that couldn't be
// read (its DNS, its certificate, its own error) from Firecrawl's own failure,
// both a 500; a scrape that timed out is a 408 with a SCRAPE_ code, and stays
// a timeout. A 403 is a site Firecrawl doesn't support (or a key without the
// permission, which the status can't tell from it) and a 400 is how it refuses
// some sites' branding (LinkedIn's), so both are the site refused. Any other
// 4xx, a bad key included, is a request it won't serve.
const refusal = (status: number, code: unknown) => {
  if (status === 402) {
    return new HttpException(
      "The web lookup service has used up its credits for now. Tell the user web lookups aren't available right now; don't answer from memory as if you had read it.",
      402
    );
  }
  if (status === 429) {
    return new HttpException(
      'The web lookup service is busy. Say the lookup failed and offer to try again in a moment.',
      429
    );
  }
  if (status === 408) {
    return new HttpException(TOO_LONG, 504);
  }
  if (status === 403 || status === 400) {
    return new HttpException(REFUSED_SITE, 403);
  }
  if (
    status === 500 &&
    typeof code === 'string' &&
    code.startsWith('SCRAPE_')
  ) {
    return new HttpException(UNREADABLE_SITE, 422);
  }
  if (status >= 500) {
    return new HttpException(UNREACHABLE, 503);
  }
  return new HttpException(
    "The web lookup service refused the request. Say the lookup failed; don't answer from memory as if you had read it.",
    502
  );
};

// fetch rejects on a network error, and with a TimeoutError once the signal's
// time is up, which covers reading the answer as well as reaching Firecrawl.
const failed = (err: any): never => {
  throw err?.name === 'TimeoutError' || err?.name === 'AbortError'
    ? new HttpException(TOO_LONG, 504)
    : new HttpException(UNREACHABLE, 503);
};

// A link in Firecrawl's answer is the site's own text, and readOrFetch, which
// reads a brand's logo by its link, opens any string that doesn't start with a
// lower-case "http" as a local file's path. So only an absolute http(s) link
// is handed on, as parsed, which puts its scheme in lower case.
const absolute = (link: unknown) => {
  try {
    const parsed = new URL(link as string);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

// Every organization draws on one monthly Firecrawl credit pool, so each call
// leaves a line to watch it by without Firecrawl's dashboard. A log line must
// never fail a lookup or change its answer: everything is swallowed.
const logLookup = (line: {
  org: string;
  kind: 'brand';
  ok: boolean;
  ms: number;
}) => {
  try {
    Logger.log(JSON.stringify(line), 'WebLookup');
  } catch {
    // deliberately silent
  }
};

@Injectable()
export class FirecrawlService {
  // Hands over what Firecrawl said of the site, each part only when it gave
  // one. What a kit can take (a readable image, a hex code, a plain font name)
  // is the brand service's to decide, where the kit's limits live.
  async branding(org: string, url: string): Promise<SiteBranding> {
    const started = Date.now();
    try {
      const answer = await this.post(
        'scrape',
        { url, formats: [{ type: 'branding' }], timeout: BRAND_TIMEOUT },
        BRAND_ABORT
      );
      const branding = answer?.data?.branding;
      // Firecrawl answers 200, and charges for it, when the site's page itself
      // answered an error (a 404, a block page), with the page's own status in
      // the metadata. What it read then is the error page's, not the site's.
      const page = answer?.data?.metadata?.statusCode;
      if (!branding || (typeof page === 'number' && page >= 400)) {
        throw new HttpException(UNREADABLE_SITE, 422);
      }
      const { images, colors, typography } = branding;
      const logo = absolute(images?.logo) || absolute(branding.logo);
      const icon = absolute(images?.favicon);
      const fonts = typography?.fontFamilies;
      const site: SiteBranding = {
        // The address the site led to, which may not be the one asked.
        url: answer.data.metadata?.url || url,
        ...(logo ? { logo } : {}),
        ...(icon ? { icon } : {}),
        colours: [colors?.primary, colors?.secondary, colors?.accent].filter(
          Boolean
        ),
        ...(fonts?.heading ? { headingFont: fonts.heading } : {}),
        ...(fonts?.primary ? { bodyFont: fonts.primary } : {}),
      };
      logLookup({ org, kind: 'brand', ok: true, ms: Date.now() - started });
      return site;
    } catch (err) {
      logLookup({ org, kind: 'brand', ok: false, ms: Date.now() - started });
      throw err;
    }
  }

  private async post(path: string, body: object, time: number) {
    const response = await fetch(`https://api.firecrawl.dev/v2/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(time),
    }).catch(failed);

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw refusal(response.status, error?.code);
    }

    return response.json().catch(failed);
  }
}
