# Vinnexx Code v0.3.0

## Ringkasan perubahan

- Mengganti client terminal lama dengan TUI modular berbasis alternate screen, header/footer tetap, area percakapan yang dapat di-scroll, tema merah, renderer Markdown terminal, editor input, history, menu setup, dan cleanup global.
- Menggunakan dua identitas publik: **Strummer0.5** untuk coding dan **United0.5** untuk otomatisasi. Pilihan disimpan lokal sebagai mode publik dan server tetap mengendalikan routing internal.
- Menambahkan `/model`, `/model strummer`, `/model united`, login gate, `/profile`, `/status`, `/setup edit`, workspace tepercaya, dan respons internal lokal yang instan.
- Memperbaiki timer status dengan clock monotonic serta memastikan interval berhenti pada sukses, error, timeout, pembatalan, dan exit.
- Memperbaiki alur `startChat -> local tools -> continueChat -> final response`, menambahkan request ID, deduplikasi, lock continuation, batas delapan putaran tool, timeout terpisah, dan fallback review yang jujur.
- Membatasi output tool menjadi sekitar 30 ribu karakter dengan head/tail retention serta workspace tree menjadi 120 entry/25 ribu karakter dengan cache singkat dan invalidasi setelah perubahan.
- Menguatkan tool lokal: canonical workspace path, pencegahan symlink escape, approval untuk shell/delete/file sensitif, blokir pola command destruktif, timeout shell, pembatalan proses, dan environment shell yang disanitasi.
- Menambahkan migrasi prompt server otomatis ke `promptVersion: 3` tanpa perlu menghapus data MongoDB secara manual.
- Menambahkan global executable `vinnexx`, installer Termux/Desktop, build shebang tunggal, dan permission executable.
- Menghapus artefak lama dari release source, memperketat `.gitignore`, sanitasi error/log, serta menambahkan pemindaian string lama dan credential.

## Instalasi

Persyaratan: Node.js 20.11 atau lebih baru dan npm 10 atau lebih baru.

Dari root source:

```sh
npm install -g .
vinnexx
```

Alternatif installer:

```sh
bash install.sh
vinnexx
```

Untuk development seluruh monorepo:

```sh
bash scripts/install-all.sh
npm run typecheck
npm test
npm run build
```

## Environment server

Nilai rahasia harus dipasang hanya pada environment private server. Jangan commit `.env`.

Wajib:

- `PUBLIC_SITE_URL`
- `API_BASE_URL`
- `MONGODB_URI`
- `COOKIE_SECRET`
- `DEVICE_SECRET_ENCRYPTION_KEY`
- `MODEL_API_KEY`

Opsional:

- `NODE_ENV`
- `HOST`
- `PORT`
- `MONGODB_DB`
- `ADMIN_EMAILS`
- `FREE_HOURLY_TOKENS`
- `CHARACTERS_PER_TOKEN`

Contoh tanpa nilai rahasia tersedia di `apps/server/.env.example`.

## Hasil validasi

Dijalankan pada 25 Juni 2026:

- Dependency install client/server/dashboard: **berhasil**, audit dependency melaporkan 0 vulnerability.
- TypeScript strict typecheck client/server/dashboard: **berhasil**.
- Client unit/integration tests: **12/12 berhasil**.
- Server security tests: **3/3 berhasil**.
- Server HTTP smoke test: **berhasil**.
- Dashboard build dan smoke test: **berhasil**.
- Client, server, dan dashboard production build: **berhasil**.
- Startup guest dan settings storage smoke: **berhasil**.
- Device login polling contract: **berhasil melalui integration test**.
- `/profile`, `/setup`, `/setup edit`, model switch, greeting, dan identitas publik: **berhasil melalui integration test**.
- Create directory serta write/edit/read file: **berhasil**.
- Review-timeout fallback: **berhasil**.
- Global install dari package client dan root monorepo: **berhasil**; `vinnexx --version` menghasilkan `0.3.0`.
- Alternate-screen exit dan cursor restoration: **berhasil melalui pseudo-terminal smoke test**.
- Legacy/internal string dan credential scan: **berhasil**.

Jalankan ulang semuanya dengan:

```sh
npm run verify
```

## Keterbatasan yang diketahui

- Panggilan live ke service model produksi tidak dijalankan karena paket audit tidak menyertakan credential produksi; gateway, timeout, error handling, dan kontrak tool diuji secara lokal.
- Browser approval login produksi tetap bergantung pada dashboard/API deployment yang aktif; polling dan penyimpanan credential lokal telah diuji menggunakan integration double.
- TUI diuji pada pseudo-terminal Linux. Logika path dan installer Termux tersedia, tetapi validasi visual pada perangkat Android fisik belum dilakukan dalam lingkungan audit ini.
