import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  ChannelHealth,
  buildSupportTicket,
} from '@gitroom/nestjs-libraries/services/support.context';

// One global key — the credential is the application's, not a user's, so every
// instance shares the same access token rather than each minting its own
// (research R3). Zoho rate-limits minting separately from API credits.
const TOKEN_CACHE_KEY = 'support:zoho:access-token';

// Expire our copy ahead of Zoho's so a token is never used in its final moments.
const TOKEN_TTL_SAFETY_MARGIN = 300;

// Nothing else bounds a call that never answers, and the customer is sitting in
// front of the form waiting for it. Four short calls, so this is generous.
const REQUEST_TIMEOUT = 10000;

// FR-015: no more than five enquiries an hour from one organisation, against a
// frustrated customer or a stuck button flooding the queue. Counted on tickets
// that were created, because only those reach the queue — spending the
// allowance on failed sends would cost a customer their hour for an outage that
// was ours, while they did exactly what the failure banner told them to.
const ENQUIRY_LIMIT = 5;
const ENQUIRY_WINDOW = 3600;

const enquiryCountKey = (organizationId: string) =>
  `support:rate:${organizationId}`;

interface ZohoTokenResponse {
  access_token?: string;
  expires_in?: number;
}

// Assembled server-side from the session and never accepted from the request
// body — these are the fields that would matter if they were forged.
export interface SupportSender {
  userId: string;
  // Nullable because `User.name` is: self-registration never writes one, so the
  // first enquiry from a fresh account arrives with nothing here.
  name: string | null;
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
  tier: string;
  isLifetime: boolean;
  isTrailing: boolean;
  accountAgeDays: number;
  isImpersonating: boolean;
}

@Injectable()
export class SupportService {
  constructor(private _integrations: PrismaRepository<'integration'>) {}

  private get config() {
    return {
      dc: process.env.ZOHO_DESK_DC!,
      orgId: process.env.ZOHO_DESK_ORG_ID!,
      departmentId: process.env.ZOHO_DESK_DEPARTMENT_ID!,
      clientId: process.env.ZOHO_DESK_CLIENT_ID!,
      clientSecret: process.env.ZOHO_DESK_CLIENT_SECRET!,
      refreshToken: process.env.ZOHO_DESK_REFRESH_TOKEN!,
    };
  }

  // Both URLs derive from the one suffix so they can never be mismatched: regions
  // do not share data, and a token minted at accounts.zoho.com is rejected by
  // desk.zoho.eu (research R4).
  private get apiUrl() {
    return `https://desk.zoho.${this.config.dc}/api/v1`;
  }

  private get tokenUrl() {
    return `https://accounts.zoho.${this.config.dc}/oauth/v2/token`;
  }

