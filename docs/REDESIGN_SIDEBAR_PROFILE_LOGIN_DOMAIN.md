# DOKUMEN IMPLEMENTASI: REDESAIN SIDEBAR, PROFIL PENGGUNA, ISOLASI LOGIN, DAN DOMAIN SIPETA

**Proyek:** SIPETA — Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur  
**Lokasi Direktori:** `C:\Users\Eko\.gemini\antigravity\scratch\sipeta`  
**Repository:** `https://github.com/EkoSartika/sipeta-abumanshur.git`  
**Branch:** `main`  
**Domain Produksi Baru:** `https://sipetaabumanshur.vercel.app`  
**Domain Lama:** `https://sipeta-abumanshur.vercel.app` (dialihkan otomatis via 308 Permanent Redirect)  
**Tanggal Rilis:** 9 November 2026  

---

## 1. RINGKASAN EKSEKUTIF

Dokumen ini memverifikasi keberhasilan implementasi lima mandat utama modernisasi sistem SIPETA:
1. **Pusat Navigasi Panel Kiri (Single Left Sidebar)**: Seluruh navigasi fitur aplikasi disatukan ke sidebar kiri terpadu. Seluruh tombol tab horizontal di dalam banner konten dashboard dihilangkan, menyisakan area kerja yang bersih dan fokus.
2. **Pembersihan Visual "Supabase Cloud"**: Seluruh badge koneksi dan teks berbau database ("Supabase Cloud Aktif", "Supabase Cloud" pada kartu profil) telah dibersihkan dari antarmuka visual tanpa mengurangi 1% pun fungsionalitas koneksi, query, RLS, Storage, atau API backend Supabase.
3. **Fitur Mandiri "Profil Saya"**: Seluruh 5 role pengguna resmi (Superadmin, Admin, Bendahara, Pengelola, Wali) dapat meninjau data akun, memperbarui nama lengkap, memperbarui nomor telepon/WhatsApp, dan mengganti kata sandi secara aman dengan verifikasi kata sandi lama melalui endpoint `/api/auth/profile`.
4. **Pemisahan Pintu Masuk Login Berdasarkan Role (Role Isolation)**: Disediakan lima pintu masuk login terpisah dengan validasi ketat di sisi server. Pengguna yang mencoba masuk melalui portal yang bukan kewenangannya akan ditolak secara eksplisit dan diarahkan ke rute login yang sesuai.
5. **Migrasi Konfigurasi Domain Baru (`sipetaabumanshur.vercel.app`)**: Pembaruan metadata aplikasi, OpenGraph, penambahan aturan pengalihan otomatis 308 di `next.config.mjs`, serta panduan konfigurasi DNS Vercel dan Supabase Auth Redirect URLs.
6. **Proteksi Fitur Simulasi (Demo)**: Tombol simulasi ganti role dan reset data disembunyikan 100% pada mode produksi yang terhubung ke Supabase Cloud.

---

## 2. ARSITEKTUR NAVIGASI TERPADU (LEFT SIDEBAR)

### 2.1. Desain & Karakteristik Sidebar
- **Satu Sumber Navigasi**: Navigasi aplikasi tidak lagi terpecah antara bilah sisi dan tab di dalam konten. Setiap klik menu di sidebar langsung mengarahkan tampilan konten utama ke fitur yang bersangkutan.
- **Dukungan Desktop Collapsible**:
  - Mode Lebar (Expanded): Lebar 288px (`w-72`), menampilkan logo pesantren, nama lengkap pengguna, badge role, label menu lengkap, dan badge angka notifikasi.
  - Mode Ramping (Collapsed): Lebar 80px (`w-20`), menampilkan ikon menu dengan tooltip, avatar inisial, dan tombol toggle panel (`PanelLeftClose` / `PanelLeftOpen`).
- **Dukungan Mobile Drawer**:
  - Drawer responsif dapat dibuka melalui tombol hamburger header di layar `< 1024px`.
  - Dilengkapi backdrop peredup (`backdrop-blur`) dan otomatis tertutup ketika salah satu menu dipilih.
- **Bagian Bawah Sidebar**:
  - Kartu profil ringkas pengguna dengan inisial avatar dan label role resmi.
  - Tombol aksi cepat membuka fitur **Profil Saya**.
  - Tombol aksi **Keluar (Logout)** yang membersihkan sesi autentikasi.

### 2.2. Matriks Struktur Menu Navigasi Berdasarkan Role

