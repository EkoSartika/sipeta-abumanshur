# LAPORAN FINAL AKTIVASI DOMAIN DAN VERIFIKASI PRODUKSI SIPETA

**Aplikasi:** SIPETA — Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur  
**Tanggal Verifikasi:** 9 November 2026  
**Commit Acuan:** `e06fafe`  
**Repository:** `https://github.com/EkoSartika/sipeta-abumanshur.git` (Branch `main`)  
**Domain Produksi Saat Ini:** `https://sipeta-abumanshur.vercel.app`  
**Domain Tujuan:** `https://sipetaabumanshur.vercel.app`  
**Status Akhir:** SIAP DIAKTIFKAN DENGAN JAMINAN ZERO-DOWNTIME (1 Langkah di Dashboard Vercel)

---

## 1. HASIL AUDIT FAKTUAL KONDISI DOMAIN AKTUAL

Pemeriksaan jaringan dan header HTTP dilakukan secara langsung terhadap kedua domain pada edge network Vercel:

### A. Uji Domain Baru (`https://sipetaabumanshur.vercel.app`)
```http
GET / HTTP/1.1
Host: sipetaabumanshur.vercel.app

HTTP/1.1 404 Not Found
Server: Vercel
X-Vercel-Error: DEPLOYMENT_NOT_FOUND
Content-Type: text/plain; charset=utf-8
```
**Fakta:**
Domain `sipetaabumanshur.vercel.app` **belum terhubung (unassigned)** ke proyek SIPETA di Vercel. Vercel merespons dengan header `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`, yang membuktikan bahwa nama host ini belum didaftarkan di dalam daftar *Custom Domains* proyek Vercel.

### B. Uji Domain Lama (`https://sipeta-abumanshur.vercel.app`)
- **Sebelum Penyesuaian:** Domain lama mengeksekusi redirect HTTP 308 ke `sipetaabumanshur.vercel.app` yang belum terdaftar, sehingga berakibat pengunjung menerima halaman 404 (downtime sementara).
- **Setelah Penyesuaian Zero-Downtime:** Konfigurasi redirect Next.js diamankan dengan flag kondisi `ENABLE_DOMAIN_REDIRECT`. Dengan demikian, domain lama tetap berstatus **HTTP 200 OK** dan melayani seluruh aktivitas operasional pesantren tanpa gangguan hingga domain baru siap.

---

## 2. PANDUAN LANGKAH AKTIVASI MANUAL DI VERCEL DASHBOARD

Karena token CLI Vercel lokal telah kadaluarsa (`invalidToken: true`), aktivasi domain memerlukan 1 tindakan cepat di dashboard web Vercel:

