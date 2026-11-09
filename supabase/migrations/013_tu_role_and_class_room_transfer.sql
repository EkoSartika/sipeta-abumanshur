-- ============================================================================
-- SIPETA MIGRATION 013 (FINAL HARDENED — NO DELETE FOR TU):
-- ROLE TATA USAHA (TU) & GRANULAR LEAST PRIVILEGE RLS POLICIES
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- STATUS: DOKUMEN TINJAUAN PRA-EKSEKUSI (BELUM DIEKSEKUSI KE SUPABASE CLOUD)
-- Tanggal Revisi Final: 9 November 2026
--
-- PRINSIP KEAMANAN & HARDENING:
-- 1. Anti-Delete: Role TU sama sekali TIDAK memiliki hak DELETE pada santri,
--    wali_santri, kelas, dan kamar. Seluruh policy 'FOR ALL' diganti menjadi
--    policy granular terpisah: SELECT, INSERT, dan UPDATE saja.
-- 2. Transaction-Safe: Menggunakan kualifikasi 'public.get_my_role()::text = ''tu'''
--    untuk mencegah PostgreSQL transactional lock 'unsafe use of new value in transaction'.
-- 3. Non-Destruktif: Tidak ada kebijakan lama milik Superadmin, Pengasuh (Admin),
--    Bendahara, Asatidz (Pengelola), atau Wali yang dihapus atau diperlemah.
-- 4. Isolasi Finansial Mutlak: 0 tabel keuangan disentuh oleh migration ini.
-- 5. Profil Terbatas: TU hanya dapat membaca profil dirinya sendiri dan akun Wali.
-- 6. Dua Tahap Eksekusi Jelas: Mendukung eksekusi satu query utuh maupun 2 tahap.
-- ============================================================================

-- ============================================================================
-- TAHAP 1: PENAMBAHAN ENUM ROLE 'tu' (IDEMPOTEN)
-- ============================================================================
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

-- ============================================================================
-- TAHAP 2: KEBIJAKAN RLS HARDENED UNTUK TATA USAHA (TU)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1. TABEL PUBLIC.SANTRI (SELECT, INSERT, UPDATE — TANPA DELETE)
-- ----------------------------------------------------------------------------
-- Bersihkan policy lama (termasuk policy ALL jika pernah terpasang)
DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU tambah santri" ON public.santri;
DROP POLICY IF EXISTS "Santri: TU perbarui santri" ON public.santri;

-- Policy 1: Baca data santri
CREATE POLICY "Santri: TU baca data santri"
ON public.santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- Policy 2: Tambah data santri baru
CREATE POLICY "Santri: TU tambah santri"
ON public.santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- Policy 3: Perbarui data santri (termasuk mutasi & status)
CREATE POLICY "Santri: TU perbarui santri"
ON public.santri FOR UPDATE
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- CATATAN: TIDAK ADA POLICY DELETE UNTUK TU PADA TABEL SANTRI.

-- ----------------------------------------------------------------------------
-- 2.2. TABEL PUBLIC.WALI_SANTRI (SELECT, INSERT, UPDATE — TANPA DELETE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU tambah relasi wali" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: TU perbarui relasi wali" ON public.wali_santri;

-- Policy 1: Baca relasi wali
CREATE POLICY "Wali Santri: TU baca relasi wali"
ON public.wali_santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- Policy 2: Tambah relasi wali santri baru
CREATE POLICY "Wali Santri: TU tambah relasi wali"
ON public.wali_santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- Policy 3: Perbarui relasi wali santri
CREATE POLICY "Wali Santri: TU perbarui relasi wali"
ON public.wali_santri FOR UPDATE
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- CATATAN: TIDAK ADA POLICY DELETE UNTUK TU PADA TABEL WALI_SANTRI.

-- ----------------------------------------------------------------------------
-- 2.3. TABEL PUBLIC.KELAS (SELECT, INSERT, UPDATE — TANPA DELETE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU tambah ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU perbarui ruang kelas" ON public.kelas;

-- Policy 1: Baca ruang kelas
CREATE POLICY "Master Kelas: TU baca ruang kelas"
ON public.kelas FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- Policy 2: Tambah ruang kelas baru
CREATE POLICY "Master Kelas: TU tambah ruang kelas"
ON public.kelas FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- Policy 3: Perbarui data ruang kelas
CREATE POLICY "Master Kelas: TU perbarui ruang kelas"
ON public.kelas FOR UPDATE
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- CATATAN: TIDAK ADA POLICY DELETE UNTUK TU PADA TABEL KELAS.

-- ----------------------------------------------------------------------------
-- 2.4. TABEL PUBLIC.KAMAR (SELECT, INSERT, UPDATE — TANPA DELETE)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU tambah kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU perbarui kamar asrama" ON public.kamar;

-- Policy 1: Baca kamar asrama
CREATE POLICY "Master Kamar: TU baca kamar asrama"
ON public.kamar FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- Policy 2: Tambah kamar asrama baru
CREATE POLICY "Master Kamar: TU tambah kamar asrama"
ON public.kamar FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- Policy 3: Perbarui data kamar asrama
CREATE POLICY "Master Kamar: TU perbarui kamar asrama"
ON public.kamar FOR UPDATE
TO authenticated
USING (public.get_my_role()::text = 'tu')
WITH CHECK (public.get_my_role()::text = 'tu');

-- CATATAN: TIDAK ADA POLICY DELETE UNTUK TU PADA TABEL KAMAR.

-- ----------------------------------------------------------------------------
-- 2.5. TABEL PUBLIC.RIWAYAT_PENEMPATAN_SANTRI (SELECT, INSERT — IMMUTABLE AUDIT)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;

-- Policy 1: Baca histori mutasi penempatan
CREATE POLICY "Riwayat Penempatan: TU baca histori mutasi"
ON public.riwayat_penempatan_santri FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- Policy 2: Catat baris mutasi penempatan santri
CREATE POLICY "Riwayat Penempatan: TU catat mutasi kelas dan kamar"
ON public.riwayat_penempatan_santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text = 'tu');

-- ----------------------------------------------------------------------------
-- 2.6. TABEL PUBLIC.PROFILES (SELECT TERBATAS — WALI & DIRI SENDIRI)
-- TU HANYA boleh membaca profil dirinya sendiri dan profil akun Wali Santri.
-- Profil staf lain (Superadmin, Admin, Bendahara, Pengelola) TIDAK DAPAT dibaca.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;
CREATE POLICY "Profiles: TU baca profil wali santri untuk administrasi"
ON public.profiles FOR SELECT
TO authenticated
USING (
    public.get_my_role()::text = 'tu' 
    AND (id = auth.uid() OR role::text = 'wali')
);

-- ============================================================================
-- AKHIR MIGRATION 013 (FINAL HARDENED)
-- ============================================================================
