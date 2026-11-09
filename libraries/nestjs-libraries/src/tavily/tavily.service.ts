import { HttpException, Injectable, Logger } from '@nestjs/common';

type Lookup = 'search' | 'extract';

type WebResult = { title: string; url: string; snippet: string };
type WebPage = {
  url: string;
  text?: string;
  error?: string;
  images?: string[];
  favicon?: string;
};

// Page text is stored in the thread and sent to the model again on every later
// turn, so a long page would be paid for on each of them.
const TEXT_LIMIT = 8_000;

const UNREADABLE = "This page couldn't be read.";

// The failures below are written for the model, which relays them to the user.
const UNREACHABLE =
  "The web lookup service couldn't be reached. Say the lookup failed and offer to try again.";

// 432 and 433 are Tavily's plan and pay-as-you-go limits; any other 4xx, a bad
// key included, is a request it won't serve.
const refusal = (status: number) => {
  if (status === 432 || status === 433) {
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
  if (status >= 500) {
    return new HttpException(UNREACHABLE, 503);
  }
  return new HttpException(
    "The web lookup service refused the request. Say the lookup failed; don't answer from memory as if you had read it.",
    502
  );
};

// fetch rejects on a network error, and with a TimeoutError once the signal's
// time is up, which covers reading the answer as well as reaching Tavily.
const failed = (err: any): never => {
  throw err?.name === 'TimeoutError' || err?.name === 'AbortError'
    ? new HttpException(
        'The web lookup took too long. Say it failed and offer to try again.',
        504
      )
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

// Tavily may answer with another form of the address asked (a trailing slash
// added or dropped, an upper-case scheme or host, the default port), so the
// two are compared once parsed. An address that doesn't parse is its own text.
const comparable = (address: string) => {
  try {
    const parsed = new URL(address);
    parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.href;
  } catch {
    return address;
  }
};

// A brand's logo candidate is fetched later by its address alone, with no page
// to resolve a relative one against, so only an absolute http(s) link is kept.
const absolute = (link: unknown) => {
  try {
    const parsed = new URL(link as string);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

const pictures = (result: any) => {
  const favicon = absolute(result?.favicon);
  return {
    images: [
      ...new Set<string>((result?.images || []).map(absolute).filter(Boolean)),
    ],
    ...(favicon ? { favicon } : {}),
  };
};

// Every organization draws on one monthly Tavily credit pool, so each call
// leaves a line to watch it by without Tavily's dashboard. A log line must
// never fail a lookup or change its answer: everything is swallowed.
const logLookup = (line: {
  org: string;
  kind: Lookup;
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
export class TavilyService {
  async search(org: string, query: string): Promise<WebResult[]> {
    const started = Date.now();
    try {
      const { results } = await this.post('search', {
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      });
      // Mastra checks the tool's answer against its output schema, so one
      // result with no title or snippet would fail the whole search.
      const found = (results || []).map((p: any) => ({
        title: p.title || '',
        url: p.url,
        snippet: p.content || '',
      }));
      logLookup({ org, kind: 'search', ok: true, ms: Date.now() - started });
      return found;
    } catch (err) {
      logLookup({ org, kind: 'search', ok: false, ms: Date.now() - started });
      throw err;
    }
  }

  // Tavily doesn't promise its results come back in the order asked, so each
  // address is matched to its result by address. Tavily bills the pages it
  // read, which is what the log line counts. With images, each page also
  // carries its image links and favicon, for a brand's logo candidates; Samy's
  // read asks without them, and its text is words only either way.
  async extract(
    org: string,
    urls: string[],
    options: { images?: boolean } = {}
  ): Promise<WebPage[]> {
    const started = Date.now();
    try {
      const { results, failed_results } = await this.post('extract', {
        urls,
        extract_depth: 'basic',
        format: 'markdown',
        ...(options.images
          ? { include_images: true, include_favicon: true }
          : {}),
      });
      const pages: WebPage[] = urls.map((url) => {
        const asked = comparable(url);
        const match = (p: any) => comparable(p.url) === asked;
        const result = results?.find(match);
        const text = words(result?.raw_content || '');
        const page: WebPage = text
          ? { url, text: cut(text) }
          : { url, error: failed_results?.find(match)?.error || UNREADABLE };
        return options.images ? { ...page, ...pictures(result) } : page;
      });
      logLookup({
        org,
        kind: 'extract',
        ok: true,
        ms: Date.now() - started,
        pages: pages.filter((p) => p.text).length,
      });
      return pages;
    } catch (err) {
      logLookup({
        org,
        kind: 'extract',
        ok: false,
        ms: Date.now() - started,
        pages: 0,
      });
      throw err;
    }
  }

  private async post(kind: Lookup, body: object) {
    const response = await fetch(`https://api.tavily.com/${kind}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Short enough that a step making several lookups in turn still answers
      // inside nginx's 95 s.
      signal: AbortSignal.timeout(20_000),
    }).catch(failed);

    if (!response.ok) {
      throw refusal(response.status);
    }

    return response.json().catch(failed);
  }
}
