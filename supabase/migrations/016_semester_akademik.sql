-- ============================================================================
-- SIPETA - Pondok Pesantren Modern Abu Manshur
-- Migration 016: Fitur Manajemen Semester Akademik & RPC Pergantian Semester
-- File: supabase/migrations/016_semester_akademik.sql
-- ============================================================================
-- Catatan Kepatuhan:
-- 1. Non-destruktif: Tidak mengubah, menghapus, atau merusak data historis
--    santri, nilai, tahfidz, transaksi keuangan, tagihan, kelas, maupun asrama.
-- 2. Keamanan: RPC rpc_set_active_semester hanya dapat dieksekusi oleh
--    role yang berwenang: Pengasuh (admin) dan Superadmin. Role TU, Bendahara,
--    Asatidz, dan Wali Santri DITOLAK (hanya read-only).
-- 3. Audit trail: Setiap pergantian semester dicatat secara otomatis ke public.audit_logs.
-- 4. PENTING: File ini disiapkan untuk diperiksa dan dijalankan secara manual
--    di Supabase SQL Editor oleh pengelola sistem resmi.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. VERIFIKASI KOLOM SEMESTER_AKTIF PADA PROFIL_PESANTREN
-- ----------------------------------------------------------------------------
-- Memastikan kolom semester_aktif tersedia dan memiliki check constraint valid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profil_pesantren'
          AND column_name = 'semester_aktif'
    ) THEN
        ALTER TABLE public.profil_pesantren
        ADD COLUMN semester_aktif TEXT NOT NULL DEFAULT 'Ganjil'
        CHECK (semester_aktif IN ('Ganjil', 'Genap'));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. RPC ATOMIK: PERGANTIAN SEMESTER AKADEMIK AKTIF (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_active_semester(p_semester TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_operator_id UUID;
    v_role public.user_role;
    v_profil_id UUID;
    v_tahun_aktif TEXT;
    v_semester_lama TEXT;
    v_clean_semester TEXT;
BEGIN
    -- 1. Verifikasi Autentikasi Pengguna
    v_operator_id := auth.uid();
    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Pengguna tidak terautentikasi.';
    END IF;

    -- 2. Verifikasi Hak Akses: HANYA Pengasuh (Admin) dan Superadmin
    v_role := public.get_my_role();
    IF v_role IS NULL OR v_role NOT IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Pengasuh (Admin) atau Superadmin yang berwenang mengubah semester akademik aktif. Role saat ini: %', COALESCE(v_role::text, 'anon');
    END IF;

    -- 3. Validasi Nilai Input Semester
    v_clean_semester := trim(p_semester);
    IF v_clean_semester NOT IN ('Ganjil', 'Genap') THEN
        RAISE EXCEPTION 'Nilai semester tidak valid: "%". Nilai yang diizinkan hanya "Ganjil" atau "Genap".', p_semester;
    END IF;

    -- 4. Ambil Data Profil Pesantren Saat Ini (Singleton)
    SELECT id, tahun_pelajaran_aktif, semester_aktif
    INTO v_profil_id, v_tahun_aktif, v_semester_lama
    FROM public.profil_pesantren
    WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
    FOR UPDATE;

    IF v_profil_id IS NULL THEN
        -- Fallback cari sembarang row profil pertama jika ID berbeda
        SELECT id, tahun_pelajaran_aktif, semester_aktif
        INTO v_profil_id, v_tahun_aktif, v_semester_lama
        FROM public.profil_pesantren
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF v_profil_id IS NULL THEN
        RAISE EXCEPTION 'Profil pesantren belum diinisialisasi di database.';
    END IF;

    -- 5. Jika nilai semester sama persis, tidak perlu mutasi
    IF v_semester_lama = v_clean_semester THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Semester aktif sudah berada pada status Semester ' || v_clean_semester || '.',
            'semester_lama', v_semester_lama,
            'semester_baru', v_clean_semester,
            'tahun_pelajaran_aktif', v_tahun_aktif,
            'unchanged', true
        );
    END IF;

    -- 6. Mutasi Semester Aktif pada Profil Pesantren
    UPDATE public.profil_pesantren
    SET semester_aktif = v_clean_semester,
        updated_at = now(),
        updated_by = v_operator_id
    WHERE id = v_profil_id;

    -- 7. Pencatatan Audit Log Khusus Pergantian Semester
    INSERT INTO public.audit_logs (
        user_id,
        user_role,
        aktivitas,
        jenis_objek,
        objek_id,
        data_sebelum,
        data_sesudah,
        alasan_perubahan
    ) VALUES (
        v_operator_id,
        v_role,
        'SET_ACTIVE_SEMESTER',
        'profil_pesantren',
        v_profil_id::text,
        jsonb_build_object(
            'semester_aktif', v_semester_lama,
            'tahun_pelajaran_aktif', v_tahun_aktif
        ),
        jsonb_build_object(
            'semester_aktif', v_clean_semester,
            'tahun_pelajaran_aktif', v_tahun_aktif
        ),
        'Pergantian semester akademik resmi pondok pesantren (' || COALESCE(v_semester_lama, '-') || ' -> ' || v_clean_semester || ') pada Tahun Pelajaran ' || COALESCE(v_tahun_aktif, '-')
    );

    -- 8. Return Respon Terstruktur
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Semester aktif berhasil diubah menjadi Semester ' || v_clean_semester || ' untuk Tahun Pelajaran ' || COALESCE(v_tahun_aktif, '-'),
        'semester_lama', v_semester_lama,
        'semester_baru', v_clean_semester,
        'tahun_pelajaran_aktif', v_tahun_aktif
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. PERIZINAN EKSEKUSI RPC (GRANT & REVOKE)
-- ----------------------------------------------------------------------------
-- Cabut izin eksekusi dari PUBLIC dan anon
REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM anon;

-- Izinkan hanya authenticated (validasi role dilakukan di dalam fungsi)
GRANT EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) TO authenticated;

-- Komentar dokumentasi objek
COMMENT ON FUNCTION public.rpc_set_active_semester(TEXT) IS
'RPC atomik untuk mengubah semester akademik aktif (Ganjil/Genap) pada profil_pesantren. Hanya dapat dipanggil oleh role Pengasuh (admin) dan Superadmin.';

COMMIT;

