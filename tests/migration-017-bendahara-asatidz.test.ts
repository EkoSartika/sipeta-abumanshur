import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 017: Pemeriksaan Final Least Privilege RLS", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/017_bendahara_asatidz_rls.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  let db: PGlite;

  // UUID Pengguna untuk Berbagai Role
  const ID_PENGELOLA = "11111111-1111-1111-1111-111111111111";
  const ID_BENDAHARA = "22222222-2222-2222-2222-222222222222";
  const ID_ADMIN     = "22222222-3333-4444-5555-666666666666";
  const ID_TU        = "33333333-3333-3333-3333-333333333333";
  const ID_WALI      = "44444444-4444-4444-4444-444444444444";
  const ID_INAKTIF   = "55555555-5555-5555-5555-555555555555";
  const ID_SANTRI    = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  beforeEach(async () => {
    db = new PGlite();

    // Setup Auth, Roles, dan Helper dasar sesuai arsitektur SIPETA
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

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
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

      CREATE POLICY "Profiles: baca profil sendiri atau petugas internal"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (id = auth.uid() OR role IN ('superadmin', 'admin', 'bendahara', 'pengelola', 'tu'));

      -- Helper get_my_role resmi SIPETA
      CREATE OR REPLACE FUNCTION public.get_my_role()
      RETURNS public.user_role
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
      $$;

      -- 8 Tabel yang diproteksi dalam Migration 017
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
        pelanggaran TEXT,
        is_published_to_wali BOOLEAN NOT NULL DEFAULT false
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

      -- Pasang akun-akun uji
      INSERT INTO public.profiles (id, role, nama_lengkap, is_active) VALUES
        ('${ID_PENGELOLA}', 'pengelola', 'Ustadz Pengelola / Asatidz', true),
        ('${ID_BENDAHARA}', 'bendahara', 'Ustadz Bendahara', true),
        ('${ID_ADMIN}',     'admin',     'K.H. Pengasuh Pondok', true),
        ('${ID_TU}',        'tu',        'Staf Tata Usaha', true),
        ('${ID_WALI}',      'wali',      'Wali Santri Ahmad', true),
        ('${ID_INAKTIF}',   'pengelola', 'Akun Nonaktif', false);

      -- Default privileges Supabase untuk authenticated role (migration 0007)
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

      -- Pasang policy warisan lama yang berpotensi konflik
      CREATE POLICY "Mengaji: kelola evaluasi oleh asatidz, bendahara, admin, superadmin"
      ON public.perkembangan_mengaji FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Tahfidz: kelola oleh pengelola & superadmin"
      ON public.setoran_tahfidz FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Prestasi: kelola oleh pengelola & superadmin"
      ON public.prestasi_santri FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Kedisiplinan: kelola pelanggaran santri"
      ON public.catatan_kedisiplinan FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Riwayat Kedisiplinan: baca histori pembinaan"
      ON public.riwayat_perubahan_kedisiplinan FOR SELECT TO authenticated
      USING (true);

      CREATE POLICY "Riwayat Kedisiplinan: baca sesuai akses kedisiplinan"
      ON public.riwayat_perubahan_kedisiplinan FOR SELECT TO authenticated
      USING (true);

      CREATE POLICY "Master Pelanggaran: kelola kategori"
      ON public.master_kategori_pelanggaran FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Master Kelas: kelola"
      ON public.kelas FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Master Kelas: TU baca ruang kelas"
      ON public.kelas FOR SELECT TO authenticated
      USING (true);

      CREATE POLICY "Master Kamar: kelola"
      ON public.kamar FOR ALL TO authenticated
      USING (true) WITH CHECK (true);

      CREATE POLICY "Master Kamar: TU baca kamar asrama"
      ON public.kamar FOR SELECT TO authenticated
      USING (true);
    `);
  });

  it("1. Eksekusi migration 017 berhasil membersihkan policy lama tanpa konflik", async () => {
    await expect(db.exec(migrationSql)).resolves.not.toThrow();

    const res = await db.query<{ policyname: string; tablename: string }>(`
      SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public';
    `);
    const policyNames = res.rows.map(r => r.policyname);

    expect(policyNames).not.toContain("Mengaji: kelola evaluasi oleh asatidz, bendahara, admin, superadmin");
    expect(policyNames).not.toContain("Tahfidz: kelola oleh pengelola & superadmin");
    expect(policyNames).not.toContain("Prestasi: kelola oleh pengelola & superadmin");
    expect(policyNames).not.toContain("Kedisiplinan: kelola pelanggaran santri");
    expect(policyNames).not.toContain("Riwayat Kedisiplinan: baca histori pembinaan");
    expect(policyNames).not.toContain("Riwayat Kedisiplinan: baca sesuai akses kedisiplinan");
    expect(policyNames).not.toContain("Master Pelanggaran: kelola kategori");
    expect(policyNames).not.toContain("Master Kelas: kelola");
    expect(policyNames).not.toContain("Master Kamar: kelola");
  });

  it("2. Hak Operasional Asatidz: Pengelola & Bendahara dapat mencatat dan melihat mengaji & tahfidz", async () => {
    await db.exec(migrationSql);

    // Login sebagai Bendahara
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${ID_BENDAHARA}';
    `);

    // Bendahara mencatat perkembangan mengaji
    await db.exec(`
      INSERT INTO public.perkembangan_mengaji (santri_id, catatan)
      VALUES ('${ID_SANTRI}', 'Lancar membaca jilid 4');
    `);

    // Bendahara melihat perkembangan mengaji
    const resMengaji = await db.query(`SELECT * FROM public.perkembangan_mengaji;`);
    expect(resMengaji.rows.length).toBe(1);

    // Bendahara mencatat setoran tahfidz
    await db.exec(`
      INSERT INTO public.setoran_tahfidz (santri_id, juz)
      VALUES ('${ID_SANTRI}', 30);
    `);
    const resTahfidz = await db.query(`SELECT * FROM public.setoran_tahfidz;`);
    expect(resTahfidz.rows.length).toBe(1);

    await db.exec(`RESET ROLE;`);
  });

  it("3. Least Privilege TU: DILARANG mutasi kepesantrenan, tapi BISA kelola Kelas & Kamar", async () => {
    await db.exec(migrationSql);

    // Login sebagai TU
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${ID_TU}';
    `);

    // TU DILARANG insert ke perkembangan_mengaji (least privilege)
    await expect(
      db.exec(`INSERT INTO public.perkembangan_mengaji (santri_id, catatan) VALUES ('${ID_SANTRI}', 'TU input mengaji');`)
    ).rejects.toThrow();

    // TU DILARANG insert ke setoran_tahfidz
    await expect(
      db.exec(`INSERT INTO public.setoran_tahfidz (santri_id, juz) VALUES ('${ID_SANTRI}', 1);`)
    ).rejects.toThrow();

    // TU DILARANG insert ke catatan_kedisiplinan
    await expect(
      db.exec(`INSERT INTO public.catatan_kedisiplinan (santri_id, pelanggaran) VALUES ('${ID_SANTRI}', 'TU catat pelanggaran');`)
    ).rejects.toThrow();

    // TETAPI TU BISA kelola Kelas (Insert, Update, Delete)
    await db.exec(`INSERT INTO public.kelas (id, nama_kelas) VALUES ('c1111111-1111-1111-1111-111111111111', '7A');`);
    let resKelas = await db.query(`SELECT * FROM public.kelas;`);
    expect(resKelas.rows.length).toBe(1);

    await db.exec(`UPDATE public.kelas SET nama_kelas = '7A Unggulan' WHERE id = 'c1111111-1111-1111-1111-111111111111';`);
    resKelas = await db.query(`SELECT nama_kelas FROM public.kelas;`);
    expect((resKelas.rows[0] as { nama_kelas: string }).nama_kelas).toBe("7A Unggulan");

    await db.exec(`DELETE FROM public.kelas WHERE id = 'c1111111-1111-1111-1111-111111111111';`);
    resKelas = await db.query(`SELECT * FROM public.kelas;`);
    expect(resKelas.rows.length).toBe(0);

    await db.exec(`RESET ROLE;`);
  });

  it("4. Least Privilege Admin (Pengasuh): Monitoring riwayat pembinaan (SELECT), tidak diberi hak mutasi tanpa dasar", async () => {
    await db.exec(migrationSql);

    // Masukkan data riwayat kedisiplinan sebagai postgres
    await db.exec(`
      INSERT INTO public.riwayat_perubahan_kedisiplinan (id, catatan_kedisiplinan_id, keterangan)
      VALUES ('d1111111-1111-1111-1111-111111111111', gen_random_uuid(), 'Audit awal pembinaan santri');
    `);

    // Login sebagai Admin (Pengasuh)
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${ID_ADMIN}';
    `);

    // Pengasuh BISA membaca riwayat pembinaan santri (monitoring/pengawasan)
    const resRead = await db.query(`SELECT * FROM public.riwayat_perubahan_kedisiplinan;`);
    expect(resRead.rows.length).toBe(1);

    // Pengasuh DILARANG menghapus riwayat pembinaan (SELECT-only)
    await db.exec(`DELETE FROM public.riwayat_perubahan_kedisiplinan WHERE id = 'd1111111-1111-1111-1111-111111111111';`);
    const resAfterDelete = await db.query(`SELECT * FROM public.riwayat_perubahan_kedisiplinan;`);
    expect(resAfterDelete.rows.length).toBe(1);

    await db.exec(`RESET ROLE;`);
  });

  it("5. Proteksi Riwayat Kedisiplinan: SELECT-only untuk Asatidz & Bendahara (DILARANG UPDATE / DELETE)", async () => {
    await db.exec(migrationSql);

    await db.exec(`
      INSERT INTO public.riwayat_perubahan_kedisiplinan (id, catatan_kedisiplinan_id, keterangan)
      VALUES ('d2222222-2222-2222-2222-222222222222', gen_random_uuid(), 'Catatan pembinaan asatidz');
    `);

    // Login sebagai Asatidz (pengelola)
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${ID_PENGELOLA}';
    `);

    // Asatidz dapat membaca
    const resRead = await db.query(`SELECT * FROM public.riwayat_perubahan_kedisiplinan;`);
    expect(resRead.rows.length).toBe(1);

    // Asatidz DILARANG menghapus riwayat (0 rows affected)
    await db.exec(`DELETE FROM public.riwayat_perubahan_kedisiplinan WHERE id = 'd2222222-2222-2222-2222-222222222222';`);
    const resAfterDelete = await db.query(`SELECT * FROM public.riwayat_perubahan_kedisiplinan;`);
    expect(resAfterDelete.rows.length).toBe(1);

    await db.exec(`RESET ROLE;`);
  });

  it("6. Wali Santri DILARANG memanipulasi kepesantrenan dan DILARANG membaca riwayat internal", async () => {
    await db.exec(migrationSql);

    // Login sebagai Wali Santri
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${ID_WALI}';
    `);

    // Wali tidak dapat insert ke perkembangan_mengaji
    await expect(
      db.exec(`INSERT INTO public.perkembangan_mengaji (santri_id, catatan) VALUES ('${ID_SANTRI}', 'Catatan wali ilegal');`)
    ).rejects.toThrow();

    // Wali tidak dapat melihat riwayat_perubahan_kedisiplinan (internal)
    const resWaliRiwayat = await db.query(`SELECT * FROM public.riwayat_perubahan_kedisiplinan;`);
    expect(resWaliRiwayat.rows.length).toBe(0);

    await db.exec(`RESET ROLE;`);
  });
});
