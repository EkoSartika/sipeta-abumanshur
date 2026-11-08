-- ============================================================================
-- SIPETA (Sistem Informasi Pelayanan Terpadu - Pondok Pesantren Modern Abu Manshur)
-- Migration 0006: Triggers Immutability, Auto-History, & Atomic Financial RPCs
-- ============================================================================

-- ============================================================================
-- BAGIAN A: HELPER IDENTITAS & ROLE PENGGUNA AKTIF
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_my_santri_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT santri_id FROM public.wali_santri WHERE user_id = auth.uid();
$$;

-- ============================================================================
-- BAGIAN B: TRIGGERS IMMUTABILITY & AUTO-HISTORY
-- ============================================================================

-- 1. Trigger Immutability pada mutasi_uang_saku (Bab 6.4 PRD)
CREATE OR REPLACE FUNCTION public.prevent_mutasi_uang_saku_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'PELANGGARAN INTEGRITAS KEUANGAN: Transaksi mutasi uang saku yang sudah disahkan bersifat immutable. Gunakan mekanisme transaksi pembalik/penyesuaian.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_mutasi_uang_saku ON public.mutasi_uang_saku;
CREATE TRIGGER trg_immutable_mutasi_uang_saku
BEFORE UPDATE OR DELETE ON public.mutasi_uang_saku
FOR EACH ROW EXECUTE FUNCTION public.prevent_mutasi_uang_saku_modification();

-- 2. Trigger Immutability pada audit_logs (Bab 13 PRD)
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'PELANGGARAN INTEGRITAS AUDIT: Audit log bersifat append-only dan tidak dapat diubah atau dihapus.';
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON public.audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_logs_modification();

-- 3. Trigger Proteksi Transaksi Pembayaran yang Sudah Disetujui (Bab 3.1 & 5.6 PRD)
CREATE OR REPLACE FUNCTION public.protect_verified_transaksi_pembayaran()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.status = 'DISETUJUI' THEN
        RAISE EXCEPTION 'Transaksi pembayaran yang sudah disahkan tidak dapat dihapus.';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'DISETUJUI' AND (
        NEW.total_nominal != OLD.total_nominal
        OR NEW.santri_id != OLD.santri_id
        OR NEW.status != OLD.status
    ) THEN
        RAISE EXCEPTION 'Transaksi pembayaran yang sudah disahkan bersifat final dan tidak dapat diubah tanpa prosedur koreksi resmi.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_verified_transaksi ON public.transaksi_pembayaran;
CREATE TRIGGER trg_protect_verified_transaksi
BEFORE UPDATE OR DELETE ON public.transaksi_pembayaran
FOR EACH ROW EXECUTE FUNCTION public.protect_verified_transaksi_pembayaran();

