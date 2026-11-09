# LAPORAN PEMERIKSAAN KESIAPAN PRODUKSI ROLE TATA USAHA (TU) & MIGRATION 013

**Sistem Informasi Pelayanan Terpadu (SIPETA)**  
**Pondok Pesantren Modern Abu Manshur — Cirebon**  
*Tanggal Pemeriksaan:* 9 November 2026  
*Repositori:* `https://github.com/EkoSartika/sipeta-abumanshur.git`  
*Branch:* `main` | *Commit Terakhir:* `4c0a921` (Pascabuild & Deploy Restrukturisasi 6 Role `d4ef8d9`)  
*Domain Produksi:* `https://sipetaabumanshur.vercel.app`

---

## 1. KEPUTUSAN AKHIR AUDIT

> [!IMPORTANT]
> **KEPUTUSAN AKHIR:**  
> **B. MEMBUTUHKAN MIGRATION 013 SEBELUM DIGUNAKAN SECARA OPERASIONAL DI CLOUD.**
>
> **Ringkasan Putusan:**
> Secara kode aplikasi, komponen antarmuka, routing, server API, dan isolasi keamanan, sistem SIPETA telah **100% siap**. Namun di level database Supabase Cloud, tipe data PostgreSQL ENUM `public.user_role` saat ini hanya beranggotakan lima nilai: `('superadmin', 'admin', 'bendahara', 'pengelola', 'wali')`. Tanpa penambahan nilai `'tu'` ke ENUM dan pembaruan RLS policies pada tabel `santri`, `kelas`, `kamar`, `wali_santri`, dan `riwayat_penempatan_santri`, pengguna dengan role `tu` akan mengalami kegagalan pembuatan akun di Cloud (error constraint ENUM `22P02`) dan query modifikasi browser akan diblokir oleh RLS Cloud yang saat ini hanya mengizinkan `('superadmin', 'admin')`.

---

## 2. HASIL PEMERIKSAAN MENYELURUH (7 ASPEK AUDIT)

### 1. Fungsi Login Role TU pada Database Cloud Saat Ini
* **Hasil Uji:** ⚠️ **BELUM DAPAT DIGUNAKAN DI CLOUD KARENA BELUM ADA AKUN TU DI CLOUD**
* **Analisis Teknis:**
  - Halaman login `/tu/login` telah live dan dapat diakses publik dengan status HTTP `200 OK`.
  - Logika isolasi peran (`auth.service.ts`) mewajibkan `profile.role === "tu"`.
  - Akun lama ber-role `admin` tidak dapat login di `/tu/login` karena sistem menolak:  
    *`"Akses ditolak: Akun Anda terdaftar sebagai Pengasuh Pondok. Silakan gunakan portal masuk Pengasuh Pondok (/admin/login)."`*
  - Ketika Superadmin mencoba membuat akun staf baru ber-role `tu` melalui `POST /api/admin-users`, Supabase Admin Client akan mengeksekusi:  
    `INSERT INTO public.profiles (..., role) VALUES (..., 'tu')`.
  - Karena tipe kolom `profiles.role` adalah PostgreSQL ENUM `public.user_role` yang belum memiliki nilai `'tu'`, PostgreSQL Cloud menolak query dengan error:  
    `invalid input value for enum user_role: "tu" (SQLSTATE 22P02)`.
  - Akibatnya, pembuatan akun TU gagal dan API melakukan rollback atomik penghapusan auth user.

---

### 2. Keamanan API TU untuk Tambah, Edit, dan Kelola Data Santri
* **Hasil Uji:** ✅ **AMAN & TERVERIFIKASI (SERVER-SIDE GUARDS)**
* **Analisis Endpoint:**
  1. **Registrasi Santri Tunggal (`POST /api/admin-santri`):**
     - Memverifikasi sesi pemanggil di server (`auth.getUser()`).
     - Memeriksa otorisasi: hanya `callerProfile.role IN ('superadmin', 'admin', 'tu')` yang diizinkan.
     - Operasi dilakukan menggunakan `createSupabaseAdminClient()` (Service Role Key - server only), sehingga kebal terhadap RLS browser client dan menjamin integritas atomik (santri + akun wali 1:1 + profil wali otomatis).
  2. **Import Batch Santri Excel (`POST /api/admin-santri/import`):**
     - Memvalidasi caller session dan izin role: `('superadmin', 'admin', 'tu')`.
     - Memvalidasi seluruh baris: NIS unik, validitas tanggal, referensi kelas & kamar, serta relasi wali.
     - Transaksi batch atomik dengan auto-rollback bila terjadi kegagalan fatal.
  3. **Penghapusan Massal Santri (`DELETE /api/admin-santri`):**
     - Mengimplementasikan *Safe-Delete Guard*: memeriksa foreign key relasi keuangan (`tagihan`, `transaksi_pembayaran`, `transaksi_uang_saku`) dan kepesantrenan (`prestasi`, `pelanggaran`).
     - Santri yang memiliki riwayat keuangan tidak di-hard delete, melainkan dialihkan secara aman ke status `'PINDAH'`/`'NONAKTIF'`.

