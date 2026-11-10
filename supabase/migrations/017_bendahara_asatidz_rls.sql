-- ============================================================================
-- SIPETA Migration 017: Penyelarasan Hak Akses Asatidz, Bendahara, dan Tata Usaha (TU)
-- Mendukung keputusan sistem: Bendahara adalah Asatidz dengan tugas tambahan keuangan,
-- serta memastikan Tata Usaha (TU) dapat mengelola Kelas dan Kamar tanpa error RLS.
-- ============================================================================

-- 1. Penyelarasan RLS untuk tabel-tabel kepesantrenan (Asatidz & Bendahara)
-- Perkembangan Mengaji
DROP POLICY IF EXISTS "asatidz_bendahara_all_mengaji" ON public.perkembangan_mengaji;
CREATE POLICY "asatidz_bendahara_all_mengaji" ON public.perkembangan_mengaji
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- Setoran Tahfidz
DROP POLICY IF EXISTS "asatidz_bendahara_all_tahfidz" ON public.setoran_tahfidz;
CREATE POLICY "asatidz_bendahara_all_tahfidz" ON public.setoran_tahfidz
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- Prestasi Santri
DROP POLICY IF EXISTS "asatidz_bendahara_all_prestasi" ON public.prestasi_santri;
CREATE POLICY "asatidz_bendahara_all_prestasi" ON public.prestasi_santri
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- Catatan Kedisiplinan
DROP POLICY IF EXISTS "asatidz_bendahara_all_kedisiplinan" ON public.catatan_kedisiplinan;
CREATE POLICY "asatidz_bendahara_all_kedisiplinan" ON public.catatan_kedisiplinan
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- Riwayat Perubahan Kedisiplinan (STRICTLY READ-ONLY / APPEND-ONLY HISTORI PEMBINAAN)
-- * Baris baru HANYA dimasukkan secara otomatis oleh trigger trg_before_kedisiplinan_update
-- * DILARANG KERAS di-UPDATE atau di-DELETE oleh role siapa pun demi integritas audit trail
DROP POLICY IF EXISTS "asatidz_bendahara_all_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;
DROP POLICY IF EXISTS "asatidz_bendahara_select_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;
CREATE POLICY "asatidz_bendahara_select_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- Master Kategori Pelanggaran
DROP POLICY IF EXISTS "asatidz_bendahara_all_master_kategori" ON public.master_kategori_pelanggaran;
CREATE POLICY "asatidz_bendahara_all_master_kategori" ON public.master_kategori_pelanggaran
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('pengelola', 'asatidz', 'bendahara', 'tu', 'admin', 'superadmin')
        AND profiles.is_active = true
    )
  );

-- 2. Kebijakan RLS Kelas & Kamar untuk Peran Tata Usaha (TU), Admin, dan Superadmin
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

