-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0007: Row Level Security (RLS) & Private Storage Policies (Bab 15 PRD)
-- ============================================================================

-- 1. Aktifkan RLS pada SELURUH tabel
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rekening_pesantren ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahun_ajaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kamar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wali_santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_penempatan_santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jenis_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tagihan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_penyesuaian_tagihan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keranjang_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alokasi_pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saldo_uang_saku ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengajuan_uang_saku ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutasi_uang_saku ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perkembangan_mengaji ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_tahfidz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setoran_tahfidz ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestasi_santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_kategori_pelanggaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catatan_kedisiplinan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_perubahan_kedisiplinan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengumuman ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifikasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. Kebijakan RLS: profiles & Master Data Penempatan
-- ============================================================================

CREATE POLICY "Profiles: baca profil sendiri atau petugas internal"
ON public.profiles FOR SELECT
USING (id = auth.uid() OR public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola'));

CREATE POLICY "Profiles: superadmin kelola semua akun"
ON public.profiles FOR ALL
USING (public.get_my_role() = 'superadmin')
WITH CHECK (public.get_my_role() = 'superadmin');

CREATE POLICY "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif"
ON public.rekening_pesantren FOR SELECT
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali') AND is_active = true);

CREATE POLICY "Rekening Pesantren: hanya superadmin yang dapat mengelola"
ON public.rekening_pesantren FOR ALL
USING (public.get_my_role() = 'superadmin')
WITH CHECK (public.get_my_role() = 'superadmin');

CREATE POLICY "Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang"
ON public.tahun_ajaran FOR SELECT 
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kelas: baca" 
ON public.kelas FOR SELECT 
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kamar: baca" 
ON public.kamar FOR SELECT 
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola"
ON public.tahun_ajaran FOR ALL USING (public.get_my_role() IN ('superadmin', 'admin'));
CREATE POLICY "Master Kelas: kelola" ON public.kelas FOR ALL USING (public.get_my_role() IN ('superadmin', 'admin'));
CREATE POLICY "Master Kamar: kelola" ON public.kamar FOR ALL USING (public.get_my_role() IN ('superadmin', 'admin'));

-- ============================================================================
-- 3. Kebijakan RLS: Isolasi Data Santri & Wali (Proteksi Lintas Santri Bab 15.4 & 15.13)
-- ============================================================================

CREATE POLICY "Santri: petugas baca semua, wali HANYA baca santri yang terhubung"
ON public.santri FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola')
    OR (public.get_my_role() = 'wali' AND id = public.get_my_santri_id())
);

CREATE POLICY "Santri: admin & superadmin kelola data santri"
ON public.santri FOR ALL
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Wali Santri: baca data sendiri atau admin/superadmin/bendahara"
ON public.wali_santri FOR SELECT
USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
);

CREATE POLICY "Wali Santri: admin & superadmin kelola"
ON public.wali_santri FOR ALL
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Riwayat Penempatan: baca oleh petugas atau wali terkait"
ON public.riwayat_penempatan_santri FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Riwayat Penempatan: admin & superadmin kelola"
ON public.riwayat_penempatan_santri FOR INSERT
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- ============================================================================
-- 4. Kebijakan RLS: Modul Pembayaran (Pengelola TIDAK punya akses ke rincian keuangan - Bab 3.4)
-- ============================================================================

CREATE POLICY "Jenis Pembayaran: baca untuk superadmin, admin, bendahara, wali"
ON public.jenis_pembayaran FOR SELECT
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'wali'));

CREATE POLICY "Jenis Pembayaran: kelola oleh admin & superadmin"
ON public.jenis_pembayaran FOR ALL
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Tagihan: petugas keuangan/admin baca semua, wali hanya baca santri miliknya"
ON public.tagihan FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Tagihan: admin & superadmin buat tagihan"
ON public.tagihan FOR INSERT
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Tagihan: admin & superadmin ubah/sesuaikan tagihan"
ON public.tagihan FOR UPDATE
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Riwayat Penyesuaian Tagihan: baca untuk petugas admin dan bendahara"
ON public.riwayat_penyesuaian_tagihan FOR SELECT
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara'));

CREATE POLICY "Riwayat Penyesuaian Tagihan: catat oleh admin & superadmin"
ON public.riwayat_penyesuaian_tagihan FOR INSERT
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Keranjang: wali hanya kelola keranjang santri miliknya"
ON public.keranjang_pembayaran FOR ALL
USING (wali_user_id = auth.uid() AND santri_id = public.get_my_santri_id())
WITH CHECK (wali_user_id = auth.uid() AND santri_id = public.get_my_santri_id());

