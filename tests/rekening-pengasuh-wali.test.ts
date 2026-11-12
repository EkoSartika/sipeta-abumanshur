import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA: Validasi Rekening Resmi Pesantren & Otorisasi Pengasuh", () => {
  const migration019Path = path.resolve(__dirname, "../supabase/migrations/019_idempotensi_checkout_pembayaran.sql");
  const migration019Sql = fs.readFileSync(migration019Path, "utf8");

  const migration020Path = path.resolve(__dirname, "../supabase/migrations/020_konfigurasi_rekening_resmi_bsi.sql");
  const migration020Sql = fs.readFileSync(migration020Path, "utf8");

  let db: PGlite;

  const ID_PENGASUH = "99999999-9999-9999-9999-999999999999";
  const ID_TU = "88888888-8888-8888-8888-888888888888";
  const ID_WALI_1 = "11111111-1111-1111-1111-111111111111";
  const ID_SANTRI_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const ID_TAGIHAN_1 = "77777777-7777-7777-7777-777777777771";

  beforeEach(async () => {
    db = new PGlite();

    // 1. Setup Skema Dasar
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
        nis TEXT NOT NULL,
        nama_lengkap TEXT NOT NULL,
        status public.status_santri NOT NULL DEFAULT 'AKTIF'
      );

      CREATE TABLE public.wali_santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.profiles(id),
        santri_id UUID NOT NULL REFERENCES public.santri(id),
        UNIQUE (user_id, santri_id)
      );

      CREATE TABLE public.rekening_pesantren (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_bank TEXT NOT NULL,
        kode_bank TEXT DEFAULT '451',
        nomor_rekening TEXT NOT NULL,
        atas_nama TEXT NOT NULL,
        catatan_instruksi TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX idx_single_active_rekening_pesantren
      ON public.rekening_pesantren ((is_active))
      WHERE is_active = true;

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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (wali_user_id, santri_id, tagihan_id)
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

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS public.user_role AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid();
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION public.generate_nomor_transaksi_pembayaran() RETURNS TEXT AS $$
        SELECT 'TRX-BYR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random()*10000)::text, 4, '0');
      $$ LANGUAGE sql VOLATILE;
    `);

    // Terapkan RPC 019
    await db.exec(migration019Sql);

    // Seed profil & santri
    await db.exec(`
      INSERT INTO public.profiles (id, role, nama_lengkap) VALUES
        ('${ID_PENGASUH}', 'admin', 'K.H. Abu Manshur (Pengasuh)'),
        ('${ID_TU}', 'tu', 'Staf Tata Usaha'),
        ('${ID_WALI_1}', 'wali', 'Ahmad Wali');

      INSERT INTO public.santri (id, nis, nama_lengkap, status) VALUES
        ('${ID_SANTRI_1}', 'NIS-001', 'Muhammad Santri', 'AKTIF');

      INSERT INTO public.wali_santri (user_id, santri_id) VALUES
        ('${ID_WALI_1}', '${ID_SANTRI_1}');

      INSERT INTO public.tagihan (id, nomor_tagihan, santri_id, judul_tagihan, nominal_awal, kebijakan_cicilan_snapshot, minimal_cicilan_snapshot, status)
      VALUES ('${ID_TAGIHAN_1}', 'TGH-001', '${ID_SANTRI_1}', 'SPP Nov 2026', 500000, 'TIDAK_BOLEH', 500000, 'BELUM_BAYAR');
    `);
  });

  const asUser = async (userId: string) => {
    await db.exec(`SET request.jwt.claim.sub = '${userId}';`);
  };

  it("1. Checkout GAGAL jika rekening belum dikonfigurasi (tabel kosong)", async () => {
    await asUser(ID_WALI_1);

    const payloadItems = JSON.stringify([{ tagihan_id: ID_TAGIHAN_1, nominal_bayar: 500000 }]);

    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '${payloadItems}'::jsonb,
          CURRENT_DATE,
          'Ahmad Wali'::text,
          'BSI'::text,
          NULL,
          '${randomUUID()}'::text
        );
      `)
    ).rejects.toThrow(/Rekening resmi pesantren belum dikonfigurasi atau tidak aktif/);
  });

  it("2. Checkout GAGAL jika rekening tersimpan tetapi berstatus TIDAK AKTIF (is_active = false)", async () => {
    await db.exec(`
      INSERT INTO public.rekening_pesantren (nama_bank, nomor_rekening, atas_nama, is_active)
      VALUES ('Bank Syariah Indonesia (BSI)', '7198823456', 'Yayasan Pondok Pesantren Modern Abu Manshur', false);
    `);

    await asUser(ID_WALI_1);

    const payloadItems = JSON.stringify([{ tagihan_id: ID_TAGIHAN_1, nominal_bayar: 500000 }]);

    await expect(
      db.query(`
        SELECT public.rpc_checkout_pembayaran_v2(
          '${ID_SANTRI_1}'::uuid,
          '${payloadItems}'::jsonb,
          CURRENT_DATE,
          'Ahmad Wali'::text,
          'BSI'::text,
          NULL,
          '${randomUUID()}'::text
        );
      `)
    ).rejects.toThrow(/Rekening resmi pesantren belum dikonfigurasi atau tidak aktif/);
  });

  it("3. Migration 020 berhasil mengonfigurasi rekening resmi BSI dan mengaktifkannya", async () => {
    await db.exec(migration020Sql);

    const check = await db.query<{ nama_bank: string; nomor_rekening: string; is_active: boolean }>(`
      SELECT nama_bank, nomor_rekening, is_active
      FROM public.rekening_pesantren
      WHERE is_active = true;
    `);

    expect(check.rows.length).toBe(1);
    expect(check.rows[0]!.nama_bank).toBe("Bank Syariah Indonesia (BSI)");
    expect(check.rows[0]!.nomor_rekening).toBe("7198823456");
    expect(check.rows[0]!.is_active).toBe(true);
  });

  it("4. Checkout BERHASIL ketika rekening resmi aktif terkonfigurasi dan merekam snapshot rekening", async () => {
    await db.exec(migration020Sql);
    await asUser(ID_WALI_1);

    const payloadItems = JSON.stringify([{ tagihan_id: ID_TAGIHAN_1, nominal_bayar: 500000 }]);

    const res = await db.query<{ rpc_checkout_pembayaran_v2: any }>(`
      SELECT public.rpc_checkout_pembayaran_v2(
        '${ID_SANTRI_1}'::uuid,
        '${payloadItems}'::jsonb,
        CURRENT_DATE,
        'Ahmad Wali'::text,
        'BSI'::text,
        NULL,
        '${randomUUID()}'::text
      ) AS rpc_checkout_pembayaran_v2;
    `);

    const trxResult = res.rows[0]!.rpc_checkout_pembayaran_v2;
    expect(trxResult.ok).toBe(true);
    expect(trxResult.nomor_transaksi).toBeDefined();

    // Verifikasi snapshot rekening di transaksi
    const trxRow = await db.query<{ rekening_tujuan_snapshot: any }>(`
      SELECT rekening_tujuan_snapshot FROM public.transaksi_pembayaran WHERE nomor_transaksi = '${trxResult.nomor_transaksi}';
    `);

    expect(trxRow.rows[0]!.rekening_tujuan_snapshot.nomor_rekening).toBe("7198823456");
    expect(trxRow.rows[0]!.rekening_tujuan_snapshot.nama_bank).toBe("Bank Syariah Indonesia (BSI)");
  });

  it("5. Integritas Indeks Unik: Mengaktifkan rekening kedua secara langsung tanpa nonaktifkan rekening pertama akan ditolak index constraint", async () => {
    await db.exec(migration020Sql);

    await expect(
      db.exec(`
        INSERT INTO public.rekening_pesantren (nama_bank, nomor_rekening, atas_nama, is_active)
        VALUES ('Bank Muamalat', '1234567890', 'Yayasan Abu Manshur', true);
      `)
    ).rejects.toThrow();
  });
});
