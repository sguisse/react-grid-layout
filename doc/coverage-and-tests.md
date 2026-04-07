# Test coverage & recent test updates

This document summarizes recent test and coverage changes made to this repository and explains how to run the tests and compute coverage locally.

## What changed

- Added targeted tests to improve coverage for responsive utilities and hooks:
  - `test/spec/coverage-boost.test.tsx` (new)
  - `test/spec/use-responsive-coverage.test.tsx` (updated)
- Added a helper script to summarize coverage JSON:
  - `scripts/computeCoverage.js` (read `coverage/coverage-final.json` and print aggregated metrics)
- Project Jest configuration was adjusted to collect coverage only from source files to avoid counting compiled artifacts (example shown below).

## Motivation

Global coverage numbers were being skewed by compiled/built artifacts (for example `dist/`). To get accurate coverage of the TypeScript source we restrict collection to `src/**` and added tests to exercise previously-uncovered branches in the responsive and hook logic.

## How to run tests and generate coverage

Primary (recommended - uses yarn as the project expects):

```bash
yarn test --coverage
```

Alternative (explicit Jest invocation):

```bash
NODE_ENV=test npx jest --coverage
```

After Jest produces the coverage report, you can run the summary helper (if present) to print aggregated percentages:

```bash
node scripts/computeCoverage.js
```

Run just the new/changed tests while developing:

```bash
NODE_ENV=test npx jest test/spec/coverage-boost.test.tsx
```

## Example Jest coverage config snippet

Add or verify the following in `package.json` (example):

```json
"collectCoverageFrom": [
  "src/**/*.{ts,tsx}",
  "!src/**/*.d.ts"
]
```

This excludes declaration files and limits coverage to the `src/` tree so compiled bundles in `dist/` do not reduce the reported coverage.

## Common test pitfalls & notes

- Do not `import 'jsdom'` inside test files. Jest runs in a `jsdom` environment by default; importing `jsdom` directly can cause environment conflicts and errors like `TextEncoder is not defined`.
- If a test needs a `TextEncoder` polyfill in Node, add it to the test setup (for example in `test/util/setupTests.js`) or set a global shim:

```js
// in test setup
global.TextEncoder = require('util').TextEncoder;
```

- Prefer deterministic assertions over timing-sensitive callbacks. If you must wait for async behavior, use `waitFor` from `@testing-library/react` and assert on deterministic state changes.

## Files touched by the recent changes (for reference)

- `test/spec/coverage-boost.test.tsx` — New tests covering edge cases in `src/core/responsive.ts` and `src/react/hooks/useGridLayout.ts`.
- `test/spec/use-responsive-coverage.test.tsx` — Stabilized assertions and removed a direct `jsdom` import.
- `scripts/computeCoverage.js` — Optional helper to compute aggregated coverage metrics from `coverage/coverage-final.json`.
- `package.json` — (example) updated `collectCoverageFrom` to limit coverage to `src/**`.

## Recommended workflow

1. Run the test suite locally with coverage: `yarn test --coverage`.
2. Inspect `coverage/lcov-report/index.html` in a browser for file-level details.
3. Optionally run `node scripts/computeCoverage.js` to print aggregated metrics in the terminal.
4. If you add new tests, run `yarn fmt` before committing.

If you want this summarized into the main `README.md` or a release note, add a short entry referencing this document.

---

File created: `doc/coverage-and-tests.md` — provides a compact guide to the recent testing and coverage changes.
