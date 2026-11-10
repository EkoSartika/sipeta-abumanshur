-- ============================================================================
-- SIPETA MIGRATION 015: TABEL PROFIL PESANTREN, TAHUN AJARAN AKTIF & AUDIT LOGS
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- Dokumen Migration: Penyimpanan Permanen Profil Lembaga, NSPP/NPSN, Alamat,
-- Kontak Resmi, Pengaturan Tahun Ajaran Aktif, RLS TU, Realtime & Audit Trail
-- Status: SYNTAX AUDITED & VERIFIED (SIAP DIJALANKAN DI SUPABASE SQL EDITOR)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABEL PROFIL PESANTREN (Singleton Pattern)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profil_pesantren (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
    nama_resmi TEXT NOT NULL DEFAULT 'Pondok Pesantren Modern Abu Manshur',
    nspp TEXT DEFAULT '510032090045',
    npsn TEXT DEFAULT '69982412',
    akreditasi TEXT DEFAULT 'Terakreditasi A',
    sk_pendirian TEXT DEFAULT 'Kd.10.09/4/PP.00.7/1335/2010',
    alamat TEXT NOT NULL DEFAULT 'Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652',
    kelurahan TEXT DEFAULT 'Sindangmekar',
    kecamatan TEXT DEFAULT 'Dukupuntang',
    kabupaten_kota TEXT DEFAULT 'Kabupaten Cirebon',
    provinsi TEXT DEFAULT 'Jawa Barat',
    kode_pos TEXT DEFAULT '45652',
    no_telepon TEXT DEFAULT '(0231) 8303388',
    email TEXT DEFAULT 'sekretariat@abumanshur.sch.id',
    website TEXT DEFAULT 'https://abumanshur.sch.id',
    nama_pengasuh TEXT DEFAULT 'Kyai Abu Manshur',
    tahun_pelajaran_aktif TEXT DEFAULT '2026/2027',
    semester_aktif TEXT DEFAULT 'Ganjil',
    informasi_umum TEXT DEFAULT 'Pondok Pesantren Modern Abu Manshur berkomitmen mendidik santri berakhlak mulia, unggul dalam ilmu agama (tahfidz & kitab), dan cakap dalam ilmu pengetahuan umum serta bahasa.',
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_profil_pesantren_singleton CHECK (id = '00000000-0000-0000-0000-000000000001'::UUID)
);

-- Trigger updated_at otomatis
DROP TRIGGER IF EXISTS trg_profil_pesantren_updated_at ON public.profil_pesantren;
CREATE TRIGGER trg_profil_pesantren_updated_at
BEFORE UPDATE ON public.profil_pesantren
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inisialisasi Data Default jika tabel masih kosong (Non-destruktif: tidak menimpa data yang ada)
INSERT INTO public.profil_pesantren (
    id, nama_resmi, nspp, npsn, akreditasi, sk_pendirian, alamat,
    kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos,
    no_telepon, email, website, nama_pengasuh,
    tahun_pelajaran_aktif, semester_aktif, informasi_umum
)
SELECT
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Pondok Pesantren Modern Abu Manshur',
    '510032090045',
    '69982412',
    'Terakreditasi A',
    'Kd.10.09/4/PP.00.7/1335/2010',
    'Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652',
    'Sindangmekar',
    'Dukupuntang',
    'Kabupaten Cirebon',
    'Jawa Barat',
    '45652',
    '(0231) 8303388',
    'sekretariat@abumanshur.sch.id',
    'https://abumanshur.sch.id',
    'Kyai Abu Manshur',
    '2026/2027',
    'Ganjil',
    'Pondok Pesantren Modern Abu Manshur berkomitmen mendidik santri berakhlak mulia, unggul dalam ilmu agama (tahfidz & kitab), dan cakap dalam ilmu pengetahuan umum serta bahasa.'
WHERE NOT EXISTS (SELECT 1 FROM public.profil_pesantren);

-- Aktifkan Row Level Security (RLS) pada tabel profil_pesantren
ALTER TABLE public.profil_pesantren ENABLE ROW LEVEL SECURITY;

-- Kebijakan RLS: Baca oleh publik (anon) dan seluruh pengguna terotentikasi
DROP POLICY IF EXISTS "Profil Pesantren: dapat dibaca oleh seluruh pengguna" ON public.profil_pesantren;
CREATE POLICY "Profil Pesantren: dapat dibaca oleh seluruh pengguna"
ON public.profil_pesantren FOR SELECT
TO anon, authenticated
USING (true);