---

### 3. Pemindahan Kelas & Kamar serta Pencatatan Riwayat Penempatan
* **Hasil Uji:** ✅ **TERVERIFIKASI & DIPERBAIKI (COMMIT 4c0a921)**
* **Mekanisme Kerja:**
  - Di tingkat aplikasi (`src/lib/store/sipeta-context.tsx`), pemanggilan `moveSantriPlacement` kini secara otomatis mendispatch pembaruan ke `administrasiService.moveSantriPlacement(santriId, newKelasId, newKamarId, alasan)`.
  - Di tingkat database Cloud, tabel `public.santri` telah memiliki trigger PostgreSQL:
    - Trigger `trg_after_santri_placement_update` memanggil fungsi `public.handle_after_santri_placement_update()`.
    - Setiap kali kolom `kelas_id` atau `kamar_id` diperbarui, trigger secara otomatis meng-insert 1 baris rekam jejak ke `public.riwayat_penempatan_santri` lengkap dengan `kelas_id_lama`, `kelas_id_baru`, `kamar_id_lama`, `kamar_id_baru`, tanggal mutasi, dan user pengubah.
  - Namun, mutasi langsung dari browser client TU memerlukan RLS update di Migration 013 agar pengguna ber-role `tu` memiliki hak `UPDATE` pada `public.santri`.

---

### 4. Ketersediaan Tabel `riwayat_penempatan_santri` di Supabase Cloud
* **Hasil Uji Read-Only Langsung ke Cloud:** ✅ **TERSEDIA & TERVERIFIKASI**
* **Bukti Eksekusi Read-Only Query:**
  - Koneksi ke `https://jvhzrhfzkjqzlhsvvbgy.supabase.co`:
    ```
    Tabel: public.riwayat_penempatan_santri
    Status: TERSEDIA (HTTP 200)
    Jumlah Baris Saat Ini: 0 baris (Siap menerima data penempatan)
    Skema: id (UUID PK), santri_id (UUID FK), kelas_id_lama (FK), kelas_id_baru (FK),
           kamar_id_lama (FK), kamar_id_baru (FK), alasan_pindah (TEXT),
           tanggal_pindah (DATE), created_by (FK), created_at (TIMESTAMPTZ)
    ```

---

### 5. Kebutuhan Database Enum `tu` vs. Fallback Mapping
* **Hasil Evaluasi:** 🔴 **WAJIB MENAMBAHKAN ENUM DATABASE `tu` (MIGRATION 013)**
* **Mengapa Fallback Mapping Tidak Layak?**
  1. **Prinsip Least Privilege & Isolasi:** Jika TU dipaksa menggunakan role `admin` dengan fallback mapping, pengguna TU secara teknis akan memiliki hak membuka portal Pengasuh Pondok (`/admin/login`), melihat kuadran pengawasan eksekutif, dan melihat rekapitulasi audit log tingkat pimpinan.
  2. **Integritas RLS Supabase:** Fungsi `public.get_my_role()` di Supabase Cloud membaca nilai kolom `role` langsung dari tabel `public.profiles`. Jika kolom `role` bernilai `admin`, seluruh RLS database menganggap user tersebut adalah Admin Pengasuh.
  3. **Kejelasan Audit Trail:** Dalam tabel `public.audit_logs`, kolom `user_role` mencatat role asli pelaku mutasi. Memiliki enum `tu` yang eksplisit memastikan bahwa catatan mutasi pendaftaran santri tercatat atas nama `Tata Usaha (TU)`, bukan `Admin`.

---

