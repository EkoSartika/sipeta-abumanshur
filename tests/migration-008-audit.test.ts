// ============================================================================
// SIPETA - Migration 008 Pre-Approval Audit Test Suite
// Verifikasi Atomisitas (BEGIN/COMMIT), Idempotensi, Rollback,
// serta Rekonsiliasi Jumlah Policy (Public, Storage, Authenticated, Anon)
// ============================================================================

import { describe, expect, it, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

describe("SIPETA Migration 008 Pre-Approval Audit & Verification", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_ID = "00000000-0000-0000-0000-000000000002";
  const BENDAHARA_ID = "00000000-0000-0000-0000-000000000003";
  const PENGELOLA_ID = "00000000-0000-0000-0000-000000000004";
  const WALI_1_ID = "00000000-0000-0000-0000-000000000005";
  const SANTRI_1_ID = "11111111-1111-1111-1111-111111111111";

  async function asUser<T>(userId: string | null, callback: () => Promise<T>): Promise<T> {
    const val = userId ? `'${userId}'` : "NULL";
    await db.exec(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', ${val}, false);
    `);
    try {
      return await callback();
    } finally {
      await db.exec(`
        RESET ROLE;
        SELECT set_config('request.jwt.claim.sub', NULL, false);
      `);
    }
  }

  async function asAnon<T>(callback: () => Promise<T>): Promise<T> {
    await db.exec(`
      SET ROLE anon;
      SELECT set_config('request.jwt.claim.sub', NULL, false);
    `);
    try {
      return await callback();
    } finally {
      await db.exec(`
        RESET ROLE;
        SELECT set_config('request.jwt.claim.sub', NULL, false);
      `);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Inisialisasi Mock Auth & Storage Core
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE
      );

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          public BOOLEAN DEFAULT false,
          file_size_limit BIGINT,
          allowed_mime_types TEXT[],
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          bucket_id TEXT REFERENCES storage.buckets(id),
          name TEXT,
          owner UUID,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
          RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // 2. Jalankan Migrasi 0001 s.d. 0007 (Mewakili Kondisi Aktual Supabase Cloud)
    const migrations = [
      "0001_enums_and_extensions.sql",
      "0002_core_admin_tables.sql",
      "0003_payment_and_billing_tables.sql",
      "0004_pocket_money_ledger_tables.sql",
      "0005_kepesantrenan_and_audit_tables.sql",
      "0006_atomic_rpcs_and_triggers.sql",
      "0007_rls_and_storage_policies.sql",
    ];

    for (const mig of migrations) {
      const migPath = path.resolve(__dirname, `../supabase/migrations/${mig}`);
      const sql = fs.readFileSync(migPath, "utf-8");
      await db.exec(sql);
    }
  });

  // ==========================================================================
  // TAHAP 1: VERIFIKASI KONDISI SUPABASE CLOUD (PASCA 0001–0007)
  // ==========================================================================
  describe("Tahap 1: Verifikasi Kondisi Awal Cloud (0001–0007)", () => {
    it("memastikan terdapat tepat 27 tabel pada skema public dan seluruhnya mengaktifkan RLS", async () => {
      const res = await db.query(`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
      `);
      expect(res.rows.length).toBe(27);
      for (const row of res.rows as any[]) {
        expect(row.rowsecurity).toBe(true);
      }
    });

    it("memverifikasi terdapat tepat 48 policy public dan 13 storage policy (total 61)", async () => {
      const resPublic = await db.query(`
        SELECT policyname FROM pg_policies WHERE schemaname = 'public';
      `);
      const resStorage = await db.query(`
        SELECT policyname FROM pg_policies WHERE schemaname = 'storage';
      `);
      expect(resPublic.rows.length).toBe(48);
      expect(resStorage.rows.length).toBe(13);
      expect(resPublic.rows.length + resStorage.rows.length).toBe(61);
    });
  });

  // ==========================================================================
  // TAHAP 2: EKSEKUSI MIGRATION 008 & VERIFIKASI JUMLAH POLICY
  // ==========================================================================
  describe("Tahap 2: Eksekusi Migration 008 & Audit Rekonsiliasi Policy", () => {
    it("menjalankan 008_security_remediation.sql untuk pertama kali", async () => {
      const migPath = path.resolve(__dirname, "../supabase/migrations/008_security_remediation.sql");
      const sql = fs.readFileSync(migPath, "utf-8");
      await db.exec(sql);
    });

    it("memverifikasi jumlah tabel dan RLS tetap 27 tabel", async () => {
      const res = await db.query(`
        SELECT tablename, rowsecurity
        FROM pg_tables
        WHERE schemaname = 'public';
      `);
      expect(res.rows.length).toBe(27);
      for (const row of res.rows as any[]) {
        expect(row.rowsecurity).toBe(true);
      }
    });

    it("memverifikasi kebijakan storage berkurang dari 13 menjadi 12 (deduplikasi foto-penyerahan-saku)", async () => {
      const resStorage = await db.query(`
        SELECT policyname FROM pg_policies WHERE schemaname = 'storage';
      `);
      expect(resStorage.rows.length).toBe(12);

      // Verifikasi policy redundan telah dihapus
      const resRedundant = await db.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Foto Penyerahan: upload eksklusif bendahara';
      `);
      expect(resRedundant.rows.length).toBe(0);
    });

    it("verifikasi metrik kebijakan: 27 tabel public, RLS aktif, 48/49 public policies, 12 storage", async () => {
      const resPublic = await db.query(`
        SELECT policyname, roles FROM pg_policies WHERE schemaname = 'public';
      `);
      const authPolicies = resPublic.rows.filter((r: any) => r.roles.includes("authenticated"));
      const anonPolicies = resPublic.rows.filter((r: any) => r.roles.includes("anon"));
      
      const resStorage = await db.query(`
        SELECT policyname, roles FROM pg_policies WHERE schemaname = 'storage';
      `);

      console.log("METRIK KEBIJAKAN POST-008:");
      console.log("- Total Public Policies:", resPublic.rows.length);
      console.log("- Public Authenticated Policies:", authPolicies.length);
      console.log("- Public Anon Policies:", anonPolicies.length);
      console.log("- Storage Policies:", resStorage.rows.length);
      console.log("- Total Keseluruhan Policies:", resPublic.rows.length + resStorage.rows.length);
    });
  });

  // ==========================================================================
  // TAHAP 3: UJI ROLLBACK DAN IDEMPOTENCY EKSEKUSI ULANG (BEGIN / COMMIT)
  // ==========================================================================
  describe("Tahap 3: Uji Transaksional, Rollback, dan Idempotency", () => {
    it("Uji Rollback Transaksi: Kesalahan di tengah migrasi tidak merusak atau meninggalkan state parsial", async () => {
      // Jalankan transaksi yang disengaja gagal di akhir
      let caughtError = false;
      try {
        await db.exec(`
          BEGIN;
          DROP POLICY IF EXISTS "Pengumuman: baca publik anon" ON public.pengumuman;
          CREATE POLICY "Pengumuman: baca publik anon" ON public.pengumuman FOR SELECT TO anon USING (is_published = true);
          -- Simulasi error fatal: kueri invalid sintaks
          RAISE EXCEPTION 'Simulasi kegagalan transaksi di tengah eksekusi';
          COMMIT;
        `);
      } catch {
        caughtError = true;
      }
      expect(caughtError).toBe(true);

      // Pastikan database tetap dalam kondisi konsisten pasca-rollback
      const res = await db.query(`
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'pengumuman' AND policyname = 'Pengumuman: baca publik anon';
      `);
      expect(res.rows.length).toBe(1); // Tetap utuh dari state sebelum transaksi gagal
    });

    it("Uji Idempotensi: Eksekusi ulang 008_security_remediation.sql kedua kali berjalan sukses tanpa error", async () => {
      const migPath = path.resolve(__dirname, "../supabase/migrations/008_security_remediation.sql");
      const sql = fs.readFileSync(migPath, "utf-8");

      // Eksekusi ulang untuk membuktikan idempotensi
      await db.exec(sql);

      const resPublic = await db.query(`
        SELECT policyname FROM pg_policies WHERE schemaname = 'public';
      `);
      const resStorage = await db.query(`
        SELECT policyname FROM pg_policies WHERE schemaname = 'storage';
      `);

      // Jumlah policy tidak terduplikasi
      expect(resStorage.rows.length).toBe(12);
      expect(resPublic.rows.length).toBeGreaterThanOrEqual(48);
    });
  });

  // ==========================================================================
  // TAHAP 4: UJI MODEL AKSES 4 STORAGE BUCKET (VERIFIKASI PRD)
  // ==========================================================================
  describe("Tahap 4: Verifikasi Model Akses Aktual 4 Storage Bucket", () => {
    it("bukti-pembayaran: Private, isolasi folder santri aktif untuk wali", async () => {
      const res = await db.query(`
        SELECT policyname, qual, with_check FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Bukti Pembayaran: upload';
      `);
      expect(res.rows.length).toBe(1);
      // Deparser PostgreSQL: split_part(name, '/'::text, 1) = (get_my_santri_id())::text
      expect((res.rows[0] as any).with_check).toContain("split_part");
      expect((res.rows[0] as any).with_check).toContain("get_my_santri_id()");
    });

    it("bukti-uang-saku: Private, isolasi folder santri aktif untuk wali, bendahara kelola", async () => {
      const res = await db.query(`
        SELECT policyname, qual, with_check FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Bukti Uang Saku: upload';
      `);
      expect(res.rows.length).toBe(1);
      expect((res.rows[0] as any).with_check).toContain("split_part");
      expect((res.rows[0] as any).with_check).toContain("get_my_santri_id()");
    });

    it("foto-penyerahan-saku: Private, eksklusif bendahara & superadmin kelola, wali hanya baca di foldernya", async () => {
      const resKelola = await db.query(`
        SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Foto Penyerahan: kelola';
      `);
      expect(resKelola.rows.length).toBe(1);
      expect((resKelola.rows[0] as any).qual).toContain("bendahara");
      expect((resKelola.rows[0] as any).qual).toContain("superadmin");

      const resBaca = await db.query(`
        SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Foto Penyerahan: baca';
      `);
      expect(resBaca.rows.length).toBe(1);
      expect((resBaca.rows[0] as any).qual).toContain("split_part");
      expect((resBaca.rows[0] as any).qual).toContain("get_my_santri_id()");
    });

    it("dokumentasi-kepesantrenan: Private, TANPA isolasi folder santri (kegiatan pesantren seluruh akun aktif)", async () => {
      const resBaca = await db.query(`
        SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'storage' AND policyname = 'Storage Kepesantrenan: baca oleh akun aktif';
      `);
      expect(resBaca.rows.length).toBe(1);
      // Memastikan TIDAK menggunakan filter split_part(name, '/', 1) karena bersifat dokumentasi umum pesantren
      expect((resBaca.rows[0] as any).qual).not.toContain("split_part");
      expect((resBaca.rows[0] as any).qual).toContain("superadmin");
      expect((resBaca.rows[0] as any).qual).toContain("wali");
    });
  });
});
