/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

/** Builds a JWT-shaped token whose payload expires `offsetSeconds` from now. */
function makeToken(offsetSeconds: number) {
  const payload = { exp: Math.floor(Date.now() / 1000) + offsetSeconds };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

function request(path: string, token?: string) {
  const req = new NextRequest(new URL(path, 'https://example.com'));
  if (token) {
    req.cookies.set('sb-access-token', token);
  }
  return req;
}

function locationOf(response: Response) {
  return response.headers.get('location');
}

function cspOf(response: Response) {
  return response.headers.get('content-security-policy') ?? '';
}

describe('proxy content security policy', () => {
  it('allows the inline scripts Next.js uses to hydrate the page', () => {
    // Without this the framework bootstrap is blocked, nothing hydrates, and
    // every page renders as a permanent skeleton.
    expect(cspOf(proxy(request('/home')))).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    );
  });

  it('keeps the policy on redirects, not just on rendered pages', () => {
    expect(cspOf(proxy(request('/backlog')))).toContain('default-src');
  });

  it('still locks down the dangerous directives', () => {
    const csp = cspOf(proxy(request('/home')));
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe('proxy auth gate', () => {
  it('redirects an anonymous visitor away from a protected route, preserving the destination', () => {
    const res = proxy(request('/backlog?tab=games'));

    // The query key must be `redirect` — the auth forms read that name, and an
    // unread key means the user silently loses their destination.
    expect(locationOf(res)).toBe(
      'https://example.com/auth/login?redirect=%2Fbacklog%3Ftab%3Dgames',
    );
  });

  it('lets a visitor with a live token through', () => {
    // Regression: the previous implementation asked @supabase/ssr to read
    // cookies this app never writes, so it reported every visitor as signed out
    // and bounced authenticated users off every protected route.
    const res = proxy(request('/backlog', makeToken(3600)));
    expect(locationOf(res)).toBeNull();
  });

  it('treats an expired token as signed out and clears it', () => {
    const res = proxy(request('/dashboard', makeToken(-60)));

    expect(locationOf(res)).toBe('https://example.com/auth/login?redirect=%2Fdashboard');
    // The cookie is httpOnly, so only the server can remove it. Leaving it in
    // place would keep this guard seeing a session that no longer works.
    const cleared = res.headers.getSetCookie().join(' ');
    expect(cleared).toContain('sb-access-token=');
  });

  it('leaves public routes alone', () => {
    expect(locationOf(proxy(request('/articles')))).toBeNull();
    expect(locationOf(proxy(request('/home')))).toBeNull();
  });

  it('leaves a signed-in visitor on /home instead of forcing the dashboard', () => {
    // AuthInit falls back to /home when it cannot establish a session. Redirecting
    // /home to /dashboard turns that fallback into an infinite bounce whenever the
    // cookie still looks valid but the client session cannot be restored.
    expect(locationOf(proxy(request('/home', makeToken(3600))))).toBeNull();
  });

  it.each([
    '/auth/login',
    '/auth/login?redirect=%2Fdashboard',
    '/auth/register',
    '/auth/confirm-email',
    '/auth/reset-password',
  ])('keeps %s reachable even when a session cookie is present', path => {
    // This cookie check and the client's session state can disagree — a revoked
    // token still parses and has not expired. Redirecting away from the login
    // form in that state locks the user out of the only way to recover.
    expect(locationOf(proxy(request(path, makeToken(3600))))).toBeNull();
  });

  it('treats an unparseable token as present rather than evicting the session', () => {
    expect(locationOf(proxy(request('/dashboard', 'not-a-jwt')))).toBeNull();
  });

  it('guards onboarding, which holds first-run profile data', () => {
    expect(locationOf(proxy(request('/onboarding')))).toBe(
      'https://example.com/auth/login?redirect=%2Fonboarding',
    );
  });
});