### 6. Audit RLS & Pencegahan Celah Akses Finansial & Modul Superadmin
* **Hasil Audit:** ✅ **100% KEDAP / TERISOLASI KETAT**
* **Matriks Isolasi Hak Akses TU:**
  - **Transaksi Keuangan (SPP, Tagihan, Kasir):**
    - UI: Tidak ada tab atau tombol transaksi keuangan di sidebar TU.
    - Context: Seluruh fungsi mutasi tagihan (`generateTagihan`, `adjustTagihan`, `verifikasiPembayaran`, `serahkanUangSaku`, `catatJurnalKoreksi`) dibatasi hanya untuk `bendahara` dan `superadmin`.
    - RLS Cloud: Tabel `transaksi_pembayaran`, `transaksi_uang_saku`, `saldo_uang_saku`, dan `jurnal_pembukuan` dilindungi RLS ketat dengan klausa:  
      `USING (public.get_my_role() IN ('superadmin', 'bendahara'))`. Akses tulis TU ditolak secara absolut oleh database engine.
  - **Modul Superadmin (Manajemen Pengguna Staf & Rekening):**
    - UI: Menu "Manajemen Akun Staf" dan "Rekening Resmi Pesantren" tidak muncul pada role TU.
    - API: `POST /api/admin-users` hanya menerima caller dengan `role === "superadmin"`. Request dari TU otomatis ditolak dengan status HTTP `403 Forbidden`.
    - RLS Cloud: Kebijakan `Profiles: superadmin kelola semua akun` hanya mengizinkan `public.get_my_role() = 'superadmin'`.

---

### 7. Status Deployment Produksi & Verifikasi Enam Portal Login
* **Hasil Uji Live HTTP pada Domain Resmi (`https://sipetaabumanshur.vercel.app`):** ✅ **AKTIF & LIVE**

| No | URL Endpoint Produksi | HTTP Status | Keterangan Verifikasi |
|:--:|---|:---:|---|
| 1 | `https://sipetaabumanshur.vercel.app/` | `200 OK` | Halaman beranda 6 kartu portal aktif |
| 2 | `https://sipetaabumanshur.vercel.app/admin/login` | `200 OK` | Portal Masuk Pengasuh Pondok |
| 3 | `https://sipetaabumanshur.vercel.app/tu/login` | `200 OK` | Portal Masuk Tata Usaha (TU) |
| 4 | `https://sipetaabumanshur.vercel.app/asatidz/login` | `200 OK` | Portal Masuk Asatidz & Pembina |
| 5 | `https://sipetaabumanshur.vercel.app/bendahara/login` | `200 OK` | Portal Masuk Bendahara Pesantren |
| 6 | `https://sipetaabumanshur.vercel.app/login` | `200 OK` | Portal Masuk Orang Tua / Wali Santri |
| 7 | `https://sipetaabumanshur.vercel.app/superadmin/login` | `200 OK` | Portal Masuk Superadmin |
| 8 | `https://sipetaabumanshur.vercel.app/pengelola/login` | `307 Redirect` | Otomatis dialihkan ke `/asatidz/login` |
| 9 | `https://sipetaabumanshur.vercel.app/api/health` | `200 OK` | Endpoint diagnostik backend sehat |

---

## 3. PAKET SQL MIGRATION 013 UNTUK DITINJAU

> [!CAUTION]
> **PERINGATAN KEAMANAN:** Script SQL di bawah ini **HANYA DITAMPILKAN UNTUK DITINJAU** sesuai instruksi. Agent **TIDAK AKAN** mengeksekusi script ini ke Supabase Cloud.

### Berkas Referensi: `supabase/migrations/013_tu_role_and_class_room_transfer.sql`

