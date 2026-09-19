# Billing-WangonNet

Billing-WangonNet adalah dashboard e-billing dengan frontend statis dan API serverless. Seluruh data operasional billing disimpan dan dibaca dari Supabase.

## Komponen utama

- index.html untuk dashboard, login, dan tampilan data pelanggan.
- api/login.js dan api/session.js untuk sesi login aplikasi.
- api/billing.js untuk ringkasan billing dari tabel Supabase.
- api/customers.js untuk akses daftar pelanggan bila dibutuhkan oleh integrasi internal.
- lib/billing.js untuk kalkulasi ringkasan billing dari record database.

## Konfigurasi environment

Environment variable yang digunakan aplikasi:

- SUPABASE_URL.
- SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_SECRET_KEY.
- SUPABASE_PUBLISHABLE_KEY untuk login.
- AUTH_SECRET untuk tanda tangan sesi.

Aplikasi tidak memiliki koneksi, import, export, OAuth, token, atau dependensi terhadap Google Sheets maupun Spreadsheet.
