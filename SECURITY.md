# Security Policy

## Supported version

Vinnexx Code 0.2.x adalah development line yang didukung saat ini.

## Pelaporan

Jangan membuka public issue yang berisi credentials, data user pribadi, token, cookie, private key, connection string, atau exploit yang masih aktif. Laporan private sebaiknya berisi:

- komponen dan versi;
- langkah reproduksi;
- expected dan actual behavior;
- impact;
- log yang sudah disensor.

## Secret handling

Jangan pernah commit atau package:

- Puter auth token;
- MongoDB URI atau password;
- cookie secret;
- device encryption key;
- production cookie;
- device token atau signing secret;
- isi `.env` production.

Token yang pernah dikirim melalui chat, screenshot, log, repository, atau issue harus dianggap compromised dan dirotasi.

## Boundary keamanan

API browser memakai session cookie HttpOnly dan exact trusted Origin untuk request state-changing. API CLI memakai bearer device token serta HMAC-SHA256 yang mengikat method, path, timestamp, nonce, dan body hash.

CORS bukan authentication. Hash biasa bukan request authentication. Semua account, plan, quota, role, prompt, provider routing, dan authorization tetap diverifikasi server-side.

## Production checklist

- HTTPS aktif untuk dashboard dan API;
- HTTP dialihkan ke HTTPS;
- `PUBLIC_SITE_URL` sama persis dengan origin dashboard;
- token Puter baru dan tidak pernah dipublikasikan;
- `DEVICE_SECRET_ENCRYPTION_KEY` ter-decode menjadi tepat 32 byte;
- `COOKIE_SECRET` random minimal 32 karakter;
- MongoDB user memiliki privilege minimum;
- MongoDB network access diperketat semaksimal hosting mengizinkan;
- Vercel environment variables dipasang pada environment yang benar;
- deployment di-redeploy setelah env berubah;
- log server diperiksa untuk memastikan redaction;
- admin email list diperiksa;
- rate limit dites dari domain production;
- ZIP release dan SHA-256 berasal dari build yang sama;
- backup dan account deletion flow dites;
- dependency audit dijalankan sebelum release.

## Privacy

Client hanya mengirim user instruction, tree workspace terbatas, dan output tool yang diminta. Client tidak otomatis mengunggah seluruh project. Tool output dibatasi panjangnya. Prompt server melarang permintaan secrets, tetapi user tetap harus meninjau file sebelum mengizinkan akses.

## Client limitation

Client code dan credential lokal tidak dapat dibuat mustahil untuk dibaca pada device yang dikuasai user. Obfuscation hanya menaikkan tingkat kesulitan. Server-side enforcement adalah security boundary utama.
