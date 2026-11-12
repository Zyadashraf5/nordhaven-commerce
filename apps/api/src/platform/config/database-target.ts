/** Temporary protection until the original databases undergo separately approved reconciliation. */
export function assertSafeDatabaseTarget(connection: string): void {
  try {
    const url = new URL(connection);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !/^[a-zA-Z0-9_]+$/.test(name) ||
      ['nordhaven', 'nordhaven_integration', 'nordhaven_e2e'].includes(name.toLowerCase()) ||
      [...url.searchParams.keys()].some((key) => ['database', 'dbname'].includes(key.toLowerCase()))
    ) {
      throw new Error('Invalid target');
    }
  } catch {
    throw new Error('Database target is not permitted before reconciliation');
  }
}
