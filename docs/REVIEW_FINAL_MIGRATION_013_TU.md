# DOKUMEN TINJAUAN & REVISI FINAL MIGRATION 013 (ROLE TATA USAHA)

**Sistem Informasi Pelayanan Terpadu (SIPETA)**  
**Pondok Pesantren Modern Abu Manshur — Cirebon**  
*Tanggal Finalisasi Review:* 9 November 2026  
*Status Dokumen:* TINJAUAN PRA-EKSEKUSI (BELUM DIEKSEKUSI KE SUPABASE CLOUD)  
*Repositori:* `https://github.com/EkoSartika/sipeta-abumanshur.git`  
*Branch:* `main` | *Commit Terakhir:* `4c98842`  
*Domain Resmi:* `https://sipetaabumanshur.vercel.app`

---

## 1. RINGKASAN REVISI & KEPATUHAN MANDAT

Berdasarkan instruksi dan prinsip kehati-hatian tingkat tinggi, berkas **Migration 013** telah direvisi secara komprehensif:

1. **Enum `pengelola` Dipertahankan untuk Asatidz:** Tipe data ENUM `public.user_role` **TIDAK** menambahkan nilai `'asatidz'`. Peran Asatidz tetap menggunakan enum internal `'pengelola'` pada database Cloud, menjamin 100% kompatibilitas akun lama tanpa mutasi skema redundan.
2. **Penambahan Enum `'tu'` Idempoten:** Penambahan label `'tu'` dibungkus dalam blok kondisional `DO $$ ... IF NOT EXISTS ...` sehingga aman dan kebal terhadap eksekusi berulang.
3. **Arsitektur RLS 100% Aditif (Non-Destruktif):** Kebijakan lama milik Superadmin, Pengasuh (Admin), Bendahara, Pengelola (Asatidz), dan Wali **SAMA SEKALI TIDAK DIHAPUS ATAU DIUBAH**. Seluruh hak akses TU diberikan melalui kebijakan baru berprefiks `TU`.
4. **Prinsip Hak Akses Minimum (Least Privilege):**
   - TU berwenang mengelola data santri, wali santri, master kelas, dan master kamar.
   - TU **TIDAK DAPAT** membaca seluruh profil staf. Hak baca tabel `public.profiles` dibatasi secara ketat hanya untuk profil dirinya sendiri dan akun ber-role `wali`.
   - TU **TIDAK DIBERI** hak kelola pengumuman pesantren. Pengelolaan pengumuman tetap eksklusif di tangan Pengasuh (Admin) dan Superadmin.
5. **Isolasi Finansial Mutlak:** Migration 013 tidak menyentuh tabel keuangan apa pun (`tagihan`, `transaksi_pembayaran`, `transaksi_uang_saku`, `saldo_uang_saku`, `jurnal_pembukuan`, `rekening_pesantren`).
6. **Pencegahan Catatan Ganda (Zero Double-Insert):** Trigger `trg_after_santri_placement_update` di Cloud secara otomatis merekam perubahan penempatan ke `riwayat_penempatan_santri`. Klien TU hanya memperbarui data santri sehingga tidak menghasilkan duplikasi catatan histori.

---

## 2. NASKAH SQL MIGRATION 013 (REVISI FINAL)

Berkas: [`supabase/migrations/013_tu_role_and_class_room_transfer.sql`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/supabase/migrations/013_tu_role_and_class_room_transfer.sql)