CREATE POLICY "Transaksi Pembayaran: baca untuk superadmin, admin, bendahara, atau wali pemilik"
ON public.transaksi_pembayaran FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND wali_user_id = auth.uid())
);

CREATE POLICY "Alokasi Pembayaran: baca sesuai akses transaksi"
ON public.alokasi_pembayaran FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.transaksi_pembayaran t
        WHERE t.id = alokasi_pembayaran.transaksi_id
        AND (
            public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
            OR (public.get_my_role() = 'wali' AND t.santri_id = public.get_my_santri_id())
        )
    )
);

-- ============================================================================
-- 5. Kebijakan RLS: Modul Uang Saku (Hanya Superadmin, Bendahara, dan Wali pemilik santri)
-- ============================================================================

CREATE POLICY "Saldo Uang Saku: baca oleh superadmin, bendahara, atau wali santri terkait"
ON public.saldo_uang_saku FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Pengajuan Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik"
ON public.pengajuan_uang_saku FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND wali_user_id = auth.uid())
);

CREATE POLICY "Pengajuan Uang Saku: wali ajukan untuk santri miliknya"
ON public.pengajuan_uang_saku FOR INSERT
WITH CHECK (
    public.get_my_role() = 'wali'
    AND santri_id = public.get_my_santri_id()
    AND wali_user_id = auth.uid()
);

CREATE POLICY "Mutasi Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik"
ON public.mutasi_uang_saku FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

-- ============================================================================
-- 6. Kebijakan RLS: Modul Kepesantrenan (Mengaji, Tahfidz, Prestasi, Kedisiplinan)
-- ============================================================================

CREATE POLICY "Target Tahfidz: baca oleh akun aktif terautentikasi"
ON public.target_tahfidz FOR SELECT
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Target Tahfidz: kelola oleh pengelola & superadmin"
ON public.target_tahfidz FOR ALL
USING (public.get_my_role() IN ('superadmin', 'pengelola', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola', 'admin'));

CREATE POLICY "Master Kategori Pelanggaran: baca oleh akun aktif terautentikasi"
ON public.master_kategori_pelanggaran FOR SELECT
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kategori Pelanggaran: kelola oleh admin & superadmin"
ON public.master_kategori_pelanggaran FOR ALL
USING (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'));

CREATE POLICY "Mengaji: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.perkembangan_mengaji FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Mengaji: kelola oleh pengelola & superadmin"
ON public.perkembangan_mengaji FOR ALL
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

CREATE POLICY "Tahfidz: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.setoran_tahfidz FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Tahfidz: kelola oleh pengelola & superadmin"
ON public.setoran_tahfidz FOR ALL
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

CREATE POLICY "Prestasi: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.prestasi_santri FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Prestasi: kelola oleh pengelola & superadmin"
ON public.prestasi_santri FOR ALL
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

CREATE POLICY "Kedisiplinan: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.catatan_kedisiplinan FOR SELECT
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND is_published_to_wali = true)
);

CREATE POLICY "Kedisiplinan: kelola oleh pengelola & superadmin"
ON public.catatan_kedisiplinan FOR ALL
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

CREATE POLICY "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan"
ON public.riwayat_perubahan_kedisiplinan FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.catatan_kedisiplinan c
        WHERE c.id = riwayat_perubahan_kedisiplinan.catatan_kedisiplinan_id
        AND (
            public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
            OR (public.get_my_role() = 'wali' AND c.santri_id = public.get_my_santri_id())
        )
    )
);

-- ============================================================================
-- 7. Kebijakan RLS: Pengumuman, Notifikasi, & Audit Log
-- ============================================================================

