import { HttpException, Injectable, Logger } from '@nestjs/common';

type Lookup = 'search' | 'extract';

type WebResult = { title: string; url: string; snippet: string };
type WebPage = { url: string; text?: string; error?: string };

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
      const found = (results || []).map((p: any) => ({
        title: p.title,
        url: p.url,
        snippet: p.content,
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
  // read, which is what the log line counts.
  async extract(org: string, urls: string[]): Promise<WebPage[]> {
    const started = Date.now();
    try {
      const { results, failed_results } = await this.post('extract', {
        urls,
        extract_depth: 'basic',
        format: 'markdown',
      });
      const pages: WebPage[] = urls.map((url) => {
        const text = results?.find((p: any) => p.url === url)?.raw_content;
        if (text) {
          return { url, text: cut(text) };
        }
        return {
          url,
          error:
            failed_results?.find((p: any) => p.url === url)?.error ||
            UNREADABLE,
        };
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
