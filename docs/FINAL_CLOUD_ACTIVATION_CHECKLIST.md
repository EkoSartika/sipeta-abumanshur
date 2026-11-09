# DOKUMEN VERIFIKASI AKTIVASI CLOUD & RUNBOOK PRODUKSI SIPETA
**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur**
**Status Audit Cloud**: Audit Non-Mutasi Selesai (Empiris & Terverifikasi)  
**Tanggal Audit**: 9 November 2026  
**Target Environment**: Supabase Cloud Production (`jvhzrh...supabase.co`)  
**Production URL**: `https://sipeta-abumanshur.vercel.app`

---

## 1. HASIL AUDIT KONDISI AKTUAL SUPABASE CLOUD (READ-ONLY)

Pemeriksaan empiris langsung telah dijalankan terhadap proyek Supabase Cloud resmi menggunakan Service Role Key read-only tanpa melakukan mutasi data, tanpa menjalankan migrasi paksa, dan tanpa menyisipkan baris uji coba (zero seed / zero mutation).

### 1.1 Status Akun Superadmin Resmi Pesantren
- **Auth User ID**: `af7315fd-a82f-4c73-9bd1-4967d038ae7e`
- **Email**: `sipetaabumanshur@gmail.com`
- **Status Email**: Confirmed (`email_verified: true`)
- **Profil di `public.profiles`**: DITEMUKAN (`is_active: true`, `role: superadmin`, `nama_lengkap: Superadmin SIPETA Abu Manshur`)
- **Integritas Sandi**: Utuh dan tidak mengalami perubahan.
- **Catatan Kolom Username**: Nilai username saat ini masih `null` karena migrasi `009` belum dieksekusi di Cloud. Begitu migrasi `009` dijalankan, akun ini secara otomatis mendapatkan username `'superadmin'`.

### 1.2 Status 27 Tabel Skema Database
Seluruh 27 tabel operasional SIPETA telah terbentuk secara utuh di Supabase Cloud:
| No | Nama Tabel | Status Cloud | Jumlah Baris Data | Keterangan |
|---|---|---|---|---|
| 1 | `profiles` | TERSEDIA | 1 baris | Berisi 1 akun resmi Superadmin Pesantren |
| 2 | `tahun_ajaran` | TERSEDIA | 0 baris | Siap diisi master data tahun ajaran |
| 3 | `kelas` | TERSEDIA | 0 baris | Siap diisi master data kelas |
| 4 | `kamar` | TERSEDIA | 0 baris | Siap diisi master data kamar/asrama |
| 5 | `santri` | TERSEDIA | 0 baris | Siap menerima import Excel / penambahan santri |
| 6 | `wali_santri` | TERSEDIA | 0 baris | Relasi akun wali santri |
| 7 | `riwayat_penempatan_santri` | TERSEDIA | 0 baris | Audit trail pemindahan kelas/kamar |
| 8 | `rekening_pesantren` | TERSEDIA | 0 baris | Rekening resmi pesantren (belum dikonfigurasi) |
| 9 | `jenis_pembayaran` | TERSEDIA | 0 baris | Pos pembayaran/tarif |
| 10 | `tagihan` | TERSEDIA | 0 baris | Tagihan berkala santri |
| 11 | `keranjang_pembayaran` | TERSEDIA | 0 baris | Multi-item checkout wali |
| 12 | `item_keranjang_pembayaran` | TERSEDIA | 0 baris | Relasi rincian keranjang |
| 13 | `transaksi_pembayaran` | TERSEDIA | 0 baris | Transaksi pembayaran transfer |
| 14 | `alokasi_pembayaran` | TERSEDIA | 0 baris | Breakdown alokasi ke tagihan |
| 15 | `pembayaran_cicilan` | TERSEDIA | 0 baris | Catatan cicilan tagihan |
| 16 | `saldo_uang_saku` | TERSEDIA | 0 baris | Ledger saldo saku santri |
| 17 | `pengajuan_topup_saku` | TERSEDIA | 0 baris | Pengajuan isi ulang saku |
| 18 | `mutasi_uang_saku` | TERSEDIA | 0 baris | Mutasi debit/kredit uang saku |
| 19 | `setoran_tahfidz` | TERSEDIA | 0 baris | Log setoran hafalan Qur'an |
| 20 | `catatan_akademik` | TERSEDIA | 0 baris | Raport/perkembangan belajar santri |
| 21 | `pelanggaran_disiplin` | TERSEDIA | 0 baris | Catatan pelanggaran santri |
| 22 | `riwayat_pembinaan_disiplin`| TERSEDIA | 0 baris | Log pembinaan kepesantrenan |
| 23 | `prestasi_santri` | TERSEDIA | 0 baris | Catatan prestasi santri |
| 24 | `pengumuman` | TERSEDIA | 0 baris | Papan pengumuman resmi |
| 25 | `notifikasi` | TERSEDIA | 0 baris | Notifikasi in-app pengguna |
| 26 | `audit_logs` | TERSEDIA | 0 baris | Log audit append-only |
| 27 | `template_import_santri` | TERSEDIA | 0 baris | Definisi kolom template import Excel |

