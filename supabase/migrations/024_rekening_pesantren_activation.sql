-- ============================================================================
-- SIPETA MIGRATION 024: Aktivasi dan Penggantian Rekening Utama Atomik
-- Modul: Pengaturan Informasi & Aktivasi Rekening Resmi Pesantren
-- Standar Tata Kelola Transaksi Keuangan & Audit Trail Abadi:
-- 1. Serialisasi Konkurensi: Menggunakan PostgreSQL Advisory Transaction Lock
--    untuk mencegah race conditions pada eksekusi serentak.
-- 2. Atomisitas Penuh: Transaksi tunggal untuk penonaktifan rekening lama,
--    pengaktifan rekening baru, dan pencatatan audit log (Commit atau Rollback penuh).
-- 3. Integritas Indeks Unik: Menjaga partial unique index idx_single_active_rekening_pesantren
--    sehingga secara fisik database hanya memperbolehkan maksimal satu rekening aktif.
-- 4. Otorisasi Ketat: Hanya Superadmin dan Admin/Pengasuh. Role lain ditolak keras.
-- 5. Audit Log Eksplisit: Rekaman perubahan mencatat detail rekening lama dan rekening baru
--    secara terstruktur dan konsisten pada data_sebelum dan data_sesudah.
-- 6. Integritas Historis: Tidak mengubah atau menghapus snapshot transaksi pembayaran historis.
-- ============================================================================

