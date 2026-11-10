-- ============================================================================
-- SIPETA MIGRATION 015: TABEL PROFIL PESANTREN & HAK AKSES TATA USAHA (TU)
-- Pondok Pesantren Modern Abu Manshur — Cirebon
-- Dokumen Migration: Penyimpanan Permanen Profil Lembaga, NSPP/NPSN, Alamat,
-- Kontak Resmi, serta Pengaturan Tahun Ajaran Aktif oleh Bagian Tata Usaha (TU)
-- Status: SIAP DITINJAU (TIDAK DIJALANKAN OTOMATIS)
-- ============================================================================

BEGIN;

-- 1. Buat Tabel public.profil_pesantren jika belum ada
CREATE TABLE IF NOT EXISTS public.profil_pesantren (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Trigger updated_at
DROP TRIGGER IF EXISTS trg_profil_pesantren_updated_at ON public.profil_pesantren;
CREATE TRIGGER trg_profil_pesantren_updated_at
BEFORE UPDATE ON public.profil_pesantren
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Inisialisasi Data Default jika tabel masih kosong
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

-- 4. Aktifkan RLS
ALTER TABLE public.profil_pesantren ENABLE ROW LEVEL SECURITY;

-- 5. Kebijakan RLS: Baca publik/semua pengguna terotentikasi
DROP POLICY IF EXISTS "Profil Pesantren: dapat dibaca oleh seluruh pengguna" ON public.profil_pesantren;
CREATE POLICY "Profil Pesantren: dapat dibaca oleh seluruh pengguna"
ON public.profil_pesantren FOR SELECT
TO anon, authenticated
USING (true);

-- 6. Kebijakan RLS: Tata Usaha (TU), Admin/Pengasuh, dan Superadmin berwenang mengelola
DROP POLICY IF EXISTS "Profil Pesantren: dapat dikelola oleh TU, Admin, dan Superadmin" ON public.profil_pesantren;
CREATE POLICY "Profil Pesantren: dapat dikelola oleh TU, Admin, dan Superadmin"
ON public.profil_pesantren FOR ALL
TO authenticated
USING (public.get_my_role() IN ('tu', 'admin', 'superadmin'))
WITH CHECK (public.get_my_role() IN ('tu', 'admin', 'superadmin'));

-- 7. Pastikan policy pada tahun_ajaran mengizinkan TU untuk memperbarui status is_active
DROP POLICY IF EXISTS "Master TahunAjaran: TU kelola status aktif" ON public.tahun_ajaran;
CREATE POLICY "Master TahunAjaran: TU kelola status aktif"
ON public.tahun_ajaran FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'tu'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'tu'));

COMMIT;

