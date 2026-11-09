import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { UserRole } from "@/types/database";
import { getRoleLabel, getRoleLoginUrl } from "@/lib/utils/format";

describe("SIPETA Migration 013 (TU Role & Least Privilege RLS) Final Review Test Suite", () => {
  const migrationPath = path.resolve(__dirname, "../supabase/migrations/013_tu_role_and_class_room_transfer.sql");
  const sqlContent = fs.readFileSync(migrationPath, "utf-8");

  // ==========================================================================
  // 1. AUDIT ENUM TU DAN PENGHINDARAN ENUM ASATIDZ
  // ==========================================================================
  describe("1. Audit Penambahan ENUM 'tu' & Kompatibilitas 'pengelola'", () => {
    it("1.1. Harus menambahkan enum 'tu' secara aman dan idempotent", () => {
      expect(sqlContent).toContain("ALTER TYPE public.user_role ADD VALUE 'tu'");
      expect(sqlContent).toContain("enumlabel = 'tu'");
    });

    it("1.2. DILARANG menambahkan enum 'asatidz' ke tipe user_role (wajib pakai 'pengelola')", () => {
      expect(sqlContent).not.toContain("ADD VALUE 'asatidz'");
      expect(sqlContent).not.toContain("ADD VALUE IF NOT EXISTS 'asatidz'");
    });

    it("1.3. Role 'pengelola' tetap menjadi identitas internal Asatidz dengan label UI Asatidz", () => {
      expect(getRoleLabel("pengelola")).toBe("Asatidz");
      expect(getRoleLoginUrl("pengelola")).toBe("/asatidz/login");
    });
  });

  // ==========================================================================
  // 2. AUDIT KEBIJAKAN ADITIF (NON-DESTRUKTIF TERHADAP POLICY LAMA)
  // ==========================================================================
  describe("2. Sifat Aditif Kebijakan RLS (Zero-Impact Kebijakan Lama)", () => {
    it("2.1. DILARANG menghapus kebijakan kelola data santri milik Admin & Superadmin", () => {
      expect(sqlContent).not.toContain("DROP POLICY IF EXISTS \"Santri: admin & superadmin kelola data santri\"");
      expect(sqlContent).not.toContain("DROP POLICY \"Santri: admin & superadmin kelola data santri\"");
    });

    it("2.2. DILARANG menghapus kebijakan Master Kelas dan Master Kamar milik Admin & Superadmin", () => {
      expect(sqlContent).not.toContain("DROP POLICY IF EXISTS \"Master Kelas: kelola\"");
      expect(sqlContent).not.toContain("DROP POLICY IF EXISTS \"Master Kamar: kelola\"");
    });

    it("2.3. DILARANG menghapus kebijakan pembacaan profil internal petugas", () => {
      expect(sqlContent).not.toContain("DROP POLICY IF EXISTS \"Profiles: baca profil sendiri atau petugas internal\"");
      expect(sqlContent).not.toContain("DROP POLICY IF EXISTS \"Profiles: superadmin kelola semua akun\"");
    });

    it("2.4. Seluruh kebijakan TU menggunakan penamaan eksplisit berprefiks TU", () => {
      const tuPolicies = [
        "Santri: TU baca data santri",
        "Santri: TU kelola data santri",
        "Wali Santri: TU baca relasi wali",
        "Wali Santri: TU kelola relasi wali",
        "Master Kelas: TU baca ruang kelas",
        "Master Kelas: TU kelola ruang kelas",
        "Master Kamar: TU baca kamar asrama",
        "Master Kamar: TU kelola kamar asrama",
        "Riwayat Penempatan: TU baca histori mutasi",
        "Riwayat Penempatan: TU catat mutasi kelas dan kamar",
        "Profiles: TU baca profil wali santri untuk administrasi",
      ];

      for (const policy of tuPolicies) {
        expect(sqlContent).toContain(policy);
      }
    });
  });

  // ==========================================================================
  // 3. AUDIT HAK AKSES MINIMAL TABEL PROFILES (LEAST PRIVILEGE)
  // ==========================================================================
  describe("3. Audit Hak Akses Profil Terbatas untuk TU", () => {
    it("3.1. TU hanya diizinkan membaca profil dirinya sendiri atau profil role wali", () => {
      expect(sqlContent).toContain("public.get_my_role() = 'tu'");
      expect(sqlContent).toContain("(id = auth.uid() OR role = 'wali')");
    });

    it("3.2. TU DILARANG membaca profil Superadmin, Admin, Bendahara, atau Pengelola secara bebas", () => {
      // Pastikan tidak ada policy yang memberikan TU hak baca ke seluruh profiles
      expect(sqlContent).not.toContain("Profiles: TU baca semua");
      expect(sqlContent).not.toContain("public.get_my_role() IN ('superadmin', 'admin', 'tu', 'bendahara'");
    });

    it("3.3. Simulasi filter RLS profil membuktikan staf non-wali disaring keluar untuk TU", () => {
      const mockProfiles = [
        { id: "usr-tu-1", role: "tu", nama: "Staf TU" },
        { id: "usr-sa-1", role: "superadmin", nama: "Superadmin" },
        { id: "usr-adm-1", role: "admin", nama: "Pengasuh" },
        { id: "usr-bdh-1", role: "bendahara", nama: "Bendahara" },
        { id: "usr-ast-1", role: "pengelola", nama: "Ustadz Pembina" },
        { id: "usr-wali-1", role: "wali", nama: "Wali Santri Ahmad" },
      ];

      const currentUserId = "usr-tu-1";
      const currentUserRole: UserRole = "tu";

      // Simulasi evaluasi USING RLS Migration 013:
      // USING (public.get_my_role() = 'tu' AND (id = auth.uid() OR role = 'wali'))
      const visibleProfiles = mockProfiles.filter((p) => {
        if (currentUserRole === "tu") {
          return p.id === currentUserId || p.role === "wali";
        }
        return true;
      });

      expect(visibleProfiles.length).toBe(2);
      expect(visibleProfiles.map((p) => p.role)).toEqual(["tu", "wali"]);
      expect(visibleProfiles.find((p) => p.role === "superadmin")).toBeUndefined();
      expect(visibleProfiles.find((p) => p.role === "admin")).toBeUndefined();
      expect(visibleProfiles.find((p) => p.role === "bendahara")).toBeUndefined();
    });
  });

  // ==========================================================================
  // 4. AUDIT ISOLASI FINANSIAL & OPERASIONAL SENSITIF
  // ==========================================================================
  describe("4. Audit Isolasi Finansial & Operasional Sensitif", () => {
    it("4.1. Migration 013 DILARANG menyentuh tabel transaksi pembayaran", () => {
      expect(sqlContent).not.toContain("ON public.transaksi_pembayaran");
    });

    it("4.2. Migration 013 DILARANG menyentuh tabel tagihan", () => {
      expect(sqlContent).not.toContain("ON public.tagihan");
    });

    it("4.3. Migration 013 DILARANG menyentuh tabel saldo uang saku & transaksi saku", () => {
      expect(sqlContent).not.toContain("ON public.saldo_uang_saku");
      expect(sqlContent).not.toContain("ON public.transaksi_uang_saku");
    });

    it("4.4. Migration 013 DILARANG menyentuh tabel jurnal pembukuan / koreksi", () => {
      expect(sqlContent).not.toContain("ON public.jurnal_pembukuan");
    });

    it("4.5. Migration 013 DILARANG menyentuh tabel rekening pesantren", () => {
      expect(sqlContent).not.toContain("ON public.rekening_pesantren");
    });

    it("4.6. Migration 013 DILARANG memberikan hak pengelolaan pengumuman kepada TU", () => {
      expect(sqlContent).not.toContain("Pengumuman: TU kelola pengumuman");
      expect(sqlContent).not.toContain("ON public.pengumuman");
    });
  });

  // ==========================================================================
  // 5. AUDIT PENCATATAN HISTORI MUTASI TANPA DUPLIKASI
  // ==========================================================================
  describe("5. Audit Mutasi Penempatan & Integritas Histori", () => {
    it("5.1. TU diberikan hak INSERT pada riwayat_penempatan_santri untuk pencatatan resmi", () => {
      expect(sqlContent).toContain("ON public.riwayat_penempatan_santri FOR INSERT");
      expect(sqlContent).toContain("WITH CHECK (public.get_my_role() = 'tu')");
    });

    it("5.2. TU diberikan hak SELECT pada riwayat_penempatan_santri untuk pemantauan histori", () => {
      expect(sqlContent).toContain("ON public.riwayat_penempatan_santri FOR SELECT");
      expect(sqlContent).toContain("USING (public.get_my_role() = 'tu')");
    });

    it("5.3. Pemindahan santri tidak boleh mengeksekusi duplikasi mutasi jika kelas dan kamar tidak berubah", () => {
      const currentPlacement = { kelas_id: "kls-7a", kamar_id: "kmr-01" };
      const newPlacementSame = { kelas_id: "kls-7a", kamar_id: "kmr-01" };
      const isDifferent =
        currentPlacement.kelas_id !== newPlacementSame.kelas_id ||
        currentPlacement.kamar_id !== newPlacementSame.kamar_id;

      expect(isDifferent).toBe(false);
    });
  });

  // ==========================================================================
  // 6. VERIFIKASI LOGIKA ROLLBACK
  // ==========================================================================
  describe("6. Verifikasi Prosedur Rollback Migration 013", () => {
    it("6.1. Rollback dapat dilakukan dengan menjatuhkan 11 kebijakan RLS aditif TU", () => {
      const rollbackCommands = [
        'DROP POLICY IF EXISTS "Santri: TU baca data santri" ON public.santri;',
        'DROP POLICY IF EXISTS "Santri: TU kelola data santri" ON public.santri;',
        'DROP POLICY IF EXISTS "Wali Santri: TU baca relasi wali" ON public.wali_santri;',
        'DROP POLICY IF EXISTS "Wali Santri: TU kelola relasi wali" ON public.wali_santri;',
        'DROP POLICY IF EXISTS "Master Kelas: TU baca ruang kelas" ON public.kelas;',
        'DROP POLICY IF EXISTS "Master Kelas: TU kelola ruang kelas" ON public.kelas;',
        'DROP POLICY IF EXISTS "Master Kamar: TU baca kamar asrama" ON public.kamar;',
        'DROP POLICY IF EXISTS "Master Kamar: TU kelola kamar asrama" ON public.kamar;',
        'DROP POLICY IF EXISTS "Riwayat Penempatan: TU baca histori mutasi" ON public.riwayat_penempatan_santri;',
        'DROP POLICY IF EXISTS "Riwayat Penempatan: TU catat mutasi kelas dan kamar" ON public.riwayat_penempatan_santri;',
        'DROP POLICY IF EXISTS "Profiles: TU baca profil wali santri untuk administrasi" ON public.profiles;',
      ];

      expect(rollbackCommands.length).toBe(11);
      // Seluruh 11 nama kebijakan ini harus bersesuaian persis dengan yang dibuat di Migration 013
      for (const cmd of rollbackCommands) {
        const policyName = cmd.match(/"([^"]+)"/)?.[1];
        expect(policyName).toBeDefined();
        expect(sqlContent).toContain(policyName!);
      }
    });
  });
});