-- 1. Pastikan Partial Unique Index 1 Rekening Aktif Tetap Ada
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_rekening_pesantren
ON public.rekening_pesantren ((is_active))
WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. RPC ATOMIK: Aktivasi / Pergantian Rekening Utama Pesantren
-- Mengaktifkan rekening target dan secara atomik menonaktifkan rekening aktif sebelumnya
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(
    p_rekening_id UUID,
    p_alasan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.user_role;
    v_target public.rekening_pesantren;
    v_old_active public.rekening_pesantren;
    v_data_sebelum JSONB := NULL;
    v_data_sesudah JSONB := NULL;
    v_aktivitas TEXT;
    v_clean_alasan TEXT;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Autentikasi Pengguna (auth.uid() wajib)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Sesi otentikasi tidak ditemukan. auth.uid() bernilai NULL.';
    END IF;

    -- 2. Validasi Otorisasi Role Pengguna (Hanya Superadmin dan Admin/Pengasuh)
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id AND is_active = true;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang mengaktifkan rekening resmi pesantren. Role Anda: %',
            COALESCE(v_user_role::TEXT, 'tidak terdaftar / nonaktif');
    END IF;

    IF p_rekening_id IS NULL THEN
        RAISE EXCEPTION 'ID rekening target wajib disertakan.';
    END IF;

    -- 3. Kunci Mutasi Transaksi Rekening (PostgreSQL Advisory Lock)
    -- Mencegah benturan konkurensi antar dua admin pada saat yang bersamaan
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    -- 4. Kunci dan Validasi Rekening Target (FOR UPDATE)
    SELECT * INTO v_target
    FROM public.rekening_pesantren
    WHERE id = p_rekening_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Rekening target dengan ID % tidak ditemukan.', p_rekening_id;
    END IF;

    -- Jika rekening target sudah merupakan rekening aktif tunggal, operasi bersifat idempotent
    IF v_target.is_active = true THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Rekening ini sudah berstatus sebagai rekening utama aktif.',
            'data', to_jsonb(v_target)
        );
    END IF;

    -- 5. Kunci Rekening yang Sedang Aktif Saat Ini (jika ada)
    SELECT * INTO v_old_active
    FROM public.rekening_pesantren
    WHERE is_active = true
    FOR UPDATE;

    IF v_old_active.id IS NOT NULL THEN
        -- Skenario A: Pergantian Rekening Utama (Rekening lama dinonaktifkan, rekening target diaktifkan)
        v_aktivitas := 'GANTI_REKENING_UTAMA';
        v_data_sebelum := jsonb_build_object(
            'tipe_aksi', 'PERGANTIAN_REKENING_UTAMA',
            'rekening_lama', jsonb_build_object(
                'id', v_old_active.id,
                'nama_bank', v_old_active.nama_bank,
                'kode_bank', v_old_active.kode_bank,
                'nomor_rekening', v_old_active.nomor_rekening,
                'atas_nama', v_old_active.atas_nama,
                'is_active', true
            ),
            'rekening_baru', jsonb_build_object(
                'id', v_target.id,
                'nama_bank', v_target.nama_bank,
                'kode_bank', v_target.kode_bank,
                'nomor_rekening', v_target.nomor_rekening,
                'atas_nama', v_target.atas_nama,
                'is_active', false
            )
        );

        -- Nonaktifkan rekening aktif sebelumnya
        UPDATE public.rekening_pesantren
        SET is_active = false,
            updated_by = v_user_id,
            updated_at = now()
        WHERE id = v_old_active.id;
    ELSE
        -- Skenario B: Aktivasi Rekening Perdana (Sebelumnya belum ada rekening aktif)
        v_aktivitas := 'AKTIFKAN_REKENING_PESANTREN';
        v_data_sebelum := jsonb_build_object(
            'tipe_aksi', 'AKTIVASI_REKENING_PERDANA',
            'rekening_lama', NULL,
            'rekening_baru', jsonb_build_object(
                'id', v_target.id,
                'nama_bank', v_target.nama_bank,
                'kode_bank', v_target.kode_bank,
                'nomor_rekening', v_target.nomor_rekening,
                'atas_nama', v_target.atas_nama,
                'is_active', false
            )
        );
    END IF;

    -- 6. Aktifkan Rekening Target Menjadi Rekening Utama Tunggal
    UPDATE public.rekening_pesantren
    SET is_active = true,
        updated_by = v_user_id,
        updated_at = now()
    WHERE id = p_rekening_id
    RETURNING * INTO v_target;

    v_data_sesudah := jsonb_build_object(
        'tipe_aksi', v_aktivitas,
        'rekening_lama', CASE 
            WHEN v_old_active.id IS NOT NULL THEN jsonb_build_object(
                'id', v_old_active.id,
                'nama_bank', v_old_active.nama_bank,
                'kode_bank', v_old_active.kode_bank,
                'nomor_rekening', v_old_active.nomor_rekening,
                'atas_nama', v_old_active.atas_nama,
                'is_active', false
            )
            ELSE NULL 
        END,
        'rekening_baru', jsonb_build_object(
            'id', v_target.id,
            'nama_bank', v_target.nama_bank,
            'kode_bank', v_target.kode_bank,
            'nomor_rekening', v_target.nomor_rekening,
            'atas_nama', v_target.atas_nama,
            'is_active', true
        )
    );

    -- 7. Catat Audit Log dalam Transaksi yang Sama (Atomic Commit/Rollback)
    v_clean_alasan := COALESCE(
        NULLIF(trim(p_alasan), ''),
        CASE 
            WHEN v_old_active.id IS NOT NULL THEN format(
                'Pergantian rekening utama dari %s (%s) ke %s (%s) oleh %s',
                v_old_active.nama_bank, v_old_active.nomor_rekening,
                v_target.nama_bank, v_target.nomor_rekening,
                v_user_role
            )
            ELSE format(
                'Pengaktifan rekening utama perdana: %s (%s) oleh %s',
                v_target.nama_bank, v_target.nomor_rekening,
                v_user_role
            )
        END
    );
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
        v_aktivitas,
        'rekening_pesantren',
        p_rekening_id::TEXT,
        v_data_sebelum,
        v_data_sesudah,
        v_clean_alasan,
        jsonb_build_object(
            'function', 'rpc_aktifkan_rekening_pesantren_v1',
            'tipe_perubahan', CASE WHEN v_old_active.id IS NOT NULL THEN 'PERGANTIAN' ELSE 'AKTIVASI_BARU' END,
            'rekening_lama_id', v_old_active.id,
            'rekening_baru_id', v_target.id
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Rekening %s (%s) berhasil diaktifkan sebagai rekening utama.', v_target.nama_bank, v_target.nomor_rekening),
        'data', to_jsonb(v_target)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC ATOMIK: Penonaktifan Rekening Utama Pesantren
-- Menonaktifkan rekening yang sedang aktif (misalnya jika ada peralihan/pemeliharaan)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(
    p_rekening_id UUID,
    p_alasan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_role public.user_role;
    v_target public.rekening_pesantren;
    v_data_sebelum JSONB;
    v_data_sesudah JSONB;
    v_clean_alasan TEXT;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Autentikasi Pengguna
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Sesi otentikasi tidak ditemukan. auth.uid() bernilai NULL.';
    END IF;

    -- 2. Validasi Otorisasi Role Pengguna
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id AND is_active = true;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang menonaktifkan rekening resmi pesantren. Role Anda: %',
            COALESCE(v_user_role::TEXT, 'tidak terdaftar / nonaktif');
    END IF;

    IF p_rekening_id IS NULL THEN
        RAISE EXCEPTION 'ID rekening target wajib disertakan.';
    END IF;

    -- 3. Kunci Mutasi Transaksi Rekening (PostgreSQL Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    -- 4. Kunci dan Validasi Rekening Target (FOR UPDATE)
    SELECT * INTO v_target
    FROM public.rekening_pesantren
    WHERE id = p_rekening_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Rekening target dengan ID % tidak ditemukan.', p_rekening_id;
    END IF;

    -- Jika rekening memang sudah nonaktif, bersifat idempotent
    IF v_target.is_active = false THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Rekening ini sudah berstatus nonaktif.',
            'data', to_jsonb(v_target)
        );
    END IF;

    v_data_sebelum := jsonb_build_object(
        'tipe_aksi', 'NONAKTIFKAN_REKENING_UTAMA',
        'rekening', jsonb_build_object(
            'id', v_target.id,
            'nama_bank', v_target.nama_bank,
            'kode_bank', v_target.kode_bank,
            'nomor_rekening', v_target.nomor_rekening,
            'atas_nama', v_target.atas_nama,
            'is_active', true
        )
    );

    -- 5. Ubah Status Rekening Menjadi Nonaktif
    UPDATE public.rekening_pesantren
    SET is_active = false,
        updated_by = v_user_id,
        updated_at = now()
    WHERE id = p_rekening_id
    RETURNING * INTO v_target;

    v_data_sesudah := jsonb_build_object(
        'tipe_aksi', 'NONAKTIFKAN_REKENING_UTAMA',
        'rekening', jsonb_build_object(
            'id', v_target.id,
            'nama_bank', v_target.nama_bank,
            'kode_bank', v_target.kode_bank,
            'nomor_rekening', v_target.nomor_rekening,
            'atas_nama', v_target.atas_nama,
            'is_active', false
        )
    );

    -- 6. Catat Audit Log dalam Transaksi yang Sama
    v_clean_alasan := COALESCE(
        NULLIF(trim(p_alasan), ''),
        format('Penonaktifan rekening utama: %s (%s) oleh %s', v_target.nama_bank, v_target.nomor_rekening, v_user_role)
    );
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
        'NONAKTIFKAN_REKENING_PESANTREN',
        'rekening_pesantren',
        p_rekening_id::TEXT,
        v_data_sebelum,
        v_data_sesudah,
        v_clean_alasan,
        jsonb_build_object(
            'function', 'rpc_nonaktifkan_rekening_pesantren_v1',
            'rekening_id', v_target.id,
            'nomor_rekening', v_target.nomor_rekening,
            'nama_bank', v_target.nama_bank
        ),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Rekening %s (%s) berhasil dinonaktifkan.', v_target.nama_bank, v_target.nomor_rekening),
        'data', to_jsonb(v_target)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Pengaturan Hak Akses & Ownership Fungsi (Hardened Security)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        ALTER FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(uuid, text) OWNER TO postgres;
        ALTER FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(uuid, text) OWNER TO postgres;
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(uuid, text) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(uuid, text) FROM anon;
        REVOKE ALL ON FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(uuid, text) FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(uuid, text) FROM service_role;
        REVOKE ALL ON FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(uuid, text) FROM service_role;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.rpc_aktifkan_rekening_pesantren_v1(uuid, text) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_nonaktifkan_rekening_pesantren_v1(uuid, text) TO authenticated;
    END IF;
END $$;
