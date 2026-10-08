import { NextRequest } from 'next/server';
import { proxy } from './proxy';

// An AI client (Claude, ChatGPT, Cursor) sends its user to the consent screen
// with the whole OAuth request in the query. A signed-out visitor used to be
// sent to /auth with that query, and the request was lost; the screen now
// answers signed-out visitors itself, with a sign-in that comes back to it.
// Every other private page still sends a signed-out visitor to /auth.
const consent =
  'https://dash.sharek.app/oauth/authorize?client_id=pcd_abc&response_type=code&state=s1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=xyz&code_challenge_method=S256';

describe('proxy and the consent screen', () => {
  it('lets a signed-out visitor reach /oauth/authorize with its query intact', async () => {
    const response = await proxy(new NextRequest(consent));

    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('still sends a signed-out visitor of a private page to /auth', async () => {
    const response = await proxy(
      new NextRequest('https://dash.sharek.app/launches')
    );

    expect(response.headers.get('location')).toBe(
      'https://dash.sharek.app/auth'
    );
  });

  it('lets a signed-in visitor reach /oauth/authorize', async () => {
    const response = await proxy(
      new NextRequest(consent, { headers: { cookie: 'auth=jwt' } })
    );

    expect(response.headers.get('location')).toBeNull();
  });
});
