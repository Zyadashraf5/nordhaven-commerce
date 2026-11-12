/* eslint-disable @typescript-eslint/unbound-method -- the fake ExecutionContext intentionally hands prototype methods over as plain values. */
import { ServiceUnavailableException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApplicationAvailabilityService } from '../availability/application-availability.service';
import { AvailabilityGuard } from '../availability/availability.guard';
import { AppError } from '../http/app-error';
import { Public, Roles } from './access.decorators';
import {
  getAuthenticatedPrincipal,
  setAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
  type SessionAuthenticator,
} from './principal';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';

class AnonymouslyReachable {
  @Public()
  public handle(): boolean {
    return true;
  }
}

class RequiresSession {
  public handle(): boolean {
    return true;
  }
}

class AdministrativeOnly {
  @Roles('ADMIN')
  public handle(): boolean {
    return true;
  }
}

interface RequestStub {
  headers: Record<string, string | undefined>;
}

function createContext(
  request: RequestStub,
  handler: () => boolean,
  controller: new () => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

const adminPrincipal: AuthenticatedPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'ADMIN',
  sessionId: '22222222-2222-4222-8222-222222222222',
  sessionExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

describe('AvailabilityGuard', () => {
  it('keeps public probes reachable while the instance is not ready', () => {
    const guard = new AvailabilityGuard(new Reflector(), new ApplicationAvailabilityService());
    const context = createContext(
      { headers: {} },
      AnonymouslyReachable.prototype.handle,
      AnonymouslyReachable,
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('fails a business route closed before authentication is evaluated', () => {
    const guard = new AvailabilityGuard(new Reflector(), new ApplicationAvailabilityService());
    const context = createContext(
      { headers: {} },
      RequiresSession.prototype.handle,
      RequiresSession,
    );
    expect(() => guard.canActivate(context)).toThrow(ServiceUnavailableException);
  });

  it('allows a business route once the instance is ready', () => {
    const availability = new ApplicationAvailabilityService();
    availability.markReady();
    const guard = new AvailabilityGuard(new Reflector(), availability);
    const context = createContext(
      { headers: {} },
      RequiresSession.prototype.handle,
      RequiresSession,
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});

describe('SessionAuthGuard', () => {
  const reflector = new Reflector();

  it('bypasses authentication for an anonymous route', async () => {
    const authenticate = jest.fn();
    const guard = new SessionAuthGuard(reflector, { authenticate } as SessionAuthenticator);
    const context = createContext(
      { headers: {} },
      AnonymouslyReachable.prototype.handle,
      AnonymouslyReachable,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  const rejectedHeaders: { label: string; headers: Record<string, string> }[] = [
    { label: 'a missing credential', headers: {} },
    { label: 'a non-bearer credential', headers: { authorization: 'Basic dXNlcjpwYXNz' } },
    { label: 'a malformed bearer credential', headers: { authorization: 'Bearer short' } },
  ];

  it.each(rejectedHeaders)(
    'rejects $label without consulting the authenticator',
    async ({ headers }) => {
      const authenticate = jest.fn();
      const guard = new SessionAuthGuard(reflector, { authenticate } as SessionAuthenticator);
      const context = createContext({ headers }, RequiresSession.prototype.handle, RequiresSession);

      await expect(guard.canActivate(context)).rejects.toThrow(AppError);
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('rejects a credential the authenticator does not recognise', async () => {
    const authenticate = jest.fn(() => Promise.resolve(null));
    const guard = new SessionAuthGuard(reflector, { authenticate } as SessionAuthenticator);
    const context = createContext(
      { headers: { authorization: `Bearer ${'a'.repeat(43)}` } },
      RequiresSession.prototype.handle,
      RequiresSession,
    );

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('attaches the resolved principal to the request on success', async () => {
    const authenticate = jest.fn(() => Promise.resolve(adminPrincipal));
    const guard = new SessionAuthGuard(reflector, { authenticate } as SessionAuthenticator);
    const request: RequestStub = { headers: { authorization: `Bearer ${'a'.repeat(43)}` } };
    const context = createContext(request, RequiresSession.prototype.handle, RequiresSession);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getAuthenticatedPrincipal(request)).toEqual(adminPrincipal);
    expect(authenticate).toHaveBeenCalledWith('a'.repeat(43), {
      correlationId: expect.any(String) as unknown,
    } as unknown);
  });
});

describe('RolesGuard', () => {
  const reflector = new Reflector();

  it('allows a route that declares no role requirement', async () => {
    const guard = new RolesGuard(reflector);
    const context = createContext(
      { headers: {} },
      RequiresSession.prototype.handle,
      RequiresSession,
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects an unauthenticated caller on a role-protected route', async () => {
    const guard = new RolesGuard(reflector);
    const context = createContext(
      { headers: {} },
      AdministrativeOnly.prototype.handle,
      AdministrativeOnly,
    );
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('denies a principal that lacks the role and records the decision', async () => {
    const record = jest.fn(() => Promise.resolve());
    const guard = new RolesGuard(reflector, { record });
    const request: RequestStub = { headers: {} };
    const context = createContext(request, AdministrativeOnly.prototype.handle, AdministrativeOnly);
    setAuthenticatedPrincipal(request, { ...adminPrincipal, role: 'CUSTOMER' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(record).toHaveBeenCalledWith({
      correlationId: expect.any(String) as unknown,
      outcome: 'DENIED',
      permission: 'roles:ADMIN',
      principal: expect.objectContaining({ role: 'CUSTOMER' }) as unknown,
    } as unknown);
  });

  it('grants a principal that holds the role and records the decision', async () => {
    const record = jest.fn(() => Promise.resolve());
    const guard = new RolesGuard(reflector, { record });
    const request: RequestStub = { headers: {} };
    const context = createContext(request, AdministrativeOnly.prototype.handle, AdministrativeOnly);
    setAuthenticatedPrincipal(request, adminPrincipal);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(record).toHaveBeenCalledWith({
      correlationId: expect.any(String) as unknown,
      outcome: 'GRANTED',
      permission: 'roles:ADMIN',
      principal: adminPrincipal,
    } as unknown);
  });

  it('works without an audit port', async () => {
    const guard = new RolesGuard(reflector);
    const request: RequestStub = { headers: {} };
    const context = createContext(request, AdministrativeOnly.prototype.handle, AdministrativeOnly);
    setAuthenticatedPrincipal(request, adminPrincipal);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