### 1.3 Status Storage Buckets
Seluruh 4 Storage Bucket operasional telah aktif dengan konfigurasi **PRIVATE**:
1. `bukti-pembayaran` (Private / `public: false`) — Bukti transfer pembayaran perbankan wali santri.
2. `bukti-uang-saku` (Private / `public: false`) — Bukti transfer top-up uang saku wali santri.
3. `foto-penyerahan-saku` (Private / `public: false`) — Foto bukti serah terima uang tunai santri oleh bendahara.
4. `dokumentasi-kepesantrenan` (Private / `public: false`) — Arsip dokumen pendukung santri/pesantren.

### 1.4 Status Fungsi RPC & Triggers
Seluruh fungsi bisnis utama dari Migrasi `0006` telah aktif di schema cache Supabase Cloud dan terbukti memvalidasi otorisasi serta parameter secara ketat:
- `get_my_role()`: AKTIF
- `get_my_santri_id()`: AKTIF
- `rpc_checkout_pembayaran`: AKTIF
- `rpc_verifikasi_pembayaran`: AKTIF
- `rpc_verifikasi_topup_uang_saku`: AKTIF
- `rpc_catat_penyerahan_uang_saku`: AKTIF
- `rpc_koreksi_ledger_uang_saku`: AKTIF
- `rpc_unggah_bukti_transfer_pembayaran`: AKTIF
- `rpc_penyesuaian_tagihan`: AKTIF

### 1.5 Status Kesenjangan Migrasi (Delta Analysis)
Berdasarkan pemeriksaan kolom dan RLS, Supabase Cloud saat ini berada pada tahap **Migrasi 0001 hingga 0007**.
Migrasi berikut **BELUM DITERAPKAN DI CLOUD**:
1. **008_security_remediation.sql**: Penguncian RLS dari default `public` menjadi `TO authenticated` (saat ini tabel `tagihan` masih dapat dibaca oleh anonymous).
2. **009_username_support.sql**: Penambahan kolom `username` pada `public.profiles`, backfill `'superadmin'`, dan unique index case-insensitive.
3. **010_safe_delete_and_management.sql**: Penambahan kolom `deleted_at` dan `deleted_by` pada `santri`, `kelas`, `kamar`, serta trigger pencegahan penghapusan fisik jika terdapat relasi aktif.
4. **011_must_change_password_and_import.sql**: Penambahan kolom `must_change_password` pada `public.profiles` untuk pengamanan login pertama wali santri.
5. **012_admin_rekening_and_role_matrix.sql**: Pembaharuan izin RLS pada `rekening_pesantren` agar Admin Administrasi dan Superadmin dapat mengelola rekening resmi pesantren.

---

## 2. RUNBOOK MIGRASI CLOUD ADMINISTRATOR

