# TheOutHaven Production Checks

TheOutHaven has three production-check modes.

## Basic local check

```bash
npm run production-check
```

This runs:

* TypeScript
* lint
* build
* optional E2E wrapper

Important:

This command may skip E2E if Playwright is not installed.

If E2E is skipped, this is not a full production gate.

This means the app is build-safe only, not production-verified.

## Strict local release gate

```bash
npm run production-check:strict
```

This runs:

* TypeScript
* lint
* build
* required Playwright E2E

This command must pass before production deployment.

If Playwright is missing, this command fails.

If E2E fails, this command fails.

## Live production smoke test

```bash
npm run production-check:live
```

This runs E2E tests against:

```txt
https://theouthaven.com
```

Use this after production deployment.

This command must not start a local server.

## Testing preview deployments

Use:

```bash
PLAYWRIGHT_BASE_URL=https://your-preview-url.vercel.app npm run test:e2e:required
```

This allows testing a Vercel preview URL before production.

## Local vs live E2E

Local E2E uses:

```txt
http://127.0.0.1:3000
```

Live E2E uses:

```txt
https://theouthaven.com
```

Do not use Playwright webServer for live production tests.

webServer is only for starting the local Next.js app during local E2E.

## Playwright install issues

If install fails with a registry error like:

```txt
403 Forbidden for playwright-core
```

Check:

```bash
npm config get registry
npm whoami
npm config list
```

Expected registry:

```txt
https://registry.npmjs.org/
```

Then install:

```bash
npm install
npx playwright install
```

Or install only Chromium:

```bash
npx playwright install chromium
```

Do not mark the project production-ready unless:

```bash
npm run production-check:strict
```

passes.

After deployment, also run:

```bash
npm run production-check:live
```

## Release meanings

Use these meanings:

```bash
npm run production-check
```

Build-safe.

```bash
npm run production-check:strict
```

Release-safe.

```bash
npm run production-check:live
```

Live-site verified.
