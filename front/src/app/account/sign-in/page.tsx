import type { Metadata } from 'next';
import { ShopShell } from '../../../components/layout/ShopShell';
import { AuthPage, type AuthScreen } from '../../../components/account/AuthPage';

/**
 * Sign in / account access (`/account/sign-in`, Stage 3 auth boards). The
 * sign-in, register and reset screens are switchable in place and via
 * `?screen=`, and talk to the backend identity API (F06). `?next=` is the
 * same-origin page to return to afterwards.
 */

export const metadata: Metadata = {
  title: 'Sign in — Nordhaven Commerce',
  description: 'Sign in, create an account or reset your password.',
};

export default async function SignInRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = params.screen;
  const initialScreen: AuthScreen =
    (Array.isArray(requested) ? requested[0] : requested) === 'register'
      ? 'register'
      : requested === 'forgot'
        ? 'forgot'
        : 'signin';

  const nextParam = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <ShopShell>
      <AuthPage initialScreen={initialScreen} next={nextParam} />
    </ShopShell>
  );
}
