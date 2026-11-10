import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 015: Profil Pesantren & Tahun Pelajaran Audit", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/015_profil_pesantren.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  it("1. File migrasi 015 ada dan menggunakan transaksi atomik (BEGIN ... COMMIT)", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(migrationSql).toMatch(/^BEGIN;/m);
    expect(migrationSql).toMatch(/COMMIT;\s*$/m);
  });

  it("2. Tabel public.profil_pesantren memiliki skema lengkap dan singleton constraint", () => {
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.profil_pesantren");
    expect(migrationSql).toContain("id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID");
    expect(migrationSql).toContain("nama_resmi TEXT NOT NULL");
    expect(migrationSql).toContain("nspp TEXT DEFAULT");
    expect(migrationSql).toContain("npsn TEXT DEFAULT");
    expect(migrationSql).toContain("akreditasi TEXT DEFAULT");
    expect(migrationSql).toContain("sk_pendirian TEXT DEFAULT");
    expect(migrationSql).toContain("alamat TEXT NOT NULL");
    expect(migrationSql).toContain("tahun_pelajaran_aktif TEXT");
    expect(migrationSql).toContain("semester_aktif TEXT");
    expect(migrationSql).toContain("informasi_umum TEXT");
    expect(migrationSql).toContain("updated_by UUID REFERENCES public.profiles(id)");
    expect(migrationSql).toContain("CONSTRAINT chk_profil_pesantren_singleton CHECK (id = '00000000-0000-0000-0000-000000000001'::UUID)");
  });

  it("3. Inisialisasi data default bersifat non-destruktif (WHERE NOT EXISTS)", () => {
    expect(migrationSql).toContain("WHERE NOT EXISTS (SELECT 1 FROM public.profil_pesantren)");
    expect(migrationSql).not.toContain("DROP TABLE public.profil_pesantren");
    expect(migrationSql).not.toContain("TRUNCATE");
  });

  it("4. RLS aktif dan aman: TU, Admin, dan Superadmin dapat mengelola profil; role lain hanya baca; DELETE dilarang", () => {
    expect(migrationSql).toContain("ALTER TABLE public.profil_pesantren ENABLE ROW LEVEL SECURITY;");
    // SELECT: anon dan authenticated
    expect(migrationSql).toContain('CREATE POLICY "Profil Pesantren: dapat dibaca oleh seluruh pengguna"');
    expect(migrationSql).toContain("TO anon, authenticated");
    // UPDATE: TU, Admin, Superadmin
    expect(migrationSql).toContain('CREATE POLICY "Profil Pesantren: kelola update oleh TU, Admin, Superadmin"');
    expect(migrationSql).toContain("public.get_my_role() IN ('tu', 'admin', 'superadmin')");
    // Tidak ada DELETE policy pada profil_pesantren
    expect(migrationSql).not.toContain('FOR DELETE\nON public.profil_pesantren');
    expect(migrationSql).not.toContain('FOR ALL\nON public.profil_pesantren');
  });

  it("5. Hardening tahun_ajaran: menghapus SEMUA policy lama guna mencegah kontaminasi permissive OR", () => {
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Master Kelas/Kamar/TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Master TahunAjaran: baca oleh akun aktif berwenang" ON public.tahun_ajaran;');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Master TahunAjaran: admin & superadmin kelola" ON public.tahun_ajaran;');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "Master TahunAjaran: TU kelola status aktif" ON public.tahun_ajaran;');

    // Policy baru tahun_ajaran terpisah ketat
    expect(migrationSql).toContain('CREATE POLICY "Tahun Ajaran: dapat dibaca oleh seluruh akun berwenang dan publik"');
    expect(migrationSql).toContain('CREATE POLICY "Tahun Ajaran: admin dan superadmin tambah master"');
    expect(migrationSql).toContain('CREATE POLICY "Tahun Ajaran: admin dan superadmin ubah data master"');
    expect(migrationSql).toContain('CREATE POLICY "Tahun Ajaran: hanya superadmin hapus master"');
  });

  it("6. Trigger guard menggunakan PG_CONTEXT native call stack inspection (bebas static salt)", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.prevent_direct_tahun_ajaran_active_update()");
    expect(migrationSql).toContain("GET DIAGNOSTICS v_context = PG_CONTEXT;");
    expect(migrationSql).toContain("v_context NOT LIKE '%rpc_set_active_tahun_ajaran%'");
    expect(migrationSql).toContain("CREATE TRIGGER trg_guard_direct_tahun_ajaran_update");
    expect(migrationSql).toContain("BEFORE UPDATE ON public.tahun_ajaran");
    // Memastikan tidak ada hardcoded static salt di SQL
    expect(migrationSql).not.toContain("::SIPETA_INTERNAL_SECURE_TOKEN::");
  });

  it("7. RPC rpc_set_active_tahun_ajaran atomik dan memiliki pembatasan EXECUTE", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_set_active_tahun_ajaran");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("v_role NOT IN ('tu', 'admin', 'superadmin')");
    expect(migrationSql).toContain("UPDATE public.tahun_ajaran SET is_active = false WHERE is_active = true;");
    expect(migrationSql).toContain("UPDATE public.tahun_ajaran SET is_active = true WHERE id = p_tahun_ajaran_id;");
    expect(migrationSql).toContain("UPDATE public.profil_pesantren");
    expect(migrationSql).toContain("tahun_pelajaran_aktif = v_tahun_nama");
    // Pembatasan eksekusi
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) FROM PUBLIC;");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_set_active_tahun_ajaran(UUID) TO authenticated;");
  });

  it("8. Trigger audit logs level database menjamin pencatatan ke public.audit_logs", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.trg_audit_profil_pesantren()");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("INSERT INTO public.audit_logs");
    expect(migrationSql).toContain("'UPDATE_PROFIL_PESANTREN'");
    expect(migrationSql).toContain("to_jsonb(OLD)");
    expect(migrationSql).toContain("to_jsonb(NEW)");

    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.trg_audit_tahun_ajaran()");
    expect(migrationSql).toContain("'UPDATE_STATUS_TAHUN_AJARAN'");
  });

  it("9. Publikasi Supabase Realtime diaktifkan untuk profil_pesantren dan tahun_ajaran", () => {
    expect(migrationSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.profil_pesantren");
    expect(migrationSql).toContain("ALTER PUBLICATION supabase_realtime ADD TABLE public.tahun_ajaran");
  });

  it("10. AdministrasiService dan SipetaContext terintegrasi dengan RPC, fallback, dan Realtime listener", () => {
    const serviceContent = fs.readFileSync(path.resolve(__dirname, "../src/lib/services/administrasi.service.ts"), "utf8");
    const contextContent = fs.readFileSync(path.resolve(__dirname, "../src/lib/store/sipeta-context.tsx"), "utf8");

    expect(serviceContent).toContain('rpc("rpc_set_active_tahun_ajaran"');
    expect(serviceContent).toContain("getProfilPesantren");
    expect(serviceContent).toContain("updateProfilPesantren");

    expect(contextContent).toContain('channel("sipeta-profil-realtime")');
    expect(contextContent).toContain('"profil_pesantren"');
    expect(contextContent).toContain('"tahun_ajaran"');
    expect(contextContent).toContain("await administrasiService.updateProfilPesantren");
  });

  it(
    "11. Validasi Eksekusi PGlite Nyata: File 015_profil_pesantren.sql dieksekusi tanpa error sintaks dan trigger berfungsi",
    async () => {
      const db = new PGlite();
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT '00000000-0000-0000-0000-000000000099'::UUID;
      $$ LANGUAGE sql;

      CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'tu', 'bendahara', 'pengelola', 'wali');

      CREATE TABLE profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role user_role NOT NULL DEFAULT 'tu'
      );
      INSERT INTO profiles (id, role) VALUES ('00000000-0000-0000-0000-000000000099', 'tu');

      CREATE TABLE tahun_ajaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama TEXT NOT NULL,
        tanggal_mulai DATE,
        tanggal_selesai DATE,
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        user_role user_role,
        aktivitas TEXT,
        jenis_objek TEXT,
        objek_id TEXT,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        waktu TIMESTAMPTZ DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role AS $$
      BEGIN
        RETURN 'tu'::user_role;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Eksekusi naskah SQL 015 secara utuh
    await db.exec(migrationSql);

    // Insert 2 tahun ajaran
    await db.query(`
      INSERT INTO tahun_ajaran (id, nama, is_active) VALUES
      ('11111111-1111-1111-1111-111111111111', '2024/2025', true),
      ('22222222-2222-2222-2222-222222222222', '2025/2026', false);
    `);

    // 1. Direct update is_active HARUS GAGAL
    let directUpdateError = false;
    try {
      await db.query(`UPDATE tahun_ajaran SET is_active = true WHERE id = '22222222-2222-2222-2222-222222222222'`);
    } catch (e: any) {
      directUpdateError = true;
      expect(e.message).toContain("HANYA dapat diubah melalui rpc_set_active_tahun_ajaran()");
    }
    expect(directUpdateError).toBe(true);

    // 2. Direct update nama master HARUS BERHASIL
    await db.query(`UPDATE tahun_ajaran SET nama = '2025/2026 Ganjil' WHERE id = '22222222-2222-2222-2222-222222222222'`);

    // 3. RPC execution HARUS BERHASIL
    const rpcRes: any = await db.query(`SELECT rpc_set_active_tahun_ajaran('22222222-2222-2222-2222-222222222222') as res`);
    expect(rpcRes.rows[0].res.success).toBe(true);

    // 4. Pastikan hanya ada 1 tahun ajaran aktif
    const activeRows: any = await db.query(`SELECT id, is_active FROM tahun_ajaran WHERE is_active = true`);
    expect(activeRows.rows.length).toBe(1);
    expect(activeRows.rows[0].id).toBe('22222222-2222-2222-2222-222222222222');

    // 5. Pastikan audit_logs terisi
    const auditRows: any = await db.query(`SELECT aktivitas, jenis_objek FROM audit_logs`);
    expect(auditRows.rows.length).toBeGreaterThanOrEqual(2);
  }, 25000);
});
