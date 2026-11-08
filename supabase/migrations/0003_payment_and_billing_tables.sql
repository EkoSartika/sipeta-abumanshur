-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0003: Modul Pembayaran, Tagihan, Keranjang, & Verifikasi Bendahara
-- ============================================================================

-- 1. Tabel Jenis Pembayaran (Bab 5.1 & 5.2 PRD)
CREATE TABLE IF NOT EXISTS public.jenis_pembayaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_pembayaran TEXT UNIQUE NOT NULL,
    nama_pembayaran TEXT NOT NULL,
    deskripsi TEXT,
    nominal NUMERIC(15, 2) NOT NULL CHECK (nominal > 0),
    kategori TEXT NOT NULL, -- misal: 'SPP Bulanan', 'Uang Makan', 'Pendaftaran', 'Seragam', 'Kegiatan', 'Ujian', 'Khusus'
    tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE RESTRICT,
    periode_pembayaran TEXT NOT NULL, -- misal: 'Bulanan', 'Semester', 'Tahunan', 'Sekali Bayar'
    tanggal_mulai DATE NOT NULL,
    tanggal_jatuh_tempo DATE NOT NULL,
    sasaran_santri TEXT NOT NULL DEFAULT 'SEMUA', -- 'SEMUA', 'KELAS_TERTENTU', 'KAMAR_TERTENTU', 'INDIVIDU'
    kebijakan_cicilan public.kebijakan_cicilan NOT NULL DEFAULT 'TIDAK_BOLEH',
    minimal_nominal_cicilan NUMERIC(15, 2),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_jenis_pembayaran_tanggal CHECK (tanggal_jatuh_tempo >= tanggal_mulai),
    CONSTRAINT chk_kebijakan_minimal_cicilan CHECK (
        (kebijakan_cicilan = 'MINIMAL_NOMINAL' AND minimal_nominal_cicilan IS NOT NULL AND minimal_nominal_cicilan > 0 AND minimal_nominal_cicilan <= nominal)
        OR (kebijakan_cicilan IN ('TIDAK_BOLEH', 'BEBAS') AND (minimal_nominal_cicilan IS NULL OR minimal_nominal_cicilan = 0))
    )
);

CREATE TRIGGER trg_jenis_pembayaran_updated_at
BEFORE UPDATE ON public.jenis_pembayaran
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabel Tagihan Santri (Bab 5.2 & 5.3 PRD: Menyalin kebijakan cicilan saat dibuat)
CREATE TABLE IF NOT EXISTS public.tagihan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_tagihan TEXT UNIQUE NOT NULL,
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    jenis_pembayaran_id UUID NOT NULL REFERENCES public.jenis_pembayaran(id) ON DELETE RESTRICT,
    judul_tagihan TEXT NOT NULL,
    periode_label TEXT NOT NULL, -- contoh: 'November 2026'
    nominal_awal NUMERIC(15, 2) NOT NULL CHECK (nominal_awal > 0),
    nominal_penyesuaian NUMERIC(15, 2) NOT NULL DEFAULT 0,
    nominal_tagihan NUMERIC(15, 2) GENERATED ALWAYS AS (nominal_awal + nominal_penyesuaian) STORED,
    total_terbayar NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_terbayar >= 0),
    sisa_tagihan NUMERIC(15, 2) GENERATED ALWAYS AS (nominal_awal + nominal_penyesuaian - total_terbayar) STORED,
    -- Snapshot aturan cicilan saat tagihan dibuat (Bab 5.2 PRD)
    kebijakan_cicilan_snapshot public.kebijakan_cicilan NOT NULL,
    minimal_cicilan_snapshot NUMERIC(15, 2),
    tanggal_mulai DATE NOT NULL DEFAULT CURRENT_DATE,
    tanggal_jatuh_tempo DATE NOT NULL,
    status public.status_tagihan NOT NULL DEFAULT 'BELUM_BAYAR',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tagihan_saldo_valid CHECK (
        (nominal_awal + nominal_penyesuaian) >= total_terbayar
        AND (nominal_awal + nominal_penyesuaian) > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_tagihan_santri_status ON public.tagihan(santri_id, status);
CREATE INDEX IF NOT EXISTS idx_tagihan_jenis ON public.tagihan(jenis_pembayaran_id);

CREATE TRIGGER trg_tagihan_updated_at
BEFORE UPDATE ON public.tagihan
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabel Riwayat Penyesuaian Tagihan (Bab 5.3 PRD: Perubahan nominal/pembatalan harus tercatat)
CREATE TABLE IF NOT EXISTS public.riwayat_penyesuaian_tagihan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tagihan_id UUID NOT NULL REFERENCES public.tagihan(id) ON DELETE RESTRICT,
    nominal_sebelum NUMERIC(15, 2) NOT NULL,
    nominal_sesudah NUMERIC(15, 2) NOT NULL,
    status_sebelum public.status_tagihan NOT NULL,
    status_sesudah public.status_tagihan NOT NULL,
    alasan_penyesuaian TEXT NOT NULL,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabel Keranjang Pembayaran (Bab 5.4 PRD)
CREATE TABLE IF NOT EXISTS public.keranjang_pembayaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wali_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE CASCADE,
    tagihan_id UUID NOT NULL REFERENCES public.tagihan(id) ON DELETE CASCADE,
    nominal_bayar NUMERIC(15, 2) NOT NULL CHECK (nominal_bayar > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (wali_user_id, tagihan_id)
);

-- 5. Tabel Transaksi Pembayaran (Bab 5.5 & 5.6 PRD)
CREATE TABLE IF NOT EXISTS public.transaksi_pembayaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nomor_transaksi TEXT UNIQUE NOT NULL,
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    wali_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    total_nominal NUMERIC(15, 2) NOT NULL CHECK (total_nominal > 0),
    rekening_tujuan_snapshot JSONB NOT NULL, -- {nama_bank, nomor_rekening, atas_nama}
    tanggal_transfer DATE,
    nama_pengirim TEXT,
    bank_pengirim TEXT,
    bukti_transfer_path TEXT,
    status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_TRANSFER',
    verified_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    verified_at TIMESTAMPTZ,
    catatan_verifikasi TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaksi_pembayaran_santri ON public.transaksi_pembayaran(santri_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaksi_pembayaran_status ON public.transaksi_pembayaran(status);

CREATE TRIGGER trg_transaksi_pembayaran_updated_at
BEFORE UPDATE ON public.transaksi_pembayaran
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Tabel Alokasi Pembayaran (Bab 5.5 PRD: Satu transaksi dapat dialokasikan ke beberapa tagihan)
CREATE TABLE IF NOT EXISTS public.alokasi_pembayaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaksi_id UUID NOT NULL REFERENCES public.transaksi_pembayaran(id) ON DELETE CASCADE,
    tagihan_id UUID NOT NULL REFERENCES public.tagihan(id) ON DELETE RESTRICT,
    nominal_alokasi NUMERIC(15, 2) NOT NULL CHECK (nominal_alokasi > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaksi_id, tagihan_id)
);

CREATE INDEX IF NOT EXISTS idx_alokasi_pembayaran_tagihan ON public.alokasi_pembayaran(tagihan_id);

