-- ============================================================================
-- SIPETA MIGRATION 020: Konfigurasi Rekening Resmi BSI Pesantren & Jejak Audit
-- Sesuai Temuan UAT & Keputusan Tata Kelola Keuangan Pesantren
-- ============================================================================
-- Catatan:
-- 1. Mendaftarkan rekening resmi BSI Yayasan Pondok Pesantren Modern
--    Abu Manshur ke dalam public.rekening_pesantren dengan is_active = true.
-- 2. Memastikan hanya ada 1 rekening aktif sesuai indeks unik idx_single_active_rekening_pesantren.
-- 3. Menggunakan RETURNING id agar ID yang dicatat pada audit_logs selalu presisi.
-- 4. Idempoten: Aman dijalankan berulang kali tanpa duplikasi data.
-- ============================================================================

DO $$
DECLARE
    v_rekening_id UUID := '10000000-0000-0000-0000-000000000001';
BEGIN
    -- 1. Nonaktifkan rekening lain HANYA JIKA ada rekening aktif selain BSI
    IF EXISTS (
        SELECT 1 FROM public.rekening_pesantren 
        WHERE is_active = true AND nomor_rekening <> '7198823456'
    ) THEN
        UPDATE public.rekening_pesantren
        SET is_active = false,
            updated_at = now()
        WHERE is_active = true
          AND nomor_rekening <> '7198823456';
    END IF;

    -- 2. Daftarkan / Perbarui rekening resmi BSI Pesantren dengan RETURNING id presisi
    IF EXISTS (SELECT 1 FROM public.rekening_pesantren WHERE nomor_rekening = '7198823456') THEN
        UPDATE public.rekening_pesantren
        SET nama_bank = 'Bank Syariah Indonesia (BSI)',
            kode_bank = '451',
            atas_nama = 'Yayasan Pondok Pesantren Modern Abu Manshur',
            catatan_instruksi = 'Satu-satunya rekening resmi penerimaan pembayaran kewajiban dan titipan uang saku santri. Pastikan nama penerima sesuai dan unggah bukti transfer yang jelas.',
            is_active = true,
            updated_at = now()
        WHERE nomor_rekening = '7198823456'
        RETURNING id INTO v_rekening_id;
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
            v_rekening_id,
            'Bank Syariah Indonesia (BSI)',
            '451',
            '7198823456',
            'Yayasan Pondok Pesantren Modern Abu Manshur',
            'Satu-satunya rekening resmi penerimaan pembayaran kewajiban dan titipan uang saku santri. Pastikan nama penerima sesuai dan unggah bukti transfer yang jelas.',
            true,
            now(),
            now()
        )
        RETURNING id INTO v_rekening_id;
    END IF;

    -- 3. Catat di public.audit_logs secara idempoten
    IF NOT EXISTS (
        SELECT 1 FROM public.audit_logs
        WHERE jenis_objek = 'rekening_pesantren'
          AND aktivitas = 'MIGRASI_020_KONFIGURASI_REKENING_RESMI_BSI'
    ) THEN
        INSERT INTO public.audit_logs (
            id,
            user_id,
            user_role,
            aktivitas,
            jenis_objek,
            objek_id,
            data_sebelum,
            data_sesudah,
            alasan_perubahan,
            sumber_aktivitas,
            waktu
        ) VALUES (
            gen_random_uuid(),
            NULL,
            'superadmin'::public.user_role,
            'MIGRASI_020_KONFIGURASI_REKENING_RESMI_BSI',
            'rekening_pesantren',
            v_rekening_id::text,
            NULL,
            jsonb_build_object(
                'id', v_rekening_id,
                'nama_bank', 'Bank Syariah Indonesia (BSI)',
                'kode_bank', '451',
                'nomor_rekening', '7198823456',
                'atas_nama', 'Yayasan Pondok Pesantren Modern Abu Manshur',
                'is_active', true
            ),
            'Inisialisasi resmi rekening BSI Pesantren sesuai keputusan tata kelola keuangan',
            jsonb_build_object('migration', '020_konfigurasi_rekening_resmi_bsi.sql'),
            now()
        );
    END IF;
END $$;
