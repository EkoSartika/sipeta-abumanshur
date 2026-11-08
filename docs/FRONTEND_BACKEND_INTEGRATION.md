# DOKUMEN INTEGRASI FRONTEND & BACKEND (SIPETA)
## Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur
**Tanggal:** 8 November 2026  
**Status Saat Ini:** **TERINTEGRASI PENUH (Dual-Mode: Standalone Demo & Ready for Dedicated Project)**  
**Dokumen Referensi:** PRD v1.0 Bab 2, 5, 6, 7, 8, 9, 10

---

## 1. Arsitektur Dual-Mode Context (`SipetaProvider`)

Aplikasi SIPETA mengimplementasikan arsitektur **Dual-Mode State Context** untuk memastikan aplikasi dapat langsung digunakan untuk demonstrasi/evaluasi mandiri saat ini, dan langsung beralih ke PostgreSQL Supabase begitu project khusus disediakan:

```
                       [ SipetaProvider ]
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
      [ Mode Supabase Khusus ]           [ Mode Simulasi Mandiri ]
- Status: "Supabase Project Khusus Terhubung" - Status: "Mode Simulasi Mandiri"
- dataSource: "supabase"                 - dataSource: "demo"
- Operasional dari DB PostgreSQL         - Operasional dari In-Memory + localStorage
- RPC atomic transactions                - Simulasi aturan bisnis terverifikasi
- Data riil dari tabel cloud             - Reset data dapat dilakukan kapan saja
```

### 1.1 Indikator Status Koneksi Riil
Pada Top Bar antarmuka pengguna (`src/app/page.tsx`):
- **Kuning (`Mode Simulasi Mandiri (Menunggu Project Supabase Khusus)`):** Aktif secara transparan saat project khusus belum dihubungkan.
- **Abu-abu Berkedip (`Memeriksa Koneksi Database...`):** Aktif saat aplikasi melakukan probing kesehatan koneksi.
- **Hijau Berkedip (`Supabase Project Khusus Terhubung`):** Aktif saat query ping ke tabel `rekening_pesantren` berhasil dan latensi jaringan terukur.

---

## 2. Integrasi 5 Ruang Kerja Role

### 2.1 Ruang Kerja Wali Santri (`WaliPortal`)
- **Isolasi 1:1:** Hanya dapat melihat data santri yang terhubung dengan akun profilnya (`santri_id`).
- **Pembayaran Tagihan:** Pemilihan multi-tagihan ke keranjang, validasi nominal cicilan terhadap kebijakan cicilan, upload bukti transfer ke bucket `bukti-pembayaran`, dan eksekusi `keuanganService.checkoutPembayaran()`.
- **Uang Saku:** Menampilkan saldo terkini, riwayat mutasi debit/kredit, dan formulir pengajuan top-up (`keuanganService.submitTopupUangSaku()`).
- **Monitoring Santri:** Kartu mengaji, capaian juz/ayat tahfidz, piagam prestasi, dan catatan pembinaan/kedisiplinan.

### 2.2 Ruang Kerja Bendahara (`BendaharaPortal`)
- **Verifikasi Tunggal Transaksi:** Daftar pengajuan pembayaran menunggu verifikasi. Menyetujui atau menolak dengan catatan melalui `keuanganService.verifikasiPembayaran()`.
- **Verifikasi Top-Up Saku:** Menyetujui top-up dengan mutasi kredit otomatis ke ledger santri melalui `keuanganService.verifikasiTopupUangSaku()`.
- **Penyerahan Uang Saku Fisik:** Formulir wajib foto penyerahan yang divalidasi MIME dan ukuran file, diverifikasi saldo cukup, kemudian mencatat mutasi debit via `keuanganService.catatPenyerahanUangSaku()`.
- **Jurnal Koreksi:** Tambah/kurang penyesuaian ledger secara permanen via `keuanganService.koreksiLedgerUangSaku()`.

### 2.3 Ruang Kerja Administrator (`AdminPortal`)
- **Pendaftaran Santri & Wali:** Pendaftaran santri sekaligus pembuatan akun wali dengan pencegahan duplikasi NIS.
- **Penempatan Santri:** Pemindahan kelas dan kamar dengan pencatatan riwayat perpindahan.
- **Manajemen Tagihan:** Pembuatan tagihan masal, pemantauan status lunas/cicilan, dan penyesuaian tagihan.
- **Pengumuman:** Pembuatan dan publikasi pengumuman ke seluruh portal.

### 2.4 Ruang Kerja Pengelola Kepesantrenan (`PengelolaPortal`)
- **Input Perkembangan Mengaji:** Jilid, tajwid, makharijul huruf, kelancaran bacaan.
- **Setoran Tahfidz:** Nama surah, juz, ayat awal/akhir, kualitas bacaan (`Mumtaz`, `Jayyid`).
- **Prestasi Santri:** Kategori lomba, tingkat kejuaraan, sertifikat dokumentasi.
- **Kedisiplinan Santri:** Pencatatan insiden pelanggaran, poin pembinaan, dan pembaruan status tindak lanjut yang otomatis mengarsipkan riwayat catatan sebelumnya.

### 2.5 Ruang Kerja Superadmin (`SuperadminPortal`)
- **Manajemen Akun & Role:** Pembuatan akun melalui server endpoint `/api/admin/users`, aktivasi/nonaktifasi pengguna secara instan.
- **Pengaturan Rekening Pesantren:** Mengubah rekening tunggal resmi pesantren (nama bank, nomor rekening, atas nama).
- **Audit Logs:** Jejak audit append-only dari seluruh mutasi data sensitif sistem.

---

## 3. Integrasi Storage: Upload & Signed URLs

- File diunggah melalui `storageService.uploadFile()`.
- Akses gambar atau bukti transfer dari private bucket di-render menggunakan Signed URLs temporer yang dibuat melalui `storageService.getSignedUrl(bucket, path, 900)` atau Route Handler `/api/signed-url`.
- Pengguna yang tidak berhak diblokir oleh Storage RLS policies di level database.