> [!IMPORTANT]
> Jalankan kelima file migrasi berikut **secara berurutan (008 -> 009 -> 010 -> 011 -> 012)** melalui **Supabase Dashboard > SQL Editor**.
> Seluruh migrasi bersifat **non-breaking, idempotent (`IF NOT EXISTS`), dan transactional (`BEGIN ... COMMIT`)**.
> Migrasi tidak menghapus data apa pun dan melindungi akun Superadmin `sipetaabumanshur@gmail.com`.

### 2.1 Migrasi 008: Security Remediation & RLS Hardening
- **File**: `supabase/migrations/008_security_remediation.sql`
- **Tujuan**: Mengunci seluruh 27 tabel operasional agar hanya dapat diakses oleh user terautentikasi (`TO authenticated`), menutup kebocoran anon pada tabel tagihan, serta merapikan policy Storage.
- **Cara Eksekusi**: Buka SQL Editor di Supabase Dashboard, salin isi file `008_security_remediation.sql`, lalu klik **Run**.
- **Query Verifikasi Pasca-Migrasi**:
  ```sql
  -- Verifikasi: Pastikan role anon tidak memiliki akses baca pada tagihan
  SELECT schemaname, tablename, policyname, roles, cmd 
  FROM pg_policies 
  WHERE tablename = 'tagihan';
  ```

### 2.2 Migrasi 009: Username Support for Internal Accounts
- **File**: `supabase/migrations/009_username_support.sql`
- **Tujuan**: Menambahkan kolom `username` pada `public.profiles`, backfill `username = 'superadmin'` untuk `sipetaabumanshur@gmail.com`, dan membuat Unique Index Case-Insensitive.
- **Cara Eksekusi**: Salin isi file `009_username_support.sql`, lalu klik **Run**.
- **Query Verifikasi Pasca-Migrasi**:
  ```sql
  SELECT id, email, username, role, is_active 
  FROM public.profiles 
  WHERE email = 'sipetaabumanshur@gmail.com';
  -- Hasil yang diharapkan: username = 'superadmin', role = 'superadmin', is_active = true
  ```

### 2.3 Migrasi 010: Safe Deletion, Soft-Delete Auditing & Relational Integrity
- **File**: `supabase/migrations/010_safe_delete_and_management.sql`
- **Tujuan**: Menambahkan kolom `deleted_at` dan `deleted_by` pada tabel `santri`, `kelas`, dan `kamar`, serta trigger pencegahan penghapusan data master yang memiliki riwayat keuangan/akademik.
- **Cara Eksekusi**: Salin isi file `010_safe_delete_and_management.sql`, lalu klik **Run**.
- **Query Verifikasi Pasca-Migrasi**:
  ```sql
  SELECT table_name, column_name, data_type 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name IN ('santri', 'kelas', 'kamar') 
    AND column_name IN ('deleted_at', 'deleted_by');
  -- Hasil yang diharapkan: 6 baris (2 kolom untuk masing-masing dari 3 tabel)
  ```

### 2.4 Migrasi 011: Must Change Password Support & NIS-Based Wali Accounts
- **File**: `supabase/migrations/011_must_change_password_and_import.sql`
- **Tujuan**: Menambahkan kolom `must_change_password` (BOOLEAN DEFAULT FALSE) pada `public.profiles` dan partial index untuk mengunci akses akun wali sebelum mengganti kata sandi bawaan (NIS).
- **Cara Eksekusi**: Salin isi file `011_must_change_password_and_import.sql`, lalu klik **Run**.
- **Query Verifikasi Pasca-Migrasi**:
  ```sql
  SELECT column_name, data_type, column_default 
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'must_change_password';
  -- Hasil yang diharapkan: column_name = 'must_change_password', data_type = 'boolean', column_default = 'false'
  ```

### 2.5 Migrasi 012: Admin Rekening Management & Role Matrix
- **File**: `supabase/migrations/012_admin_rekening_and_role_matrix.sql`
- **Tujuan**: Memberikan otorisasi kepada role `admin` (Admin Administrasi) bersama `superadmin` untuk menambah, mengubah, dan mengaktifkan rekening resmi pesantren.
- **Cara Eksekusi**: Salin isi file `012_admin_rekening_and_role_matrix.sql`, lalu klik **Run**.
- **Query Verifikasi Pasca-Migrasi**:
  ```sql
  SELECT policyname, roles, cmd, qual, with_check 
  FROM pg_policies 
  WHERE tablename = 'rekening_pesantren';
  -- Hasil yang diharapkan: Policy "Rekening Pesantren: superadmin dan admin dapat mengelola" aktif untuk ALL cmd
  ```

