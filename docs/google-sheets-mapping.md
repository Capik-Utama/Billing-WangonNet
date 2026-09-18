# Mapping Google Sheets ke Supabase

Spreadsheet sumber: `5067`  
Spreadsheet ID: `1g2GzzTF214d2-duyuriun-gIGgeHtcxFnXOQO2d4Drg`

## Tab yang dipetakan

| Tab | Tabel tujuan | Catatan |
|---|---|---|
| `Paket` | `internet_packages` | Menyimpan paket, harga, profile MikroTik, dan parameter upload/download. |
| `Area` | `areas` | Menyimpan kode area, nama, kode cabang, dan singkatan area. |
| `ODP` | `odps` | Menyimpan kapasitas, pemakaian, koordinat, kode lokasi, dan nama lokasi. |
| `pelanggan` | `customers`, `customer_network`, `customer_speed_tests` | Dipisah berdasarkan identitas, jaringan, dan hasil pengujian. Kolom sumber tetap disimpan di `raw_record`. |
| `Sheet8` | `pppoe_configs` | Menyimpan kolom konfigurasi asli dan kolom hasil/generated yang muncul pada baris data. |

## Kolom pelanggan

| Kolom spreadsheet | Tabel/kolom Supabase |
|---|---|
| `NO` | `customers.source_no` |
| `Nama` | `customers.name` |
| `Kode Pelanggan` | `customers.customer_code` |
| `Cabang` | `customers.branch_code` |
| `Area` | `customers.area_code` |
| `Paket Internet` | `customers.package_name` |
| `Sales` | `customers.sales_name` |
| `No KTP` | `customers.national_id` |
| `No HP` | `customers.phone` |
| `Email` | `customers.email` |
| `WhatsApp` | `customers.whatsapp` |
| `Alamat` | `customers.address` |
| `RT`, `RW` | `customers.rt`, `customers.rw` |
| `Desa/Kelurahan` | `customers.village` |
| `Kecamatan` | `customers.district` |
| `Kabupaten/Kota` | `customers.city_regency` |
| `Latitude`, `Longitude` | `customers.latitude`, `customers.longitude` |
| `PPPoE Username`, `PPPoE Password` | `customer_network.pppoe_username`, `customer_network.pppoe_password` |
| `ONU Serial` | `customer_network.onu_serial` |
| `OLT`, `PON`, `VLAN` | `customer_network.olt`, `.pon`, `.vlan` |
| `ODP`, `Port ODP` | `customer_network.odp_code`, `.odp_port` |
| `Tipe Modem` | `customer_network.modem_type` |
| `MAC Address` | `customer_network.mac_address` |
| `IP Address` | `customer_network.ip_address` |
| `Redaman ONU`, `Redaman ODP` | `customer_network.onu_attenuation`, `.odp_attenuation` |
| `RX ONT`, `RX ODP` | `customer_network.rx_ont`, `.rx_odp` |
| `Speedtest Download`, `Speedtest Upload` | `customer_speed_tests.download_mbps`, `.upload_mbps` |
| `Ping (ms)`, `Jitter (ms)` | `customer_speed_tests.ping_ms`, `.jitter_ms` |
| `Catatan Test` | `customer_speed_tests.notes` |
| `Tanggal Bergabung` | `customers.join_date` |
| `Hari Tagihan` | `customers.billing_day` |
| `Status` | `customers.status` |
| `Masa Aktif` | `customers.active_period` |
| Kolom kosong dan seluruh kolom sumber | `raw_record` dan `source_sheet_rows.row_data` |

## Kolom tambahan yang disiapkan

Struktur juga menyiapkan data yang belum terdapat sebagai kolom eksplisit pada spreadsheet:

- `data_import_batches` dan `source_sheet_rows` untuk audit, idempotensi, dan menyimpan nilai mentah tanpa kehilangan kolom.
- `company_settings` untuk identitas perusahaan, logo, struk, dan kartu member.
- `member_cards` untuk nomor kartu, barcode/QR, foto, tanggal terbit, dan masa berlaku.
- `payment_types` dan `payment_accounts` untuk jenis pembayaran, rekening, QRIS, serta biaya admin.
- `invoices` dan `payments` untuk tagihan, pembayaran, diskon, biaya admin, sisa tagihan, dan referensi transaksi.
- `notification_templates` dan `notifications` untuk notifikasi WhatsApp, email, SMS, push, dan status pengiriman.

## Kunci dan aturan impor

- Kunci unik pelanggan: `Kode Pelanggan` → `customers.customer_code`.
- Nomor baris `NO` hanya menjadi nomor sumber, bukan primary key.
- Setiap baris sumber disimpan di `source_sheet_rows` dan `raw_record`.
- `Area` menggunakan `area_code`; kolom keempat yang muncul pada data disimpan sebagai `area_abbreviation`.
- `Paket` menggunakan gabungan `branch_code` dan `package_code` sebagai kunci unik.
- Semua tabel menggunakan UUID internal agar relasi tidak bergantung pada nomor baris spreadsheet.
- RLS aktif pada seluruh tabel agar data tidak terbuka melalui API publik sebelum policy akses berbasis role dibuat.
- Password PPPoE harus diperlakukan sebagai data rahasia dan tidak boleh dikirim ke frontend umum.

## Status

Migrasi struktur sudah disiapkan di `supabase/migrations/20260918_prepare_spreadsheet_import.sql`. Tahap ini hanya menyiapkan struktur; belum mengimpor isi spreadsheet.