-- Kebijakan RLS: Tata Usaha (TU), Pengasuh (Admin), dan Superadmin dapat memperbarui profil
DROP POLICY IF EXISTS "Profil Pesantren: dapat dikelola oleh TU, Admin, dan Superadmin" ON public.profil_pesantren;
DROP POLICY IF EXISTS "Profil Pesantren: kelola update oleh TU, Admin, Superadmin" ON public.profil_pesantren;
CREATE POLICY "Profil Pesantren: kelola update oleh TU, Admin, Superadmin"
ON public.profil_pesantren FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('tu', 'admin', 'superadmin'))
WITH CHECK (public.get_my_role() IN ('tu', 'admin', 'superadmin'));

-- Kebijakan RLS: Insert hanya untuk TU, Admin, Superadmin (untuk inisialisasi jika kosong)
DROP POLICY IF EXISTS "Profil Pesantren: insert oleh TU, Admin, Superadmin" ON public.profil_pesantren;
CREATE POLICY "Profil Pesantren: insert oleh TU, Admin, Superadmin"
ON public.profil_pesantren FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('tu', 'admin', 'superadmin'));

-- CATATAN KEAMANAN: TIDAK ADA POLICY DELETE pada public.profil_pesantren
-- Profil pesantren dilindungi dari penghapusan oleh role apa pun via API publik.


-- ----------------------------------------------------------------------------
-- 2. HARDENING TABEL TAHUN AJARAN & PEMBERSIHAN SELURUH POLICY LAMA
-- ----------------------------------------------------------------------------
-- Pastikan indeks unik parsial untuk single active tahun_ajaran tetap aktif
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_tahun_ajaran
ON public.tahun_ajaran ((is_active))
WHERE is_active = true;

-- Hapus SEMUA policy lama pada tahun_ajaran guna menghindari kontaminasi izin PERMISSIVE (OR)
DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master TahunAjaran: TU kelola status aktif" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Tahun Ajaran: dapat dibaca oleh seluruh akun berwenang dan publik" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Tahun Ajaran: admin dan superadmin tambah master" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Tahun Ajaran: admin dan superadmin ubah data master" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Tahun Ajaran: hanya superadmin hapus master" ON public.tahun_ajaran;

-- Policy Baru 1: SELECT diizinkan untuk semua role dan publik (untuk login screen)
CREATE POLICY "Tahun Ajaran: dapat dibaca oleh seluruh akun berwenang dan publik"
ON public.tahun_ajaran FOR SELECT
TO anon, authenticated
USING (true);

-- Policy Baru 2: INSERT data master baru hanya untuk Admin dan Superadmin
CREATE POLICY "Tahun Ajaran: admin dan superadmin tambah master"
ON public.tahun_ajaran FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- Policy Baru 3: UPDATE data master (nama, rentang tanggal) hanya untuk Admin dan Superadmin
-- Catatan: Perubahan status is_active tetap dicegah oleh Trigger Guard di bawah ini.
CREATE POLICY "Tahun Ajaran: admin dan superadmin ubah data master"
ON public.tahun_ajaran FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- Policy Baru 4: DELETE master tahun ajaran hanya untuk Superadmin
CREATE POLICY "Tahun Ajaran: hanya superadmin hapus master"
ON public.tahun_ajaran FOR DELETE
TO authenticated
USING (public.get_my_role() = 'superadmin');


