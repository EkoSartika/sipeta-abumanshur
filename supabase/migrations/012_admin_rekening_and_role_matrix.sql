-- ============================================================================
-- SIPETA MIGRATION 012: Admin Rekening Management & Role Matrix Authorization
-- Sesuai Bab 2, 3.1, 3.2 PRD & Finalisasi Otorisasi Produksi
-- ============================================================================
-- Ringkasan:
-- 1. Memberikan izin penuh (ALL) pada public.rekening_pesantren kepada Admin Administrasi
--    dan Superadmin (sebelumnya hanya Superadmin).
-- 2. Mempertahankan akses baca (SELECT) pada public.rekening_pesantren bagi Bendahara,
--    Pengelola, dan Wali yang aktif.
-- 3. Memastikan integritas indeks unik 1 rekening aktif (idx_single_active_rekening_pesantren).
-- ============================================================================

-- 1. Perbarui Kebijakan RLS pada public.rekening_pesantren
ALTER TABLE public.rekening_pesantren ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rekening Pesantren: hanya superadmin yang dapat mengelola" ON public.rekening_pesantren;
DROP POLICY IF EXISTS "Rekening Pesantren: superadmin dan admin dapat mengelola" ON public.rekening_pesantren;

CREATE POLICY "Rekening Pesantren: superadmin dan admin dapat mengelola"
ON public.rekening_pesantren FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- Pastikan policy SELECT tetap mencakup akun aktif terdaftar (superadmin, admin, bendahara, pengelola, wali)
DROP POLICY IF EXISTS "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif" ON public.rekening_pesantren;

CREATE POLICY "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif"
ON public.rekening_pesantren FOR SELECT
TO authenticated
USING (
  public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali')
  AND is_active = true
);

-- ============================================================================
-- VERIFIKASI KEBIJAKAN (Run to Verify):
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'rekening_pesantren';
-- ============================================================================
-- PROSEDUR ROLLBACK:
-- DROP POLICY IF EXISTS "Rekening Pesantren: superadmin dan admin dapat mengelola" ON public.rekening_pesantren;
-- CREATE POLICY "Rekening Pesantren: hanya superadmin yang dapat mengelola"
-- ON public.rekening_pesantren FOR ALL
-- TO authenticated
-- USING (public.get_my_role() = 'superadmin')
-- WITH CHECK (public.get_my_role() = 'superadmin');
-- ============================================================================

