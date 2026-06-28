# Debugging

Run these checks from the repository root:

```sh
bash scripts/install-all.sh
npm run typecheck
npm test
npm run build
```

Client smoke check:

```sh
VINNEXX_HOME="$(mktemp -d)" node apps/client/dist/vinnexx.mjs --smoke
```

Server HTTP smoke check:

```sh
npm run smoke --prefix apps/server
```

Do not paste environment values into issue reports. Include only sanitized error codes, request IDs, application version, and reproduction steps.