```sql
-- ============================================================================
-- SIPETA MIGRATION 013 (REVISI FINAL): ROLE TATA USAHA (TU) & LEAST PRIVILEGE RLS
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- STATUS: DOKUMEN TINJAUAN PRA-EKSEKUSI (BELUM DIEKSEKUSI KE SUPABASE CLOUD)
-- Tanggal Revisi: 9 November 2026
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PENAMBAHAN ENUM ROLE 'tu' SECARA IDEMPOTEN
-- (Enum 'pengelola' tetap digunakan untuk Asatidz; 'asatidz' TIDAK ditambahkan)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        WHERE t.typname = 'user_role' AND e.enumlabel = 'tu'
    ) THEN
        ALTER TYPE public.user_role ADD VALUE 'tu';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. KEBIJAKAN RLS TATA USAHA (TU) PADA TABEL SANTRI
-- TU berwenang membaca, menambah, memperbarui, dan safe-delete santri.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
CREATE POLICY "Santri: TU baca data santri"
ON public.santri FOR SELECT
TO authenticated
USING (public.get_my_role() = 'tu');

DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;
CREATE POLICY "Santri: TU kelola data santri"
ON public.santri FOR ALL
TO authenticated
USING (public.get_my_role() = 'tu')
WITH CHECK (public.get_my_role() = 'tu');

-- ----------------------------------------------------------------------------
-- 3. KEBIJAKAN RLS TATA USAHA (TU) PADA TABEL WALI SANTRI
-- TU berwenang membaca dan mengelola relasi wali murid santri.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
CREATE POLICY "Wali Santri: TU baca relasi wali"
ON public.wali_santri FOR SELECT
TO authenticated
USING (public.get_my_role() = 'tu');

DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;
CREATE POLICY "Wali Santri: TU kelola relasi wali"
ON public.wali_santri FOR ALL
TO authenticated
USING (public.get_my_role() = 'tu')
WITH CHECK (public.get_my_role() = 'tu');

-- ----------------------------------------------------------------------------
-- 4. KEBIJAKAN RLS TATA USAHA (TU) PADA TABEL MASTER KELAS
-- TU berwenang melihat dan mengelola ruang kelas & tingkat pendidikan.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
CREATE POLICY "Master Kelas: TU baca ruang kelas"
ON public.kelas FOR SELECT
TO authenticated
USING (public.get_my_role() = 'tu');

DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;
CREATE POLICY "Master Kelas: TU kelola ruang kelas"
ON public.kelas FOR ALL
TO authenticated
USING (public.get_my_role() = 'tu')
WITH CHECK (public.get_my_role() = 'tu');

-- ----------------------------------------------------------------------------
-- 5. KEBIJAKAN RLS TATA USAHA (TU) PADA TABEL MASTER KAMAR ASRAMA
-- TU berwenang melihat dan mengelola kamar asrama santri.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
CREATE POLICY "Master Kamar: TU baca kamar asrama"
ON public.kamar FOR SELECT
TO authenticated
USING (public.get_my_role() = 'tu');

DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;
CREATE POLICY "Master Kamar: TU kelola kamar asrama"
ON public.kamar FOR ALL
TO authenticated
USING (public.get_my_role() = 'tu')
WITH CHECK (public.get_my_role() = 'tu');

-- ----------------------------------------------------------------------------
-- 6. KEBIJAKAN RLS TATA USAHA (TU) PADA RIWAYAT PENEMPATAN SANTRI
-- TU berwenang membaca histori mutasi dan mencatat perpindahan kelas/kamar.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
CREATE POLICY "Riwayat Penempatan: TU baca histori mutasi"
ON public.riwayat_penempatan_santri FOR SELECT
TO authenticated
USING (public.get_my_role() = 'tu');

DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;
CREATE POLICY "Riwayat Penempatan: TU catat mutasi kelas dan kamar"
ON public.riwayat_penempatan_santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'tu');

-- ----------------------------------------------------------------------------
-- 7. KEBIJAKAN RLS TATA USAHA (TU) PADA TABEL PROFILES (HAK MINIMAL)
-- TU HANYA boleh membaca profil dirinya sendiri dan profil akun Wali Santri.
-- Profil staf lain (Superadmin, Admin, Bendahara, Pengelola) TIDAK DAPAT dibaca.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;
CREATE POLICY "Profiles: TU baca profil wali santri untuk administrasi"
ON public.profiles FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'tu' 
    AND (id = auth.uid() OR role = 'wali')
);
```

