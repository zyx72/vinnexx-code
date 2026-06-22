# Vinnexx Code v0.2.0

Vinnexx Code adalah AI coding agent berbasis terminal dengan arsitektur TypeScript/Node.js yang dibagi menjadi tiga aplikasi mandiri:

- **Client** (`apps/client`) — terminal UI, browser login, local tools, HMAC request signing, live status, dan undo/redo.
- **Server** (`apps/server`) — akun, device authorization, MongoDB, quota, memory, prompts, kebijakan, Puter AI, dan API security.
- **Dashboard** (`apps/dashboard`) — register/login, connect terminal, account, plan, usage, device, memory, dokumentasi, instalasi, playground, dan admin.

Identitas model publik: **Sora0.5**  
Provider default: **`claude-3-5-sonnet-20241022`** melalui Puter AI.

> Token Puter production tidak disertakan. Token yang pernah muncul di chat, log, screenshot, atau repository harus dirotasi sebelum dipakai.

## Tujuan v0.2.0

Versi ini dibuat untuk menghilangkan masalah deployment v0.1:

- tidak memakai npm workspace untuk deploy;
- setiap app memiliki `package.json`, `package-lock.json`, `.npmrc`, TypeScript, dan build dependency sendiri;
- tidak ada `npm install --prefix=../..`;
- server dan dashboard mempunyai konfigurasi Vercel di directory masing-masing;
- install Vercel menggunakan `npm ci --include=dev`, sehingga `tsc` dan build tools tetap tersedia;
- satu repository GitHub dapat dipakai oleh dua project Vercel dengan hanya memilih Root Directory;
- seluruh build, test, release packaging, dan installer simulation dapat dijalankan lewat satu command.

## Struktur

```text
vinnexx-code-v0.2.0/
├── apps/
│   ├── client/
│   ├── server/
│   └── dashboard/
├── scripts/
├── deploy/
├── install.sh
├── DEPLOYMENT.md
├── DEBUGGING.md
├── SECURITY.md
├── blueprint.md
├── readme.md
├── readme.txt
└── vinnexx.project.json
```

## Persyaratan

- Node.js 20.11 atau lebih baru
- npm 10 atau lebih baru
- Git, curl, unzip, dan zip
- MongoDB Atlas Free Tier atau MongoDB lokal
- token Puter production baru
- dua project Vercel untuk deployment dari satu repository

## Verifikasi total

Jalankan dari root source:

```bash
bash scripts/verify-all.sh
```

Script tersebut memasang dependency secara bersih, melakukan typecheck, unit test, HTTP smoke test, production build, deploy-structure check, membuat release client, dan menguji installer ke folder sementara.

Tidak ada klaim bahwa deployment external ke akun Vercel, MongoDB Atlas, atau Puter production bisa diuji tanpa credentials milik pemilik project. Validasi yang disertakan adalah clean local build/test/smoke dan struktur yang dibuat mengikuti deployment Fastify dan SPA Vercel.

## Development lokal

### Siapkan server

```bash
cp apps/server/.env.example apps/server/.env
```

MongoDB lokal opsional:

```bash
docker compose up -d mongodb
```

Isi `.env`, lalu:

```bash
npm run dev:server
```

### Dashboard

```bash
npm run dev:dashboard
```

Buka `http://127.0.0.1:5173`.

### Client

```bash
VINNEXX_API_URL=http://127.0.0.1:8787/api/v1 npm run dev:client
```

## Deployment singkat

Gunakan satu repository GitHub dan dua Vercel project:

| Aplikasi | Root Directory | Domain |
|---|---|---|
| Server | `apps/server` | `api.vinnexx.zone.id` |
| Dashboard | `apps/dashboard` | `vinnexx.zone.id` |

Tidak perlu menulis Build Command, Install Command, atau Output Directory secara manual di Vercel UI. Konfigurasi berada di:

```text
apps/server/vercel.json
apps/dashboard/vercel.json
```

Panduan deployment dari nol sampai release client tersedia di [DEPLOYMENT.md](DEPLOYMENT.md). Solusi error berdasarkan CLI tersedia di [DEBUGGING.md](DEBUGGING.md).

## Environment server