---

## 3. DAFTAR PERIKSA PENGUJIAN PRODUKSI TANPA MUTASI DATA

Pengujian kesiapan produksi berikut dirancang untuk dijalankan secara bertahap tanpa risiko merusak integritas database operasional.

### FASE 1: Pengujian Langsung Menggunakan Akun Superadmin
Dapat dilakukan segera setelah migrasi 008-012 diterapkan di Cloud:
- [ ] **Pemeriksaan `/api/health`**: Buka `https://sipeta-abumanshur.vercel.app/api/health` di browser. Respons harus menunjukkan status database terhubung secara live.
- [ ] **Login Portal Superadmin**:
  - URL: `https://sipeta-abumanshur.vercel.app/login`
  - Kredensial: Email `sipetaabumanshur@gmail.com` atau Username `superadmin` + sandi resmi Superadmin.
  - Verifikasi: Berhasil masuk ke antarmuka Superadmin tanpa kendala otentikasi.
- [ ] **Navigasi Sidebar Tunggal Superadmin**:
  - Menu 1: **Manajemen Akun & Role** (Daftar akun menampilkan 1 pengguna: Superadmin).
  - Menu 2: **Rekening Resmi Pesantren** (Tampil kosong / form penambahan rekening tersedia).
  - Menu 3: **Jejak Audit / Audit Log** (Menampilkan tabel log audit sistem).
  - Menu 4: **Pusat Laporan & Analitik** (Menampilkan ringkasan eksekutif).
- [ ] **Verifikasi Modal Buat Akun Internal**:
  - Klik tombol **Buat Pengguna Baru**.
  - Verifikasi bahwa input email **TIDAK ADA**.
  - Pilihan role hanya ada 3: *Admin Administrasi*, *Bendahara Pesantren*, *Pengelola Kepesantrenan*.
  - Kolom input: Nama Lengkap, Role, Username, Sandi, Konfirmasi Sandi, No HP/WhatsApp.
  - *Catatan*: Jangan simpan akun dummy jika ingin mempertahankan database bersih.

### FASE 2: Pengujian Otoritas Staf (Setelah Akun Internal Dibuat)
Prasyarat: Superadmin membuat 3 akun staf resmi pesantren melalui antarmuka SIPETA:
- [ ] **Login Admin Administrasi**:
  - Login menggunakan username Admin yang baru dibuat.
  - Verifikasi akses ke menu: *Santri, Kelas, Kamar, Rekening Pesantren, Tahun Ajaran*.
  - Verifikasi proteksi: Admin **TIDAK DAPAT** mengakses menu verifikasi pembayaran keuangan atau audit log Superadmin.
- [ ] **Login Bendahara Pesantren**:
  - Login menggunakan username Bendahara.
  - Verifikasi akses ke menu: *Verifikasi Pembayaran, Ledger Uang Saku, Penyerahan Saku Tunai, Penyesuaian Tagihan*.
  - Verifikasi proteksi: Bendahara **TIDAK DAPAT** menghapus santri atau mengedit akun pengguna lain.
- [ ] **Login Pengelola Kepesantrenan**:
  - Login menggunakan username Pengelola.
  - Verifikasi akses ke menu: *Setoran Tahfidz, Catatan Kedisiplinan & Pelanggaran, Prestasi, Catatan Akademik*.
  - Verifikasi proteksi: Pengelola **TIDAK DAPAT** melihat nominal transaksi keuangan atau rekening bank.

### FASE 3: Pengujian Master Data & Import Excel Santri
Prasyarat: Telah dibuat minimal 1 Tahun Ajaran, 1 Kelas, dan 1 Kamar:
- [ ] **Konfigurasi Rekening Resmi Pesantren**:
  - Superadmin atau Admin menambahkan rekening resmi pesantren (Nama Bank, Nomor Rekening, Atas Nama).
  - Verifikasi rekening berhasil ditandai sebagai `is_active = true`.