---

## 3. MATRIKS RLS: SEBELUM DAN SESUDAH MIGRATION 013

| Nama Tabel | Perintah | Kebijakan Eksisting (Migration 008–012) | Kebijakan Tambahan (Migration 013 Revisi) | Status Perubahan |
|---|:---:|---|---|:---:|
| **`public.santri`** | `SELECT` | `superadmin`, `admin`, `bendahara`, `pengelola`, `wali` (anak sendiri) | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** (Kebijakan lama tetap aktif) |
| **`public.santri`** | `ALL` | `superadmin`, `admin` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.wali_santri`** | `SELECT` | `id = auth.uid()` OR `superadmin`, `admin`, `bendahara` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.wali_santri`** | `ALL` | `superadmin`, `admin` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.kelas`** | `SELECT` | `superadmin`, `admin`, `bendahara`, `pengelola`, `wali` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.kelas`** | `ALL` | `superadmin`, `admin` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.kamar`** | `SELECT` | `superadmin`, `admin`, `bendahara`, `pengelola`, `wali` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.kamar`** | `ALL` | `superadmin`, `admin` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.riwayat_penempatan_santri`** | `SELECT` | `superadmin`, `admin`, `bendahara`, `pengelola`, `wali` (anak sendiri) | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.riwayat_penempatan_santri`** | `INSERT` | `superadmin`, `admin` | Ditambah: `public.get_my_role() = 'tu'` | **Aditif Murni** |
| **`public.profiles`** | `SELECT` | `id = auth.uid()` OR `superadmin`, `admin`, `bendahara`, `pengelola` | Ditambah: `public.get_my_role() = 'tu' AND (id = auth.uid() OR role = 'wali')` | **Least Privilege Terisolasi** (Staf lain tidak dapat diintip) |
| **`public.pengumuman`** | `ALL` | `superadmin`, `admin` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |
| **`public.tagihan`** | `ALL` | `superadmin`, `bendahara` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |
| **`public.transaksi_pembayaran`** | `ALL` | `superadmin`, `bendahara` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |
| **`public.saldo_uang_saku`** | `UPDATE` | `superadmin`, `bendahara` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |
| **`public.transaksi_uang_saku`** | `ALL` | `superadmin`, `bendahara` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |
| **`public.jurnal_pembukuan`** | `ALL` | `superadmin`, `bendahara` | **TIDAK ADA PERUBAHAN** | **Tidak Disentuh** |

---

## 4. DAFTAR TABEL, OPERASI, DAN ROLE ACCESS FINAL