```env
PUBLIC_SITE_URL=https://vinnexx.zone.id
API_BASE_URL=https://api.vinnexx.zone.id/api/v1
MONGODB_URI=mongodb+srv://...
MONGODB_DB=vinnexx
COOKIE_SECRET=...
DEVICE_SECRET_ENCRYPTION_KEY=...
PUTER_AUTH_TOKEN=...
PUTER_MODEL=claude-3-5-sonnet-20241022
ADMIN_EMAILS=lordkevin404@gmail.com
FREE_HOURLY_TOKENS=1000
CHARACTERS_PER_TOKEN=5
```

Secret hanya boleh berada di environment server.

## Environment dashboard

```env
VITE_API_BASE_URL=https://api.vinnexx.zone.id/api/v1
```

Nilai ini dimasukkan ke `dist/config.js` saat build, sehingga dashboard dapat diarahkan ke server tanpa mengubah source.

## Login terminal

1. Client meminta device authorization sementara.
2. Terminal membuka `https://vinnexx.zone.id/auth?id=...`.
3. User login dan menyetujui koneksi.
4. Server membuat device token dan per-device HMAC secret.
5. Terminal otomatis menerima dan menyimpan credentials dengan permission terbatas.
6. Request protected memakai bearer token, HMAC-SHA256, timestamp, dan nonce satu kali.

Kode di URL browser hanya kode pairing sementara, bukan token permanen.

## Free plan

- 1.000 Vinnexx token per jam UTC
- 1 token = 5 karakter Unicode
- spasi dihitung
- `makan ayam` = 10 karakter = 2 token
- quota kembali ke maksimal 1.000 saat jam berikutnya
- quota tidak dapat menumpuk
- perhitungan dan enforcement dilakukan server

## CLI

```text
/help
/login
/logout
/status
/model
/project PATH
/memory
/memory set KEY VALUE
/setup
/undo
/redo
/clear
/exit
```

Status AI:

```text
Thinking... 7s
[>_]Processing request...
```

Status local tool:

```text
Working... [2m] 80% [################____]
[>_]Editing src/index.ts...
```

Dua line tersebut diperbarui di tempat dan tidak menambah line setiap detik.

## Build release client

```bash
npm run package:release
```

Hasil:

```text
release/vinnexx-code.zip
release/vinnexx-code.zip.sha256
```

Upload keduanya ke GitHub Release `v0.2.0` tanpa mengganti nama.

## Instalasi user

```bash
curl -fsSL https://raw.githubusercontent.com/zyx72/vinnexx-code/main/install.sh | bash
```

Kemudian:

```bash
vinnexx --version
vinnexx
```

## Data lokal

Installer menempatkan app di:

```text
~/.local/share/vinnexx-code/
```

Data local minimum:

```text
~/.local/share/vinnexx-code/.vinnexx/
├── auth/
├── cache/
├── history/
├── temp/
└── config.json
```

Prompt inti, provider token, routing model, akun, plan, usage, dan memory tersimpan atau diproses oleh server.

## Security

Lapisan utama:

- HTTPS production;
- exact-origin CORS untuk dashboard;
- HttpOnly/Secure/SameSite browser cookie;
- salted scrypt password hash;
- SHA-256 device token storage;
- AES-256-GCM untuk HMAC secret di database;
- HMAC-SHA256 request signing;
- timestamp window dan nonce replay prevention;
- rate limiting;
- strict Zod validation;
- log redaction;
- server-side prompts dan provider routing;
- workspace boundary dan symlink checks;
- confirmation untuk command dan delete;
- destructive-command blocklist;
- checksum-verified installer.

Source client yang berada di device user tidak mungkin dibuat 100% tidak dapat dibaca. Karena itu security boundary utama tetap server-side. Lihat [SECURITY.md](SECURITY.md).

## Batasan jujur

- AI live memerlukan MongoDB Atlas dan token Puter valid.
- Domain, DNS, cookies, CORS, MongoDB network rules, dan Puter production harus dites setelah deployment memakai akun pemilik project.
- Serverless in-memory rate limit tidak bersifat global lintas instance; quota, nonce, device, dan akun tetap memakai MongoDB. Distributed rate limit dapat ditambahkan saat traffic production meningkat.
- Obfuscation atau signed binary belum diterapkan pada v0.2.0.
