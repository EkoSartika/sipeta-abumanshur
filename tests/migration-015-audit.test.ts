import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

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

  it("6. Trigger guard mencegah UPDATE langsung pada kolom is_active tahun_ajaran dengan dynamic nonce & role check", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.prevent_direct_tahun_ajaran_active_update()");
    expect(migrationSql).toContain("current_setting('sipeta.active_switch_nonce', true)");
    expect(migrationSql).toContain("v_expected_nonce IS NULL OR v_expected_nonce = '' OR v_role NOT IN ('tu', 'admin', 'superadmin')");
    expect(migrationSql).toContain("CREATE TRIGGER trg_guard_direct_tahun_ajaran_update");
    expect(migrationSql).toContain("BEFORE UPDATE ON public.tahun_ajaran");
  });

  it("7. RPC rpc_set_active_tahun_ajaran memiliki dynamic cryptographic nonce, exception safety, dan pembatasan EXECUTE", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_set_active_tahun_ajaran");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("v_role NOT IN ('tu', 'admin', 'superadmin')");
    expect(migrationSql).toContain("v_nonce := md5(");
    expect(migrationSql).toContain("PERFORM set_config('sipeta.active_switch_nonce', v_nonce, true);");
    expect(migrationSql).toContain("PERFORM set_config('sipeta.active_switch_nonce', '', true);");
    expect(migrationSql).toContain("EXCEPTION WHEN OTHERS THEN");
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
});