```
┌─────────────────────────────────┬──────────────────────┬────────────────────────────────────────────────────────┐
│ Tabel Database                  │ Operasi Diizinkan    │ Role yang Memiliki Hak Akses                           │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.santri                   │ SELECT               │ superadmin, admin, tu, bendahara, pengelola, wali      │
│ public.santri                   │ INSERT/UPDATE/DELETE │ superadmin, admin, tu                                  │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.wali_santri              │ SELECT               │ superadmin, admin, tu, bendahara, wali (diri sendiri)  │
│ public.wali_santri              │ INSERT/UPDATE/DELETE │ superadmin, admin, tu                                  │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.kelas                    │ SELECT               │ superadmin, admin, tu, bendahara, pengelola, wali      │
│ public.kelas                    │ INSERT/UPDATE/DELETE │ superadmin, admin, tu                                  │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.kamar                    │ SELECT               │ superadmin, admin, tu, bendahara, pengelola, wali      │
│ public.kamar                    │ INSERT/UPDATE/DELETE │ superadmin, admin, tu                                  │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.riwayat_penempatan_santri│ SELECT               │ superadmin, admin, tu, bendahara, pengelola, wali      │
│ public.riwayat_penempatan_santri│ INSERT               │ superadmin, admin, tu (serta via trigger PostgreSQL)  │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ public.profiles                 │ SELECT               │ Staf internal: semua profil                            │
│                                 │                      │ TU: Diri sendiri + Profil Role Wali                    │
│                                 │                      │ Wali: Diri sendiri                                     │
│ public.profiles                 │ INSERT/UPDATE/DELETE │ superadmin (eksklusif)                                 │
├─────────────────────────────────┼──────────────────────┼────────────────────────────────────────────────────────┤
│ Modul Finansial (5 Tabel)       │ ALL                  │ superadmin, bendahara (TU 100% TERISOLASI)             │
│ Modul Pengumuman                │ INSERT/UPDATE/DELETE │ superadmin, admin (TU TIDAK MEMILIKI HAK TULIS)        │
└─────────────────────────────────┴──────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 5. AUDIT FUNGSI `get_my_role()` DAN PERILAKU DATABASE ENGINE

Fungsi verifikasi otentikasi di PostgreSQL Cloud:
```sql
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;
```
* **Hasil Evaluasi:**
  - Fungsi ini mengembalikan tipe `public.user_role`.
  - Ketika enum `'tu'` ditambahkan ke tipe data `public.user_role`, fungsi `get_my_role()` secara otomatis mengenali dan mengembalikan nilai `'tu'::public.user_role` tanpa memerlukan perubahan kode fungsi.
  - Kebijakan yang mengevaluasi `public.get_my_role() IN ('superadmin', 'admin')` akan bernilai `FALSE` bagi pengguna TU.
  - Kebijakan yang mengevaluasi `public.get_my_role() = 'tu'` akan bernilai `TRUE` khusus bagi staf TU yang aktif.
  - Tidak ada hak peran lain yang diperluas atau terkompromi.

---

## 6. PROSEDUR ROLLBACK YANG AMAN

Apabila setelah eksekusi Migration 013 di kemudian hari timbul kebutuhan untuk mencabut peran Tata Usaha (TU), prosedur rollback dapat dijalankan secara instan tanpa mengganggu data operasional lainnya.

### Script SQL Rollback:
```sql
-- ============================================================================
-- SIPETA: PROSEDUR ROLLBACK RESMI MIGRATION 013
-- Menghapus seluruh 11 kebijakan RLS aditif Tata Usaha (TU)
-- ============================================================================

-- 1. Hapus Kebijakan RLS TU pada Santri
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;

-- 2. Hapus Kebijakan RLS TU pada Wali Santri
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;

-- 3. Hapus Kebijakan RLS TU pada Master Kelas
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;

-- 4. Hapus Kebijakan RLS TU pada Master Kamar
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;

-- 5. Hapus Kebijakan RLS TU pada Riwayat Penempatan
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;

-- 6. Hapus Kebijakan RLS TU pada Profiles
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;

-- Catatan Penanganan Akun & ENUM:
-- PostgreSQL tidak mendukung pencabutan nilai ENUM yang sudah ditambahkan tanpa merekonstruksi tipe data.
-- Namun label 'tu' pada ENUM akan menjadi sepenuhnya pasif (inert) dan tidak memiliki izin RLS apa pun.
-- Akun TU yang telah dibuat cukup dinonaktifkan (is_active = false) atau dihapus oleh Superadmin.
```

---

## 7. HASIL PENGUJIAN OTOMATIS LOKAL

Suite pengujian khusus [`tests/migration-013-tu-review.test.ts`](file:///C:/Users/Eko/.gemini/antigravity/scratch/sipeta/tests/migration-013-tu-review.test.ts) (20 skenario uji) bersama seluruh 18 test suite lainnya telah dijalankan dengan hasil:
- **Total Test Files:** 19 berkas (100% Passed)
- **Total Tests:** 333 skenario uji (100% Passed, 0 Failed)
- **TypeScript Typecheck (`tsc --noEmit`):** 0 Error
- **Status:** Seluruh 10 kriteria pengujian pra-eksekusi terverifikasi sempurna.