-- ----------------------------------------------------------------------------
-- 3. TRIGGER GUARD: CEGAH UPDATE LANGSUNG PADA KOLOM IS_ACTIVE
-- ----------------------------------------------------------------------------
-- Menggunakan call stack inspection (PG_CONTEXT) bawaan PostgreSQL.
-- Menjamin bahwa mutasi is_active HANYA dapat dipanggil dari dalam rpc_set_active_tahun_ajaran.
-- Tidak bergantung pada static salt atau custom GUC yang dapat dipalsukan.
CREATE OR REPLACE FUNCTION public.prevent_direct_tahun_ajaran_active_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context TEXT;
BEGIN
    IF (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
        -- Periksa call stack internal PL/pgSQL
        GET DIAGNOSTICS v_context = PG_CONTEXT;

        -- Mutasi is_active HANYA diizinkan jika dieksekusi dari dalam fungsi rpc_set_active_tahun_ajaran
        IF v_context NOT LIKE '%rpc_set_active_tahun_ajaran%' THEN
            RAISE EXCEPTION 'Akses ditolak: Status aktif tahun pelajaran HANYA dapat diubah melalui rpc_set_active_tahun_ajaran(). UPDATE langsung dilarang.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_direct_tahun_ajaran_update ON public.tahun_ajaran;
CREATE TRIGGER trg_guard_direct_tahun_ajaran_update
BEFORE UPDATE ON public.tahun_ajaran
FOR EACH ROW EXECUTE FUNCTION public.prevent_direct_tahun_ajaran_active_update();


-- ----------------------------------------------------------------------------
-- 4. RPC ATOMIK: PENGAKTIFAN TAHUN PELAJARAN TUNGGAL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_set_active_tahun_ajaran(p_tahun_ajaran_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role public.user_role;
    v_tahun_nama TEXT;
BEGIN
    -- 1. Verifikasi Role Otoritatif: TU, Admin (Pengasuh), dan Superadmin
    v_role := public.get_my_role();
    IF v_role NOT IN ('tu', 'admin', 'superadmin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Tata Usaha (TU), Pengasuh (Admin), atau Superadmin yang berwenang mengaktifkan tahun pelajaran.';
    END IF;

    -- 2. Validasi keberadaan tahun ajaran target
    SELECT nama INTO v_tahun_nama FROM public.tahun_ajaran WHERE id = p_tahun_ajaran_id;
    IF v_tahun_nama IS NULL THEN
        RAISE EXCEPTION 'Tahun pelajaran dengan ID % tidak ditemukan.', p_tahun_ajaran_id;
    END IF;

    -- 3. Nonaktifkan semua tahun ajaran lain (transaksi atomik)
    UPDATE public.tahun_ajaran SET is_active = false WHERE is_active = true;

    -- 4. Aktifkan tahun ajaran target
    UPDATE public.tahun_ajaran SET is_active = true WHERE id = p_tahun_ajaran_id;

    -- 5. Sinkronkan nama tahun ajaran aktif ke tabel profil_pesantren
    UPDATE public.profil_pesantren
    SET tahun_pelajaran_aktif = v_tahun_nama,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE true;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Tahun pelajaran aktif berhasil diperbarui ke ' || v_tahun_nama,
        'tahun_ajaran_id', p_tahun_ajaran_id,
        'tahun_ajaran_nama', v_tahun_nama
    );
END;
$$;

-- Pembatasan Hak Eksekusi RPC: Cabut dari PUBLIC, izinkan hanya authenticated
REVOKE EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. TRIGGER AUDIT LOGS DATABASE LEVEL (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_audit_profil_pesantren()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_role public.user_role;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
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
            v_user_id,
            v_role,
            'UPDATE_PROFIL_PESANTREN',
            'profil_pesantren',
            NEW.id::text,
            to_jsonb(OLD),
            to_jsonb(NEW),
            'Pembaruan profil resmi pesantren dan/atau tahun ajaran aktif'
        );
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (
            user_id,
            user_role,
            aktivitas,
            jenis_objek,
            objek_id,
            data_sesudah,
            alasan_perubahan
        ) VALUES (
            v_user_id,
            v_role,
            'INSERT_PROFIL_PESANTREN',
            'profil_pesantren',
            NEW.id::text,
            to_jsonb(NEW),
            'Inisialisasi record profil resmi pesantren'
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profil_pesantren_logger ON public.profil_pesantren;
CREATE TRIGGER trg_audit_profil_pesantren_logger
AFTER INSERT OR UPDATE ON public.profil_pesantren
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_profil_pesantren();

CREATE OR REPLACE FUNCTION public.trg_audit_tahun_ajaran()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_role public.user_role;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    END IF;

    IF (TG_OP = 'UPDATE' AND (OLD.is_active IS DISTINCT FROM NEW.is_active)) THEN
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
            v_user_id,
            v_role,
            'UPDATE_STATUS_TAHUN_AJARAN',
            'tahun_ajaran',
            NEW.id::text,
            jsonb_build_object('id', OLD.id, 'nama', OLD.nama, 'is_active', OLD.is_active),
            jsonb_build_object('id', NEW.id, 'nama', NEW.nama, 'is_active', NEW.is_active),
            'Perubahan status aktif tahun pelajaran'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tahun_ajaran_logger ON public.tahun_ajaran;
CREATE TRIGGER trg_audit_tahun_ajaran_logger
AFTER UPDATE ON public.tahun_ajaran
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_tahun_ajaran();


-- ----------------------------------------------------------------------------
-- 6. REGISTRASI SUPABASE REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profil_pesantren;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tahun_ajaran;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
EXCEPTION
    WHEN undefined_object THEN
        NULL;
END $$;

COMMIT;
