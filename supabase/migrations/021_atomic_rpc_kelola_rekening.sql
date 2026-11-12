-- ============================================================================
-- SIPETA MIGRATION 021: Atomic RPC Pengelolaan & Pergantian Rekening Resmi
-- Sesuai Standar Tata Kelola Transaksi Keuangan & Audit Trail Abadi
-- ============================================================================
-- Karakteristik Kunci:
-- 1. Serialisasi Transaksi: Menggunakan PostgreSQL Advisory Transaction Lock
--    untuk mencegah race conditions pada eksekusi konkuren.
-- 2. Atomisitas Penuh: Transaksi tunggal untuk penonaktifan rekening lama,
--    pengaktifan rekening baru, dan pencatatan audit log (Commit atau Rollback penuh).
-- 3. Snapshot Data: Mencatat data_sebelum dan data_sesudah secara akurat.
-- 4. Otorisasi Ketat: Memvalidasi role pengguna hanya Superadmin dan Admin (Pengasuh).
-- 5. Perlindungan Riwayat: Mencegah penghapusan rekening yang pernah digunakan transaksi.
-- ============================================================================

-- 1. RPC Pergantian & Pengaktifan Rekening Resmi Atomik
CREATE OR REPLACE FUNCTION public.rpc_ganti_rekening_resmi_v1(
    p_target_rekening_id UUID DEFAULT NULL,
    p_nama_bank TEXT DEFAULT NULL,
    p_kode_bank TEXT DEFAULT NULL,
    p_nomor_rekening TEXT DEFAULT NULL,
    p_atas_nama TEXT DEFAULT NULL,
    p_catatan_instruksi TEXT DEFAULT NULL,
    p_alasan TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.user_role;
    v_old_rekening RECORD;
    v_target_id UUID;
    v_data_sebelum JSONB := NULL;
    v_data_sesudah JSONB := NULL;
    v_clean_nama_bank TEXT;
    v_clean_nomor_rekening TEXT;
    v_clean_atas_nama TEXT;
    v_clean_kode_bank TEXT;
    v_clean_catatan TEXT;
    v_clean_alasan TEXT;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Identitas & Otorisasi Pengguna
    v_user_id := COALESCE(auth.uid(), p_actor_user_id);
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Pengguna tidak terautentikasi.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang mengelola rekening resmi pesantren. Role Anda: %', COALESCE(v_user_role::TEXT, 'tidak terdaftar');
    END IF;

    -- 2. Kunci Mutasi Transaksi Rekening (Advisory Transaction Lock)
    -- Mencegah dua proses konkuren saling berbenturan pada partial unique index
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    -- 3. Ambil dan Kunci Snapshot Rekening Aktif Saat Ini (FOR UPDATE)
    SELECT * INTO v_old_rekening
    FROM public.rekening_pesantren
    WHERE is_active = true
    FOR UPDATE;

    IF v_old_rekening.id IS NOT NULL THEN
        v_data_sebelum := jsonb_build_object(
            'id', v_old_rekening.id,
            'nama_bank', v_old_rekening.nama_bank,
            'kode_bank', v_old_rekening.kode_bank,
            'nomor_rekening', v_old_rekening.nomor_rekening,
            'atas_nama', v_old_rekening.atas_nama,
            'catatan_instruksi', v_old_rekening.catatan_instruksi,
            'is_active', v_old_rekening.is_active
        );
    END IF;

    -- 4. Tentukan & Validasi Target Rekening
    IF p_target_rekening_id IS NOT NULL THEN
        -- Kasus A: Mengaktifkan rekening yang sudah ada di database
        SELECT id INTO v_target_id
        FROM public.rekening_pesantren
        WHERE id = p_target_rekening_id
        FOR UPDATE;

        IF v_target_id IS NULL THEN
            RAISE EXCEPTION 'Rekening target dengan ID % tidak ditemukan.', p_target_rekening_id;
        END IF;

        -- Opsional: Perbarui informasi rekening jika ada data baru yang disertakan
        IF p_nama_bank IS NOT NULL AND length(trim(p_nama_bank)) > 0 THEN
            UPDATE public.rekening_pesantren
            SET nama_bank = trim(p_nama_bank),
                kode_bank = COALESCE(trim(p_kode_bank), kode_bank),
                nomor_rekening = COALESCE(trim(p_nomor_rekening), nomor_rekening),
                atas_nama = COALESCE(trim(p_atas_nama), atas_nama),
                catatan_instruksi = COALESCE(trim(p_catatan_instruksi), catatan_instruksi),
                updated_by = v_user_id,
                updated_at = now()
            WHERE id = v_target_id;
        END IF;
    ELSE
        -- Kasus B: Mendaftarkan rekening baru dan langsung menjadikannya aktif
        v_clean_nama_bank := trim(COALESCE(p_nama_bank, ''));
        v_clean_nomor_rekening := trim(COALESCE(p_nomor_rekening, ''));
        v_clean_atas_nama := trim(COALESCE(p_atas_nama, ''));
        v_clean_kode_bank := NULLIF(trim(COALESCE(p_kode_bank, '')), '');
        v_clean_catatan := NULLIF(trim(COALESCE(p_catatan_instruksi, '')), '');

        -- Validasi Input Rekening Baru
        IF length(v_clean_nama_bank) < 2 THEN
            RAISE EXCEPTION 'Nama bank wajib diisi (minimal 2 karakter).';
        END IF;

        IF length(v_clean_nomor_rekening) < 5 THEN
            RAISE EXCEPTION 'Nomor rekening tidak valid (minimal 5 digit).';
        END IF;

        IF length(v_clean_atas_nama) < 3 THEN
            RAISE EXCEPTION 'Nama pemilik rekening wajib diisi (minimal 3 karakter).';
        END IF;

        -- Periksa apakah nomor rekening sudah terdaftar sebelumnya
        SELECT id INTO v_target_id
        FROM public.rekening_pesantren
        WHERE nomor_rekening = v_clean_nomor_rekening
        FOR UPDATE;

        IF v_target_id IS NOT NULL THEN
            -- Perbarui rekening yang sudah ada
            UPDATE public.rekening_pesantren
            SET nama_bank = v_clean_nama_bank,
                kode_bank = v_clean_kode_bank,
                atas_nama = v_clean_atas_nama,
                catatan_instruksi = v_clean_catatan,
                updated_by = v_user_id,
                updated_at = now()
            WHERE id = v_target_id;
        ELSE
            -- Buat rekening baru
            INSERT INTO public.rekening_pesantren (
                id,
                nama_bank,
                kode_bank,
                nomor_rekening,
                atas_nama,
                catatan_instruksi,
                is_active,
                updated_by,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_clean_nama_bank,
                v_clean_kode_bank,
                v_clean_nomor_rekening,
                v_clean_atas_nama,
                v_clean_catatan,
                false, -- sementara false agar tidak bentrok dengan rekening lama
                v_user_id,
                now(),
                now()
            ) RETURNING id INTO v_target_id;
        END IF;
    END IF;

    -- 5. Nonaktifkan Rekening Aktif Sebelumnya (Jika berbeda dari target)
    IF v_old_rekening.id IS NOT NULL AND v_old_rekening.id <> v_target_id THEN
        UPDATE public.rekening_pesantren
        SET is_active = false,
            updated_by = v_user_id,
            updated_at = now()
        WHERE id = v_old_rekening.id;
    END IF;

    -- 6. Aktifkan Rekening Target
    UPDATE public.rekening_pesantren
    SET is_active = true,
        updated_by = v_user_id,
        updated_at = now()
    WHERE id = v_target_id;

    -- 7. Bentuk Snapshot Data Sesudah Perubahan
    SELECT jsonb_build_object(
        'id', id,
        'nama_bank', nama_bank,
        'kode_bank', kode_bank,
        'nomor_rekening', nomor_rekening,
        'atas_nama', atas_nama,
        'catatan_instruksi', catatan_instruksi,
        'is_active', is_active
    ) INTO v_data_sesudah
    FROM public.rekening_pesantren
    WHERE id = v_target_id;

    -- 8. Catat ke Tabel Audit Logs Secara Transaksional
    v_clean_alasan := COALESCE(NULLIF(trim(p_alasan), ''), 'Pergantian rekening resmi pesantren oleh pimpinan');
    v_audit_id := gen_random_uuid();

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
        v_audit_id,
        v_user_id,
        v_user_role,
        'GANTI_REKENING_RESMI',
        'rekening_pesantren',
        v_target_id::TEXT,
        v_data_sebelum,
        v_data_sesudah,
        v_clean_alasan,
        jsonb_build_object(
            'metode', 'RPC_ATOMIK',
            'function', 'rpc_ganti_rekening_resmi_v1'
        ),
        now()
    );

    -- 9. Kembalikan Hasil Sukses
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rekening resmi pesantren berhasil diaktifkan secara atomik.',
        'target_rekening_id', v_target_id,
        'rekening_aktif', v_data_sesudah,
        'audit_log_id', v_audit_id
    );
