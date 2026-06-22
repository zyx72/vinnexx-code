# Vinnexx Code v0.2.0 — Technical Blueprint

## 1. Product definition

Vinnexx Code is a proprietary, account-backed terminal coding agent. The installed command is:

```bash
vinnexx
```

The public AI identity is **Sora0.5**. The initial server provider model is `claude-3-5-sonnet-20241022` through Puter AI. Provider identity, token, model routing, system prompts and policy are server-only.

## 2. Three-part architecture

```text
┌──────────────────────────────┐
│ Client: terminal device      │
│ TypeScript / Node.js         │
│                              │
│ - terminal UI                │
│ - workspace trust            │
│ - local tools                │
│ - local snapshots            │
│ - HMAC request signing       │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│ Server: api.vinnexx.zone.id  │
│ Fastify / TypeScript         │
│                              │
│ - accounts and sessions      │
│ - device authorization       │
│ - quota and plans            │
│ - memory and summaries       │
│ - prompts and policies       │
│ - Puter AI requests          │
│ - API security               │
└──────────────┬───────────────┘
               │ MongoDB
               ▼
┌──────────────────────────────┐
│ Dashboard: browser           │
│ React / TypeScript           │
│                              │
│ - login and register         │
│ - connect terminal           │
│ - account and plan           │
│ - devices and memory         │
│ - installation and docs      │
│ - playground and admin       │
└──────────────────────────────┘
```

## 3. Data placement

### 3.1 Server-side data

The following data belongs to the Vinnexx account and is stored in MongoDB:

- user account and password hash
- plan and role
- web sessions
- connected terminal devices
- hourly usage windows
- account memories
- chat session state
- task summaries
- system prompts
- Sora0.5 identity prompt
- provider model selection
- replay-prevention nonces

### 3.2 Local data

Only device-specific or filesystem-specific data remains local:

```text
<install-root>/.vinnexx/
├── auth/account.json
├── config.json
├── cache/
├── history/
└── temp/
```

Local data contains:

- current device bearer token
- current device HMAC signing secret
- server URL
- trusted workspace list
- local undo/redo snapshots
- temporary cache

It does not contain the Puter token, server prompts or provider routing rules.

## 4. Browser device authorization

### 4.1 Start

The terminal calls:

```http
POST /api/v1/device/start
```

The server returns:

- random `deviceCode`
- random `pollSecret`
- short human-readable `userCode`
- browser verification URL
- expiry and polling interval

### 4.2 Approval

The browser opens:

```text
https://vinnexx.zone.id/auth?id=XXXXXXXX
```

The user signs in and explicitly approves or denies the terminal. The URL contains only a temporary code, not permanent credentials.

### 4.3 Credential issue

On approval, the server creates:

- random device bearer token
- random per-device HMAC signing secret
- MongoDB device record

The bearer token is stored as SHA-256. The HMAC secret is stored encrypted with AES-256-GCM. Temporary credentials inside the device authorization session are also encrypted.

The terminal polls with both `deviceCode` and `pollSecret`, receives the permanent credentials and writes them to a local file with mode `0600` where supported.

## 5. Protected CLI request protocol

Each protected request includes:

```http
Authorization: Bearer <device-token>
X-Vinnexx-Timestamp: <unix-seconds>
X-Vinnexx-Nonce: <random-base64url>
X-Vinnexx-Signature: <hmac-base64url>
X-Vinnexx-Version: 0.2.0
```

The canonical signature input is:

```text
METHOD
PATH_WITH_QUERY
TIMESTAMP
NONCE
SHA256(STABLE_JSON_BODY)
```

The signature is:

```text
HMAC-SHA256(per-device-secret, canonical-input)
```

Server validation order:

1. required security headers
2. bearer token lookup
3. 60-second timestamp window
4. canonical HMAC calculation
5. constant-time signature comparison
6. unique nonce insertion
7. account lookup
8. endpoint rate limit
9. Zod body validation
10. quota and authorization checks

Nonce records expire automatically through a MongoDB TTL index.

## 6. Browser session security

- random 256-bit session token
- SHA-256 token storage
- HttpOnly cookie
- Secure cookie in production
- SameSite=Lax
- state-changing endpoints verify exact trusted Origin
- salted scrypt password hashes
- per-route login throttling
- sensitive headers and fields redacted from server logs

## 7. Free plan usage

```text
Limit:                1,000 Vinnexx tokens
Window:               fixed UTC hour
Characters per token: 5
Spaces:               counted
Accumulation:         disabled
```

Formula:

```text
cost = ceil(Array.from(userMessage).length / 5)
```

Examples:

```text
"halo"       = 4 characters  = 1 token
"makan ayam" = 10 characters = 2 tokens
```

Usage is atomically reserved in MongoDB before the Puter request. If the provider request fails before a usable result, the reserved usage is refunded. Tool-result continuation does not charge the original user prompt again.

## 8. AI prompt architecture

The server loads three prompt layers:

1. **Vinnexx core prompt** — tool rules, coding workflow, data protection, language, safety and completion behavior.
2. **Sora0.5 identity prompt** — public name, developer, version and public capabilities.
3. **Account memory context** — relevant saved preferences and behavior.

Core and identity prompts are seeded into MongoDB and can be updated by an administrator through the protected admin API. The client never receives these prompt strings.

## 9. AI tool loop

```text
User prompt
   ↓
Server calls Puter with server-side tools
   ↓
AI returns final text OR tool calls
   ↓
Server returns validated tool calls to client
   ↓
Client validates workspace/risk and executes locally
   ↓
Client sends tool results with HMAC request
   ↓
Server continues the same provider conversation
```

Maximum tool continuation loops per task: 12.

Available v0.2.0 tools:

- `list_directory`
- `read_file`
- `create_directory`
- `write_file`
- `edit_file`
- `delete_path`
- `run_command`

## 10. Local tool security

- every path is resolved relative to the trusted workspace
- paths outside the workspace are rejected
- symbolic-link path components are rejected
- workspace root deletion is rejected
- file read size is limited
- tool output sent to the server is truncated
- `edit_file` requires one exact `oldText` match
- shell commands require local confirmation
- deletion requires local confirmation
- known destructive system command patterns are blocked
- subprocess timeout and output limits are enforced

## 11. Privacy behavior

The initial chat request sends:

- the user instruction
- a limited, truncated workspace tree

It does not automatically upload the complete project. Sora0.5 requests a specific file through `read_file` when needed. The local client then sends only the requested tool output.

Server prompts explicitly forbid requesting secrets, private keys, cookies, passwords and `.env` values. This is defense in depth, not a substitute for user review.

## 12. Undo and redo

Each user task has a local history folder with:

```text
history/<task-id>/
├── before/
├── after/
└── manifest.json
```

Before a mutating tool first touches a path, the client snapshots that path. At task completion it snapshots the after-state. `/undo` restores before-state and `/redo` restores after-state.

External effects, such as remote Git pushes, deployments or third-party API calls, cannot be reversed by local snapshots.

## 13. Live terminal status

### Thinking

Used while the server or AI is processing:

```text
Thinking... 7s
[>_]Processing request...
```

### Working

Used while local tools execute:

```text
Working... [2m] 80% [################____]
[>_]Editing src/index.ts...
```

The terminal redraws the same two lines instead of appending a new status line every second.

## 14. API surface

### Public or temporary

```text
GET  /api/v1/health
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/device/start
POST /api/v1/device/status
GET  /api/v1/device/inspect
POST /api/v1/device/approve
POST /api/v1/device/deny
```

### Browser account

```text
GET    /api/v1/account/usage
GET    /api/v1/account/memory
PUT    /api/v1/account/memory
DELETE /api/v1/account/memory
GET    /api/v1/account/summaries
GET    /api/v1/device/list
POST   /api/v1/device/revoke
POST   /api/v1/playground/chat
```

### HMAC-protected CLI

```text
GET  /api/v1/cli/account
GET  /api/v1/cli/usage
POST /api/v1/cli/chat/start
POST /api/v1/cli/chat/tool-result
GET  /api/v1/cli/memory
PUT  /api/v1/cli/memory
POST /api/v1/cli/task/complete
POST /api/v1/cli/device/logout
```

### Administrator

```text
GET /api/v1/admin/users
PUT /api/v1/admin/users/plan
GET /api/v1/admin/system-config
PUT /api/v1/admin/system-config
```

## 15. MongoDB collections

```text
users
device_auth_sessions
devices
web_sessions
nonces
usage_windows
memories
chat_sessions
summaries
system_config
```

Unique and TTL indexes are created automatically at server startup.

## 16. Production topology

```text
Internet
   ↓ HTTPS
Vercel
   ├── api.vinnexx.zone.id → Fastify project (apps/server)
   └── vinnexx.zone.id     → dashboard project (apps/dashboard)

Fastify server
   ├── MongoDB Atlas Free Tier
   └── Puter AI
```

Recommended production controls beyond v0.2.0:

- managed TLS and automatic certificate rotation
- separate secrets manager
- database IP allowlist or private networking
- centralized audit logs without prompt/file content
- WAF and distributed rate limits
- automated backups
- device session expiry and refresh rotation
- signed client binaries
- transparent privacy policy and data retention controls
- dependency and container scanning in CI

## 17. Security boundary and honest limitation

HMAC prevents unauthenticated outsiders from forging requests without a connected device secret. It also prevents replay and detects body/path tampering.

However, a secret stored on a user's device can be extracted by that device owner. Therefore v0.2.0 cannot cryptographically prove that every signed request came from an unmodified official client. Obfuscation only raises effort. Stronger production assurance would require signed binaries, platform key stores and hardware-backed attestation where available.

All sensitive operations remain enforced by server-side account, quota, authorization, schema and rate-limit checks even if a user writes their own compatible client.
