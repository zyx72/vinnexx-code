# Changelog

## 0.2.0

- Rebuilt repository into three independent TypeScript/Node.js applications.
- Removed deploy-time npm workspace dependency resolution.
- Added per-app `package-lock.json`, `.npmrc`, build dependencies and Vercel configuration.
- Added `npm ci --include=dev` deploy installation to prevent missing `tsc`/build tools.
- Added TypeScript terminal client with browser device authorization.
- Added one-line live Thinking and Working status UI.
- Added local file tools, command approval, workspace trust and undo/redo snapshots.
- Added Fastify API server with MongoDB Atlas support.
- Added HMAC-SHA256 request signing, timestamp validation, nonce replay prevention and rate limiting.
- Added Vinnexx web accounts, device management and server-side memory.
- Added fixed hourly Free-plan quota: 1,000 Vinnexx tokens, 5 characters per token.
- Added server-side prompts, Sora0.5 identity and Puter AI provider integration.
- Added browser dashboard, documentation, installation page, playground and admin panel.
- Added checksum-verifying installer and release packaging script.
- Added full clean verification, deployment structure checks and local installer simulation.
- Added detailed `DEPLOYMENT.md` and `DEBUGGING.md` guides.
