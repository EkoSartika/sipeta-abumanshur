// ============================================================================
// SIPETA - Comprehensive Automated Test Suite: Superadmin Full Account Management
// Menguji Tambah Akun (5 Role), Hapus Akun (Single & Bulk), Proteksi Mutlak Superadmin,
// Proteksi Data Santri saat Akun Wali Dihapus, dan Soft-Delete Akun dengan Transaksi Keuangan.
// ============================================================================

import { describe, expect, it, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  validatePasswordStrength,
  SYNTHETIC_EMAIL_DOMAIN,
} from "@/lib/utils/auth-mapping";

describe("SIPETA - Superadmin Full Account Management (Tambah, Hapus, Proteksi)", () => {
  let db: PGlite;

  const SUPERADMIN_ID = "af7315fd-a82f-4c73-9bd1-4967d038ae7e";
  const SUPERADMIN_EMAIL = "sipetaabumanshur@gmail.com";
  const SUPERADMIN_USERNAME = "superadmin";

  const TU_USER_ID = "11111111-1111-1111-1111-111111111111";
  const ADMIN_USER_ID = "22222222-2222-2222-2222-222222222222";
  const BENDAHARA_USER_ID = "33333333-3333-3333-3333-333333333333";
  const ASATIDZ_USER_ID = "44444444-4444-4444-4444-444444444444";
  const WALI_USER_ID = "55555555-5555-5555-5555-555555555555";
  const SANTRI_ID = "66666666-6666-6666-6666-666666666666";
  const KELAS_ID = "77777777-7777-7777-7777-777777777777";
  const KAMAR_ID = "88888888-8888-8888-8888-888888888888";

  // Mock in-memory Auth user store
  interface MockAuthUser {
    id: string;
    email: string;
    is_banned: boolean;
    user_metadata: Record<string, any>;
  }
  let authStore: Map<string, MockAuthUser>;

  beforeAll(async () => {
    db = new PGlite();

    // 1. Skema enum & trigger bawaan
    await db.exec(`
      DO $$ BEGIN
        CREATE TYPE public.user_role AS ENUM ('superadmin', 'admin', 'bendahara', 'pengelola', 'wali', 'tu');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_lengkap TEXT NOT NULL,
        email TEXT NOT NULL,
        username TEXT UNIQUE,
        no_telepon TEXT NOT NULL DEFAULT '-',
        role public.user_role NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        must_change_password BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.kelas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_kelas TEXT NOT NULL,
        tingkat TEXT NOT NULL,
        kapasitas INT NOT NULL DEFAULT 30,
        wali_kelas TEXT
      );

      CREATE TABLE IF NOT EXISTS public.kamar (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nama_kamar TEXT NOT NULL,
        gedung TEXT NOT NULL,
        kapasitas INT NOT NULL DEFAULT 20,
        musyrif TEXT
      );

      CREATE TABLE IF NOT EXISTS public.santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nis TEXT UNIQUE NOT NULL,
        nama_lengkap TEXT NOT NULL,
        jenis_kelamin TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'aktif',
        kelas_id UUID REFERENCES public.kelas(id),
        kamar_id UUID REFERENCES public.kamar(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.wali_santri (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
        santri_id UUID UNIQUE NOT NULL REFERENCES public.santri(id) ON DELETE RESTRICT,
        nama_lengkap TEXT NOT NULL,
        hubungan TEXT NOT NULL,
        no_telepon TEXT NOT NULL,
        email TEXT NOT NULL,
        alamat TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.transaksi_pembayaran (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kode_transaksi TEXT NOT NULL,
        santri_id UUID REFERENCES public.santri(id),
        wali_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
        nominal NUMERIC NOT NULL,
        status TEXT NOT NULL,
        verified_by UUID REFERENCES public.profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.mutasi_uang_saku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID REFERENCES public.santri(id),
        petugas_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
        nominal NUMERIC NOT NULL,
        jenis TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.topup_uang_saku (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        santri_id UUID REFERENCES public.santri(id),
        wali_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
        nominal NUMERIC NOT NULL,
        status TEXT NOT NULL,
        verified_by UUID REFERENCES public.profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        user_role TEXT NOT NULL,
        aktivitas TEXT NOT NULL,
        jenis_objek TEXT NOT NULL,
        objek_id TEXT,
        data_sebelum JSONB,
        data_sesudah JSONB,
        alasan_perubahan TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  });

  beforeEach(async () => {
    // Reset data
    await db.exec(`
      DELETE FROM public.audit_logs;
      DELETE FROM public.transaksi_pembayaran;
      DELETE FROM public.mutasi_uang_saku;
      DELETE FROM public.topup_uang_saku;
      DELETE FROM public.wali_santri;
      DELETE FROM public.santri;
      DELETE FROM public.kamar;
      DELETE FROM public.kelas;
      DELETE FROM public.profiles;
    `);

    authStore = new Map();

    // Inisialisasi Superadmin Utama & Data Master
    await db.exec(`
      INSERT INTO public.profiles (id, nama_lengkap, email, username, role, is_active)
      VALUES ('${SUPERADMIN_ID}', 'Superadmin SIPETA', '${SUPERADMIN_EMAIL}', '${SUPERADMIN_USERNAME}', 'superadmin', true);

      INSERT INTO public.kelas (id, nama_kelas, tingkat, wali_kelas)
      VALUES ('${KELAS_ID}', '7A - Abu Bakar', '7', 'Ust. Hamzah');

      INSERT INTO public.kamar (id, nama_kamar, gedung, musyrif)
      VALUES ('${KAMAR_ID}', 'Kamar Al-Fatih 01', 'Gedung A', 'Ust. Bilal');

      INSERT INTO public.santri (id, nis, nama_lengkap, jenis_kelamin, status, kelas_id, kamar_id)
      VALUES ('${SANTRI_ID}', '20260010', 'Ahmad Faris', 'L', 'aktif', '${KELAS_ID}', '${KAMAR_ID}');
    `);

    authStore.set(SUPERADMIN_ID, {
      id: SUPERADMIN_ID,
      email: SUPERADMIN_EMAIL,
      is_banned: false,
      user_metadata: { role: "superadmin" },
    });
  });

  // =========================================================================
  // SIMULATOR ENDPOINT /api/admin-users (Mencerminkan implementasi sebenarnya)
  // =========================================================================

  async function simulateCreateUser(callerId: string, payload: {
    nama_lengkap: string;
    username: string;
    password: string;
    no_telepon?: string;
    role: "admin" | "tu" | "bendahara" | "pengelola" | "wali" | "superadmin" | "asatidz";
    santri_id?: string;
  }) {
    // 1. Caller check
    const callerRes = await db.query(`SELECT role, is_active FROM public.profiles WHERE id = '${callerId}';`);
    const caller = callerRes.rows[0] as any;
    if (!caller || caller.role !== "superadmin" || !caller.is_active) {
      return { ok: false, status: 403, message: "Akses ditolak: Hanya Superadmin yang berhak membuat akun." };
    }

    // 2. Role restriction: Superadmin tambahan dilarang
    if ((payload.role as string) === "superadmin") {
      return { ok: false, status: 403, message: "Pembuatan akun Superadmin tambahan tidak diizinkan melalui menu ini." };
    }

    // 3. Password validation
    const pwdStrength = validatePasswordStrength(payload.password);
    if (!pwdStrength.valid) {
      return { ok: false, status: 400, message: pwdStrength.message };
    }

    // 4. Username validation
    const finalUsername = normalizeUsername(payload.username);
    if (!isValidUsername(finalUsername)) {
      return { ok: false, status: 400, message: "Username hanya boleh memuat huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter." };
    }
    const finalEmail = usernameToInternalEmail(finalUsername);

    // 5. Uniqueness check
    const existing = await db.query(`SELECT id FROM public.profiles WHERE username = '${finalUsername}';`);
    if (existing.rows.length > 0) {
      return { ok: false, status: 409, message: `Username '${finalUsername}' sudah digunakan.` };
    }

    // 6. Create Auth user
    const newUserId = crypto.randomUUID();
    authStore.set(newUserId, {
      id: newUserId,
      email: finalEmail,
      is_banned: false,
      user_metadata: { nama_lengkap: payload.nama_lengkap, username: finalUsername, role: payload.role },
    });

    // 7. Insert to profiles
    const normalizedDbRole = payload.role === "asatidz" ? "pengelola" : payload.role;
    await db.query(`
      INSERT INTO public.profiles (id, nama_lengkap, email, username, no_telepon, role, is_active)
      VALUES ('${newUserId}', '${payload.nama_lengkap}', '${finalEmail}', '${finalUsername}', '${payload.no_telepon || "-"}', '${normalizedDbRole}', true);
    `);

    // 8. Link to wali_santri if role is wali and santri_id is provided
    if (normalizedDbRole === "wali" && payload.santri_id) {
      await db.query(`
        INSERT INTO public.wali_santri (id, user_id, santri_id, nama_lengkap, hubungan, no_telepon, email, alamat)
        VALUES (gen_random_uuid(), '${newUserId}', '${payload.santri_id}', '${payload.nama_lengkap}', 'Wali', '${payload.no_telepon || "-"}', '${finalEmail}', '-');
      `);
    }

    // 9. Audit Log
    await db.query(`
      INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, alasan_perubahan)
      VALUES ('${callerId}', 'superadmin', 'CREATE_USER_ACCOUNT', 'profiles', '${newUserId}', 'Pembuatan akun oleh Superadmin');
    `);

    return {
      ok: true,
      status: 200,
      message: `Akun ${payload.nama_lengkap} (${payload.role}) dengan username '${finalUsername}' berhasil dibuat.`,
      data: { id: newUserId, username: finalUsername, nama_lengkap: payload.nama_lengkap, role: payload.role },
    };
  }

  async function simulateDeleteUser(callerId: string, targetIds: string[]): Promise<{
    ok: boolean;
    status: number;
    message?: string;
    results: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }>;
    summary: { total: number; deleted: number; deactivated: number; skipped: number; failed: number };
  }> {
    // 1. Caller check
    const callerRes = await db.query(`SELECT role, is_active FROM public.profiles WHERE id = '${callerId}';`);
    const caller = callerRes.rows[0] as any;
    if (!caller || caller.role !== "superadmin" || !caller.is_active) {
      return {
        ok: false,
        status: 403,
        message: "Akses ditolak: Hanya Superadmin yang berwenang menghapus akun pengguna.",
        results: [],
        summary: { total: targetIds.length, deleted: 0, deactivated: 0, skipped: targetIds.length, failed: 0 },
      };
    }

    const results: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }> = [];

    for (const userId of targetIds) {
      // Proteksi akun sendiri
      if (callerId === userId) {
        results.push({ id: userId, status: "SKIPPED", message: "Keamanan: Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif." });
        continue;
      }

      // Ambil profile target
      const targetRes = await db.query(`SELECT * FROM public.profiles WHERE id = '${userId}';`);
      const target = targetRes.rows[0] as any;
      if (!target) {
        results.push({ id: userId, status: "FAILED", message: "Pengguna tidak ditemukan." });
        continue;
      }

      // Proteksi Superadmin Utama
      const isSuperadminTarget =
        target.role === "superadmin" ||
        target.id === SUPERADMIN_ID ||
        target.email?.toLowerCase() === SUPERADMIN_EMAIL ||
        target.username?.toLowerCase() === SUPERADMIN_USERNAME;

      if (isSuperadminTarget) {
        results.push({ id: userId, nama_lengkap: target.nama_lengkap, status: "SKIPPED", message: "Keamanan: Akun Superadmin dilindungi sistem dan tidak boleh dihapus." });
        continue;
      }

      // Periksa Relasi Transaksi Keuangan
      const countPembayaran = await db.query(`SELECT count(*)::int as c FROM public.transaksi_pembayaran WHERE wali_user_id = '${userId}' OR verified_by = '${userId}';`);
      const countUangSaku = await db.query(`SELECT count(*)::int as c FROM public.mutasi_uang_saku WHERE petugas_id = '${userId}';`);
      const countTopup = await db.query(`SELECT count(*)::int as c FROM public.topup_uang_saku WHERE wali_user_id = '${userId}' OR verified_by = '${userId}';`);

      const hasFinancialHistory =
        ((countPembayaran.rows[0] as any).c ?? 0) > 0 ||
        ((countUangSaku.rows[0] as any).c ?? 0) > 0 ||
        ((countTopup.rows[0] as any).c ?? 0) > 0;

      if (hasFinancialHistory) {
        // Soft delete / penonaktifan aman
        await db.query(`UPDATE public.profiles SET is_active = false WHERE id = '${userId}';`);
        if (authStore.has(userId)) {
          authStore.get(userId)!.is_banned = true;
        }
        await db.query(`
          INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, alasan_perubahan)
          VALUES ('${callerId}', 'superadmin', 'DEACTIVATE_USER_ACCOUNT', 'profiles', '${userId}', 'Penonaktifan akun dengan riwayat transaksi keuangan');
        `);
        results.push({
          id: userId,
          nama_lengkap: target.nama_lengkap,
          status: "DEACTIVATED",
          actionTaken: "DEACTIVATED",
          message: `Akun ${target.nama_lengkap} memiliki riwayat transaksi keuangan aktif (SPP/Uang Saku). Akun dinonaktifkan secara aman (soft-delete) untuk menjaga integritas pembukuan dan audit trail pesantren.`,
        });
        continue;
      }

      // Hard delete: jika wali, hapus wali_santri terlebih dahulu
      if (target.role === "wali") {
        await db.query(`DELETE FROM public.wali_santri WHERE user_id = '${userId}';`);
      }

      await db.query(`DELETE FROM public.profiles WHERE id = '${userId}';`);
      authStore.delete(userId);

      await db.query(`
        INSERT INTO public.audit_logs (user_id, user_role, aktivitas, jenis_objek, objek_id, alasan_perubahan)
        VALUES ('${callerId}', 'superadmin', 'DELETE_USER_ACCOUNT', 'profiles', '${userId}', 'Penghapusan akun resmi oleh Superadmin');
      `);

      results.push({
        id: userId,
        nama_lengkap: target.nama_lengkap,
        status: "DELETED",
        actionTaken: "DELETED",
        message: target.role === "wali"
          ? `Akun Wali Santri ${target.nama_lengkap} berhasil dihapus permanen dari sistem. Data santri, kelas, dan riwayat akademik tetap aman tersimpan.`
          : `Akun ${target.nama_lengkap} berhasil dihapus permanen dari sistem.`,
      });
    }

    return {
      ok: true,
      status: 200,
      results,
      summary: {
        total: targetIds.length,
        deleted: results.filter((r) => r.status === "DELETED").length,
        deactivated: results.filter((r) => r.status === "DEACTIVATED").length,
        skipped: results.filter((r) => r.status === "SKIPPED").length,
        failed: results.filter((r) => r.status === "FAILED").length,
      },
    };
  }

  // =========================================================================
  // UNIT & INTEGRATION TESTS
  // =========================================================================

  describe("A. Tambah Akun oleh Superadmin (5 Role Resmi)", () => {
    it("1. Superadmin berhasil membuat akun Admin (Pengasuh Pondok)", async () => {
      const res = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "K.H. Ahmad Dahlan",
        username: "pengasuh_utama",
        password: "PasswordKuat123!",
        role: "admin",
      });

      expect(res.ok).toBe(true);
      expect(res.data?.role).toBe("admin");

      const p = await db.query(`SELECT * FROM public.profiles WHERE username = 'pengasuh_utama';`);
      expect(p.rows.length).toBe(1);
      expect((p.rows[0] as any).role).toBe("admin");
      expect((p.rows[0] as any).email).toBe(`pengasuh_utama@${SYNTHETIC_EMAIL_DOMAIN}`);
    });

    it("2. Superadmin berhasil membuat akun Tata Usaha (TU)", async () => {
      const res = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Siti Rahmawati, S.Pd",
        username: "tu_akademik",
        password: "PasswordKuat123!",
        role: "tu",
      });

      expect(res.ok).toBe(true);
      expect(res.data?.role).toBe("tu");

      const p = await db.query(`SELECT * FROM public.profiles WHERE username = 'tu_akademik';`);
      expect(p.rows.length).toBe(1);
      expect((p.rows[0] as any).role).toBe("tu");
    });

    it("3. Superadmin berhasil membuat akun Asatidz (Pengelola)", async () => {
      const res = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Ust. Abdullah Zaki",
        username: "ustadz_zaki",
        password: "PasswordKuat123!",
        role: "pengelola",
      });

      expect(res.ok).toBe(true);
      expect(res.data?.role).toBe("pengelola");

      const p = await db.query(`SELECT * FROM public.profiles WHERE username = 'ustadz_zaki';`);
      expect(p.rows.length).toBe(1);
      expect((p.rows[0] as any).role).toBe("pengelola");
    });

    it("4. Superadmin berhasil membuat akun Bendahara Pesantren", async () => {
      const res = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Hj. Maryam Bendahara",
        username: "bendahara_pondok",
        password: "PasswordKuat123!",
        role: "bendahara",
      });

      expect(res.ok).toBe(true);
      expect(res.data?.role).toBe("bendahara");

      const p = await db.query(`SELECT * FROM public.profiles WHERE username = 'bendahara_pondok';`);
      expect(p.rows.length).toBe(1);
      expect((p.rows[0] as any).role).toBe("bendahara");
    });

    it("5. Superadmin berhasil membuat akun Wali Santri (dengan atau tanpa link santri_id)", async () => {
      // Tanpa link santri
      const resWithoutSantri = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "H. Bambang Irawan",
        username: "wali_bambang",
        password: "PasswordKuat123!",
        role: "wali",
      });

      expect(resWithoutSantri.ok).toBe(true);
      expect(resWithoutSantri.data?.role).toBe("wali");

      // Dengan link santri
      const resWithSantri = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Hj. Nurul Hidayah",
        username: "wali_faris",
        password: "PasswordKuat123!",
        role: "wali",
        santri_id: SANTRI_ID,
      });

      expect(resWithSantri.ok).toBe(true);
      expect(resWithSantri.data?.role).toBe("wali");

      // Verifikasi tabel wali_santri terisi
      const w = await db.query(`SELECT * FROM public.wali_santri WHERE user_id = '${resWithSantri.data?.id}';`);
      expect(w.rows.length).toBe(1);
      expect((w.rows[0] as any).santri_id).toBe(SANTRI_ID);
    });

    it("6. Superadmin DITOLAK saat mencoba membuat akun Superadmin tambahan", async () => {
      const res = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Superadmin Kloning",
        username: "superadmin_duplikat",
        password: "PasswordKuat123!",
        role: "superadmin",
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
      expect(res.message).toContain("Superadmin tambahan tidak diizinkan");
    });

    it("7. Validasi penolakan password lemah dan username duplikat", async () => {
      // Password lemah
      const weakRes = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf Test",
        username: "staf_test",
        password: "123",
        role: "tu",
      });
      expect(weakRes.ok).toBe(false);
      expect(weakRes.status).toBe(400);

      // Buat akun valid
      await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf Asli",
        username: "staf_unik",
        password: "PasswordKuat123!",
        role: "tu",
      });

      // Duplikat username
      const dupRes = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf Kembar",
        username: "staf_unik",
        password: "PasswordKuat123!",
        role: "tu",
      });
      expect(dupRes.ok).toBe(false);
      expect(dupRes.status).toBe(409);
      expect(dupRes.message).toContain("sudah digunakan");
    });
  });

  describe("B. Hapus Akun oleh Superadmin (Single & Bulk)", () => {
    it("1. Superadmin berhasil menghapus akun staf tanpa transaksi keuangan (Hard Delete)", async () => {
      // Buat akun TU
      const tuRes = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf TU Baru",
        username: "tu_hapus",
        password: "PasswordKuat123!",
        role: "tu",
      });
      const tuId = tuRes.data!.id;

      // Hapus akun TU
      const delRes = await simulateDeleteUser(SUPERADMIN_ID, [tuId]);
      expect(delRes.ok).toBe(true);
      expect(delRes.summary.deleted).toBe(1);
      expect(delRes.results[0]?.status).toBe("DELETED");

      // Verifikasi profile dan Auth terhapus
      const checkProfile = await db.query(`SELECT id FROM public.profiles WHERE id = '${tuId}';`);
      expect(checkProfile.rows.length).toBe(0);
      expect(authStore.has(tuId)).toBe(false);
    });

    it("2. Superadmin menghapus akun Wali: Relasi wali_santri terhapus, tetapi DATA SANTRI TETAP UTUH", async () => {
      // Buat akun Wali yang terhubung dengan Santri
      const waliRes = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Bapak Sutrisno",
        username: "wali_sutrisno",
        password: "PasswordKuat123!",
        role: "wali",
        santri_id: SANTRI_ID,
      });
      const waliId = waliRes.data!.id;

      // Hapus akun Wali
      const delRes = await simulateDeleteUser(SUPERADMIN_ID, [waliId]);
      expect(delRes.ok).toBe(true);
      expect(delRes.summary.deleted).toBe(1);
      expect(delRes.results[0]?.status).toBe("DELETED");
      expect(delRes.results[0]?.message).toContain("Data santri, kelas, dan riwayat akademik tetap aman");

      // Verifikasi profil Wali terhapus
      const checkWaliProfile = await db.query(`SELECT id FROM public.profiles WHERE id = '${waliId}';`);
      expect(checkWaliProfile.rows.length).toBe(0);

      // Verifikasi relasi wali_santri terhapus
      const checkRelasi = await db.query(`SELECT id FROM public.wali_santri WHERE user_id = '${waliId}';`);
      expect(checkRelasi.rows.length).toBe(0);

      // VERIFIKASI UTAMA: SANTRI, KELAS, DAN KAMAR TETAP 100% UTUH!
      const checkSantri = await db.query(`SELECT * FROM public.santri WHERE id = '${SANTRI_ID}';`);
      expect(checkSantri.rows.length).toBe(1);
      expect((checkSantri.rows[0] as any).nis).toBe("20260010");
      expect((checkSantri.rows[0] as any).kelas_id).toBe(KELAS_ID);
      expect((checkSantri.rows[0] as any).kamar_id).toBe(KAMAR_ID);
    });

    it("3. Akun dengan transaksi keuangan aktif TIDAK DIHAPUS PERMANEN melainkan SOFT-DEACTIVATED", async () => {
      // Buat akun Bendahara
      const bRes = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Bendahara Transaksi",
        username: "bendahara_transaksi",
        password: "PasswordKuat123!",
        role: "bendahara",
      });
      const bId = bRes.data!.id;

      // Catat transaksi keuangan yang diverifikasi oleh Bendahara ini
      await db.query(`
        INSERT INTO public.transaksi_pembayaran (kode_transaksi, santri_id, nominal, status, verified_by)
        VALUES ('TRX-20260001', '${SANTRI_ID}', 500000, 'VERIFIED', '${bId}');
      `);

      // Coba hapus akun Bendahara
      const delRes = await simulateDeleteUser(SUPERADMIN_ID, [bId]);
      expect(delRes.ok).toBe(true);
      expect(delRes.summary.deactivated).toBe(1);
      expect(delRes.summary.deleted).toBe(0);
      expect(delRes.results[0]?.status).toBe("DEACTIVATED");
      expect(delRes.results[0]?.message).toContain("memiliki riwayat transaksi keuangan aktif");

      // Profil tetap ada tapi is_active = false
      const checkProfile = await db.query(`SELECT is_active FROM public.profiles WHERE id = '${bId}';`);
      expect(checkProfile.rows.length).toBe(1);
      expect((checkProfile.rows[0] as any).is_active).toBe(false);

      // Auth user ditandai banned
      expect(authStore.get(bId)?.is_banned).toBe(true);
    });

    it("4. Hapus Massal (Bulk Delete): Memproses daftar akun sekaligus dengan akurat", async () => {
      // Buat 3 akun
      const u1 = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf Bersih 1",
        username: "staf_clean_1",
        password: "PasswordKuat123!",
        role: "tu",
      });
      const u2 = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Staf Bersih 2",
        username: "staf_clean_2",
        password: "PasswordKuat123!",
        role: "pengelola",
      });
      const u3 = await simulateCreateUser(SUPERADMIN_ID, {
        nama_lengkap: "Wali dengan SPP",
        username: "wali_transaksi",
        password: "PasswordKuat123!",
        role: "wali",
        santri_id: SANTRI_ID,
      });

      // Tambah transaksi pembayaran untuk u3
      await db.query(`
        INSERT INTO public.transaksi_pembayaran (kode_transaksi, santri_id, wali_user_id, nominal, status)
        VALUES ('TRX-SPP-99', '${SANTRI_ID}', '${u3.data!.id}', 250000, 'SUCCESS');
      `);

      // Eksekusi hapus massal untuk u1, u2, u3, dan Superadmin (yang harus dilewati)
      const bulkRes = await simulateDeleteUser(SUPERADMIN_ID, [
        u1.data!.id,
        u2.data!.id,
        u3.data!.id,
        SUPERADMIN_ID, // Harus di-skip!
      ]);

      expect(bulkRes.ok).toBe(true);
      expect(bulkRes.summary.total).toBe(4);
      expect(bulkRes.summary.deleted).toBe(2); // u1 & u2 dihapus permanen
      expect(bulkRes.summary.deactivated).toBe(1); // u3 dinonaktifkan aman
      expect(bulkRes.summary.skipped).toBe(1); // Superadmin dilewati
    });
  });

  describe("C. Proteksi Mutlak Superadmin", () => {
    it("1. Akun Superadmin utama DILINDUNGI dan TIDAK BISA dihapus", async () => {
      const delRes = await simulateDeleteUser(SUPERADMIN_ID, [SUPERADMIN_ID]);
      expect(delRes.ok).toBe(true);
      expect(delRes.summary.skipped).toBe(1);
      expect(delRes.summary.deleted).toBe(0);
      expect(delRes.results[0]?.message).toContain("Anda tidak dapat menghapus akun Anda sendiri");

      // Verifikasi Superadmin tetap ada dan aktif
      const sa = await db.query(`SELECT is_active FROM public.profiles WHERE id = '${SUPERADMIN_ID}';`);
      expect(sa.rows.length).toBe(1);
      expect((sa.rows[0] as any).is_active).toBe(true);
    });

    it("2. Superadmin lain (jika ada target dengan UUID utama) tidak bisa dihapus", async () => {
      // Panggil penghapusan target Superadmin dari caller buatan
      const fakeCallerId = "99999999-9999-9999-9999-999999999999";
      await db.query(`
        INSERT INTO public.profiles (id, nama_lengkap, email, username, role, is_active)
        VALUES ('${fakeCallerId}', 'Superadmin Cadangan', 'cadangan@sipeta.ac.id', 'sa_cadangan', 'superadmin', true);
      `);

      const delRes = await simulateDeleteUser(fakeCallerId, [SUPERADMIN_ID]);
      expect(delRes.ok).toBe(true);
      expect(delRes.summary.skipped).toBe(1);
      expect(delRes.results[0]?.message).toContain("Akun Superadmin dilindungi sistem");
    });
  });
});
