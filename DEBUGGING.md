# Debugging Vinnexx Code v0.2.0

Semua perbaikan dilakukan di directory source, dites, lalu dipush ke GitHub. Jangan mengedit hasil build langsung di Vercel.

## Aturan umum saat error

```bash
cd ~/vinnexx-code-v0.2.0
pwd
git status
```

Setelah memperbaiki file:

```bash
bash scripts/verify-all.sh
git add .
git commit -m "Fix: explain the error"
git push
```

## 1. `tsc: command not found`

Versi 0.2.0 memiliki `typescript` di masing-masing aplikasi dan Vercel menggunakan `npm ci --include=dev`.

Test server:

```bash
cd ~/vinnexx-code-v0.2.0/apps/server
rm -rf -- node_modules
npm ci --include=dev
npm run typecheck
npm run build
cd ../..
```

Test dashboard:

```bash
cd ~/vinnexx-code-v0.2.0/apps/dashboard
rm -rf -- node_modules
npm ci --include=dev
npm run typecheck
npm run build
cd ../..
```

Pastikan Vercel Root Directory benar dan hapus override Install/Build Command lama dari Vercel UI.

## 2. `npm install --prefix=../.. exited with 1`

Perintah itu tidak dipakai di v0.2.0. Cari sisa command lama:

```bash
cd ~/vinnexx-code-v0.2.0
grep -R --exclude-dir=node_modules --exclude-dir=.git -- "prefix=../.." .
```

Output seharusnya kosong. Root Directory Vercel harus `apps/server` atau `apps/dashboard`, bukan root repository.

## 3. `ETIMEDOUT` saat npm install di Vercel

Itu biasanya timeout jaringan registry, bukan TypeScript error.

Cek konfigurasi lokal:

```bash
cd ~/vinnexx-code-v0.2.0/apps/server
cat .npmrc
npm config get registry
npm ci --include=dev
```

Registry harus:

```text
https://registry.npmjs.org/
```

Di Vercel pilih **Redeploy**, matikan opsi memakai build cache bila tersedia. `.npmrc` v0.2.0 sudah mempunyai retry panjang. Bila outage registry sementara, tunggu beberapa menit lalu redeploy.

## 4. Vercel salah membangun app

Cek:

```text
Server Root Directory    = apps/server
Dashboard Root Directory = apps/dashboard
```

Jangan isi Output Directory untuk server. Dashboard menggunakan `dist` dari `vercel.json`.

Test lokal sesuai app:

```bash
cd ~/vinnexx-code-v0.2.0/apps/server
npm ci --include=dev
npm run build
```

atau:

```bash
cd ~/vinnexx-code-v0.2.0/apps/dashboard
npm ci --include=dev
npm run build
```

## 5. Server deployment selesai tetapi URL memberi 500

Buka Vercel → project server → **Logs**. Penyebab umum adalah environment variable belum lengkap atau MongoDB menolak koneksi.

Cek daftar env yang wajib:

```text
PUBLIC_SITE_URL
API_BASE_URL
MONGODB_URI
MONGODB_DB
COOKIE_SECRET
DEVICE_SECRET_ENCRYPTION_KEY
PUTER_AUTH_TOKEN
PUTER_MODEL
ADMIN_EMAILS
FREE_HOURLY_TOKENS
CHARACTERS_PER_TOKEN
```

Validasi secret lokal tanpa menampilkannya:

```bash
node -e 'const v=process.argv[1]; console.log(Buffer.from(v,"base64url").length)' "ISI_DEVICE_SECRET"
```

Hasil `DEVICE_SECRET_ENCRYPTION_KEY` harus `32`.

Setelah mengubah env Vercel, lakukan Redeploy. Environment variable baru tidak mengubah deployment lama secara otomatis.

## 6. MongoDB `Server selection timed out`

Periksa:

1. Cluster Atlas aktif.
2. Username dan password benar.
3. Karakter khusus password sudah di-URL-encode.
4. Network Access mengizinkan koneksi Vercel.
5. Connection string berakhir pada database `vinnexx`.

Test URI dari source tanpa menyimpannya ke Git:

