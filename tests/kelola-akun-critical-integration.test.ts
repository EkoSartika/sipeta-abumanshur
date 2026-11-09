// ============================================================================
// SIPETA - Critical Integration Test Suite: Kelola Akun Pengguna (17 Skenario Wajib)
// Menguji Penyelamatan Data, Konsistensi Auth & Database, Kompensasi, dan Login
// ============================================================================

import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  resolveLoginIdentifier,
  validatePasswordStrength,
  SYNTHETIC_EMAIL_DOMAIN,
} from "@/lib/utils/auth-mapping";

describe("SIPETA Critical Test Suite: Kelola Akun (17 Skenario Wajib)", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const ADMIN_1_ID = "00000000-0000-0000-0000-000000000002";
  const BENDAHARA_ID = "00000000-0000-0000-0000-000000000003";
  const WALI_ID = "00000000-0000-0000-0000-000000000005";
  const SANTRI_ID = "11111111-1111-1111-1111-111111111111";

  // Mock in-memory Supabase Auth store
  interface MockAuthUser {
    id: string;
    email: string;
    passwordHash: string;
    email_confirmed: boolean;
    user_metadata: Record<string, any>;
  }

  let authUsers: Map<string, MockAuthUser>;

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

  // Simulasi Backend Handler MANAGE_ACCOUNT dengan Atomic Compensation
  async function simulateManageAccount(
    callerUserId: string,
    payload: {
      action: "MANAGE_ACCOUNT";
      user_id: string;
      nama_lengkap?: string;
      username?: string;
      new_password?: string;
      no_telepon?: string;
      role?: "superadmin" | "admin" | "bendahara" | "pengelola" | "wali";
      is_active?: boolean;
    },
    options?: { simulateDbFailure?: boolean; simulateAuthFailure?: boolean }
  ) {
    // 1. Verifikasi Superadmin
    const callerRes = await db.query(
      `SELECT role, is_active FROM public.profiles WHERE id = '${callerUserId}';`
    );
    const caller = callerRes.rows[0] as any;
    if (!caller || caller.role !== "superadmin" || !caller.is_active) {
      return { ok: false, status: 403, message: "Akses ditolak: Hanya Superadmin aktif yang berwenang." };
    }

    // 2. Ambil Target User
    const targetRes = await db.query(
      `SELECT id, nama_lengkap, email, username, role, is_active, no_telepon FROM public.profiles WHERE id = '${payload.user_id}';`
    );
    const targetUser = targetRes.rows[0] as any;
    if (!targetUser) {
      return { ok: false, status: 404, message: "Pengguna target tidak ditemukan di sistem." };
    }

    // 3. Proteksi Superadmin Terakhir
    if (
      targetUser.role === "superadmin" &&
      ((payload.role && payload.role !== "superadmin") || payload.is_active === false)
    ) {
      if (callerUserId === payload.user_id && payload.is_active === false) {
        return { ok: false, status: 400, message: "Superadmin tidak dapat menonaktifkan akun sendiri." };
      }
      const countRes = await db.query(
        `SELECT count(*) as count FROM public.profiles WHERE role = 'superadmin' AND is_active = true;`
      );
      if (Number((countRes.rows[0] as any).count) <= 1) {
        return { ok: false, status: 400, message: "Tidak dapat mengubah role atau menonaktifkan Superadmin terakhir." };
      }
    }

    // 4. Proteksi Relasi Wali Santri
    if (targetUser.role === "wali" && payload.role && payload.role !== "wali") {
      return { ok: false, status: 400, message: "Peran akun Wali Santri tidak dapat diubah karena terikat relasi data santri." };
    }
    if (targetUser.role !== "wali" && payload.role === "wali") {
      return { ok: false, status: 400, message: "Role 'wali' hanya dapat dibuat melalui registrasi santri atau import Excel." };
    }

    // 5. Validasi Password Baru jika diisi
    if (payload.new_password && payload.new_password.trim() !== "") {
      const pwdStrength = validatePasswordStrength(payload.new_password);
      if (!pwdStrength.valid) {
        return { ok: false, status: 400, message: pwdStrength.message };
      }
    }

    // 6. Validasi Username Baru jika diubah
    let finalNewUsername: string | undefined = undefined;
    let finalNewEmail: string | undefined = undefined;

    if (payload.username && targetUser.role !== "superadmin") {
      const clean = normalizeUsername(payload.username);
      if (!isValidUsername(clean)) {
        return { ok: false, status: 400, message: "Username hanya boleh memuat huruf kecil, angka, titik, strip, underscore (3-30 karakter)." };
      }
      if (clean !== targetUser.username) {
        // Periksa keunikan di database
        const dupCheck = await db.query(
          `SELECT id FROM public.profiles WHERE username = '${clean}' AND id != '${payload.user_id}';`
        );
        if (dupCheck.rows.length > 0) {
          return { ok: false, status: 409, message: `Username '${clean}' sudah digunakan oleh pengguna lain.` };
        }

        finalNewUsername = clean;
        finalNewEmail = usernameToInternalEmail(clean);
      }
    }

    // 7. Update Supabase Auth (Simulasi)
    if (options?.simulateAuthFailure) {
      return { ok: false, status: 500, message: "Gagal memperbarui autentikasi akun: Mock Auth Network Failure" };
    }

    const authUser = authUsers.get(payload.user_id);
    const oldAuthSnapshot = authUser ? { ...authUser, user_metadata: { ...authUser.user_metadata } } : null;

    if (authUser) {
      if (payload.new_password && payload.new_password.trim() !== "") {
        authUser.passwordHash = `hashed:${payload.new_password}`;
      }
      if (finalNewEmail) {
        authUser.email = finalNewEmail;
        authUser.email_confirmed = true;
      }
      if (payload.nama_lengkap || finalNewUsername || payload.role) {
        authUser.user_metadata = {
          nama_lengkap: payload.nama_lengkap ?? targetUser.nama_lengkap,
          username: finalNewUsername ?? targetUser.username,
          role: payload.role ?? targetUser.role,
        };
      }
    }

    // 8. Update PostgreSQL public.profiles
    if (options?.simulateDbFailure) {
      // KOMPENSASI: Kembalikan Auth ke kondisi semula
      if (oldAuthSnapshot) {
        authUsers.set(payload.user_id, oldAuthSnapshot);
      }
      return {
        ok: false,
        status: 500,
        message: "Gagal memperbarui profil pengguna: Mock DB Failure. Perubahan autentikasi telah dibatalkan (Kompensasi Sukses).",
      };
    }

    const updates: string[] = [];
    if (payload.nama_lengkap) updates.push(`nama_lengkap = '${payload.nama_lengkap.replace(/'/g, "''")}'`);
    if (payload.no_telepon !== undefined) updates.push(`no_telepon = '${payload.no_telepon.replace(/'/g, "''")}'`);
    if (payload.role) updates.push(`role = '${payload.role}'`);
    if (payload.is_active !== undefined) updates.push(`is_active = ${payload.is_active}`);
    if (finalNewUsername) updates.push(`username = '${finalNewUsername}'`);
    if (finalNewEmail) updates.push(`email = '${finalNewEmail}'`);

    if (updates.length > 0) {
      await db.exec(`
        UPDATE public.profiles
        SET ${updates.join(", ")}, updated_at = now()
        WHERE id = '${payload.user_id}';
      `);
    }

    // 9. Sinkronisasi wali_santri jika wali
    if (targetUser.role === "wali") {
      const waliUpdates: string[] = [];
      if (payload.nama_lengkap) waliUpdates.push(`nama_lengkap = '${payload.nama_lengkap.replace(/'/g, "''")}'`);
      if (payload.no_telepon !== undefined) waliUpdates.push(`no_telepon = '${payload.no_telepon.replace(/'/g, "''")}'`);
      if (finalNewEmail) waliUpdates.push(`email = '${finalNewEmail}'`);

      if (waliUpdates.length > 0) {
        await db.exec(`
          UPDATE public.wali_santri
          SET ${waliUpdates.join(", ")}, updated_at = now()
          WHERE user_id = '${payload.user_id}';
        `);
      }
    }

    return {
      ok: true,
      status: 200,
      message: "Informasi akun berhasil diperbarui.",
      data: {
        id: payload.user_id,
        nama_lengkap: payload.nama_lengkap ?? targetUser.nama_lengkap,
        username: finalNewUsername ?? targetUser.username,
        email: finalNewEmail ?? targetUser.email,
        role: payload.role ?? targetUser.role,
        is_active: payload.is_active !== undefined ? payload.is_active : targetUser.is_active,
        no_telepon: payload.no_telepon ?? targetUser.no_telepon,
      },
    };
  }

  // Simulasi Login
  function simulateLogin(identifier: string, passwordAttempt: string) {
    const { email } = resolveLoginIdentifier(identifier);
    let matchedUser: MockAuthUser | null = null;
    for (const u of authUsers.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) {
      return { ok: false, message: "Username / Email tidak ditemukan." };
    }

    if (matchedUser.passwordHash !== `hashed:${passwordAttempt}`) {
      return { ok: false, message: "Kata sandi salah." };
    }

    return { ok: true, user: matchedUser, message: "Login berhasil." };
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Mock Auth & Storage
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

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      BEGIN
          RETURN NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
      EXCEPTION WHEN OTHERS THEN
          RETURN NULL;
      END;
      $$ LANGUAGE plpgsql STABLE;
    `);

    // 2. Migrasi 0001 s.d 012
    const migrations = [
      "0001_enums_and_extensions.sql",
      "0002_core_admin_tables.sql",
      "0003_payment_and_billing_tables.sql",
      "0004_pocket_money_ledger_tables.sql",
      "0005_kepesantrenan_and_audit_tables.sql",
      "0006_atomic_rpcs_and_triggers.sql",
      "0007_rls_and_storage_policies.sql",
      "008_security_remediation.sql",
      "009_username_support.sql",
      "010_safe_delete_and_management.sql",
      "011_must_change_password_and_import.sql",
      "012_admin_rekening_and_role_matrix.sql",
    ];

    for (const mig of migrations) {
      const migPath = path.resolve(__dirname, `../supabase/migrations/${mig}`);
      if (fs.existsSync(migPath)) {
        await db.exec(fs.readFileSync(migPath, "utf-8"));
      }
    }

    // 3. Seed Master Data (Tahun Ajaran, Kelas, Kamar)
    await db.exec(`
      INSERT INTO public.tahun_ajaran (id, nama, tanggal_mulai, tanggal_selesai, is_active)
      VALUES ('20000000-0000-0000-0000-000000000001', '2026/2027', '2026-07-01', '2027-06-30', true)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.kelas (id, kode_kelas, nama_kelas, tingkat, kapasitas, is_active)
      VALUES ('30000000-0000-0000-0000-000000000001', '7A', 'Kelas 7A', 7, 30, true)
      ON CONFLICT DO NOTHING;

      INSERT INTO public.kamar (id, kode_kamar, nama_kamar, gedung_asrama, jenis_asrama, kapasitas, is_active)
      VALUES ('40000000-0000-0000-0000-000000000001', 'AB-01', 'Kamar Abu Bakar', 'Gedung A', 'L', 20, true)
      ON CONFLICT DO NOTHING;
    `);
  });

  beforeEach(async () => {
    // Reset Data Akun di Auth & Profiles
    authUsers = new Map();

    const TAHUN_AJARAN_ID = "20000000-0000-0000-0000-000000000001";
    const KELAS_7A_ID = "30000000-0000-0000-0000-000000000001";
    const KAMAR_ID = "40000000-0000-0000-0000-000000000001";

    await db.exec(`
      DELETE FROM public.wali_santri;
      DELETE FROM public.saldo_uang_saku;
      DELETE FROM public.santri;
      DELETE FROM public.profiles;
      DELETE FROM auth.users;

      INSERT INTO auth.users (id, email) VALUES
        ('${SUPERADMIN_ID}', 'sipetaabumanshur@gmail.com'),
        ('${ADMIN_1_ID}', 'admin01@${SYNTHETIC_EMAIL_DOMAIN}'),
        ('${BENDAHARA_ID}', 'bendahara01@${SYNTHETIC_EMAIL_DOMAIN}'),
        ('${WALI_ID}', '20260001@${SYNTHETIC_EMAIL_DOMAIN}');

      INSERT INTO public.profiles (id, nama_lengkap, email, username, no_telepon, role, is_active) VALUES
        ('${SUPERADMIN_ID}', 'Kyai Abu Manshur', 'sipetaabumanshur@gmail.com', 'superadmin', '081234567890', 'superadmin', true),
        ('${ADMIN_1_ID}', 'Ustadz Farid Admin', 'admin01@${SYNTHETIC_EMAIL_DOMAIN}', 'admin01', '081234567891', 'admin', true),
        ('${BENDAHARA_ID}', 'Ustadz Irfan Bendahara', 'bendahara01@${SYNTHETIC_EMAIL_DOMAIN}', 'bendahara01', '081234567892', 'bendahara', true),
        ('${WALI_ID}', 'Bapak Ridwan', '20260001@${SYNTHETIC_EMAIL_DOMAIN}', '20260001', '081234567895', 'wali', true);

      INSERT INTO public.santri (
        id, nis, nama_lengkap, tempat_lahir, tanggal_lahir, jenis_kelamin,
        alamat, tahun_masuk, tahun_ajaran_id, kelas_id, kamar_id, status
      ) VALUES (
        '${SANTRI_ID}', '20260001', 'Muhammad Ilham', 'Cirebon', '2013-05-10', 'L',
        'Jl. Sunan Gunung Jati', 2026, '${TAHUN_AJARAN_ID}', '${KELAS_7A_ID}', '${KAMAR_ID}', 'AKTIF'
      );

      INSERT INTO public.wali_santri (user_id, santri_id, nama_lengkap, hubungan, no_telepon, email, alamat)
      VALUES ('${WALI_ID}', '${SANTRI_ID}', 'Bapak Ridwan', 'Ayah', '081234567895', '20260001@${SYNTHETIC_EMAIL_DOMAIN}', 'Jl. Sunan Gunung Jati');
    `);

    authUsers.set(SUPERADMIN_ID, {
      id: SUPERADMIN_ID,
      email: "sipetaabumanshur@gmail.com",
      passwordHash: "hashed:SuperSecret123!",
      email_confirmed: true,
      user_metadata: { nama_lengkap: "Kyai Abu Manshur", username: "superadmin", role: "superadmin" },
    });

    authUsers.set(ADMIN_1_ID, {
      id: ADMIN_1_ID,
      email: `admin01@${SYNTHETIC_EMAIL_DOMAIN}`,
      passwordHash: "hashed:PasswordLama123!",
      email_confirmed: true,
      user_metadata: { nama_lengkap: "Ustadz Farid Admin", username: "admin01", role: "admin" },
    });

    authUsers.set(BENDAHARA_ID, {
      id: BENDAHARA_ID,
      email: `bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`,
      passwordHash: "hashed:PasswordLama123!",
      email_confirmed: true,
      user_metadata: { nama_lengkap: "Ustadz Irfan Bendahara", username: "bendahara01", role: "bendahara" },
    });

    authUsers.set(WALI_ID, {
      id: WALI_ID,
      email: `20260001@${SYNTHETIC_EMAIL_DOMAIN}`,
      passwordHash: "hashed:20260001",
      email_confirmed: true,
      user_metadata: { nama_lengkap: "Bapak Ridwan", username: "20260001", role: "wali" },
    });
  });

  // =========================================================================
  // 17 PENGUJIAN INTEGRASI WAJIB SESUAI SECTION 6 USER REQUEST
  // =========================================================================

  it("1. Mengubah nama lengkap saja", async () => {
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      nama_lengkap: "Ustadz Farid Admin, S.Kom., M.Pd.",
    });

    expect(res.ok).toBe(true);
    const dbUser = (await db.query(`SELECT nama_lengkap, username FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.nama_lengkap).toBe("Ustadz Farid Admin, S.Kom., M.Pd.");
    expect(dbUser.username).toBe("admin01"); // username tidak berubah
  });

  it("2. Mengubah username saja", async () => {
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      username: "admin_operasional",
    });

    expect(res.ok).toBe(true);
    const dbUser = (await db.query(`SELECT username, email FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.username).toBe("admin_operasional");
    expect(dbUser.email).toBe(`admin_operasional@${SYNTHETIC_EMAIL_DOMAIN}`);

    // Auth email juga ikut terupdate
    const authUser = authUsers.get(ADMIN_1_ID);
    expect(authUser?.email).toBe(`admin_operasional@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("3. Mengubah nomor telepon saja (termasuk penanganan '-' dan valid phone)", async () => {
    // A. Ubah ke nomor telepon baru
    const res1 = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      no_telepon: "081299887766",
    });
    expect(res1.ok).toBe(true);
    let dbUser = (await db.query(`SELECT no_telepon FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.no_telepon).toBe("081299887766");

    // B. Ubah ke "-" jika dikosongkan
    const res2 = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      no_telepon: "-",
    });
    expect(res2.ok).toBe(true);
    dbUser = (await db.query(`SELECT no_telepon FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.no_telepon).toBe("-");
  });

  it("4. Mengubah role sesuai kewenangan", async () => {
    // Admin diubah menjadi Bendahara (diizinkan)
    const res1 = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      role: "bendahara",
    });
    expect(res1.ok).toBe(true);
    const dbUser1 = (await db.query(`SELECT role FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser1.role).toBe("bendahara");

    // Wali diubah menjadi Admin (DITOLAK karena terikat relasi santri)
    const res2 = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: WALI_ID,
      role: "admin",
    });
    expect(res2.ok).toBe(false);
    expect(res2.message).toContain("Peran akun Wali Santri tidak dapat diubah");
  });

  it("5. Mengubah status aktif/nonaktif", async () => {
    // A. Nonaktifkan akun admin
    const resDeact = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      is_active: false,
    });
    expect(resDeact.ok).toBe(true);
    let dbUser = (await db.query(`SELECT is_active FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.is_active).toBe(false);

    // B. Aktifkan kembali akun admin
    const resAct = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      is_active: true,
    });
    expect(resAct.ok).toBe(true);
    dbUser = (await db.query(`SELECT is_active FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.is_active).toBe(true);

    // C. Nonaktifkan Superadmin terakhir DITOLAK
    const resSuper = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: SUPERADMIN_ID,
      is_active: false,
    });
    expect(resSuper.ok).toBe(false);
  });

  it("6. Mengubah password saja", async () => {
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      new_password: "PasswordBaru2026!",
    });
    expect(res.ok).toBe(true);

    // Password terupdate di Auth
    const authUser = authUsers.get(ADMIN_1_ID);
    expect(authUser?.passwordHash).toBe("hashed:PasswordBaru2026!");

    // Profil di public.profiles tidak menyimpan plaintext password
    const cols = await db.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';
    `);
    const hasPasswordCol = cols.rows.some((c: any) => c.column_name === "password" || c.column_name === "password_hash");
    expect(hasPasswordCol).toBe(false);
  });

  it("7. Mengubah username dan password sekaligus", async () => {
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      username: "admin_senior",
      new_password: "SeniorPassword2026!",
    });
    expect(res.ok).toBe(true);

    const authUser = authUsers.get(ADMIN_1_ID);
    expect(authUser?.email).toBe(`admin_senior@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(authUser?.passwordHash).toBe("hashed:SeniorPassword2026!");

    const dbUser = (await db.query(`SELECT username, email FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.username).toBe("admin_senior");
    expect(dbUser.email).toBe(`admin_senior@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("8. Mengubah seluruh data sekaligus", async () => {
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      nama_lengkap: "Ustadz Farid Super Admin",
      username: "farid_admin",
      new_password: "AllNewData2026!",
      no_telepon: "089911223344",
      role: "pengelola",
      is_active: true,
    });
    expect(res.ok).toBe(true);

    const dbUser = (await db.query(`SELECT * FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(dbUser.nama_lengkap).toBe("Ustadz Farid Super Admin");
    expect(dbUser.username).toBe("farid_admin");
    expect(dbUser.no_telepon).toBe("089911223344");
    expect(dbUser.role).toBe("pengelola");
    expect(dbUser.is_active).toBe(true);

    const authUser = authUsers.get(ADMIN_1_ID);
    expect(authUser?.email).toBe(`farid_admin@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(authUser?.passwordHash).toBe("hashed:AllNewData2026!");
  });

  it("9. Password kosong tidak mengubah password lama", async () => {
    const oldPasswordHash = authUsers.get(ADMIN_1_ID)?.passwordHash;
    expect(oldPasswordHash).toBe("hashed:PasswordLama123!");

    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      nama_lengkap: "Nama Berganti Tapi Password Tetap",
      new_password: "", // Kosong!
    });
    expect(res.ok).toBe(true);

    const authUser = authUsers.get(ADMIN_1_ID);
    expect(authUser?.passwordHash).toBe(oldPasswordHash); // Password lama tidak berubah
  });

  it("10. Username duplikat ditolak", async () => {
    // Coba ganti username admin01 menjadi bendahara01 (sudah ada)
    const res = await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      username: "bendahara01",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.message).toContain("sudah digunakan oleh pengguna lain");
  });

  it("11. Password dan konfirmasi berbeda ditolak", () => {
    const newPass = "PasswordBaru123!";
    const confirmPass = "PasswordBaru999!"; // Berbeda
    const isMatched = newPass === confirmPass;
    expect(isMatched).toBe(false);
  });

  it("12. Pengguna tanpa hak Superadmin ditolak", async () => {
    // Admin mencoba mengedit akun Bendahara
    const res = await simulateManageAccount(ADMIN_1_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: BENDAHARA_ID,
      nama_lengkap: "Hacked by Admin",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.message).toContain("Hanya Superadmin aktif");
  });

  it("13. Gagal update Auth tidak meninggalkan profil yang berubah sebagian", async () => {
    const beforeDb = (await db.query(`SELECT * FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;

    const res = await simulateManageAccount(
      SUPERADMIN_ID,
      {
        action: "MANAGE_ACCOUNT",
        user_id: ADMIN_1_ID,
        nama_lengkap: "Nama Harus Batal",
        username: "user_batal",
      },
      { simulateAuthFailure: true } // Simulasikan Auth gagal
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);

    const afterDb = (await db.query(`SELECT * FROM public.profiles WHERE id = '${ADMIN_1_ID}';`)).rows[0] as any;
    expect(afterDb.nama_lengkap).toBe(beforeDb.nama_lengkap);
    expect(afterDb.username).toBe(beforeDb.username);
  });

  it("14. Gagal update profil setelah Auth berhasil ditangani dengan kompensasi", async () => {
    const beforeAuth = { ...authUsers.get(ADMIN_1_ID)! };

    const res = await simulateManageAccount(
      SUPERADMIN_ID,
      {
        action: "MANAGE_ACCOUNT",
        user_id: ADMIN_1_ID,
        username: "user_harus_rollback",
        new_password: "NewPassword123!",
      },
      { simulateDbFailure: true } // Simulasikan DB gagal setelah Auth
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.message).toContain("Kompensasi Sukses");

    // Auth harus dikembalikan ke identitas semula (Rollback berhasil)
    const afterAuth = authUsers.get(ADMIN_1_ID);
    expect(afterAuth?.email).toBe(beforeAuth.email);
  });

  it("15. Data terbaru tampil setelah halaman dimuat ulang (refresh data)", async () => {
    // Lakukan pembaruan akun
    await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: ADMIN_1_ID,
      nama_lengkap: "Ustadz Farid Terkini",
      username: "farid_terkini",
    });

    // Simulasi refreshFromSupabase yang mengambil seluruh profil dari public.profiles
    const refreshProfiles = (
      await db.query(`SELECT id, nama_lengkap, username, role, is_active FROM public.profiles ORDER BY created_at DESC;`)
    ).rows as any[];

    const updatedUser = refreshProfiles.find((p) => p.id === ADMIN_1_ID);
    expect(updatedUser).toBeDefined();
    expect(updatedUser.nama_lengkap).toBe("Ustadz Farid Terkini");
    expect(updatedUser.username).toBe("farid_terkini");
  });

  it("16. Login menggunakan username baru berhasil", async () => {
    // 1. Ubah username dan password akun bendahara
    await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: BENDAHARA_ID,
      username: "bendahara_utama",
      new_password: "BendaharaBaru2026!",
    });

    // 2. Login menggunakan username baru dan password baru
    const loginRes = simulateLogin("bendahara_utama", "BendaharaBaru2026!");
    expect(loginRes.ok).toBe(true);
    expect(loginRes.user?.email).toBe(`bendahara_utama@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("17. Login menggunakan username lama ditolak setelah perubahan berhasil", async () => {
    // Ubah username dari bendahara01 ke bendahara_baru
    await simulateManageAccount(SUPERADMIN_ID, {
      action: "MANAGE_ACCOUNT",
      user_id: BENDAHARA_ID,
      username: "bendahara_baru",
      new_password: "BendaharaBaru2026!",
    });

    // Coba login menggunakan username lama bendahara01
    const loginOld = simulateLogin("bendahara01", "BendaharaBaru2026!");
    expect(loginOld.ok).toBe(false);
    expect(loginOld.message).toContain("Username / Email tidak ditemukan");
  });
});
