-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0004: Modul Uang Saku Santri (Ledger Immutable & Bukti Foto Wajib)
-- ============================================================================

-- 1. Tabel Saldo Uang Saku (Ringkasan terkunci untuk Concurrency Control, tidak boleh diedit manual)
CREATE TABLE IF NOT EXISTS public.saldo_uang_saku (
    santri_id UUID PRIMARY KEY REFERENCES public.santri(id) ON DELETE RESTRICT,
    saldo_saat_ini NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (saldo_saat_ini >= 0),
    total_masuk NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_masuk >= 0),
    total_keluar NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_keluar >= 0),
    total_penyesuaian NUMERIC(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rumus_saldo_ledger CHECK (
        saldo_saat_ini = (total_masuk - total_keluar + total_penyesuaian)
    )
);

-- 2. Tabel Pengajuan Top-Up Uang Saku dari Orang Tua (Bab 6.2 PRD)
CREATE TABLE IF NOT EXISTS public.pengajuan_uang_saku (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_pengajuan TEXT UNIQUE NOT NULL,
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    wali_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    nominal NUMERIC(15, 2) NOT NULL CHECK (nominal > 0),
    rekening_tujuan_snapshot JSONB NOT NULL,
    tanggal_transfer DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_pengirim TEXT NOT NULL,
    bank_pengirim TEXT,
    bukti_transfer_path TEXT NOT NULL,
    keterangan TEXT,
    status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
    verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    verified_at TIMESTAMPTZ,
    catatan_verifikasi TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pengajuan_uang_saku_santri ON public.pengajuan_uang_saku(santri_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pengajuan_uang_saku_status ON public.pengajuan_uang_saku(status);

CREATE TRIGGER trg_pengajuan_uang_saku_updated_at
BEFORE UPDATE ON public.pengajuan_uang_saku
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabel Mutasi / Ledger Uang Saku (Bab 6.3 & 6.4 PRD: Immutable Single Source of Truth)
CREATE TABLE IF NOT EXISTS public.mutasi_uang_saku (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_transaksi TEXT UNIQUE NOT NULL,
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    jenis_mutasi public.jenis_mutasi_saku NOT NULL,
    nominal NUMERIC(15, 2) NOT NULL CHECK (nominal > 0),
    saldo_sebelum NUMERIC(15, 2) NOT NULL CHECK (saldo_sebelum >= 0),
    saldo_sesudah NUMERIC(15, 2) NOT NULL CHECK (saldo_sesudah >= 0),
    keterangan TEXT NOT NULL,
    -- Jika berasal dari pengajuan top-up orang tua
    pengajuan_id UUID UNIQUE REFERENCES public.pengajuan_uang_saku(id) ON DELETE RESTRICT,
    -- Bab 2 & Bab 6.3 PRD: Foto penyerahan WAJIB tersedia untuk setiap transaksi Uang Keluar
    foto_penyerahan_path TEXT,
    -- Bab 6.4 PRD: Koreksi dilakukan melalui transaksi pembalik/penyesuaian dengan referensi & alasan
    referensi_mutasi_id UUID REFERENCES public.mutasi_uang_saku(id) ON DELETE RESTRICT,
    alasan_koreksi TEXT,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraint 1: Foto penyerahan wajib untuk KELUAR
    CONSTRAINT chk_wajib_foto_penyerahan_uang_keluar CHECK (
        jenis_mutasi != 'KELUAR'
        OR (foto_penyerahan_path IS NOT NULL AND length(trim(foto_penyerahan_path)) > 0)
    ),

    -- Constraint 2: Alasan koreksi dan referensi wajib untuk PENYESUAIAN
    CONSTRAINT chk_wajib_alasan_koreksi CHECK (
        jenis_mutasi NOT IN ('PENYESUAIAN_TAMBAH', 'PENYESUAIAN_KURANG')
        OR (
            referensi_mutasi_id IS NOT NULL
            AND alasan_koreksi IS NOT NULL
            AND length(trim(alasan_koreksi)) >= 5
        )
    ),

    -- Constraint 3: Akurasi matematika saldo_sebelum -> saldo_sesudah
    CONSTRAINT chk_matematika_mutasi_saldo CHECK (
        (jenis_mutasi IN ('MASUK', 'PENYESUAIAN_TAMBAH') AND saldo_sesudah = saldo_sebelum + nominal)
        OR (jenis_mutasi IN ('KELUAR', 'PENYESUAIAN_KURANG') AND saldo_sesudah = saldo_sebelum - nominal)
    )
);

CREATE INDEX IF NOT EXISTS idx_mutasi_uang_saku_santri ON public.mutasi_uang_saku(santri_id, created_at DESC);

