VINNEXX CODE v0.2.0
===================

SOURCE:
  apps/client     terminal client and local tool executor
  apps/server     account, database, quota, prompts, Puter AI and secure API
  apps/dashboard  account dashboard, docs, install, playground and admin

VERIFY EVERYTHING FROM PROJECT ROOT:
  bash scripts/verify-all.sh

VERCEL PROJECTS:
  Server root:    apps/server
  Server domain:  api.vinnexx.zone.id

  Dashboard root: apps/dashboard
  Dashboard domain: vinnexx.zone.id

Do not override Vercel build/install/output settings. Each app contains its
own package-lock.json, dependencies and vercel.json.

FULL STEP-BY-STEP:
  DEPLOYMENT.md

CLI DEBUG SOLUTIONS:
  DEBUGGING.md

TECHNICAL DESIGN:
  blueprint.md

SECURITY:
  SECURITY.md

PUBLIC MODEL:
  Sora0.5

PROVIDER MODEL:
  claude-3-5-sonnet-20241022 through Puter AI

FREE PLAN:
  1000 Vinnexx tokens per UTC hour
  1 token = 5 Unicode characters, spaces included
  quota resets to 1000 and never accumulates

PUBLIC INSTALL AFTER GITHUB RELEASE:
  curl -fsSL https://raw.githubusercontent.com/zyx72/vinnexx-code/main/install.sh | bash

Never put Puter tokens, MongoDB credentials, cookie secrets or encryption
keys in GitHub, the client, dashboard, installer, release ZIP or .vinnexx.
