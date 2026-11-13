-- ============================================================================
-- SIPETA MIGRATION 025: Realtime Enablement & Performance Composite Indexes
-- Modul: Transaksi Keuangan & Antrean Verifikasi Bendahara
-- ============================================================================

-- 1. Pastikan Replica Identity FULL agar payload realtime Supabase menyertakan
--    seluruh atribut baris untuk kemudahan filter dan verifikasi di sisi klien.
ALTER TABLE public.transaksi_pembayaran REPLICA IDENTITY FULL;
ALTER TABLE public.pengajuan_uang_saku REPLICA IDENTITY FULL;

-- 2. Tambahkan tabel transaksi_pembayaran dan pengajuan_uang_saku ke publication supabase_realtime
--    agar Postgres Logical Replication Engine menyiarkan perubahan INSERT/UPDATE/DELETE.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'transaksi_pembayaran'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.transaksi_pembayaran;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = 'pengajuan_uang_saku'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.pengajuan_uang_saku;
        END IF;
    END IF;
END $$;

-- 3. Indeks Komposit Terfokus untuk Kecepatan Kueri Antrean Bendahara
--    Mempercepat filter status = 'MENUNGGU_VERIFIKASI' dengan sorting created_at DESC
CREATE INDEX IF NOT EXISTS idx_transaksi_pembayaran_status_created 
ON public.transaksi_pembayaran(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pengajuan_uang_saku_status_created 
ON public.pengajuan_uang_saku(status, created_at DESC);

-- 4. Indeks Foreign Key untuk Alokasi Pembayaran
CREATE INDEX IF NOT EXISTS idx_alokasi_pembayaran_transaksi_id 
ON public.alokasi_pembayaran(transaksi_id);

CREATE INDEX IF NOT EXISTS idx_alokasi_pembayaran_tagihan_id 
ON public.alokasi_pembayaran(tagihan_id);

