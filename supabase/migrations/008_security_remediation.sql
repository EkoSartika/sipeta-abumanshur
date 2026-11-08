-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 008: Security Remediation & RLS Hardening
-- ============================================================================
-- Ringkasan Perbaikan:
-- 1. Temuan 1: Pengetatan RLS riwayat_perubahan_kedisiplinan (wali hanya dapat
--    membaca riwayat jika is_published_to_wali = true pada catatan induk).
-- 2. Temuan 2: Hardening target role RLS dari default {public} menjadi TO authenticated
--    pada seluruh 27 tabel operasional, dengan penambahan kebijakan TO anon eksklusif
--    untuk pengumuman publik yang terbit (is_published = true).
-- 3. Temuan 3 & 4: Rekonsiliasi & deduplikasi kebijakan Storage. Menghapus policy
--    redundant 'Storage Foto Penyerahan: upload eksklusif bendahara' karena hak upload
--    sudah tercakup penuh dalam kebijakan ALL 'Storage Foto Penyerahan: kelola'.
-- 4. Temuan 5: Otorisasi master data target_tahfidz dan master_kategori_pelanggaran
--    diselaraskan untuk Superadmin, Admin, dan Pengelola dengan role TO authenticated.
-- ============================================================================

-- ============================================================================
-- TRANSAKSI ATOMIK (BEGIN / COMMIT)
-- Menjamin kegagalan di tengah eksekusi tidak meninggalkan state parsial.
-- ============================================================================
BEGIN;

-- ============================================================================
-- BAGIAN 1: PEMBERSIHAN (DROP) KEBIJAKAN LAMA PADA SCHEMA PUBLIC
-- ============================================================================

-- 1. profiles
DROP POLICY IF EXISTS "Profiles: baca profil sendiri atau petugas internal" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: superadmin kelola semua akun" ON public.profiles;

-- 2. rekening_pesantren
DROP POLICY IF EXISTS "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif" ON public.rekening_pesantren;
DROP POLICY IF EXISTS "Rekening Pesantren: hanya superadmin yang dapat mengelola" ON public.rekening_pesantren;

-- 3. tahun_ajaran
DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;
DROP POLICY IF EXISTS "Master TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;

-- 4. kelas
DROP POLICY IF EXISTS "Master Kelas: baca" ON public.kelas;
DROP POLICY IF EXISTS "Master Kelas: kelola" ON public.kelas;

-- 5. kamar
DROP POLICY IF EXISTS "Master Kamar: baca" ON public.kamar;
DROP POLICY IF EXISTS "Master Kamar: kelola" ON public.kamar;

-- 6. santri
DROP POLICY IF EXISTS "Santri: petugas baca semua, wali HANYA baca santri yang terhubung" ON public.santri;
DROP POLICY IF EXISTS "Santri: admin & superadmin kelola data santri" ON public.santri;

-- 7. wali_santri
DROP POLICY IF EXISTS "Wali Santri: baca data sendiri atau admin/superadmin/bendahara" ON public.wali_santri;
DROP POLICY IF EXISTS "Wali Santri: admin & superadmin kelola" ON public.wali_santri;

-- 8. riwayat_penempatan_santri
DROP POLICY IF EXISTS "Riwayat Penempatan: baca oleh petugas atau wali terkait" ON public.riwayat_penempatan_santri;
DROP POLICY IF EXISTS "Riwayat Penempatan: admin & superadmin kelola" ON public.riwayat_penempatan_santri;

-- 9. jenis_pembayaran
DROP POLICY IF EXISTS "Jenis Pembayaran: baca untuk superadmin, admin, bendahara, wali" ON public.jenis_pembayaran;
DROP POLICY IF EXISTS "Jenis Pembayaran: kelola oleh admin & superadmin" ON public.jenis_pembayaran;

-- 10. tagihan
DROP POLICY IF EXISTS "Tagihan: petugas keuangan/admin baca semua, wali hanya baca santri miliknya" ON public.tagihan;
DROP POLICY IF EXISTS "Tagihan: admin & superadmin buat tagihan" ON public.tagihan;
DROP POLICY IF EXISTS "Tagihan: admin & superadmin ubah/sesuaikan tagihan" ON public.tagihan;

-- 11. riwayat_penyesuaian_tagihan
DROP POLICY IF EXISTS "Riwayat Penyesuaian Tagihan: baca untuk petugas admin dan bendahara" ON public.riwayat_penyesuaian_tagihan;
DROP POLICY IF EXISTS "Riwayat Penyesuaian Tagihan: catat oleh admin & superadmin" ON public.riwayat_penyesuaian_tagihan;

