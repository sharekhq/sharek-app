import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateOrgUserDto } from './create.org.user.dto';

const valid = {
  email: 'owner@example.com',
  password: 'secret-password',
  company: 'Acme',
  provider: 'LOCAL',
};

const failedProperties = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateOrgUserDto, body)).map(
    (error) => error.property
  );

describe('CreateOrgUserDto', () => {
  it('accepts a sign-up that carries no arrival values', () => {
    expect(failedProperties(valid)).toEqual([]);
  });

  // FR-009: the service drops an arrival value it cannot keep. The global
  // ValidationPipe turns any failed constraint into a 400, so a decorator on
  // one of these fields would refuse the sign-up instead.
  it('accepts arrival values of any shape', () => {
    expect(
      failedProperties({
        ...valid,
        utm_source: 'a'.repeat(300),
        utm_medium: '',
        utm_campaign: '   ',
        gclid: 42,
        ref: { nested: true },
        referrer: null,
        landing_url: 'not a url',
      })
    ).toEqual([]);
  });
});
