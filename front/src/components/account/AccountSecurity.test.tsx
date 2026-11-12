import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { AccountSecurity, deviceName } from './AccountSecurity';

/**
 * Security screen (F06 Batch 4): real sessions from GET /auth/sessions, other
 * devices signed out one by one, password changed only when POST
 * /auth/password succeeds, the board's password rules kept, no "Verified" claim.
 */

const sessions = {
  sessions: [
    {
      id: 's-here',
      clientLabel: null,
      createdAt: '2026-10-23T08:00:00Z',
      lastUsedAt: '2026-10-24T08:00:00Z',
      expiresAt: '2026-11-23T08:00:00Z',
      current: true,
    },
    {
      id: 's-other',
      clientLabel:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36',
      createdAt: '2026-10-20T08:00:00Z',
      lastUsedAt: '2026-10-21T08:00:00Z',
      expiresAt: '2026-11-20T08:00:00Z',
      current: false,
    },
  ],
};

const fillValid = () => {
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'linen-oat-24' },
  });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'terracotta-9' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'terracotta-9' },
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountSecurity (live)', () => {
  it('lists the real sessions and makes no verification claim', async () => {
    installFetchMock({ 'GET /api/hc/auth/sessions': { body: sessions } });
    render(<AccountSecurity />);
    expect(await screen.findByText('Chrome on Android')).toBeInTheDocument();
    expect(screen.getByText('Browser not recorded')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });

  it("shows the board's rule errors on an empty change attempt and sends nothing", () => {
    const calls = installFetchMock({ 'GET /api/hc/auth/sessions': { body: sessions } });
    render(<AccountSecurity />);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByText('Enter a new password')).toBeInTheDocument();
    expect(screen.getByText('Enter your new password again')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('flags a new password that repeats the current one', () => {
    installFetchMock({ 'GET /api/hc/auth/sessions': { body: sessions } });
    render(<AccountSecurity />);
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'linen-oat-24' },
    });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'linen-oat-24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      screen.getByText('Your new password doesn’t meet the rules above yet'),
    ).toBeInTheDocument();
  });

  it('changes the password through POST /auth/password once, and says so only after success', async () => {
    const calls = installFetchMock({
      'GET /api/hc/auth/sessions': { body: sessions },
      'POST /api/hc/auth/password': { status: 204 },
    });
    render(<AccountSecurity />);
    fillValid();
    const button = screen.getByRole('button', { name: 'Change password' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      await screen.findByText('Your password was changed. Every other device was signed out.'),
    ).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({
      currentPassword: 'linen-oat-24',
      newPassword: 'terracotta-9',
    });
  });

  it('marks a wrong current password without claiming success', async () => {
    installFetchMock({
      'GET /api/hc/auth/sessions': { body: sessions },
      'POST /api/hc/auth/password': {
        status: 401,
        body: {
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          correlationId: 'c',
        },
      },
    });
    render(<AccountSecurity />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('That isn’t your current password')).toBeInTheDocument();
    expect(screen.queryByText(/was changed/)).not.toBeInTheDocument();
  });

  it('signs the other device out with DELETE /auth/sessions/{id}', async () => {
    const calls = installFetchMock({
      'GET /api/hc/auth/sessions': [
        { body: sessions },
        { body: { sessions: [sessions.sessions[0]] } },
      ],
      'DELETE /api/hc/auth/sessions/s-other': { status: 204 },
    });
    render(<AccountSecurity />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out of other devices' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out 1 device' }));
    expect(await screen.findByText('Signed out 1 other device')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('You’re only signed in on this device.')).toBeInTheDocument(),
    );
    expect(
      calls.some((c) => c.method === 'DELETE' && c.url === '/api/hc/auth/sessions/s-other'),
    ).toBe(true);
  });
});

describe('deviceName', () => {
  it('summarises a User-Agent label', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(deviceName(null)).toBe('Browser not recorded');
  });
});
