# Deployment Vinnexx Code v0.2.0 dari Nol

Dokumen ini memakai satu repository GitHub (`zyx72/vinnexx-code`) dan dua project Vercel yang terhubung ke repository yang sama:

| Project Vercel | Root Directory | Domain |
|---|---|---|
| `vinnexx-server` | `apps/server` | `api.vinnexx.zone.id` |
| `vinnexx-dashboard` | `apps/dashboard` | `vinnexx.zone.id` |

`apps/client` tidak di-deploy ke Vercel. Client dibangun menjadi release ZIP dan dipasang di terminal melalui `install.sh`.

## 0. Persiapan Termux

Jalankan dari home Termux:

```bash
cd ~
pkg update -y
pkg install -y nodejs-lts git unzip zip curl
node -v
npm -v
git --version
```

Node.js minimal 20.11 dan npm minimal 10.

Bila ZIP berada di penyimpanan Android dan Termux belum memiliki izin:

```bash
termux-setup-storage
```

## 1. Hapus project lama secara aman

Pastikan posisi saat ini benar:

```bash
cd ~
pwd
ls
```

Hapus hanya folder project lama yang memang bernama `vinnexx-code` atau `vinnexxcode`:

```bash
rm -rf -- ~/vinnexx-code ~/vinnexxcode
```

Perintah tersebut tidak menyentuh folder lain.

## 2. Ekstrak source v0.2.0

Contoh bila file ada di Download Android:

```bash
cd ~
unzip /sdcard/Download/vinnexx-code-v0.2.0-source.zip
cd ~/vinnexx-code-v0.2.0
```

Pastikan struktur benar:

```bash
pwd
ls
ls apps/client apps/server apps/dashboard
```

## 3. Verifikasi source sebelum push

Dari root project:

```bash
cd ~/vinnexx-code-v0.2.0
bash scripts/verify-all.sh
```

Script ini melakukan:

1. `npm ci` secara terpisah di client, server, dan dashboard.
2. Typecheck ketiga aplikasi.
3. Unit test client dan server.
4. HTTP smoke test server.
5. Production build ketiga aplikasi.
6. Pemeriksaan struktur deploy.
7. Pembuatan release client dan SHA-256.
8. Simulasi instalasi client ke folder sementara.

Hasil akhir yang benar:

```text
[>_] Vinnexx Code v0.2.0 verification completed.
```

## 4. Push source ke GitHub

Repository tujuan:

```text
https://github.com/zyx72/vinnexx-code
```

Dari root project:

```bash
cd ~/vinnexx-code-v0.2.0
rm -rf -- .git
git init
git branch -M main
git remote add origin https://github.com/zyx72/vinnexx-code.git
git add .
git commit -m "Release Vinnexx Code v0.2.0"
git push -u origin main --force
```

`--force` diperlukan hanya karena repository lama sengaja diganti seluruh isinya. Setelah push pertama berhasil, push berikutnya cukup:

```bash
git add .
git commit -m "Describe the change"
git push
```

Jangan pernah push file `.env`, `node_modules`, atau token production. `.gitignore` sudah memblokirnya.

## 5. Buat MongoDB Atlas Free Tier

1. Buat project baru di MongoDB Atlas.
2. Buat cluster Free/M0.
3. Buat database user dengan password acak yang panjang.
4. Beri user hanya akses `readWrite` ke database `vinnexx` bila opsi tersebut tersedia.
5. Buka **Network Access**.
6. Karena Vercel Hobby tidak memiliki satu IP keluar tetap, untuk pengujian awal biasanya perlu `0.0.0.0/0`. Gunakan password database yang sangat kuat. Untuk production lebih ketat, gunakan hosting dengan IP keluar tetap atau fitur jaringan privat.
7. Tekan **Connect → Drivers → Node.js** dan salin connection string.
8. Ganti `<password>` dengan password database user dan pastikan nama database adalah `vinnexx`.

Contoh bentuknya:

```text
mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/vinnexx?retryWrites=true&w=majority
```

Jangan tulis connection string asli di source atau GitHub.

## 6. Buat secret server

Jalankan di Termux:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- Output pertama → `COOKIE_SECRET`
- Output kedua → `DEVICE_SECRET_ENCRYPTION_KEY`

Simpan secara pribadi.

Token Puter yang pernah dikirim ke chat atau log harus dianggap bocor dan dirotasi. Gunakan token baru hanya sebagai environment variable server.

## 7. Deploy server ke Vercel

### 7.1 Buat project

1. Buka Vercel Dashboard.
2. Pilih **Add New → Project**.
3. Import repository `zyx72/vinnexx-code`.
4. Ubah **Root Directory** menjadi:

```text
apps/server
```

5. Nama project yang disarankan:

```text
vinnexx-server
```

6. Jangan mengisi override Build Command, Install Command, atau Output Directory di UI. `apps/server/vercel.json` sudah mengatur instalasi dan build.

### 7.2 Tambahkan environment variables

Tambahkan untuk Production, Preview, dan Development bila diperlukan:

