import { HttpException, Injectable, Logger } from '@nestjs/common';

export type SiteBranding = {
  url: string;
  logo?: string;
  icon?: string;
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

export type WebResult = { title: string; url: string; snippet: string };
export type WebPage = { url: string; text?: string; error?: string };

// The service's own failures are written for the model, which relays them to
// the user.
const UNREACHABLE =
  "The web lookup service couldn't be reached. Say the lookup failed and offer to try again.";
const TOO_LONG =
  'The web lookup took too long. Say it failed and offer to try again.';

// What Firecrawl says of the site itself, which a caller tells apart by
// status. The second is exported so Brands, which says it of every failure
// but a refused site, has no second copy of it.
const REFUSED_SITE = "This kind of site can't be read.";
export const UNREADABLE_SITE = "This site couldn't be read.";

// What Firecrawl says of one page of a read, which comes back as that page's
// error while the other pages are read.
const REFUSED_PAGE = "This site doesn't allow its pages to be read.";
const UNREADABLE = "This page couldn't be read.";

// How a call words what Firecrawl's 400, 403 and a 500 with a SCRAPE_ code say
// of the site, each with the status it is thrown at. A search names no site,
// so it has none of its own.
type SiteFailures = Record<400 | 403 | 500, [string, number]>;

// A 403 is a site Firecrawl doesn't support (or a key without the permission,
// which the status can't tell from it) and a 400 is how it refuses some sites'
// branding (LinkedIn's), so both are the site refused.
const BRAND_SITE: SiteFailures = {
  400: [REFUSED_SITE, 403],
  403: [REFUSED_SITE, 403],
  500: [UNREADABLE_SITE, 422],
};

// A 400 on a page is a request Firecrawl won't make of it: one more page that
// couldn't be read. A page's reasons are thrown at 403 and 422, as a brand
// lookup's are, and a read tells them from the service's failures by those.
const READ_PAGE: SiteFailures = {
  400: [UNREADABLE, 422],
  403: [REFUSED_PAGE, 403],
  500: [UNREADABLE, 422],
};
const PAGE_STATUSES = [403, 422];

// Firecrawl counts the time a call waits in its queue against `timeout`, so
// its own limit sits under ours: a queued call fails as one that took too
// long, rather than hanging until the abort. A search's and a read's are short
// enough that a step making several lookups in turn still answers inside
// nginx's 95 s.
const BRAND_TIMEOUT = 25_000;
const BRAND_ABORT = 30_000;
const WEB_TIMEOUT = 15_000;
const WEB_ABORT = 20_000;

// Page text is stored in the thread and sent to the model again on every later
// turn, so a long page would be paid for on each of them.
const TEXT_LIMIT = 8_000;

// A PDF is read for its first pages only, a credit each: a page of text runs
// to about 5,800 characters, so two already pass the 8,000 kept, and a third
// covers pages that have less.
const PDF_PAGES = 3;

// The status decides: Firecrawl's 429 carries no code, and a gateway in front
// of it may not answer in JSON. The code only tells a site that couldn't be
// read (its DNS, its certificate, its own error) from Firecrawl's own failure,
// both a 500; a scrape that timed out is a 408 with a SCRAPE_ code, and stays
// a timeout. A 400, a 403 and such a 500 are the call's `site` to word; with
// none, they are a request refused and Firecrawl's own failure. Any other
// 4xx, a bad key included, is a request it won't serve.
const refusal = (status: number, code: unknown, site?: SiteFailures) => {
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
  if (site && (status === 403 || status === 400)) {
    return new HttpException(...site[status]);
  }
  if (
    site &&
    status === 500 &&
    typeof code === 'string' &&
    code.startsWith('SCRAPE_')
  ) {
    return new HttpException(...site[500]);
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

const cut = (text: string) =>
  text.length > TEXT_LIMIT
    ? `${text.slice(0, TEXT_LIMIT)}\n\n[Cut at 8,000 characters.]`
    : text;

// `![alt](address)`, or a link whose whole text is one, which goes with it.
const IMAGE =
  /\[!\[[^\]\n]*\]\([^)\n]*\)\]\([^)\n]*\)|!\[[^\]\n]*\]\([^)\n]*\)/g;

