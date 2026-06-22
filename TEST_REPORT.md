# Vinnexx Code v0.2.0 — Test Report

Date: 2026-06-14

## Environment

```text
Node.js: v22.16.0
npm:     10.9.2
OS:      Linux build container
```

## Clean dependency installation

Each application was installed independently with its own lockfile:

```bash
npm ci --prefix apps/client
npm ci --prefix apps/server
npm ci --prefix apps/dashboard
```

Result:

```text
client:    0 vulnerabilities
server:    0 vulnerabilities
dashboard: 0 vulnerabilities
```

Runtime-only audits using `npm audit --omit=dev` also reported 0 vulnerabilities for all three apps at test time.

## TypeScript

Passed:

```text
apps/client
apps/server
apps/dashboard
```

## Automated tests

```text
Client unit tests:        2 passed
Server security tests:    3 passed
Server HTTP smoke:        passed (health 200, unknown route 404)
Dashboard build smoke:    passed
```

## Production builds

Passed:

```text
Client:    apps/client/dist/vinnexx.mjs
Server:    apps/server/dist/
Dashboard: apps/dashboard/dist/
```

## CLI and installer

Passed:

- `vinnexx.mjs --version` returned `0.2.0`.
- `vinnexx.mjs --help` included the expected commands.
- release ZIP was created;
- release ZIP integrity test passed;
- SHA-256 verification passed;
- installer was executed against the local built client in a temporary installation directory;
- installed launcher returned version `0.2.0`.

## Dashboard HTTP smoke

A local HTTP server served the production dashboard build. The following passed:

- `/` returned the SPA shell;
- `/account` fell back to the SPA shell;
- `/config.js` contained the expected API base URL;
- `/assets/app.js` was readable.

## Deployment structure checks

Passed:

- each app owns its `package.json` and `package-lock.json`;
- each app owns its TypeScript build dependency;
- no runtime/build script uses `npm install --prefix=../..`;
- server entrypoint exists at `apps/server/src/index.ts`;
- server and dashboard Vercel configs exist;
- dashboard SPA rewrite exists;
- built client and dashboard outputs exist.

## Secret scan

Source was scanned for JWT-like Puter tokens and embedded production `PUTER_AUTH_TOKEN` values. No production token was found. `.env` production files are excluded from packaging.

## What cannot be truthfully tested without owner credentials

The following require the project owner's real external accounts and therefore were not claimed as completed:

- an actual Vercel production deployment;
- live MongoDB Atlas account/register/device flows;
- real DNS and HTTPS custom domains;
- live Puter production responses;
- end-to-end browser cookie behavior on the production domains.

Exact deployment steps and post-deploy tests are provided in `DEPLOYMENT.md`. CLI-based fixes are provided in `DEBUGGING.md`.
