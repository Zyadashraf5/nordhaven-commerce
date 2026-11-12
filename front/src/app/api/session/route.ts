import { NextResponse } from 'next/server';
import { callBackend, clearSessionCookie, readSessionToken, relay } from '../../../lib/api/server';

/**
 * GET /api/session — who is signed in, from the backend's
 * `GET /api/v1/auth/principal`. Signed out (no cookie, or the backend says
 * 401) answers `{ authenticated: false }` and drops a stale cookie.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const token = await readSessionToken();
  if (!token) return NextResponse.json({ authenticated: false });

  const result = await callBackend('GET', 'auth/principal', { token });
  if (result.status === 401) {
    const response = NextResponse.json({ authenticated: false });
    clearSessionCookie(response);
    return response;
  }
  if (result.status !== 200) return relay(result);
  return NextResponse.json({ authenticated: true, principal: result.body });
}
