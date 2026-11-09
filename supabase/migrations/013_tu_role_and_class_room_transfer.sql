-- ============================================================================
-- SIPETA MIGRATION 013: PENAMBAHAN ROLE TATA USAHA (TU) & KEBIJAKAN HAK AKSES
-- Pondok Pesantren Modern Abu Manshur
-- STATUS: BERKAS MIGRASI LOKAL (Menunggu Persetujuan Eksekusi ke Cloud)
-- ============================================================================

-- 1. Tambahkan nilai 'tu' dan 'asatidz' ke tipe ENUM public.user_role
DO $$
BEGIN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tu';
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'asatidz';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Kebijakan RLS untuk Tata Usaha (TU) pada Tabel Master Data Santri
-- TU memiliki hak penuh mengelola pendaftaran, pembaruan, dan status santri
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
