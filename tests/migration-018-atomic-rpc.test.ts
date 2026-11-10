import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 018: Validasi Atomisitas & Keamanan RPC Transaksi Keuangan", () => {
  const migration018Path = path.resolve(__dirname, "../supabase/migrations/018_transaksi_keuangan_atomic_rpc.sql");
  const migration018Sql = fs.readFileSync(migration018Path, "utf8");

  let db: PGlite;

  const ID_WALI = "11111111-1111-1111-1111-111111111111";
  const ID_WALI_LAIN = "22222222-2222-2222-2222-222222222222";
  const ID_BENDAHARA = "33333333-3333-3333-3333-333333333333";
  const ID_ASATIDZ = "44444444-4444-4444-4444-444444444444";
  const ID_TU = "55555555-5555-5555-5555-555555555555";
  const ID_SANTRI_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ID_SANTRI_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Auth & Roles
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE TYPE public.user_role AS ENUM (
        'superadmin', 'admin', 'bendahara', 'pengelola', 'wali', 'tu'
      );
      CREATE TYPE public.status_santri AS ENUM ('AKTIF', 'CUTI', 'LULUS', 'PINDAH', 'TIDAK_AKTIF');
      CREATE TYPE public.kebijakan_cicilan AS ENUM ('TIDAK_BOLEH', 'MINIMAL_NOMINAL', 'BEBAS');
      CREATE TYPE public.status_tagihan AS ENUM ('BELUM_BAYAR', 'DIBAYAR_SEBAGIAN', 'LUNAS', 'DIBATALKAN');
      CREATE TYPE public.status_transaksi AS ENUM ('MENUNGGU_TRANSFER', 'MENUNGGU_VERIFIKASI', 'DISETUJUI', 'DITOLAK', 'KEDALUWARSA', 'DIBATALKAN');
      CREATE TYPE public.jenis_mutasi_saku AS ENUM ('MASUK', 'KELUAR', 'PENYESUAIAN_TAMBAH', 'PENYESUAIAN_KURANG');

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        role public.user_role NOT NULL,
        nama_lengkap TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE public.santri (
        id UUID PRIMARY KEY,
        nis TEXT UNIQUE NOT NULL,
        nama_lengkap TEXT NOT NULL,
        status public.status_santri NOT NULL DEFAULT 'AKTIF'
      );

      CREATE TABLE public.wali_santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        nama_lengkap TEXT NOT NULL,
        hubungan TEXT NOT NULL DEFAULT 'Ayah'
      );

      CREATE TABLE public.rekening_pesantren (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_bank TEXT NOT NULL,
        kode_bank TEXT NOT NULL,
        nomor_rekening TEXT NOT NULL,
        atas_nama TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE public.tagihan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_tagihan TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        judul_tagihan TEXT NOT NULL,
        nominal_awal NUMERIC(15, 2) NOT NULL CHECK (nominal_awal > 0),
        nominal_penyesuaian NUMERIC(15, 2) NOT NULL DEFAULT 0,
        nominal_tagihan NUMERIC(15, 2) GENERATED ALWAYS AS (nominal_awal + nominal_penyesuaian) STORED,
        total_terbayar NUMERIC(15, 2) NOT NULL DEFAULT 0,
        sisa_tagihan NUMERIC(15, 2) GENERATED ALWAYS AS (nominal_awal + nominal_penyesuaian - total_terbayar) STORED,
        kebijakan_cicilan_snapshot public.kebijakan_cicilan NOT NULL DEFAULT 'TIDAK_BOLEH',
        minimal_cicilan_snapshot NUMERIC(15, 2),
        status public.status_tagihan NOT NULL DEFAULT 'BELUM_BAYAR',
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE public.transaksi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_transaksi TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        total_nominal NUMERIC(15, 2) NOT NULL,
        rekening_tujuan_snapshot JSONB NOT NULL,
        tanggal_transfer DATE,
        nama_pengirim TEXT,
        bank_pengirim TEXT,
        bukti_transfer_path TEXT,
        status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_TRANSFER',
        verified_by UUID REFERENCES public.profiles(id),
        verified_at TIMESTAMPTZ,
        catatan_verifikasi TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE public.alokasi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaksi_id UUID NOT NULL REFERENCES public.transaksi_pembayaran(id) ON DELETE CASCADE,
        tagihan_id UUID NOT NULL REFERENCES public.tagihan(id),
        nominal_alokasi NUMERIC(15, 2) NOT NULL CHECK (nominal_alokasi > 0)
      );

      CREATE TABLE public.keranjang_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        tagihan_id UUID NOT NULL REFERENCES public.tagihan(id),
        nominal_bayar NUMERIC(15, 2) NOT NULL
      );

      CREATE TABLE public.pengajuan_uang_saku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_pengajuan TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        nominal NUMERIC(15, 2) NOT NULL CHECK (nominal > 0),
        rekening_tujuan_snapshot JSONB NOT NULL,
        tanggal_transfer DATE NOT NULL DEFAULT CURRENT_DATE,
        nama_pengirim TEXT NOT NULL,
        bank_pengirim TEXT,
        bukti_transfer_path TEXT NOT NULL,
        keterangan TEXT,
        status public.status_transaksi NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
        verified_by UUID REFERENCES public.profiles(id),
        verified_at TIMESTAMPTZ,
        catatan_verifikasi TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE public.saldo_uang_saku (
        santri_id UUID PRIMARY KEY REFERENCES public.santri(id),
        saldo_saat_ini NUMERIC(15, 2) NOT NULL DEFAULT 0,
        total_masuk NUMERIC(15, 2) NOT NULL DEFAULT 0,
        total_keluar NUMERIC(15, 2) NOT NULL DEFAULT 0,
        total_penyesuaian NUMERIC(15, 2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE public.mutasi_uang_saku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_transaksi TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        jenis_mutasi public.jenis_mutasi_saku NOT NULL,
        nominal NUMERIC(15, 2) NOT NULL,
        saldo_sebelum NUMERIC(15, 2) NOT NULL,
        saldo_sesudah NUMERIC(15, 2) NOT NULL,
        keterangan TEXT NOT NULL,
        pengajuan_id UUID UNIQUE REFERENCES public.pengajuan_uang_saku(id),
        petugas_id UUID NOT NULL REFERENCES public.profiles(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE public.notifikasi (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID,
        jenis_notifikasi TEXT NOT NULL,
        judul TEXT NOT NULL,
        pesan TEXT NOT NULL,
        tautan TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );

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

      -- Seed Data Dasar
      INSERT INTO public.profiles (id, role, nama_lengkap) VALUES
        ('${ID_WALI}', 'wali', 'Bapak Wali Santri 1'),
        ('${ID_WALI_LAIN}', 'wali', 'Bapak Wali Santri 2'),
        ('${ID_BENDAHARA}', 'bendahara', 'Ustadz Bendahara'),
        ('${ID_ASATIDZ}', 'pengelola', 'Ustadz Asatidz'),
        ('${ID_TU}', 'tu', 'Staf Tata Usaha');

      INSERT INTO public.santri (id, nis, nama_lengkap) VALUES
        ('${ID_SANTRI_1}', 'NIS-001', 'Ahmad Santri 1'),
        ('${ID_SANTRI_2}', 'NIS-002', 'Budi Santri 2');

      INSERT INTO public.wali_santri (user_id, santri_id, nama_lengkap) VALUES
        ('${ID_WALI}', '${ID_SANTRI_1}', 'Bapak Wali Santri 1'),
        ('${ID_WALI_LAIN}', '${ID_SANTRI_2}', 'Bapak Wali Santri 2');

      INSERT INTO public.rekening_pesantren (nama_bank, kode_bank, nomor_rekening, atas_nama) VALUES
        ('Bank Syariah Indonesia', '451', '1234567890', 'Pesantren Abu Manshur');
    `);

    // 2. Eksekusi file DRAF Migration 018
    await db.exec(migration018Sql);
  });

  // Helper untuk switch auth user
  const asUser = async (userId: string) => {
    await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
  };

  // --------------------------------------------------------------------------
  // UJI 1: Validasi Sintaks dan Keberadaan Function RPC v2
  // --------------------------------------------------------------------------
  it("1. Draf Migration 018 berhasil dieksekusi tanpa error sintaks pada PostgreSQL/PGlite", async () => {
    const res = await db.query(`
      SELECT proname FROM pg_proc WHERE proname IN (
        'rpc_checkout_pembayaran_v2',
        'rpc_verifikasi_pembayaran_v2',
        'rpc_verifikasi_topup_uang_saku_v2'
      );
    `);
    expect(res.rows.length).toBe(3);
  });

  // --------------------------------------------------------------------------
  // UJI 2: rpc_checkout_pembayaran_v2
  // --------------------------------------------------------------------------
  it("2. rpc_checkout_pembayaran_v2: Menolak checkout jika role bukan wali atau mencoba bayar santri orang lain", async () => {
    // Buat tagihan untuk santri 1
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-001', '${ID_SANTRI_1}', 'SPP November', 500000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    // Asatidz mencoba checkout -> Ditolak
    await asUser(ID_ASATIDZ);
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 500000}]'::jsonb,
          CURRENT_DATE,
          'Pengirim Asatidz',
          'BSI',
          'bukti.jpg'
        );
      `)
    ).rejects.toThrow(/Hanya akun Wali Santri resmi yang dapat melakukan pembayaran/);

    // Wali Lain mencoba checkout santri 1 -> Ditolak karena santri 1 milik Wali 1
    await asUser(ID_WALI_LAIN);
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 500000}]'::jsonb,
          CURRENT_DATE,
          'Pengirim Palsu',
          'BSI',
          'bukti.jpg'
        );
      `)
    ).rejects.toThrow(/Santri yang dipilih tidak terhubung dengan akun Anda/);
  });

  it("3. rpc_checkout_pembayaran_v2: Berhasil checkout atomik untuk wali sah, mengunci tagihan, dan menghapus keranjang", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-002', '${ID_SANTRI_1}', 'Uang Seragam', 750000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    // Masukkan ke keranjang
    await db.query(`
      INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar)
      VALUES ('${ID_WALI}', '${ID_SANTRI_1}', '${tagihanId}', 750000);
    `);

    await asUser(ID_WALI);
    const checkoutRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 750000}]'::jsonb,
        CURRENT_DATE,
        'H. Abdullah',
        'BSI',
        '${ID_SANTRI_1}/bukti-transfer-750.jpg'
      ) AS res;
    `);

    const result = (checkoutRes.rows[0] as any).res;
    expect(result.ok).toBe(true);
    expect(result.total_nominal).toBe(750000);
    expect(result.status).toBe("MENUNGGU_VERIFIKASI");

    // Pastikan transaksi dan alokasi tersimpan
    const trxRows = await db.query(`SELECT * FROM public.transaksi_pembayaran WHERE id = '${result.transaksi_id}';`);
    expect(trxRows.rows.length).toBe(1);

    const alokasiRows = await db.query(`SELECT * FROM public.alokasi_pembayaran WHERE transaksi_id = '${result.transaksi_id}';`);
    expect(alokasiRows.rows.length).toBe(1);

    // Pastikan keranjang sudah bersih
    const keranjangRows = await db.query(`SELECT * FROM public.keranjang_pembayaran WHERE wali_user_id = '${ID_WALI}';`);
    expect(keranjangRows.rows.length).toBe(0);

    // Pastikan audit log tercatat dengan objek_id dan waktu
    const auditRows = await db.query(`SELECT * FROM public.audit_logs WHERE jenis_objek = 'transaksi_pembayaran' AND objek_id = '${result.transaksi_id}';`);
    expect(auditRows.rows.length).toBe(1);
    expect((auditRows.rows[0] as any).aktivitas).toBe("CHECKOUT_PEMBAYARAN_RPC_V2");
  });

  it("3b. rpc_checkout_pembayaran_v2: Menolak bukti transfer yang tidak berada dalam folder santri yang bersangkutan", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-002B', '${ID_SANTRI_1}', 'Uang Gedung', 1000000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    await asUser(ID_WALI);
    // Path tanpa prefix santri_id
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 1000000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          'bukti-di-root.jpg'
        );
      `)
    ).rejects.toThrow(/Bukti transfer tidak valid atau tidak terisolasi/);

    // Path menggunakan santri lain
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 1000000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          '${ID_SANTRI_2}/bukti-santri-lain.jpg'
        );
      `)
    ).rejects.toThrow(/Bukti transfer tidak valid atau tidak terisolasi/);
  });

  it("3c. rpc_checkout_pembayaran_v2: Menolak tagihan duplikat dalam satu payload checkout", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-DUP', '${ID_SANTRI_1}', 'Biaya Ujian', 300000, 'BEBAS')
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    await asUser(ID_WALI);
    // Payload menduplikat tagihan yang sama
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 150000}, {"tagihan_id": "${tagihanId}", "nominal_bayar": 150000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          '${ID_SANTRI_1}/bukti.jpg'
        );
      `)
    ).rejects.toThrow(/Tagihan duplikat terdeteksi dalam permohonan pembayaran/);
  });

  it("3d. rpc_checkout_pembayaran_v2: Menolak cicilan sebagian pada tagihan berstatus TIDAK_BOLEH dicicil", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-NOCICIL', '${ID_SANTRI_1}', 'Iuran Tahunan', 600000, 'TIDAK_BOLEH')
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    await asUser(ID_WALI);
    // Bayar separuh padahal TIDAK_BOLEH dicicil
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 300000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          '${ID_SANTRI_1}/bukti.jpg'
        );
      `)
    ).rejects.toThrow(/memiliki kebijakan TIDAK_BOLEH dicicil/);
  });

  it("3e. rpc_checkout_pembayaran_v2: Mencegah over-allocation saat ada pengajuan lain yang sedang MENUNGGU_VERIFIKASI", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-CONCURRENT', '${ID_SANTRI_1}', 'SPP Bebas', 500000, 'BEBAS')
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    // Wali mengajukan pembayaran pertama 350.000 (status MENUNGGU_VERIFIKASI)
    await asUser(ID_WALI);
    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 350000}]'::jsonb,
        CURRENT_DATE,
        'H. Abdullah',
        'BSI',
        '${ID_SANTRI_1}/bukti-1.jpg'
      );
    `);

    // Sisa tagihan di tabel masih 500.000 karena belum diverifikasi, namun sisa yang tersedia hanya 150.000!
    // Wali mencoba checkout lagi 200.000 -> Harus DITOLAK karena 350k + 200k > 500k
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          '${ID_SANTRI_1}/bukti-2.jpg'
        );
      `)
    ).rejects.toThrow(/melebihi sisa kewajiban yang dapat diajukan/);

    // Checkout sisa persis 150.000 -> BERHASIL
    const okRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 150000}]'::jsonb,
        CURRENT_DATE,
        'H. Abdullah',
        'BSI',
        '${ID_SANTRI_1}/bukti-3.jpg'
      ) AS res;
    `);
    expect((okRes.rows[0] as any).res.ok).toBe(true);

    // Sekarang sisa tersedia = 0, mencoba checkout lagi -> DITOLAK (sisa tagihan telah terpenuhi sementara)
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 50000}]'::jsonb,
          CURRENT_DATE,
          'H. Abdullah',
          'BSI',
          '${ID_SANTRI_1}/bukti-4.jpg'
        );
      `)
    ).rejects.toThrow(/sisa tagihan telah terpenuhi sementara/);
  });

  // --------------------------------------------------------------------------
  // UJI 3: rpc_verifikasi_pembayaran_v2
  // --------------------------------------------------------------------------
  it("4. rpc_verifikasi_pembayaran_v2: Hanya Bendahara yang boleh verifikasi, dan menolak double approval", async () => {
    // Buat tagihan dan transaksi MENUNGGU_VERIFIKASI
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-003', '${ID_SANTRI_1}', 'SPP Desember', 400000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    const trxRes = await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot, status
      ) VALUES (
        'TRX-TEST-003', '${ID_SANTRI_1}', '${ID_WALI}', 400000, '{}'::jsonb, 'MENUNGGU_VERIFIKASI'
      ) RETURNING id;
    `);
    const trxId = (trxRes.rows[0] as any).id;

    await db.query(`
      INSERT INTO public.alokasi_pembayaran (transaksi_id, tagihan_id, nominal_alokasi)
      VALUES ('${trxId}', '${tagihanId}', 400000);
    `);

    // TU mencoba memverifikasi -> DITOLAK
    await asUser(ID_TU);
    await expect(
      db.query(`SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DISETUJUI', 'Sah');`)
    ).rejects.toThrow(/OTORISASI DITOLAK: Hanya Bendahara Pesantren/);

    // Bendahara memverifikasi -> BERHASIL
    await asUser(ID_BENDAHARA);
    const verifRes = await db.query(`
      SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DISETUJUI', 'Bukti valid dan transfer masuk.') AS res;
    `);
    const resJson = (verifRes.rows[0] as any).res;
    expect(resJson.ok).toBe(true);

    // Cek tagihan sudah LUNAS
    const tghCheck = await db.query(`SELECT status, total_terbayar, sisa_tagihan FROM public.tagihan WHERE id = '${tagihanId}';`);
    expect((tghCheck.rows[0] as any).status).toBe("LUNAS");
    expect(Number((tghCheck.rows[0] as any).total_terbayar)).toBe(400000);
    expect(Number((tghCheck.rows[0] as any).sisa_tagihan)).toBe(0);

    // Coba verifikasi ulang transaksi yang sama -> DITOLAK (Pencegahan Double Processing)
    await expect(
      db.query(`SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DISETUJUI', 'Verifikasi ulang');`)
    ).rejects.toThrow(/sudah diproses sebelumnya/);
  });

  it("4b. rpc_verifikasi_pembayaran_v2: Menolak verifikasi jika total alokasi tidak sesuai nominal transaksi", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-SUM-MISMATCH', '${ID_SANTRI_1}', 'SPP Januari', 500000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    // Transaksi bernominal 500.000 tetapi alokasinya hanya 300.000
    const trxRes = await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot, status
      ) VALUES (
        'TRX-MISMATCH-001', '${ID_SANTRI_1}', '${ID_WALI}', 500000, '{}'::jsonb, 'MENUNGGU_VERIFIKASI'
      ) RETURNING id;
    `);
    const trxId = (trxRes.rows[0] as any).id;

    await db.query(`
      INSERT INTO public.alokasi_pembayaran (transaksi_id, tagihan_id, nominal_alokasi)
      VALUES ('${trxId}', '${tagihanId}', 300000);
    `);

    await asUser(ID_BENDAHARA);
    await expect(
      db.query(`SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DISETUJUI', 'Setujui');`)
    ).rejects.toThrow(/Total alokasi \(Rp 300000\.00\) tidak sesuai dengan total nominal transaksi/);
  });

  it("4c. rpc_verifikasi_pembayaran_v2: Wajib mengisi alasan penolakan jika status DITOLAK", async () => {
    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REJECT-TGT', '${ID_SANTRI_1}', 'SPP Februari', 500000)
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    const trxRes = await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot, status
      ) VALUES (
        'TRX-REJECT-001', '${ID_SANTRI_1}', '${ID_WALI}', 500000, '{}'::jsonb, 'MENUNGGU_VERIFIKASI'
      ) RETURNING id;
    `);
    const trxId = (trxRes.rows[0] as any).id;

    await db.query(`
      INSERT INTO public.alokasi_pembayaran (transaksi_id, tagihan_id, nominal_alokasi)
      VALUES ('${trxId}', '${tagihanId}', 500000);
    `);

    await asUser(ID_BENDAHARA);
    // Tolak tanpa catatan -> Gagal
    await expect(
      db.query(`SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DITOLAK', '');`)
    ).rejects.toThrow(/Alasan penolakan verifikasi wajib diisi minimal 3 karakter/);

    // Tolak dengan catatan -> Berhasil
    const rejectRes = await db.query(`
      SELECT public.rpc_verifikasi_pembayaran_v2('${trxId}', 'DITOLAK', 'Bukti buram dan tidak terbaca') AS res;
    `);
    expect((rejectRes.rows[0] as any).res.ok).toBe(true);
    expect((rejectRes.rows[0] as any).res.status).toBe("DITOLAK");

    // Tagihan tetap BELUM_BAYAR
    const tghCheck = await db.query(`SELECT status, total_terbayar FROM public.tagihan WHERE id = '${tagihanId}';`);
    expect((tghCheck.rows[0] as any).status).toBe("BELUM_BAYAR");
    expect(Number((tghCheck.rows[0] as any).total_terbayar)).toBe(0);

    // Notifikasi terkirim dengan canonical type PEMBAYARAN_DITOLAK
    const notif = await db.query(`SELECT * FROM public.notifikasi WHERE user_id = '${ID_WALI}' AND jenis_notifikasi = 'PEMBAYARAN_DITOLAK';`);
    expect(notif.rows.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // UJI 4: rpc_verifikasi_topup_uang_saku_v2
  // --------------------------------------------------------------------------
  it("5. rpc_verifikasi_topup_uang_saku_v2: Menambah saldo atomik dan menolak penambahan ganda", async () => {
    const topupRes = await db.query(`
      INSERT INTO public.pengajuan_uang_saku (
        nomor_pengajuan, santri_id, wali_user_id, nominal, rekening_tujuan_snapshot, nama_pengirim, bukti_transfer_path, status
      ) VALUES (
        'TOP-001', '${ID_SANTRI_1}', '${ID_WALI}', 150000, '{}'::jsonb, 'Bapak Ahmad', 'bukti.jpg', 'MENUNGGU_VERIFIKASI'
      ) RETURNING id;
    `);
    const topupId = (topupRes.rows[0] as any).id;

    // Bendahara verifikasi
    await asUser(ID_BENDAHARA);
    const verifRes = await db.query(`
      SELECT public.rpc_verifikasi_topup_uang_saku_v2('${topupId}', 'DISETUJUI', 'Dana saku masuk.') AS res;
    `);
    const result = (verifRes.rows[0] as any).res;
    expect(result.ok).toBe(true);
    expect(result.saldo_akhir).toBe(150000);

    // Pastikan saldo terupdate
    const saldoRow = await db.query(`SELECT * FROM public.saldo_uang_saku WHERE santri_id = '${ID_SANTRI_1}';`);
    expect(Number((saldoRow.rows[0] as any).saldo_saat_ini)).toBe(150000);
    expect(Number((saldoRow.rows[0] as any).total_masuk)).toBe(150000);

    // Pastikan mutasi ledger tercatat
    const mutasiRow = await db.query(`SELECT * FROM public.mutasi_uang_saku WHERE pengajuan_id = '${topupId}';`);
    expect(mutasiRow.rows.length).toBe(1);
    expect((mutasiRow.rows[0] as any).jenis_mutasi).toBe("MASUK");
    expect(Number((mutasiRow.rows[0] as any).nominal)).toBe(150000);

    // Verifikasi kedua kali pada pengajuan yang sama DITOLAK
    await expect(
      db.query(`SELECT public.rpc_verifikasi_topup_uang_saku_v2('${topupId}', 'DISETUJUI', 'Coba lagi');`)
    ).rejects.toThrow(/sudah diproses sebelumnya/);

    // Saldo tetap 150000 (TIDAK bertambah menjadi 300000)
    const saldoAfter = await db.query(`SELECT saldo_saat_ini FROM public.saldo_uang_saku WHERE santri_id = '${ID_SANTRI_1}';`);
    expect(Number((saldoAfter.rows[0] as any).saldo_saat_ini)).toBe(150000);
  });

  // --------------------------------------------------------------------------
  // UJI 5: Validasi Objek Penyimpanan (Storage.objects) & Rollback Atomik
  // --------------------------------------------------------------------------
  it("6. rpc_checkout_pembayaran_v2: Memvalidasi keberadaan file di storage.objects jika schema storage terpasang", async () => {
    // Siapkan schema storage dan table storage.objects seperti di Supabase Cloud
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL,
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const tagihanRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-STORAGE-TEST', '${ID_SANTRI_1}', 'Infaq', 200000, 'BEBAS')
      RETURNING id;
    `);
    const tagihanId = (tagihanRes.rows[0] as any).id;

    await asUser(ID_WALI);
    const validPath = `${ID_SANTRI_1}/bukti-transfer-asli.jpg`;

    // 1. File belum diunggah ke storage -> DITOLAK
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          CURRENT_DATE,
          'Wali Sah',
          'BSI',
          '${validPath}'
        );
      `)
    ).rejects.toThrow(/tidak ditemukan pada penyimpanan pesantren \(bucket bukti-pembayaran\)/);

    // 2. File diunggah ke storage.objects pada bucket bukti-pembayaran
    await db.query(`
      INSERT INTO storage.objects (bucket_id, name, owner)
      VALUES ('bukti-pembayaran', '${validPath}', '${ID_WALI}');
    `);

    // Sekarang checkout BERHASIL
    const okRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
        CURRENT_DATE,
        'Wali Sah',
        'BSI',
        '${validPath}'
      ) AS res;
    `);
    expect((okRes.rows[0] as any).res.ok).toBe(true);
  });

  it("7. rpc_checkout_pembayaran_v2: Rollback penuh jika salah satu tagihan gagal dalam transaksi multi-item", async () => {
    const tgh1 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-ROLLBACK-1', '${ID_SANTRI_1}', 'Biaya Buku', 100000, 'BEBAS')
      RETURNING id;
    `);
    const tgh1Id = (tgh1.rows[0] as any).id;

    // Tagihan 2 berstatus LUNAS sehingga tidak bisa dibayar
    const tgh2 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, total_terbayar, status)
      VALUES ('TGH-ROLLBACK-2', '${ID_SANTRI_1}', 'Biaya Lab', 100000, 100000, 'LUNAS')
      RETURNING id;
    `);
    const tgh2Id = (tgh2.rows[0] as any).id;

    // Masukkan tagihan 1 ke keranjang
    await db.query(`
      INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar)
      VALUES ('${ID_WALI}', '${ID_SANTRI_1}', '${tgh1Id}', 100000);
    `);

    await asUser(ID_WALI);
    // Checkout 2 tagihan di mana tagihan 2 tidak valid
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tgh1Id}", "nominal_bayar": 100000}, {"tagihan_id": "${tgh2Id}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Rollback Test',
          'BSI',
          NULL
        );
      `)
    ).rejects.toThrow(/sudah lunas atau tidak aktif/);

    // Integritas Database: Keranjang TIDAK terhapus (Rollback bekerja penuh)
    const keranjangRows = await db.query(`SELECT * FROM public.keranjang_pembayaran WHERE wali_user_id = '${ID_WALI}';`);
    expect(keranjangRows.rows.length).toBe(1);

    // Tidak ada transaksi baru yang terbentuk
    const trxRows = await db.query(`SELECT * FROM public.transaksi_pembayaran WHERE nama_pengirim = 'Wali Rollback Test';`);
    expect(trxRows.rows.length).toBe(0);

    // Tidak ada alokasi baru yang terbentuk
    const alokasiRows = await db.query(`SELECT * FROM public.alokasi_pembayaran WHERE tagihan_id = '${tgh1Id}';`);
    expect(alokasiRows.rows.length).toBe(0);
  });

  it("8. rpc_checkout_pembayaran_v2: Hanya menghapus item yang dibayar dari keranjang, item lain tetap tersimpan", async () => {
    const tghA = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-CART-A', '${ID_SANTRI_1}', 'Uang Makan Nov', 150000, 'BEBAS')
      RETURNING id;
    `);
    const tghAId = (tghA.rows[0] as any).id;

    const tghB = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-CART-B', '${ID_SANTRI_1}', 'Uang Asrama Nov', 250000, 'BEBAS')
      RETURNING id;
    `);
    const tghBId = (tghB.rows[0] as any).id;

    // Masukkan kedua tagihan ke keranjang
    await db.query(`
      INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar)
      VALUES
        ('${ID_WALI}', '${ID_SANTRI_1}', '${tghAId}', 150000),
        ('${ID_WALI}', '${ID_SANTRI_1}', '${tghBId}', 250000);
    `);

    // Wali HANYA checkout tagihan A (tagihan B belum dibayar/disimpan untuk nanti)
    await asUser(ID_WALI);
    const checkoutRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tghAId}", "nominal_bayar": 150000}]'::jsonb,
        CURRENT_DATE,
        'Wali Parsial',
        'BSI',
        NULL
      ) AS res;
    `);
    expect((checkoutRes.rows[0] as any).res.ok).toBe(true);

    // Verifikasi keranjang: Tagihan A terhapus, Tagihan B TETAP ADA di keranjang!
    const remainingCart = await db.query(`
      SELECT tagihan_id, nominal_bayar FROM public.keranjang_pembayaran
      WHERE wali_user_id = '${ID_WALI}' AND santri_id = '${ID_SANTRI_1}';
    `);
    expect(remainingCart.rows.length).toBe(1);
    expect((remainingCart.rows[0] as any).tagihan_id).toBe(tghBId);
    expect(Number((remainingCart.rows[0] as any).nominal_bayar)).toBe(250000);
  });

  it("9. rpc_checkout_pembayaran_v2: Transaksi MENUNGGU_TRANSFER > 24 jam otomatis KEDALUWARSA dan alokasi dilepas", async () => {
    const tghExpire = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-EXPIRE-TEST', '${ID_SANTRI_1}', 'Kegiatan Ekstrakurikuler', 300000, 'BEBAS')
      RETURNING id;
    `);
    const tghExpireId = (tghExpire.rows[0] as any).id;

    // Buat transaksi MENUNGGU_TRANSFER lama (created_at 30 jam yang lalu)
    const oldTrxRes = await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot, status, created_at
      ) VALUES (
        'TRX-OLD-ABANDONED', '${ID_SANTRI_1}', '${ID_WALI}', 300000, '{}'::jsonb, 'MENUNGGU_TRANSFER', now() - INTERVAL '30 hours'
      ) RETURNING id;
    `);
    const oldTrxId = (oldTrxRes.rows[0] as any).id;

    await db.query(`
      INSERT INTO public.alokasi_pembayaran (transaksi_id, tagihan_id, nominal_alokasi)
      VALUES ('${oldTrxId}', '${tghExpireId}', 300000);
    `);

    // Sekarang wali melakukan checkout baru pada tagihan yang sama
    // Transaksi lama harus otomatis berubah menjadi KEDALUWARSA dan checkout baru berhasil tanpa over-allocation error!
    await asUser(ID_WALI);
    const checkoutRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tghExpireId}", "nominal_bayar": 300000}]'::jsonb,
        CURRENT_DATE,
        'Wali Baru',
        'BSI',
        NULL
      ) AS res;
    `);
    expect((checkoutRes.rows[0] as any).res.ok).toBe(true);

    // Cek status transaksi lama telah menjadi KEDALUWARSA
    const oldTrxCheck = await db.query(`SELECT status FROM public.transaksi_pembayaran WHERE id = '${oldTrxId}';`);
    expect((oldTrxCheck.rows[0] as any).status).toBe("KEDALUWARSA");

    // Pastikan notifikasi kedaluwarsa diterima wali
    const notifCheck = await db.query(`
      SELECT * FROM public.notifikasi
      WHERE user_id = '${ID_WALI}' AND judul = 'Batas Waktu Pembayaran Berakhir';
    `);
    expect(notifCheck.rows.length).toBe(1);

    // Pastikan audit log tercatat
    const auditCheck = await db.query(`
      SELECT * FROM public.audit_logs
      WHERE jenis_objek = 'transaksi_pembayaran' AND aktivitas = 'TRANSAKSI_KEDALUWARSA_OTOMATIS' AND objek_id = '${oldTrxId}';
    `);
    expect(auditCheck.rows.length).toBe(1);

    // Pastikan transaksi MENUNGGU_VERIFIKASI tidak pernah ikut kedaluwarsa
    const verifTrxRes = await db.query(`
      INSERT INTO public.transaksi_pembayaran (
        nomor_transaksi, santri_id, wali_user_id, total_nominal, rekening_tujuan_snapshot, status, created_at
      ) VALUES (
        'TRX-OLD-VERIF', '${ID_SANTRI_1}', '${ID_WALI}', 100000, '{}'::jsonb, 'MENUNGGU_VERIFIKASI', now() - INTERVAL '72 hours'
      ) RETURNING id;
    `);
    const verifTrxId = (verifTrxRes.rows[0] as any).id;

    // Trigger checkout lain
    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tghExpireId}", "nominal_bayar": 10000}]'::jsonb,
        CURRENT_DATE,
        'Wali Trigger',
        'BSI',
        NULL
      );
    `).catch(() => {}); // Biarkan jika nominal melebihi sisa

    // Pastikan status TRX-OLD-VERIF tetap MENUNGGU_VERIFIKASI
    const verifCheck = await db.query(`SELECT status FROM public.transaksi_pembayaran WHERE id = '${verifTrxId}';`);
    expect((verifCheck.rows[0] as any).status).toBe("MENUNGGU_VERIFIKASI");
  });
});