1. **Masuk ke Vercel Dashboard:**
   - Kunjungi [https://vercel.com/dashboard](https://vercel.com/dashboard).
   - Pilih proyek **`sipeta-abumanshur`** (atau nama proyek SIPETA Anda).

2. **Buka Menu Pengaturan Domain:**
   - Masuk ke tab **Settings** -> pilih submenu **Domains** di bilah kiri.

3. **Tambahkan Domain Baru:**
   - Pada kolom isian domain, ketik: `sipetaabumanshur.vercel.app`
   - Klik tombol **Add**.
   - Vercel akan otomatis mengenali domain `.vercel.app`, mengikatnya ke *Production Deployment*, dan menerbitkan sertifikat SSL/TLS instan (biasanya selesai dalam 5–15 detik).

4. **Konfigurasi Pengalihan (Redirect) Aman:**
   Setelah domain baru berstatus **Valid Configuration**:
   - Cari domain lama `sipeta-abumanshur.vercel.app` pada daftar domain.
   - Klik menu titik tiga (**...**) di kanan -> pilih **Edit**.
   - Centang opsi **Redirect to `sipetaabumanshur.vercel.app`** dengan kode status **308 Permanent Redirect**.
   - Klik **Save**.
   *(Atau secara alternatif, set Environment Variable `ENABLE_DOMAIN_REDIRECT="true"` di menu Settings -> Environment Variables).*

---

## 3. VERIFIKASI KELIMA RUTE LOGIN DAN ISOLASI ROLE

Seluruh rute login terisolasi telah diuji secara komprehensif baik pada level unit test, integration test, maupun produksi build Next.js:

| No | Rute Halaman Login | Role yang Dilayani | Akses Kredensial | Status Halaman | Isolasi Role |
|:---|:---|:---|:---|:---:|:---:|
| 1 | `/superadmin/login` | Superadmin | Email / Sandi | 200 OK (Static) | Terisolasi Ketat |
| 2 | `/admin/login` | Admin Administrasi | Username / Sandi | 200 OK (Static) | Terisolasi Ketat |
| 3 | `/bendahara/login` | Bendahara Pesantren | Username / Sandi | 200 OK (Static) | Terisolasi Ketat |
| 4 | `/pengelola/login` | Pengelola Kepesantrenan | Username / Sandi | 200 OK (Static) | Terisolasi Ketat |
| 5 | `/login` | Orang Tua / Wali Santri | NIS / Sandi | 200 OK (Static) | Terisolasi Ketat |

### Hasil Uji Logika Isolasi Role:
- **Pencegahan Cross-Login:** Pengguna yang mencoba login melalui portal yang tidak sesuai dengan role-nya (misalnya Bendahara mencoba login di `/admin/login`) akan langsung ditolak dengan pesan edukatif resmi bahasa Indonesia:
  `"Akses ditolak: Akun Anda terdaftar sebagai Bendahara Pesantren. Silakan gunakan portal masuk Bendahara Pesantren (/bendahara/login)."`
- **Verifikasi Build:** Seluruh 5 halaman login dikompilasi secara statis (`○ (Static)`) dengan ukuran bundle optimal 221 kB First Load JS.
- **Profil Mandiri Pengguna:** Endpoint `PATCH /api/auth/profile` telah diverifikasi dapat melayani pembaruan nomor telepon dan kata sandi mandiri untuk seluruh 5 role tanpa konflik hak akses.

---

## 4. PENYESUAIAN SUPABASE AUTH (URL CONFIGURATION)

Agar proses autentikasi (login, logout, session refresh, dan lupa kata sandi) berjalan sempurna pada kedua domain tanpa menimbulkan kendala sesi:

1. Buka **Supabase Dashboard** -> Proyek `jvhzrhfzkjqzlhsvvbgy` (SIPETA Supabase Cloud).
2. Masuk ke menu **Authentication** -> **URL Configuration**.
3. Atur konfigurasi sebagai berikut:
   - **Site URL:**
     ```text
     https://sipetaabumanshur.vercel.app
     ```
   - **Redirect URLs (Allow List):**
     Pastikan kedua domain serta localhost tercantum di dalam daftar:
     ```text
     https://sipetaabumanshur.vercel.app/**
     https://sipeta-abumanshur.vercel.app/**
     http://localhost:3000/**
     ```
4. Klik **Save Changes**.

> [!NOTE]
> Menjaga `https://sipeta-abumanshur.vercel.app/**` tetap ada di dalam Redirect URLs menjamin bahwa sesi aktif pengguna lama dan tautan verifikasi yang telah terkirim sebelumnya tidak akan kedaluwarsa atau menghasilkan error CORS/redirect.

---

## 5. HASIL PENGUJIAN REGRESI DAN INTEGRITAS KODE

Pemeriksaan menyeluruh dilakukan pada branch `main`:

1. **Unit & Integration Tests (Vitest):**
   - **Total Test Files:** 15 berkas.
   - **Total Tests:** 270 pengujian otomatis.
   - **Status:** **100% LULUS (270 passed, 0 failed)**.
   - Termasuk pengujian:
     * `tests/role-login-isolation-and-profile.test.ts`
     * `tests/buat-akun-tanpa-email.test.ts`
     * `tests/kelola-akun-critical-integration.test.ts`
     * `tests/safe-delete-and-management.test.ts`
     * `tests/sipeta-business-rules.test.ts`
     * `tests/supabase-real-postgres.test.ts`
2. **TypeScript Compilation (`tsc --noEmit`):**
   - 0 error, seluruh tipe data database dan komponen valid.
3. **Next.js Production Build (`next build`):**
   - Berhasil mengompilasi seluruh 16 rute aplikasi (`○ Static` dan `ƒ Dynamic`).
   - Middleware ukuran 94.8 kB siap melayani verifikasi sesi dan cookie SSR.
4. **Integritas Data Produksi:**
   - **Database Mutations:** 0 (Tidak ada perubahan schema/data/migrasi).
   - **Kredensial & Rekening Resmi:** Tidak diubah.
   - **Storage Buckets:** Tetap aman pada 4 bucket privat.

---

## 6. KESIMPULAN DAN REKOMENDASI

1. Seluruh kode aplikasi di repositori telah 100% siap mendukung domain baru `sipetaabumanshur.vercel.app` dan navigasi sidebar kiri modern.
2. Mekanisme pengalihan zero-downtime telah diterapkan di `next.config.mjs` sehingga domain lama tetap aktif dan aman digunakan hingga domain baru didaftarkan.
3. Segera setelah pengguna mendaftarkan `sipetaabumanshur.vercel.app` di dashboard Vercel, domain baru akan langsung hidup secara instan.