-- 12. keranjang_pembayaran
DROP POLICY IF EXISTS "Keranjang: wali hanya kelola keranjang santri miliknya" ON public.keranjang_pembayaran;

-- 13. transaksi_pembayaran
DROP POLICY IF EXISTS "Transaksi Pembayaran: baca untuk superadmin, admin, bendahara, atau wali pemilik" ON public.transaksi_pembayaran;

-- 14. alokasi_pembayaran
DROP POLICY IF EXISTS "Alokasi Pembayaran: baca sesuai akses transaksi" ON public.alokasi_pembayaran;

-- 15. saldo_uang_saku
DROP POLICY IF EXISTS "Saldo Uang Saku: baca oleh superadmin, bendahara, atau wali santri terkait" ON public.saldo_uang_saku;

-- 16. pengajuan_uang_saku
DROP POLICY IF EXISTS "Pengajuan Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik" ON public.pengajuan_uang_saku;
DROP POLICY IF EXISTS "Pengajuan Uang Saku: wali ajukan untuk santri miliknya" ON public.pengajuan_uang_saku;

-- 17. mutasi_uang_saku
DROP POLICY IF EXISTS "Mutasi Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik" ON public.mutasi_uang_saku;

-- 18. target_tahfidz
DROP POLICY IF EXISTS "Target Tahfidz: baca oleh akun aktif terautentikasi" ON public.target_tahfidz;
DROP POLICY IF EXISTS "Target Tahfidz: kelola oleh pengelola & superadmin" ON public.target_tahfidz;
DROP POLICY IF EXISTS "Target Tahfidz: kelola oleh pengelola, admin & superadmin" ON public.target_tahfidz;

-- 19. master_kategori_pelanggaran
DROP POLICY IF EXISTS "Master Kategori Pelanggaran: baca oleh akun aktif terautentikasi" ON public.master_kategori_pelanggaran;
DROP POLICY IF EXISTS "Master Kategori Pelanggaran: kelola oleh admin & superadmin" ON public.master_kategori_pelanggaran;
DROP POLICY IF EXISTS "Master Kategori Pelanggaran: kelola oleh pengelola, admin & superadmin" ON public.master_kategori_pelanggaran;

-- 20. perkembangan_mengaji
DROP POLICY IF EXISTS "Mengaji: baca oleh superadmin, admin, pengelola, atau wali pemilik" ON public.perkembangan_mengaji;
DROP POLICY IF EXISTS "Mengaji: kelola oleh pengelola & superadmin" ON public.perkembangan_mengaji;

-- 21. setoran_tahfidz
DROP POLICY IF EXISTS "Tahfidz: baca oleh superadmin, admin, pengelola, atau wali pemilik" ON public.setoran_tahfidz;
DROP POLICY IF EXISTS "Tahfidz: kelola oleh pengelola & superadmin" ON public.setoran_tahfidz;

-- 22. prestasi_santri
DROP POLICY IF EXISTS "Prestasi: baca oleh superadmin, admin, pengelola, atau wali pemilik" ON public.prestasi_santri;
DROP POLICY IF EXISTS "Prestasi: kelola oleh pengelola & superadmin" ON public.prestasi_santri;

-- 23. catatan_kedisiplinan
DROP POLICY IF EXISTS "Kedisiplinan: baca oleh superadmin, admin, pengelola, atau wali pemilik" ON public.catatan_kedisiplinan;
DROP POLICY IF EXISTS "Kedisiplinan: kelola oleh pengelola & superadmin" ON public.catatan_kedisiplinan;

-- 24. riwayat_perubahan_kedisiplinan
DROP POLICY IF EXISTS "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan" ON public.riwayat_perubahan_kedisiplinan;

-- 25. pengumuman
DROP POLICY IF EXISTS "Pengumuman: baca pengumuman terpublikasi" ON public.pengumuman;
DROP POLICY IF EXISTS "Pengumuman: baca oleh akun authenticated" ON public.pengumuman;
DROP POLICY IF EXISTS "Pengumuman: baca publik anon" ON public.pengumuman;
DROP POLICY IF EXISTS "Pengumuman: kelola oleh admin & superadmin" ON public.pengumuman;

-- 26. notifikasi
DROP POLICY IF EXISTS "Notifikasi: hanya pemilik akun yang dapat membaca dan menandai dibaca" ON public.notifikasi;
DROP POLICY IF EXISTS "Notifikasi: pemilik akun update is_read" ON public.notifikasi;

-- 27. audit_logs
DROP POLICY IF EXISTS "Audit Logs: HANYA Superadmin yang dapat melihat" ON public.audit_logs;


