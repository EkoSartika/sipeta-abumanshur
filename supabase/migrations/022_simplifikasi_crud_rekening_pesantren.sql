-- ============================================================================
-- SIPETA MIGRATION 022: Penyederhanaan CRUD Rekening Pesantren & Transaksi Atomik
-- Modul: Pengaturan Informasi Rekening Resmi Pesantren (Pemisahan Total dari Checkout)
-- Sesuai Arahan Pengasuh: Sederhana dalam penggunaan, kuat dalam keamanan, 
-- dan benar dalam integritas database (All-or-nothing rollback).
-- ============================================================================
-- Karakteristik & Perubahan Utama:
-- 1. Modul rekening disederhanakan murni sebagai daftar informasi rekening pesantren.
-- 2. CRUD rekening (Tambah/Edit) TIDAK MENGUBAH status is_active.
--    Rekening baru yang ditambahkan TIDAK otomatis menjadi rekening aktif checkout (is_active = false).
-- 3. Integritas Checkout & Transaksi dipertahankan utuh: partial unique index
--    idx_single_active_rekening_pesantren dipertahankan sehingga proses checkout
--    memilih rekening secara tidak ambigu.
-- 4. Pengasuh (admin) dan Superadmin dapat Menambah (INSERT), Mengedit (UPDATE),
--    dan Menghapus (DELETE) rekening secara atomik via PostgreSQL RPC SECURITY DEFINER.
-- 5. Seluruh mutasi database dan pencatatan audit log dilakukan dalam satu transaksi yang sama.
--    Jika ada operasi yang gagal, seluruh perubahan di-ROLLBACK (tanpa data parsial/setengah tersimpan).
-- 6. Pengasuh dan Superadmin dapat melihat seluruh rekening yang tersimpan.
-- 7. Wali Santri, Bendahara, dan Asatidz (pengelola) dapat melihat seluruh rekening tersimpan (read-only),
--    tanpa filter is_active.
-- 8. Role Tata Usaha (TU) secara tegas TIDAK memiliki hak akses (SELECT maupun mutasi).
-- 9. Rekening yang memiliki riwayat transaksi keuangan santri (pembayaran maupun uang saku)
--    dilindungi secara ketat: nomor rekening dan nama pemilik tidak boleh diubah,
--    serta rekening tersebut TIDAK DAPAT DIHAPUS demi menjaga integritas data historis.
-- 10. Jalur RPC lama (rpc_ganti_rekening_resmi_v1) DINONAKTIFKAN dengan mencabut hak EXECUTE
--     dari PUBLIC, anon, authenticated, dan service_role.
-- ============================================================================

-- 1. Pastikan Partial Unique Index 1 Rekening Aktif Tetap Ada (Proteksi Ambiguitas Checkout)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_rekening_pesantren
ON public.rekening_pesantren ((is_active))
WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. Nonaktifkan Jalur RPC Lama: rpc_ganti_rekening_resmi_v1
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'rpc_ganti_rekening_resmi_v1'
    ) THEN
        REVOKE ALL ON FUNCTION public.rpc_ganti_rekening_resmi_v1(uuid, text, text, text, text, text, text) FROM PUBLIC;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE ALL ON FUNCTION public.rpc_ganti_rekening_resmi_v1(uuid, text, text, text, text, text, text) FROM anon;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE ALL ON FUNCTION public.rpc_ganti_rekening_resmi_v1(uuid, text, text, text, text, text, text) FROM authenticated;
        END IF;

        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            REVOKE ALL ON FUNCTION public.rpc_ganti_rekening_resmi_v1(uuid, text, text, text, text, text, text) FROM service_role;
        END IF;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. RPC ATOMIK: Tambah Rekening Pesantren (Atomic INSERT Informasi)
