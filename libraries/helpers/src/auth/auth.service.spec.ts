import { AuthService } from './auth.service';

// Stored passwords were hashed by bcrypt 5.1.1, as this one was. They must keep
// verifying across a bcrypt update, and a new hash must keep the format an
// older bcrypt reads, so a rollback still signs everyone in.
const bcrypt5Hash =
  '$2b$10$Fx9PmGkMwOwZ.aHwLi/NQeGDE3fSS8w1i8FElegrtk3MNGCLtsLjC';

describe('AuthService passwords', () => {
  it('verifies a hash that bcrypt 5 wrote', () => {
    expect(
      AuthService.comparePassword('sharek-bcrypt5-fixture', bcrypt5Hash)
    ).toBe(true);
    expect(AuthService.comparePassword('wrong', bcrypt5Hash)).toBe(false);
  });

  it('hashes in the $2b$ format at cost 10', () => {
    const hash = AuthService.hashPassword('p');
    expect(hash).toMatch(/^\$2b\$10\$[./A-Za-z0-9]{53}$/);
    expect(AuthService.comparePassword('p', hash)).toBe(true);
    expect(AuthService.comparePassword('q', hash)).toBe(false);
  });
});
