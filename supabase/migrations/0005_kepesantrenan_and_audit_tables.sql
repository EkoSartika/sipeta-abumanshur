-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0005: Modul Kepesantrenan (Mengaji, Tahfidz, Prestasi, Kedisiplinan), Notifikasi & Audit Log
-- ============================================================================

-- 1. Modul Perkembangan Mengaji (Bab 7 PRD)
CREATE TABLE IF NOT EXISTS public.perkembangan_mengaji (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    tanggal_penilaian DATE NOT NULL DEFAULT CURRENT_DATE,
    pembimbing_name TEXT NOT NULL,
    metode_pembelajaran TEXT NOT NULL, -- contoh: 'Qiroati', 'Iqro', 'Tilawati', 'Al-Quran Bin-Nadzor', 'Tahsin'
    tingkat_jilid TEXT NOT NULL,       -- contoh: 'Jilid 5', 'Juz 12', 'Gharib'
    materi_terakhir TEXT NOT NULL,     -- contoh: 'Halaman 24 / QS. Yusuf: 1-15'
    kelancaran_bacaan TEXT NOT NULL,   -- contoh: 'Sangat Lancar (A)', 'Lancar (B)', 'Perlu Pengulangan (C)'
    makharijul_huruf TEXT NOT NULL,
    tajwid TEXT NOT NULL,
    catatan_perkembangan TEXT NOT NULL,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mengaji_santri ON public.perkembangan_mengaji(santri_id, tanggal_penilaian DESC);

-- 2. Modul Tahfidz & Target Hafalan (Bab 8 PRD)
CREATE TABLE IF NOT EXISTS public.target_tahfidz (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tahun_ajaran_id UUID NOT NULL REFERENCES public.tahun_ajaran(id) ON DELETE RESTRICT,
    kelas_id UUID NOT NULL REFERENCES public.kelas(id) ON DELETE RESTRICT,
    target_jumlah_juz NUMERIC(4, 1) NOT NULL CHECK (target_jumlah_juz > 0 AND target_jumlah_juz <= 30),
    keterangan_target TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tahun_ajaran_id, kelas_id)
);

