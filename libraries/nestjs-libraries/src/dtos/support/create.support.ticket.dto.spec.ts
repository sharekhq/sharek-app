import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateSupportTicketDto,
  SUPPORT_APP_VERSION_MAX,
} from './create.support.ticket.dto';

const valid = {
  category: 'channels',
  subject: 'Instagram stopped posting',
  message: 'Since Tuesday my scheduled posts fail.',
  locale: 'ar',
};

const failedProperties = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateSupportTicketDto, body)).map(
    (error) => error.property
  );

describe('CreateSupportTicketDto', () => {
  it('accepts a complete enquiry', () => {
    expect(failedProperties(valid)).toEqual([]);
  });

  it('accepts every optional diagnostic field', () => {
    expect(
      failedProperties({
        ...valid,
        timezone: 'Africa/Cairo',
        appVersion: '1.0.6',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        viewport: '1440x900',
        fromPath: '/launches',
      })
    ).toEqual([]);
  });

  describe('category', () => {
    it.each(['channels', 'billing', 'technical', 'other'])(
      'accepts %s',
      (category) => {
        expect(failedProperties({ ...valid, category })).toEqual([]);
      }
    );

    // No default. The customer picked nothing, and silently filing it as "other"
    // would route the enquiry on a guess the form deliberately refused to make.
    it('rejects an absent category rather than falling back', () => {
      const { category, ...withoutCategory } = valid;
      expect(failedProperties(withoutCategory)).toContain('category');
    });

    it('rejects a category outside the set', () => {
      expect(failedProperties({ ...valid, category: 'refunds' })).toContain(
        'category'
      );
    });
  });

  describe('subject', () => {
    it('rejects an empty subject', () => {
      expect(failedProperties({ ...valid, subject: '' })).toContain('subject');
    });

    it('rejects a subject beyond 200 characters', () => {
      expect(failedProperties({ ...valid, subject: 'x'.repeat(201) })).toContain(
        'subject'
      );
    });

    it('accepts a subject of exactly 200 characters', () => {
      expect(
        failedProperties({ ...valid, subject: 'x'.repeat(200) })
      ).toEqual([]);
    });

    it('trims surrounding whitespace before measuring', () => {
      const dto = plainToInstance(CreateSupportTicketDto, {
        ...valid,
        subject: '  Instagram stopped posting  ',
      });
      expect(dto.subject).toBe('Instagram stopped posting');
    });

    it('rejects a subject that is only whitespace', () => {
      expect(failedProperties({ ...valid, subject: '   ' })).toContain(
        'subject'
      );
    });
  });

  describe('message', () => {
    it('rejects an empty message', () => {
      expect(failedProperties({ ...valid, message: '' })).toContain('message');
    });

    // The counter the customer watches stops at 2000 (FR-005), so the boundary
    // the server enforces has to be the same one.
    it('accepts a message of exactly 2000 characters', () => {
      expect(
        failedProperties({ ...valid, message: 'x'.repeat(2000) })
      ).toEqual([]);
    });

    it('rejects a message beyond 2000 characters', () => {
      expect(
        failedProperties({ ...valid, message: 'x'.repeat(2001) })
      ).toContain('message');
    });
  });

  describe('locale', () => {
    it('rejects an absent locale', () => {
      const { locale, ...withoutLocale } = valid;
      expect(failedProperties(withoutLocale)).toContain('locale');
    });

    it.each(['ar', 'en', 'pt-BR'])('accepts %s', (locale) => {
      expect(failedProperties({ ...valid, locale })).toEqual([]);
    });

    it.each(['a', 'en_US', 'en;DROP', 'x'.repeat(11)])(
      'rejects %s',
      (locale) => {
        expect(failedProperties({ ...valid, locale })).toContain('locale');
      }
    );
  });

  describe('optional bounds', () => {
    // fromPath has to stay a valid path at both boundaries, or it would fail the
    // pattern rather than the length and the bound would go untested.
    const ofLength = (field: string, length: number) =>
      field === 'fromPath'
        ? `/${'x'.repeat(length - 1)}`
        : 'x'.repeat(length);

    it.each([
      ['timezone', 64],
      // Wide enough for the 40-character commit SHA a real build stamps here.
      ['appVersion', SUPPORT_APP_VERSION_MAX],
      ['userAgent', 512],
      ['viewport', 16],
      ['fromPath', 256],
    ])('caps %s at %i characters', (field, max) => {
      expect(
        failedProperties({ ...valid, [field]: ofLength(field, max) })
      ).toEqual([]);
      expect(
        failedProperties({ ...valid, [field]: ofLength(field, max + 1) })
      ).toContain(field);
    });
  });

  // fromPath is echoed into a ticket body an agent will read and click. An
  // absolute or protocol-relative value would render there as an off-site link.
  describe('fromPath', () => {
    it.each(['/launches', '/settings?tab=team', '/'])(
      'accepts the in-app path %s',
      (fromPath) => {
        expect(failedProperties({ ...valid, fromPath })).toEqual([]);
      }
    );

    it.each([
      'https://evil.example.com',
      'http://evil.example.com',
      '//evil.example.com',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'HTTPS://evil.example.com',
    ])('rejects %s', (fromPath) => {
      expect(failedProperties({ ...valid, fromPath })).toContain('fromPath');
    });
  });
});
