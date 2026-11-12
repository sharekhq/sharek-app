import { Injectable } from '@nestjs/common';
import type {
  ProcessAPIErrorArgs,
  ProcessLLMRequestArgs,
  Processor,
} from '@mastra/core/processors';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  extractAgentMessageMedia,
  isMediaLink,
} from '@gitroom/helpers/utils/extract.agent.message.text';

const PICTURES_PER_CALL = 8;
const LINK_CHECK_TIMEOUT = 5_000;

const READABLE = /\.(png|jpe?g|webp)(?:[?#].*)?$/i;

const NOTE = {
  faded: 'you can no longer see this one. It can still be used as a reference.',
  notTheirs: "this one can't be read or used.",
  unloaded: "this one couldn't be loaded, so tell the user which one.",
  unreadable: "you can't see inside this one.",
};

// Per run, across its steps and retries.
type ReaderState = {
  owned?: Record<string, boolean>;
  sent?: string[];
  skip?: string[];
};

type Prompt = ProcessLLMRequestArgs['prompt'];
type UserPart = Extract<Prompt[number], { role: 'user' }>['content'][number];

/** Where the prompt mentions an image, oldest first. */
const mentionsIn = (prompt: Prompt) => {
  const turn = prompt.map(({ role }) => role).lastIndexOf('user');

  return prompt.flatMap((message, position) => {
    if (message.role === 'user') {
      return message.content.flatMap((part) =>
        part.type === 'text'
          ? extractAgentMessageMedia(part.text)
              .media.filter((item) => item.kind === 'image')
              .map(({ url }) => ({ url, position }))
          : []
      );
    }

    if (message.role === 'tool') {
      return message.content.flatMap((part) => {
        if (part.type !== 'tool-result' || part.output.type !== 'json') {
          return [];
        }
        const { path, logo, examples } = (part.output.value ?? {}) as {
          path?: unknown;
          logo?: unknown;
          examples?: { path?: unknown }[];
        };
        // A brand kit is seen in the turn that looked at it, and stays text after.
        const links =
          part.toolName === 'generateImageTool'
            ? [path]
            : part.toolName === 'brandKitTool' && position > turn
            ? [logo, ...(examples ?? []).map((example) => example.path)]
            : [];
        return links.filter(isMediaLink).map((url) => ({ url, position }));
      });
    }

    return [];
  });
};

const picture = (url: string): UserPart[] => [
  { type: 'text', text: `Image ${url}:` },
  {
    type: 'file',
    mediaType: 'image/*',
    data: new URL(url),
    providerOptions: { openai: { imageDetail: 'high' } },
  },
];

const note = (url: string, words: string): UserPart[] => [
  { type: 'text', text: `Image ${url}: ${words}` },
];

/** A stored path is user-influenced, so it's read through the SSRF-safe client. */
const unreachableLinks = async (links: string[]) => {
  const gone = await Promise.all(
    links.map((url) =>
      getSsrfSafeAxios()
        .head(url, { signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT) })
        .then(
          () => false,
          () => true
        )
    )
  );

  return links.filter((_url, index) => gone[index]);
};

/**
 * Shows Samy the images in the prompt it was given, which is already exactly what
 * it remembers. This changes one model call and is never stored, so a dead image
 * can't poison a thread. It's listed under both `inputProcessors` and
 * `errorProcessors`, because Mastra's error hook skips what it wraps as input.
 */
@Injectable()
export class SamyImageReader implements Processor {
  readonly id = 'samy-image-reader';

  constructor(private _mediaService: MediaService) {}

  async processLLMRequest({
    prompt,
    requestContext,
    state,
  }: ProcessLLMRequestArgs) {
    const run = state as ReaderState;
    run.sent = [];

    const mentions = mentionsIn(prompt);
    if (!mentions.length) {
      return undefined;
    }

    // Reading must not fail a turn: without its pictures the call still goes out.
    try {
      const org = JSON.parse(requestContext?.get('organization' as never));
      const owned = await this.ownedLinks(org.id, mentions, run);
      const skipped = run.skip ?? [];

      // Each link once, at its newest position, newest first.
      const newest = new Map<string, number>();
      for (const { url, position } of [...mentions].reverse()) {
        if (!newest.has(url)) {
          newest.set(url, position);
        }
      }

      const sent = [...newest.keys()]
        .filter((url) => READABLE.test(url) && owned[url])
        .filter((url) => !skipped.includes(url))
        .slice(0, PICTURES_PER_CALL);

      const added = (url: string) => {
        if (!READABLE.test(url)) return note(url, NOTE.unreadable);
        if (!owned[url]) return note(url, NOTE.notTheirs);
        if (skipped.includes(url)) return note(url, NOTE.unloaded);
        return sent.includes(url) ? picture(url) : note(url, NOTE.faded);
      };

      const withImages = prompt.flatMap((message, position): Prompt => {
        const parts = [...newest]
          .filter(([, at]) => at === position)
          .reverse()
          .flatMap(([url]) => added(url));

        if (!parts.length) {
          return [message];
        }

        return message.role === 'user'
          ? [{ ...message, content: [...message.content, ...parts] }]
          : // The provider maps a tool output's media only as base64, not a link.
            [message, { role: 'user', content: parts }];
      });

      run.sent = sent;
      return { prompt: withImages };
    } catch (err) {
      console.error('samyImageReader failed:', err);
      return undefined;
    }
  }

  async processAPIError({ error, state }: ProcessAPIErrorArgs) {
    const run = state as ReaderState;
    const sent = run.sent ?? [];
    if (!sent.length) {
      return undefined;
    }

    const { statusCode, message, code, responseBody } = (error ?? {}) as {
      statusCode?: number;
      message?: string;
      code?: string;
      responseBody?: string;
    };
    const words = [message, code, responseBody].filter(Boolean).join(' ');
    const named = sent.filter((url) => words.includes(url));

    // A stream that failed for any other reason isn't this reader's to retry.
    if (statusCode !== 400 && !named.length && !/image/i.test(words)) {
      return undefined;
    }

    // OpenAI's answer for a link it can't download doesn't say which one, and only
    // the one that's gone should cost Samy its picture. If every link answers, the
    // pictures may still be the cause, so they all go and the retry tells.
    const gone = named.length ? named : await unreachableLinks(sent);
    run.skip = [...(run.skip ?? []), ...(gone.length ? gone : sent)];
    return { retry: true };
  }

  /** Which readable links are this organization's live rows, asking about each once. */
  private async ownedLinks(
    org: string,
    mentions: { url: string }[],
    run: ReaderState
  ) {
    const owned = run.owned ?? {};
    const unknown = [...new Set(mentions.map(({ url }) => url))].filter(
      (url) => READABLE.test(url) && owned[url] === undefined
    );

    if (unknown.length) {
      const rows = await this._mediaService.getMediaByPaths(org, unknown);
      for (const url of unknown) {
        owned[url] = rows.some(({ path }) => path === url);
      }
    }

    run.owned = owned;
    return owned;
  }
}
