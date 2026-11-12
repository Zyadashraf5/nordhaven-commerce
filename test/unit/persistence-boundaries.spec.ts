// The boundary checker is ESM and tested through a child process, matching the production gate.
import { spawnSync } from 'node:child_process';
describe('published persistence boundaries', () => {
  it('rejects foreign root persistence while allowing owned queries and declared relation projections', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { findModuleBoundaryViolations as check } from './scripts/lib/module-boundaries.mjs'; const path='modules/cart/persistence/cart.repository.ts'; console.log(JSON.stringify([check(path,'this.database.prisma.product.findUnique({})'),check(path,'this.database.prisma.cartItem.findMany({select:{variant:{select:{sku:true}}}})')]));",
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    const findings = JSON.parse(result.stdout) as string[][];
    expect(findings[0]).toHaveLength(1);
    expect(findings[0]?.[0]).toContain('foreign persistence root product');
    expect(findings[1]).toHaveLength(0);
  });
});
