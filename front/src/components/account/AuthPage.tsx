'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { validateEmail, authPasswordRules } from '../../lib/account-validation';
import { api, errorBody, errorMessage, sessionAction } from '../../lib/api/browser';
import type {
  ChallengeCredential,
  MfaEnrollment,
  MfaEnrollmentConfirmation,
  SignInResult,
} from '../../lib/api/auth-types';
import { useOptionalSession } from '../providers/SessionProvider';
import { Icon } from '../ui/Icon';
import styles from './AuthPage.module.css';

/**
 * The account-access screens (Stage 3 "Sign in / account access" boards),
 * connected to the backend identity operations (F06):
 *
 *   Sign in            POST /api/v1/auth/login            (via /api/session/sign-in)
 *   Verify (MFA)       POST /api/v1/auth/login/mfa
 *   Set up MFA         POST /api/v1/auth/login/mfa/enrollment
 *                      POST /api/v1/auth/login/mfa/enrollment/confirmation
 *   Create an account  POST /api/v1/auth/register, then sign-in, then
 *                      PATCH /api/v1/customers/me/profile (display name)
 *   Reset password     POST /api/v1/auth/password-reset/requests
 *
 * The session credential is held in an httpOnly cookie by the route
 * handlers; this page never sees it. Administrators cannot skip MFA: the
 * backend issues no session until the second factor is verified.
 */

export type AuthScreen = 'signin' | 'register' | 'forgot';
type Screen = AuthScreen | 'mfa' | 'enroll' | 'recovery';

const ART: Record<
  AuthScreen,
  { eyebrow: string; text: string; src: string; width: number; height: number }
> = {
  signin: {
    eyebrow: 'Your account',
    text: 'Orders, pre-orders, returns and your wishlist — together in one place.',
    src: '/images/auth-signin-desk.webp',
    width: 1350,
    height: 1080,
  },
  register: {
    eyebrow: 'New here',
    text: 'Save what you love and follow every order from checkout to your door.',
    src: '/images/auth-register-desk.webp',
    width: 1350,
    height: 900,
  },
  forgot: {
    eyebrow: 'Your account',
    text: 'Orders, pre-orders, returns and your wishlist — together in one place.',
    src: '/images/auth-signin-desk.webp',
    width: 1350,
    height: 1080,
  },
};

interface Errors {
  email?: string | undefined;
  pw?: string | undefined;
  first?: string | undefined;
  last?: string | undefined;
  regEmail?: string | undefined;
  regPw?: string | undefined;
  regPw2?: string | undefined;
  terms?: string | undefined;
  forgotEmail?: string | undefined;
  code?: string | undefined;
}