- [ ] **Unduh Template Import Excel**:
  - Buka menu Santri > Import Data Santri.
  - Klik **Unduh Template Excel**.
  - Verifikasi format template `.xlsx` memuat kolom: *NIS, Nama Lengkap, Jenis Kelamin, Kelas, Kamar, Nama Wali, Nomor Telepon/WhatsApp Wali*.
- [ ] **Uji Validasi Import Excel (Dry Run)**:
  - Unggah file dengan format NIS teks (termasuk NIS berawalan nol `0026001`).
  - Verifikasi sistem melakukan pengecekan keberadaan Kelas dan Kamar sebelum commit.
- [ ] **Verifikasi Otomatisasi Akun Wali**:
  - Setelah import santri disetujui, verifikasi bahwa akun wali terbuat secara otomatis di Auth Supabase:
    - `username` = NIS santri.
    - Password awal = NIS santri.
    - `must_change_password` = `true`.
    - Email sintetis aman = `<nis>@akun.sipeta.invalid`.

### FASE 4: Pengujian Keamanan Login Wali Santri
Prasyarat: Terdapat minimal 1 data santri dan akun wali hasil import:
- [ ] **Login Pertama Kali Menggunakan NIS**:
  - Buka portal login wali. Masukkan NIS sebagai username dan sandi.
  - Verifikasi: Sistem **MENOLAK** akses langsung ke dashboard dan **MEWAJIBKAN** dialog ganti password baru.
- [ ] **Validasi Penggantian Sandi Baru**:
  - Masukkan sandi baru yang sama dengan NIS: Sistem harus **MENOLAK** ("Sandi baru tidak boleh sama dengan NIS").
  - Masukkan sandi baru yang valid: Sistem memperbarui sandi, menyetel `must_change_password = false`, dan mengarahkan ke dashboard wali.
- [ ] **Isolasi Data Antar-Wali (RLS)**:
  - Wali hanya dapat melihat data santri yang terhubung dengan akunnya.
  - Wali tidak dapat melihat data keuangan, saldo, atau santri keluarga lain.

---

## 4. RANGKUMAN TINDAKAN OPERATOR SEBELUM GO-LIVE

| No | Tindakan Operator | Penanggung Jawab | Kanal / Tools | Status |
|---|---|---|---|---|
| 1 | Jalankan Migrasi `008_security_remediation.sql` | Administrator IT | Supabase SQL Editor | Menunggu Eksekusi |
| 2 | Jalankan Migrasi `009_username_support.sql` | Administrator IT | Supabase SQL Editor | Menunggu Eksekusi |
| 3 | Jalankan Migrasi `010_safe_delete_and_management.sql` | Administrator IT | Supabase SQL Editor | Menunggu Eksekusi |
| 4 | Jalankan Migrasi `011_must_change_password_and_import.sql`| Administrator IT | Supabase SQL Editor | Menunggu Eksekusi |
| 5 | Jalankan Migrasi `012_admin_rekening_and_role_matrix.sql` | Administrator IT | Supabase SQL Editor | Menunggu Eksekusi |
| 6 | Uji Coba Login Akun Superadmin | Superadmin | Web App (`/login`) | Siap Diuji |
| 7 | Input Rekening Resmi Pondok Pesantren | Superadmin / Admin | Web App (`/superadmin` atau `/admin`) | Siap Diinput |
| 8 | Buat Akun Petugas Internal (Admin, Bendahara, Pengelola) | Superadmin | Web App (`/superadmin/accounts`) | Siap Dibuat |
| 9 | Input Master Data (Tahun Ajaran, Kelas, Kamar) | Admin Administrasi | Web App (`/admin`) | Siap Diinput |
| 10| Import Excel Data Santri & Otomatisasi Akun Wali | Admin Administrasi | Web App (`/admin/santri/import`) | Siap Diimport |