| Role Pengguna | Daftar Menu Sidebar Kiri | Ikon Visual | Kode Tab |
|---|---|---|---|
| **Superadmin (Pimpinan Pesantren)** | 1. Dashboard<br>2. Manajemen Akun & Role<br>3. Rekening Resmi Pesantren<br>4. Jejak Audit / Audit Log<br>5. Pusat Laporan & Analitik<br>6. Profil Saya | `LayoutGrid`<br>`Users`<br>`Landmark`<br>`FileText`<br>`BarChart3`<br>`UserCheck` | `dashboard`<br>`users`<br>`rekening`<br>`audit_log`<br>`laporan`<br>`profile` |
| **Admin Administrasi** | 1. Dashboard<br>2. Data Santri & Akun Wali<br>3. Import Data Santri (Excel)<br>4. Kelas, Kamar & Penempatan<br>5. Jenis Pembayaran<br>6. Kebijakan Cicilan & Tagihan<br>7. Rekening Resmi Pesantren<br>8. Pengumuman Pesantren<br>9. Pusat Laporan & Analitik<br>10. Profil Saya | `LayoutGrid`<br>`Users`<br>`FileSpreadsheet`<br>`Building2`<br>`CreditCard`<br>`Receipt`<br>`Landmark`<br>`Megaphone`<br>`BarChart3`<br>`UserCheck` | `dashboard`<br>`santri_wali`<br>`import_santri`<br>`kelas_kamar`<br>`jenis_pembayaran`<br>`kebijakan_tagihan`<br>`rekening_pesantren`<br>`pengumuman`<br>`laporan`<br>`profile` |
| **Bendahara Pesantren** | 1. Dashboard<br>2. Verifikasi Pembayaran Tagihan<br>3. Verifikasi Top-Up Uang Saku<br>4. Catat Penyerahan Uang Saku<br>5. Saldo Santri<br>6. Ledger & Jurnal Koreksi<br>7. Rekening Resmi Pesantren<br>8. Pusat Laporan & Analitik<br>9. Profil Saya | `LayoutGrid`<br>`CheckCircle2`<br>`ArrowRightLeft`<br>`Camera`<br>`Wallet`<br>`FileText`<br>`Landmark`<br>`BarChart3`<br>`UserCheck` | `dashboard`<br>`verifikasi_pembayaran`<br>`verifikasi_saku`<br>`penyerahan_saku`<br>`saldo_santri`<br>`ledger_koreksi`<br>`rekening_info`<br>`laporan`<br>`profile` |
| **Pengelola Kepesantrenan** | 1. Dashboard<br>2. Perkembangan Mengaji<br>3. Setoran Tahfidz Al-Qur'an<br>4. Prestasi Santri<br>5. Kedisiplinan & Pembinaan<br>6. Pusat Laporan & Analitik<br>7. Profil Saya | `LayoutGrid`<br>`BookOpen`<br>`Sparkles`<br>`Trophy`<br>`ShieldAlert`<br>`BarChart3`<br>`UserCheck` | `dashboard`<br>`mengaji`<br>`tahfidz`<br>`prestasi`<br>`kedisiplinan`<br>`laporan`<br>`profile` |
| **Orang Tua / Wali Santri** | 1. Dashboard<br>2. Profil Santri<br>3. Informasi Tagihan<br>4. Pembayaran SPP & Cicilan<br>5. Riwayat Pembayaran<br>6. Uang Saku Santri<br>7. Riwayat Mutasi & Foto Bukti<br>8. Perkembangan Mengaji<br>9. Setoran Tahfidz<br>10. Prestasi Santri<br>11. Kedisiplinan Santri<br>12. Pengumuman Pesantren<br>13. Dokumen & Unduhan<br>14. Profil Saya | `LayoutGrid`<br>`UserCheck`<br>`Receipt`<br>`CreditCard`<br>`Clock`<br>`Wallet`<br>`ArrowRightLeft`<br>`BookOpen`<br>`Sparkles`<br>`Trophy`<br>`ShieldCheck`<br>`Megaphone`<br>`Download`<br>`User` | `dashboard`<br>`profil_santri`<br>`informasi_tagihan`<br>`pembayaran`<br>`riwayat_pembayaran`<br>`uang_saku`<br>`riwayat_mutasi`<br>`mengaji`<br>`tahfidz`<br>`prestasi`<br>`kedisiplinan`<br>`pengumuman`<br>`dokumen`<br>`profile` |

---

## 3. PENGHAPUSAN INDIKATOR STATUS SUPABASE CLOUD

