import { brandEmailLinks, renderBrandedEmail } from './email.html';

describe('brandEmailLinks', () => {
  it('inlines the brand style on plain anchors', () => {
    const result = brandEmailLinks(
      'Click <a href="https://dash.sharek.app/auth/activate/abc">here</a> to activate your account'
    );
    expect(result).toBe(
      'Click <a style="color:#B92D43;font-weight:600;" href="https://dash.sharek.app/auth/activate/abc">here</a> to activate your account'
    );
  });

  it('keeps anchors that already carry a style attribute', () => {
    const html = 'See <a style="color:#000;" href="https://sharek.app">this</a>';
    expect(brandEmailLinks(html)).toBe(html);
  });

  it('linkifies bare URLs and styles them', () => {
    const result = brandEmailLinks(
      'Your post has been published on X at https://x.com/i/status/123'
    );
    expect(result).toBe(
      'Your post has been published on X at <a style="color:#B92D43;font-weight:600;" href="https://x.com/i/status/123">https://x.com/i/status/123</a>'
    );
  });

  it('does not re-wrap URLs already inside an anchor', () => {
    const result = brandEmailLinks(
      '<a href="https://sharek.app/a">https://sharek.app/a</a>'
    );
    expect(result.match(/<a /g)).toHaveLength(1);
    expect(result.match(/href=/g)).toHaveLength(1);
  });

  it('keeps trailing punctuation out of linkified URLs', () => {
    const result = brandEmailLinks('Visit https://sharek.app.');
    expect(result).toBe(
      'Visit <a style="color:#B92D43;font-weight:600;" href="https://sharek.app">https://sharek.app</a>.'
    );
  });
});

describe('renderBrandedEmail', () => {
  const frontendUrl = 'https://dash.sharek.app';
  const render = (subject: string, body: string) =>
    renderBrandedEmail(subject, body, frontendUrl);

  it('renders the subject as the card heading', () => {
    const result = render('Activate your account', 'body');
    expect(result).toContain('>Activate your account</h1>');
  });

  it('escapes HTML in the subject', () => {
    const result = render('We couldn\'t post to <b>X</b>', 'body');
    expect(result).not.toContain('<b>X</b>');
    expect(result).toContain('&lt;b&gt;X&lt;/b&gt;');
  });

  it('keeps the body HTML and brands its links', () => {
    const result = render(
      'Reset your password',
      'Click <a href="https://dash.sharek.app/auth/forgot/t">here</a> to reset'
    );
    expect(result).toContain(
      '<a style="color:#B92D43;font-weight:600;" href="https://dash.sharek.app/auth/forgot/t">here</a>'
    );
  });

  it('links the lockup image from the frontend url above the card', () => {
    const result = render('s', 'b');
    expect(result).toContain(`src="${frontendUrl}/email-logo.png"`);
    expect(result).toContain(`<a href="${frontendUrl}"`);
  });

  it('links notification preferences to the settings page', () => {
    const result = render('s', 'b');
    expect(result).toContain(`href="${frontendUrl}/settings"`);
  });

  it('centers with email-safe attributes, not flex', () => {
    const result = render('s', 'b');
    expect(result).toContain('align="center"');
    expect(result).toContain('margin:0 auto');
    expect(result).not.toContain('display: flex');
    expect(result).not.toContain('justify-content');
  });

  it('imports IBM Plex Sans for clients that honor style blocks', () => {
    const result = render('s', 'b');
    expect(result).toContain('@import url(');
    expect(result).toContain('IBM+Plex+Sans');
  });

  it('closes with the copyright of the current year and the disclaimer', () => {
    const result = render('s', 'b');
    expect(result).toContain(`&copy; ${new Date().getFullYear()} Sharek`);
    expect(result).toContain('You&rsquo;re receiving this email');
  });
});