```sql
-- ============================================================================
-- SIPETA MIGRATION 013: PENAMBAHAN ROLE TATA USAHA (TU) & KEBIJAKAN HAK AKSES
-- Pondok Pesantren Modern Abu Manshur
-- STATUS: DOKUMEN TINJAUAN ARSITEKTUR (BELUM DIEKSEKUSI KE CLOUD)
-- ============================================================================

-- 1. Tambahkan nilai 'tu' dan 'asatidz' ke tipe ENUM public.user_role
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'tu'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'tu';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'asatidz'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'asatidz';
    END IF;
END $$;

-- 2. Kebijakan RLS untuk Tata Usaha (TU) pada Tabel Master Data Santri
DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;
CREATE POLICY "Santri: TU kelola data santri"
ON public.santri
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 3. Kebijakan RLS untuk Tata Usaha (TU) pada Tabel Wali Santri
DROP POLICY IF EXISTS "Wali: TU kelola relasi wali" ON public.wali_santri;
CREATE POLICY "Wali: TU kelola relasi wali"
ON public.wali_santri
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 4. Kebijakan RLS untuk Tata Usaha (TU) pada Tabel Master Kelas
DROP POLICY IF EXISTS "Kelas: TU kelola ruang kelas" ON public.kelas;
CREATE POLICY "Kelas: TU kelola ruang kelas"
ON public.kelas
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 5. Kebijakan RLS untuk Tata Usaha (TU) pada Tabel Master Kamar Asrama
DROP POLICY IF EXISTS "Kamar: TU kelola kamar asrama" ON public.kamar;
CREATE POLICY "Kamar: TU kelola kamar asrama"
ON public.kamar
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 6. Kebijakan RLS untuk Tata Usaha (TU) pada Riwayat Penempatan Santri
DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;
CREATE POLICY "Riwayat Penempatan: TU catat mutasi kelas dan kamar"
ON public.riwayat_penempatan_santri
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu', 'bendahara', 'pengelola', 'asatidz'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 7. Kebijakan RLS untuk Tata Usaha (TU) pada Pengumuman Pesantren
DROP POLICY IF EXISTS "Pengumuman: TU kelola pengumuman santri" ON public.pengumuman;
CREATE POLICY "Pengumuman: TU kelola pengumuman santri"
ON public.pengumuman
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

-- 8. Kebijakan RLS untuk Pembacaan Profil oleh Staf TU
DROP POLICY IF EXISTS "Profiles: TU baca profil santri dan wali" ON public.profiles;
CREATE POLICY "Profiles: TU baca profil santri dan wali"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu', 'bendahara', 'pengelola', 'asatidz'));
```

### Alasan Teknis Kebutuhan Migration 013:
1. **Validitas ENUM PostgreSQL (`user_role`):** Tanpa baris 1-21, kolom `role` pada `public.profiles` menolak nilai `'tu'`. Pembuatan akun staf TU di Supabase Auth tidak dapat disinkronkan ke tabel `public.profiles`.
2. **Keterbacaan Santri di Browser Client TU:** RLS tabel `public.santri` saat ini hanya mengizinkan `superadmin`, `admin`, `bendahara`, dan `pengelola`. Jika user login sebagai `tu`, kueri `SELECT` santri dari browser akan mengembalikan array kosong (0 baris).
3. **Pemberian Hak Mutasi Penempatan Santri:** Kebijakan RLS `ALL` pada tabel `kelas`, `kamar`, dan `santri` saat ini hanya dimiliki `superadmin` dan `admin`. Agar staf TU dapat menambah kelas/kamar dan memindahkan santri, peran `tu` wajib diikutsertakan ke dalam RLS.
4. **Zero-Impact pada Modul Keuangan:** Migration 013 **sama sekali tidak menyentuh** tabel finansial (`tagihan`, `transaksi_pembayaran`, `transaksi_uang_saku`, `saldo_uang_saku`, `jurnal_pembukuan`). Dengan demikian, integritas keuangan pesantren 100% terjaga dan staf TU tetap tidak dapat mengakses maupun memodifikasi data keuangan.

---

## 4. PANDUAN EKSEKUSI MANDIRI OLEH PENGGUNA (BILA DISETUJUI)

Apabila pihak yayasan / administrator menyetujui penerapan role Tata Usaha (TU) secara permanen di database Cloud:
1. Buka dashboard proyek Supabase Cloud: `https://supabase.com/dashboard/project/jvhzrhfzkjqzlhsvvbgy`.
2. Pilih menu **SQL Editor** pada navigasi sebelah kiri.
3. Klik **New query**, lalu salin dan tempelkan seluruh script SQL dari Bagian 3 di atas.
4. Klik tombol **Run**.
5. Verifikasi pesan keberhasilan (*Success. No rows returned*).
6. Setelah itu, Superadmin dapat membuka portal SIPETA (`/superadmin/login`), membuka menu **Manajemen Akun Staf**, dan membuat akun staf Tata Usaha baru dengan role **Tata Usaha (TU)**. Akun tersebut langsung dapat login di `/tu/login`.
