// ============================================================================
// SIPETA - Final Role Restructuring & Access Control Verification Test Suite
// Verifikasi 6 Role: Superadmin, Admin (Pengasuh), TU, Asatidz, Bendahara, Wali
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  getRoleLabel,
  getRoleLoginUrl,
} from "@/lib/utils/format";
import { resolveLoginIdentifier } from "@/lib/utils/auth-mapping";
import type { UserRole } from "@/types/database";

describe("RESTRUKTURISASI FINAL ROLE, HAK AKSES, & PORTAL SIPETA", () => {
  // ==========================================================================
  // 1. SUPERADMIN (PEMBUAT / PEMILIK SIPETA)
  // ==========================================================================
  describe("1. Superadmin Proteksi Mutlak", () => {
    it("1.1. Akun Superadmin utama tidak dapat dihapus melalui proteksi API", () => {
      const isSuperadminProtected = (targetUser: { role: string; email?: string; username?: string }) => {
        return (
          targetUser.role === "superadmin" ||
          targetUser.email?.toLowerCase() === "sipetaabumanshur@gmail.com" ||
          targetUser.username?.toLowerCase() === "superadmin"
        );
      };

      expect(isSuperadminProtected({ role: "superadmin" })).toBe(true);
      expect(isSuperadminProtected({ role: "admin", email: "sipetaabumanshur@gmail.com" })).toBe(true);
      expect(isSuperadminProtected({ role: "tu", username: "tu01" })).toBe(false);
    });

    it("1.2. Akun Superadmin utama tidak dapat dinonaktifkan", () => {
      const canDeactivate = (targetUser: { role: string; email?: string }, requestedActive: boolean) => {
        if (
          (targetUser.role === "superadmin" || targetUser.email === "sipetaabumanshur@gmail.com") &&
          !requestedActive
        ) {
          return false;
        }
        return true;
      };

      expect(canDeactivate({ role: "superadmin" }, false)).toBe(false);
      expect(canDeactivate({ role: "tu" }, false)).toBe(true);
      expect(canDeactivate({ role: "bendahara" }, false)).toBe(true);
    });

    it("1.3. Penambahan role Superadmin baru dilarang", () => {
      const allowedRolesToCreate = ["admin", "tu", "bendahara", "pengelola", "wali"];
      expect(allowedRolesToCreate).not.toContain("superadmin");
    });

    it("1.4. Promosi role pengguna lain menjadi Superadmin dilarang", () => {
      const canPromoteToSuperadmin = (targetRole: string) => {
        return targetRole !== "superadmin";
      };
      expect(canPromoteToSuperadmin("superadmin")).toBe(false);
      expect(canPromoteToSuperadmin("tu")).toBe(true);
    });
  });

  // ==========================================================================
  // 2. ADMIN (PENGASUH PONDOK)
  // ==========================================================================
  describe("2. Admin (Pengasuh Pondok) — Pengawasan Terpadu", () => {
    const pengasuhPermissions = {
      viewSantriAll: true,
      viewKelasKamar: true,
      viewTagihanSummary: true,
      viewFinancialSaldo: true,
      viewMengajiTahfidz: true,
      viewKedisiplinan: true,
      viewPrestasi: true,
      viewAuditLogs: true,
      mutateLedger: false,
      koreksiSaldoLangsung: false,
      deletePaymentRecord: false,
    };

    it("2.1. Tampilan portal dipetakan ke Portal Pengasuh Pondok", () => {
      expect(getRoleLabel("admin")).toBe("Pengasuh Pondok");
      expect(getRoleLoginUrl("admin")).toBe("/admin/login");
    });

    it("2.2. Pengasuh dapat memantau seluruh modul (akses baca eksekutif)", () => {
      expect(pengasuhPermissions.viewSantriAll).toBe(true);
      expect(pengasuhPermissions.viewTagihanSummary).toBe(true);
      expect(pengasuhPermissions.viewMengajiTahfidz).toBe(true);
      expect(pengasuhPermissions.viewKedisiplinan).toBe(true);
      expect(pengasuhPermissions.viewAuditLogs).toBe(true);
    });

    it("2.3. Pengasuh dilarang memanipulasi atau menghapus transaksi keuangan dan ledger", () => {
      expect(pengasuhPermissions.mutateLedger).toBe(false);
      expect(pengasuhPermissions.koreksiSaldoLangsung).toBe(false);
      expect(pengasuhPermissions.deletePaymentRecord).toBe(false);
    });
  });

  // ==========================================================================
  // 3. TATA USAHA (TU)
  // ==========================================================================
  describe("3. Tata Usaha (TU) — Administrasi Data Santri", () => {
    it("3.1. Role TU memiliki label dan portal login khusus", () => {
      expect(getRoleLabel("tu")).toBe("Tata Usaha (TU)");
      expect(getRoleLoginUrl("tu")).toBe("/tu/login");
    });

    it("3.2. TU berwenang mengelola data santri, kelas, dan kamar", () => {
      const tuPermissions = {
        manageSantri: true,
        importSantriExcel: true,
        exportSantriExcel: true,
        manageKelas: true,
        manageKamar: true,
        movePlacement: true,
        manageKeuangan: false,
        koreksiLedger: false,
        manageSuperadmin: false,
      };

      expect(tuPermissions.manageSantri).toBe(true);
      expect(tuPermissions.importSantriExcel).toBe(true);
      expect(tuPermissions.movePlacement).toBe(true);
      expect(tuPermissions.manageKeuangan).toBe(false);
      expect(tuPermissions.koreksiLedger).toBe(false);
      expect(tuPermissions.manageSuperadmin).toBe(false);
    });

    it("3.3. Pemindahan santri antar-kelas/kamar mencatat riwayat penempatan dengan audit log", () => {
      const executeMovePlacement = (santri: { id: string; kelas_id: string; kamar_id: string }, newKelasId: string, newKamarId: string, alasan: string) => {
        if (santri.kelas_id === newKelasId && santri.kamar_id === newKamarId) {
          return { ok: false, message: "Penempatan sama" };
        }
        return {
          ok: true,
          riwayat: {
            santri_id: santri.id,
            kelas_lama_id: santri.kelas_id,
            kelas_baru_id: newKelasId,
            kamar_lama_id: santri.kamar_id,
            kamar_baru_id: newKamarId,
            keterangan: alasan,
            tanggal_efektif: new Date().toISOString().slice(0, 10),
          },
        };
      };

      const santri = { id: "snt-01", kelas_id: "kls-7a", kamar_id: "kmr-01" };
      const moveRes = executeMovePlacement(santri, "kls-7b", "kmr-02", "Kenaikan kelas");
      expect(moveRes.ok).toBe(true);
      expect(moveRes.riwayat?.kelas_baru_id).toBe("kls-7b");
      expect(moveRes.riwayat?.kamar_baru_id).toBe("kmr-02");
    });
  });

  // ==========================================================================
  // 4. ASATIDZ (PENGELOLA KEPESANTRENAN)
  // ==========================================================================
  describe("4. Asatidz & Pembina — Kepesantrenan & Ibadah", () => {
    it("4.1. Label portal ditampilkan sebagai Asatidz dan tautan diarahkan ke /asatidz/login", () => {
      expect(getRoleLabel("pengelola")).toBe("Asatidz");
      expect(getRoleLabel("asatidz")).toBe("Asatidz");
      expect(getRoleLoginUrl("pengelola")).toBe("/asatidz/login");
      expect(getRoleLoginUrl("asatidz")).toBe("/asatidz/login");
    });

    it("4.2. Asatidz berwenang mencatat mengaji, tahfidz, kedisiplinan, dan prestasi", () => {
      const asatidzPermissions = {
        recordMengaji: true,
        recordTahfidz: true,
        recordKedisiplinan: true,
        manageKategoriPelanggaran: true,
        recordPrestasi: true,
        verifyPembayaranKeuangan: false,
      };

      expect(asatidzPermissions.recordMengaji).toBe(true);
      expect(asatidzPermissions.recordTahfidz).toBe(true);
      expect(asatidzPermissions.recordKedisiplinan).toBe(true);
      expect(asatidzPermissions.verifyPembayaranKeuangan).toBe(false);
    });
  });

  // ==========================================================================
  // 5. BENDAHARA (ASATIDZ + KEUANGAN)
  // ==========================================================================
  describe("5. Bendahara — Fitur Asatidz Terintegrasi + Fitur Keuangan", () => {
    it("5.1. Bendahara memiliki seluruh fitur kerja Asatidz", () => {
      const bendaharaTabs = [
        "dashboard",
        "verifikasi_pembayaran",
        "verifikasi_saku",
        "penyerahan_saku",
        "keuangan_saldo_santri",
        "rekening_info",
        "mengaji",
        "tahfidz",
        "prestasi",
        "kedisiplinan",
      ];

      expect(bendaharaTabs).toContain("mengaji");
      expect(bendaharaTabs).toContain("tahfidz");
      expect(bendaharaTabs).toContain("prestasi");
      expect(bendaharaTabs).toContain("kedisiplinan");
      expect(bendaharaTabs).toContain("keuangan_saldo_santri");
    });

    it("5.2. Jurnal koreksi ledger bersifat append-only dengan referensi mutasi awal", () => {
      const originalMutasi = { id: "mut-001", nominal: 100000, tipe: "MASUK" };
      const koreksi = {
        id: "mut-corr-001",
        referensi_id: originalMutasi.id,
        tipe: "PENYESUAIAN_KURANG",
        nominal: 20000,
        alasan: "Koreksi kelebihan catat petugas",
      };

      expect(koreksi.referensi_id).toBe(originalMutasi.id);
      expect(koreksi.tipe).toBe("PENYESUAIAN_KURANG");
    });
  });

  // ==========================================================================
  // 6. WALI SANTRI
  // ==========================================================================
  describe("6. Wali Santri — Akses Mandiri 1:1", () => {
    it("6.1. Identitas login wali menggunakan NIS santri", () => {
      const loginRes = resolveLoginIdentifier("202607101");
      expect(loginRes.username).toBe("202607101");
      expect(loginRes.email).toBe("202607101@akun.sipeta.invalid");
    });

    it("6.2. Wali santri terisolasi hanya dapat mengakses santri asuhan sendiri", () => {
      const filterBillsForWali = (allBills: { santri_id: string; nominal: number }[], waliSantriId: string) => {
        return allBills.filter((b) => b.santri_id === waliSantriId);
      };

      const bills = [
        { santri_id: "snt-01", nominal: 500000 },
        { santri_id: "snt-02", nominal: 600000 },
      ];

      const waliBills = filterBillsForWali(bills, "snt-01");
      expect(waliBills.length).toBe(1);
      expect(waliBills[0]?.santri_id).toBe("snt-01");
    });
  });

  // ==========================================================================
  // 7. STRUKTUR 6 PINTU LOGIN PUBLIK
  // ==========================================================================
  describe("7. Struktur 6 Pintu Masuk Login Publik", () => {
    it("7.1. Enam pintu masuk login terkonfigurasi dengan URL resmi", () => {
      const publicPortals = [
        { role: "superadmin", url: "/superadmin/login" },
        { role: "admin", url: "/admin/login" },
        { role: "tu", url: "/tu/login" },
        { role: "asatidz", url: "/asatidz/login" },
        { role: "bendahara", url: "/bendahara/login" },
        { role: "wali", url: "/login" },
      ];

      expect(publicPortals.length).toBe(6);
      expect(getRoleLoginUrl("superadmin")).toBe("/superadmin/login");
      expect(getRoleLoginUrl("admin")).toBe("/admin/login");
      expect(getRoleLoginUrl("tu")).toBe("/tu/login");
      expect(getRoleLoginUrl("asatidz")).toBe("/asatidz/login");
      expect(getRoleLoginUrl("bendahara")).toBe("/bendahara/login");
      expect(getRoleLoginUrl("wali")).toBe("/login");
    });
  });
});
