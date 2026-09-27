# Development and verification

Use **Node 24.21.0** (pinned in `.nvmrc`) and **npm 11.19.0** (bundled with that Node release and pinned by `packageManager`). Build and unit-test commands check both versions. Install the matching Node release using your version manager; with nvm:

```bash
nvm install
nvm use
npm run check:toolchain
npm ci
npm run test:browser:install
```

Browser tests use Playwright-managed Chromium, not a workstation Chrome installation. The locked Playwright version selects the browser revision. On a fresh Linux host that needs system libraries, use `npx playwright install --with-deps chromium`. Other platforms normally need only the browser-install command. If using `PLAYWRIGHT_BROWSERS_PATH` for a cache, set the same path for installation and test runs.

```bash
npm run lint
npm test
npm run test:e2e:production
npm run audit
npm run audit:production
```

The unit suite uses one worker, requires assertions, rejects focused tests, and fails empty discovery. Production browser tests build the app, serve the new `dist` on loopback port 4173 with a strict port and no server reuse, and verify the served index/assets against the build receipt. Changes to source/test/config inputs during building or testing fail qualification. Each test records the source/lockfile and asset hashes, actual browser version, and uncaught page errors. The receipt is generated under `node_modules/.cache/markdown-to/`; it is not part of the website. Failed tests retain traces. Install/browser network failures are failures, not skipped checks.

For interactive development use `npm run dev` (default port 5173). `npm run test:e2e` is the separate development-server smoke suite on port 5174. Stop a conflicting test server before retrying; the suite will not silently reuse it.

Use the same `.nvmrc`, npm version, `npm ci`, browser installation, and verification commands in CI. The GitHub Actions workflow runs on every push and pull request with the stable job name `Verify`. It checks the exact PR head, uses read-only repository permissions, disables persisted checkout credentials, and caches npm downloads only. Managed Chromium and its Linux dependencies are installed explicitly. Failed audits at any severity fail the job; there are currently no advisory exceptions. Audit service failures also fail verification. Candidate hashes, browser results, saved downloads and failure traces are retained as workflow artifacts for 14 days. Local runs do not establish hosted CI success or branch protection; those must be verified on the target repository. Version updates must change the pins intentionally and rerun the checks. A zero-result audit is a dated dependency check, not proof that all application behavior is secure.