/** Only same-origin paths are accepted as a return target. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/api/'))
    return null;
  return next;
}

export function AuthPage({
  initialScreen = 'signin',
  next,
}: {
  initialScreen?: AuthScreen;
  /** Where to return after signing in (same-origin path). */
  next?: string | undefined;
}) {
  const router = useRouter();
  const session = useOptionalSession();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [values, setValues] = useState({
    email: '',
    pw: '',
    showPw: false,
    first: '',
    last: '',
    regEmail: '',
    regPw: '',
    regPw2: '',
    showRegPw: false,
    terms: false,
    forgotEmail: '',
    code: '',
    useRecovery: false,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeCredential | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const set = (
    key:
      | 'email'
      | 'pw'
      | 'first'
      | 'last'
      | 'regEmail'
      | 'regPw'
      | 'regPw2'
      | 'forgotEmail'
      | 'code',
    value: string,
  ): void => setValues((prev) => ({ ...prev, [key]: value }));

  const go = (to: Screen): void => {
    setScreen(to);
    setErrors({});
    setTried(false);
    setFailure(null);
    setNotice(null);
  };

  const art = ART[screen === 'register' ? 'register' : screen === 'forgot' ? 'forgot' : 'signin'];

  /** Signed in: refresh the shared session and leave for the right place. */
  const finish = async (role: string | undefined): Promise<void> => {
    await session?.refresh();
    router.replace(safeNext(next) ?? (role === 'ADMIN' ? '/admin' : '/account'));
    router.refresh();
  };

  const handleSignIn = async (email: string, password: string): Promise<void> => {
    const result = await sessionAction<SignInResult>('sign-in', { email: email.trim(), password });
    if (result.status === 'AUTHENTICATED') {
      await finish(result.user?.role);
      return;
    }
    if (!result.challenge) throw new Error('missing challenge');
    setChallenge(result.challenge);
    if (result.status === 'MFA_REQUIRED') {
      go('mfa');
      return;
    }
    // MFA_ENROLLMENT_REQUIRED: start enrolment straight away.
    const started = await sessionAction<MfaEnrollment>('mfa-enrollment', {
      challengeToken: result.challenge.token,
    });
    setEnrollment(started);
    go('enroll');
  };

  const run = async (work: () => Promise<void>, fallback: string): Promise<void> => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      const body = errorBody(error);
      setFailure(body?.statusCode === 401 ? fallback : errorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  const submitSignin = (): void => {
    const nextErrors: Errors = {
      email: validateEmail(values.email) ?? undefined,
      pw: values.pw === '' ? 'Enter your password' : undefined,
    };
    if (nextErrors.email !== undefined || nextErrors.pw !== undefined) {
      setErrors(nextErrors);
      setTried(true);
      return;
    }
    setErrors({});
    void run(
      () => handleSignIn(values.email, values.pw),
      'That email and password don’t match an account. Check them and try again.',
    );
  };

  const submitRegister = (): void => {
    const rules = authPasswordRules(values.regPw, values.regEmail);
    const nextErrors: Errors = {
      first: values.first.trim() === '' ? 'Enter your first name' : undefined,
      last: values.last.trim() === '' ? 'Enter your last name' : undefined,
      regEmail: validateEmail(values.regEmail) ?? undefined,
      regPw:
        values.regPw === ''
          ? 'Enter a password'
          : rules.every((rule) => rule.ok)
            ? undefined
            : 'Your password doesn’t meet the requirements yet',
      regPw2:
        values.regPw2 === ''
          ? 'Confirm your password'
          : values.regPw2 !== values.regPw
            ? 'The passwords don’t match'
            : undefined,
      terms: values.terms ? undefined : 'Please agree to the Terms of sale',
    };
    if (Object.values(nextErrors).some((v) => v !== undefined)) {
      setErrors(nextErrors);
      setTried(true);
      return;
    }
    setErrors({});
    void run(async () => {
      try {
        await sessionAction('register', { email: values.regEmail.trim(), password: values.regPw });
      } catch (error) {
        if (errorBody(error)?.statusCode === 409) {
          throw new Error('exists');
        }
        throw error;
      }
      const signedIn = await sessionAction<SignInResult>('sign-in', {
        email: values.regEmail.trim(),
        password: values.regPw,
      });
      if (signedIn.status !== 'AUTHENTICATED') {
        go('signin');
        return;
      }
      // The display name lives on the customer profile, not the account.
      try {
        await api.patch('customers/me/profile', {
          displayName: `${values.first.trim()} ${values.last.trim()}`,
        });
      } catch {
        /* The account exists; the name can be added later in Profile. */
      }
      await finish(signedIn.user?.role);
    }, 'We couldn’t create that account. If you already have one, sign in instead.');
  };

  const submitForgot = (): void => {
    const emailError = validateEmail(values.forgotEmail);
    if (emailError !== null) {
      setErrors({ forgotEmail: emailError });
      setTried(true);
      return;
    }
    setErrors({});
    void run(async () => {
      await sessionAction('password-reset', { email: values.forgotEmail.trim() });
      // The backend answers ACCEPTED whether or not the address has an account.
      setNotice(
        'If an account uses that address, a link to choose a new password is on its way. It expires soon, so use it promptly.',
      );
    }, 'We couldn’t start a password reset. Please try again.');
  };

  const submitMfa = (): void => {
    const code = values.code.replace(/\s+/g, '');
    if (code === '' || (!values.useRecovery && !/^[0-9]{6}$/.test(code))) {
      setErrors({ code: values.useRecovery ? 'Enter a recovery code' : 'Enter the 6-digit code' });
      setTried(true);
      return;
    }
    if (!challenge) {
      go('signin');
      return;
    }
    setErrors({});
    void run(async () => {
      const result = await sessionAction<{ user?: { role?: string } }>('mfa', {
        challengeToken: challenge.token,
        ...(values.useRecovery ? { recoveryCode: code } : { code }),
      });
      await finish(result.user?.role);
    }, 'That code didn’t work. Check your authenticator app and try again.');
  };

  const submitEnroll = (): void => {
    const code = values.code.replace(/\s+/g, '');
    if (!/^[0-9]{6}$/.test(code)) {
      setErrors({ code: 'Enter the 6-digit code from your authenticator app' });
      setTried(true);
      return;
    }
    if (!challenge) {
      go('signin');
      return;
    }
    setErrors({});
    void run(async () => {
      const confirmed = await sessionAction<MfaEnrollmentConfirmation>(
        'mfa-enrollment-confirmation',
        {
          challengeToken: challenge.token,
          code,
        },
      );
      setRecoveryCodes(confirmed.recoveryCodes);
      setValues((prev) => ({ ...prev, code: '' }));
      go('recovery');
    }, 'That code didn’t work. Check the time on your device and try again.');
  };

  /** After enrolment the account signs in again and verifies the new factor. */
  const continueAfterRecovery = (): void => {
    void run(
      () => handleSignIn(values.email, values.pw),
      'Please sign in again to finish setting up two-step verification.',
    );
  };

  const pwRules = authPasswordRules(values.regPw, values.regEmail);
  const err = (key: keyof Errors): string | undefined => {
    if (tried && errors[key] !== undefined) return errors[key];
    return undefined;
  };

  const fieldClass = (key: keyof Errors): string =>
    `${styles.input} ${err(key) !== undefined ? styles.inputInvalid : ''}`;

  const errorLine = (key: keyof Errors): ReactNode | null =>
    err(key) !== undefined ? (
      <span className={styles.fieldError}>
        <Icon name="alert" size={14} strokeWidth={2.4} stroke="#a1362b" />
        {errors[key]}
      </span>
    ) : null;

  const failureNote =
    failure !== null ? (
      <div role="alert" className={styles.resultNote}>
        <Icon name="alert" size={18} strokeWidth={2} stroke="#a1362b" />
        <span>{failure}</span>
      </div>
    ) : null;

  const signedInPrincipal = session?.principal ?? null;

  return (
    <div className={styles.main}>
      <section aria-label="Account access" className={styles.formCol}>
        {signedInPrincipal && (screen === 'signin' || screen === 'register') ? (
          <>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                You’re signed in
              </h1>
              <p className={styles.intro}>
                Signed in as <strong>{signedInPrincipal.user.email}</strong>.
              </p>
            </div>
            <div className={styles.form}>
              <Link
                href={signedInPrincipal.role === 'ADMIN' ? '/admin' : '/account'}
                className={styles.primary}
              >
                {signedInPrincipal.role === 'ADMIN' ? 'Go to admin' : 'Go to my account'}
              </Link>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => void session?.signOut()}
              >
                Sign out
              </button>
            </div>
          </>
        ) : null}

        {screen === 'signin' && !signedInPrincipal ? (
          <>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Sign in
              </h1>
              <p className={styles.intro}>
                Welcome back. Sign in to see your orders, wishlist and saved addresses.
              </p>
            </div>
            {failureNote}
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitSignin();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="si-email">
                  Email address
                </label>
                <input
                  id="si-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  spellCheck={false}
                  className={fieldClass('email')}
                  value={values.email}
                  aria-invalid={err('email') !== undefined}
                  onChange={(event) => set('email', event.target.value)}
                />
                {errorLine('email')}
              </div>
              <div className={styles.fieldStack}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="si-pw">
                    Password
                  </label>
                  <div className={styles.passwordWrap}>
                    <input
                      id="si-pw"
                      type={values.showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      className={fieldClass('pw')}
                      value={values.pw}
                      aria-invalid={err('pw') !== undefined}
                      onChange={(event) => set('pw', event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.showToggle}
                      aria-pressed={values.showPw}
                      aria-controls="si-pw"
                      onClick={() => setValues((prev) => ({ ...prev, showPw: !prev.showPw }))}
                    >
                      {values.showPw ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {errorLine('pw')}
                </div>
                <button type="button" className={styles.linkBtn} onClick={() => go('forgot')}>
                  Forgot password?
                </button>
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className={styles.swapRow}>
              New to Nordhaven?{' '}
              <button type="button" className={styles.swapLink} onClick={() => go('register')}>
                Create an account
              </button>
            </p>
          </>
        ) : null}

        {screen === 'mfa' ? (
          <>
            <button type="button" className={styles.backLink} onClick={() => go('signin')}>
              <Icon name="chevron-left" size={16} strokeWidth={2.2} />
              Back to sign in
            </button>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Two-step verification
              </h1>
              <p className={styles.intro}>
                {values.useRecovery
                  ? 'Enter one of the recovery codes you saved when you set up two-step verification.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
            </div>
            {failureNote}
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitMfa();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mfa-code">
                  {values.useRecovery ? 'Recovery code' : 'Verification code'}
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode={values.useRecovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  spellCheck={false}
                  className={fieldClass('code')}
                  value={values.code}
                  aria-invalid={err('code') !== undefined}
                  onChange={(event) => set('code', event.target.value)}
                />
                {errorLine('code')}
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Verifying…' : 'Verify and sign in'}
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() =>
                  setValues((prev) => ({ ...prev, useRecovery: !prev.useRecovery, code: '' }))
                }
              >
                {values.useRecovery
                  ? 'Use my authenticator app instead'
                  : 'Use a recovery code instead'}
              </button>
            </form>
          </>
        ) : null}

        {screen === 'enroll' && enrollment ? (
          <>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Set up two-step verification
              </h1>
              <p className={styles.intro}>
                Administrator accounts need a second step at every sign-in. Add this account to an
                authenticator app, then enter the 6-digit code it shows.
              </p>
            </div>
            {failureNote}
            <div className={styles.field}>
              <span className={styles.label}>Setup key</span>
              <code
                className={styles.input}
                style={{ display: 'flex', alignItems: 'center', wordBreak: 'break-all' }}
              >
                {enrollment.secret}
              </code>
              <span className={styles.help}>
                {enrollment.issuer} · {enrollment.digits} digits · every {enrollment.period} seconds
                · <a href={enrollment.otpauthUri}>open in an authenticator app</a>
              </span>
            </div>
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitEnroll();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="enroll-code">
                  Code from your app
                </label>
                <input
                  id="enroll-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={fieldClass('code')}
                  value={values.code}
                  aria-invalid={err('code') !== undefined}
                  onChange={(event) => set('code', event.target.value)}
                />
                {errorLine('code')}
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Checking…' : 'Confirm'}
              </button>
            </form>
          </>
        ) : null}

        {screen === 'recovery' ? (
          <>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Save your recovery codes
              </h1>
              <p className={styles.intro}>
                Two-step verification is on. Each code below works once if you lose your
                authenticator app. They won’t be shown again — store them somewhere safe.
              </p>
            </div>
            {failureNote}
            <ul className={styles.rules} aria-label="Recovery codes">
              {recoveryCodes.map((code) => (
                <li key={code} className={styles.ruleOk}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={continueAfterRecovery}
            >
              {busy ? 'Signing in…' : 'I’ve saved them — continue'}
            </button>
          </>
        ) : null}

        {screen === 'register' && !signedInPrincipal ? (
          <>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Create an account
              </h1>
              <p className={styles.intro}>
                Track orders and pre-orders, request returns and keep a wishlist — all in one place.
              </p>
            </div>
            {failureNote}
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitRegister();
              }}
            >
              <div className={styles.twoCol}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rg-first">
                    First name
                  </label>
                  <input
                    id="rg-first"
                    type="text"
                    autoComplete="given-name"
                    className={fieldClass('first')}
                    value={values.first}
                    aria-invalid={err('first') !== undefined}
                    onChange={(event) => set('first', event.target.value)}
                  />
                  {errorLine('first')}
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="rg-last">
                    Last name
                  </label>
                  <input
                    id="rg-last"
                    type="text"
                    autoComplete="family-name"
                    className={fieldClass('last')}
                    value={values.last}
                    aria-invalid={err('last') !== undefined}
                    onChange={(event) => set('last', event.target.value)}
                  />
                  {errorLine('last')}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rg-email">
                  Email address
                </label>
                <input
                  id="rg-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className={fieldClass('regEmail')}
                  value={values.regEmail}
                  aria-invalid={err('regEmail') !== undefined}
                  onChange={(event) => set('regEmail', event.target.value)}
                />
                {errorLine('regEmail')}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rg-pw">
                  Password
                </label>
                <div className={styles.passwordWrap}>
                  <input
                    id="rg-pw"
                    type={values.showRegPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={fieldClass('regPw')}
                    value={values.regPw}
                    aria-invalid={err('regPw') !== undefined}
                    aria-describedby="rg-pw-rules"
                    onChange={(event) => set('regPw', event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.showToggle}
                    aria-pressed={values.showRegPw}
                    aria-controls="rg-pw"
                    onClick={() => setValues((prev) => ({ ...prev, showRegPw: !prev.showRegPw }))}
                  >
                    {values.showRegPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {errorLine('regPw')}
                <ul id="rg-pw-rules" aria-label="Password requirements" className={styles.rules}>
                  {pwRules.map((rule) => (
                    <li key={rule.label} className={rule.ok ? styles.ruleOk : styles.ruleTodo}>
                      <span className={styles.ruleMark} aria-hidden="true">
                        {rule.ok ? '✓' : ''}
                      </span>
                      {rule.label}
                      <span className="hw-visually-hidden">
                        {rule.ok ? ' (met)' : ' (not met yet)'}
                      </span>
                    </li>
                  ))}
                </ul>
                <span className={styles.help} aria-live="polite">
                  {pwRules.filter((r) => r.ok).length} of {pwRules.length} requirements met
                </span>
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="rg-pw2">
                  Confirm password
                </label>
                <input
                  id="rg-pw2"
                  type={values.showRegPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={fieldClass('regPw2')}
                  value={values.regPw2}
                  aria-invalid={err('regPw2') !== undefined}
                  onChange={(event) => set('regPw2', event.target.value)}
                />
                {errorLine('regPw2')}
              </div>
              <div className={styles.checkStack}>
                <label className={styles.checkRow} htmlFor="rg-terms">
                  <input
                    id="rg-terms"
                    type="checkbox"
                    checked={values.terms}
                    onChange={(event) => {
                      setErrors({});
                      setValues((prev) => ({ ...prev, terms: event.target.checked }));
                    }}
                  />
                  <span>
                    I agree to the <strong>Terms of sale</strong> and{' '}
                    <strong>Privacy policy</strong>
                  </span>
                </label>
                {errorLine('terms')}
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Creating your account…' : 'Create account'}
              </button>
            </form>
            <p className={styles.swapRow}>
              Already have an account?{' '}
              <button type="button" className={styles.swapLink} onClick={() => go('signin')}>
                Sign in
              </button>
            </p>
          </>
        ) : null}

        {screen === 'forgot' ? (
          <>
            <button type="button" className={styles.backLink} onClick={() => go('signin')}>
              <Icon name="chevron-left" size={16} strokeWidth={2.2} />
              Back to sign in
            </button>
            <div className={styles.headRow}>
              <h1 className={styles.headline} data-intro data-split="words">
                Reset your password
              </h1>
              <p className={styles.intro}>
                Enter the email address you use for your account and we’ll send you a link to choose
                a new password.
              </p>
            </div>
            {failureNote}
            {notice !== null ? (
              <div role="status" className={styles.resultNote}>
                <Icon name="check" size={18} strokeWidth={2} />
                <span>{notice}</span>
              </div>
            ) : null}
            <form
              className={styles.form}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submitForgot();
              }}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="fg-email">
                  Email address
                </label>
                <input
                  id="fg-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className={fieldClass('forgotEmail')}
                  value={values.forgotEmail}
                  aria-invalid={err('forgotEmail') !== undefined}
                  onChange={(event) => set('forgotEmail', event.target.value)}
                />
                {errorLine('forgotEmail')}
              </div>
              <button type="submit" className={styles.primary} disabled={busy || notice !== null}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        ) : null}
      </section>

      <div className={styles.art} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.src} alt="" width={art.width} height={art.height} />
        <div className={styles.artCaption}>
          <span className={styles.artEyebrow}>{art.eyebrow}</span>
          <span className={styles.artText}>{art.text}</span>
        </div>
      </div>
    </div>
  );
}
