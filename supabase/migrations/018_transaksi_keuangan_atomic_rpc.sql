-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 018: Rancangan Atomic PostgreSQL RPCs untuk Transaksi Keuangan
-- DRAF UNTUK REVIEW SAJA (JANGAN DIJALANKAN KE SUPABASE CLOUD)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC Checkout Pembayaran Tagihan Atomik (ACID Compliant)
-- Mengunci baris tagihan (FOR UPDATE), menyisipkan transaksi dan seluruh alokasi
-- dalam 1 transaksi database, menghapus keranjang, dan mencatat audit log.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_checkout_pembayaran_v2(
    p_santri_id UUID,
    p_items JSONB, -- Array of { tagihan_id: UUID, nominal_bayar: NUMERIC }
    p_tanggal_transfer DATE DEFAULT CURRENT_DATE,
    p_nama_pengirim TEXT DEFAULT NULL,
    p_bank_pengirim TEXT DEFAULT 'Bank Transfer',
    p_bukti_transfer_path TEXT DEFAULT NULL
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
BEGIN
    -- 1. Validasi Autentikasi Pengguna
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Anda harus login terlebih dahulu.';
    END IF;

    -- 2. Validasi Role: Hanya Wali Santri aktif yang boleh melakukan checkout
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role IS NULL OR v_role != 'wali' THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya akun Wali Santri resmi yang dapat melakukan pembayaran tagihan.';
    END IF;

    -- 3. Validasi Kepemilikan Santri (Cegah bayar santri orang lain)
    IF NOT EXISTS (
        SELECT 1 FROM public.wali_santri
        WHERE user_id = v_user_id AND santri_id = p_santri_id
    ) THEN
        RAISE EXCEPTION 'Akses ditolak: Santri yang dipilih tidak terhubung dengan akun Anda.';
    END IF;

    -- 4. Validasi Kelengkapan Data Pembayaran
    IF p_nama_pengirim IS NULL OR length(trim(p_nama_pengirim)) = 0 THEN
        RAISE EXCEPTION 'Nama pemilik rekening pengirim wajib diisi.';
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Keranjang pembayaran kosong atau tidak ada tagihan yang dipilih.';
    END IF;

    -- 5. Ambil Rekening Resmi Pesantren
    SELECT id, nama_bank, kode_bank, nomor_rekening, atas_nama
    INTO v_rekening
    FROM public.rekening_pesantren
    WHERE is_active = true
    LIMIT 1;

    IF v_rekening IS NULL THEN
        RAISE EXCEPTION 'Rekening resmi pesantren belum dikonfigurasi atau tidak aktif.';
    END IF;

    -- 6. Validasi Setiap Tagihan dengan ROW LOCK (FOR UPDATE)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_tagihan_id := (v_item->>'tagihan_id')::UUID;
        v_nominal_bayar := (v_item->>'nominal_bayar')::NUMERIC;

        IF v_nominal_bayar IS NULL OR v_nominal_bayar <= 0 THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk setiap tagihan harus lebih besar dari 0.';
        END IF;

        -- Kunci baris tagihan agar tidak terjadi perubahan saldo bersamaan
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

        IF v_nominal_bayar > v_tagihan.sisa_tagihan THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk "%" (Rp %) melebihi sisa kewajiban (Rp %).',
                v_tagihan.judul_tagihan, v_nominal_bayar, v_tagihan.sisa_tagihan;
        END IF;

        -- Validasi Kebijakan Cicilan Snapshot
        IF v_tagihan.kebijakan_cicilan_snapshot = 'TIDAK_BOLEH' AND v_nominal_bayar != v_tagihan.sisa_tagihan THEN
            RAISE EXCEPTION 'Tagihan "%" tidak dapat dicicil dan harus dibayar penuh sebesar Rp %.',
                v_tagihan.judul_tagihan, v_tagihan.sisa_tagihan;
        END IF;

        IF v_tagihan.kebijakan_cicilan_snapshot = 'MINIMAL_NOMINAL'
           AND v_nominal_bayar < v_tagihan.sisa_tagihan
           AND v_nominal_bayar < COALESCE(v_tagihan.minimal_cicilan_snapshot, 0) THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk "%" kurang dari batas minimal cicilan (Rp %).',
                v_tagihan.judul_tagihan, v_tagihan.minimal_cicilan_snapshot;
        END IF;

        v_total_nominal := v_total_nominal + v_nominal_bayar;
    END LOOP;

    IF v_total_nominal <= 0 THEN
        RAISE EXCEPTION 'Total nominal pembayaran tidak valid.';
    END IF;

    -- 7. Bentuk Nomor Transaksi dan Status Awal
    v_nomor_transaksi := 'TRX-BYR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));
    v_status_awal := CASE
        WHEN p_bukti_transfer_path IS NOT NULL AND length(trim(p_bukti_transfer_path)) > 0
        THEN 'MENUNGGU_VERIFIKASI'::public.status_transaksi
        ELSE 'MENUNGGU_TRANSFER'::public.status_transaksi
    END;

    -- 8. INSERT Header Transaksi Pembayaran
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
        status
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
        p_tanggal_transfer,
        trim(p_nama_pengirim),
        trim(p_bank_pengirim),
        p_bukti_transfer_path,
        v_status_awal
    ) RETURNING id INTO v_transaksi_id;

    -- 9. INSERT Rincian Alokasi Tagihan
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
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

    -- 10. Hapus Tagihan Terkait dari Keranjang Pembayaran
    DELETE FROM public.keranjang_pembayaran
    WHERE wali_user_id = v_user_id AND santri_id = p_santri_id;

    -- 11. Catat Audit Log
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
        v_transaksi_id::text,
        jsonb_build_object(
            'nomor_transaksi', v_nomor_transaksi,
            'total_nominal', v_total_nominal,
            'status', v_status_awal
        ),
        'Pengajuan pembayaran tagihan atomik oleh wali santri'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'transaksi_id', v_transaksi_id,
        'nomor_transaksi', v_nomor_transaksi,
        'total_nominal', v_total_nominal,
        'status', v_status_awal,
        'message', 'Transaksi pembayaran berhasil dibuat secara atomik dan tersimpan permanen.'
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. RPC Verifikasi Pembayaran Atomik oleh Bendahara (ACID Compliant)
-- Mengunci baris transaksi pembayaran dan seluruh tagihan terkait, memperbarui
-- total_terbayar dan status tagihan, serta mencegah verifikasi ganda.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_verifikasi_pembayaran_v2(
    p_transaksi_id UUID,
    p_keputusan public.status_transaksi, -- 'DISETUJUI' atau 'DITOLAK'
    p_catatan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_trx RECORD;
    v_alokasi RECORD;
    v_tagihan RECORD;
    v_total_terbayar_baru NUMERIC(15, 2);
    v_status_tagihan_baru public.status_tagihan;
    v_profile_name TEXT;
BEGIN
    -- 1. Validasi Autentikasi Pengguna
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Anda harus login terlebih dahulu.';
    END IF;

    -- 2. Validasi Role: Hanya Bendahara dan Superadmin yang berwenang
    SELECT role, nama_lengkap INTO v_role, v_profile_name
    FROM public.profiles
    WHERE id = v_user_id AND is_active = true;

    IF v_role IS NULL OR v_role NOT IN ('bendahara', 'superadmin') THEN
        RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren atau Superadmin yang berwenang memverifikasi pembayaran.';
    END IF;

    -- 3. Validasi Parameter Keputusan
    IF p_keputusan NOT IN ('DISETUJUI', 'DITOLAK') THEN
        RAISE EXCEPTION 'Keputusan verifikasi harus bernilai DISETUJUI atau DITOLAK.';
    END IF;

    IF p_keputusan = 'DITOLAK' AND (p_catatan IS NULL OR length(trim(p_catatan)) < 3) THEN
        RAISE EXCEPTION 'Alasan penolakan verifikasi wajib diisi minimal 3 karakter.';
    END IF;

    -- 4. Kunci Baris Transaksi (FOR UPDATE) untuk Mencegah Double Verification / Race Condition
    SELECT * INTO v_trx
    FROM public.transaksi_pembayaran
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF v_trx IS NULL THEN
        RAISE EXCEPTION 'Transaksi pembayaran dengan ID "%" tidak ditemukan.', p_transaksi_id;
    END IF;

    IF v_trx.status != 'MENUNGGU_VERIFIKASI' THEN
        RAISE EXCEPTION 'Transaksi % sudah diproses sebelumnya (status saat ini: %).', v_trx.nomor_transaksi, v_trx.status;
    END IF;

    -- 5. Jika Disetujui, Perbarui Seluruh Tagihan yang Dialokasikan
    IF p_keputusan = 'DISETUJUI' THEN
        FOR v_alokasi IN
            SELECT * FROM public.alokasi_pembayaran
            WHERE transaksi_id = p_transaksi_id
        LOOP
            -- Kunci baris tagihan
            SELECT * INTO v_tagihan
            FROM public.tagihan
            WHERE id = v_alokasi.tagihan_id
            FOR UPDATE;

            IF v_tagihan IS NULL THEN
                RAISE EXCEPTION 'Tagihan dengan ID "%" tidak ditemukan.', v_alokasi.tagihan_id;
            END IF;

            IF v_tagihan.sisa_tagihan < v_alokasi.nominal_alokasi THEN
                RAISE EXCEPTION 'Nominal alokasi (Rp %) melebihi sisa tagihan "%" (Rp %).',
                    v_alokasi.nominal_alokasi, v_tagihan.judul_tagihan, v_tagihan.sisa_tagihan;
            END IF;

            v_total_terbayar_baru := v_tagihan.total_terbayar + v_alokasi.nominal_alokasi;

            -- Karena sisa_tagihan adalah GENERATED ALWAYS STORED, kita hitung status baru berdasarkan total_terbayar baru
            IF (v_tagihan.nominal_awal + v_tagihan.nominal_penyesuaian - v_total_terbayar_baru) <= 0 THEN
                v_status_tagihan_baru := 'LUNAS'::public.status_tagihan;
            ELSE
                v_status_tagihan_baru := 'DIBAYAR_SEBAGIAN'::public.status_tagihan;
            END IF;

            UPDATE public.tagihan
            SET total_terbayar = v_total_terbayar_baru,
                status = v_status_tagihan_baru,
                updated_at = now()
            WHERE id = v_tagihan.id;
        END LOOP;
    END IF;

    -- 6. Perbarui Status Transaksi Pembayaran
    UPDATE public.transaksi_pembayaran
    SET status = p_keputusan,
        verified_by = v_user_id,
        verified_at = now(),
        catatan_verifikasi = COALESCE(trim(p_catatan), CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Bukti transfer sah dan dana diterima.' ELSE 'Ditolak oleh Bendahara.' END),
        updated_at = now()
    WHERE id = p_transaksi_id;

    -- 7. Kirim Notifikasi ke Wali Santri
    INSERT INTO public.notifikasi (
        user_id, santri_id, jenis_notifikasi, judul, pesan, tautan
    ) VALUES (
        v_trx.wali_user_id,
        v_trx.santri_id,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'PEMBAYARAN_DISETUJUI' ELSE 'PEMBAYARAN_DITOLAK' END,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Pembayaran Disetujui Bendahara' ELSE 'Pengajuan Pembayaran Ditolak' END,
        CASE
            WHEN p_keputusan = 'DISETUJUI' THEN 'Transaksi ' || v_trx.nomor_transaksi || ' sebesar Rp ' || to_char(v_trx.total_nominal, 'FM999,999,999') || ' telah diverifikasi dan tagihan santri diperbarui.'
            ELSE 'Transaksi ' || v_trx.nomor_transaksi || ' ditolak oleh Bendahara. Alasan: ' || COALESCE(p_catatan, '-')
        END,
        '/pembayaran'
    );

    -- 8. Catat Audit Log
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
        'VERIFIKASI_PEMBAYARAN_' || p_keputusan::text,
        'transaksi_pembayaran',
        p_transaksi_id::text,
        jsonb_build_object('status', v_trx.status),
        jsonb_build_object('status', p_keputusan, 'verified_by', v_user_id),
        COALESCE(p_catatan, 'Verifikasi pembayaran tagihan oleh ' || v_profile_name)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'nomor_transaksi', v_trx.nomor_transaksi,
        'status', p_keputusan,
        'message', 'Transaksi ' || v_trx.nomor_transaksi || ' berhasil diverifikasi (' || p_keputusan::text || ').'
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. RPC Verifikasi Top-Up Uang Saku Atomik oleh Bendahara (ACID Compliant)
-- Mengunci baris pengajuan (FOR UPDATE), mengunci baris saldo santri, melakukan
-- upsert saldo dan append-only mutasi ledger dalam 1 transaksi, mencegah race condition.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_verifikasi_topup_uang_saku_v2(
    p_pengajuan_id UUID,
    p_keputusan public.status_transaksi, -- 'DISETUJUI' atau 'DITOLAK'
    p_catatan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_pengajuan RECORD;
    v_saldo RECORD;
    v_saldo_sebelum NUMERIC(15, 2) := 0;
    v_saldo_sesudah NUMERIC(15, 2) := 0;
    v_total_masuk_baru NUMERIC(15, 2) := 0;
    v_mutasi_id UUID;
    v_nomor_mutasi TEXT;
    v_profile_name TEXT;
BEGIN
    -- 1. Validasi Autentikasi Pengguna
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Anda harus login terlebih dahulu.';
    END IF;

    -- 2. Validasi Role: Hanya Bendahara dan Superadmin yang berwenang
    SELECT role, nama_lengkap INTO v_role, v_profile_name
    FROM public.profiles
    WHERE id = v_user_id AND is_active = true;

    IF v_role IS NULL OR v_role NOT IN ('bendahara', 'superadmin') THEN
        RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren atau Superadmin yang berwenang memverifikasi top-up uang saku.';
    END IF;

    -- 3. Validasi Keputusan
    IF p_keputusan NOT IN ('DISETUJUI', 'DITOLAK') THEN
        RAISE EXCEPTION 'Keputusan verifikasi harus bernilai DISETUJUI atau DITOLAK.';
    END IF;

    IF p_keputusan = 'DITOLAK' AND (p_catatan IS NULL OR length(trim(p_catatan)) < 3) THEN
        RAISE EXCEPTION 'Alasan penolakan verifikasi wajib diisi minimal 3 karakter.';
    END IF;

    -- 4. Kunci Baris Pengajuan (FOR UPDATE) untuk Mencegah Double Verification / Race Condition
    SELECT * INTO v_pengajuan
    FROM public.pengajuan_uang_saku
    WHERE id = p_pengajuan_id
    FOR UPDATE;

    IF v_pengajuan IS NULL THEN
        RAISE EXCEPTION 'Pengajuan uang saku dengan ID "%" tidak ditemukan.', p_pengajuan_id;
    END IF;

    IF v_pengajuan.status != 'MENUNGGU_VERIFIKASI' THEN
        RAISE EXCEPTION 'Pengajuan % sudah diproses sebelumnya (status saat ini: %).', v_pengajuan.nomor_pengajuan, v_pengajuan.status;
    END IF;

    -- 5. Jika Disetujui, Perbarui Saldo dan Catat Ledger Mutasi
    IF p_keputusan = 'DISETUJUI' THEN
        -- Pastikan baris saldo_uang_saku santri tersedia
        INSERT INTO public.saldo_uang_saku (
            santri_id, saldo_saat_ini, total_masuk, total_keluar, total_penyesuaian, updated_at
        ) VALUES (
            v_pengajuan.santri_id, 0, 0, 0, 0, now()
        )
        ON CONFLICT (santri_id) DO NOTHING;

        -- Kunci baris saldo santri (FOR UPDATE)
        SELECT * INTO v_saldo
        FROM public.saldo_uang_saku
        WHERE santri_id = v_pengajuan.santri_id
        FOR UPDATE;

        -- Pastikan belum ada mutasi dengan pengajuan_id ini (Database Idempotency Check)
        IF EXISTS (
            SELECT 1 FROM public.mutasi_uang_saku WHERE pengajuan_id = p_pengajuan_id
        ) THEN
            RAISE EXCEPTION 'Mutasi ledger untuk pengajuan % sudah tercatat sebelumnya.', v_pengajuan.nomor_pengajuan;
        END IF;

        v_saldo_sebelum := COALESCE(v_saldo.saldo_saat_ini, 0);
        v_saldo_sesudah := v_saldo_sebelum + v_pengajuan.nominal;
        v_total_masuk_baru := COALESCE(v_saldo.total_masuk, 0) + v_pengajuan.nominal;

        -- Update Saldo Uang Saku (Mematuhi constraint chk_rumus_saldo_ledger)
        UPDATE public.saldo_uang_saku
        SET saldo_saat_ini = v_saldo_sesudah,
            total_masuk = v_total_masuk_baru,
            updated_at = now()
        WHERE santri_id = v_pengajuan.santri_id;

        -- Catat Mutasi Ledger Uang Saku (Append-Only)
        v_nomor_mutasi := 'MUT-TOP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4));

        INSERT INTO public.mutasi_uang_saku (
            nomor_transaksi,
            santri_id,
            jenis_mutasi,
            nominal,
            saldo_sebelum,
            saldo_sesudah,
            keterangan,
            pengajuan_id,
            petugas_id,
            created_at
        ) VALUES (
            v_nomor_mutasi,
            v_pengajuan.santri_id,
            'MASUK'::public.jenis_mutasi_saku,
            v_pengajuan.nominal,
            v_saldo_sebelum,
            v_saldo_sesudah,
            'Top-up uang saku diverifikasi (' || v_pengajuan.nomor_pengajuan || ')',
            v_pengajuan.id,
            v_user_id,
            now()
        ) RETURNING id INTO v_mutasi_id;
    END IF;

    -- 6. Update Status Pengajuan Uang Saku
    UPDATE public.pengajuan_uang_saku
    SET status = p_keputusan,
        verified_by = v_user_id,
        verified_at = now(),
        catatan_verifikasi = COALESCE(trim(p_catatan), CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Bukti transfer top-up diterima dan saldo ditambahkan.' ELSE 'Pengajuan top-up ditolak.' END),
        updated_at = now()
    WHERE id = p_pengajuan_id;

    -- 7. Kirim Notifikasi ke Wali Santri
    INSERT INTO public.notifikasi (
        user_id, santri_id, jenis_notifikasi, judul, pesan, tautan
    ) VALUES (
        v_pengajuan.wali_user_id,
        v_pengajuan.santri_id,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'UANG_SAKU_TOPUP' ELSE 'UANG_SAKU_KOREKSI' END,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Top-Up Uang Saku Disetujui' ELSE 'Pengajuan Top-Up Ditolak' END,
        CASE
            WHEN p_keputusan = 'DISETUJUI' THEN 'Pengajuan top-up ' || v_pengajuan.nomor_pengajuan || ' sebesar Rp ' || to_char(v_pengajuan.nominal, 'FM999,999,999') || ' telah disetujui. Saldo santri saat ini: Rp ' || to_char(v_saldo_sesudah, 'FM999,999,999') || '.'
            ELSE 'Pengajuan top-up ' || v_pengajuan.nomor_pengajuan || ' ditolak oleh Bendahara. Alasan: ' || COALESCE(p_catatan, '-')
        END,
        '/uang-saku'
    );

    -- 8. Catat Audit Log
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
        'VERIFIKASI_TOPUP_SAKU_' || p_keputusan::text,
        'pengajuan_uang_saku',
        p_pengajuan_id::text,
        jsonb_build_object('status', v_pengajuan.status),
        jsonb_build_object('status', p_keputusan, 'verified_by', v_user_id, 'mutasi_id', v_mutasi_id),
        COALESCE(p_catatan, 'Verifikasi pengajuan top-up uang saku oleh ' || v_profile_name)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'nomor_pengajuan', v_pengajuan.nomor_pengajuan,
        'status', p_keputusan,
        'mutasi_id', v_mutasi_id,
        'saldo_akhir', v_saldo_sesudah,
        'message', 'Pengajuan ' || v_pengajuan.nomor_pengajuan || ' berhasil diverifikasi (' || p_keputusan::text || ').'
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Pembatasan Hak Eksekusi (Least Privilege)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_verifikasi_pembayaran_v2(UUID, public.status_transaksi, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_verifikasi_topup_uang_saku_v2(UUID, public.status_transaksi, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_checkout_pembayaran_v2(UUID, JSONB, DATE, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verifikasi_pembayaran_v2(UUID, public.status_transaksi, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_verifikasi_topup_uang_saku_v2(UUID, public.status_transaksi, TEXT) TO authenticated;
