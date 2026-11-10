import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 017: Penyelarasan Hak Akses Asatidz (pengelola), Bendahara, dan TU", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/017_bendahara_asatidz_rls.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  it("1. Migration 017 TIDAK mengandung string enum 'asatidz' pada klausul policy/kondisi database", () => {
    // Memastikan tidak ada role 'asatidz' dalam array role atau perbandingan enum
    expect(migrationSql).not.toMatch(/'asatidz'/);
    // Role yang sah harus berupa 'pengelola' untuk Asatidz
    expect(migrationSql).toContain("'pengelola'");
    expect(migrationSql).toContain("'bendahara'");
  });

  it("2. Riwayat perubahan kedisiplinan hanya FOR SELECT (bukan FOR ALL)", () => {
    expect(migrationSql).toContain('CREATE POLICY "asatidz_bendahara_select_riwayat_kedisiplinan" ON public.riwayat_perubahan_kedisiplinan');
    expect(migrationSql).toContain("FOR SELECT");
    expect(migrationSql).not.toMatch(/CREATE POLICY "asatidz_bendahara_all_riwayat_kedisiplinan"/);
  });

  it("3. Eksekusi sukses di PGlite dengan enum user_role asli SIPETA (tanpa enum asatidz)", async () => {
    const db = new PGlite();

    // 1. Setup Auth & Roles
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      -- Definisi asli SIPETA: enum user_role TIDAK memiliki 'asatidz'
      CREATE TYPE public.user_role AS ENUM (
        'superadmin',
        'admin',
        'bendahara',
        'pengelola',
        'wali',
        'tu'
      );

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role public.user_role NOT NULL,
        nama_lengkap TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      -- Tabel-tabel yang diproteksi RLS
      CREATE TABLE public.perkembangan_mengaji (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID NOT NULL,
        catatan TEXT
      );
      ALTER TABLE public.perkembangan_mengaji ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.setoran_tahfidz (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID NOT NULL,
        juz INTEGER
      );
      ALTER TABLE public.setoran_tahfidz ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.prestasi_santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID NOT NULL,
        prestasi TEXT
      );
      ALTER TABLE public.prestasi_santri ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.catatan_kedisiplinan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID NOT NULL,
        pelanggaran TEXT
      );
      ALTER TABLE public.catatan_kedisiplinan ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.riwayat_perubahan_kedisiplinan (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        catatan_kedisiplinan_id UUID NOT NULL,
        keterangan TEXT
      );
      ALTER TABLE public.riwayat_perubahan_kedisiplinan ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.master_kategori_pelanggaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_kategori TEXT NOT NULL
      );
      ALTER TABLE public.master_kategori_pelanggaran ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.kelas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_kelas TEXT NOT NULL
      );
      ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;

      CREATE TABLE public.kamar (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_kamar TEXT NOT NULL
      );
      ALTER TABLE public.kamar ENABLE ROW LEVEL SECURITY;
    `);

    // 2. Jalankan migrasi 017 yang telah diperbaiki
    await expect(db.exec(migrationSql)).resolves.not.toThrow();

    // 3. Verifikasi policy terdaftar di pg_policies
    const res = await db.query<{ policyname: string; tablename: string; cmd: string }>(`
      SELECT policyname, tablename, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);

    const policyMap = new Map(res.rows.map(r => [`${r.tablename}.${r.policyname}`, r.cmd]));

    expect(policyMap.get("perkembangan_mengaji.asatidz_bendahara_all_mengaji")).toBe("ALL");
    expect(policyMap.get("setoran_tahfidz.asatidz_bendahara_all_tahfidz")).toBe("ALL");
    expect(policyMap.get("prestasi_santri.asatidz_bendahara_all_prestasi")).toBe("ALL");
    expect(policyMap.get("catatan_kedisiplinan.asatidz_bendahara_all_kedisiplinan")).toBe("ALL");
    expect(policyMap.get("riwayat_perubahan_kedisiplinan.asatidz_bendahara_select_riwayat_kedisiplinan")).toBe("SELECT");
    expect(policyMap.get("master_kategori_pelanggaran.asatidz_bendahara_all_master_kategori")).toBe("ALL");
    expect(policyMap.get("kelas.tu_admin_all_kelas")).toBe("ALL");
    expect(policyMap.get("kamar.tu_admin_all_kamar")).toBe("ALL");
  });
});
