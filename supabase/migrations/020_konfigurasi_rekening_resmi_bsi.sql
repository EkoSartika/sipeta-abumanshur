-- ============================================================================
-- SIPETA MIGRATION 020: Konfigurasi Rekening Resmi BSI Pesantren
-- Sesuai Temuan UAT & Keputusan Tata Kelola Keuangan Pesantren
-- ============================================================================
-- Catatan:
-- 1. Migration ini mendaftarkan rekening resmi BSI Yayasan Pondok Pesantren Modern
--    Abu Manshur ke dalam public.rekening_pesantren dengan is_active = true.
-- 2. Memastikan hanya ada 1 rekening aktif sesuai indeks unik idx_single_active_rekening_pesantren.
-- 3. Idempoten: Menggunakan NOT EXISTS dan ON CONFLICT DO NOTHING sehingga aman dijalankan.
-- ============================================================================

DO $$
BEGIN
    -- 1. Nonaktifkan sementara rekening lama jika ada yang berstatus aktif sebelum aktivasi
    UPDATE public.rekening_pesantren
    SET is_active = false,
        updated_at = now()
    WHERE is_active = true
      AND nomor_rekening <> '7198823456';

    -- 2. Daftarkan / Perbarui rekening resmi BSI Pesantren
    IF EXISTS (SELECT 1 FROM public.rekening_pesantren WHERE nomor_rekening = '7198823456') THEN
        UPDATE public.rekening_pesantren
        SET nama_bank = 'Bank Syariah Indonesia (BSI)',
            kode_bank = '451',
            atas_nama = 'Yayasan Pondok Pesantren Modern Abu Manshur',
            catatan_instruksi = 'Satu-satunya rekening resmi penerimaan pembayaran kewajiban dan titipan uang saku santri. Pastikan nama penerima sesuai dan unggah bukti transfer yang jelas.',
            is_active = true,
            updated_at = now()
        WHERE nomor_rekening = '7198823456';
    ELSE
        INSERT INTO public.rekening_pesantren (
            id,
            nama_bank,
            kode_bank,
            nomor_rekening,
            atas_nama,
            catatan_instruksi,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            '10000000-0000-0000-0000-000000000001',
            'Bank Syariah Indonesia (BSI)',
            '451',
            '7198823456',
            'Yayasan Pondok Pesantren Modern Abu Manshur',
            'Satu-satunya rekening resmi penerimaan pembayaran kewajiban dan titipan uang saku santri. Pastikan nama penerima sesuai dan unggah bukti transfer yang jelas.',
            true,
            now(),
            now()
        );
    END IF;
END $$;

