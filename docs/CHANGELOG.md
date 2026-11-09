# CATATAN PERUBAHAN SISTEM (CHANGELOG)
## SIPETA — Pondok Pesantren Modern Abu Manshur

---

## [Versi 1.0.0 - Production Readiness Release] — 2026-11-09

### Penambahan (Added)
- **Dukungan Autentikasi Username Akun Internal (Migrasi 009)**:
  - Kolom `username` pada tabel `public.profiles` dengan validasi format regex alfanumerik (`3-30` karakter) dan indeks unik case-insensitive `idx_profiles_lower_username`.
  - Pemetaan otomatis username ke email internal berformat `${username}@akun.sipeta.invalid` di sisi server.
  - Login langsung menggunakan username dan password tanpa memerlukan email Gmail untuk petugas internal.
- **Proteksi Integritas Relasional & Safe Delete (Migrasi 010)**:
  - Kolom `deleted_at` dan `deleted_by` pada tabel `santri`, `kelas`, dan `kamar`.
  - Trigger `trg_prevent_hard_delete_santri` yang memblokir penghapusan fisik santri yang memiliki riwayat keuangan (tagihan, pembayaran, mutasi saku) atau setoran tahfidz.
  - Trigger `trg_prevent_delete_kelas` dan `trg_prevent_delete_kamar` yang memblokir penghapusan kelas/kamar yang masih dihuni santri aktif.
- **Kewajiban Penggantian Password Login Pertama Wali Santri (Migrasi 011)**:
  - Kolom `must_change_password` dan indeks `idx_profiles_must_change_pwd` pada `public.profiles`.
  - Otomatisasi pembentukan akun wali berbasis NIS (`Username = NIS`, `Password Awal = NIS`) pada saat registrasi santri dan impor massal Excel.
  - Modal pencegat `MustChangePasswordModal` yang memblokir akses data santri sebelum password awal diganti dengan kata sandi baru.
- **Otorisasi Rekening Pesantren Terpadu (Migrasi 012)**:
  - Perluasan hak kelola rekening bank BSI resmi pesantren kepada Admin Administrasi dan Superadmin.
  - Izin baca (`SELECT`) terproteksi untuk Bendahara, Pengelola, dan Wali Santri aktif.
- **Mekanisme Kompensasi Atomik Server-Side**:
  - Penambahan rollback otomatis pada `POST /api/admin-users` dan `/api/admin-santri/import` yang segera menghapus akun Auth jika proses penyimpanan profil atau relasi wali gagal.
  - Logging level `CRITICAL` untuk mendeteksi anomali kegagalan kompensasi.
- **Diagnosis Kesehatan Skema Terperinci**:
  - Peningkatan `/api/health` untuk mendeteksi dan membedakan 5 kondisi database secara presisi (`NOT_CONFIGURED`, `CONNECTION_FAILED`, `CONNECTED_UNMIGRATED`, `CONNECTED_EMPTY_DATA`, `CONNECTED_HEALTHY`).
- **Dokumentasi Lengkap Kesiapan Operasional**:
  - Penambahan 12 dokumen teknis dan panduan pengguna resmi di direktori `docs/`.

### Perbaikan (Fixed)
- **Formulir Buat Akun Pengguna Baru**:
  - Menghapus seluruh input email dari modal pembuatan akun Superadmin.
  - Menghilangkan tampilan domain sintetis `.invalid` dan email autofill di seluruh antarmuka pengguna.
  - Mengubah kolom Nomor Telepon/WhatsApp menjadi opsional (tidak wajib).
  - Menambahkan banner pesan kesalahan langsung di dalam modal (`inline alert`) dan mempertahankan isi form nama/username saat terjadi kesalahan validasi.
- **Penyatuan Pengelolaan Akun**:
  - Menggabungkan modal pengeditan profil dan kata sandi menjadi satu modal terpadu *Kelola Akun Pengguna*.
  - Sinkronisasi realtime daftar pengguna dari database Supabase (`refreshFromSupabase()`) pasca-penyimpanan.
- **Tata Letak Navigasi Superadmin**:
  - Menggabungkan seluruh menu navigasi Superadmin langsung ke sidebar utama aplikasi tanpa membuat sidebar ganda di area konten.
- **Pengujian Integrasi Menyeluruh**:
  - Penambahan test suite `tests/buat-akun-tanpa-email.test.ts` (13 skenario wajib) dan pembaruan `tests/kelola-akun-critical-integration.test.ts`. Total 261 automated tests lulus 100%.

### Keamanan (Security)
- Peniadaan kebocoran email sintetis ke antarmuka pengguna (tabel, kartu mobile, dan modal terisolasi hanya menampilkan `@username`).
- Penegakan larangan pencatatan kata sandi pada audit log.
- Penegakan isolasi hak akses data antar-wali santri (relasi 1:1 tanpa kebocoran data santri lain).
- Penutupan total hak akses anonim terhadap seluruh tabel keuangan pesantren.
