import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';

/**
 * F06 contract for the account-access screens:
 *  - local validation runs before anything is sent;
 *  - sign-in, MFA, enrolment, register and reset go to the storefront's
 *    /api/session/* handlers (which call the backend identity API) with the
 *    CSRF header, and the page never handles a session token;
 *  - a failed call is shown as a failure, never as success.
 */

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

type Reply = { status: number; body?: unknown };
let replies: Record<string, Reply[]> = {};
const calls: Array<{ url: string; init: RequestInit }> = [];

function reply(url: string, status: number, body?: unknown): void {
  (replies[url] ??= []).push({ status, body });
}

beforeEach(() => {
  replies = {};
  calls.length = 0;
  replace.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = replies[url]?.shift() ?? {
        status: 500,
        body: { code: 'X', message: 'unmocked' },
      };
      return Promise.resolve(
        new Response(next.body === undefined ? null : JSON.stringify(next.body), {
          status: next.status,
        }),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fillSignIn(email = 'f06.customer@example.test', password = 'a-long-password-1') {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('AuthPage — sign in', () => {
  it('shows field errors for an empty submit and sends nothing', () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('signs in through /api/session/sign-in and returns to the requested page', async () => {
    reply('/api/session/sign-in', 200, { status: 'AUTHENTICATED', user: { role: 'CUSTOMER' } });
    render(<AuthPage next="/cart" />);
    fillSignIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/cart'));
    const init = calls[0]!.init;
    expect((init.headers as Record<string, string>)['x-hc-request']).toBe('storefront');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'f06.customer@example.test',
      password: 'a-long-password-1',
    });
  });

  it('ignores an off-site return target', async () => {
    reply('/api/session/sign-in', 200, { status: 'AUTHENTICATED', user: { role: 'CUSTOMER' } });
    render(<AuthPage next="//evil.example/steal" />);
    fillSignIn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/account'));
  });

  it('shows the backend refusal and does not navigate', async () => {
    reply('/api/session/sign-in', 401, {
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
      correlationId: 'c',
    });
    render(<AuthPage />);
    fillSignIn();
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match an account');
    expect(replace).not.toHaveBeenCalled();
  });

  it('requires the second factor when the backend asks for MFA', async () => {
    reply('/api/session/sign-in', 200, {
      status: 'MFA_REQUIRED',
      challenge: {
        token: 'challenge-1',
        purpose: 'MFA_VERIFICATION',
        expiresAt: '2030-01-01T00:00:00Z',
      },
    });
    reply('/api/session/mfa', 200, { status: 'AUTHENTICATED', user: { role: 'ADMIN' } });
    render(<AuthPage />);
    fillSignIn('f06.admin@example.test');
    expect(
      await screen.findByRole('heading', { name: 'Two-step verification' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
    const mfaCall = calls.find((call) => call.url === '/api/session/mfa')!;
    expect(JSON.parse(mfaCall.init.body as string)).toEqual({
      challengeToken: 'challenge-1',
      code: '123456',
    });
  });

  it('starts MFA enrolment for an administrator who has none', async () => {
    reply('/api/session/sign-in', 200, {
      status: 'MFA_ENROLLMENT_REQUIRED',
      challenge: { token: 'enrol-1', purpose: 'MFA_ENROLLMENT', expiresAt: '2030-01-01T00:00:00Z' },
    });
    reply('/api/session/mfa-enrollment', 200, {
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      issuer: 'Nordhaven Commerce',
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/x',
      expiresAt: '2030-01-01T00:00:00Z',
    });
    render(<AuthPage />);
    fillSignIn('f06.admin@example.test');
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('AuthPage — register and reset', () => {
  it('shows the register rules and terms check from a deep-linked screen', () => {
    render(<AuthPage initialScreen="register" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter your first name')).toBeInTheDocument();
    expect(screen.getAllByText('At least 12 characters').length).toBeGreaterThan(0);
    expect(screen.getByText('Please agree to the Terms of sale')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('switches between sign in, register and forgot in place', () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  });

  it('requests a reset and words the result without confirming the account exists', async () => {
    reply('/api/session/password-reset', 202, { status: 'ACCEPTED' });
    render(<AuthPage initialScreen="forgot" />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'someone@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('If an account uses that address');
  });
});
