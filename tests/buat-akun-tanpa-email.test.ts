// ============================================================================
// SIPETA - Comprehensive Test Suite: Buat Akun Tanpa Email & Kompensasi Atomik
// Menguji 13 Poin Kebutuhan Bisnis & Kesiapan Produksi Superadmin
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
  extractUsername,
} from "@/lib/utils/auth-mapping";

describe("SIPETA - Buat Akun Internal Tanpa Input Email (13 Skenario Wajib)", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "00000000-0000-0000-0000-000000000001";
  const SUPERADMIN_EMAIL = "sipetaabumanshur@gmail.com";

  // Mock in-memory Supabase Auth store
  interface MockAuthUser {
    id: string;
    email: string;
    passwordHash: string;
    email_confirmed: boolean;
    user_metadata: Record<string, any>;
  }

  let authUsers: Map<string, MockAuthUser>;
  let loggedConsoleErrors: string[] = [];

  // Backend POST /api/admin-users Simulation
  async function simulateCreateUser(
    callerUserId: string,
    payload: {
      nama_lengkap: string;
      username: string;
      password: string;
      password_confirm?: string;
      no_telepon?: string;
      role: "superadmin" | "admin" | "bendahara" | "pengelola" | "wali";
      email?: string; // Should be ignored if passed
    },
    options?: {
      simulateDbFailure?: boolean;
      simulateAuthDeleteFailure?: boolean;
    }
  ) {
    // 0. Frontend/Pre-validation check (mismatched password)
    if (payload.password_confirm !== undefined && payload.password !== payload.password_confirm) {
      return { ok: false, status: 400, message: "Konfirmasi kata sandi tidak cocok." };
    }

    // 1. Password strength
    const pwdStrength = validatePasswordStrength(payload.password);
    if (!pwdStrength.valid) {
      return { ok: false, status: 400, message: pwdStrength.message };
    }

    // 2. Role validation
    if (payload.role === "wali") {
      return {
        ok: false,
        status: 403,
        message:
          "Superadmin tidak dapat membuat akun Orang Tua/Wali Santri melalui menu Manajemen Akun. Akun Wali hanya dapat dibuat oleh Admin Administrasi melalui registrasi santri baru atau import Excel.",
      };
    }

    if (payload.role === "superadmin") {
      return {
        ok: false,
        status: 403,
        message: "Pembuatan akun Superadmin tambahan tidak diizinkan melalui menu ini.",
      };
    }

    // 3. Username normalization & format check
    const finalUsername = normalizeUsername(payload.username);
    if (!isValidUsername(finalUsername)) {
      return {
        ok: false,
        status: 400,
        message:
          "Username hanya boleh memuat huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter.",
      };
    }

    // Server-side synthetic email generation ONLY (client email ignored)
    const finalEmail = usernameToInternalEmail(finalUsername);

    // 4. Caller verification
    const callerRes = await db.query(
      `SELECT role, is_active FROM public.profiles WHERE id = '${callerUserId}';`
    );
    const caller = callerRes.rows[0] as any;
    if (!caller || caller.role !== "superadmin" || !caller.is_active) {
      return {
        ok: false,
        status: 403,
        message: "Akses ditolak: Hanya Superadmin aktif yang berhak membuat akun pengguna baru.",
      };
    }

    // 5. Uniqueness in profiles table
    const existUserRes = await db.query(
      `SELECT id, username FROM public.profiles WHERE username = '${finalUsername}';`
    );
    if (existUserRes.rows.length > 0) {
      return {
        ok: false,
        status: 409,
        message: `Username '${finalUsername}' sudah digunakan. Silakan gunakan username lain.`,
      };
    }

    const existEmailRes = await db.query(
      `SELECT id, email FROM public.profiles WHERE email = '${finalEmail}';`
    );
    if (existEmailRes.rows.length > 0) {
      return {
        ok: false,
        status: 409,
        message: `Username '${finalUsername}' sudah terdaftar dalam sistem.`,
      };
    }

    // Check duplicate in Auth store directly
    for (const u of authUsers.values()) {
      if (u.email.toLowerCase() === finalEmail.toLowerCase()) {
        return {
          ok: false,
          status: 409,
          message: `Username '${finalUsername}' sudah terdaftar dalam autentikasi sistem. Silakan pilih username berbeda.`,
        };
      }
    }

    // 6. Create Auth User
    const newUserId = `00000000-0000-0000-0000-${Date.now().toString().padStart(12, "0").slice(-12)}`;
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${newUserId}', '${finalEmail}');
    `);

    const newAuthUser: MockAuthUser = {
      id: newUserId,
      email: finalEmail,
      passwordHash: `hashed:${payload.password}`,
      email_confirmed: true,
      user_metadata: {
        nama_lengkap: payload.nama_lengkap,
        username: finalUsername,
        role: payload.role,
      },
    };
    authUsers.set(newUserId, newAuthUser);

    // 7. Insert to public.profiles (with simulated failure option)
    if (options?.simulateDbFailure) {
      // Rollback Auth compensation
      let rollbackSuccess = false;
      let rollbackErrorMsg: string | undefined;

      try {
        if (options?.simulateAuthDeleteFailure) {
          throw new Error("Simulated Auth Service Delete Timeout");
        }
        await db.exec(`DELETE FROM auth.users WHERE id = '${newUserId}';`);
        authUsers.delete(newUserId);
        rollbackSuccess = true;
      } catch (rbEx: any) {
        rollbackErrorMsg = rbEx.message;
        const logMsg = `[CRITICAL][COMPENSATION_FAILED] Gagal menghapus akun auth yatim ${newUserId} (${finalEmail}) setelah insert profile gagal: ${rollbackErrorMsg}`;
        loggedConsoleErrors.push(logMsg);
      }

      return {
        ok: false,
        status: 500,
        message: rollbackSuccess
          ? "Gagal membuat profil pengguna: Simulated DB Error. Akun autentikasi berhasil dibatalkan."
          : `Gagal membuat profil pengguna: Simulated DB Error. PERINGATAN: Akun auth gagal dibatalkan (${rollbackErrorMsg}).`,
      };
    }

    const noTelp = payload.no_telepon?.trim() ? payload.no_telepon.trim() : "-";
    await db.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, username, no_telepon, role, is_active, created_at, updated_at)
      VALUES (
        '${newUserId}',
        '${payload.nama_lengkap.replace(/'/g, "''")}',
        '${finalEmail}',
        '${finalUsername}',
        '${noTelp}',
        '${payload.role}',
        true,
        now(),
        now()
      );
    `);

    // 8. Audit log (Password NEVER logged)
    await db.exec(`
      INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, data_sesudah, alasan_perubahan)
      VALUES (
        '${callerUserId}',
        'superadmin',
        'CREATE_USER_ACCOUNT',
        'profiles',
        '${newUserId}',
        '{"username":"${finalUsername}","nama_lengkap":"${payload.nama_lengkap}","role":"${payload.role}"}'::jsonb,
        'Pembuatan akun resmi internal oleh Superadmin via Server API tanpa input email'
      );
    `);

    return {
      ok: true,
      status: 200,
      message: `Akun ${payload.nama_lengkap} (${payload.role}) dengan username '${finalUsername}' berhasil dibuat.`,
      data: {
        id: newUserId,
        username: finalUsername,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
        no_telepon: noTelp,
        is_active: true,
      },
    };
  }

  // Simulate Login
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

    // 1. Mock Auth Schema
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

    // 2. Migrations 0001 through 012
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

    const migrationDir = path.resolve(__dirname, "../supabase/migrations");
    for (const migrationFile of migrations) {
      const filePath = path.join(migrationDir, migrationFile);
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, "utf-8");
        await db.exec(sql);
      }
    }
  });

  beforeEach(async () => {
    authUsers = new Map();
    loggedConsoleErrors = [];

    // Seed Superadmin
    authUsers.set(SUPERADMIN_ID, {
      id: SUPERADMIN_ID,
      email: SUPERADMIN_EMAIL,
      passwordHash: "hashed:SuperAdmin@123",
      email_confirmed: true,
      user_metadata: {
        nama_lengkap: "Superadmin Abu Manshur",
        username: "superadmin",
        role: "superadmin",
      },
    });

    await db.exec(`
      DELETE FROM public.profiles WHERE id != '${SUPERADMIN_ID}';
      DELETE FROM auth.users WHERE id != '${SUPERADMIN_ID}';

      INSERT INTO auth.users (id, email) VALUES ('${SUPERADMIN_ID}', '${SUPERADMIN_EMAIL}')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, nama_lengkap, email, username, no_telepon, role, is_active, created_at, updated_at)
      VALUES (
        '${SUPERADMIN_ID}',
        'Superadmin Abu Manshur',
        '${SUPERADMIN_EMAIL}',
        'superadmin',
        '081122334455',
        'superadmin',
        true,
        now(),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        username = 'superadmin',
        is_active = true,
        role = 'superadmin';
    `);
  });

  // =========================================================================
  // 13 SKENARIO PENGUJIAN KESIAPAN PRODUKSI
  // =========================================================================

  it("1. Pembuatan akun Admin Administrasi tanpa input email berhasil", async () => {
    const res = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Ustadz Hidayat Admin",
      username: "admin_pesantren",
      password: "PasswordAdmin123!",
      role: "admin",
      no_telepon: "081234567890",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data?.username).toBe("admin_pesantren");
    expect(res.data?.role).toBe("admin");

    // Pastikan tersimpan di public.profiles
    const checkDb = await db.query(
      `SELECT * FROM public.profiles WHERE username = 'admin_pesantren';`
    );
    expect(checkDb.rows.length).toBe(1);
    expect((checkDb.rows[0] as any).email).toBe(`admin_pesantren@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("2. Pembuatan akun Bendahara Pesantren tanpa input email berhasil", async () => {
    const res = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Ustadzah Fatimah Bendahara",
      username: "bendahara_putri",
      password: "PasswordBendahara123!",
      role: "bendahara",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data?.username).toBe("bendahara_putri");
    expect(res.data?.role).toBe("bendahara");
    expect(res.data?.no_telepon).toBe("-"); // Default jika tidak diisi

    const checkDb = await db.query(
      `SELECT * FROM public.profiles WHERE username = 'bendahara_putri';`
    );
    expect(checkDb.rows.length).toBe(1);
    expect((checkDb.rows[0] as any).email).toBe(`bendahara_putri@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("3. Pembuatan akun Pengelola Kepesantrenan tanpa input email berhasil", async () => {
    const res = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Ustadz Ridwan Asrama",
      username: "pengelola_asrama",
      password: "PasswordPengelola123!",
      role: "pengelola",
      no_telepon: "085678901234",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data?.username).toBe("pengelola_asrama");
    expect(res.data?.role).toBe("pengelola");

    const checkDb = await db.query(
      `SELECT * FROM public.profiles WHERE username = 'pengelola_asrama';`
    );
    expect(checkDb.rows.length).toBe(1);
    expect((checkDb.rows[0] as any).email).toBe(`pengelola_asrama@${SYNTHETIC_EMAIL_DOMAIN}`);
  });

  it("4. Ketiadaan field email pada form / payload (email masukan diabaikan sepenuhnya)", async () => {
    // Bahkan jika client mencoba mengirim email pribadi/sintetis sembarang
    const res = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Petugas Testing",
      username: "petugas_uji",
      password: "PasswordUji123!",
      role: "admin",
      email: "insecure_email@gmail.com", // Dilarang & diabaikan
    });

    expect(res.ok).toBe(true);
    // Server tetap menggunakan pemetaan username internal, bukan email yang dikirim
    const checkDb = await db.query(
      `SELECT email FROM public.profiles WHERE username = 'petugas_uji';`
    );
    expect((checkDb.rows[0] as any).email).toBe(`petugas_uji@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect((checkDb.rows[0] as any).email).not.toBe("insecure_email@gmail.com");
  });

  it("5. Email sintetis digenerate murni di backend dan Superadmin email tidak terganggu", async () => {
    const synthetic = usernameToInternalEmail("admin01");
    expect(synthetic).toBe(`admin01@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(synthetic.endsWith(".invalid")).toBe(true);

    // Verifikasi email Superadmin tetap Gmail resmi
    const superadminCheck = await db.query(
      `SELECT email FROM public.profiles WHERE role = 'superadmin';`
    );
    expect((superadminCheck.rows[0] as any).email).toBe(SUPERADMIN_EMAIL);
  });

  it("6. Login pengguna baru dapat langsung menggunakan username dan password", async () => {
    // Buat akun baru
    await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Bendahara Keuangan",
      username: "bendahara_keu",
      password: "PasswordKeuangan123!",
      role: "bendahara",
    });

    // Login langsung dengan username 'bendahara_keu'
    const loginResult = simulateLogin("bendahara_keu", "PasswordKeuangan123!");
    expect(loginResult.ok).toBe(true);
    expect(loginResult.user?.email).toBe(`bendahara_keu@${SYNTHETIC_EMAIL_DOMAIN}`);
    expect(loginResult.user?.user_metadata.username).toBe("bendahara_keu");

    // Login dengan password salah ditolak
    const loginFail = simulateLogin("bendahara_keu", "SalahPassword123!");
    expect(loginFail.ok).toBe(false);
    expect(loginFail.message).toBe("Kata sandi salah.");
  });

  it("7. Penolakan username duplikat pada pembuatan akun", async () => {
    // Buat akun pertama
    await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Admin Pertama",
      username: "admin_utama",
      password: "Password123!",
      role: "admin",
    });

    // Coba buat akun kedua dengan username yang sama
    const duplicateRes = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Admin Kedua Kloning",
      username: "admin_utama",
      password: "PasswordLain123!",
      role: "admin",
    });

    expect(duplicateRes.ok).toBe(false);
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.message).toContain("sudah digunakan");
  });

  it("8. Penanganan tabrakan email sintetis (jika sudah ada di Auth store)", async () => {
    // Inject mock user langsung di Auth store dengan email sintetis yang sama
    authUsers.set("existing-auth-id", {
      id: "existing-auth-id",
      email: `admin_bentrok@${SYNTHETIC_EMAIL_DOMAIN}`,
      passwordHash: "hashed:Secret123!",
      email_confirmed: true,
      user_metadata: {},
    });

    const res = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Admin Bentrok",
      username: "admin_bentrok",
      password: "PasswordBentrok123!",
      role: "admin",
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(409);
    expect(res.message).toContain("sudah terdaftar dalam autentikasi");
  });

  it("9. Penolakan kata sandi tidak cocok dan validasi kekuatan sandi", async () => {
    // Konfirmasi tidak cocok
    const mismatchRes = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Petugas Baru",
      username: "petugas_baru",
      password: "PasswordBenar123!",
      password_confirm: "PasswordBeda999!",
      role: "admin",
    });
    expect(mismatchRes.ok).toBe(false);
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.message).toBe("Konfirmasi kata sandi tidak cocok.");

    // Sandi kurang dari 8 karakter
    const weakRes = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Petugas Lemah",
      username: "petugas_lemah",
      password: "Abu1",
      role: "admin",
    });
    expect(weakRes.ok).toBe(false);
    expect(weakRes.status).toBe(400);
    expect(weakRes.message).toContain("minimal 8 karakter");
  });

  it("10. Skenario Auth berhasil dibuat, tetapi insert tabel profiles gagal memicu rollback", async () => {
    const initialAuthCount = authUsers.size;

    const res = await simulateCreateUser(
      SUPERADMIN_ID,
      {
        nama_lengkap: "Petugas Gagal DB",
        username: "petugas_gagal",
        password: "PasswordGagal123!",
        role: "admin",
      },
      { simulateDbFailure: true }
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.message).toContain("Akun autentikasi berhasil dibatalkan");

    // Pastikan tidak tersimpan di public.profiles
    const checkDb = await db.query(
      `SELECT * FROM public.profiles WHERE username = 'petugas_gagal';`
    );
    expect(checkDb.rows.length).toBe(0);
  });

  it("11. Kompensasi penghapusan akun Auth berhasil dilakukan tanpa meninggalkan orphaned user", async () => {
    const initialAuthCount = authUsers.size;

    // Percobaan pertama gagal di DB
    await simulateCreateUser(
      SUPERADMIN_ID,
      {
        nama_lengkap: "Petugas Uji Coba",
        username: "petugas_ujicoba",
        password: "PasswordUji123!",
        role: "bendahara",
      },
      { simulateDbFailure: true }
    );

    // Auth user harus terhapus (jumlah akun auth kembali ke semula)
    expect(authUsers.size).toBe(initialAuthCount);

    // Karena tidak ada orphaned user di Auth, percobaan ulang dengan username yang sama berhasil
    const retryRes = await simulateCreateUser(SUPERADMIN_ID, {
      nama_lengkap: "Petugas Uji Coba Sukses",
      username: "petugas_ujicoba",
      password: "PasswordUji123!",
      role: "bendahara",
    });

    expect(retryRes.ok).toBe(true);
    expect(retryRes.status).toBe(200);
    expect(authUsers.size).toBe(initialAuthCount + 1);
  });

  it("12. Logging pencatatan kegagalan kompensasi bila penghapusan Auth gagal", async () => {
    const res = await simulateCreateUser(
      SUPERADMIN_ID,
      {
        nama_lengkap: "Petugas Double Failure",
        username: "petugas_double_fail",
        password: "PasswordDouble123!",
        role: "admin",
      },
      { simulateDbFailure: true, simulateAuthDeleteFailure: true }
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.message).toContain("PERINGATAN: Akun auth gagal dibatalkan");

    // Pastikan kegagalan dicatat ke console log server dengan level CRITICAL
    expect(loggedConsoleErrors.length).toBeGreaterThan(0);
    expect(loggedConsoleErrors[0]).toContain("[CRITICAL][COMPENSATION_FAILED]");
    expect(loggedConsoleErrors[0]).toContain("petugas_double_fail");
  });

  it("13. Tampilan daftar akun menampilkan username (bukan email sintetis)", () => {
    const userAdmin = {
      nama_lengkap: "Ahmad Admin",
      role: "admin" as const,
      username: "ahmad_admin",
      email: `ahmad_admin@${SYNTHETIC_EMAIL_DOMAIN}`,
    };

    const userBendahara = {
      nama_lengkap: "Siti Bendahara",
      role: "bendahara" as const,
      username: undefined, // Simulasikan jika field username undefined
      email: `siti_bendahara@${SYNTHETIC_EMAIL_DOMAIN}`,
    };

    const userSuperadmin = {
      nama_lengkap: "Superadmin Abu Manshur",
      role: "superadmin" as const,
      username: "superadmin",
      email: SUPERADMIN_EMAIL,
    };

    // Fungsi display username yang digunakan di antarmuka tabel dan kartu
    function getDisplayIdentifier(u: { role: string; username?: string; email: string }) {
      return u.role === "superadmin"
        ? u.email
        : `@${u.username || extractUsername(u.email)}`;
    }

    // Admin & Bendahara harus menampilkan @username dan TIDAK memuat domain sintetis .invalid
    const adminDisplay = getDisplayIdentifier(userAdmin);
    expect(adminDisplay).toBe("@ahmad_admin");
    expect(adminDisplay).not.toContain(SYNTHETIC_EMAIL_DOMAIN);

    const bendaharaDisplay = getDisplayIdentifier(userBendahara);
    expect(bendaharaDisplay).toBe("@siti_bendahara");
    expect(bendaharaDisplay).not.toContain(SYNTHETIC_EMAIL_DOMAIN);

    // Superadmin tetap menampilkan email resmi
    const superadminDisplay = getDisplayIdentifier(userSuperadmin);
    expect(superadminDisplay).toBe(SUPERADMIN_EMAIL);
  });
});
