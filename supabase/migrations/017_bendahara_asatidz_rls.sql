-- ============================================================================
-- SIPETA Migration 017: Penyelarasan Hak Akses Asatidz (pengelola), Bendahara, dan Tata Usaha (TU)
-- Keputusan sistem:
--   - Role pengelola = nilai enum internal untuk role Asatidz/Ustadz
--   - Role bendahara = enum tersendiri, memperoleh hak pengelola + hak keuangan
--   - Role tu        = Tata Usaha, enum ditambahkan di migration 013
-- Enum user_role valid: 'superadmin', 'admin', 'bendahara', 'pengelola', 'wali', 'tu'
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Penyelarasan RLS untuk tabel-tabel kepesantrenan (Asatidz/pengelola & Bendahara)
-- ============================================================================

-- 1.1 Perkembangan Mengaji
-- Bersihkan policy kelola lama (008, 014) agar tidak tumpang tindih
DROP POLICY IF EXISTS "Mengaji: kelola oleh pengelola & superadmin" ON public.perkembangan_mengaji;
DROP POLICY IF EXISTS "Mengaji: kelola evaluasi oleh asatidz, bendahara, admin, superadmin" ON public.perkembangan_mengaji;
DROP POLICY IF EXISTS "asatidz_bendahara_all_mengaji" ON public.perkembangan_mengaji;
CREATE POLICY "asatidz_bendahara_all_mengaji" ON public.perkembangan_mengaji
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 1.2 Setoran Tahfidz
-- Bersihkan policy kelola lama (008) yang belum mencakup bendahara
DROP POLICY IF EXISTS "Tahfidz: kelola oleh pengelola & superadmin" ON public.setoran_tahfidz;
DROP POLICY IF EXISTS "asatidz_bendahara_all_tahfidz" ON public.setoran_tahfidz;
CREATE POLICY "asatidz_bendahara_all_tahfidz" ON public.setoran_tahfidz
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 1.3 Prestasi Santri
-- Bersihkan policy kelola lama (008) yang belum mencakup bendahara
DROP POLICY IF EXISTS "Prestasi: kelola oleh pengelola & superadmin" ON public.prestasi_santri;
DROP POLICY IF EXISTS "asatidz_bendahara_all_prestasi" ON public.prestasi_santri;
CREATE POLICY "asatidz_bendahara_all_prestasi" ON public.prestasi_santri
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 1.4 Catatan Kedisiplinan
-- Bersihkan policy kelola lama (008, 014) yang belum mencakup bendahara
DROP POLICY IF EXISTS "Kedisiplinan: kelola oleh pengelola & superadmin" ON public.catatan_kedisiplinan;
DROP POLICY IF EXISTS "Kedisiplinan: TU kelola pelanggaran santri" ON public.catatan_kedisiplinan;
DROP POLICY IF EXISTS "Kedisiplinan: kelola pelanggaran santri" ON public.catatan_kedisiplinan;
DROP POLICY IF EXISTS "asatidz_bendahara_all_kedisiplinan" ON public.catatan_kedisiplinan;
CREATE POLICY "asatidz_bendahara_all_kedisiplinan" ON public.catatan_kedisiplinan
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 1.5 Riwayat Perubahan Kedisiplinan (STRICTLY READ-ONLY / APPEND-ONLY HISTORI PEMBINAAN)
-- * Baris baru HANYA dimasukkan secara otomatis oleh trigger trg_before_kedisiplinan_update
-- * DILARANG KERAS di-UPDATE atau di-DELETE oleh role siapa pun demi integritas audit trail
-- * Bersihkan policy lama (008, 014) untuk menutup celah akses wali ke histori internal pembinaan
DROP POLICY IF EXISTS "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;
DROP POLICY IF EXISTS "Riwayat Kedisiplinan: TU baca histori pembinaan" ON public.riwayat_perubahan_kedisiplinan;
DROP POLICY IF EXISTS "Riwayat Kedisiplinan: baca histori pembinaan" ON public.riwayat_perubahan_kedisiplinan;
DROP POLICY IF EXISTS "asatidz_bendahara_all_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;
DROP POLICY IF EXISTS "asatidz_bendahara_select_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;
CREATE POLICY "asatidz_bendahara_select_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 1.6 Master Kategori Pelanggaran
-- Bersihkan policy lama (008, 014)
DROP POLICY IF EXISTS "Master Kategori Pelanggaran: kelola oleh pengelola, admin & superadmin" ON public.master_kategori_pelanggaran;
DROP POLICY IF EXISTS "Master Pelanggaran: TU kelola kategori" ON public.master_kategori_pelanggaran;
DROP POLICY IF EXISTS "Master Pelanggaran: kelola kategori" ON public.master_kategori_pelanggaran;
DROP POLICY IF EXISTS "asatidz_bendahara_all_master_kategori" ON public.master_kategori_pelanggaran;
CREATE POLICY "asatidz_bendahara_all_master_kategori" ON public.master_kategori_pelanggaran
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- ============================================================================
-- 2. Kebijakan RLS Kelas & Kamar untuk Peran Tata Usaha (TU), Admin, dan Superadmin
-- ============================================================================

-- 2.1 Master Kelas
-- Bersihkan policy parsial lama (008, 013) agar TU mendapatkan hak penuh kelola (CRUD)
DROP POLICY IF EXISTS "Master Kelas: kelola" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU tambah ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: TU perbarui ruang kelas" ON public.kelas;
DROP POLICY IF EXISTS "tu_admin_all_kelas" ON public.kelas;
CREATE POLICY "tu_admin_all_kelas" ON public.kelas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 2.2 Master Kamar
-- Bersihkan policy parsial lama (008, 013) agar TU mendapatkan hak penuh kelola (CRUD)
DROP POLICY IF EXISTS "Master Kamar: kelola" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU tambah kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: TU perbarui kamar asrama" ON public.kamar;
DROP POLICY IF EXISTS "tu_admin_all_kamar" ON public.kamar;
CREATE POLICY "tu_admin_all_kamar" ON public.kamar
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

COMMIT;

