# Deployment

## Server

1. Install dependencies in `apps/server` with `npm ci`.
2. Configure the private environment variables listed in `apps/server/.env.example`.
3. Run `npm run build`.
4. Deploy `apps/server` using its `vercel.json` or run `npm start` on a Node.js 20+ host.

## Dashboard

1. Install dependencies in `apps/dashboard` with `npm ci`.
2. Set `VITE_API_BASE_URL` at build time when the API is not served from `/api/v1` on the same origin.
3. Run `npm run build` and deploy `dist`.

## Client

Build and install from `apps/client`:

```sh
npm ci
npm run build
npm install -g .
```

Run `vinnexx`. The service URL may be overridden for development with `VINNEXX_API_URL`; it is never stored in user settings or shown by `/setup`.