CREATE TABLE IF NOT EXISTS public.setoran_tahfidz (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    tanggal_setoran DATE NOT NULL DEFAULT CURRENT_DATE,
    pembimbing_name TEXT NOT NULL,
    nama_surah TEXT NOT NULL,
    juz INTEGER NOT NULL CHECK (juz >= 1 AND juz <= 30),
    ayat_awal INTEGER NOT NULL CHECK (ayat_awal >= 1),
    ayat_akhir INTEGER NOT NULL CHECK (ayat_akhir >= ayat_awal),
    jumlah_ayat INTEGER GENERATED ALWAYS AS (ayat_akhir - ayat_awal + 1) STORED,
    jenis_setoran public.jenis_setoran_tahfidz NOT NULL,
    kualitas_hafalan TEXT NOT NULL, -- contoh: 'Mumtaz (Istimewa)', 'Jayyid Jiddan (Sangat Baik)', 'Jayyid (Baik)', 'Maqbul (Cukup)'
    catatan_pembimbing TEXT,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tahfidz_santri ON public.setoran_tahfidz(santri_id, tanggal_setoran DESC);

-- 3. Modul Prestasi Santri (Bab 9 PRD)
CREATE TABLE IF NOT EXISTS public.prestasi_santri (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    tanggal_prestasi DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_kegiatan TEXT NOT NULL,
    kategori TEXT NOT NULL, -- contoh: 'Tahfidz & Tilawah', 'Akademik & Sains', 'Bahasa Arab/Inggris', 'Olahraga & Seni'
    tingkat_prestasi public.tingkat_prestasi NOT NULL,
    peringkat TEXT NOT NULL, -- contoh: 'Juara 1', 'Juara 2', 'Harapan 1', 'Peserta Terbaik'
    deskripsi TEXT NOT NULL,
    dokumentasi_path TEXT,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prestasi_santri ON public.prestasi_santri(santri_id, tanggal_prestasi DESC);

-- 4. Modul Kedisiplinan & Riwayat Perubahan (Bab 10 PRD)
CREATE TABLE IF NOT EXISTS public.master_kategori_pelanggaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode_kategori TEXT UNIQUE NOT NULL,
    nama_kategori TEXT NOT NULL,
    tingkat_pelanggaran TEXT NOT NULL CHECK (tingkat_pelanggaran IN ('RINGAN', 'SEDANG', 'BERAT')),
    poin_pembinaan INTEGER NOT NULL DEFAULT 5 CHECK (poin_pembinaan >= 0),
    standar_tindak_lanjut TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catatan_kedisiplinan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    santri_id UUID NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
    tanggal_kejadian DATE NOT NULL DEFAULT CURRENT_DATE,
    waktu_kejadian TIME NOT NULL DEFAULT CURRENT_TIME,
    kategori_id UUID NOT NULL REFERENCES public.master_kategori_pelanggaran(id) ON DELETE RESTRICT,
    deskripsi TEXT NOT NULL,
    tindak_lanjut TEXT NOT NULL,
    catatan_pembinaan TEXT NOT NULL,
    status_tindak_lanjut public.status_tindak_lanjut NOT NULL DEFAULT 'DALAM_PEMBINAAN',
    dokumentasi_path TEXT,
    is_published_to_wali BOOLEAN NOT NULL DEFAULT true,
    petugas_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kedisiplinan_santri ON public.catatan_kedisiplinan(santri_id, tanggal_kejadian DESC);

-- Bab 10 PRD: Pengelola dapat memperbarui status tindak lanjut, tetapi riwayat catatan sebelumnya tetap tersedia
CREATE TABLE IF NOT EXISTS public.riwayat_perubahan_kedisiplinan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    catatan_kedisiplinan_id UUID NOT NULL REFERENCES public.catatan_kedisiplinan(id) ON DELETE RESTRICT,
    deskripsi_sebelum TEXT NOT NULL,
    tindak_lanjut_sebelum TEXT NOT NULL,
    catatan_pembinaan_sebelum TEXT NOT NULL,
    status_sebelum public.status_tindak_lanjut NOT NULL,
    status_sesudah public.status_tindak_lanjut NOT NULL,
    alasan_perubahan TEXT,
    diubah_oleh UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Pengumuman Pesantren (Bab 3.2 & 11 PRD)
CREATE TABLE IF NOT EXISTS public.pengumuman (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    judul TEXT NOT NULL,
    kategori TEXT NOT NULL DEFAULT 'Umum', -- 'Umum', 'Akademik', 'Keuangan', 'Kegiatan Pesantren'
    isi TEXT NOT NULL,
    is_penting BOOLEAN NOT NULL DEFAULT false,
    is_published BOOLEAN NOT NULL DEFAULT true,
    tanggal_publikasi TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Notifikasi Internal Terhubung Akun Orang Tua / Petugas (Bab 12 PRD)
CREATE TABLE IF NOT EXISTS public.notifikasi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    santri_id UUID REFERENCES public.santri(id) ON DELETE CASCADE,
    jenis_notifikasi TEXT NOT NULL, -- 'TAGIHAN_BARU', 'PEMBAYARAN_DIAJUKAN', 'PEMBAYARAN_DISETUJUI', 'PEMBAYARAN_DITOLAK', 'SAKU_DIAJUKAN', 'SAKU_DISETUJUI', 'SAKU_DITOLAK', 'SAKU_DISERAHKAN', 'PRESTASI_BARU', 'KEDISIPLINAN_BARU', 'MENGAJI_UPDATE', 'TAHFIDZ_UPDATE', 'PENGUMUMAN'
    judul TEXT NOT NULL,
    pesan TEXT NOT NULL,
    tautan TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifikasi_user_unread ON public.notifikasi(user_id, is_read, created_at DESC);

-- 7. Tabel Audit Log Append-Only (Bab 13 PRD)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_role public.user_role,
    aktivitas TEXT NOT NULL,
    jenis_objek TEXT NOT NULL,
    objek_id TEXT NOT NULL,
    data_sebelum JSONB,
    data_sesudah JSONB,
    alasan_perubahan TEXT,
    sumber_aktivitas JSONB, -- {ip, user_agent, endpoint}
    waktu TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_waktu ON public.audit_logs(waktu DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_objek ON public.audit_logs(jenis_objek, objek_id);

