# braces 3.0.3 development-tool mitigation

`braces@3.0.3.patch` mitigates [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). On 2026-10-20 the registry's latest version was 3.0.3 and the advisory listed no patched release. The dependency is used by Jest via micromatch, not by the application's runtime dependency tree.

The patch caps recursive AST walk depth at 128 in compile, expand and stringify. Parser nesting is bounded before constructing deeper brace/parenthesis blocks, including malformed blocks whose cleanup stringifies them. Direct AST calls are also bounded. The limit is fixed and cannot be disabled through caller options. Patterns exceeding the supported depth intentionally raise SyntaxError; ordinary alternatives, ranges, escaping and shallow malformed groups retain their behavior. This is not a general bound on every possible expansion's output size.

pnpm-workspace.yaml registers the exact-version patch; pnpm-lock.yaml pins its hash. Use the project's pinned pnpm 12.13.0 with a frozen lockfile. Do not edit the installed node_modules copy or remove the patch merely because the upstream version still audits as vulnerable. No audit suppression is configured: the full audit continues to report this version-based advisory.

`pnpm test:unit` includes test/unit/braces-depth.spec.ts, which resolves braces through the actual micromatch consumer and checks supported behavior plus bounded rejection for pattern and AST inputs. `pnpm verify` also runs that suite and full standalone typechecking. The remediation evidence includes an isolated comparison against the unmodified dependency and an offline frozen installation check.

Replace this patch when a maintainer release demonstrably addresses the recursive paths. Review the advisory and release changes, rerun the dependency regressions and all verification gates, then remove the exact-version patch entry and regenerate the frozen lockfile. Do not broaden unrelated package upgrades just to obscure an unpatched advisory.