```text
PUBLIC_SITE_URL=https://vinnexx.zone.id
API_BASE_URL=https://api.vinnexx.zone.id/api/v1
MONGODB_URI=<connection string Atlas>
MONGODB_DB=vinnexx
COOKIE_SECRET=<output secret pertama>
DEVICE_SECRET_ENCRYPTION_KEY=<output secret kedua>
PUTER_AUTH_TOKEN=<token Puter production baru>
PUTER_MODEL=claude-3-5-sonnet-20241022
ADMIN_EMAILS=lordkevin404@gmail.com
FREE_HOURLY_TOKENS=1000
CHARACTERS_PER_TOKEN=5
```

Tidak perlu mengisi `HOST` atau `PORT` di Vercel. Source mendeteksi lingkungan Vercel sebagai production.

### 7.3 Deploy dan pasang domain

1. Tekan **Deploy**.
2. Setelah deployment sukses, buka **Settings → Domains**.
3. Tambahkan:

```text
api.vinnexx.zone.id
```

4. Ikuti record DNS yang diberikan Vercel.
5. Setelah domain aktif, lakukan **Redeploy** agar semua environment variable digunakan oleh deployment terbaru.

### 7.4 Test server

Dari Termux:

```bash
curl -i https://api.vinnexx.zone.id/api/v1/health
```

Hasil benar memiliki HTTP 200 dan JSON yang mengandung:

```json
{
  "data": {
    "status": "ok",
    "service": "vinnexx-server",
    "version": "0.2.0"
  }
}
```

## 8. Deploy dashboard ke Vercel

### 8.1 Buat project kedua

1. Vercel Dashboard → **Add New → Project**.
2. Import repository GitHub yang sama: `zyx72/vinnexx-code`.
3. Ubah **Root Directory** menjadi:

```text
apps/dashboard
```

4. Nama project yang disarankan:

```text
vinnexx-dashboard
```

5. Jangan override command di UI. `apps/dashboard/vercel.json` sudah menentukan:
   - `npm ci --include=dev`
   - `npm run build`
   - output `dist`
   - SPA rewrite ke `index.html`

### 8.2 Environment variable dashboard

Tambahkan:

```text
VITE_API_BASE_URL=https://api.vinnexx.zone.id/api/v1
```

Lalu deploy.

### 8.3 Pasang domain

Di project dashboard, buka **Settings → Domains**, lalu tambahkan:

```text
vinnexx.zone.id
```

Ikuti DNS Vercel, lalu lakukan Redeploy setelah environment variable dan domain selesai.

### 8.4 Test dashboard

```bash
curl -I https://vinnexx.zone.id
curl https://vinnexx.zone.id/config.js
```

`config.js` harus menunjuk ke:

```text
https://api.vinnexx.zone.id/api/v1
```

Buka dashboard di browser, buat akun, login, dan buka halaman Account.

## 9. Test koneksi terminal ke akun

Sebelum membuat GitHub Release, client dapat dites langsung dari source:

```bash
cd ~/vinnexx-code-v0.2.0
npm run build:client
VINNEXX_API_URL=https://api.vinnexx.zone.id/api/v1 node apps/client/dist/vinnexx.mjs
```

Di CLI:

```text
/login
```

Browser harus terbuka ke halaman koneksi Vinnexx. Login ke dashboard, setujui device, lalu terminal harus otomatis terhubung.

Test berikutnya:

```text
/status
/model
/memory set language Indonesian
/memory
```

Lalu beri prompt sederhana di folder uji, bukan di folder penting.

## 10. Buat GitHub Release client

Dari root project:

```bash
cd ~/vinnexx-code-v0.2.0
npm run package:release
ls -lh release/
```

File yang dihasilkan:

```text
release/vinnexx-code.zip
release/vinnexx-code.zip.sha256
```

Di GitHub:

1. Repository → **Releases**.
2. **Draft a new release**.
3. Tag: `v0.2.0`.
4. Title: `Vinnexx Code v0.2.0`.
5. Upload dua file di atas tanpa mengganti nama.
6. Publish release.

Installer mengambil asset dari:

```text
https://github.com/zyx72/vinnexx-code/releases/latest/download/vinnexx-code.zip
```

## 11. Test instalasi publik

Gunakan terminal bersih atau hapus instalasi lokal lama:

```bash
rm -rf -- ~/.local/share/vinnexx-code
rm -f -- "$PREFIX/bin/vinnexx" 2>/dev/null || true
rm -f -- ~/.local/bin/vinnexx 2>/dev/null || true
```

Install:

```bash
curl -fsSL https://raw.githubusercontent.com/zyx72/vinnexx-code/main/install.sh | bash
```

Test:

```bash
vinnexx --version
vinnexx
```

Versi harus `0.2.0`.

## 12. Urutan update setelah ada perubahan

Selalu jalankan dari root project:

```bash
cd ~/vinnexx-code-v0.2.0
bash scripts/verify-all.sh
git status
git add .
git commit -m "Fix: describe the change"
git push
```

Vercel akan men-deploy server dan dashboard yang terhubung ke repository tersebut. Untuk update client publik, buat GitHub Release baru atau ganti asset pada release versi yang sesuai.
