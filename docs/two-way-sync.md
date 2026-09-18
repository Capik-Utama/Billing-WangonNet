# Sinkronisasi dua arah data Billing-WangonNet

Sinkronisasi hanya menulis **nilai data**. Kolom formula spreadsheet tidak ditulis oleh aplikasi.

## Arah sinkronisasi

- Spreadsheet ke Supabase: fungsi `onEditInstallable` mengirim baris yang diedit ke `/api/sync`.
- Billing ke Spreadsheet: fungsi `syncBillingChanges` mengambil pelanggan yang berubah dari Supabase dan memperbarui kolom data pada tab `pelanggan`.
- Pengulangan dicegah dengan HMAC `SYNC_SECRET`, kunci unik baris sumber, dan penanda `LAST_BILLING_SYNC`.

## Aktivasi satu kali di Google Apps Script

Buat project Apps Script **bound** pada spreadsheet `5067`, lalu salin `sync-script/Code.gs` dan `sync-script/appsscript.json`. Pada Script Properties, isi:

- `SYNC_ENDPOINT`: `https://billing-wangon-net.vercel.app/api/sync`
- `SYNC_SECRET`: nilai privat environment `SYNC_SECRET` pada project Vercel `billing-wangon-net`

Jalankan `configureSync(SYNC_ENDPOINT, SYNC_SECRET)` sekali, lalu setujui izin Spreadsheet dan koneksi eksternal. Setelah itu buat dua trigger installable:

1. Event source: **From spreadsheet**, event type: **On edit**, function: `onEditInstallable`.
2. Event source: **Time-driven**, interval misalnya setiap 5 menit, function: `syncBillingChanges`.

Jalankan `syncAllDataRows` sekali untuk rekonsiliasi awal. Formula tidak ikut ditulis karena fungsi tersebut hanya mengirim data ke backend, sedangkan sinkronisasi balik secara eksplisit mengecualikan kolom formula `W`, `X`, `AA`, dan `AB` pada tab `pelanggan`.

Jika Apps Script API pada akun belum memiliki scope `script.projects`, buat project bound secara manual dari menu **Extensions → Apps Script** pada spreadsheet. Ini adalah otorisasi Google satu kali dan tidak mengubah isi spreadsheet.
