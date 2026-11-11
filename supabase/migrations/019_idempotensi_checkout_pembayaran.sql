-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 019: Penguatan Idempotensi Checkout Pembayaran & Normalisasi Nominal Konsisten
-- DRAF RANCANGAN UNTUK REVIEW (JANGAN DIJALANKAN KE SUPABASE CLOUD SECARA OTOMATIS)
--
-- Karakteristik Kunci:
-- 1. Idempotency Key WAJIB di level Database (Tidak ada DEFAULT NULL).
-- 2. Validasi format UUID v4 standar ditegakkan di dalam PL/pgSQL.
-- 3. Normalisasi nominal pembayaran konsisten (round 2 desimal) pada fingerprint,
--    validasi, perhitungan total, header transaksi, dan tabel alokasi pembayaran.
-- 4. Isolasi transaksi konkuren via transaction-scoped advisory lock.
-- 5. Menolak keras pemanggilan tanpa key, key tidak valid, atau jalur non-idempoten.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Penambahan Kolom dan Indeks Idempotensi pada public.transaksi_pembayaran
-- ----------------------------------------------------------------------------
ALTER TABLE public.transaksi_pembayaran
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.transaksi_pembayaran
ADD COLUMN IF NOT EXISTS payload_fingerprint TEXT;

-- Indeks unik parsial: Menjamin 1 idempotency_key hanya dapat disimpan 1 kali,
-- namun mengizinkan baris historis yang bernilai NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaksi_pembayaran_idempotency_key
ON public.transaksi_pembayaran(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transaksi_pembayaran_fingerprint
ON public.transaksi_pembayaran(payload_fingerprint)
WHERE payload_fingerprint IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Penggantian Signature RPC rpc_checkout_pembayaran_v2
--
-- Menghapus seluruh overload lama (6 parameter maupun 7 parameter ber-default NULL).
-- Menerapkan signature 7 parameter WAJIB tanpa DEFAULT NULL pada p_idempotency_key.
-- Hal ini menutup mutlak kemungkinan pemanggilan RPC tanpa idempotency key.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_checkout_pembayaran_v2(
    p_santri_id UUID,
    p_items JSONB, -- Array of { tagihan_id: UUID, nominal_bayar: NUMERIC }
    p_tanggal_transfer DATE,
    p_nama_pengirim TEXT,
    p_bank_pengirim TEXT,
    p_bukti_transfer_path TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_rekening RECORD;
    v_item JSONB;
    v_tagihan RECORD;
    v_total_nominal NUMERIC(15, 2) := 0;
    v_transaksi_id UUID;
    v_nomor_transaksi TEXT;
    v_status_awal public.status_transaksi;
    v_nominal_bayar NUMERIC(15, 2);
    v_tagihan_id UUID;
    v_seen_tagihan_ids UUID[] := '{}';
    v_pending_alokasi NUMERIC(15, 2) := 0;
    v_sisa_tersedia NUMERIC(15, 2) := 0;
    v_expired_trx RECORD;
    v_existing_trx RECORD;
    v_clean_key TEXT := NULLIF(trim(p_idempotency_key), '');
    v_norm_tanggal_transfer DATE;
    v_norm_nama_pengirim TEXT;
    v_norm_bank_pengirim TEXT;
    v_norm_bukti_path TEXT;
    v_canonical_items JSONB;
    v_canonical_payload JSONB;
    v_payload_fingerprint TEXT;
    v_calc_total NUMERIC(15, 2) := 0;
BEGIN
    -- 1. Validasi Keberadaan dan Format Idempotency Key (Wajib di level Database)
    IF v_clean_key IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Idempotency key wajib diisi dan tidak boleh kosong.';
    END IF;

    -- Validasi format UUID v4 standar secara ketat di dalam fungsi SQL
    IF v_clean_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Akses ditolak: Format Idempotency key tidak valid. Harus berupa UUID v4 standar.';
    END IF;

    -- 2. Validasi Autentikasi Pengguna
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Anda harus login terlebih dahulu.';
    END IF;

    -- 3. Validasi Role: Hanya Wali Santri aktif yang boleh melakukan checkout
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role IS NULL OR v_role != 'wali' THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya akun Wali Santri resmi yang dapat melakukan pembayaran tagihan.';
    END IF;

    -- 4. Validasi Kepemilikan Santri (Cegah bayar santri milik orang lain)
    IF NOT EXISTS (
        SELECT 1 FROM public.wali_santri
        WHERE user_id = v_user_id AND santri_id = p_santri_id
    ) THEN
        RAISE EXCEPTION 'Akses ditolak: Santri yang dipilih tidak terhubung dengan akun Anda.';
    END IF;

    -- 5. Validasi Kelengkapan Data Pembayaran Dasar
    IF p_nama_pengirim IS NULL OR length(trim(p_nama_pengirim)) = 0 THEN
        RAISE EXCEPTION 'Nama pemilik rekening pengirim wajib diisi.';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang pembayaran kosong atau tidak ada tagihan yang dipilih.';
    END IF;

    -- 6. Normalisasi Komprehensif Seluruh Parameter & Kalkulasi Payload Fingerprint
    -- Fingerprint mengikat seluruh informasi yang memengaruhi hasil transaksi:
    -- wali_user_id, santri_id, items (terurut ASC dan nominal dibulatkan 2 desimal),
    -- total_nominal, tanggal_transfer, nama_pengirim, bank_pengirim, dan bukti_transfer_path.
    v_norm_tanggal_transfer := COALESCE(p_tanggal_transfer, CURRENT_DATE);
    v_norm_nama_pengirim := trim(p_nama_pengirim);
    v_norm_bank_pengirim := COALESCE(NULLIF(trim(p_bank_pengirim), ''), 'Bank Transfer');
    v_norm_bukti_path := NULLIF(trim(p_bukti_transfer_path), '');

    -- Normalisasi daftar item:
    -- Setiap nominal_bayar dibulatkan secara ketat ke 2 desimal (round(..., 2)).
    -- Nominal tidak valid, nol, atau negatif ditolak.
    SELECT jsonb_agg(
        jsonb_build_object(
            'tagihan_id', (elem->>'tagihan_id')::UUID,
            'nominal_bayar', round((elem->>'nominal_bayar')::NUMERIC, 2)
        )
        ORDER BY (elem->>'tagihan_id')::UUID ASC
    )
    INTO v_canonical_items
    FROM jsonb_array_elements(p_items) AS elem;

    IF v_canonical_items IS NULL OR jsonb_array_length(v_canonical_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang pembayaran kosong atau tidak ada tagihan yang dipilih.';
    END IF;

    -- Hitung total dari nominal yang telah dinormalisasi 2 desimal
    SELECT COALESCE(SUM((elem->>'nominal_bayar')::NUMERIC), 0)
    INTO v_calc_total
    FROM jsonb_array_elements(v_canonical_items) AS elem;

    IF v_calc_total <= 0 THEN
        RAISE EXCEPTION 'Total nominal pembayaran tidak valid atau kurang dari sama dengan nol.';
    END IF;

    v_canonical_payload := jsonb_build_object(
        'wali_user_id', v_user_id,
        'santri_id', p_santri_id,
        'items', v_canonical_items,
        'total_nominal', v_calc_total,
        'tanggal_transfer', v_norm_tanggal_transfer::TEXT,
        'nama_pengirim', v_norm_nama_pengirim,
        'bank_pengirim', v_norm_bank_pengirim,
        'bukti_transfer_path', COALESCE(v_norm_bukti_path, '')
    );

    v_payload_fingerprint := md5(v_canonical_payload::TEXT);

    -- 7. PENCEGAHAN RACE CONDITION & PEMERIKSAAN IDEMPOTENSI
    -- Ambil Transaction-Level Advisory Lock dua integer:
    -- Argumen 1: Class ID namespace ('sipeta_checkout_idempotency')
    -- Argumen 2: Object ID hash dari clean key
    -- Lock ini otomatis dilepas saat transaksi selesai (COMMIT atau ROLLBACK)
    PERFORM pg_advisory_xact_lock(hashtext('sipeta_checkout_idempotency'), hashtext(v_clean_key));

    -- Periksa apakah transaksi dengan key ini sudah pernah berhasil diproses
    SELECT id, nomor_transaksi, total_nominal, status, wali_user_id, santri_id, bukti_transfer_path, payload_fingerprint
    INTO v_existing_trx
    FROM public.transaksi_pembayaran
    WHERE idempotency_key = v_clean_key;

    IF FOUND THEN
        -- Isolasi Akun: Tolak jika digunakan oleh akun wali yang berbeda
        IF v_existing_trx.wali_user_id != v_user_id THEN
            RAISE EXCEPTION 'Akses ditolak: Idempotency key sudah digunakan oleh akun wali lain.';
        END IF;

        -- Isolasi Santri: Tolak jika digunakan untuk santri yang berbeda
        IF v_existing_trx.santri_id != p_santri_id THEN
            RAISE EXCEPTION 'Akses ditolak: Idempotency key sudah digunakan untuk santri berbeda.';
        END IF;

        -- Validasi Integritas Payload Fingerprint:
        -- Jika key sama namun payload berbeda (nominal, daftar tagihan, tanggal, nama pengirim, atau bukti beda),
        -- tolak keras sebagai konflik integritas untuk mencegah data drift.
        IF v_existing_trx.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint THEN
            RAISE EXCEPTION 'Konflik Idempotensi: Idempotency key "%" sudah digunakan untuk transaksi pembayaran dengan rincian pembayaran yang berbeda.', v_clean_key;
        END IF;

        -- Idempotent Replay Sukses: Kembalikan transaksi yang telah tersimpan
        RETURN jsonb_build_object(
            'ok', true,
            'transaksi_id', v_existing_trx.id,
            'nomor_transaksi', v_existing_trx.nomor_transaksi,
            'total_nominal', v_existing_trx.total_nominal,
            'status', v_existing_trx.status,
            'bukti_transfer_path', v_existing_trx.bukti_transfer_path,
            'is_idempotent_replay', true,
            'message', 'Pengajuan pembayaran ' || v_existing_trx.nomor_transaksi || ' telah berhasil diproses sebelumnya.'
        );
    END IF;

    -- 8. Validasi Isolasi Path Bukti Transfer Storage (Mencegah manipulasi/pemalsuan path santri lain)
    IF v_norm_bukti_path IS NOT NULL THEN
        IF split_part(v_norm_bukti_path, '/', 1) != p_santri_id::TEXT THEN
            RAISE EXCEPTION 'Akses ditolak: Bukti transfer tidak valid atau tidak terisolasi dalam folder santri yang bersangkutan.';
        END IF;

        -- Validasi Keberadaan Objek di storage.objects wajib berjalan di Supabase Cloud
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'storage' AND table_name = 'objects'
        ) THEN
            RAISE EXCEPTION 'Layanan penyimpanan berkas (storage.objects) tidak tersedia untuk memverifikasi bukti transfer.';
        END IF;

        DECLARE
            v_file_exists BOOLEAN := false;
        BEGIN
            EXECUTE 'SELECT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = ''bukti-pembayaran'' AND name = $1)'
            INTO v_file_exists
            USING v_norm_bukti_path;

            IF NOT v_file_exists THEN
                RAISE EXCEPTION 'Berkas bukti transfer "%" tidak ditemukan pada penyimpanan pesantren (bucket bukti-pembayaran).', v_norm_bukti_path;
            END IF;
        END;
    END IF;

    -- 9. Ambil Rekening Resmi Pesantren
    SELECT id, nama_bank, kode_bank, nomor_rekening, atas_nama
    INTO v_rekening
    FROM public.rekening_pesantren
    WHERE is_active = true
    LIMIT 1;

    IF v_rekening IS NULL THEN
        RAISE EXCEPTION 'Rekening resmi pesantren belum dikonfigurasi atau tidak aktif.';
    END IF;

    -- 10. Rekonsiliasi Otomatis Transaksi MENUNGGU_TRANSFER yang Menggantung (> 24 Jam)
    -- Menggunakan SKIP LOCKED agar tidak mengganggu transaksi yang sedang diproses konkuren.
    FOR v_expired_trx IN
        SELECT id, nomor_transaksi, santri_id, wali_user_id, total_nominal
        FROM public.transaksi_pembayaran
        WHERE status = 'MENUNGGU_TRANSFER'
          AND created_at < now() - INTERVAL '24 hours'
        FOR UPDATE SKIP LOCKED
    LOOP
        UPDATE public.transaksi_pembayaran
        SET status = 'KEDALUWARSA'::public.status_transaksi,
            catatan_verifikasi = 'Batas waktu transfer 24 jam telah berakhir tanpa bukti pembayaran.',
            updated_at = now()
        WHERE id = v_expired_trx.id;

        INSERT INTO public.notifikasi (
            user_id, santri_id, jenis_notifikasi, judul, pesan, tautan
        ) VALUES (
            v_expired_trx.wali_user_id,
            v_expired_trx.santri_id,
            'PEMBAYARAN_DITOLAK',
            'Batas Waktu Pembayaran Berakhir',
            'Pengajuan pembayaran ' || v_expired_trx.nomor_transaksi || ' sebesar Rp ' || to_char(v_expired_trx.total_nominal, 'FM999,999,999') || ' telah kedaluwarsa karena tidak ada konfirmasi transfer dalam 24 jam.',
            '/pembayaran'
        );

        INSERT INTO public.audit_logs (
            user_id, user_role, aktivitas, jenis_objek, objek_id, data_sebelum, data_sesudah, alasan_perubahan
        ) VALUES (
            v_expired_trx.wali_user_id,
            'wali'::public.user_role,
            'TRANSAKSI_KEDALUWARSA_OTOMATIS',
            'transaksi_pembayaran',
            v_expired_trx.id::TEXT,
            jsonb_build_object('status', 'MENUNGGU_TRANSFER'),
            jsonb_build_object('status', 'KEDALUWARSA'),
            'Batas waktu transfer 24 jam terlampaui tanpa konfirmasi bukti'
        );
    END LOOP;

    -- 11. Validasi Setiap Tagihan dengan ROW LOCK menggunakan nominal_bayar yang telah dinormalisasi 2 desimal
    -- Mengurutkan berdasarkan tagihan_id (UUID ASC) secara konsisten untuk mencegah deadlock antartransaksi multi-tagihan
    FOR v_item IN
        SELECT elem
        FROM jsonb_array_elements(v_canonical_items) AS elem
    LOOP
        v_tagihan_id := (v_item->>'tagihan_id')::UUID;
        v_nominal_bayar := (v_item->>'nominal_bayar')::NUMERIC;

        IF v_nominal_bayar IS NULL OR v_nominal_bayar <= 0 THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk setiap tagihan harus lebih besar dari 0.';
        END IF;

        IF v_tagihan_id = ANY(v_seen_tagihan_ids) THEN
            RAISE EXCEPTION 'Tagihan duplikat terdeteksi dalam permohonan pembayaran (ID: %). Setiap tagihan hanya boleh dialokasikan satu kali per transaksi.', v_tagihan_id;
        END IF;
        v_seen_tagihan_ids := array_append(v_seen_tagihan_ids, v_tagihan_id);

        SELECT * INTO v_tagihan
        FROM public.tagihan
        WHERE id = v_tagihan_id AND santri_id = p_santri_id
        FOR UPDATE;

        IF v_tagihan IS NULL THEN
            RAISE EXCEPTION 'Tagihan dengan ID "%" tidak ditemukan untuk santri ini.', v_tagihan_id;
        END IF;

        IF v_tagihan.status IN ('LUNAS', 'DIBATALKAN') OR v_tagihan.sisa_tagihan <= 0 THEN
            RAISE EXCEPTION 'Tagihan "%" sudah lunas atau tidak aktif.', v_tagihan.judul_tagihan;
        END IF;

        -- Hitung total pengajuan yang sedang menunggu verifikasi/transfer untuk tagihan ini (Mencegah Over-Allocation Konkuren)
        SELECT COALESCE(SUM(ap.nominal_alokasi), 0)
        INTO v_pending_alokasi
        FROM public.alokasi_pembayaran ap
        JOIN public.transaksi_pembayaran tp ON tp.id = ap.transaksi_id
        WHERE ap.tagihan_id = v_tagihan_id
          AND tp.status IN ('MENUNGGU_VERIFIKASI', 'MENUNGGU_TRANSFER');

        v_sisa_tersedia := v_tagihan.sisa_tagihan - v_pending_alokasi;

        IF v_sisa_tersedia <= 0 THEN
            RAISE EXCEPTION 'Tagihan "%" saat ini memiliki pengajuan pembayaran sebesar Rp % yang sedang menunggu verifikasi Bendahara sehingga sisa tagihan telah terpenuhi sementara.',
                v_tagihan.judul_tagihan, v_pending_alokasi;
        END IF;

        IF v_nominal_bayar > v_sisa_tersedia THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk "%" (Rp %) melebihi sisa kewajiban yang dapat diajukan (Sisa Tagihan: Rp %, Sedang Menunggu Verifikasi: Rp %, Maksimal Pengajuan Baru: Rp %).',
                v_tagihan.judul_tagihan, v_nominal_bayar, v_tagihan.sisa_tagihan, v_pending_alokasi, v_sisa_tersedia;
        END IF;

        -- Validasi Kebijakan Cicilan Snapshot
        IF v_tagihan.kebijakan_cicilan_snapshot = 'TIDAK_BOLEH' AND v_nominal_bayar != v_sisa_tersedia THEN
            RAISE EXCEPTION 'Tagihan "%" memiliki kebijakan TIDAK_BOLEH dicicil. Pembayaran harus lunas sebesar Rp %.',
                v_tagihan.judul_tagihan, v_sisa_tersedia;
        END IF;

        IF v_tagihan.kebijakan_cicilan_snapshot = 'MINIMAL_NOMINAL' THEN
            IF v_sisa_tersedia >= COALESCE(v_tagihan.minimal_cicilan_snapshot, 0) THEN
                IF v_nominal_bayar < v_tagihan.minimal_cicilan_snapshot THEN
                    RAISE EXCEPTION 'Nominal cicilan untuk "%" (Rp %) kurang dari batas minimal cicilan (Rp %).',
                        v_tagihan.judul_tagihan, v_nominal_bayar, v_tagihan.minimal_cicilan_snapshot;
                END IF;
            ELSE
                -- Pelunasan sisa cicilan terakhir yang nominalnya di bawah batas minimal
                IF v_nominal_bayar != v_sisa_tersedia THEN
                    RAISE EXCEPTION 'Untuk pelunasan sisa akhir tagihan "%", pembayaran harus sebesar sisa yang tersedia (Rp %).',
                        v_tagihan.judul_tagihan, v_sisa_tersedia;
                END IF;
            END IF;
        END IF;

        v_total_nominal := v_total_nominal + v_nominal_bayar;
    END LOOP;

    IF v_total_nominal <= 0 THEN
        RAISE EXCEPTION 'Total nominal pembayaran tidak valid.';
    END IF;

    -- 12. Bentuk Nomor Transaksi dan Status Awal
    v_nomor_transaksi := 'TRX-BYR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::TEXT), 1, 6));

    v_status_awal := CASE
        WHEN v_norm_bukti_path IS NOT NULL AND length(v_norm_bukti_path) > 0
        THEN 'MENUNGGU_VERIFIKASI'::public.status_transaksi
        ELSE 'MENUNGGU_TRANSFER'::public.status_transaksi
    END;

    -- 13. Simpan Header Transaksi Pembayaran bersama Idempotency Key & Payload Fingerprint
    INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi,
        santri_id,
        wali_user_id,
        total_nominal,
        rekening_tujuan_snapshot,
        tanggal_transfer,
        nama_pengirim,
        bank_pengirim,
        bukti_transfer_path,
        status,
        idempotency_key,
        payload_fingerprint
    ) VALUES (
        v_nomor_transaksi,
        p_santri_id,
        v_user_id,
        v_total_nominal,
        jsonb_build_object(
            'nama_bank', v_rekening.nama_bank,
            'nomor_rekening', v_rekening.nomor_rekening,
            'atas_nama', v_rekening.atas_nama
        ),
        v_norm_tanggal_transfer,
        v_norm_nama_pengirim,
        v_norm_bank_pengirim,
        v_norm_bukti_path,
        v_status_awal,
        v_clean_key,
        v_payload_fingerprint
    ) RETURNING id INTO v_transaksi_id;

    -- 14. Simpan Alokasi Pembayaran menggunakan nilai normalisasi 2 desimal
    -- (Total alokasi dijamin sama persis dengan total nominal transaksi)
    FOR v_item IN
        SELECT elem
        FROM jsonb_array_elements(v_canonical_items) AS elem
    LOOP
        INSERT INTO public.alokasi_pembayaran (
            transaksi_id,
            tagihan_id,
            nominal_alokasi
        ) VALUES (
            v_transaksi_id,
            (v_item->>'tagihan_id')::UUID,
            (v_item->>'nominal_bayar')::NUMERIC
        );
    END LOOP;

    -- Verifikasi Konsistensi: Total transaksi harus sama persis dengan kalkulasi normalisasi
    IF v_total_nominal != v_calc_total THEN
        RAISE EXCEPTION 'Ketidakkonsistenan internal: Total transaksi (%) berbeda dengan total kalkulasi alokasi (%).', v_total_nominal, v_calc_total;
    END IF;

    -- 15. Hapus HANYA Tagihan yang Dibayar dari Keranjang Pembayaran
    DELETE FROM public.keranjang_pembayaran
    WHERE wali_user_id = v_user_id
      AND santri_id = p_santri_id
      AND tagihan_id = ANY(v_seen_tagihan_ids);

    -- 16. Catat Audit Log
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
        'CHECKOUT_PEMBAYARAN_RPC_V2',
        'transaksi_pembayaran',
        v_transaksi_id::TEXT,
        jsonb_build_object(
            'nomor_transaksi', v_nomor_transaksi,
            'total_nominal', v_total_nominal,
            'status', v_status_awal,
            'idempotency_key', v_clean_key,
            'payload_fingerprint', v_payload_fingerprint
        ),
        'Pengajuan pembayaran tagihan atomik oleh wali santri'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'transaksi_id', v_transaksi_id,
        'nomor_transaksi', v_nomor_transaksi,
        'total_nominal', v_total_nominal,
        'status', v_status_awal,
        'is_idempotent_replay', false,
        'message', 'Pengajuan pembayaran ' || v_nomor_transaksi || ' berhasil disimpan dan menunggu verifikasi Bendahara.'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Reset Izin Akses RPC & Refresh PostgREST Schema Cache
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Beritahu PostgREST agar segera memuat ulang schema cache tanpa menunggu restart daemon
NOTIFY pgrst, 'reload schema';
