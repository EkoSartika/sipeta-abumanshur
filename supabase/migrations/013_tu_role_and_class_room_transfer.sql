-- ============================================================================
-- SIPETA MIGRATION 013 (REVISI FINAL): ROLE TATA USAHA (TU) & LEAST PRIVILEGE RLS
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- STATUS: DOKUMEN TINJAUAN PRA-EKSEKUSI (BELUM DIEKSEKUSI KE SUPABASE CLOUD)
-- Tanggal Revisi: 9 November 2026
--
-- PRINSIP KEAMANAN:
-- 1. Idempotent: Aman dieksekusi berulang kali tanpa error.
-- 2. Non-Destruktif / Aditif: Tidak menghapus atau menimpa kebijakan RLS lama
--    milik Superadmin, Admin (Pengasuh), Bendahara, Pengelola (Asatidz), atau Wali.
-- 3. Least Privilege: TU hanya diberi akses minimal untuk administrasi santri,
--    wali santri, kelas, kamar, dan riwayat penempatan.
-- 4. Isolasi Finansial & Staf: TU sama sekali tidak memiliki akses tulis ke tabel
--    keuangan, saldo, jurnal, akun staf, maupun kredensial Superadmin.
-- 5. Profil Terbatas: TU hanya dapat membaca profil dirinya sendiri dan akun wali,
--    bukan seluruh akun staf pesantren.
-- 6. Kompatibilitas Asatidz: Enum 'pengelola' dipertahankan untuk Asatidz.
--    Enum 'asatidz' TIDAK ditambahkan ke database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PENAMBAHAN ENUM ROLE 'tu' SECARA IDEMPOTEN
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

-- ============================================================================
-- AKHIR MIGRATION 013 (REVISI FINAL)
-- ============================================================================
