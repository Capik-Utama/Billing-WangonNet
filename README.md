# Billing-WangonNet

Billing-WangonNet adalah dashboard e-billing sederhana dengan frontend statis (`index.html`) dan API serverless di folder `api/`.

## Komponen utama

- `index.html` untuk dashboard, login, dan tampilan data pelanggan
- `api/login.js` dan `api/session.js` untuk sesi login aplikasi
- `api/billing.js` untuk ringkasan billing berbasis data pelanggan Supabase
- `api/customers.js` untuk daftar pelanggan, ekspor CSV, dan impor manual data pelanggan
- `lib/billing.js` untuk kalkulasi ringkasan billing

## Status sinkronisasi Google Sheets

Fitur sinkronisasi dua arah antara billing, Supabase, dan Google Sheets sudah dipensiunkan setelah implementasinya gagal. Repository ini tidak lagi memakai endpoint sinkronisasi `/api/sync`, Apps Script Google Sheets, atau environment variable `SYNC_SECRET`.

Google Sheets hanya tersisa sebagai sumber referensi snapshot lokal dan opsi impor manual yang bersifat terpisah dari alur billing normal.

## Konfigurasi environment

Environment variable berikut adalah variabel yang saat ini direferensikan langsung oleh kode di repository ini:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` atau `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY` untuk login
- `AUTH_SECRET`
- `GOOGLE_SHEET_ID` dan `GOOGLE_SHEET_CUSTOMERS_GID` hanya bila ingin memakai impor manual pelanggan dari Google Sheets

Impor manual Google Sheets pada implementasi saat ini memakai endpoint ekspor CSV publik milik Google Sheets dari `api/customers.js`, sehingga repository ini tidak menyertakan konfigurasi service account Google tambahan.

## Modul Data Paket

Tab `Paket` mendukung proses manual dua arah melalui Billing tanpa Apps Script otomatis. Tombol `Import from Spreadsheet` membaca baris Paket, memfilter kode paket kosong/duplikat, lalu melakukan insert atau update ke tabel `internet_packages`. Tombol `Export ke Spreadsheet` memperbarui baris yang cocok dan menambahkan paket baru berdasarkan gabungan `Cabang` + `Kode Paket`; kolom yang terdeteksi berisi formula tidak pernah ditimpa.

Untuk koneksi Google Sheets pada deployment, set `GOOGLE_SHEET_ID` dan `GOOGLE_SERVICE_ACCOUNT_JSON` berisi isi JSON service account Google. Alternatifnya, simpan JSON tersebut sebagai Base64 pada `GOOGLE_SERVICE_ACCOUNT_JSON_B64`. Berikan alamat `client_email` service account sebagai **Editor** pada file Spreadsheet. Aplikasi membuat access token singkat secara server-side; private key tidak pernah dikirim ke browser. Token CLI lokal `GOOGLE_WORKSPACE_CLI_TOKEN` dipakai hanya untuk pengujian di sandbox dan tidak boleh disalin ke repository.

Langkah setup service account:

1. Buat service account pada Google Cloud project yang memiliki akses Google Sheets API.
2. Aktifkan Google Sheets API pada project tersebut.
3. Download JSON key service account secara aman.
4. Salin nilai `client_email` dari JSON tersebut.
5. Buka Spreadsheet dan bagikan kepada `client_email` itu dengan akses **Editor**.
6. Simpan seluruh isi JSON sebagai environment variable rahasia `GOOGLE_SERVICE_ACCOUNT_JSON` pada deployment Billing.

Jangan commit file JSON key ke repository dan jangan menaruh private key di `index.html`.

## Data Akun dan login Google

Menu `Kelola Data → Data Akun` menyediakan login Google melalui OAuth serta kolom target file Spreadsheet. Aplikasi tidak meminta atau menyimpan password Google. Setelah login, refresh token disimpan sebagai cookie HttpOnly dan digunakan server untuk membaca/menulis Spreadsheet saat tombol manual dijalankan.

OAuth memerlukan environment variable `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, dan `AUTH_SECRET`. Redirect URI production saat ini adalah `https://billing-wangon-net.vercel.app/api/google-auth?action=callback`; URI tersebut harus terdaftar persis di Google Cloud OAuth Client. Scope yang diminta adalah profil email dan `https://www.googleapis.com/auth/spreadsheets`. Akun Google yang login tetap harus memiliki akses Editor terhadap target Spreadsheet.