-- ============================================================================
-- BAGIAN 2: PENERAPAN KEBIJAKAN RLS HARDENED (TO authenticated / TO anon)
-- ============================================================================

-- 1. profiles
CREATE POLICY "Profiles: baca profil sendiri atau petugas internal"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola'));

CREATE POLICY "Profiles: superadmin kelola semua akun"
ON public.profiles FOR ALL
TO authenticated
USING (public.get_my_role() = 'superadmin')
WITH CHECK (public.get_my_role() = 'superadmin');

-- 2. rekening_pesantren
CREATE POLICY "Rekening Pesantren: akun aktif terdaftar dapat melihat rekening aktif"
ON public.rekening_pesantren FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali') AND is_active = true);

CREATE POLICY "Rekening Pesantren: hanya superadmin yang dapat mengelola"
ON public.rekening_pesantren FOR ALL
TO authenticated
USING (public.get_my_role() = 'superadmin')
WITH CHECK (public.get_my_role() = 'superadmin');

-- 3. tahun_ajaran
CREATE POLICY "Master TahunAjaran: baca oleh akun aktif berwenang"
ON public.tahun_ajaran FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master TahunAjaran: admin & superadmin kelola"
ON public.tahun_ajaran FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 4. kelas
CREATE POLICY "Master Kelas: baca"
ON public.kelas FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kelas: kelola"
ON public.kelas FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 5. kamar
CREATE POLICY "Master Kamar: baca"
ON public.kamar FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kamar: kelola"
ON public.kamar FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 6. santri
CREATE POLICY "Santri: petugas baca semua, wali HANYA baca santri yang terhubung"
ON public.santri FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola')
    OR (public.get_my_role() = 'wali' AND id = public.get_my_santri_id())
);

CREATE POLICY "Santri: admin & superadmin kelola data santri"
ON public.santri FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 7. wali_santri
CREATE POLICY "Wali Santri: baca data sendiri atau admin/superadmin/bendahara"
ON public.wali_santri FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
);

CREATE POLICY "Wali Santri: admin & superadmin kelola"
ON public.wali_santri FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 8. riwayat_penempatan_santri
CREATE POLICY "Riwayat Penempatan: baca oleh petugas atau wali terkait"
ON public.riwayat_penempatan_santri FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Riwayat Penempatan: admin & superadmin kelola"
ON public.riwayat_penempatan_santri FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 9. jenis_pembayaran
CREATE POLICY "Jenis Pembayaran: baca untuk superadmin, admin, bendahara, wali"
ON public.jenis_pembayaran FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'wali'));

CREATE POLICY "Jenis Pembayaran: kelola oleh admin & superadmin"
ON public.jenis_pembayaran FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 10. tagihan
CREATE POLICY "Tagihan: petugas keuangan/admin baca semua, wali hanya baca santri miliknya"
ON public.tagihan FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Tagihan: admin & superadmin buat tagihan"
ON public.tagihan FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Tagihan: admin & superadmin ubah/sesuaikan tagihan"
ON public.tagihan FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 11. riwayat_penyesuaian_tagihan
CREATE POLICY "Riwayat Penyesuaian Tagihan: baca untuk petugas admin dan bendahara"
ON public.riwayat_penyesuaian_tagihan FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara'));

CREATE POLICY "Riwayat Penyesuaian Tagihan: catat oleh admin & superadmin"
ON public.riwayat_penyesuaian_tagihan FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 12. keranjang_pembayaran
CREATE POLICY "Keranjang: wali hanya kelola keranjang santri miliknya"
ON public.keranjang_pembayaran FOR ALL
TO authenticated
USING (wali_user_id = auth.uid() AND santri_id = public.get_my_santri_id())
WITH CHECK (wali_user_id = auth.uid() AND santri_id = public.get_my_santri_id());

-- 13. transaksi_pembayaran
CREATE POLICY "Transaksi Pembayaran: baca untuk superadmin, admin, bendahara, atau wali pemilik"
ON public.transaksi_pembayaran FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND wali_user_id = auth.uid())
);

-- 14. alokasi_pembayaran
CREATE POLICY "Alokasi Pembayaran: baca sesuai akses transaksi"
ON public.alokasi_pembayaran FOR SELECT
TO authenticated
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

-- 15. saldo_uang_saku
CREATE POLICY "Saldo Uang Saku: baca oleh superadmin, bendahara, atau wali santri terkait"
ON public.saldo_uang_saku FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

-- 16. pengajuan_uang_saku
CREATE POLICY "Pengajuan Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik"
ON public.pengajuan_uang_saku FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND wali_user_id = auth.uid())
);