END;
$$;

-- 2. RPC Perlindungan Riwayat: Hapus Rekening Aman (Hanya jika tidak ada riwayat transaksi)
CREATE OR REPLACE FUNCTION public.rpc_hapus_rekening_pesantren_v1(
    p_rekening_id UUID,
    p_alasan TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.user_role;
    v_target RECORD;
    v_has_tx BOOLEAN := false;
    v_data_sebelum JSONB;
BEGIN
    -- 1. Validasi Identitas & Otorisasi
    v_user_id := COALESCE(auth.uid(), p_actor_user_id);
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Pengguna tidak terautentikasi.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang.';
    END IF;

    -- 2. Ambil Data Rekening Target
    SELECT * INTO v_target
    FROM public.rekening_pesantren
    WHERE id = p_rekening_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Rekening dengan ID % tidak ditemukan.', p_rekening_id;
    END IF;

    -- 3. Proteksi Rekening Aktif: Tidak boleh menghapus rekening yang sedang aktif
    IF v_target.is_active = true THEN
        RAISE EXCEPTION 'Rekening sedang berstatus aktif sebagai rekening utama. Silakan ganti rekening aktif terlebih dahulu sebelum menghapus.';
    END IF;

    -- 4. Proteksi Riwayat Transaksi Historis:
    -- Cek apakah rekening pernah digunakan pada transaksi pembayaran santri
    SELECT EXISTS (
        SELECT 1 FROM public.transaksi_pembayaran
        WHERE (rekening_tujuan_snapshot ->> 'nomor_rekening' = v_target.nomor_rekening)
           OR (rekening_tujuan_snapshot ->> 'id' = v_target.id::TEXT)
    ) INTO v_has_tx;

    IF v_has_tx THEN
        RAISE EXCEPTION 'Rekening "%" (No: %) tidak dapat dihapus karena tersimpan dalam riwayat transaksi keuangan santri. Rekening telah berstatus nonaktif untuk menjaga integritas data historis.',
            v_target.nama_bank, v_target.nomor_rekening;
    END IF;

    -- 5. Catat Audit Log Sebelum Hapus
    v_data_sebelum := jsonb_build_object(
        'id', v_target.id,
        'nama_bank', v_target.nama_bank,
        'kode_bank', v_target.kode_bank,
        'nomor_rekening', v_target.nomor_rekening,
        'atas_nama', v_target.atas_nama,
        'is_active', v_target.is_active
    );

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
        v_user_id,
        v_user_role,
        'HAPUS_REKENING_CADANGAN',
        'rekening_pesantren',
        v_target.id::TEXT,
        v_data_sebelum,
        NULL,
        COALESCE(NULLIF(trim(p_alasan), ''), 'Penghapusan rekening cadangan tanpa riwayat transaksi oleh pimpinan'),
        jsonb_build_object('function', 'rpc_hapus_rekening_pesantren_v1'),
        now()
    );

    -- 6. Hapus Rekening
    DELETE FROM public.rekening_pesantren
    WHERE id = p_rekening_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rekening cadangan berhasil dihapus secara aman.'
    );
END;
$$;

-- 3. Hak Akses Eksekusi RPC (Portabel untuk Supabase Cloud maupun PostgreSQL Mandiri)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.rpc_ganti_rekening_resmi_v1 TO authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_hapus_rekening_pesantren_v1 TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.rpc_ganti_rekening_resmi_v1 TO service_role;
        GRANT EXECUTE ON FUNCTION public.rpc_hapus_rekening_pesantren_v1 TO service_role;
    END IF;
END $$;
