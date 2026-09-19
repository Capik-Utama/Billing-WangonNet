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