CREATE POLICY "Pengajuan Uang Saku: wali ajukan untuk santri miliknya"
ON public.pengajuan_uang_saku FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role() = 'wali'
    AND santri_id = public.get_my_santri_id()
    AND wali_user_id = auth.uid()
);

-- 17. mutasi_uang_saku
CREATE POLICY "Mutasi Uang Saku: baca oleh superadmin, bendahara, atau wali pemilik"
ON public.mutasi_uang_saku FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'bendahara')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

-- 18. target_tahfidz (Temuan 5)
CREATE POLICY "Target Tahfidz: baca oleh akun aktif terautentikasi"
ON public.target_tahfidz FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Target Tahfidz: kelola oleh pengelola, admin & superadmin"
ON public.target_tahfidz FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'));

-- 19. master_kategori_pelanggaran (Temuan 5)
CREATE POLICY "Master Kategori Pelanggaran: baca oleh akun aktif terautentikasi"
ON public.master_kategori_pelanggaran FOR SELECT
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali'));

CREATE POLICY "Master Kategori Pelanggaran: kelola oleh pengelola, admin & superadmin"
ON public.master_kategori_pelanggaran FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin', 'pengelola'));

-- 20. perkembangan_mengaji
CREATE POLICY "Mengaji: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.perkembangan_mengaji FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Mengaji: kelola oleh pengelola & superadmin"
ON public.perkembangan_mengaji FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

-- 21. setoran_tahfidz
CREATE POLICY "Tahfidz: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.setoran_tahfidz FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Tahfidz: kelola oleh pengelola & superadmin"
ON public.setoran_tahfidz FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

-- 22. prestasi_santri
CREATE POLICY "Prestasi: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.prestasi_santri FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id())
);

CREATE POLICY "Prestasi: kelola oleh pengelola & superadmin"
ON public.prestasi_santri FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

-- 23. catatan_kedisiplinan
CREATE POLICY "Kedisiplinan: baca oleh superadmin, admin, pengelola, atau wali pemilik"
ON public.catatan_kedisiplinan FOR SELECT
TO authenticated
USING (
    public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
    OR (public.get_my_role() = 'wali' AND santri_id = public.get_my_santri_id() AND is_published_to_wali = true)
);

CREATE POLICY "Kedisiplinan: kelola oleh pengelola & superadmin"
ON public.catatan_kedisiplinan FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'pengelola'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'pengelola'));

-- 24. riwayat_perubahan_kedisiplinan (Temuan 1 Remediasi Privasi Wali)
CREATE POLICY "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan"
ON public.riwayat_perubahan_kedisiplinan FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.catatan_kedisiplinan c
        WHERE c.id = riwayat_perubahan_kedisiplinan.catatan_kedisiplinan_id
        AND (
            public.get_my_role() IN ('superadmin', 'admin', 'pengelola')
            OR (
                public.get_my_role() = 'wali'
                AND c.santri_id = public.get_my_santri_id()
                AND c.is_published_to_wali = true
            )
        )
    )
);

-- 25. pengumuman (Temuan 2 Hak Akses Terisolasi Authenticated & Anon)
CREATE POLICY "Pengumuman: baca oleh akun authenticated"
ON public.pengumuman FOR SELECT
TO authenticated
USING (is_published = true OR public.get_my_role() IN ('superadmin', 'admin'));

CREATE POLICY "Pengumuman: baca publik anon"
ON public.pengumuman FOR SELECT
TO anon
USING (is_published = true);

CREATE POLICY "Pengumuman: kelola oleh admin & superadmin"
ON public.pengumuman FOR ALL
TO authenticated
USING (public.get_my_role() IN ('superadmin', 'admin'))
WITH CHECK (public.get_my_role() IN ('superadmin', 'admin'));

-- 26. notifikasi
CREATE POLICY "Notifikasi: hanya pemilik akun yang dapat membaca dan menandai dibaca"
ON public.notifikasi FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Notifikasi: pemilik akun update is_read"
ON public.notifikasi FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 27. audit_logs
CREATE POLICY "Audit Logs: HANYA Superadmin yang dapat melihat"
ON public.audit_logs FOR SELECT
TO authenticated
USING (public.get_my_role() = 'superadmin');


-- ============================================================================
-- BAGIAN 3: STORAGE DEDUPLIKASI & HARDENING (Temuan 3 & 4)
-- ============================================================================

-- Hapus duplikasi policy INSERT pada foto-penyerahan-saku (sudah terproteksi via ALL 'Storage Foto Penyerahan: kelola')
DROP POLICY IF EXISTS "Storage Foto Penyerahan: upload eksklusif bendahara" ON storage.objects;

COMMIT;
-- Selesai Migration 008.

