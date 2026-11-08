-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Seed Data: Master Data Operasional Pesantren
-- ============================================================================

-- 1. Rekening Resmi Tunggal Pesantren (Bab 2 & Bab 3.1 PRD)
-- CATATAN KEAMANAN & REMEDIASI C-01:
-- Nomor rekening placeholder/rekaan sengaja DIHAPUS dari seed data.
-- Sesuai kebijakan tata kelola keuangan, rekening resmi pesantren WAJIB dikonfirmasi
-- secara langsung oleh Yayasan / Bendahara Pesantren dan dikonfigurasikan oleh Superadmin
-- melalui menu 'Rekening Resmi Tunggal Pesantren' pada portal Superadmin setelah akun administratif aktif.
-- Sebelum rekening resmi aktif dan terverifikasi dikonfigurasi, sistem akan menahan instruksi transfer.

-- 2. Tahun Ajaran Aktif
INSERT INTO public.tahun_ajaran (
    id, nama, tanggal_mulai, tanggal_selesai, is_active
) VALUES (
    '20000000-0000-0000-0000-000000000001',
    '2026/2027',
    '2026-07-01',
    '2027-06-30',
    true
) ON CONFLICT (id) DO NOTHING;

-- 3. Master Kelas
INSERT INTO public.kelas (id, kode_kelas, nama_kelas, tingkat, wali_kelas, kapasitas) VALUES
    ('30000000-0000-0000-0000-000000000001', 'KLS-7A', 'Kelas VII-A (MTs Putra)', 7, 'Ustadz H. Fauzan Azima, Lc.', 32),
    ('30000000-0000-0000-0000-000000000002', 'KLS-8A', 'Kelas VIII-A (MTs Putri)', 8, 'Ustadzah Hj. Siti Maryam, S.Pd.I.', 32),
    ('30000000-0000-0000-0000-000000000003', 'KLS-10A', 'Kelas X-A (MA Takhasus)', 10, 'Ustadz Dr. Mahmud Syakir, M.Ag.', 28)
ON CONFLICT (id) DO NOTHING;

-- 4. Master Kamar Asrama
INSERT INTO public.kamar (id, kode_kamar, nama_kamar, gedung_asrama, jenis_asrama, musyrif, kapasitas) VALUES
    ('40000000-0000-0000-0000-000000000001', 'ASR-AB-01', 'Kamar Abu Bakar Ash-Shiddiq 01', 'Gedung Putra Al-Faruq', 'L', 'Ustadz Rizki Ramadhan', 16),
    ('40000000-0000-0000-0000-000000000002', 'ASR-UM-02', 'Kamar Umar bin Khattab 02', 'Gedung Putra Al-Faruq', 'L', 'Ustadz Salman Al-Farisi', 16),
    ('40000000-0000-0000-0000-000000000003', 'ASR-KH-01', 'Kamar Khadijah Al-Kubra 01', 'Gedung Putri Az-Zahra', 'P', 'Ustadzah Nabila Husna', 16)
ON CONFLICT (id) DO NOTHING;

-- 5. Master Kategori Pelanggaran Kedisiplinan (Bab 10 PRD)
INSERT INTO public.master_kategori_pelanggaran (id, kode_kategori, nama_kategori, tingkat_pelanggaran, poin_pembinaan, standar_tindak_lanjut) VALUES
    ('50000000-0000-0000-0000-000000000001', 'DIS-R01', 'Keterlambatan Jamaah / Apel Pagi', 'RINGAN', 5, 'Teguran lisan, istighfar & membaca Al-Matsurat tambahan'),
    ('50000000-0000-0000-0000-000000000002', 'DIS-R02', 'Kurang Rapi Kebersihan Lemari / Kamar', 'RINGAN', 5, 'Piket kerapian kamar di bawah bimbingan Musyrif'),
    ('50000000-0000-0000-0000-000000000003', 'DIS-S01', 'Tidak Menggunakan Bahasa Resmi (Arab/Inggris) pada Jam Wajib', 'SEDANG', 15, 'Menghafal 20 mufradat/vocabulary baru dan menyetorkannya ke bagian bahasa'),
    ('50000000-0000-0000-0000-000000000004', 'DIS-B01', 'Keluar Area Pesantren Tanpa Surat Izin Resmi', 'BERAT', 50, 'Pemanggilan orang tua/wali, surat perjanjian pembinaan khusus')
ON CONFLICT (id) DO NOTHING;

-- 6. Master Jenis Pembayaran dengan 3 Variasi Kebijakan Cicilan (Bab 5.1 & 5.2 PRD)
INSERT INTO public.jenis_pembayaran (
    id, kode_pembayaran, nama_pembayaran, deskripsi, nominal, kategori,
    tahun_ajaran_id, periode_pembayaran, tanggal_mulai, tanggal_jatuh_tempo,
    sasaran_santri, kebijakan_cicilan, minimal_nominal_cicilan, is_active
) VALUES
    (
        '60000000-0000-0000-0000-000000000001',
        'SPP-NOV-2026',
        'Syahriyah (SPP & Asrama) November 2026',
        'Biaya pendidikan, asrama, dan pembinaan bulanan santri periode November 2026',
        850000,
        'SPP Bulanan',
        '20000000-0000-0000-0000-000000000001',
        'Bulanan',
        '2026-11-01',
        '2026-11-15',
        'SEMUA',
        'TIDAK_BOLEH',
        NULL,
        true
    ),
    (
        '60000000-0000-0000-0000-000000000002',
        'MKN-NOV-2026',
        'Uang Makan & Konsumsi Santri November 2026',
        'Layanan makan 3x sehari dan nutrisi santri periode November 2026',
        650000,
        'Uang Makan',
        '20000000-0000-0000-0000-000000000001',
        'Bulanan',
        '2026-11-01',
        '2026-11-15',
        'SEMUA',
        'MINIMAL_NOMINAL',
        300000,
        true
    ),
    (
        '60000000-0000-0000-0000-000000000003',
        'KEG-RIHLAH-2026',
        'Kegiatan Rihlah Ilmiah & Mukhayyam Al-Quran',
        'Biaya kegiatan tahunan Rihlah Ilmiah dan Karantina Tahfidz Semester Ganjil',
        1200000,
        'Kegiatan Pesantren',
        '20000000-0000-0000-0000-000000000001',
        'Semester',
        '2026-10-01',
        '2026-12-10',
        'SEMUA',
        'MINIMAL_NOMINAL',
        400000,
        true
    ),
    (
        '60000000-0000-0000-0000-000000000004',
        'SRG-KITAB-2026',
        'Paket Kitab Turats & Seragam Kepesantrenan',
        'Paket kitab kuning, mushaf tahfidz standar Pojok, dan atribut seragam harian',
        950000,
        'Seragam & Kitab',
        '20000000-0000-0000-0000-000000000001',
        'Tahunan',
        '2026-07-01',
        '2026-12-31',
        'SEMUA',
        'BEBAS',
        NULL,
        true
    )
ON CONFLICT (id) DO NOTHING;

