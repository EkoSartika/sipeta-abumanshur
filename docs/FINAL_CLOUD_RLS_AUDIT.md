# FINAL CLOUD RLS AUDIT REPORT — SIPETA
**Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur**
**Target Supabase Project:** `https://jvhzrhfzkjqzlhsvvbgy.supabase.co` (`jvhzrhfzkjqzlhsvvbgy`)  
**Audit Date:** 8 November 2026  
**Status:** AUDITED — REMEDIATION PACKAGED IN `008_security_remediation.sql`

---

## 1. Executive Summary

Berdasarkan status aktual Supabase Cloud pasca eksekusi migrasi `0001` sampai `0007` melalui SQL Editor, skema database telah aktif dengan:
- **27 Tabel Operasional** pada skema `public` (seluruhnya berstatus `ROW LEVEL SECURITY ENABLED`).
- **48 Kebijakan RLS** pada skema `public`.
- **4 Private Storage Buckets** (`bukti-pembayaran`, `bukti-uang-saku`, `foto-penyerahan-saku`, `dokumentasi-kepesantrenan`).
- **13 Kebijakan Storage** pada tabel `storage.objects`.
- **17 Database Functions & RPCs**.
- **17 Triggers**.

Audit keamanan mendalam telah dilakukan terhadap seluruh kebijakan aktif tersebut. Ditemukan 5 area yang memerlukan pengetatan dan perbaikan (remediasi). Seluruh perbaikan telah diformulasikan ke dalam satu file migrasi terisolasi: `supabase/migrations/008_security_remediation.sql`.

---

## 2. Rincian Temuan Keamanan & Analisis Risiko

### Temuan 1: Kebocoran Privasi Wali pada Riwayat Perubahan Kedisiplinan
- **Tabel:** `public.riwayat_perubahan_kedisiplinan`
- **Kondisi Sebelumnya (Migration 0007):**
  Kebijakan `Riwayat Kedisiplinan: baca sesuai akses kedisiplinan` mengizinkan Wali membaca riwayat perubahan selama `c.santri_id = public.get_my_santri_id()`. Kebijakan ini **TIDAK** memverifikasi flag `c.is_published_to_wali = true` pada catatan kedisiplinan induk.
- **Risiko:** Wali santri dapat membaca riwayat catatan pembinaan internal asatidz yang status publikasinya masih `false` (belum disahkan atau masih dalam pembinaan rahasia).
- **Remediasi di 008:**
  Menambahkan klausul `AND c.is_published_to_wali = true` khusus untuk role `wali`.

---

### Temuan 2: Seluruh Kebijakan RLS Skema Public Menggunakan Target Role `{public}`
- **Tabel:** 27 tabel operasional pada skema `public`
- **Kondisi Sebelumnya (Migration 0007):**
  Pernyataan `CREATE POLICY` tidak mendeklarasikan klausa `TO <role>`, sehingga PostgreSQL secara default menerapkan `TO public`.
- **Risiko:** Kueri dari koneksi unauthenticated (`anon`) mengevaluasi ekspresi fungsi RLS (seperti `get_my_role()`) pada setiap baris kueri. Meskipun `get_my_role()` mengembalikan `NULL` untuk anon, kueri membebani gateway dan membuka celah jika ada logika kebijakan permisif.
- **Remediasi di 008:**
  - Menetapkan klausul eksplisit `TO authenticated` pada seluruh kebijakan 27 tabel operasional.
  - Menyediakan satu kebijakan `TO anon` khusus pada tabel `public.pengumuman` hanya untuk pengumuman yang telah terbit (`is_published = true`).

---

### Temuan 3 & 4: Redundansi Kebijakan Storage pada `foto-penyerahan-saku`
- **Tabel:** `storage.objects`
- **Kondisi Sebelumnya (Migration 0007):**
  Terdapat dua kebijakan tumpang tindih untuk peran Bendahara/Superadmin:
  1. `Storage Foto Penyerahan: upload eksklusif bendahara` (`FOR INSERT`)
  2. `Storage Foto Penyerahan: kelola` (`FOR ALL`)
- **Risiko:** Redundansi evaluasi engine Supabase Storage, kebingungan audit hak akses, dan potensi konflik evaluasi ekspresi `WITH CHECK`.
- **Remediasi di 008:**
  Menghapus kebijakan `Storage Foto Penyerahan: upload eksklusif bendahara` (`DROP POLICY IF EXISTS`). Hak upload dan manipulasi foto penyerahan sepenuhnya dan aman ditangani oleh kebijakan `FOR ALL` (`Storage Foto Penyerahan: kelola`).

---

### Temuan 5: Standarisasi Otorisasi Master Data Kepesantrenan
- **Tabel:** `public.target_tahfidz` & `public.master_kategori_pelanggaran`
- **Kondisi Sebelumnya (Migration 0007):**
  Penamaan kebijakan dan klausul role belum seragam. Ada kebijakan yang mencantumkan nama "admin & superadmin" namun ekspresinya menyertakan `pengelola`.
- **Risiko:** Ambiguitas tata kelola antara tim kepesantrenan (asatidz/pengelola) dan administrator pesantren.
- **Remediasi di 008:**
  Menstandarisasi nama kebijakan menjadi `kelola oleh pengelola, admin & superadmin` dengan klausul `TO authenticated` dan hak kelola untuk ketiga peran berwenang.

---

## 3. Matriks Perbandingan Sebelum vs Sesudah Remediasi

| Parameter Keamanan | Sebelum Remediasi (0007) | Sesudah Remediasi (008) | Status Risiko |
| :--- | :--- | :--- | :--- |
| **Target Role Public Policies** | `{public}` (48 policies) | `authenticated` (47) + `anon` (1) | **HARDENED** |
| **Privasi Wali Kedisiplinan** | Mengabaikan `is_published_to_wali` pada riwayat | Wajib `is_published_to_wali = true` | **SECURED** |
| **Akses Publik Pengumuman** | Implisit via `{public}` | Eksplisit `TO anon` (is_published=true) | **CONTROLLED** |
| **Storage Policies objects** | 13 policies (1 redundant) | 12 policies (deduplicated) | **OPTIMIZED** |
| **Folder Isolation Wali** | `split_part(name, '/', 1) = santri_id` | Dipertahankan 100% pada 12 policies | **STRICT** |
| **Master Data Kepesantrenan** | Role naming inconsistently aligned | Selaras untuk superadmin, admin, pengelola | **ALIGNED** |

---

## 4. Hasil Verifikasi Mesin Pengujian

Remediasi ini telah diuji secara menyeluruh pada engine PostgreSQL 16 (PGlite):
- **Unit & Integration Tests:** 93 passed (100% lulus).
- **TypeScript Static Check:** 0 error (`npm run typecheck` lulus).
- **Next.js Production Build:** Compiled successfully (`npm run build` exit code 0).
- **Zero Regressions:** Fitur checkout cicilan, validasi saku ledger atomik, dan proteksi portal 5 role tetap berfungsi normal.