-- Catatan: TIDAK menerima parameter is_active. Rekening baru selalu is_active = false.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_tambah_rekening_pesantren_v1(
    p_nama_bank TEXT,
    p_kode_bank TEXT DEFAULT NULL,
    p_nomor_rekening TEXT DEFAULT NULL,
    p_atas_nama TEXT DEFAULT NULL,
    p_catatan_instruksi TEXT DEFAULT NULL,
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
    v_clean_nama_bank TEXT;
    v_clean_kode_bank TEXT;
    v_clean_nomor_rekening TEXT;
    v_clean_atas_nama TEXT;
    v_clean_catatan TEXT;
    v_clean_alasan TEXT;
    v_new_rek public.rekening_pesantren;
    v_new_id UUID;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Autentikasi & Otorisasi Pengguna (auth.uid() wajib)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Sesi otentikasi tidak ditemukan. auth.uid() bernilai NULL.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang menambah rekening pesantren. Role Anda: %',
            COALESCE(v_user_role::TEXT, 'tidak terdaftar');
    END IF;

    -- 2. Validasi & Normalisasi Input
    v_clean_nama_bank := trim(COALESCE(p_nama_bank, ''));
    v_clean_nomor_rekening := trim(COALESCE(p_nomor_rekening, ''));
    v_clean_atas_nama := trim(COALESCE(p_atas_nama, ''));
    v_clean_kode_bank := NULLIF(trim(COALESCE(p_kode_bank, '')), '');
    v_clean_catatan := NULLIF(trim(COALESCE(p_catatan_instruksi, '')), '');
    v_clean_alasan := COALESCE(NULLIF(trim(p_alasan), ''), 'Penambahan rekening informasi pesantren oleh pimpinan');

    IF length(v_clean_nama_bank) < 2 THEN
        RAISE EXCEPTION 'Nama bank wajib diisi (minimal 2 karakter).';
    END IF;

    IF length(v_clean_nomor_rekening) < 5 THEN
        RAISE EXCEPTION 'Nomor rekening tidak valid (minimal 5 digit).';
    END IF;

    IF length(v_clean_atas_nama) < 3 THEN
        RAISE EXCEPTION 'Nama pemilik rekening wajib diisi (minimal 3 karakter).';
    END IF;

    -- 3. Kunci Mutasi Transaksi Rekening (Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    v_new_id := gen_random_uuid();

    -- 4. INSERT Data Rekening Informasi Baru
    -- PENTING: is_active selalu FALSE agar penambahan rekening informasi tidak
    -- memengaruhi atau membuat ambiguitas pada proses checkout pembayaran.
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
        v_new_id,
        v_clean_nama_bank,
        v_clean_kode_bank,
        v_clean_nomor_rekening,
        v_clean_atas_nama,
        v_clean_catatan,
        false,
        v_user_id,
        now(),
        now()
    ) RETURNING * INTO v_new_rek;

    -- 5. INSERT Audit Log dalam Transaksi yang Sama (Atomic)
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
        'TAMBAH_REKENING_PESANTREN',
        'rekening_pesantren',
        v_new_id::TEXT,
        NULL,
        to_jsonb(v_new_rek),
        v_clean_alasan,
        jsonb_build_object('function', 'rpc_tambah_rekening_pesantren_v1'),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rekening informasi pesantren berhasil ditambahkan secara permanen.',
        'data', to_jsonb(v_new_rek)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC ATOMIK: Edit Rekening Pesantren (Atomic UPDATE Informasi)
-- Catatan: TIDAK MENGUBAH status is_active rekening.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_rekening_pesantren_v1(
    p_rekening_id UUID,
    p_nama_bank TEXT DEFAULT NULL,
    p_kode_bank TEXT DEFAULT NULL,
    p_nomor_rekening TEXT DEFAULT NULL,
    p_atas_nama TEXT DEFAULT NULL,
    p_catatan_instruksi TEXT DEFAULT NULL,
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
    v_has_tx BOOLEAN := false;
    v_clean_nama_bank TEXT;
    v_clean_nomor_rekening TEXT;
    v_clean_atas_nama TEXT;
    v_clean_kode_bank TEXT;
    v_clean_catatan TEXT;
    v_clean_alasan TEXT;
    v_updated_rek public.rekening_pesantren;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Autentikasi & Otorisasi Pengguna (auth.uid() wajib)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Sesi otentikasi tidak ditemukan. auth.uid() bernilai NULL.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang mengedit rekening pesantren. Role Anda: %',
            COALESCE(v_user_role::TEXT, 'tidak terdaftar');
    END IF;

    IF p_rekening_id IS NULL THEN
        RAISE EXCEPTION 'ID rekening target wajib disertakan.';
    END IF;

    -- 2. Kunci Mutasi Transaksi Rekening (Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    -- 3. Kunci Baris Rekening Target (FOR UPDATE)
    SELECT * INTO v_target
    FROM public.rekening_pesantren
    WHERE id = p_rekening_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Rekening target dengan ID % tidak ditemukan.', p_rekening_id;
    END IF;

    v_data_sebelum := to_jsonb(v_target);

    -- 4. Proteksi Rekening Historis: Periksa apakah ada riwayat transaksi
    SELECT EXISTS (
        SELECT 1 FROM public.transaksi_pembayaran
        WHERE (rekening_tujuan_snapshot ->> 'nomor_rekening' = v_target.nomor_rekening)
           OR (rekening_tujuan_snapshot ->> 'id' = v_target.id::TEXT)
    ) INTO v_has_tx;

    IF NOT v_has_tx AND to_regclass('public.pengajuan_uang_saku') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (
            SELECT 1 FROM public.pengajuan_uang_saku
            WHERE (rekening_tujuan_snapshot ->> ''nomor_rekening'' = $1)
               OR (rekening_tujuan_snapshot ->> ''id'' = $2::TEXT)
        )' INTO v_has_tx USING v_target.nomor_rekening, v_target.id;
    END IF;

    -- 5. Validasi Aturan Mutasi Lapangan
    v_clean_nama_bank := COALESCE(NULLIF(trim(p_nama_bank), ''), v_target.nama_bank);
    v_clean_nomor_rekening := COALESCE(NULLIF(trim(p_nomor_rekening), ''), v_target.nomor_rekening);
    v_clean_atas_nama := COALESCE(NULLIF(trim(p_atas_nama), ''), v_target.atas_nama);
    v_clean_kode_bank := CASE WHEN p_kode_bank IS NOT NULL THEN NULLIF(trim(p_kode_bank), '') ELSE v_target.kode_bank END;
    v_clean_catatan := CASE WHEN p_catatan_instruksi IS NOT NULL THEN NULLIF(trim(p_catatan_instruksi), '') ELSE v_target.catatan_instruksi END;
    v_clean_alasan := COALESCE(NULLIF(trim(p_alasan), ''), 'Pembaruan informasi rekening pesantren oleh pimpinan');

    IF v_has_tx THEN
        IF v_clean_nomor_rekening <> v_target.nomor_rekening OR v_clean_atas_nama <> v_target.atas_nama THEN
            RAISE EXCEPTION 'Rekening "%" (No: %) telah digunakan dalam riwayat transaksi keuangan. Nomor rekening dan nama pemilik tidak boleh diubah demi menjaga integritas data historis.',
                v_target.nama_bank, v_target.nomor_rekening;
        END IF;
    END IF;

    IF length(v_clean_nama_bank) < 2 THEN
        RAISE EXCEPTION 'Nama bank wajib diisi (minimal 2 karakter).';
    END IF;
    IF length(v_clean_nomor_rekening) < 5 THEN
        RAISE EXCEPTION 'Nomor rekening tidak valid (minimal 5 digit).';
    END IF;
    IF length(v_clean_atas_nama) < 3 THEN
        RAISE EXCEPTION 'Nama pemilik rekening wajib diisi (minimal 3 karakter).';
    END IF;

    -- 6. UPDATE Data Rekening (PENTING: Status is_active TIDAK DIUBAH)
    UPDATE public.rekening_pesantren
    SET nama_bank = v_clean_nama_bank,
        kode_bank = v_clean_kode_bank,
        nomor_rekening = v_clean_nomor_rekening,
        atas_nama = v_clean_atas_nama,
        catatan_instruksi = v_clean_catatan,
        updated_by = v_user_id,
        updated_at = now()
    WHERE id = p_rekening_id
    RETURNING * INTO v_updated_rek;

    -- 7. INSERT Audit Log dalam Transaksi yang Sama (Atomic)
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
        'UPDATE_REKENING_PESANTREN',
        'rekening_pesantren',
        p_rekening_id::TEXT,
        v_data_sebelum,
        to_jsonb(v_updated_rek),
        v_clean_alasan,
        jsonb_build_object('function', 'rpc_update_rekening_pesantren_v1'),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rekening informasi pesantren berhasil diperbarui secara permanen.',
        'data', to_jsonb(v_updated_rek)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC ATOMIK: Hapus Rekening Pesantren (Atomic DELETE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hapus_rekening_pesantren_v1(
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
    v_has_tx BOOLEAN := false;
    v_clean_alasan TEXT;
    v_audit_id UUID;
BEGIN
    -- 1. Validasi Autentikasi & Otorisasi Pengguna (auth.uid() wajib)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Sesi otentikasi tidak ditemukan. auth.uid() bernilai NULL.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = v_user_id;

    IF v_user_role IS NULL OR v_user_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang menghapus rekening pesantren. Role Anda: %',
            COALESCE(v_user_role::TEXT, 'tidak terdaftar');
    END IF;

    IF p_rekening_id IS NULL THEN
        RAISE EXCEPTION 'ID rekening target wajib disertakan.';
    END IF;

    -- 2. Kunci Mutasi Transaksi Rekening (Advisory Lock)
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_rekening_pesantren_mutation_lock'));

    -- 3. Kunci Baris Rekening Target (FOR UPDATE)
    SELECT * INTO v_target
    FROM public.rekening_pesantren
    WHERE id = p_rekening_id
    FOR UPDATE;

    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'Rekening target dengan ID % tidak ditemukan.', p_rekening_id;
    END IF;

    v_data_sebelum := to_jsonb(v_target);

    -- 4. Proteksi Riwayat Transaksi Historis:
    SELECT EXISTS (
        SELECT 1 FROM public.transaksi_pembayaran
        WHERE (rekening_tujuan_snapshot ->> 'nomor_rekening' = v_target.nomor_rekening)
           OR (rekening_tujuan_snapshot ->> 'id' = v_target.id::TEXT)
    ) INTO v_has_tx;

    IF NOT v_has_tx AND to_regclass('public.pengajuan_uang_saku') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS (
            SELECT 1 FROM public.pengajuan_uang_saku
            WHERE (rekening_tujuan_snapshot ->> ''nomor_rekening'' = $1)
               OR (rekening_tujuan_snapshot ->> ''id'' = $2::TEXT)
        )' INTO v_has_tx USING v_target.nomor_rekening, v_target.id;
    END IF;

    IF v_has_tx THEN
        RAISE EXCEPTION 'Rekening "%" (No: %) tidak dapat dihapus karena tersimpan dalam riwayat transaksi keuangan santri. Rekening dapat dinonaktifkan untuk menjaga integritas data historis.',
            v_target.nama_bank, v_target.nomor_rekening;
    END IF;

    -- 5. Catat Audit Log Sebelum Hapus (Dalam Transaksi yang Sama)
    v_clean_alasan := COALESCE(NULLIF(trim(p_alasan), ''), 'Penghapusan rekening pesantren oleh pimpinan');
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
        'HAPUS_REKENING_PESANTREN',
        'rekening_pesantren',
        p_rekening_id::TEXT,
        v_data_sebelum,
        NULL,
        v_clean_alasan,
        jsonb_build_object('function', 'rpc_hapus_rekening_pesantren_v1'),
        now()
    );

    -- 6. Hapus Rekening
    DELETE FROM public.rekening_pesantren
    WHERE id = p_rekening_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Rekening pesantren berhasil dihapus secara permanen.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Hak Akses Eksekusi RPC & Kepemilikan Fungsi (Hardened)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        ALTER FUNCTION public.rpc_tambah_rekening_pesantren_v1(text, text, text, text, text, text) OWNER TO postgres;
        ALTER FUNCTION public.rpc_update_rekening_pesantren_v1(uuid, text, text, text, text, text, text) OWNER TO postgres;
        ALTER FUNCTION public.rpc_hapus_rekening_pesantren_v1(uuid, text) OWNER TO postgres;
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.rpc_tambah_rekening_pesantren_v1(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_rekening_pesantren_v1(uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hapus_rekening_pesantren_v1(uuid, text) FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.rpc_tambah_rekening_pesantren_v1(text, text, text, text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION public.rpc_update_rekening_pesantren_v1(uuid, text, text, text, text, text, text) FROM anon;
        REVOKE ALL ON FUNCTION public.rpc_hapus_rekening_pesantren_v1(uuid, text) FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON FUNCTION public.rpc_tambah_rekening_pesantren_v1(text, text, text, text, text, text) FROM service_role;
        REVOKE ALL ON FUNCTION public.rpc_update_rekening_pesantren_v1(uuid, text, text, text, text, text, text) FROM service_role;
        REVOKE ALL ON FUNCTION public.rpc_hapus_rekening_pesantren_v1(uuid, text) FROM service_role;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.rpc_tambah_rekening_pesantren_v1(text, text, text, text, text, text) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_update_rekening_pesantren_v1(uuid, text, text, text, text, text, text) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.rpc_hapus_rekening_pesantren_v1(uuid, text) TO authenticated;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Pengaturan RLS (Row Level Security) Tabel rekening_pesantren
-- ----------------------------------------------------------------------------
ALTER TABLE public.rekening_pesantren ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekening_pesantren NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rekening Pesantren: superadmin dan admin dapat melihat seluruh rekening" ON public.rekening_pesantren;
DROP POLICY IF EXISTS "Rekening Pesantren: akun operasional dapat melihat rekening aktif" ON public.rekening_pesantren;
DROP POLICY IF EXISTS "Rekening Pesantren: wali dan staf operasional dapat melihat informasi rekening" ON public.rekening_pesantren;

-- Policy 1: Pengasuh (admin) dan Superadmin dapat melihat (SELECT) seluruh rekening
CREATE POLICY "Rekening Pesantren: superadmin dan admin dapat melihat seluruh rekening"
ON public.rekening_pesantren FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'));

-- Policy 2: Wali, Bendahara, dan Pengelola (Asatidz) dapat melihat SELURUH rekening tersimpan
-- sebagai informasi tujuan transfer tanpa filter is_active
CREATE POLICY "Rekening Pesantren: wali dan staf operasional dapat melihat informasi rekening"
ON public.rekening_pesantren FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('bendahara', 'pengelola', 'wali'));

-- Berikan izin SELECT kepada role authenticated (difilter oleh policy RLS di atas)
GRANT SELECT ON public.rekening_pesantren TO authenticated;

-- Catatan Keamanan:
-- Role 'tu' (Tata Usaha) secara tegas TIDAK diberikan policy SELECT pada rekening_pesantren (0 baris dikembalikan).
-- TIDAK ADA policy FOR INSERT, UPDATE, atau DELETE pada tabel ini.
-- Seluruh mutasi hanya dapat dilakukan via RPC SECURITY DEFINER resmi di atas.
