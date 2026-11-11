import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA — Integrasi API & Frontend Idempotensi Checkout (Migration 019)", () => {
  const migration019Path = path.resolve(__dirname, "../supabase/migrations/019_idempotensi_checkout_pembayaran.sql");
  const migration019Sql = fs.readFileSync(migration019Path, "utf8");

  let db: PGlite;

  const ID_WALI_1 = "11111111-1111-1111-1111-111111111111";
  const ID_WALI_2 = "22222222-2222-2222-2222-222222222222";
  const ID_SANTRI_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ID_SANTRI_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const ID_TAGIHAN_1 = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const ID_TAGIHAN_2 = "dddddddd-dddd-dddd-dddd-dddddddddddd";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Skema Dasar Mirip Supabase Production
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (transaksi_id, tagihan_id)
      );

      CREATE TABLE public.keranjang_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wali_user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        tagihan_id UUID NOT NULL REFERENCES public.tagihan(id),
        nominal_bayar NUMERIC(15, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (wali_user_id, tagihan_id)
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

      -- Simulasi schema storage Supabase
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Seed Data Awal
      INSERT INTO public.profiles (id, role, nama_lengkap) VALUES
        ('${ID_WALI_1}', 'wali', 'Wali Santri Ahmad'),
        ('${ID_WALI_2}', 'wali', 'Wali Santri Budi');

      INSERT INTO public.santri (id, nis, nama_lengkap) VALUES
        ('${ID_SANTRI_1}', 'NIS-001', 'Ahmad Santri 1'),
        ('${ID_SANTRI_2}', 'NIS-002', 'Budi Santri 2');

      INSERT INTO public.wali_santri (user_id, santri_id) VALUES
        ('${ID_WALI_1}', '${ID_SANTRI_1}'),
        ('${ID_WALI_2}', '${ID_SANTRI_2}');

      INSERT INTO public.rekening_pesantren (id, nama_bank, nomor_rekening, atas_nama, is_active) VALUES
        ('99999999-9999-9999-9999-999999999999', 'BSI', '7141234567', 'PP Modern Abu Manshur', true);

      INSERT INTO public.tagihan (id, nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot, status) VALUES
        ('${ID_TAGIHAN_1}', 'TAG-001', '${ID_SANTRI_1}', 'Syahriah Januari 2026', 500000.00, 'BEBAS', 'BELUM_BAYAR'),
        ('${ID_TAGIHAN_2}', 'TAG-002', '${ID_SANTRI_2}', 'Syahriah Januari 2026', 500000.00, 'BEBAS', 'BELUM_BAYAR');

      -- Daftarkan bukti transfer resmi di storage.objects
      INSERT INTO storage.objects (bucket_id, name) VALUES
        ('bukti-pembayaran', '${ID_SANTRI_1}/bukti-resmi.jpg'),
        ('bukti-pembayaran', '${ID_SANTRI_1}/bukti-kedua.jpg');
    `);

    // Terapkan Migration 019
    await db.exec(migration019Sql);
  });

  const setAuthUser = async (userId: string) => {
    await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
  };

  // 1. Checkout normal
  it("1. Checkout normal berhasil dan mengembalikan is_idempotent_replay: false", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "a1111111-aaaa-4111-8111-111111111111";

    const res = await db.query<any>(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 500000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) as result;
    `);

    const result = res.rows[0].result;
    expect(result.ok).toBe(true);
    expect(result.is_idempotent_replay).toBe(false);
    expect(result.nomor_transaksi).toBeDefined();

    // Verifikasi transaksi tercatat di database
    const trx = await db.query<any>(`SELECT * FROM public.transaksi_pembayaran WHERE idempotency_key = '${key}'`);
    expect(trx.rows.length).toBe(1);
    expect(Number(trx.rows[0].total_nominal)).toBe(500000);
  });

  // 2. Retry setelah timeout dengan key sama
  it("2. Retry setelah timeout dengan key sama mengembalikan transaksi yang sama (is_idempotent_replay: true)", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "b2222222-bbbb-4222-8222-222222222222";

    // Request 1: Anggap database COMMIT tapi koneksi client terputus sebelum menerima respons
    const res1 = await db.query<any>(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 200000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) as result;
    `);
    const r1 = res1.rows[0].result;
    expect(r1.ok).toBe(true);
    expect(r1.is_idempotent_replay).toBe(false);

    // Request 2 (Retry Client dengan key dan payload yang persis sama)
    const res2 = await db.query<any>(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 200000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) as result;
    `);
    const r2 = res2.rows[0].result;
    expect(r2.ok).toBe(true);
    expect(r2.is_idempotent_replay).toBe(true);
    expect(r2.transaksi_id).toBe(r1.transaksi_id);
    expect(r2.nomor_transaksi).toBe(r1.nomor_transaksi);

    // Pastikan tidak ada transaksi kedua yang dibuat
    const countTrx = await db.query<any>(`SELECT count(*) FROM public.transaksi_pembayaran`);
    expect(Number(countTrx.rows[0].count)).toBe(1);
  });

  // 3. Replay setelah respons pertama tidak diterima browser
  it("3. Replay setelah respons pertama tidak diterima browser tidak menggandakan alokasi atau audit log", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "c3333333-cccc-4333-8333-333333333333";

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Replay
    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    const alokasi = await db.query<any>(`SELECT count(*) FROM public.alokasi_pembayaran`);
    expect(Number(alokasi.rows[0].count)).toBe(1);

    const logs = await db.query<any>(`SELECT count(*) FROM public.audit_logs WHERE aktivitas = 'CHECKOUT_PEMBAYARAN_RPC_V2'`);
    expect(Number(logs.rows[0].count)).toBe(1);
  });

  // 4. Key sama dengan payload berbeda ditolak konflik
  it("4. Key sama dengan nominal/payload berbeda ditolak dengan exception Konflik Idempotensi", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "d4444444-dddd-4444-8444-444444444444";

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Coba dengan key sama tetapi nominal berbeda (250.000)
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 250000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg',
          '${key}'
        );
      `)
    ).rejects.toThrow(/Konflik Idempotensi/);
  });

  // 5. Perubahan bukti transfer
  it("5. Key sama dengan bukti transfer berbeda ditolak sebagai konflik", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "e5555555-eeee-4555-8555-555555555555";

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Coba dengan path bukti berbeda
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-kedua.jpg',
          '${key}'
        );
      `)
    ).rejects.toThrow(/Konflik Idempotensi/);
  });

  // 6. Pergantian santri
  it("6. Key sama digunakan untuk santri berbeda oleh wali yang sama ditolak keras", async () => {
    await setAuthUser(ID_WALI_1);
    // Tambahkan santri ke-2 ke wali 1
    await db.exec(`INSERT INTO public.wali_santri (user_id, santri_id) VALUES ('${ID_WALI_1}', '${ID_SANTRI_2}');`);

    const key = "f6666666-ffff-4666-8666-666666666666";

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Coba gunakan key yang sama untuk santri 2
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_2}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_2}", "nominal_bayar": 100000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow(/santri berbeda/);
  });

  // 7. Double click / Konkurensi
  it("7. Double submit konkuren dengan key yang sama menghasilkan tepat 1 transaksi", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "77777777-7777-4777-8777-777777777777";

    const [callA, callB] = await Promise.all([
      db.query<any>(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 150000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg',
          '${key}'
        ) as result;
      `),
      db.query<any>(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 150000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg',
          '${key}'
        ) as result;
      `),
    ]);

    const resA = callA.rows[0].result;
    const resB = callB.rows[0].result;

    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);
    expect(resA.nomor_transaksi).toBe(resB.nomor_transaksi);

    const isOneReplay = (resA.is_idempotent_replay && !resB.is_idempotent_replay) || (!resA.is_idempotent_replay && resB.is_idempotent_replay);
    expect(isOneReplay).toBe(true);

    const countTrx = await db.query<any>(`SELECT count(*) FROM public.transaksi_pembayaran WHERE idempotency_key = '${key}'`);
    expect(Number(countTrx.rows[0].count)).toBe(1);
  });

  // 8. Request gagal dan rollback
  it("8. Request gagal rollback (over-allocation) tidak mengunci key, retry dengan nominal benar berhasil", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "88888888-8888-4888-8888-888888888888";

    // Request melebihi sisa tagihan (999.000 > 500.000)
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 999000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg',
          '${key}'
        );
      `)
    ).rejects.toThrow(/melebihi sisa kewajiban/);

    // Pastikan tidak ada data yang tersimpan
    const checkEmpty = await db.query<any>(`SELECT count(*) FROM public.transaksi_pembayaran WHERE idempotency_key = '${key}'`);
    expect(Number(checkEmpty.rows[0].count)).toBe(0);

    // Sekarang coba lagi dengan key yang sama tapi nominal yang benar (500.000)
    const successRes = await db.query<any>(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 500000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      ) as result;
    `);

    expect(successRes.rows[0].result.ok).toBe(true);
    expect(successRes.rows[0].result.is_idempotent_replay).toBe(false);
  });

  // 9. Wali tidak dapat menggunakan key milik wali lain
  it("9. Wali B tidak dapat menggunakan key milik Wali A (Akses Ditolak)", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "99999999-9999-4999-8999-999999999999";

    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 100000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Ganti user ke Wali B
    await setAuthUser(ID_WALI_2);
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_2}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_2}", "nominal_bayar": 100000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Budi',
          'BSI',
          NULL,
          '${key}'
        );
      `)
    ).rejects.toThrow(/akun wali lain/);
  });

  // 10. Keranjang pembayaran hanya terhapus item yang dibayar
  it("10. Keranjang pembayaran hanya terhapus untuk tagihan yang dicheckout, item lain tetap aman", async () => {
    await setAuthUser(ID_WALI_1);
    const key = "10101010-1010-4010-8010-101010101010";

    // Buat tagihan kedua untuk santri 1
    const tagihan2Res = await db.query<any>(`
      INSERT INTO public.tagihan (nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot, status)
      VALUES ('TAG-003', '${ID_SANTRI_1}', 'Uang Gedung', 1000000.00, 'BEBAS', 'BELUM_BAYAR')
      RETURNING id;
    `);
    const idTagihanGedung = tagihan2Res.rows[0].id;

    // Masukkan kedua tagihan ke keranjang
    await db.exec(`
      INSERT INTO public.keranjang_pembayaran (wali_user_id, santri_id, tagihan_id, nominal_bayar) VALUES
        ('${ID_WALI_1}', '${ID_SANTRI_1}', '${ID_TAGIHAN_1}', 500000.00),
        ('${ID_WALI_1}', '${ID_SANTRI_1}', '${idTagihanGedung}', 500000.00);
    `);

    // Checkout hanya tagihan 1
    await db.query(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 500000.00}]'::jsonb,
        CURRENT_DATE,
        'Wali Ahmad',
        'BSI',
        '${ID_SANTRI_1}/bukti-resmi.jpg',
        '${key}'
      );
    `);

    // Cek keranjang: Tagihan 1 harus terhapus, Tagihan Gedung harus tetap ada
    const cart = await db.query<any>(`SELECT tagihan_id FROM public.keranjang_pembayaran WHERE wali_user_id = '${ID_WALI_1}'`);
    expect(cart.rows.length).toBe(1);
    expect(cart.rows[0].tagihan_id).toBe(idTagihanGedung);
  });

  // 11. Validasi format UUID di client / endpoint
  it("11. Validasi format UUID: Format non-UUID ditolak oleh validator", () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(UUID_REGEX.test("invalid-key-123")).toBe(false);
    expect(UUID_REGEX.test("")).toBe(false);
    expect(UUID_REGEX.test("c0ffee00-1234-4234-a234-123456789012")).toBe(true);
    expect(UUID_REGEX.test("a1111111-aaaa-4111-8111-111111111111")).toBe(true);
  });

  // 12. Idempotency Key Wajib: Pemanggilan tanpa idempotency_key ditolak oleh database
  it("12. Pemanggilan tanpa idempotency_key atau dengan key tidak valid ditolak oleh database", async () => {
    await setAuthUser(ID_WALI_1);

    // Pemanggilan 6 parameter ditolak karena function signature hanya 7 parameter tanpa default
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 50000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg'
        );
      `)
    ).rejects.toThrow(/function public\.rpc_checkout_pembayaran_v2.*does not exist/);

    // Pemanggilan 7 parameter dengan key NULL ditolak dengan pesan jelas
    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '[{"tagihan_id": "${ID_TAGIHAN_1}", "nominal_bayar": 50000.00}]'::jsonb,
          CURRENT_DATE,
          'Wali Ahmad',
          'BSI',
          '${ID_SANTRI_1}/bukti-resmi.jpg',
          NULL
        );
      `)
    ).rejects.toThrow("Akses ditolak: Idempotency key wajib diisi dan tidak boleh kosong.");
  });
});