Sesuai instruksi Bagian B, tampilan aplikasi kini berfokus penuh pada identitas resmi pesantren:
1. **Header Publik**: Pill koneksi yang sebelumnya menampilkan teks `"Supabase Cloud Aktif"` / `"Mode Simulasi Demo"` telah dihapus, digantikan dengan tombol pintu masuk resmi.
2. **Header Ruang Kerja**: Badge indikator status koneksi yang menampilkan `"Supabase Cloud Aktif"` telah dihilangkan. Tombol muat ulang data kini berlabel ramah pengguna: `"Perbarui Data"`.
3. **Kartu Profil Sidebar Desktop & Mobile**: Tulisan `"Supabase Cloud"` dan dot status hijau/amber di kartu profil pengguna telah dihapus.
4. **Formulir Login**: Teks teknis *"Row-Level Security Supabase"* diganti dengan *"Sesi terenkripsi & dilindungi hak akses role resmi"*.
5. **Integritas Fungsional Database**:
   - Seluruh koneksi ke Supabase Cloud tetap aktif 100%.
   - Seluruh 27 tabel PostgreSQL dengan Row-Level Security (RLS) tetap terisolasi.
   - 9 RPC (Remote Procedure Calls) dan trigger keamanan tetap berfungsi penuh.
   - 4 Storage Bucket private tetap digunakan untuk upload bukti transfer dan foto penyerahan.

---

## 4. FITUR MANDIRI "PROFIL SAYA" (`/api/auth/profile`)

Komponen `UserProfileView` (`src/components/profile/user-profile-view.tsx`) tersedia bagi seluruh role dan dapat diakses dari sidebar maupun avatar header.

### 4.1. Informasi yang Ditampilkan
1. **Data Akun (Read-Only demi Keamanan)**:
   - Avatar inisial nama.
   - Nama lengkap & role pengguna.
   - Status keaktifan akun (`Akun Aktif`).
   - Username akun resmi pesantren (`@username`).
   - Khusus Superadmin: Email resmi `sipetaabumanshur@gmail.com`.
   - Khusus Wali Santri: Kartu Data Santri Terhubung (Relasi 1:1) memuat Nama Santri, NIS, Jenis Kelamin, Kelas, dan Kamar/Asrama.
2. **Formulir Pembaruan Data Pribadi**:
   - **Nama Lengkap** (minimal 2 karakter, maksimal 120 karakter).
   - **Nomor Telepon / WhatsApp** (digunakan untuk notifikasi tagihan dan kabar santri).
3. **Formulir Penggantian Kata Sandi Mandiri**:
   - **Kata Sandi Lama**: Wajib diisi dan diverifikasi ke server auth sebelum izin perubahan diberikan.
   - **Kata Sandi Baru**: Minimal 8 karakter alfanumerik.
   - **Konfirmasi Kata Sandi Baru**: Wajib cocok dengan kata sandi baru.
   - **Tombol Tampil/Sembunyikan Sandi** (`Eye` / `EyeOff`) pada setiap kolom.

### 4.2. Batasan Keamanan Keras (Enforced Boundaries)
- **Role Immutability**: Pengguna **tidak dapat** mengubah role mereka sendiri (role hanya dapat diubah oleh Superadmin di menu Manajemen Akun).
- **Username Immutability**: Akun internal **tidak dapat** mengubah username mereka sendiri untuk mencegah rusaknya relasi audit dan data login.
- **Status Immutability**: Pengguna **tidak dapat** menonaktifkan akun mereka sendiri.
- **Password vs Username Rule**: Kata sandi baru **dilarang sama persis** dengan username atau NIS akun.
- **Old Password Verification**: Server menguji kredensial kata sandi lama secara langsung ke auth backend. Jika kata sandi lama salah, permintaan ditolak dengan HTTP 400.
- **Audit Trail**: Setiap perubahan profil mandiri dicatat otomatis ke dalam tabel `audit_logs` dengan aksi `"UPDATE_PROFIL_MANDIRI"`.

---

## 5. PEMBAGIAN HALAMAN LOGIN BERDASARKAN ROLE

SIPETA menyediakan 5 pintu masuk login independen dengan tata letak konsisten dan profesional:

```mermaid
graph TD
    A["Pengguna Mengakses SIPETA"] --> B{"Pilih Portal Masuk"}
    B -->|Wali Santri| C["/login"]
    B -->|Admin Administrasi| D["/admin/login"]
    B -->|Bendahara Pesantren| E["/bendahara/login"]
    B -->|Pengelola Kepesantrenan| F["/pengelola/login"]
    B -->|Superadmin Pimpinan| G["/superadmin/login"]
    
    C --> H{"Validasi Server Role = wali?"}
    D --> I{"Validasi Server Role = admin?"}
    E --> J{"Validasi Server Role = bendahara?"}
    F --> K{"Validasi Server Role = pengelola?"}
    G --> L{"Validasi Server Role = superadmin?"}
    
    H -->|Ya| M["Masuk Dashboard Wali"]
    H -->|Tidak (Salah Role)| N["Tolak + SignOut + Tampilkan Tautan Portal Asli"]
    I -->|Ya| O["Masuk Dashboard Admin"]
    I -->|Tidak (Salah Role)| N
    J -->|Ya| P["Masuk Dashboard Bendahara"]
    J -->|Tidak (Salah Role)| N
    K -->|Ya| Q["Masuk Dashboard Pengelola"]
    K -->|Tidak (Salah Role)| N
    L -->|Ya| R["Masuk Dashboard Superadmin"]
    L -->|Tidak (Salah Role)| N
```

### 5.1. Rincian Pintu Masuk
1. **Portal Masuk Orang Tua / Wali Santri**:
   - Rute: `/login`
   - Label Input: `Nomor Induk Santri (NIS)`
   - Bantuan: *"Gunakan NIS santri sebagai username dan kata sandi yang telah dibagikan."*
2. **Portal Masuk Admin Administrasi**:
   - Rute: `/admin/login`
   - Label Input: `Username Akun Administrasi`
   - Bantuan: *"Gunakan username akun internal Anda (tidak menggunakan email pribadi)."*
3. **Portal Masuk Bendahara Pesantren**:
   - Rute: `/bendahara/login`
   - Label Input: `Username Akun Bendahara`
   - Bantuan: *"Gunakan username akun kebendaharaan Anda."*
4. **Portal Masuk Pengelola Kepesantrenan**:
   - Rute: `/pengelola/login`
   - Label Input: `Username Akun Pengelola`
   - Bantuan: *"Gunakan username akun kepesantrenan Anda."*
5. **Portal Masuk Superadmin**:
   - Rute: `/superadmin/login`
   - Label Input: `Email atau Username Superadmin`
   - Bantuan: *"Khusus akun Superadmin resmi pimpinan Pondok Pesantren Modern Abu Manshur."*

### 5.2. Penegakan Isolasi Role (Server-Side Role Isolation)
Jika akun suatu role mencoba login melalui rute role lain (contoh: Wali santri mencoba login di `/admin/login` atau Bendahara login di `/superadmin/login`):
1. Server secara otomatis melakukan **pencabutan sesi instan (`signOut`)**.
2. Sistem mengembalikan pesan penolakan yang tegas dan ramah:
   > *"Akses ditolak: Akun Anda terdaftar sebagai [Nama Role Asli]. Silakan gunakan portal masuk [Nama Role Asli] ([URL Login Role])."*
3. Pada kartu login bawah disediakan navigasi cepat ke seluruh pintu masuk lain sehingga pengguna yang salah alamat dapat berpindah portal hanya dengan satu klik.

---

## 6. PERUBAHAN DOMAIN SIPETA

- **Domain Lama:** `sipeta-abumanshur.vercel.app`
- **Domain Baru:** `sipetaabumanshur.vercel.app`

### 6.1. Penyesuaian di Kode Sumber
1. **Redirect Otomatis 308 (Permanent)** di `next.config.mjs`:
   ```javascript
   async redirects() {
     return [
       {
         source: "/:path*",
         has: [
           {
             type: "host",
             value: "sipeta-abumanshur.vercel.app",
           },
         ],
         destination: "https://sipetaabumanshur.vercel.app/:path*",
         permanent: true,
       },
     ];
   }
   ```
2. **Metadata & OpenGraph** di `src/app/layout.tsx`:
   - `metadataBase: new URL("https://sipetaabumanshur.vercel.app")`
   - `openGraph.url: "https://sipetaabumanshur.vercel.app"`
3. **Dokumentasi `README.md`**:
   - Seluruh badge dan tautan produksi diarahkan ke `https://sipetaabumanshur.vercel.app`.

