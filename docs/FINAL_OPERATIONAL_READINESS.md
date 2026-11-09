# DOKUMEN KESIAPAN OPERASIONAL FINAL — PASCA-REKONSILIASI (FINAL OPERATIONAL READINESS)
**Sistem Informasi Pelayanan Terpadu — Pondok Pesantren Modern Abu Manshur (SIPETA)**  
**Target Basis Data**: Supabase Cloud Production (`jvhzrhfzkjqzlhsvvbgy.supabase.co`)  
**Production URL**: [https://sipeta-abumanshur.vercel.app](https://sipeta-abumanshur.vercel.app)  
**Git Repository**: [https://github.com/EkoSartika/sipeta-abumanshur.git](https://github.com/EkoSartika/sipeta-abumanshur.git)  
**Branch / Commit Terverifikasi**: `main`  
**Status Evaluasi**: **SIAP OPERASIONAL PENUH (SECARA TEKNIS & SISTEM)**  
**Status Migrasi 008–012**: **SUDAH DITERAPKAN DAN DIVERIFIKASI DI SUPABASE CLOUD**

---

## 1. RINGKASAN STATUS TEKNIS PRODUKSI

Seluruh prasyarat teknis, skema basis data, dan implementasi aplikasi SIPETA telah tuntas 100%:

| Komponen Teknis | Status Aktual | Detail Verifikasi |
|---|---|---|
| **Supabase Cloud Schema** | **TERAPKAN & DIVERIFIKASI** | Seluruh migrasi 0001–012 telah aktif di Cloud. Tidak diperlukan eksekusi migrasi ulang. |
| **27 Tabel Operasional** | **AKTIF & RLS TERKUNCI** | Seluruh 27 tabel menerapkan Row Level Security (RLS) dengan target peran `TO authenticated`. |
| **4 Storage Bucket** | **PRIVATE (`public: false`)** | Bucket `bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`, dan `dokumentasi-kepesantrenan` dilindungi Signed URL berbatas waktu. |
| **9 Fungsi RPC Stored Procedure**| **AKTIF & AMAN** | Seluruh RPC transaksi atomik keuangan berjalan dengan `SECURITY DEFINER` dan `SET search_path = public`. |
| **20 Trigger PostgreSQL** | **AKTIF & TERUJI** | Menjaga integritas data: immutabilitas ledger saku & audit log, otomasi riwayat, serta pencegahan hard delete relasi aktif. |
| **Akun Superadmin Resmi** | **AKTIF & TERLINDUNGI** | Email: `sipetaabumanshur@gmail.com` (UUID `af7315fd-a82f-4c73-9bd1-4967d038ae7e`), password utuh, username otomatis `'superadmin'`. |
| **Kode & Server Actions** | **TERKONEKSI LIVE** | Menggunakan client `@supabase/ssr`, cookies session terenkripsi, zero-email staf internal, dan sanitasi ketat. |

---

## 2. HASIL PEMERIKSAAN KEAMANAN MENDALAM

### 2.1 Audit Keamanan Sembilan Fungsi RPC `SECURITY DEFINER`
Seluruh 9 fungsi RPC telah diaudit dari potensi celah eksploitasi:
1. **Mitigasi Serangan Search Path Hijacking (CVE-2018-1058)**:
   - Setiap fungsi RPC secara eksplisit menyertakan deklarasi `SET search_path = public`.
   - Hal ini menjamin fungsi tidak dapat dimanipulasi oleh skema pengguna atau temporary tables yang dibuat oleh penyerang.
2. **Pencabutan Hak Eksekusi dari Publik (`PUBLIC`)**:
   - Skema basis data telah menerapkan `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;`.
   - Hak eksekusi hanya diberikan secara selektif kepada peran terotentikasi (`TO authenticated`). Anonymous tidak dapat memanggil RPC apa pun.
3. **Verifikasi Otorisasi di Dalam Fungsi (In-Function Guard)**:
   - Setiap RPC membaca identitas pengguna aktif secara aman melalui fungsi internal PostgreSQL `auth.uid()`.
   - Melakukan pengecekan peran pengguna aktif (`v_role`) melalui fungsi stabil `public.get_my_role()`. Percobaan pemanggilan di luar wewenang role langsung menggagalkan transaksi (`RAISE EXCEPTION`).
4. **Pencegahan Kondisi Balapan (Race Conditions)**:
   - Transaksi keuangan (`rpc_checkout_pembayaran`, `rpc_verifikasi_pembayaran`, `rpc_catat_penyerahan_uang_saku`) menerapkan penguncian baris (`FOR UPDATE`) pada tabel `tagihan`, `transaksi_pembayaran`, dan `saldo_uang_saku`.
5. **Perlindungan Lintas Santri (Cross-Santri Isolation)**:
   - Alur pembayaran dan top-up wali selalu mencocokkan `santri_id` terhadap hasil fungsi `public.get_my_santri_id()`.

### 2.2 Audit Keamanan Endpoint `/api/signed-url`
Endpoint penerbitan URL bertanda tangan telah diperiksa dan diperketat dengan standar *Defense-in-Depth*:
1. **Proteksi Akses Dokumen Privat Wali Santri**:
   - Untuk bucket keuangan (`bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`), jalur berkas wajib diawali dengan `${wali.santri_id}/`.
   - Wali santri yang mencoba mengakses berkas dengan ID santri lain atau berkas di luar jalurnya langsung ditolak dengan status **403 Forbidden**.
2. **Penyelarasan Pengecualian Dokumen Umum Kepesantrenan**:
   - Hanya folder edaran resmi publik (`umum/`, `publik/`, `pengumuman/`, `edaran/`) yang dapat diakses oleh akun wali aktif pada bucket `dokumentasi-kepesantrenan`.
   - Folder arsip internal staf (`arsip/`, dokumen kepegawaian asatidz) **DIBLOKIR KETAT** dari akun wali.
3. **Masa Berlaku Terbatas (Short-Lived Signed URL)**:
   - URL bertanda tangan hanya berlaku selama **15 menit (900 detik)**. Tautan kedaluwarsa otomatis dan tidak dapat digunakan kembali.
4. **Proteksi Akun Wali Baru**:
   - Jika akun wali belum mengganti kata sandi awal bawaan NIS (`must_change_password = true`), permintaan signed URL ditolak dengan peringatan untuk mengganti password terlebih dahulu.
5. **Rate Limiting di Sisi Server**:
   - Dibatasi maksimal 40 permintaan per menit per alamat IP untuk mencegah penyerangan brute-force enumeration.

### 2.3 Evaluasi Akses Tabel `profiles`
* Kebijakan RLS membatasi hak baca wali santri hanya pada baris profilnya sendiri (`id = auth.uid()`).
* Hak baca seluruh profil hanya dibuka terbatas untuk staf internal resmi (`superadmin`, `admin`, `bendahara`, `pengelola`) untuk kebutuhan verifikasi identitas.
* Hak mutasi (`INSERT`, `UPDATE`, `DELETE`) dilindungi eksklusif hanya untuk `superadmin`.

---

## 3. HASIL PENGUJIAN TEKNIS & VERIFIKASI BUILD

| Pengujian | Perintah / Uji | Status | Hasil & Bukti |
|---|---|---|---|
| **TypeScript Compilation** | `npm run typecheck` | **PASS** | 0 Error. Seluruh tipe data, interface service, dan rute handler valid. |
| **ESLint Check** | `npm run lint` | **PASS** | 0 Error. Dependensi linting Next.js 15 terpasang dan clean. |
| **Vitest Test Suite** | `npm test` | **PASS** | **14 berkas pengujian lulus, 261/261 tests (100%) lulus**. |
| **Next.js Production Build** | `npm run build` | **PASS** | 10/10 rute statis & dinamis ter-bundle sukses (195 kB first load JS). |
| **Live Smoke Test (Vercel)** | `GET /` | **PASS** | 200 OK (8,181 bytes, antarmuka resmi termuat sempurna). |
| **Live Health Check API** | `GET /api/health` | **PASS** | 200 OK (`CONNECTED_EMPTY_DATA`, mode `supabase_live`, latency 733ms). |
| **Security Unauthorized Probe** | `GET /api/admin-users` | **PASS** | 401 Unauthorized (Proteksi otentikasi server aktif). |

---

## 4. DAFTAR PEKERJAAN OPERASIONAL YANG MENUNGGU DATA ASLI PESANTREN

Sesuai instruksi tata kelola data yang bersih (*Zero Fake Data*), sistem berada dalam kondisi siap menerima data operasional asli tanpa baris fiktif. Tindakan berikut menjadi wewenang pengelola pesantren:

1. **Konfigurasi Rekening Bank Resmi Pesantren**:
   - Dilakukan oleh: **Superadmin** atau **Admin Administrasi**.
   - Melalui menu: *Rekening Resmi Pesantren*.
   - Data yang dibutuhkan: Nama Bank (misal: BSI / BRI), Nomor Rekening Resmi Yayasan/Pesantren, Atas Nama Rekening, dan Petunjuk Pembayaran.
2. **Input Master Data Tahun Ajaran, Kelas & Kamar**:
   - Dilakukan oleh: **Admin Administrasi (Tata Usaha)**.
   - Melalui menu: *Tahun Ajaran*, *Data Kelas*, dan *Data Kamar Asrama*.
   - Data yang dibutuhkan: Periode tahun ajaran aktif (misal: 2026/2027), daftar ruang kelas, dan kapasitas kamar asrama santri.
3. **Pembuatan Akun Staf Internal Pesantren**:
   - Dilakukan oleh: **Superadmin**.
   - Melalui menu: *Manajemen Akun & Role* > *Buat Pengguna Baru*.
   - Data yang dibutuhkan: Nama lengkap petugas, role (*Admin Administrasi*, *Bendahara*, atau *Pengelola*), username yang diinginkan, dan kata sandi awal (tanpa perlu input email).
4. **Import Massal Data Santri & Otomatisasi Akun Wali**:
   - Dilakukan oleh: **Admin Administrasi**.
   - Melalui menu: *Data Santri* > *Import Data Santri*.
   - Berkas: Menggunakan template resmi [`public/templates/template-import-santri-sipeta.xlsx`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/public/templates/template-import-santri-sipeta.xlsx).
   - Ketentuan NIS: Format teks utuh (angka nol di depan terjaga). Sistem akan otomatis membuat akun wali (Username = NIS, Password awal = NIS, Wajib Ganti Password = Aktif).

---

## 5. RISIKO OPERASIONAL & MITIGASI YANG DITERAPKAN

| Potensi Risiko Operasional | Tingkat | Mitigasi yang Telah Diterapkan di Sistem |
|---|---|---|
| **Kesalahan input format pada file Excel santri** | Sedang | Sistem menyediakan fitur **Dry-Run Validasi File** sebelum eksekusi import, menampilkan daftar baris yang salah dan alasannya tanpa mengubah database. |
| **Orang Tua / Wali lupa kata sandi setelah mengganti dari NIS** | Rendah | Superadmin dan Admin Administrasi memiliki kewenangan melakukan reset kata sandi akun wali melalui modal *Kelola Akun Pengguna*. |
| **Wali salah mentransfer ke rekening selain rekening resmi** | Rendah | Seluruh instruksi checkout, PDF tagihan, dan salinan nomor rekening di portal wali hanya menampilkan 1 rekening resmi aktif yang telah divalidasi yayasan. |
| **Penyerahan uang saku tunai tanpa tanda terima sah** | Sangat Rendah | Stored procedure database `rpc_catat_penyerahan_uang_saku` mewajibkan unggah bukti foto fisik penyerahan tunai sebelum transaksi dapat disahkan oleh bendahara. |

---

## 6. CHECKLIST AKTIVASI PRODUKSI (GO-LIVE CHECKLIST)

- [x] Seluruh kode sumber, komponen UI/UX, dan Server Actions tersinkronisasi di branch `main` repositori GitHub.
- [x] Build produksi dan deployment Vercel Production sukses berstatus live.
- [x] Migrasi Supabase Cloud 008–012 telah diterapkan dan diverifikasi aktif.
- [x] Seluruh 27 tabel menerapkan RLS ketat dan 4 storage bucket berstatus privat.
- [x] Seluruh 9 fungsi RPC atomik dan 20 triggers PostgreSQL aktif di database Cloud.
- [ ] **Langkah 1**: Superadmin login di [https://sipeta-abumanshur.vercel.app/login](https://sipeta-abumanshur.vercel.app/login) menggunakan `sipetaabumanshur@gmail.com`.
- [ ] **Langkah 2**: Superadmin / Admin menginput nomor rekening bank resmi pesantren.
- [ ] **Langkah 3**: Superadmin membuat 3 akun staf resmi (Admin TU, Bendahara, Pengelola).
- [ ] **Langkah 4**: Petugas Admin menginput Tahun Ajaran, Kelas, Kamar, dan mengunggah Excel data santri.
- [ ] **Langkah 5**: Pesantren membagikan informasi login kepada Wali Santri (Username = NIS, Password awal = NIS).

SIPETA dinyatakan **SIAP OPERASIONAL PENUH (SECARA TEKNIS & SISTEM)** untuk melayani Pondok Pesantren Modern Abu Manshur.