CREATE POLICY "Pengumuman: baca pengumuman terpublikasi"
ON public.pengumuman FOR SELECT
USING (is_published = true OR public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Pengumuman: kelola oleh admin & superadmin"
ON public.pengumuman FOR ALL
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Notifikasi: hanya pemilik akun yang dapat membaca dan menandai dibaca"
ON public.notifikasi FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Notifikasi: pemilik akun update is_read"
ON public.notifikasi FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Audit Logs: HANYA Superadmin yang dapat melihat"
ON public.audit_logs FOR SELECT
USING (public.get_my_role() = 'superadmin');

-- ============================================================================
-- 8. Private Storage Buckets Configuration & Storage Policies (Bab 15.5 & 15.6 PRD)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('bukti-pembayaran', 'bukti-pembayaran', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ('bukti-uang-saku', 'bukti-uang-saku', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    ('foto-penyerahan-saku', 'foto-penyerahan-saku', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('dokumentasi-kepesantrenan', 'dokumentasi-kepesantrenan', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Kebijakan Akses Objek Penyimpanan (storage.objects)
-- REMEDIASI H-01: Isolasi Folder per Santri (split_part(name, '/', 1) = santri_id)
-- Mencegah Wali A mengakses, mengunggah, atau memanipulasi bukti dokumen milik Wali B.

-- a. Bukti Pembayaran
CREATE POLICY "Storage Bukti Pembayaran: upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'bukti-pembayaran'
    AND (
        public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Pembayaran: baca"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'bukti-pembayaran'
    AND (
        public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Pembayaran: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'bukti-pembayaran'
    AND (
        public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
)
WITH CHECK (
    bucket_id = 'bukti-pembayaran'
    AND (
        public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Pembayaran: delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'bukti-pembayaran'
    AND (
        public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

-- b. Bukti Uang Saku
CREATE POLICY "Storage Bukti Uang Saku: upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'bukti-uang-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Uang Saku: baca"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'bukti-uang-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Uang Saku: update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'bukti-uang-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
)
WITH CHECK (
    bucket_id = 'bukti-uang-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Bukti Uang Saku: delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'bukti-uang-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

-- c. Foto Penyerahan Uang Saku (Eksklusif Bendahara Upload, Wali Hanya Baca Santri Terkait)
CREATE POLICY "Storage Foto Penyerahan: upload eksklusif bendahara"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'foto-penyerahan-saku'
    AND public.get_my_role() IN ('bendahara', 'superadmin')
);

CREATE POLICY "Storage Foto Penyerahan: baca"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'foto-penyerahan-saku'
    AND (
        public.get_my_role() IN ('superadmin', 'bendahara')
        OR (public.get_my_role() = 'wali' AND split_part(name, '/', 1) = public.get_my_santri_id()::text)
    )
);

CREATE POLICY "Storage Foto Penyerahan: kelola"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'foto-penyerahan-saku'
    AND public.get_my_role() IN ('bendahara', 'superadmin')
)
WITH CHECK (
    bucket_id = 'foto-penyerahan-saku'
    AND public.get_my_role() IN ('bendahara', 'superadmin')
);

-- d. Dokumentasi Kepesantrenan (Asatidz/Pengelola Kelola, Seluruh Akun Aktif Baca)
CREATE POLICY "Storage Kepesantrenan: upload dan kelola"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'dokumentasi-kepesantrenan'
    AND public.get_my_role() IN ('pengelola', 'superadmin', 'admin')
)
WITH CHECK (
    bucket_id = 'dokumentasi-kepesantrenan'
    AND public.get_my_role() IN ('pengelola', 'superadmin', 'admin')
);

CREATE POLICY "Storage Kepesantrenan: baca oleh akun aktif"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'dokumentasi-kepesantrenan'
    AND public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali')
);

-- ============================================================================
-- 4. GRANT & REVOKE PERMISSIONS SECURING SCHEMA & FUNCTIONS (Bab 15.3 PRD)
-- Menjamin Function Privileges selaras dengan Row Level Security (RLS)
-- REMEDIASI M-01: Cabut izin SELECT pada rekening_pesantren dari publik/anon
-- ============================================================================

-- Berikan hak akses USAGE pada skema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Berikan hak akses tabel operasional yang disaring oleh RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- REMEDIASI M-01: Cabut izin rekening_pesantren ke anon, hanya pengumuman publik yang dibuka
REVOKE SELECT ON public.rekening_pesantren FROM anon, PUBLIC;
GRANT SELECT ON public.pengumuman TO anon;

-- Cabut seluruh hak eksekusi default function dari PUBLIC
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Berikan hak eksekusi function helper identitas kepada authenticated & anon
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_santri_id() TO anon, authenticated, service_role;

-- Berikan hak eksekusi RPC transaksi kepada authenticated (dibatasi wewenang internal per role)
GRANT EXECUTE ON FUNCTION public.rpc_checkout_pembayaran(DATE, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_unggah_bukti_transfer_pembayaran(UUID, DATE, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verifikasi_pembayaran(UUID, public.status_transaksi, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_verifikasi_topup_uang_saku(UUID, public.status_transaksi, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_catat_penyerahan_uang_saku(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_koreksi_ledger_uang_saku(UUID, public.jenis_mutasi_saku, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_penyesuaian_tagihan(UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated, service_role;