// Samy reads a page's words only: the addresses of its images aren't Samy's to
// use, and on a page full of them they used up the 8,000 characters. A page's
// own links stay, since Samy follows them to find the page it needs.
const words = (text: string) =>
  text
    .replace(IMAGE, '')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
    .trim();

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
  kind: 'brand' | 'search' | 'read';
  ok: boolean;
  ms: number;
  pages?: number;
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
        BRAND_ABORT,
        BRAND_SITE
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

  async search(org: string, query: string): Promise<WebResult[]> {
    const started = Date.now();
    try {
      const answer = await this.post(
        'search',
        { query, limit: 5, sources: ['web'], timeout: WEB_TIMEOUT },
        WEB_ABORT
      );
      // Mastra checks the tool's answer against its output schema, so one
      // result with no title or snippet would fail the whole search.
      const found = (answer?.data?.web || []).map((p: any) => ({
        title: p.title || '',
        url: p.url,
        snippet: p.description || '',
      }));
      logLookup({ org, kind: 'search', ok: true, ms: Date.now() - started });
      return found;
    } catch (err) {
      logLookup({ org, kind: 'search', ok: false, ms: Date.now() - started });
      throw err;
    }
  }

  // Firecrawl reads one address a call, so the calls are made at once and each
  // answer belongs to the address its call asked for. A page that failed keeps
  // its reason as its error while the others are read; only the service
  // failing every page fails the read, with the first page's reason, since
  // nothing could be read. Anything else that fails, such as an answer off
  // Firecrawl's documented shape, fails the read for the tool to word. The log
  // line counts the pages that came back with text.
  async read(org: string, urls: string[]): Promise<WebPage[]> {
    const started = Date.now();
    try {
      const answers = await Promise.all(
        urls.map((url) =>
          this.page(url).catch((err) => {
            if (err instanceof HttpException) {
              return err;
            }
            throw err;
          })
        )
      );
      if (
        answers.every(
          (a) =>
            a instanceof HttpException && !PAGE_STATUSES.includes(a.getStatus())
        )
      ) {
        throw answers[0];
      }
      const pages: WebPage[] = answers.map((a, i) =>
        a instanceof HttpException ? { url: urls[i], error: a.message } : a
      );
      logLookup({
        org,
        kind: 'read',
        ok: true,
        ms: Date.now() - started,
        pages: pages.filter((p) => p.text).length,
      });
      return pages;
    } catch (err) {
      logLookup({
        org,
        kind: 'read',
        ok: false,
        ms: Date.now() - started,
        pages: 0,
      });
      throw err;
    }
  }

  private async page(url: string): Promise<WebPage> {
    const answer = await this.post(
      'scrape',
      {
        url,
        formats: [{ type: 'markdown' }],
        parsers: [{ type: 'pdf', maxPages: PDF_PAGES }],
        timeout: WEB_TIMEOUT,
      },
      WEB_ABORT,
      READ_PAGE
    );
    const text = words(answer?.data?.markdown || '');
    // Firecrawl answers 200, and charges for it, when the page itself answered
    // an error (a 404, a block page), with the page's own status in the
    // metadata. What it read then is the error page's, not the page asked for.
    const status = answer?.data?.metadata?.statusCode;
    if (!text || (typeof status === 'number' && status >= 400)) {
      throw new HttpException(UNREADABLE, 422);
    }
    // A PDF says when it has more pages than were read, unless its text was cut
    // at 8,000 characters, which says so already.
    const { numPages, totalPages } = answer.data.metadata || {};
    return {
      url,
      text:
        text.length <= TEXT_LIMIT && totalPages > numPages
          ? `${text}\n\n[Cut at page ${numPages} of ${totalPages}.]`
          : cut(text),
    };
  }

  private async post(
    path: string,
    body: object,
    time: number,
    site?: SiteFailures
  ) {
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
      throw refusal(response.status, error?.code, site);
    }

    return response.json().catch(failed);
  }
}
