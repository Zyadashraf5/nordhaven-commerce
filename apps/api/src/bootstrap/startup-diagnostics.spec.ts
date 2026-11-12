import { EnvironmentValidationError } from '../platform/config/environment';
import { StartupDependencyError, toStartupDiagnostic } from './startup-diagnostics';

describe('startup diagnostics', () => {
  it('reports invalid keys without values', () => {
    expect(toStartupDiagnostic(new EnvironmentValidationError(['DATABASE_URL', 'PORT']))).toEqual({
      level: 'error',
      event: 'startup_failed',
      category: 'configuration_invalid',
      message: 'Application configuration is invalid',
      invalidKeys: ['DATABASE_URL', 'PORT'],
    });
  });

  it('classifies a port conflict without including an exception message', () => {
    const error = Object.assign(new Error('listen EADDRINUSE synthetic-secret'), {
      code: 'EADDRINUSE',
      port: 3000,
    });
    const diagnostic = toStartupDiagnostic(error);
    expect(diagnostic).toMatchObject({ category: 'port_unavailable', port: 3000 });
    expect(JSON.stringify(diagnostic)).not.toContain('synthetic-secret');
  });

  it('classifies an initial database failure without including its cause', () => {
    const diagnostic = toStartupDiagnostic(
      new StartupDependencyError('database', new Error('postgresql://user:secret@database/db')),
    );
    expect(diagnostic).toMatchObject({
      category: 'dependency_unavailable',
      dependency: 'database',
    });
    expect(JSON.stringify(diagnostic)).not.toContain('postgresql://');
  });
});