  // A timeout or a dropped connection rejects with a plain Error, and a plain
  // Error reaches the customer as an opaque 500 — no banner, no way out. Every
  // outbound failure leaves here as a 503 instead.
  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
    } catch (error) {
      throw new HttpException(
        `Zoho Desk did not answer: ${(error as Error)?.message}`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  private async mintAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = this.config;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await this.send(`${this.tokenUrl}?${params.toString()}`, {
      method: 'POST',
    });

    // A rejection here means the refresh token was revoked or the region is
    // wrong — an operator has to fix it, so a retry would only lengthen the wait
    // the customer is already sitting through. Nothing further down the chain
    // says so, which is why it is logged here.
    if (!response.ok) {
      console.error(
        '[support] Zoho refused the token exchange',
        response.status,
        await response.text()
      );

      throw new HttpException(
        `Zoho token exchange failed with ${response.status}`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const body: ZohoTokenResponse = await response.json();
    if (!body?.access_token) {
      throw new HttpException(
        'Zoho token exchange returned no access token',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    await ioRedis.set(
      TOKEN_CACHE_KEY,
      body.access_token,
      'EX',
      Math.max((body.expires_in ?? 3600) - TOKEN_TTL_SAFETY_MARGIN, 60)
    );

    return body.access_token;
  }

  private async getAccessToken(): Promise<string> {
    return (await ioRedis.get(TOKEN_CACHE_KEY)) || this.mintAccessToken();
  }

  private call(path: string, init: RequestInit, accessToken: string) {
    return this.send(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        orgId: this.config.orgId,
        'Content-Type': 'application/json',
      },
    });
  }

  private async parse<T>(response: Response): Promise<T> {
    // A search that matched nothing comes back 204 with an empty body, and
    // `ok` is true for it. Parsing anyway throws a SyntaxError — a plain Error,
    // which would escape the 503 mapping below as an opaque 500 for every
    // first-time sender, the one branch that never appears in a happy path.
    if (response.status === HttpStatus.NO_CONTENT) {
      return {} as T;
    }

    if (!response.ok) {
      // Both times Zoho rejected a payload during verification the message
      // named the offending parameter exactly — the difference between a silent
      // failure and a five-minute fix.
      if (response.status === HttpStatus.UNPROCESSABLE_ENTITY) {
        console.error(
          '[support] Zoho rejected the payload',
          await response.text()
        );
      }

      // One status for every outbound failure: the customer's options are
      // identical in all of them. The distinction is for the logs.
      throw new HttpException(
        `Zoho Desk responded with ${response.status}`,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    return response.json();
  }

  async deskRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.call(path, init, await this.getAccessToken());

    // The only retry in the design, and it earns its place: a cached token can
    // expire between our read and Zoho's check, and without this the race reaches
    // the customer as a failed send.
    if (response.status === 401) {
      await ioRedis.del(TOKEN_CACHE_KEY);
      return this.parse<T>(
        await this.call(path, init, await this.mintAccessToken())
      );
    }

    return this.parse<T>(response);
  }

  // Zoho holds several contacts with the same address quite happily, so creating
  // one per submission would scatter a customer's history across duplicates and
  // break the threading this feature depends on (research R1).
  private async resolveContact(sender: SupportSender): Promise<string> {
    const search = await this.deskRequest<{ data?: { id: string }[] }>(
      `/contacts/search?email=${encodeURIComponent(sender.email)}`
    );

    if (search.data?.length) {
      return search.data[0].id;
    }

    // `lastName` is the only field Zoho requires, so a name with no space goes
    // there whole. A name is not always "first last", so the split is storage
    // for the destination rather than a claim about the person.
    //
    // It is not private to the destination either: Desk reads it back out as
    // `${Cases.Contact Name}` in every notification template it sends, so the
    // whole address here greets the customer with their own email — and the
    // signup path never writes `User.name`, which makes that nearly everyone.
    // The local part is the handle they chose; it is taken as written, because
    // reshaping "moataz.khalifa" into a name would be inventing one.
    const identity = sender.name?.trim() || sender.email.split('@')[0];
    const [firstName, ...rest] = identity.split(' ');
    const created = await this.deskRequest<{ id: string }>('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        ...(rest.length
          ? { firstName, lastName: rest.join(' ') }
          : { lastName: firstName }),
        email: sender.email,
      }),
    });

    return created.id;
  }

  // Deliberately narrow: `token`, `refreshToken` and `profile` are never
  // selected, so a credential cannot reach the payload or any log downstream of
  // it (FR-010).
  private channelHealth(organizationId: string): Promise<ChannelHealth[]> {
    return this._integrations.model.integration.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        providerIdentifier: true,
        name: true,
        disabled: true,
        refreshNeeded: true,
        inBetweenSteps: true,
        tokenExpiration: true,
      },
    });
  }

  // Read before the work and written only after it, so the allowance tracks
  // tickets in the queue rather than attempts at making one.
  private async assertAllowance(organizationId: string): Promise<void> {
    const filed = Number(
      (await ioRedis.get(enquiryCountKey(organizationId))) || 0
    );

    if (filed >= ENQUIRY_LIMIT) {
      throw new HttpException(
        `No more than ${ENQUIRY_LIMIT} enquiries an hour`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  // Best-effort for the same reason the tag call below is: this runs once the
  // ticket exists, so a throw here would report a failure for an enquiry that
  // was filed and send the customer to retry into a duplicate. An uncounted
  // enquiry is the cheaper of the two.
  private async recordEnquiry(organizationId: string): Promise<void> {
    const key = enquiryCountKey(organizationId);

    try {
      // The window is set once, on the first of the hour, so it runs from that
      // enquiry rather than sliding forward with each one and never letting the
      // count fall back.
      if ((await ioRedis.incr(key)) === 1) {
        await ioRedis.expire(key, ENQUIRY_WINDOW);
      }
    } catch (error) {
      console.error('[support] could not count the enquiry', key, error);
    }
  }

  async createTicket(
    sender: SupportSender,
    enquiry: CreateSupportTicketDto
  ): Promise<string> {
    await this.assertAllowance(sender.organizationId);

    const [contactId, channels] = await Promise.all([
      this.resolveContact(sender),
      this.channelHealth(sender.organizationId),
    ]);

    const payload = buildSupportTicket(sender, enquiry, channels);

    const ticket = await this.deskRequest<{
      ticketNumber: string;
      id: string;
    }>('/tickets', {
      method: 'POST',
      body: JSON.stringify({
        subject: payload.subject,
        description: payload.description,
        contactId,
        departmentId: this.config.departmentId,
        // Left unset this does not stay blank — Zoho stamps it "Phone" and files
        // every web enquiry in the queue as a phone call.
        channel: payload.channel,
        // Absent when the locale has no English display name, rather than
        // sending a code Zoho would store as noise.
        ...(payload.language ? { language: payload.language } : {}),
      }),
    });

    await this.recordEnquiry(sender.organizationId);

    // Both are best-effort and independent of each other, and the customer is
    // waiting on this request — running them together keeps the fifth and sixth
    // round trips off the end of the wait rather than adding to it.
    await Promise.all([
      this.attachTags(ticket.id, payload.tags),
      this.addContext(ticket.id, payload.context),
    ]);

    // The short sequential reference the customer is shown and the
    // acknowledgement email carries — not Zoho's internal record id.
    return ticket.ticketNumber;
  }

  // A private comment rather than part of the description: Desk quotes the
  // description into every reply, so diagnostics left there are read back to the
  // customer under our own signature. `isPublic: false` is agent-only and never
  // quoted, and it can only be set when the comment is made.
  //
  // Best-effort for the same reason the tags are — the ticket already exists and
  // the customer already has their reference, so a comment that did not stick
  // must not report a failure for an enquiry that was filed. It is the one part
  // of the enquiry an agent can ask for directly if it is ever missing.
  private async addContext(ticketId: string, context: string): Promise<void> {
    try {
      await this.deskRequest(`/tickets/${ticketId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: context,
          contentType: 'html',
          isPublic: false,
          // Required by the schema even with nothing to attach; omitting it is
          // a 422 that names no field.
          attachmentIds: [],
        }),
      });
    } catch (error) {
      console.error('[support] could not attach the context', ticketId, error);
    }
  }

  // Best-effort by design: this runs after the ticket exists, so the customer
  // already has their reference. A label that did not stick must never turn into
  // a failed enquiry, so the error is logged and swallowed and never retried.
  private async attachTags(ticketId: string, tags: string[]): Promise<void> {
    try {
      await this.deskRequest(`/tickets/${ticketId}/associateTag`, {
        method: 'POST',
        body: JSON.stringify({ tags }),
      });
    } catch (error) {
      console.error('[support] could not attach tags', ticketId, tags, error);
    }
  }
}