-- 4. Trigger Auto-Inisialisasi Saldo Uang Saku & Riwayat Penempatan saat Santri Dibuat/Diubah
CREATE OR REPLACE FUNCTION public.handle_after_santri_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.saldo_uang_saku (santri_id, saldo_saat_ini, total_masuk, total_keluar, total_penyesuaian)
    VALUES (NEW.id, 0, 0, 0, 0)
    ON CONFLICT (santri_id) DO NOTHING;

    INSERT INTO public.riwayat_penempatan_santri (
        santri_id, kelas_lama_id, kelas_baru_id, kamar_lama_id, kamar_baru_id, keterangan, petugas_id
    ) VALUES (
        NEW.id, NULL, NEW.kelas_id, NULL, NEW.kamar_id, 'Penempatan awal santri terdaftar', auth.uid()
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_santri_insert ON public.santri;
CREATE TRIGGER trg_after_santri_insert
AFTER INSERT ON public.santri
FOR EACH ROW EXECUTE FUNCTION public.handle_after_santri_insert();

CREATE OR REPLACE FUNCTION public.handle_after_santri_placement_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.kelas_id IS DISTINCT FROM NEW.kelas_id OR OLD.kamar_id IS DISTINCT FROM NEW.kamar_id THEN
        INSERT INTO public.riwayat_penempatan_santri (
            santri_id, kelas_lama_id, kelas_baru_id, kamar_lama_id, kamar_baru_id, keterangan, petugas_id
        ) VALUES (
            NEW.id, OLD.kelas_id, NEW.kelas_id, OLD.kamar_id, NEW.kamar_id, 'Perubahan penempatan kelas/kamar', auth.uid()
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_santri_placement_update ON public.santri;
CREATE TRIGGER trg_after_santri_placement_update
AFTER UPDATE ON public.santri
FOR EACH ROW EXECUTE FUNCTION public.handle_after_santri_placement_update();

-- 5. Trigger Auto-Riwayat Perubahan Catatan Kedisiplinan (Bab 10 PRD)
CREATE OR REPLACE FUNCTION public.handle_before_kedisiplinan_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.deskripsi IS DISTINCT FROM NEW.deskripsi
       OR OLD.tindak_lanjut IS DISTINCT FROM NEW.tindak_lanjut
       OR OLD.catatan_pembinaan IS DISTINCT FROM NEW.catatan_pembinaan
       OR OLD.status_tindak_lanjut IS DISTINCT FROM NEW.status_tindak_lanjut THEN
        INSERT INTO public.riwayat_perubahan_kedisiplinan (
            catatan_kedisiplinan_id,
            deskripsi_sebelum,
            tindak_lanjut_sebelum,
            catatan_pembinaan_sebelum,
            status_sebelum,
            status_sesudah,
            alasan_perubahan,
            diubah_oleh
        ) VALUES (
            OLD.id,
            OLD.deskripsi,
            OLD.tindak_lanjut,
            OLD.catatan_pembinaan,
            OLD.status_tindak_lanjut,
            NEW.status_tindak_lanjut,
            'Pembaruan tindak lanjut / catatan pembinaan',
            COALESCE(NEW.updated_by, auth.uid())
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_kedisiplinan_update ON public.catatan_kedisiplinan;
CREATE TRIGGER trg_before_kedisiplinan_update
BEFORE UPDATE ON public.catatan_kedisiplinan
FOR EACH ROW EXECUTE FUNCTION public.handle_before_kedisiplinan_update();

-- ============================================================================
-- BAGIAN C: ATOMIC POSTGRESQL RPCs UNTUK TRANSAKSI KEUANGAN
-- ============================================================================

-- 1. RPC Checkout Keranjang & Pengajuan Pembayaran (Bab 5.4 & 5.5 PRD)
CREATE OR REPLACE FUNCTION public.rpc_checkout_pembayaran(
    p_tanggal_transfer DATE DEFAULT NULL,
    p_nama_pengirim TEXT DEFAULT NULL,
    p_bank_pengirim TEXT DEFAULT NULL,
    p_bukti_transfer_path TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_santri_id UUID;
    v_rekening RECORD;
    v_item RECORD;
    v_total NUMERIC(15, 2) := 0;
    v_transaksi_id UUID;
    v_nomor_transaksi TEXT;
    v_status_awal public.status_transaksi;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role != 'wali' THEN
        RAISE EXCEPTION 'Hanya akun Orang Tua/Wali yang dapat melakukan checkout keranjang pembayaran.';
    END IF;

    SELECT santri_id INTO v_santri_id FROM public.wali_santri WHERE user_id = v_user_id;
    IF v_santri_id IS NULL THEN
        RAISE EXCEPTION 'Akun wali belum terhubung dengan data santri.';
    END IF;

    SELECT id, nama_bank, kode_bank, nomor_rekening, atas_nama
    INTO v_rekening
    FROM public.rekening_pesantren
    WHERE is_active = true
    LIMIT 1;

    IF v_rekening IS NULL THEN
        RAISE EXCEPTION 'Rekening resmi pesantren belum dikonfigurasi.';
    END IF;

    -- Validasi setiap item di keranjang dengan mengunci baris tagihan
    FOR v_item IN
        SELECT k.id AS keranjang_id, k.nominal_bayar, t.id AS tagihan_id, t.judul_tagihan,
               t.sisa_tagihan, t.status, t.kebijakan_cicilan_snapshot, t.minimal_cicilan_snapshot
        FROM public.keranjang_pembayaran k
        JOIN public.tagihan t ON t.id = k.tagihan_id
        WHERE k.wali_user_id = v_user_id AND k.santri_id = v_santri_id
        FOR UPDATE OF t
    LOOP
        IF v_item.status IN ('LUNAS', 'DIBATALKAN') OR v_item.sisa_tagihan <= 0 THEN
            RAISE EXCEPTION 'Tagihan "%" sudah lunas atau tidak aktif.', v_item.judul_tagihan;
        END IF;

        IF v_item.nominal_bayar > v_item.sisa_tagihan THEN
            RAISE EXCEPTION 'Nominal pembayaran untuk "%" melebihi sisa kewajiban.', v_item.judul_tagihan;
        END IF;

        IF v_item.kebijakan_cicilan_snapshot = 'TIDAK_BOLEH' AND v_item.nominal_bayar != v_item.sisa_tagihan THEN
            RAISE EXCEPTION 'Tagihan "%" tidak dapat dicicil dan harus dibayar penuh sebesar %.', v_item.judul_tagihan, v_item.sisa_tagihan;
        END IF;

        IF v_item.kebijakan_cicilan_snapshot = 'MINIMAL_NOMINAL'
           AND v_item.nominal_bayar < v_item.sisa_tagihan
           AND v_item.nominal_bayar < COALESCE(v_item.minimal_cicilan_snapshot, 0) THEN
            RAISE EXCEPTION 'Nominal cicilan untuk "%" kurang dari batas minimum (%).', v_item.judul_tagihan, v_item.minimal_cicilan_snapshot;
        END IF;

        v_total := v_total + v_item.nominal_bayar;
    END LOOP;

    IF v_total <= 0 THEN
        RAISE EXCEPTION 'Keranjang pembayaran kosong.';
    END IF;

    v_nomor_transaksi := 'TRX-BYR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));
    v_status_awal := CASE
        WHEN p_bukti_transfer_path IS NOT NULL AND length(trim(p_bukti_transfer_path)) > 0 THEN 'MENUNGGU_VERIFIKASI'::public.status_transaksi
        ELSE 'MENUNGGU_TRANSFER'::public.status_transaksi
    END;

    INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot,
        tanggal_transfer, nama_pengirim, bank_pengirim, bukti_transfer_path, status
    ) VALUES (
        v_nomor_transaksi, v_santri_id, v_user_id, v_total,
        jsonb_build_object(
            'nama_bank', v_rekening.nama_bank,
            'nomor_rekening', v_rekening.nomor_rekening,
            'atas_nama', v_rekening.atas_nama
        ),
        p_tanggal_transfer, p_nama_pengirim, p_bank_pengirim, p_bukti_transfer_path, v_status_awal
    ) RETURNING id INTO v_transaksi_id;

    INSERT INTO public.alokasi_pembayaran (transaksi_id, tagihan_id, nominal_alokasi)
    SELECT v_transaksi_id, tagihan_id, nominal_bayar
    FROM public.keranjang_pembayaran
    WHERE wali_user_id = v_user_id AND santri_id = v_santri_id;

    DELETE FROM public.keranjang_pembayaran
    WHERE wali_user_id = v_user_id AND santri_id = v_santri_id;

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah)
    VALUES (
        v_user_id, v_role, 'CHECKOUT_PEMBAYARAN', 'transaksi_pembayaran', v_transaksi_id::text,
        jsonb_build_object('nomor_transaksi', v_nomor_transaksi, 'total_nominal', v_total, 'status', v_status_awal)
    );

    RETURN v_transaksi_id;
END;
$$;

-- 2. RPC Verifikasi Pembayaran Atomik oleh Bendahara (Bab 5.6 PRD)
CREATE OR REPLACE FUNCTION public.rpc_verifikasi_pembayaran(
    p_transaksi_id UUID,
    p_keputusan public.status_transaksi, -- 'DISETUJUI' atau 'DITOLAK'
    p_catatan TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_trx RECORD;
    v_alokasi RECORD;
    v_tagihan RECORD;
    v_sisa_baru NUMERIC(15, 2);
    v_status_tagihan_baru public.status_tagihan;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role != 'bendahara' THEN
        RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren yang berwenang memverifikasi transaksi pembayaran.';
    END IF;

    IF p_keputusan NOT IN ('DISETUJUI', 'DITOLAK') THEN
        RAISE EXCEPTION 'Keputusan verifikasi harus DISETUJUI atau DITOLAK.';
    END IF;

    -- Kunci baris transaksi untuk mencegah double approval
    SELECT * INTO v_trx
    FROM public.transaksi_pembayaran
    WHERE id = p_transaksi_id
    FOR UPDATE;

    IF v_trx IS NULL THEN
        RAISE EXCEPTION 'Transaksi pembayaran tidak ditemukan.';
    END IF;

    IF v_trx.status != 'MENUNGGU_VERIFIKASI' THEN
        RAISE EXCEPTION 'Transaksi ini tidak dalam status MENUNGGU_VERIFIKASI (status saat ini: %).', v_trx.status;
    END IF;

    IF p_keputusan = 'DITOLAK' AND (p_catatan IS NULL OR length(trim(p_catatan)) < 3) THEN
        RAISE EXCEPTION 'Catatan alasan penolakan wajib diisi.';
    END IF;

    IF p_keputusan = 'DISETUJUI' THEN
        FOR v_alokasi IN
            SELECT * FROM public.alokasi_pembayaran WHERE transaksi_id = p_transaksi_id
        LOOP
            SELECT * INTO v_tagihan
            FROM public.tagihan
            WHERE id = v_alokasi.tagihan_id
            FOR UPDATE;

            IF v_tagihan.sisa_tagihan < v_alokasi.nominal_alokasi THEN
                RAISE EXCEPTION 'Alokasi pembayaran (%) melebihi sisa kewajiban tagihan "%" (%).',
                    v_alokasi.nominal_alokasi, v_tagihan.judul_tagihan, v_tagihan.sisa_tagihan;
            END IF;

            v_sisa_baru := v_tagihan.sisa_tagihan - v_alokasi.nominal_alokasi;
            v_status_tagihan_baru := CASE
                WHEN v_sisa_baru = 0 THEN 'LUNAS'::public.status_tagihan
                ELSE 'DIBAYAR_SEBAGIAN'::public.status_tagihan
            END;

            UPDATE public.tagihan
            SET total_terbayar = total_terbayar + v_alokasi.nominal_alokasi,
                status = v_status_tagihan_baru
            WHERE id = v_tagihan.id;
        END LOOP;
    END IF;

    UPDATE public.transaksi_pembayaran
    SET status = p_keputusan,
        verified_by = v_user_id,
        verified_at = now(),
        catatan_verifikasi = p_catatan
    WHERE id = p_transaksi_id;

    -- Kirim notifikasi ke Orang Tua/Wali
    INSERT INTO public.notifikasi (user_id, santri_id, jenis_notifikasi, judul, pesan, tautan)
    VALUES (
        v_trx.wali_user_id,
        v_trx.santri_id,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'PEMBAYARAN_DISETUJUI' ELSE 'PEMBAYARAN_DITOLAK' END,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Pembayaran Disetujui Bendahara' ELSE 'Pengajuan Pembayaran Ditolak' END,
        CASE
            WHEN p_keputusan = 'DISETUJUI' THEN 'Transaksi ' || v_trx.nomor_transaksi || ' sebesar Rp ' || to_char(v_trx.total_nominal, 'FM999,999,999') || ' telah diverifikasi dan disahkan.'
            ELSE 'Transaksi ' || v_trx.nomor_transaksi || ' ditolak. Catatan: ' || COALESCE(p_catatan, '-')
        END,
        '/pembayaran'
    );

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sebelum, data_sesudah, alasan_perubahan)
    VALUES (
        v_user_id, v_role, 'VERIFIKASI_PEMBAYARAN_' || p_keputusan::text, 'transaksi_pembayaran', p_transaksi_id::text,
        jsonb_build_object('status', v_trx.status),
        jsonb_build_object('status', p_keputusan, 'verified_by', v_user_id),
        p_catatan
    );
END;
$$;

-- 3. RPC Verifikasi Pengisian (Top-Up) Uang Saku oleh Bendahara (Bab 6.2 PRD)
CREATE OR REPLACE FUNCTION public.rpc_verifikasi_topup_uang_saku(
    p_pengajuan_id UUID,
    p_keputusan public.status_transaksi, -- 'DISETUJUI' atau 'DITOLAK'
    p_catatan TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_pengajuan RECORD;
    v_saldo RECORD;
    v_saldo_baru NUMERIC(15, 2);
    v_mutasi_id UUID;
    v_nomor_mutasi TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role != 'bendahara' THEN
        RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren yang berwenang memverifikasi uang saku.';
    END IF;

    SELECT * INTO v_pengajuan
    FROM public.pengajuan_uang_saku
    WHERE id = p_pengajuan_id
    FOR UPDATE;

    IF v_pengajuan IS NULL THEN
        RAISE EXCEPTION 'Pengajuan uang saku tidak ditemukan.';
    END IF;

    IF v_pengajuan.status != 'MENUNGGU_VERIFIKASI' THEN
        RAISE EXCEPTION 'Pengajuan ini sudah diproses sebelumnya (status: %).', v_pengajuan.status;
    END IF;

    IF p_keputusan = 'DISETUJUI' THEN
        -- Kunci baris saldo santri
        INSERT INTO public.saldo_uang_saku (santri_id, saldo_saat_ini, total_masuk, total_keluar, total_penyesuaian)
        VALUES (v_pengajuan.santri_id, 0, 0, 0, 0)
        ON CONFLICT (santri_id) DO NOTHING;

        SELECT * INTO v_saldo
        FROM public.saldo_uang_saku
        WHERE santri_id = v_pengajuan.santri_id
        FOR UPDATE;

        v_saldo_baru := v_saldo.saldo_saat_ini + v_pengajuan.nominal;
        v_nomor_mutasi := 'SAK-IN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

        INSERT INTO public.mutasi_uang_saku (
            nomor_transaksi, santri_id, jenis_mutasi, nominal,
            saldo_sebelum, saldo_sesudah, keterangan, pengajuan_id, petugas_id
        ) VALUES (
            v_nomor_mutasi, v_pengajuan.santri_id, 'MASUK', v_pengajuan.nominal,
            v_saldo.saldo_saat_ini, v_saldo_baru,
            COALESCE(v_pengajuan.keterangan, 'Pengisian uang saku via transfer orang tua (' || v_pengajuan.nomor_pengajuan || ')'),
            v_pengajuan.id, v_user_id
        ) RETURNING id INTO v_mutasi_id;

        UPDATE public.saldo_uang_saku
        SET saldo_saat_ini = v_saldo_baru,
            total_masuk = total_masuk + v_pengajuan.nominal,
            updated_at = now()
        WHERE santri_id = v_pengajuan.santri_id;
    END IF;

    UPDATE public.pengajuan_uang_saku
    SET status = p_keputusan,
        verified_by = v_user_id,
        verified_at = now(),
        catatan_verifikasi = p_catatan
    WHERE id = p_pengajuan_id;

    INSERT INTO public.notifikasi (user_id, santri_id, jenis_notifikasi, judul, pesan, tautan)
    VALUES (
        v_pengajuan.wali_user_id,
        v_pengajuan.santri_id,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'SAKU_DISETUJUI' ELSE 'SAKU_DITOLAK' END,
        CASE WHEN p_keputusan = 'DISETUJUI' THEN 'Uang Saku Masuk Disetujui' ELSE 'Pengajuan Uang Saku Ditolak' END,
        CASE
            WHEN p_keputusan = 'DISETUJUI' THEN 'Pengisian uang saku sebesar Rp ' || to_char(v_pengajuan.nominal, 'FM999,999,999') || ' telah ditambahkan ke saldo santri.'
            ELSE 'Pengajuan uang saku ' || v_pengajuan.nomor_pengajuan || ' ditolak. Catatan: ' || COALESCE(p_catatan, '-')
        END,
        '/uang-saku'
    );

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah, alasan_perubahan)
    VALUES (
        v_user_id, v_role, 'VERIFIKASI_TOPUP_SAKU_' || p_keputusan::text, 'pengajuan_uang_saku', p_pengajuan_id::text,
        jsonb_build_object('status', p_keputusan, 'nominal', v_pengajuan.nominal, 'mutasi_id', v_mutasi_id),
        p_catatan
    );

    RETURN v_mutasi_id;
END;
$$;

-- 4. RPC Pencatatan Uang Keluar (Penyerahan Uang Saku) dengan Foto Wajib (Bab 6.3 PRD)
CREATE OR REPLACE FUNCTION public.rpc_catat_penyerahan_uang_saku(
    p_santri_id UUID,
    p_nominal NUMERIC(15, 2),
    p_keterangan TEXT,
    p_foto_penyerahan_path TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_saldo RECORD;
    v_saldo_baru NUMERIC(15, 2);
    v_mutasi_id UUID;
    v_nomor_mutasi TEXT;
    v_wali_user_id UUID;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role != 'bendahara' THEN
        RAISE EXCEPTION 'OTORISASI DITOLAK: Hanya Bendahara Pesantren yang berwenang mengesahkan pengeluaran uang saku.';
    END IF;

    IF p_nominal <= 0 THEN
        RAISE EXCEPTION 'Nominal penyerahan uang saku harus lebih dari 0.';
    END IF;

    IF p_foto_penyerahan_path IS NULL OR length(trim(p_foto_penyerahan_path)) = 0 THEN
        RAISE EXCEPTION 'VALIDASI GAGAL: Foto bukti penyerahan uang saku WAJIB diunggah sebelum transaksi dapat disahkan.';
    END IF;

    SELECT * INTO v_saldo
    FROM public.saldo_uang_saku
    WHERE santri_id = p_santri_id
    FOR UPDATE;

    IF v_saldo IS NULL OR v_saldo.saldo_saat_ini < p_nominal THEN
        RAISE EXCEPTION 'Saldo uang saku santri tidak mencukupi (Saldo saat ini: Rp %, Nominal penarikan: Rp %).',
            COALESCE(v_saldo.saldo_saat_ini, 0), p_nominal;
    END IF;

    v_saldo_baru := v_saldo.saldo_saat_ini - p_nominal;
    v_nomor_mutasi := 'SAK-OUT-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

    INSERT INTO public.mutasi_uang_saku (
        nomor_transaksi, santri_id, jenis_mutasi, nominal,
        saldo_sebelum, saldo_sesudah, keterangan, foto_penyerahan_path, petugas_id
    ) VALUES (
        v_nomor_mutasi, p_santri_id, 'KELUAR', p_nominal,
        v_saldo.saldo_saat_ini, v_saldo_baru, p_keterangan, p_foto_penyerahan_path, v_user_id
    ) RETURNING id INTO v_mutasi_id;

    UPDATE public.saldo_uang_saku
    SET saldo_saat_ini = v_saldo_baru,
        total_keluar = total_keluar + p_nominal,
        updated_at = now()
    WHERE santri_id = p_santri_id;

    SELECT user_id INTO v_wali_user_id FROM public.wali_santri WHERE santri_id = p_santri_id;
    IF v_wali_user_id IS NOT NULL THEN
        INSERT INTO public.notifikasi (user_id, santri_id, jenis_notifikasi, judul, pesan, tautan)
        VALUES (
            v_wali_user_id, p_santri_id, 'SAKU_DISERAHKAN',
            'Penyerahan Uang Saku kepada Santri',
            'Uang saku sebesar Rp ' || to_char(p_nominal, 'FM999,999,999') || ' telah diserahkan (' || p_keterangan || '). Bukti foto penyerahan tersedia.',
            '/uang-saku'
        );
    END IF;

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah)
    VALUES (
        v_user_id, v_role, 'PENYERAHAN_UANG_SAKU', 'mutasi_uang_saku', v_mutasi_id::text,
        jsonb_build_object(
            'nomor_transaksi', v_nomor_mutasi,
            'nominal', p_nominal,
            'saldo_sebelum', v_saldo.saldo_saat_ini,
            'saldo_sesudah', v_saldo_baru,
            'foto_penyerahan_path', p_foto_penyerahan_path
        )
    );

    RETURN v_mutasi_id;
END;
$$;

-- 5. RPC Koreksi / Penyesuaian Ledger Uang Saku (Bab 3.1 & 6.4 PRD)
CREATE OR REPLACE FUNCTION public.rpc_koreksi_ledger_uang_saku(
    p_referensi_mutasi_id UUID,
    p_jenis_penyesuaian public.jenis_mutasi_saku, -- 'PENYESUAIAN_TAMBAH' atau 'PENYESUAIAN_KURANG'
    p_nominal NUMERIC(15, 2),
    p_alasan_koreksi TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_ref RECORD;
    v_saldo RECORD;
    v_saldo_baru NUMERIC(15, 2);
    v_delta NUMERIC(15, 2);
    v_mutasi_id UUID;
    v_nomor_mutasi TEXT;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role NOT IN ('bendahara', 'superadmin') THEN
        RAISE EXCEPTION 'Hanya Bendahara atau Superadmin yang dapat melakukan jurnal penyesuaian/koreksi.';
    END IF;

    IF p_jenis_penyesuaian NOT IN ('PENYESUAIAN_TAMBAH', 'PENYESUAIAN_KURANG') THEN
        RAISE EXCEPTION 'Jenis penyesuaian harus PENYESUAIAN_TAMBAH atau PENYESUAIAN_KURANG.';
    END IF;

    SELECT * INTO v_ref FROM public.mutasi_uang_saku WHERE id = p_referensi_mutasi_id;
    IF v_ref IS NULL THEN
        RAISE EXCEPTION 'Mutasi referensi yang akan dikoreksi tidak ditemukan.';
    END IF;

    SELECT * INTO v_saldo FROM public.saldo_uang_saku WHERE santri_id = v_ref.santri_id FOR UPDATE;

    IF p_jenis_penyesuaian = 'PENYESUAIAN_KURANG' AND v_saldo.saldo_saat_ini < p_nominal THEN
        RAISE EXCEPTION 'Saldo santri tidak mencukupi untuk penyesuaian kurang.';
    END IF;

    v_delta := CASE WHEN p_jenis_penyesuaian = 'PENYESUAIAN_TAMBAH' THEN p_nominal ELSE -p_nominal END;
    v_saldo_baru := v_saldo.saldo_saat_ini + v_delta;
    v_nomor_mutasi := 'SAK-ADJ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

    INSERT INTO public.mutasi_uang_saku (
        nomor_transaksi, santri_id, jenis_mutasi, nominal,
        saldo_sebelum, saldo_sesudah, keterangan,
        referensi_mutasi_id, alasan_koreksi, petugas_id
    ) VALUES (
        v_nomor_mutasi, v_ref.santri_id, p_jenis_penyesuaian, p_nominal,
        v_saldo.saldo_saat_ini, v_saldo_baru,
        'Koreksi atas transaksi ' || v_ref.nomor_transaksi,
        p_referensi_mutasi_id, p_alasan_koreksi, v_user_id
    ) RETURNING id INTO v_mutasi_id;

    UPDATE public.saldo_uang_saku
    SET saldo_saat_ini = v_saldo_baru,
        total_penyesuaian = total_penyesuaian + v_delta,
        updated_at = now()
    WHERE santri_id = v_ref.santri_id;

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah, alasan_perubahan)
    VALUES (
        v_user_id, v_role, 'KOREKSI_LEDGER_UANG_SAKU', 'mutasi_uang_saku', v_mutasi_id::text,
        jsonb_build_object('referensi_id', p_referensi_mutasi_id, 'jenis', p_jenis_penyesuaian, 'nominal', p_nominal),
        p_alasan_koreksi
    );

    RETURN v_mutasi_id;
END;
$$;

-- 6. RPC Unggah Bukti Transfer Pembayaran Susulan oleh Wali
CREATE OR REPLACE FUNCTION public.rpc_unggah_bukti_transfer_pembayaran(
    p_transaksi_id UUID,
    p_tanggal_transfer DATE,
    p_nama_pengirim TEXT,
    p_bank_pengirim TEXT,
    p_bukti_transfer_path TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_trx RECORD;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role != 'wali' THEN
        RAISE EXCEPTION 'Hanya akun Orang Tua/Wali yang dapat mengunggah bukti transfer pembayaran.';
    END IF;

    IF p_bukti_transfer_path IS NULL OR length(trim(p_bukti_transfer_path)) = 0 THEN
        RAISE EXCEPTION 'File bukti transfer wajib dilampirkan.';
    END IF;

    SELECT * INTO v_trx FROM public.transaksi_pembayaran
    WHERE id = p_transaksi_id AND wali_user_id = v_user_id
    FOR UPDATE;

    IF v_trx IS NULL THEN
        RAISE EXCEPTION 'Transaksi tidak ditemukan atau bukan milik akun Anda.';
    END IF;

    IF v_trx.status NOT IN ('MENUNGGU_TRANSFER', 'MENUNGGU_VERIFIKASI') THEN
        RAISE EXCEPTION 'Bukti transfer tidak dapat diunggah untuk transaksi dengan status %.', v_trx.status;
    END IF;

    UPDATE public.transaksi_pembayaran
    SET tanggal_transfer = COALESCE(p_tanggal_transfer, v_trx.tanggal_transfer, CURRENT_DATE),
        nama_pengirim = COALESCE(p_nama_pengirim, v_trx.nama_pengirim),
        bank_pengirim = COALESCE(p_bank_pengirim, v_trx.bank_pengirim),
        bukti_transfer_path = p_bukti_transfer_path,
        status = 'MENUNGGU_VERIFIKASI'
    WHERE id = p_transaksi_id;

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah)
    VALUES (
        v_user_id, v_role, 'UNGGAH_BUKTI_TRANSFER', 'transaksi_pembayaran', p_transaksi_id::text,
        jsonb_build_object('status', 'MENUNGGU_VERIFIKASI', 'bukti_transfer_path', p_bukti_transfer_path)
    );
END;
$$;

-- 7. RPC Penyesuaian & Pembatalan Tagihan oleh Admin (Bab 5.3 PRD)
CREATE OR REPLACE FUNCTION public.rpc_penyesuaian_tagihan(
    p_tagihan_id UUID,
    p_nominal_penyesuaian NUMERIC(15, 2),
    p_alasan TEXT,
    p_batalkan BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_role public.user_role;
    v_tagihan RECORD;
    v_nominal_sebelum NUMERIC(15, 2);
    v_nominal_sesudah NUMERIC(15, 2);
    v_status_sebelum public.status_tagihan;
    v_status_sesudah public.status_tagihan;
BEGIN
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id AND is_active = true;
    IF v_role NOT IN ('admin', 'superadmin') THEN
        RAISE EXCEPTION 'Hanya Admin atau Superadmin yang berwenang melakukan penyesuaian tagihan.';
    END IF;

    IF p_alasan IS NULL OR length(trim(p_alasan)) < 5 THEN
        RAISE EXCEPTION 'Alasan penyesuaian/pembatalan tagihan wajib diisi minimal 5 karakter untuk jejak audit.';
    END IF;

    SELECT * INTO v_tagihan FROM public.tagihan WHERE id = p_tagihan_id FOR UPDATE;
    IF v_tagihan IS NULL THEN
        RAISE EXCEPTION 'Tagihan tidak ditemukan.';
    END IF;

    v_nominal_sebelum := v_tagihan.nominal_tagihan;
    v_status_sebelum := v_tagihan.status;

    IF p_batalkan THEN
        IF v_tagihan.total_terbayar > 0 THEN
            RAISE EXCEPTION 'Tagihan yang telah menerima pembayaran tidak dapat dibatalkan sembarangan. Gunakan mekanisme penyesuaian nominal.';
        END IF;
        v_nominal_sesudah := v_nominal_sebelum;
        v_status_sesudah := 'DIBATALKAN';

        UPDATE public.tagihan
        SET status = 'DIBATALKAN',
            is_active = false
        WHERE id = p_tagihan_id;
    ELSE
        v_nominal_sesudah := v_tagihan.nominal_awal + p_nominal_penyesuaian;
        IF v_nominal_sesudah < v_tagihan.total_terbayar THEN
            RAISE EXCEPTION 'Nominal baru (Rp %) tidak boleh lebih kecil dari total yang sudah dibayar (Rp %).',
                v_nominal_sesudah, v_tagihan.total_terbayar;
        END IF;

        v_status_sesudah := CASE
            WHEN v_nominal_sesudah = v_tagihan.total_terbayar THEN 'LUNAS'::public.status_tagihan
            WHEN v_tagihan.total_terbayar > 0 THEN 'DIBAYAR_SEBAGIAN'::public.status_tagihan
            ELSE 'BELUM_BAYAR'::public.status_tagihan
        END;

        UPDATE public.tagihan
        SET nominal_penyesuaian = p_nominal_penyesuaian,
            status = v_status_sesudah
        WHERE id = p_tagihan_id;
    END IF;

    INSERT INTO public.riwayat_penyesuaian_tagihan (
        tagihan_id, nominal_sebelum, nominal_sesudah,
        status_sebelum, status_sesudah, alasan_penyesuaian, petugas_id
    ) VALUES (
        p_tagihan_id, v_nominal_sebelum, v_nominal_sesudah,
        v_status_sebelum, v_status_sesudah, p_alasan, v_user_id
    );

    INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sebelum, data_sesudah, alasan_perubahan)
    VALUES (
        v_user_id, v_role, 'PENYESUAIAN_TAGIHAN', 'tagihan', p_tagihan_id::text,
        jsonb_build_object('nominal', v_nominal_sebelum, 'status', v_status_sebelum),
        jsonb_build_object('nominal', v_nominal_sesudah, 'status', v_status_sesudah),
        p_alasan
    );
END;
$$;

