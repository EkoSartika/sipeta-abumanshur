-- ============================================================================
-- SIPETA MIGRATION 014 (TU, ASATIDZ, DAN BENDAHARA ENHANCEMENT)
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- Dokumen Migration: Fitur Persetujuan Pembiayaan TU, Pelanggaran,
-- Pengumuman Bertarget, Rekapitulasi, dan Penilaian Mengaji Standar
-- ============================================================================

-- ============================================================================
-- 1. STRUKTUR TABEL: KOLOM BARU PADA JENIS_PEMBAYARAN & PENGUMUMAN
-- ============================================================================

-- 1.1 Kolom Alur Persetujuan Pembiayaan pada public.jenis_pembayaran
ALTER TABLE public.jenis_pembayaran 
ADD COLUMN IF NOT EXISTS status_persetujuan TEXT NOT NULL DEFAULT 'MENUNGGU_PERSETUJUAN',
ADD COLUMN IF NOT EXISTS catatan_persetujuan TEXT,
ADD COLUMN IF NOT EXISTS disetujui_oleh UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS disetujui_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sasaran_target_id TEXT;

-- Perbarui data jenis_pembayaran yang sudah aktif sebelumnya agar berstatus 'DISETUJUI'
UPDATE public.jenis_pembayaran
SET status_persetujuan = 'DISETUJUI',
    disetujui_at = now()
WHERE is_active = true AND status_persetujuan = 'MENUNGGU_PERSETUJUAN';

-- 1.2 Kolom Masa Berlaku dan Sasaran Bertarget pada public.pengumuman
ALTER TABLE public.pengumuman
ADD COLUMN IF NOT EXISTS masa_berlaku DATE,
ADD COLUMN IF NOT EXISTS sasaran TEXT NOT NULL DEFAULT 'SEMUA',
ADD COLUMN IF NOT EXISTS target_id TEXT,
ADD COLUMN IF NOT EXISTS status_publikasi TEXT NOT NULL DEFAULT 'PUBLIKASI';

UPDATE public.pengumuman
SET status_publikasi = CASE WHEN is_published = true THEN 'PUBLIKASI' ELSE 'DRAF' END
WHERE status_publikasi IS NULL;

-- ============================================================================
-- 2. KEBIJAKAN ROW LEVEL SECURITY (RLS) SESUAI MATRIKS HAK AKSES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 TABEL PUBLIC.JENIS_PEMBAYARAN
-- TU dapat membaca, mengajukan draf pembiayaan (menunggu persetujuan), mengedit
-- draf, dan menghapus draf yang belum disetujui.
-- Admin & Superadmin memiliki hak persetujuan / penolakan.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Jenis Pembayaran: TU baca pembiayaan" ON public.jenis_pembayaran;
CREATE POLICY "Jenis Pembayaran: TU baca pembiayaan"
ON public.jenis_pembayaran FOR SELECT
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'admin', 'superadmin', 'bendahara'));

DROP POLICY IF EXISTS "Jenis Pembayaran: TU ajukan pembiayaan" ON public.jenis_pembayaran;
CREATE POLICY "Jenis Pembayaran: TU ajukan pembiayaan"
ON public.jenis_pembayaran FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role()::text = 'tu'
    AND status_persetujuan = 'MENUNGGU_PERSETUJUAN'
    AND is_active = false
);

DROP POLICY IF EXISTS "Jenis Pembayaran: TU edit pembiayaan draf" ON public.jenis_pembayaran;
CREATE POLICY "Jenis Pembayaran: TU edit pembiayaan draf"
ON public.jenis_pembayaran FOR UPDATE
TO authenticated
USING (
    public.get_my_role()::text = 'tu'
    AND status_persetujuan IN ('MENUNGGU_PERSETUJUAN', 'DITOLAK')
)
WITH CHECK (
    public.get_my_role()::text = 'tu'
    AND status_persetujuan IN ('MENUNGGU_PERSETUJUAN', 'DITOLAK')
    AND is_active = false
);

DROP POLICY IF EXISTS "Jenis Pembayaran: TU hapus draf yang belum disetujui" ON public.jenis_pembayaran;
CREATE POLICY "Jenis Pembayaran: TU hapus draf yang belum disetujui"
ON public.jenis_pembayaran FOR DELETE
TO authenticated
USING (
    public.get_my_role()::text = 'tu'
    AND status_persetujuan IN ('MENUNGGU_PERSETUJUAN', 'DITOLAK')
);

