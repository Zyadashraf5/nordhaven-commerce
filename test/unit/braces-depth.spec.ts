import { createRequire } from 'node:module';
import path from 'node:path';

interface Ast {
  type: string;
  nodes?: Ast[];
  value?: string;
}
interface Braces {
  compile(input: string | Ast): string;
  expand(input: string | Ast): string[];
  stringify(input: string | Ast): string;
  parse(input: string): Ast;
}
// Resolve through the actual dev-tool consumer, so an unapplied/stale patch fails these tests.
const consumerRequire = createRequire(
  path.resolve('node_modules/.pnpm/node_modules/micromatch/package.json'),
);
const braces = consumerRequire('braces') as Braces;

describe('braces development dependency depth guard', () => {
  it('preserves normal alternatives, nested alternatives, ranges and escaped literals', () => {
    expect(braces.expand('src/{api,test}/*.{ts,js}')).toEqual([
      'src/api/*.ts',
      'src/api/*.js',
      'src/test/*.ts',
      'src/test/*.js',
    ]);
    expect(braces.expand('{a,{b,c}}')).toEqual(['a', 'b', 'c']);
    expect(braces.expand('{01..03}')).toEqual(['01', '02', '03']);
    expect(braces.compile('src/{api,test}/*.ts')).toBe('src/(api|test)/*.ts');
    expect(braces.stringify('a\\{b,c\\}')).toBe('a{b,c}');
  });

  it('preserves shallow malformed groups and ignores escaped nesting characters', () => {
    expect(braces.stringify('{{a')).toBe('{{a');
    const literal = '\\{'.repeat(200);
    expect(braces.stringify(literal)).toBe('{'.repeat(200));
  });

  it('accepts the supported nesting boundary', () => {
    const pattern = '{'.repeat(127) + 'a' + '}'.repeat(127);
    expect(braces.stringify(pattern)).toBe(pattern);
    expect(() => braces.compile(pattern)).not.toThrow();
  });

  it.each(['parse', 'compile', 'expand', 'stringify'] as const)(
    'bounds %s before stack exhaustion on nested pattern input',
    (method) => {
      for (const [open, close] of [
        ['{', '}'],
        ['(', ')'],
      ]) {
        const pattern = open!.repeat(129) + 'a' + close!.repeat(129);
        expect(() => braces[method](pattern)).toThrow(SyntaxError);
        expect(() => braces[method](pattern)).toThrow('maximum nesting depth');
        expect(() => braces[method](open!.repeat(129) + 'a')).toThrow(SyntaxError);
      }
    },
  );

  it.each(['compile', 'expand', 'stringify'] as const)(
    'bounds %s when passed an AST directly',
    (method) => {
      let node: Ast = { type: 'text', value: 'a' };
      for (let i = 0; i < 130; i++) node = { type: 'root', nodes: [node] };
      expect(() => braces[method](node)).toThrow(SyntaxError);
      expect(() => braces[method](node)).toThrow('maximum nesting depth');
    },
  );
});
