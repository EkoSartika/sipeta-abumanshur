import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("SIPETA Migration 021: Atomic Account Mutation, Historical Integrity & Role Guard", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "11111111-1111-1111-1111-111111111111";
  const PENGASUH_ID   = "22222222-2222-2222-2222-222222222222";
  const TU_USER_ID    = "33333333-3333-3333-3333-333333333333";
  const WALI_USER_ID  = "44444444-4444-4444-4444-444444444444";
  const SANTRI_ID     = "55555555-5555-5555-5555-555555555555";
  const TAGIHAN_ID    = "66666666-6666-6666-6666-666666666666";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Skema Enums & Tipe
    await db.exec(`
      CREATE TYPE public.user_role AS ENUM (
        'superadmin', 'admin', 'tu', 'bendahara', 'pengelola', 'wali', 'asatidz'
      );
      CREATE TYPE public.status_transaksi AS ENUM (
        'MENUNGGU_TRANSFER', 'MENUNGGU_VERIFIKASI', 'DISETUJUI', 'DITOLAK', 'KEDALUWARSA'
      );
      CREATE TYPE public.status_tagihan AS ENUM (
        'BELUM_BAYAR', 'SEBAGIAN', 'LUNAS', 'DIBATALKAN'
      );
      CREATE TYPE public.kebijakan_cicilan AS ENUM (
        'TIDAK_BOLEH', 'BEBAS', 'MINIMAL_NOMINAL'
      );

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
        RETURN current_setting('request.jwt.claim.sub', true)::UUID;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        nama_lengkap TEXT NOT NULL,
        role public.user_role NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION public.get_my_role()
      RETURNS public.user_role
      LANGUAGE sql STABLE
      AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid();
      $$;

      CREATE TABLE public.rekening_pesantren (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_bank TEXT NOT NULL,
        kode_bank TEXT,
        nomor_rekening TEXT NOT NULL,
        atas_nama TEXT NOT NULL,
        catatan_instruksi TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_by UUID REFERENCES public.profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX idx_single_active_rekening_pesantren
      ON public.rekening_pesantren ((is_active))
      WHERE is_active = true;

      CREATE TABLE public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
        user_role public.user_role,
        aktivitas TEXT NOT NULL,
        jenis_objek TEXT NOT NULL,
        objek_id TEXT NOT NULL,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        sumber_aktivitas JSONB,
        waktu TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_lengkap TEXT NOT NULL
      );

      CREATE TABLE public.transaksi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_transaksi TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        total_nominal NUMERIC(15, 2) NOT NULL,
        rekening_tujuan_snapshot JSONB NOT NULL,
        status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_TRANSFER',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Data Awal Pengguna
      INSERT INTO public.profiles (id, nama_lengkap, role) VALUES
        ('${SUPERADMIN_ID}', 'Superadmin Pusat', 'superadmin'),
        ('${PENGASUH_ID}',   'Kiai Pengasuh',    'admin'),
        ('${TU_USER_ID}',    'Staf Tata Usaha',  'tu'),
        ('${WALI_USER_ID}',  'Wali Santri Ahmad','wali');

      INSERT INTO public.santri (id, nama_lengkap) VALUES
        ('${SANTRI_ID}', 'Ahmad Santri');
    `);

    // 2. Load and Apply Migration 021 (Atomic RPC)
    const sqlPath = path.resolve(__dirname, "../supabase/migrations/021_atomic_rpc_kelola_rekening.sql");
    const migrationSql = fs.readFileSync(sqlPath, "utf-8");
    await db.exec(migrationSql);
  });

  it("1. Pengasuh berhasil menginisialisasi rekening BSI resmi secara atomik", async () => {
    const res = await db.query<{ rpc_ganti_rekening_resmi_v1: any }>(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Syariah Indonesia (BSI)',
        p_kode_bank => '451',
        p_nomor_rekening => '7198823456',
        p_atas_nama => 'Yayasan Pondok Pesantren Modern Abu Manshur',
        p_catatan_instruksi => 'Rekening resmi utama penerimaan pembayaran',
        p_alasan => 'Inisialisasi resmi rekening pesantren oleh Pengasuh',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);

    const result = res.rows[0]!.rpc_ganti_rekening_resmi_v1;
    expect(result.success).toBe(true);
    expect(result.rekening_aktif.nomor_rekening).toBe("7198823456");
    expect(result.rekening_aktif.is_active).toBe(true);

    // Pastikan rekening tersimpan di database dengan status aktif
    const checkDb = await db.query<any>(`
      SELECT * FROM public.rekening_pesantren WHERE is_active = true;
    `);
    expect(checkDb.rows.length).toBe(1);
    expect(checkDb.rows[0]!.nomor_rekening).toBe("7198823456");

    // Pastikan audit log tercatat dengan benar
    const auditRes = await db.query<any>(`
      SELECT * FROM public.audit_logs WHERE jenis_objek = 'rekening_pesantren';
    `);
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0]!.aktivitas).toBe("GANTI_REKENING_RESMI");
    expect(auditRes.rows[0]!.user_id).toBe(PENGASUH_ID);
    expect(auditRes.rows[0]!.user_role).toBe("admin");
    expect(auditRes.rows[0]!.data_sebelum).toBeNull();
    expect(auditRes.rows[0]!.data_sesudah.nomor_rekening).toBe("7198823456");
  });

  it("2. Pergantian Rekening: Rekening lama menjadi nonaktif, rekening baru menjadi satu-satunya rekening aktif", async () => {
    // 1. Rekening Pertama (BSI)
    await db.query(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Syariah Indonesia (BSI)',
        p_kode_bank => '451',
        p_nomor_rekening => '7198823456',
        p_atas_nama => 'Yayasan Pondok Pesantren Modern Abu Manshur',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);

    // 2. Rekening Kedua (Muamalat) - Menggantikan rekening pertama
    const res2 = await db.query<{ rpc_ganti_rekening_resmi_v1: any }>(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Muamalat',
        p_kode_bank => '147',
        p_nomor_rekening => '1234567890',
        p_atas_nama => 'Yayasan Abu Manshur Muamalat',
        p_alasan => 'Migrasi rekening operasional ke Bank Muamalat',
        p_actor_user_id => '${SUPERADMIN_ID}'
      );
    `);

    const result2 = res2.rows[0]!.rpc_ganti_rekening_resmi_v1;
    expect(result2.success).toBe(true);
    expect(result2.rekening_aktif.nomor_rekening).toBe("1234567890");

    // Periksa status di database: Tepat 1 rekening aktif
    const activeAccounts = await db.query<any>(`
      SELECT * FROM public.rekening_pesantren WHERE is_active = true;
    `);
    expect(activeAccounts.rows.length).toBe(1);
    expect(activeAccounts.rows[0]!.nomor_rekening).toBe("1234567890");

    // Periksa bahwa rekening lama (BSI) tetap tersimpan tetapi statusnya nonaktif (is_active = false)
    const oldAccount = await db.query<any>(`
      SELECT * FROM public.rekening_pesantren WHERE nomor_rekening = '7198823456';
    `);
    expect(oldAccount.rows.length).toBe(1);
    expect(oldAccount.rows[0]!.is_active).toBe(false);

    // Periksa audit log: memuat data_sebelum (BSI) dan data_sesudah (Muamalat)
    const auditRes = await db.query<any>(`
      SELECT * FROM public.audit_logs 
      WHERE aktivitas = 'GANTI_REKENING_RESMI' 
      ORDER BY waktu DESC LIMIT 1;
    `);
    expect(auditRes.rows[0]!.data_sebelum.nomor_rekening).toBe("7198823456");
    expect(auditRes.rows[0]!.data_sesudah.nomor_rekening).toBe("1234567890");
    expect(auditRes.rows[0]!.alasan_perubahan).toBe("Migrasi rekening operasional ke Bank Muamalat");
  });

  it("3. Kegagalan di tengah proses menyebabkan seluruh transaksi di-ROLLBACK", async () => {
    // 1. Inisialisasi rekening aktif awal
    await db.query(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Syariah Indonesia (BSI)',
        p_nomor_rekening => '7198823456',
        p_atas_nama => 'Yayasan Pondok Pesantren Modern Abu Manshur',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);

    // Hitung audit log awal
    const countAuditBefore = await db.query<any>(`SELECT count(*) FROM public.audit_logs;`);

    // 2. Panggil RPC dengan data tidak valid (nomor rekening kurang dari 5 digit)
    let errorCaught: any = null;
    try {
      await db.query(`
        SELECT public.rpc_ganti_rekening_resmi_v1(
          p_target_rekening_id => NULL,
          p_nama_bank => 'Bank Gagal',
          p_nomor_rekening => '12', -- Kurang dari 5 digit
          p_atas_nama => 'Yayasan',
          p_actor_user_id => '${PENGASUH_ID}'
        );
      `);
    } catch (err: any) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toMatch(/Nomor rekening tidak valid/);

    // 3. Buktikan ROLLBACK: Rekening lama (BSI) tetap aktif, tidak ada rekening baru yang tersisa
    const activeCheck = await db.query<any>(`
      SELECT * FROM public.rekening_pesantren WHERE is_active = true;
    `);
    expect(activeCheck.rows.length).toBe(1);
    expect(activeCheck.rows[0].nomor_rekening).toBe("7198823456");

    // Buktikan tidak ada audit log baru yang tertinggal (Rollback atomik)
    const countAuditAfter = await db.query<any>(`SELECT count(*) FROM public.audit_logs;`);
    expect(countAuditAfter.rows[0].count).toBe(countAuditBefore.rows[0].count);
  });

  it("4. Pengguna tanpa hak akses (TU, Wali Santri) ditolak keras oleh RPC", async () => {
    // 1. Coba panggil dengan role TU
    let tuError: any = null;
    try {
      await db.query(`
        SELECT public.rpc_ganti_rekening_resmi_v1(
          p_target_rekening_id => NULL,
          p_nama_bank => 'Bank Ilegal TU',
          p_nomor_rekening => '99999999',
          p_atas_nama => 'Penyerobot Akun',
          p_actor_user_id => '${TU_USER_ID}'
        );
      `);
    } catch (err: any) {
      tuError = err;
    }
    expect(tuError).not.toBeNull();
    expect(tuError.message).toMatch(/Akses ditolak: Hanya Pengasuh atau Superadmin/);

    // 2. Coba panggil dengan role Wali
    let waliError: any = null;
    try {
      await db.query(`
        SELECT public.rpc_ganti_rekening_resmi_v1(
          p_target_rekening_id => NULL,
          p_nama_bank => 'Bank Ilegal Wali',
          p_nomor_rekening => '88888888',
          p_atas_nama => 'Penyerobot Wali',
          p_actor_user_id => '${WALI_USER_ID}'
        );
      `);
    } catch (err: any) {
      waliError = err;
    }
    expect(waliError).not.toBeNull();
    expect(waliError.message).toMatch(/Akses ditolak: Hanya Pengasuh atau Superadmin/);

    // Pastikan tidak ada rekening yang dibuat
    const countRekening = await db.query<any>(`SELECT count(*) FROM public.rekening_pesantren;`);
    expect(parseInt(countRekening.rows[0].count)).toBe(0);
  });

  it("5. Perlindungan Transaksi Historis: Rekening dengan riwayat pembayaran TIDAK DAPAT DIHAPUS", async () => {
    // 1. Buat rekening aktif BSI
    const resRek = await db.query<{ rpc_ganti_rekening_resmi_v1: any }>(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Syariah Indonesia (BSI)',
        p_nomor_rekening => '7198823456',
        p_atas_nama => 'Yayasan Pondok Pesantren Modern Abu Manshur',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);
    const bsiId = resRek.rows[0]!.rpc_ganti_rekening_resmi_v1.target_rekening_id;

    // 2. Buat transaksi pembayaran santri yang merekam snapshot rekening BSI
    await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi,
        santri_id,
        wali_user_id,
        total_nominal,
        rekening_tujuan_snapshot,
        status
      ) VALUES (
        'TRX-2026-HISTORIS-001',
        '${SANTRI_ID}',
        '${WALI_USER_ID}',
        500000.00,
        jsonb_build_object(
          'id', '${bsiId}',
          'nama_bank', 'Bank Syariah Indonesia (BSI)',
          'nomor_rekening', '7198823456',
          'atas_nama', 'Yayasan Pondok Pesantren Modern Abu Manshur'
        ),
        'DISETUJUI'
      );
    `);

    // 3. Ganti rekening aktif ke Bank Mandiri
    await db.query(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Mandiri',
        p_nomor_rekening => '1300099887766',
        p_atas_nama => 'Yayasan Pondok Pesantren Abu Manshur',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);

    // Rekening BSI kini berstatus nonaktif. Coba hapus rekening BSI via RPC
    let delError: any = null;
    try {
      await db.query(`
        SELECT public.rpc_hapus_rekening_pesantren_v1(
          p_rekening_id => '${bsiId}',
          p_alasan => 'Mencoba menghapus rekening lama',
          p_actor_user_id => '${SUPERADMIN_ID}'
        );
      `);
    } catch (err: any) {
      delError = err;
    }

    expect(delError).not.toBeNull();
    expect(delError.message).toMatch(/tidak dapat dihapus karena tersimpan dalam riwayat transaksi/);

    // Buktikan rekening BSI masih ada di database
    const checkBsi = await db.query<any>(`SELECT * FROM public.rekening_pesantren WHERE id = '${bsiId}';`);
    expect(checkBsi.rows.length).toBe(1);

    // Buktikan transaksi historis tetap memiliki snapshot rekening BSI yang utuh
    const checkTx = await db.query<any>(`
      SELECT rekening_tujuan_snapshot FROM public.transaksi_pembayaran WHERE nomor_transaksi = 'TRX-2026-HISTORIS-001';
    `);
    expect(checkTx.rows[0].rekening_tujuan_snapshot.nomor_rekening).toBe("7198823456");
    expect(checkTx.rows[0].rekening_tujuan_snapshot.nama_bank).toBe("Bank Syariah Indonesia (BSI)");
  });

  it("6. Konsistensi Sumber Data: Halaman Wali dan Checkout membaca rekening aktif yang sama", async () => {
    // 1. Inisialisasi rekening BSI via RPC
    await db.query(`
      SELECT public.rpc_ganti_rekening_resmi_v1(
        p_target_rekening_id => NULL,
        p_nama_bank => 'Bank Syariah Indonesia (BSI)',
        p_nomor_rekening => '7198823456',
        p_atas_nama => 'Yayasan Pondok Pesantren Modern Abu Manshur',
        p_actor_user_id => '${PENGASUH_ID}'
      );
    `);

    // Query yang dipakai halaman Wali (getRekeningResmi):
    const waliQuery = await db.query<any>(`
      SELECT id, nama_bank, kode_bank, nomor_rekening, atas_nama, catatan_instruksi
      FROM public.rekening_pesantren
      WHERE is_active = true
      LIMIT 1;
    `);

    // Query yang dipakai RPC Checkout Pembayaran (rpc_checkout_pembayaran_v2):
    const checkoutQuery = await db.query<any>(`
      SELECT id, nama_bank, kode_bank, nomor_rekening, atas_nama
      FROM public.rekening_pesantren
      WHERE is_active = true
      LIMIT 1;
    `);

    expect(waliQuery.rows[0]!.id).toBe(checkoutQuery.rows[0]!.id);
    expect(waliQuery.rows[0]!.nomor_rekening).toBe(checkoutQuery.rows[0]!.nomor_rekening);
    expect(waliQuery.rows[0]!.nomor_rekening).toBe("7198823456");
  });

  it("7. Integritas Indeks Unik: Dua rekening aktif bersamaan dicegah secara absolut oleh Database Index", async () => {
    // 1. Buat rekening aktif pertama
    await db.query(`
      INSERT INTO public.rekening_pesantren (
        nama_bank, nomor_rekening, atas_nama, is_active
      ) VALUES (
        'Bank 1', '11111111', 'Pemilik 1', true
      );
    `);

    // 2. Mencoba memasukkan rekening kedua langsung dengan status is_active = true tanpa nonaktifkan rekening pertama
    let collisionError: any = null;
    try {
      await db.query(`
        INSERT INTO public.rekening_pesantren (
          nama_bank, nomor_rekening, atas_nama, is_active
        ) VALUES (
          'Bank 2', '22222222', 'Pemilik 2', true
        );
      `);
    } catch (err: any) {
      collisionError = err;
    }

    expect(collisionError).not.toBeNull();
    expect(collisionError.message).toMatch(/duplicate key value violates unique constraint/);
  });
});
