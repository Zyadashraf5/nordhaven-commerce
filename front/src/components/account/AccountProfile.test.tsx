import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../../test/api-mock';
import { AccountProfile } from './AccountProfile';

/**
 * Profile screen (F06): the name and mobile number are read from and saved to
 * /customers/me/profile; a failed save is shown as a failure; the email is the
 * read-only sign-in address and no "Verified" claim is made.
 */

const profile = {
  displayName: 'Nadia Tester',
  phone: '+20 100 000 0000',
  defaultAddressId: null,
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AccountProfile', () => {
  it('loads the profile from the API and keeps Save disabled until something changes', async () => {
    installFetchMock({ 'GET /api/hc/customers/me/profile': { body: profile } });
    render(<AccountProfile />);
    expect(await screen.findByLabelText('Full name')).toHaveValue('Nadia Tester');
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('100 000 0000');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
  });

  it('shows an unavailable state with retry when the API cannot be reached', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/profile': {
        status: 503,
        body: { statusCode: 503, code: 'BACKEND_UNAVAILABLE', message: 'x', correlationId: 'c' },
      },
    });
    render(<AccountProfile />);
    expect(await screen.findByText('We couldn’t load your profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('validates locally and sends nothing when a field is wrong', async () => {
    const calls = installFetchMock({ 'GET /api/hc/customers/me/profile': { body: profile } });
    render(<AccountProfile />);
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Enter your full name')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });

  it('rejects an invalid mobile number', async () => {
    installFetchMock({ 'GET /api/hc/customers/me/profile': { body: profile } });
    render(<AccountProfile />);
    fireEvent.change(await screen.findByLabelText(/Mobile number/), {
      target: { value: '0100 000 0000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      screen.getByText('Enter a 10-digit mobile number after +20, like 100 000 0000'),
    ).toBeInTheDocument();
  });

  it('saves through PATCH with the CSRF header and shows the stored result', async () => {
    const calls = installFetchMock({
      'GET /api/hc/customers/me/profile': { body: profile },
      'PATCH /api/hc/customers/me/profile': {
        body: { ...profile, displayName: 'Nadia T. Tester', phone: '+20 101 111 2222' },
      },
    });
    render(<AccountProfile />);
    fireEvent.change(await screen.findByLabelText('Full name'), {
      target: { value: 'Nadia T. Tester' },
    });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '101 111 2222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ displayName: 'Nadia T. Tester', phone: '+20 101 111 2222' });
    expect(patch?.headers['x-hc-request']).toBe('storefront');
    expect(screen.getByLabelText('Full name')).toHaveValue('Nadia T. Tester');
  });

  it('does not claim success when the API refuses the save', async () => {
    installFetchMock({
      'GET /api/hc/customers/me/profile': { body: profile },
      'PATCH /api/hc/customers/me/profile': {
        status: 400,
        body: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          correlationId: 'c',
        },
      },
    });
    render(<AccountProfile />);
    fireEvent.change(await screen.findByLabelText('Full name'), {
      target: { value: 'Someone Else' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Request validation failed')).toBeInTheDocument();
    expect(screen.queryByText('Profile saved')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled(),
    );
  });

  it('discards unsaved edits', async () => {
    installFetchMock({ 'GET /api/hc/customers/me/profile': { body: profile } });
    render(<AccountProfile />);
    fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Nadia Tester');
  });
});