### 6.2. Panduan Pengaturan di Vercel Dashboard
1. Buka dashboard proyek SIPETA di [Vercel](https://vercel.com).
2. Masuk ke **Settings** > **Domains**.
3. Tambahkan domain baru: `sipetaabumanshur.vercel.app`.
4. Jadikan `sipetaabumanshur.vercel.app` sebagai **Primary Domain**.
5. Pastikan domain `sipeta-abumanshur.vercel.app` tetap terdaftar dengan opsi **Redirect to sipetaabumanshur.vercel.app** (Status: 308 Permanent).

### 6.3. Panduan Pengaturan di Supabase Dashboard
1. Buka project Supabase: `jvhzrhfzkjqzlhsvvbgy`.
2. Masuk ke **Authentication** > **URL Configuration**.
3. **Site URL**: Ubah dari `https://sipeta-abumanshur.vercel.app` menjadi:
   ```text
   https://sipetaabumanshur.vercel.app
   ```
4. **Redirect URLs (Allow list)**:
   Pastikan entri berikut terdaftar:
   ```text
   https://sipetaabumanshur.vercel.app/**
   https://sipeta-abumanshur.vercel.app/**
   http://localhost:3000/**
   ```
5. Simpan perubahan (*Save*).

---

## 7. HASIL PENGUJIAN OTOMATIS & VERIFIKASI BUILD

### 7.1. TypeScript Compiler (`npx tsc --noEmit`)
- **Status:** **LULUS (0 Error)**
- Seluruh tipe data `UserRole`, `Santri`, `MutasiUangSaku`, `AuditLogItem`, dan `RekeningPesantren` telah terverifikasi sinkron 100%.

### 7.2. Next.js Lint (`npm run lint`)
- **Status:** **LULUS (0 Error)**
- Seluruh 15 file halaman, modal, portal, dan komponen lolos audit kualitas kode.

### 7.3. Rangkaian Pengujian Otomatis (`npm test`)
- **Total Test Files:** 15 file tes unit dan integrasi.
- **Total Tests:** **269 tes lulus (100% Passed)**.
- **Rincian Hasil:**
  1. `tests/role-login-isolation-and-profile.test.ts` (8 tes) — **PASSED**
  2. `tests/sipeta-comprehensive-audit.test.ts` (19 tes) — **PASSED**
  3. `tests/sipeta-business-rules.test.ts` (11 tes) — **PASSED**
  4. `tests/excel-import-and-must-change-password.test.ts` (15 tes) — **PASSED**
  5. `tests/supabase-backend-integration.test.ts` (24 tes) — **PASSED**
  6. `tests/internal-account-and-username.test.ts` (19 tes) — **PASSED**
  7. `tests/safe-delete-and-management.test.ts` (18 tes) — **PASSED**
  8. `tests/production-auth-and-logout.test.ts` (10 tes) — **PASSED**
  9. `tests/migration-008-audit.test.ts` (12 tes) — **PASSED**
  10. `tests/buat-akun-tanpa-email.test.ts` (13 tes) — **PASSED**
  11. `tests/authorization-matrix-and-account-management.test.ts` (21 tes) — **PASSED**
  12. `tests/final-authorization.test.ts` (28 tes) — **PASSED**
  13. `tests/supabase-real-postgres.test.ts` (40 tes) — **PASSED**
  14. `tests/kelola-akun-critical-integration.test.ts` (17 tes) — **PASSED**
  15. `tests/bootstrap-superadmin.test.ts` (14 tes) — **PASSED**

### 7.4. Next.js Production Build (`npm run build`)
- **Status:** **LULUS (Compiled Successfully)**
- **16 Rute Berhasil Dioptimasi:**
  - `○ /` (Root Landing Page & Unified Workspace)
  - `○ /login` (Portal Masuk Wali Santri)
  - `○ /admin/login` (Portal Masuk Admin Administrasi)
  - `○ /bendahara/login` (Portal Masuk Bendahara Pesantren)
  - `○ /pengelola/login` (Portal Masuk Pengelola Kepesantrenan)
  - `○ /superadmin/login` (Portal Masuk Superadmin)
  - `ƒ /api/auth/profile` (Endpoint Profil Mandiri)
  - `ƒ /api/auth/change-password` (Endpoint Ganti Sandi Awal)
  - `ƒ /api/admin-users` (Endpoint Manajemen Akun)
  - `ƒ /api/admin-santri` (Endpoint Data Santri)
  - `ƒ /api/admin-santri/import` (Endpoint Impor Excel Santri)
  - `ƒ /api/signed-url` (Endpoint Private Storage Signed URL)
  - `ƒ /api/health` (Endpoint Pemeriksaan Status)

---

## 8. KESIMPULAN

Pembaruan navigasi kiri terpadu, penambahan fitur Profil Saya, pemisahan pintu masuk login per role, penghapusan badge status Supabase dari antarmuka visual, dan penyesuaian domain tujuan telah selesai diimplementasikan secara komprehensif tanpa merusak bisnis logika atau keamanan sistem yang telah ada sebelumnya. SIPETA kini siap digunakan secara profesional dan nyaman oleh seluruh civitas Pondok Pesantren Modern Abu Manshur.

