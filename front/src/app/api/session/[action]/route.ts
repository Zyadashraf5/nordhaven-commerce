import { NextResponse } from 'next/server';
import {
  callBackend,
  clearSessionCookie,
  hasCsrfHeader,
  localError,
  readSessionToken,
  relay,
  setSessionCookie,
} from '../../../../lib/api/server';

/**
 * POST /api/session/{action} — the account-access flows, one-to-one with the
 * backend's identity operations (openapi.json):
 *
 *   sign-in                      POST /api/v1/auth/login
 *   mfa                          POST /api/v1/auth/login/mfa
 *   mfa-enrollment               POST /api/v1/auth/login/mfa/enrollment
 *   mfa-enrollment-confirmation  POST /api/v1/auth/login/mfa/enrollment/confirmation
 *   register                     POST /api/v1/auth/register
 *   password-reset               POST /api/v1/auth/password-reset/requests
 *   password-reset-confirmation  POST /api/v1/auth/password-reset/confirmations
 *   sign-out                     DELETE /api/v1/auth/sessions/current
 *
 * The session credential returned by sign-in / MFA is moved into the httpOnly
 * cookie and stripped from the response. MFA challenge tokens are returned to
 * the page: they are short-lived, purpose-bound and grant no session.
 */
export const dynamic = 'force-dynamic';

const PASSTHROUGH: Record<string, string> = {
  'mfa-enrollment': 'auth/login/mfa/enrollment',
  'mfa-enrollment-confirmation': 'auth/login/mfa/enrollment/confirmation',
  register: 'auth/register',
  'password-reset': 'auth/password-reset/requests',
  'password-reset-confirmation': 'auth/password-reset/confirmations',
};

interface SignInBody {
  status?: string;
  session?: { token: string; expiresAt: string };
  challenge?: unknown;
  user?: unknown;
}

interface SessionBody {
  token?: string;
  expiresAt?: string;
  user?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
): Promise<NextResponse> {
  if (!hasCsrfHeader(request)) {
    return localError(403, 'CSRF_HEADER_REQUIRED', 'This request must come from the storefront.');
  }
  const { action } = await params;
  const raw = action === 'sign-out' ? undefined : await request.text();
  // The backend labels each session from the User-Agent ("Signed-in devices");
  // pass the browser's, not this server's.
  const agent = request.headers.get('user-agent');
  const headers: Record<string, string> = agent ? { 'user-agent': agent } : {};

  if (action === 'sign-in') {
    const result = await callBackend('POST', 'auth/login', { body: raw, headers });
    if (result.status !== 200) return relay(result);
    const body = result.body as SignInBody;
    if (body.status === 'AUTHENTICATED' && body.session) {
      const response = NextResponse.json({ status: body.status, user: body.user });
      setSessionCookie(response, body.session.token, body.session.expiresAt);
      return response;
    }
    // MFA_REQUIRED / MFA_ENROLLMENT_REQUIRED: no session yet.
    return NextResponse.json({ status: body.status, challenge: body.challenge, user: body.user });
  }

  if (action === 'mfa') {
    const result = await callBackend('POST', 'auth/login/mfa', { body: raw, headers });
    if (result.status !== 201) return relay(result);
    const body = result.body as SessionBody;
    if (!body.token || !body.expiresAt) {
      return localError(502, 'UNEXPECTED_RESPONSE', 'The store returned an unexpected response.');
    }
    const response = NextResponse.json({ status: 'AUTHENTICATED', user: body.user });
    setSessionCookie(response, body.token, body.expiresAt);
    return response;
  }

  if (action === 'sign-out') {
    const token = await readSessionToken();
    const result = token ? await callBackend('DELETE', 'auth/sessions/current', { token }) : null;
    // The local cookie goes either way; report what the backend said.
    const response = new NextResponse(null, { status: 204 });
    clearSessionCookie(response);
    if (result && result.status >= 500) {
      const failed = relay(result);
      clearSessionCookie(failed);
      return failed;
    }
    return response;
  }

  const target = PASSTHROUGH[action];
  if (!target) return localError(404, 'NOT_FOUND', 'Unknown account action.');
  return relay(await callBackend('POST', target, { body: raw, headers }));
}
