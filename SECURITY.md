# Security

Report security issues privately to the project owner. Do not include production secrets in public reports.

## Required controls

- Keep `.env` and all credentials outside source control and release archives.
- Rotate any credential exposed in chat, logs, screenshots, commits, or build output.
- Restrict database network access and use least-privilege credentials.
- Keep cookie, signing, and encryption secrets independent.
- Review server logs for accidental sensitive fields; request logging is configured with redaction.
- Do not rely on source minification or obfuscation to protect server secrets.

## Local tools

Workspace operations use canonical paths and reject symbolic links. Sensitive files require approval. Shell commands and deletion require approval and destructive patterns are blocked.
