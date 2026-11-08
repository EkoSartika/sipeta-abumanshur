-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0002: Core Administration Tables (Profiles, Rekening, Kelas, Kamar, Santri, Wali)
-- ============================================================================

-- 1. Tabel Profil Pengguna (Terhubung 1:1 dengan auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nama_lengkap TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    no_telepon TEXT,
    role public.user_role NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tabel Rekening Resmi Pesantren (Keputusan Bisnis: Satu Rekening Resmi Aktif)
CREATE TABLE IF NOT EXISTS public.rekening_pesantren (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_bank TEXT NOT NULL,
    kode_bank TEXT,
    nomor_rekening TEXT NOT NULL,
    atas_nama TEXT NOT NULL,
    catatan_instruksi TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial Unique Index: Memastikan hanya ada SATU rekening resmi yang aktif pada satu waktu
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_rekening_pesantren
ON public.rekening_pesantren ((is_active))
WHERE is_active = true;

CREATE TRIGGER trg_rekening_pesantren_updated_at
BEFORE UPDATE ON public.rekening_pesantren
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Tabel Tahun Ajaran
CREATE TABLE IF NOT EXISTS public.tahun_ajaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama TEXT UNIQUE NOT NULL, -- contoh: '2026/2027'
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tahun_ajaran_tanggal CHECK (tanggal_selesai > tanggal_mulai)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_tahun_ajaran
ON public.tahun_ajaran ((is_active))
WHERE is_active = true;

-- 4. Tabel Kelas
CREATE TABLE IF NOT EXISTS public.kelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_kelas TEXT UNIQUE NOT NULL,
    nama_kelas TEXT NOT NULL,
    tingkat INTEGER NOT NULL,
    wali_kelas TEXT,
    kapasitas INTEGER NOT NULL DEFAULT 30 CHECK (kapasitas > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tabel Kamar (Asrama)
CREATE TABLE IF NOT EXISTS public.kamar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_kamar TEXT UNIQUE NOT NULL,
    nama_kamar TEXT NOT NULL,
    gedung_asrama TEXT NOT NULL,
    jenis_asrama public.jenis_kelamin NOT NULL, -- 'L' Putra, 'P' Putri
    musyrif TEXT,
    kapasitas INTEGER NOT NULL DEFAULT 20 CHECK (kapasitas > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabel Data Santri (Bab 4.1 PRD: NIS identitas unik)
CREATE TABLE IF NOT EXISTS public.santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nis TEXT UNIQUE NOT NULL,
    nama_lengkap TEXT NOT NULL,
    tempat_lahir TEXT NOT NULL,
    tanggal_lahir DATE NOT NULL,
    jenis_kelamin public.jenis_kelamin NOT NULL,
    alamat TEXT NOT NULL,
    tahun_masuk INTEGER NOT NULL CHECK (tahun_masuk >= 2000 AND tahun_masuk <= 2100),
    tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE RESTRICT,
    kelas_id UUID NOT NULL REFERENCES public.kelas(id) ON DELETE RESTRICT,
    kamar_id UUID NOT NULL REFERENCES public.kamar(id) ON DELETE RESTRICT,
    status public.status_santri NOT NULL DEFAULT 'AKTIF',
    foto_profil_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_santri_kelas ON public.santri(kelas_id);
CREATE INDEX IF NOT EXISTS idx_santri_kamar ON public.santri(kamar_id);
CREATE INDEX IF NOT EXISTS idx_santri_status ON public.santri(status);

CREATE TRIGGER trg_santri_updated_at
BEFORE UPDATE ON public.santri
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Tabel Data Orang Tua / Wali Santri (Bab 3.5 & 4.2 PRD: Relasi 1:1 Ketat dengan Santri)
CREATE TABLE IF NOT EXISTS public.wali_santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    santri_id UUID UNIQUE NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    nama_lengkap TEXT NOT NULL,
    hubungan TEXT NOT NULL CHECK (hubungan IN ('Ayah', 'Ibu', 'Wali')),
    no_telepon TEXT NOT NULL,
    email TEXT NOT NULL,
    alamat TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wali_santri_updated_at
BEFORE UPDATE ON public.wali_santri
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. Tabel Riwayat Penempatan Santri (Bab 4.3 PRD: Setiap perpindahan kelas/kamar tercatat)
CREATE TABLE IF NOT EXISTS public.riwayat_penempatan_santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE CASCADE,
    kelas_lama_id UUID REFERENCES public.kelas(id) ON DELETE RESTRICT,
    kelas_baru_id UUID NOT NULL REFERENCES public.kelas(id) ON DELETE RESTRICT,
    kamar_lama_id UUID REFERENCES public.kamar(id) ON DELETE RESTRICT,
    kamar_baru_id UUID NOT NULL REFERENCES public.kamar(id) ON DELETE RESTRICT,
    tanggal_efektif DATE NOT NULL DEFAULT CURRENT_DATE,
    keterangan TEXT NOT NULL,
    petugas_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riwayat_penempatan_santri ON public.riwayat_penempatan_santri(santri_id, created_at DESC);