```bash
cd ~/vinnexx-code-v0.2.0/apps/server
MONGODB_URI='URI_ATLAS' \
MONGODB_DB='vinnexx' \
PUBLIC_SITE_URL='http://127.0.0.1:5173' \
API_BASE_URL='http://127.0.0.1:8787/api/v1' \
COOKIE_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))")" \
DEVICE_SECRET_ENCRYPTION_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))")" \
PUTER_AUTH_TOKEN='test-only' \
npm run dev
```

Lalu terminal lain:

```bash
curl http://127.0.0.1:8787/api/v1/health
```

Hentikan dengan Ctrl+C. Jangan memasukkan URI ke history publik atau screenshot.

## 7. Dashboard gagal memanggil API / CORS

Server env harus tepat:

```text
PUBLIC_SITE_URL=https://vinnexx.zone.id
```

Dashboard env harus tepat:

```text
VITE_API_BASE_URL=https://api.vinnexx.zone.id/api/v1
```

Tidak boleh ada slash tambahan di tengah URL. Setelah perubahan, redeploy kedua project.

Cek runtime config dashboard:

```bash
curl https://vinnexx.zone.id/config.js
```

Cek preflight dasar:

```bash
curl -i -X OPTIONS \
  -H 'Origin: https://vinnexx.zone.id' \
  -H 'Access-Control-Request-Method: POST' \
  https://api.vinnexx.zone.id/api/v1/auth/login
```

## 8. Login browser berhasil tetapi terminal terus menunggu

Cek:

```bash
curl https://api.vinnexx.zone.id/api/v1/health
vinnexx /setup
```

Di dalam Vinnexx gunakan `/setup`, bukan argumen shell. API server harus menunjuk ke `https://api.vinnexx.zone.id/api/v1`.

Hapus auth lokal lalu ulangi login:

```bash
rm -f -- ~/.local/share/vinnexx-code/.vinnexx/auth/account.json
vinnexx
```

Kemudian ketik `/login`.

## 9. Cookie login dashboard tidak tersimpan

Pastikan:

- Dashboard memakai HTTPS.
- API memakai HTTPS.
- `PUBLIC_SITE_URL` sama persis dengan origin dashboard.
- Browser tidak memblokir cookie untuk domain tersebut.
- Source mendeteksi Vercel sebagai production sehingga cookie memakai `Secure`.

Hapus cookie lama untuk kedua domain, lalu login kembali.

## 10. Puter error atau model tidak tersedia

Pastikan env:

```text
PUTER_MODEL=claude-3-5-sonnet-20241022
```

Pastikan model tersebut masih muncul di `puter.ai.listModels()` pada akun production yang sama. Rotasi token bila token pernah bocor.

Jangan memasukkan token ke command yang akan diposting, screenshot, issue, log, GitHub, atau file client.

## 11. Git push ditolak karena history lama

Karena v0.2.0 mengganti isi repository lama:

```bash
cd ~/vinnexx-code-v0.2.0
git push -u origin main --force-with-lease
```

Bila repository sengaja sudah dikosongkan dan `--force-with-lease` ditolak karena referensi lokal belum ada:

```bash
git fetch origin
git push -u origin main --force
```

Setelah itu kembali gunakan `git push` biasa.

## 12. Release installer memberi 404

Pastikan GitHub Release sudah **Published**, bukan draft, dan memiliki dua asset dengan nama persis:

```text
vinnexx-code.zip
vinnexx-code.zip.sha256
```

Test:

```bash
curl -I -L https://github.com/zyx72/vinnexx-code/releases/latest/download/vinnexx-code.zip
curl -I -L https://github.com/zyx72/vinnexx-code/releases/latest/download/vinnexx-code.zip.sha256
```

## 13. Checksum installer gagal

Bangun ulang kedua file bersama-sama:

```bash
cd ~/vinnexx-code-v0.2.0
npm run build:client
npm run package:release
cat release/vinnexx-code.zip.sha256
```

Upload ZIP dan checksum dari build yang sama. Jangan membuat ulang salah satunya saja.

## 14. Verifikasi total sebelum meminta bantuan

```bash
cd ~/vinnexx-code-v0.2.0
node -v
npm -v
bash scripts/verify-all.sh
git status
```

Simpan log error mulai dari baris pertama yang mengandung `error`, bukan hanya baris terakhir.
