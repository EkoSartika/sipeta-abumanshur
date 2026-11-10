-- ============================================================================
-- SIPETA - Pondok Pesantren Modern Abu Manshur
-- Migration 016: Fitur Manajemen Semester Akademik & RPC Pergantian Semester
-- File: supabase/migrations/016_semester_akademik.sql
-- ============================================================================
-- Catatan Kepatuhan Keamanan:
-- 1. Non-destruktif: Tidak mengubah, menghapus, atau merusak data historis
--    santri, nilai, tahfidz, transaksi keuangan, tagihan, kelas, maupun asrama.
-- 2. Keamanan Tingkat Tinggi (SECURITY DEFINER + Trigger Guard):
--    - RPC rpc_set_active_semester hanya dapat dieksekusi oleh role berwenang:
--      Pengasuh (admin) dan Superadmin. Role TU, Bendahara, Asatidz, dan Wali DITOLAK.
--    - Trigger Guard PG_CONTEXT dipasang pada profil_pesantren untuk MENCEGAH
--      mutasi langsung pada kolom semester_aktif di luar RPC resmi.
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
-- 2. TRIGGER GUARD: CEGAH UPDATE LANGSUNG PADA KOLOM SEMESTER_AKTIF
-- ----------------------------------------------------------------------------
-- Menggunakan call stack inspection (PG_CONTEXT) bawaan PostgreSQL, identik
-- dengan proteksi prevent_direct_tahun_ajaran_active_update() pada migration 015.
-- Menjamin bahwa mutasi semester_aktif HANYA dapat dipanggil dari dalam
-- fungsi rpc_set_active_semester(), dan menolak direct UPDATE via REST API/SQL client.
CREATE OR REPLACE FUNCTION public.prevent_direct_profil_pesantren_semester_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context TEXT;
BEGIN
    IF (OLD.semester_aktif IS DISTINCT FROM NEW.semester_aktif) THEN
        -- Periksa call stack internal PL/pgSQL
        GET DIAGNOSTICS v_context = PG_CONTEXT;

        -- Mutasi semester_aktif HANYA diizinkan jika dieksekusi dari dalam fungsi resmi public.rpc_set_active_semester.
        -- Validasi ketat pola call stack resmi PL/pgSQL:
        -- 1. Wajib memanggil fungsi rpc_set_active_semester
        -- 2. DILARANG dipanggil dari skema asing selain public (misal: evil.rpc_set_active_semester)
        IF v_context !~ '(^|\n)PL/pgSQL function (public\.)?rpc_set_active_semester\('
           OR v_context ~ '(?<!public)\.rpc_set_active_semester\(' THEN
            RAISE EXCEPTION 'Akses ditolak: Semester aktif HANYA dapat diubah melalui public.rpc_set_active_semester(). UPDATE langsung dilarang.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_direct_profil_pesantren_semester_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_direct_profil_pesantren_semester_update() TO anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_direct_profil_pesantren_semester_update ON public.profil_pesantren;
CREATE TRIGGER trg_guard_direct_profil_pesantren_semester_update
BEFORE UPDATE ON public.profil_pesantren
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_profil_pesantren_semester_update();


-- ----------------------------------------------------------------------------
-- 3. RPC ATOMIK: PERGANTIAN SEMESTER AKADEMIK AKTIF (SECURITY DEFINER)
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

    -- 3. Validasi Nilai Input Semester (Aman dari NULL dan Whitespace)
    IF p_semester IS NULL OR trim(p_semester) NOT IN ('Ganjil', 'Genap') THEN
        RAISE EXCEPTION 'Nilai semester tidak valid: "%". Nilai yang diizinkan hanya "Ganjil" atau "Genap".', COALESCE(p_semester, 'NULL');
    END IF;
    v_clean_semester := trim(p_semester);

    -- 4. Ambil Data Profil Pesantren Singleton dengan Row-Level Exclusive Lock
    -- SIPETA menggunakan singleton ID tetap ('00000000-0000-0000-0000-000000000001'::UUID).
    -- Tidak ada fallback ke sembarang baris untuk mencegah mutasi baris yang tidak sah.
    SELECT id, tahun_pelajaran_aktif, semester_aktif
    INTO v_profil_id, v_tahun_aktif, v_semester_lama
    FROM public.profil_pesantren
    WHERE id = '00000000-0000-0000-0000-000000000001'::UUID
    FOR UPDATE;

    IF v_profil_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Baris profil pesantren singleton (00000000-0000-0000-0000-000000000001) tidak ditemukan.';
    END IF;

    -- 5. Jika nilai semester sama persis, tidak perlu mutasi (Idempoten)
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
-- 4. PERIZINAN EKSEKUSI RPC (GRANT & REVOKE)
-- ----------------------------------------------------------------------------
-- Cabut izin eksekusi dari PUBLIC dan anon
REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM anon;

-- Izinkan hanya authenticated (validasi role dilakukan di dalam fungsi)
GRANT EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) TO authenticated;

-- Komentar dokumentasi objek
COMMENT ON FUNCTION public.rpc_set_active_semester(TEXT) IS
'RPC atomik untuk mengubah semester akademik aktif (Ganjil/Genap) pada profil_pesantren. Hanya dapat dipanggil oleh role Pengasuh (admin) dan Superadmin.';

COMMENT ON FUNCTION public.prevent_direct_profil_pesantren_semester_update() IS
'Trigger guard PG_CONTEXT: Mencegah UPDATE langsung terhadap kolom semester_aktif pada profil_pesantren di luar RPC resmi rpc_set_active_semester().';

COMMIT;
