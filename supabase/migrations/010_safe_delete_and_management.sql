-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 010: Safe Deletion, Soft-Delete Auditing & Relational Integrity
-- ============================================================================
-- PENTING:
-- 1. Jangan jalankan migrasi ini pada Supabase Cloud secara otomatis tanpa persetujuan.
-- 2. Bersifat non-breaking, idempotent, dan backward-compatible.
-- 3. Menjaga seluruh relasi keuangan (pembayaran, tagihan, ledger uang saku)
--    dan catatan akademik/tahfidz santri agar tidak terjadi data loss atau orphan record.
-- 4. Rollback script terdokumentasi di bagian akhir file ini.
-- ============================================================================

-- 1. Tambahkan kolom deleted_at dan deleted_by pada tabel santri
ALTER TABLE public.santri
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_santri_deleted_at
ON public.santri (deleted_at)
WHERE deleted_at IS NOT NULL;

-- 2. Tambahkan kolom deleted_at dan deleted_by pada tabel kelas
ALTER TABLE public.kelas
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Tambahkan kolom deleted_at dan deleted_by pada tabel kamar
ALTER TABLE public.kamar
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Function & Trigger: Mencegah penghapusan fisik Kelas jika masih ada santri aktif
CREATE OR REPLACE FUNCTION public.fn_prevent_delete_kelas_with_active_santri()
RETURNS TRIGGER AS $$
DECLARE
    active_santri_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO active_santri_count
    FROM public.santri
    WHERE kelas_id = OLD.id
      AND status = 'AKTIF'
      AND deleted_at IS NULL;

    IF active_santri_count > 0 THEN
        RAISE EXCEPTION 'Kelas "%" tidak dapat dihapus karena masih memiliki % santri aktif. Pindahkan santri terlebih dahulu.', OLD.nama_kelas, active_santri_count;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_kelas ON public.kelas;
CREATE TRIGGER trg_prevent_delete_kelas
BEFORE DELETE ON public.kelas
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_delete_kelas_with_active_santri();

-- 5. Function & Trigger: Mencegah penghapusan fisik Kamar jika masih ada santri aktif
CREATE OR REPLACE FUNCTION public.fn_prevent_delete_kamar_with_active_santri()
RETURNS TRIGGER AS $$
DECLARE
    active_santri_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO active_santri_count
    FROM public.santri
    WHERE kamar_id = OLD.id
      AND status = 'AKTIF'
      AND deleted_at IS NULL;

    IF active_santri_count > 0 THEN
        RAISE EXCEPTION 'Kamar "%" tidak dapat dihapus karena masih dihuni oleh % santri aktif. Pindahkan santri terlebih dahulu.', OLD.nama_kamar, active_santri_count;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_kamar ON public.kamar;
CREATE TRIGGER trg_prevent_delete_kamar
BEFORE DELETE ON public.kamar
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_delete_kamar_with_active_santri();

-- 6. Function & Trigger: Mencegah hard-delete santri jika memiliki riwayat transaksi/akademik
CREATE OR REPLACE FUNCTION public.fn_prevent_hard_delete_santri_with_history()
RETURNS TRIGGER AS $$
DECLARE
    has_history BOOLEAN := FALSE;
BEGIN
    -- Cek riwayat tagihan
    IF EXISTS (SELECT 1 FROM public.tagihan_santri WHERE santri_id = OLD.id) THEN
        has_history := TRUE;
    END IF;

    -- Cek riwayat pembayaran
    IF NOT has_history AND EXISTS (SELECT 1 FROM public.pembayaran WHERE santri_id = OLD.id) THEN
        has_history := TRUE;
    END IF;

    -- Cek riwayat uang saku
    IF NOT has_history AND EXISTS (SELECT 1 FROM public.transaksi_uang_saku WHERE santri_id = OLD.id) THEN
        has_history := TRUE;
    END IF;

    -- Cek riwayat hafalan quran
    IF NOT has_history AND EXISTS (SELECT 1 FROM public.riwayat_hafalan_quran WHERE santri_id = OLD.id) THEN
        has_history := TRUE;
    END IF;

    IF has_history THEN
        RAISE EXCEPTION 'Santri "%" (NIS: %) memiliki riwayat transaksi keuangan atau akademik. Lakukan Soft Delete / Penonaktifan (status = TIDAK_AKTIF) demi menjaga integritas database dan audit log.', OLD.nama_lengkap, OLD.nis;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_santri ON public.santri;
CREATE TRIGGER trg_prevent_hard_delete_santri
BEFORE DELETE ON public.santri
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_hard_delete_santri_with_history();

-- ============================================================================
-- DOKUMENTASI ROLLBACK MIGRASI 010:
-- ============================================================================
-- Untuk membatalkan migrasi ini secara aman:
--
-- DROP TRIGGER IF EXISTS trg_prevent_hard_delete_santri ON public.santri;
-- DROP FUNCTION IF EXISTS public.fn_prevent_hard_delete_santri_with_history();
--
-- DROP TRIGGER IF EXISTS trg_prevent_delete_kamar ON public.kamar;
-- DROP FUNCTION IF EXISTS public.fn_prevent_delete_kamar_with_active_santri();
--
-- DROP TRIGGER IF EXISTS trg_prevent_delete_kelas ON public.kelas;
-- DROP FUNCTION IF EXISTS public.fn_prevent_delete_kelas_with_active_santri();
--
-- DROP INDEX IF EXISTS public.idx_santri_deleted_at;
-- ALTER TABLE public.kamar DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.kelas DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- ALTER TABLE public.santri DROP COLUMN IF EXISTS deleted_by, DROP COLUMN IF EXISTS deleted_at;
-- ============================================================================

