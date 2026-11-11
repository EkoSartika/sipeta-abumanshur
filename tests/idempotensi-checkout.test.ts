import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 019: Final Database-Level Idempotency & Normalization Test Suite", () => {
  const migration019Path = path.resolve(__dirname, "../supabase/migrations/019_idempotensi_checkout_pembayaran.sql");
  const migration019Sql = fs.readFileSync(migration019Path, "utf8");

  let db: PGlite;

  const ID_WALI_1 = "11111111-1111-1111-1111-111111111111";
  const ID_WALI_2 = "22222222-2222-2222-2222-222222222222";
  const ID_SANTRI_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ID_SANTRI_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Skema Dasar Mirip Supabase Production (0001 - 018)
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE TYPE public.user_role AS ENUM ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali', 'tu');
      CREATE TYPE public.status_santri AS ENUM ('AKTIF', 'CUTI', 'LULUS', 'PINDAH', 'TIDAK_AKTIF');
      CREATE TYPE public.kebijakan_cicilan AS ENUM ('TIDAK_BOLEH', 'MINIMAL_NOMINAL', 'BEBAS');
      CREATE TYPE public.status_tagihan AS ENUM ('BELUM_BAYAR', 'DIBAYAR_SEBAGIAN', 'LUNAS', 'DIBATALKAN');
      CREATE TYPE public.status_transaksi AS ENUM ('MENUNGGU_TRANSFER', 'MENUNGGU_VERIFIKASI', 'DISETUJUI', 'DITOLAK', 'KEDALUWARSA', 'DIBATALKAN');

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY,
        role public.user_role NOT NULL,
        nama_lengkap TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE public.santri (
        id UUID PRIMARY KEY,
        nis VARCHAR(20) UNIQUE NOT NULL,
        nama_lengkap VARCHAR(100) NOT NULL,
        status public.status_santri NOT NULL DEFAULT 'AKTIF'
      );

      CREATE TABLE public.wali_santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        is_verified BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (user_id, santri_id)
      );

      CREATE TABLE public.rekening_pesantren (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_bank TEXT NOT NULL,
        kode_bank TEXT DEFAULT '451',
        nomor_rekening TEXT NOT NULL,
        atas_nama TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE TABLE public.tagihan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nomor_tagihan TEXT UNIQUE NOT NULL,
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        judul_tagihan TEXT NOT NULL,
        nominal_awal NUMERIC(15, 2) NOT NULL,
        nominal_penyesuaian NUMERIC(15, 2) NOT NULL DEFAULT 0,
        total_terbayar NUMERIC(15, 2) NOT NULL DEFAULT 0,
        sisa_tagihan NUMERIC(15, 2) GENERATED ALWAYS AS (nominal_awal + nominal_penyesuaian - total_terbayar) STORED,
        kebijakan_cicilan_snapshot public.kebijakan_cicilan NOT NULL DEFAULT 'BEBAS',
        minimal_cicilan_snapshot NUMERIC(15, 2) NOT NULL DEFAULT 0,
        status public.status_tagihan NOT NULL DEFAULT 'BELUM_BAYAR'
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.alokasi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaksi_id UUID NOT NULL REFERENCES public.transaksi_pembayaran(id) ON DELETE CASCADE,
        tagihan_id UUID NOT NULL REFERENCES public.tagihan(id),
        nominal_alokasi NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.keranjang_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        tagihan_id UUID NOT NULL REFERENCES public.tagihan(id),
        nominal_bayar NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.notifikasi (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID REFERENCES public.santri(id),
        jenis_notifikasi TEXT NOT NULL,
        judul TEXT NOT NULL,
        pesan TEXT NOT NULL,
        tautan TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES public.profiles(id),
        user_role public.user_role NOT NULL,
        aktivitas TEXT NOT NULL,
        jenis_objek TEXT NOT NULL,
        objek_id TEXT,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Data Awal
      INSERT INTO public.profiles (id, role, nama_lengkap) VALUES
        ('${ID_WALI_1}', 'wali', 'Wali Santri Ahmad'),
        ('${ID_WALI_2}', 'wali', 'Wali Santri Budi');

      INSERT INTO public.santri (id, nis, nama_lengkap) VALUES
        ('${ID_SANTRI_1}', 'NIS-001', 'Ahmad Santri 1'),
        ('${ID_SANTRI_2}', 'NIS-002', 'Budi Santri 2');

      INSERT INTO public.wali_santri (user_id, santri_id) VALUES
        ('${ID_WALI_1}', '${ID_SANTRI_1}'),
        ('${ID_WALI_2}', '${ID_SANTRI_2}');

      INSERT INTO public.rekening_pesantren (nama_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('BSI', '7141234567', 'Pesantren Abu Manshur', true);

      -- Daftarkan objek bukti transfer di bucket bukti-pembayaran
      INSERT INTO storage.objects (bucket_id, name)
      VALUES ('bukti-pembayaran', '${ID_SANTRI_1}/bukti-resmi.jpg');
    `);

    // 2. Eksekusi Migration 019
    await db.exec(migration019Sql);
  });

  const asUser = async (userId: string) => {
    await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
  };

  // --------------------------------------------------------------------------
  // 1. RPC dipanggil dengan NULL -> tolak pada level database
  // --------------------------------------------------------------------------
  it("1. RPC dipanggil dengan NULL ditolak dengan pesan jelas", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-01', '${ID_SANTRI_1}', 'SPP', 100000) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);

    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          NULL
        );
      `)
    ).rejects.toThrow("Akses ditolak: Idempotency key wajib diisi dan tidak boleh kosong.");
  });

  // --------------------------------------------------------------------------
  // 2. RPC dipanggil dengan string kosong / spasi -> tolak pada level database
  // --------------------------------------------------------------------------
  it("2. RPC dipanggil dengan string kosong atau spasi ditolak", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-02', '${ID_SANTRI_1}', 'SPP', 100000) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);

    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          '   '
        );
      `)
    ).rejects.toThrow("Akses ditolak: Idempotency key wajib diisi dan tidak boleh kosong.");
  });

  // --------------------------------------------------------------------------
  // 3. RPC dipanggil dengan format UUID tidak valid -> tolak pada level database
  // --------------------------------------------------------------------------
  it("3. RPC dipanggil dengan format UUID tidak valid ditolak oleh regex PL/pgSQL", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-03', '${ID_SANTRI_1}', 'SPP', 100000) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);

    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          'not-a-valid-uuid-12345'
        );
      `)
    ).rejects.toThrow("Akses ditolak: Format Idempotency key tidak valid. Harus berupa UUID v4 standar.");
  });

  // --------------------------------------------------------------------------
  // 4. RPC dipanggil dengan UUID valid -> sukses
  // --------------------------------------------------------------------------
  it("4. RPC dipanggil dengan UUID v4 valid berhasil dan menyimpan key serta fingerprint lengkap", async () => {
    const tghRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-04', '${ID_SANTRI_1}', 'SPP Nov 2026', 300000) RETURNING id;
    `);
    const tagihanId = (tghRes.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    const res = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 300000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) AS res;
    `);

    const result = (res.rows[0] as any).res;
    expect(result.ok).toBe(true);
    expect(result.is_idempotent_replay).toBe(false);
    expect(Number(result.total_nominal)).toBe(300000);

    const check = await db.query(`SELECT idempotency_key, payload_fingerprint FROM public.transaksi_pembayaran WHERE id = '${result.transaksi_id}';`);
    expect((check.rows[0] as any).idempotency_key).toBe(key);
    expect((check.rows[0] as any).payload_fingerprint).toBeTruthy();
  });

  // --------------------------------------------------------------------------
  // 5. Pemanggilan langsung RPC tidak dapat melewati idempotency
  // --------------------------------------------------------------------------
  it("5. Pemanggilan langsung RPC tanpa idempotency key (signature 6 parameter) gagal", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-05', '${ID_SANTRI_1}', 'SPP', 100000) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);

    // Pemanggilan 6 parameter ditolak karena signature hanya ada 7 parameter tanpa default
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL
        );
      `)
    ).rejects.toThrow(/function public\.rpc_checkout_pembayaran_v2.*does not exist/);
  });

  // --------------------------------------------------------------------------
  // 6. Retry menggunakan key & payload sama -> replay transaksi sama
  // --------------------------------------------------------------------------
  it("6. Retry menggunakan key dan payload sama menghasilkan replay transaksi yang sama tanpa baris baru", async () => {
    const tghRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-06', '${ID_SANTRI_1}', 'Uang Asrama', 400000) RETURNING id;
    `);
    const tagihanId = (tghRes.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    // Request 1
    const res1 = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 400000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) AS res;
    `);
    const r1 = (res1.rows[0] as any).res;

    // Request 2 (Replay identik)
    const res2 = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 400000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) AS res;
    `);
    const r2 = (res2.rows[0] as any).res;

    expect(r2.ok).toBe(true);
    expect(r2.is_idempotent_replay).toBe(true);
    expect(r2.transaksi_id).toBe(r1.transaksi_id);
    expect(r2.nomor_transaksi).toBe(r1.nomor_transaksi);

    // Pastikan tidak ada duplikasi di tabel alokasi_pembayaran, audit_logs, transaksi_pembayaran
    const txCount = await db.query(`SELECT COUNT(*)::int as c FROM public.transaksi_pembayaran WHERE santri_id = '${ID_SANTRI_1}';`);
    const alokasiCount = await db.query(`SELECT COUNT(*)::int as c FROM public.alokasi_pembayaran WHERE tagihan_id = '${tagihanId}';`);
    const auditCount = await db.query(`SELECT COUNT(*)::int as c FROM public.audit_logs WHERE aktivitas = 'CHECKOUT_PEMBAYARAN_RPC_V2';`);

    expect((txCount.rows[0] as any).c).toBe(1);
    expect((alokasiCount.rows[0] as any).c).toBe(1);
    expect((auditCount.rows[0] as any).c).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 7. Key sama dengan payload berbeda -> konflik idempotensi
  // --------------------------------------------------------------------------
  it("7. Key sama dengan payload berbeda ditolak sebagai konflik idempotensi", async () => {
    const tghRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-07', '${ID_SANTRI_1}', 'Biaya Wisuda', 200000) RETURNING id;
    `);
    const tagihanId = (tghRes.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
        CURRENT_DATE,
        'Ahmad Asli',
        'BSI',
        NULL,
        '${key}'
      );
    `);

    // A. Payload beda: nama pengirim beda
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          CURRENT_DATE,
          'Ahmad Berbeda',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow("Konflik Idempotensi");

    // B. Payload beda: tanggal transfer beda
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          '2026-12-01'::date,
          'Ahmad Asli',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow("Konflik Idempotensi");
  });

  // --------------------------------------------------------------------------
  // 8. Normalisasi nominal > 2 desimal dinormalisasi konsisten
  // --------------------------------------------------------------------------
  it("8. Nominal dengan > 2 angka desimal dinormalisasi konsisten (fingerprint, validation, header, alokasi)", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-08', '${ID_SANTRI_1}', 'Biaya Lab', 500000.00) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    // Nominal dikirim dengan pecahan lebih dari 2 desimal: 150000.456 -> harus dibulatkan ke 150000.46
    const res = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 150000.456}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);

    const r = (res.rows[0] as any).res;
    expect(r.ok).toBe(true);
    expect(Number(r.total_nominal)).toBe(150000.46);

    // Cek di tabel transaksi_pembayaran
    const tx = await db.query(`SELECT total_nominal FROM public.transaksi_pembayaran WHERE id = '${r.transaksi_id}';`);
    expect(Number((tx.rows[0] as any).total_nominal)).toBe(150000.46);

    // Cek di tabel alokasi_pembayaran
    const alokasi = await db.query(`SELECT nominal_alokasi FROM public.alokasi_pembayaran WHERE transaksi_id = '${r.transaksi_id}';`);
    expect(Number((alokasi.rows[0] as any).nominal_alokasi)).toBe(150000.46);

    // Replay dengan key yang sama dan nilai normalisasi 150000.46 harus menghasilkan replay sukses (bukan konflik)
    const replayRes = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 150000.46}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);
    expect((replayRes.rows[0] as any).res.is_idempotent_replay).toBe(true);
    expect((replayRes.rows[0] as any).res.transaksi_id).toBe(r.transaksi_id);
  });

  // --------------------------------------------------------------------------
  // 9. Total transaksi selalu sama persis dengan total alokasi
  // --------------------------------------------------------------------------
  it("9. Total transaksi selalu sama persis dengan total seluruh alokasi pembayaran", async () => {
    const tgh1 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-09A', '${ID_SANTRI_1}', 'Biaya Tagihan A', 150000) RETURNING id;
    `);
    const tgh2 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-09B', '${ID_SANTRI_1}', 'Biaya Tagihan B', 250000) RETURNING id;
    `);
    const id1 = (tgh1.rows[0] as any).id;
    const id2 = (tgh2.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    const res = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${id1}", "nominal_bayar": 125000.50}, {"tagihan_id": "${id2}", "nominal_bayar": 175000.50}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);

    const r = (res.rows[0] as any).res;
    expect(r.ok).toBe(true);
    expect(Number(r.total_nominal)).toBe(300001.00);

    const txRow = await db.query(`SELECT total_nominal FROM public.transaksi_pembayaran WHERE id = '${r.transaksi_id}';`);
    const sumAlokasiRow = await db.query(`SELECT SUM(nominal_alokasi)::numeric as sum_alokasi FROM public.alokasi_pembayaran WHERE transaksi_id = '${r.transaksi_id}';`);

    const totalTx = Number((txRow.rows[0] as any).total_nominal);
    const sumAlokasi = Number((sumAlokasiRow.rows[0] as any).sum_alokasi);

    expect(totalTx).toBe(sumAlokasi);
    expect(totalTx).toBe(300001.00);
  });

  // --------------------------------------------------------------------------
  // 10. Konkurensi: Dua request bersamaan dengan key sama menghasilkan tepat 1 transaksi
  // --------------------------------------------------------------------------
  it("10. Dua request bersamaan/berurutan menghasilkan tepat satu transaksi di database", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-10', '${ID_SANTRI_1}', 'Uang Gedung', 500000) RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    // Catatan pengujian konkurensi: Dalam lingkungan embedded PGlite (WASM single event-loop),
    // Promise.all berjalan dalam sesi koneksi in-memory tunggal secara berurutan cepat.
    // Advisory lock dan partial unique index menjamin keamanan di tingkat SQL.
    const p1 = db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 500000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);

    const p2 = db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 500000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);

    const [res1, res2] = await Promise.all([p1, p2]);
    const r1 = (res1.rows[0] as any).res;
    const r2 = (res2.rows[0] as any).res;

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.transaksi_id).toBe(r2.transaksi_id);

    const count = await db.query(`SELECT COUNT(*)::int as c FROM public.transaksi_pembayaran WHERE santri_id = '${ID_SANTRI_1}';`);
    expect((count.rows[0] as any).c).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 11. Isolasi Akun Wali & Santri
  // --------------------------------------------------------------------------
  it("11. Isolasi keamanan: Key sama tidak boleh digunakan oleh akun wali lain atau untuk santri lain", async () => {
    await db.query(`INSERT INTO public.wali_santri (user_id, santri_id) VALUES ('${ID_WALI_1}', '${ID_SANTRI_2}');`);

    const tgh1 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-11A', '${ID_SANTRI_1}', 'Biaya 1', 100000) RETURNING id;
    `);
    const tgh2 = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-11B', '${ID_SANTRI_2}', 'Biaya 2', 100000) RETURNING id;
    `);
    const id1 = (tgh1.rows[0] as any).id;
    const id2 = (tgh2.rows[0] as any).id;

    const key = randomUUID();

    // Wali 1 membuat transaksi santri 1
    await asUser(ID_WALI_1);
    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${id1}", "nominal_bayar": 100000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      );
    `);

    // A. Wali 1 mencoba memakai key yang sama untuk santri 2 -> Ditolak
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_2}',
          '[{"tagihan_id": "${id2}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow("Akses ditolak: Idempotency key sudah digunakan untuk santri berbeda.");

    // B. Wali 2 mencoba memakai key yang sama -> Ditolak
    await asUser(ID_WALI_2);
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_2}',
          '[{"tagihan_id": "${id2}", "nominal_bayar": 100000}]'::jsonb,
          CURRENT_DATE,
          'Wali Budi',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow("Akses ditolak: Idempotency key sudah digunakan oleh akun wali lain.");
  });

  // --------------------------------------------------------------------------
  // 12. Rollback Bersih & Re-usability
  // --------------------------------------------------------------------------
  it("12. Request pertama rollback karena over-allocation, kemudian key dapat digunakan ulang dengan nominal benar", async () => {
    const tgh = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot)
      VALUES ('TGH-REQ-12', '${ID_SANTRI_1}', 'Biaya Komputer', 300000, 'BEBAS') RETURNING id;
    `);
    const tagihanId = (tgh.rows[0] as any).id;

    await asUser(ID_WALI_1);
    const key = randomUUID();

    // Request 1: Gagal karena bayar 900.000 > 300.000
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 900000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow("melebihi sisa kewajiban yang dapat diajukan");

    // Key belum tersimpan di DB
    const checkKey = await db.query(`SELECT * FROM public.transaksi_pembayaran WHERE idempotency_key = '${key}';`);
    expect(checkKey.rows.length).toBe(0);

    // Request 2: Retry dengan nominal yang benar (300.000) memakai key yang sama
    const resSuccess = await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}',
        '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 300000}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        NULL,
        '${key}'
      ) AS res;
    `);
    expect((resSuccess.rows[0] as any).res.ok).toBe(true);
    expect((resSuccess.rows[0] as any).res.is_idempotent_replay).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 13. Validasi Bukti Transfer Tetap Berjalan (Folder Isolation & Storage Objects)
  // --------------------------------------------------------------------------
  it("13. Validasi bukti transfer: Folder isolation dan keberadaan objek storage tetap ditegakkan", async () => {
    const tghRes = await db.query(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal)
      VALUES ('TGH-REQ-13', '${ID_SANTRI_1}', 'Biaya Seragam', 200000) RETURNING id;
    `);
    const tagihanId = (tghRes.rows[0] as any).id;

    await asUser(ID_WALI_1);

    // Kasus A: Path folder milik santri lain
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_2}/bukti-curian.jpg',
          '${randomUUID()}'
        );
      `)
    ).rejects.toThrow("Akses ditolak: Bukti transfer tidak valid atau tidak terisolasi dalam folder santri yang bersangkutan.");

    // Kasus B: File tidak ada di storage.objects
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}',
          '[{"tagihan_id": "${tagihanId}", "nominal_bayar": 200000}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/file-gaib.jpg',
          '${randomUUID()}'
        );
      `)
    ).rejects.toThrow("tidak ditemukan pada penyimpanan pesantren (bucket bukti-pembayaran)");
  });
});
