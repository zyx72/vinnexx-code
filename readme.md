# Vinnexx Code v0.3.0

Vinnexx Code is a TypeScript monorepo containing:

- `apps/client`: terminal client and local workspace tools.
- `apps/server`: Fastify API, account/device auth, quotas, prompt migration, and model gateway.
- `apps/dashboard`: React dashboard and account connection UI.

Public models:

- **Strummer0.5** — coding, debugging, project creation, file editing, and terminal tools.
- **United0.5** — automation, workflows, repeatable tasks, planning, and multi-step operations.

## Install the global command

From the repository root:

```sh
bash install.sh
```

Or from `apps/client`:

```sh
npm ci
npm run build
npm install -g .
vinnexx
```

The client stores only local user settings in `.vinnexx/settings.json`: language, root directory, workspace, selected public model, and trusted workspaces. Service routing and credentials are not written there.

## Development

```sh
bash scripts/install-all.sh
npm run typecheck
npm test
npm run build
```

## Server environment

Copy `apps/server/.env.example` to a private `.env` file and set the required values. Never commit `.env`, database credentials, signing secrets, device encryption keys, or model service credentials.

## Security model

- Local filesystem tools are restricted to the trusted workspace.
- Symbolic-link escapes are rejected.
- Sensitive file patterns require explicit approval before reading.
- Shell commands and deletion require approval.
- Known destructive command patterns are blocked.
- Server logs redact authentication headers and do not log full prompts, model responses, or secrets.
- Obfuscation is not treated as a security boundary.
