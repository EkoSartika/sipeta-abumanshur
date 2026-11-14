-- ============================================================================
-- SIPETA MIGRATION 026: EXTEND PROFIL PESANTREN IDENTITAS YAYASAN & LOGO
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- Menambahkan kolom identitas yayasan, logo yayasan/pesantren, kontak WhatsApp,
-- dan jabatan penandatangan resmi ke tabel singleton public.profil_pesantren.
-- ============================================================================

BEGIN;

ALTER TABLE public.profil_pesantren
    ADD COLUMN IF NOT EXISTS nama_yayasan TEXT DEFAULT 'YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR',
    ADD COLUMN IF NOT EXISTS logo_yayasan_url TEXT DEFAULT '/images/logo-abu-manshur.png',
    ADD COLUMN IF NOT EXISTS logo_pesantren_url TEXT DEFAULT '/images/logo-abu-manshur.png',
    ADD COLUMN IF NOT EXISTS no_wa TEXT DEFAULT '081234567890',
    ADD COLUMN IF NOT EXISTS jabatan_penandatangan TEXT DEFAULT 'Pengasuh Pondok Pesantren';

COMMENT ON COLUMN public.profil_pesantren.nama_yayasan IS 'Nama resmi yayasan penyelenggara pesantren.';
COMMENT ON COLUMN public.profil_pesantren.logo_yayasan_url IS 'URL atau storage path logo resmi yayasan.';
COMMENT ON COLUMN public.profil_pesantren.logo_pesantren_url IS 'URL atau storage path logo resmi pesantren.';
COMMENT ON COLUMN public.profil_pesantren.no_wa IS 'Nomor WhatsApp resmi layanan/hotline pesantren.';
COMMENT ON COLUMN public.profil_pesantren.jabatan_penandatangan IS 'Jabatan resmi penandatangan dokumen (misal: Pengasuh Pondok Pesantren).';

COMMIT;