-- ----------------------------------------------------------------------------
-- 2.2 TABEL PUBLIC.PERKEMBANGAN_MENGAJI
-- Asatidz (pengelola), Bendahara, dan Admin/Superadmin dapat mencatat & mengevaluasi.
-- TU memiliki hak SELECT untuk keperluan Rekapitulasi Akademik Santri.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Mengaji: Bendahara catat evaluasi mengaji" ON public.perkembangan_mengaji;
CREATE POLICY "Mengaji: Bendahara catat evaluasi mengaji"
ON public.perkembangan_mengaji FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role()::text IN ('bendahara', 'pengelola', 'superadmin'));

DROP POLICY IF EXISTS "Mengaji: Bendahara perbarui evaluasi mengaji" ON public.perkembangan_mengaji;
CREATE POLICY "Mengaji: Bendahara perbarui evaluasi mengaji"
ON public.perkembangan_mengaji FOR UPDATE
TO authenticated
USING (public.get_my_role()::text IN ('bendahara', 'pengelola', 'superadmin'))
WITH CHECK (public.get_my_role()::text IN ('bendahara', 'pengelola', 'superadmin'));

DROP POLICY IF EXISTS "Mengaji: TU dan Bendahara baca rekapitulasi mengaji" ON public.perkembangan_mengaji;
CREATE POLICY "Mengaji: TU dan Bendahara baca rekapitulasi mengaji"
ON public.perkembangan_mengaji FOR SELECT
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'bendahara', 'admin', 'superadmin', 'pengelola'));

-- ----------------------------------------------------------------------------
-- 2.3 TABEL PUBLIC.MASTER_KATEGORI_PELANGGARAN & PUBLIC.CATATAN_KEDISIPLINAN
-- TU mendapatkan hak kelola pelanggaran santri (tambah, edit, hapus aman).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Master Pelanggaran: TU kelola kategori" ON public.master_kategori_pelanggaran;
CREATE POLICY "Master Pelanggaran: TU kelola kategori"
ON public.master_kategori_pelanggaran FOR ALL
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'pengelola', 'admin', 'superadmin'))
WITH CHECK (public.get_my_role()::text IN ('tu', 'pengelola', 'admin', 'superadmin'));

DROP POLICY IF EXISTS "Kedisiplinan: TU kelola pelanggaran santri" ON public.catatan_kedisiplinan;
CREATE POLICY "Kedisiplinan: TU kelola pelanggaran santri"
ON public.catatan_kedisiplinan FOR ALL
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'pengelola', 'admin', 'superadmin'))
WITH CHECK (public.get_my_role()::text IN ('tu', 'pengelola', 'admin', 'superadmin'));

DROP POLICY IF EXISTS "Riwayat Kedisiplinan: TU baca histori pembinaan" ON public.riwayat_perubahan_kedisiplinan;
CREATE POLICY "Riwayat Kedisiplinan: TU baca histori pembinaan"
ON public.riwayat_perubahan_kedisiplinan FOR SELECT
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'pengelola', 'admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 2.4 TABEL PUBLIC.PENGUMUMAN
-- TU dapat membuat, mengedit, dan menghapus pengumuman wali santri.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Pengumuman: TU kelola pengumuman wali" ON public.pengumuman;
CREATE POLICY "Pengumuman: TU kelola pengumuman wali"
ON public.pengumuman FOR ALL
TO authenticated
USING (public.get_my_role()::text IN ('tu', 'admin', 'superadmin'))
WITH CHECK (public.get_my_role()::text IN ('tu', 'admin', 'superadmin'));

-- ----------------------------------------------------------------------------
-- 2.5 TABEL PUBLIC.TAGIHAN (REKAPITULASI PEMBIAYAAN TU — READ ONLY)
-- TU HANYA membaca tagihan untuk rekapitulasi, DILARANG mengelola transaksi.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tagihan: TU baca rekapitulasi tagihan santri" ON public.tagihan;
CREATE POLICY "Tagihan: TU baca rekapitulasi tagihan santri"
ON public.tagihan FOR SELECT
TO authenticated
USING (public.get_my_role()::text = 'tu');

-- ============================================================================
-- AKHIR MIGRATION 014
-- ============================================================================

