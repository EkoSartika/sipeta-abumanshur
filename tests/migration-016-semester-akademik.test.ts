import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";

describe("SIPETA Migration 016: Fitur Manajemen Semester Akademik & RPC Pergantian Semester", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/016_semester_akademik.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  it("1. File migrasi 016 ada dan menggunakan transaksi atomik (BEGIN ... COMMIT)", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(migrationSql).toMatch(/^BEGIN;/m);
    expect(migrationSql).toMatch(/COMMIT;\s*$/m);
  });

  it("2. Verifikasi kolom semester_aktif pada public.profil_pesantren dengan CHECK ('Ganjil', 'Genap')", () => {
    expect(migrationSql).toContain("information_schema.columns");
    expect(migrationSql).toContain("table_name = 'profil_pesantren'");
    expect(migrationSql).toContain("column_name = 'semester_aktif'");
    expect(migrationSql).toContain("CHECK (semester_aktif IN ('Ganjil', 'Genap'))");
  });

  it("3. RPC rpc_set_active_semester terdefinisi secara aman (SECURITY DEFINER, SET search_path)", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_set_active_semester(p_semester TEXT)");
    expect(migrationSql).toContain("RETURNS JSONB");
    expect(migrationSql).toContain("SECURITY DEFINER");
    expect(migrationSql).toContain("SET search_path = public, pg_temp");
  });

  it("4. Validasi autentikasi ketat: auth.uid() wajib ada", () => {
    expect(migrationSql).toContain("v_operator_id := auth.uid();");
    expect(migrationSql).toContain("IF v_operator_id IS NULL THEN");
    expect(migrationSql).toContain("RAISE EXCEPTION 'Akses ditolak: Pengguna tidak terautentikasi.'");
  });

  it("5. Pembatasan role otoritatif: HANYA Superadmin dan Pengasuh (Admin)", () => {
    expect(migrationSql).toContain("v_role := public.get_my_role();");
    expect(migrationSql).toContain("IF v_role IS NULL OR v_role NOT IN ('superadmin', 'admin') THEN");
    expect(migrationSql).toContain("Hanya Pengasuh (Admin) atau Superadmin");
    // Memastikan TU, Bendahara, Asatidz, Wali TIDAK diizinkan
    expect(migrationSql).not.toContain("'tu', 'admin', 'superadmin'");
  });

  it("6. Validasi nilai semester: hanya 'Ganjil' atau 'Genap'", () => {
    expect(migrationSql).toContain("trim(p_semester) NOT IN ('Ganjil', 'Genap')");
    expect(migrationSql).toContain("Nilai semester tidak valid");
  });

  it("7. Pencatatan audit trail resmi ke public.audit_logs", () => {
    expect(migrationSql).toContain("INSERT INTO public.audit_logs");
    expect(migrationSql).toContain("'SET_ACTIVE_SEMESTER'");
    expect(migrationSql).toContain("'profil_pesantren'");
    expect(migrationSql).toContain("jsonb_build_object");
    expect(migrationSql).toContain("'semester_aktif', v_semester_lama");
    expect(migrationSql).toContain("'semester_aktif', v_clean_semester");
  });

  it("8. Hak eksekusi: dicabut dari PUBLIC & anon, diberikan hanya ke authenticated", () => {
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM PUBLIC;");
    expect(migrationSql).toContain("REVOKE EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) FROM anon;");
    expect(migrationSql).toContain("GRANT EXECUTE ON FUNCTION public.rpc_set_active_semester(TEXT) TO authenticated;");
  });

  it("9. Trigger guard terpasang untuk mencegah direct UPDATE pada semester_aktif dan menolak skema asing", () => {
    expect(migrationSql).toContain("CREATE OR REPLACE FUNCTION public.prevent_direct_profil_pesantren_semester_update()");
    expect(migrationSql).toContain("GET DIAGNOSTICS v_context = PG_CONTEXT;");
    expect(migrationSql).toContain("IF v_context !~ '(^|\\n)PL/pgSQL function (public\\.)?rpc_set_active_semester\\('");
    expect(migrationSql).toContain("OR v_context ~ '(?<!public)\\.rpc_set_active_semester\\('");
    expect(migrationSql).toContain("CREATE TRIGGER trg_guard_direct_profil_pesantren_semester_update");
    expect(migrationSql).toContain("BEFORE UPDATE ON public.profil_pesantren");
    // Verifikasi Temuan 1: Hapus fallback LIMIT 1, hanya singleton ID tetap
    expect(migrationSql).not.toContain("LIMIT 1");
    expect(migrationSql).toContain("WHERE id = '00000000-0000-0000-0000-000000000001'::UUID");
  });

  it("10. Eksekusi runtime PGlite: simulasi RPC, trigger guard, dan penegakan keamanan role", async () => {
    const db = new PGlite();

    // 1. Setup skema dasar
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE TYPE public.user_role AS ENUM (
        'superadmin', 'admin', 'tu', 'bendahara', 'asatidz', 'pengelola', 'wali'
      );

      CREATE TABLE public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role public.user_role NOT NULL,
        nama_lengkap TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE OR REPLACE FUNCTION public.get_my_role()
      RETURNS public.user_role
      LANGUAGE plpgsql
      STABLE
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
          v_role public.user_role;
      BEGIN
          IF auth.uid() IS NULL THEN
              RETURN NULL;
          END IF;
          SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid() AND is_active = true;
          RETURN v_role;
      END;
      $$;

      CREATE TABLE public.profil_pesantren (
        id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
        nama_resmi TEXT NOT NULL DEFAULT 'Pondok Pesantren Modern Abu Manshur',
        tahun_pelajaran_aktif TEXT NOT NULL DEFAULT '2026/2027',
        semester_aktif TEXT NOT NULL DEFAULT 'Ganjil' CHECK (semester_aktif IN ('Ganjil', 'Genap')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by UUID REFERENCES public.profiles(id)
      );

      INSERT INTO public.profil_pesantren (id, nama_resmi, tahun_pelajaran_aktif, semester_aktif)
      VALUES ('00000000-0000-0000-0000-000000000001'::UUID, 'Pondok Pesantren Modern Abu Manshur', '2026/2027', 'Ganjil');

      CREATE TABLE public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        user_role public.user_role,
        aktivitas TEXT NOT NULL,
        jenis_objek TEXT NOT NULL,
        objek_id TEXT NOT NULL,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        waktu TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Jalankan isi migrasi 016
    await db.exec(migrationSql);

    // 3. Setup pengguna dengan berbagai role
    const superadminId = "11111111-1111-1111-1111-111111111111";
    const adminId = "22222222-2222-2222-2222-222222222222";
    const tuId = "33333333-3333-3333-3333-333333333333";
    const waliId = "44444444-4444-4444-4444-444444444444";

    await db.exec(`
      INSERT INTO public.profiles (id, role, nama_lengkap) VALUES
      ('${superadminId}'::UUID, 'superadmin', 'Superadmin Abu Manshur'),
      ('${adminId}'::UUID, 'admin', 'Kyai Pengasuh Abu Manshur'),
      ('${tuId}'::UUID, 'tu', 'Staf Tata Usaha'),
      ('${waliId}'::UUID, 'wali', 'Wali Santri');
    `);

    // Skenario A: Anonim (tidak login) -> DITOLAK
    await db.exec(`SET "request.jwt.claim.sub" = '';`);
    await expect(db.query(`SELECT public.rpc_set_active_semester('Genap');`)).rejects.toThrow(
      /Pengguna tidak terautentikasi/
    );

    // Skenario B: Role Wali -> DITOLAK
    await db.exec(`SET "request.jwt.claim.sub" = '${waliId}';`);
    await expect(db.query(`SELECT public.rpc_set_active_semester('Genap');`)).rejects.toThrow(
      /Akses ditolak.*Hanya Pengasuh/
    );

    // Skenario C: Role TU -> DITOLAK (hanya Pengasuh & Superadmin)
    await db.exec(`SET "request.jwt.claim.sub" = '${tuId}';`);
    await expect(db.query(`SELECT public.rpc_set_active_semester('Genap');`)).rejects.toThrow(
      /Akses ditolak.*Hanya Pengasuh/
    );

    // Skenario D: Input tidak valid oleh Admin -> DITOLAK
    await db.exec(`SET "request.jwt.claim.sub" = '${adminId}';`);
    await expect(db.query(`SELECT public.rpc_set_active_semester('Kuartal');`)).rejects.toThrow(
      /Nilai semester tidak valid/
    );

    // Skenario E: Pengasuh (Admin) mengubah semester menjadi 'Genap' -> BERHASIL
    const adminResult = await db.query<{ rpc_set_active_semester: any }>(
      `SELECT public.rpc_set_active_semester('Genap');`
    );
    const resData = adminResult.rows[0]?.rpc_set_active_semester;
    expect(resData.success).toBe(true);
    expect(resData.semester_baru).toBe("Genap");
    expect(resData.semester_lama).toBe("Ganjil");
    expect(resData.tahun_pelajaran_aktif).toBe("2026/2027");

    // Verifikasi tabel profil_pesantren
    const profilCheck = await db.query<{ semester_aktif: string; tahun_pelajaran_aktif: string }>(
      `SELECT semester_aktif, tahun_pelajaran_aktif FROM public.profil_pesantren;`
    );
    expect(profilCheck.rows[0]?.semester_aktif).toBe("Genap");
    // Tahun pelajaran aktif TIDAK berubah
    expect(profilCheck.rows[0]?.tahun_pelajaran_aktif).toBe("2026/2027");

    // Verifikasi audit_logs mencatat aktivitas SET_ACTIVE_SEMESTER
    const auditCheck = await db.query<{ aktivitas: string; data_sebelum: any; data_sesudah: any }>(
      `SELECT aktivitas, data_sebelum, data_sesudah FROM public.audit_logs ORDER BY waktu DESC LIMIT 1;`
    );
    expect(auditCheck.rows[0]?.aktivitas).toBe("SET_ACTIVE_SEMESTER");
    expect(auditCheck.rows[0]?.data_sebelum.semester_aktif).toBe("Ganjil");
    expect(auditCheck.rows[0]?.data_sesudah.semester_aktif).toBe("Genap");

    // Skenario F: Superadmin mengubah kembali ke 'Ganjil' -> BERHASIL
    await db.exec(`SET "request.jwt.claim.sub" = '${superadminId}';`);
    const superadminResult = await db.query<{ rpc_set_active_semester: any }>(
      `SELECT public.rpc_set_active_semester('Ganjil');`
    );
    const superadminData = superadminResult.rows[0]?.rpc_set_active_semester;
    expect(superadminData.success).toBe(true);
    expect(superadminData.semester_baru).toBe("Ganjil");
    expect(superadminData.semester_lama).toBe("Genap");

    const finalProfil = await db.query<{ semester_aktif: string; tahun_pelajaran_aktif: string }>(
      `SELECT semester_aktif, tahun_pelajaran_aktif FROM public.profil_pesantren;`
    );
    expect(finalProfil.rows[0]?.semester_aktif).toBe("Ganjil");
    expect(finalProfil.rows[0]?.tahun_pelajaran_aktif).toBe("2026/2027");

    // Skenario G: Kegagalan RPC tidak menyebabkan perubahan data profil maupun audit log liar
    await db.exec(`SET "request.jwt.claim.sub" = '${waliId}';`);
    await expect(db.query(`SELECT public.rpc_set_active_semester('Genap');`)).rejects.toThrow();

    const untouchedProfil = await db.query<{ semester_aktif: string }>(
      `SELECT semester_aktif FROM public.profil_pesantren;`
    );
    expect(untouchedProfil.rows[0]?.semester_aktif).toBe("Ganjil");

    // Skenario H: Trigger Guard mencegah direct UPDATE pada semester_aktif
    await db.exec(`SET "request.jwt.claim.sub" = '${tuId}';`);
    await expect(
      db.exec(`UPDATE public.profil_pesantren SET semester_aktif = 'Genap';`)
    ).rejects.toThrow(/Semester aktif HANYA dapat diubah melalui public\.rpc_set_active_semester/);

    // Skenario I: Direct UPDATE pada identitas profil (tanpa mengubah semester_aktif) tetap diizinkan
    await expect(
      db.exec(`UPDATE public.profil_pesantren SET nama_resmi = 'Pondok Pesantren Modern Abu Manshur Cirebon';`)
    ).resolves.not.toThrow();

    // Skenario J: Fungsi dari skema lain (misalnya evil.rpc_set_active_semester) DITOLAK oleh trigger guard
    await db.exec(`
      CREATE SCHEMA evil;
      CREATE OR REPLACE FUNCTION evil.rpc_set_active_semester(p_semester TEXT)
      RETURNS VOID
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        UPDATE public.profil_pesantren SET semester_aktif = p_semester;
      END;
      $$;
    `);
    await expect(
      db.exec(`SELECT evil.rpc_set_active_semester('Genap');`)
    ).rejects.toThrow(/Semester aktif HANYA dapat diubah melalui public\.rpc_set_active_semester/);

    // Skenario K: Verifikasi penolakan singleton jika baris profil tidak ditemukan (tidak ada fallback baris lain)
    await db.exec(`DELETE FROM public.profil_pesantren;`);
    // Buat baris profil non-singleton dengan ID berbeda
    await db.exec(`
      INSERT INTO public.profil_pesantren (id, nama_resmi, tahun_pelajaran_aktif, semester_aktif)
      VALUES ('99999999-9999-9999-9999-999999999999'::UUID, 'Profil Palsu', '2026/2027', 'Ganjil');
    `);
    await db.exec(`SET "request.jwt.claim.sub" = '${superadminId}';`);
    await expect(
      db.query(`SELECT public.rpc_set_active_semester('Genap');`)
    ).rejects.toThrow(/Baris profil pesantren singleton \(00000000-0000-0000-0000-000000000001\) tidak ditemukan/);

    await db.close();
  }, 30000);
});

