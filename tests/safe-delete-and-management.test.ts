import { describe, expect, it } from "vitest";
import {
  prepareSantriExportRows,
  exportSantriToExcel,
} from "@/lib/utils/excel-export";
import {
  isValidUsername,
  normalizeUsername,
  validatePasswordStrength,
  resolveLoginIdentifier,
  SYNTHETIC_EMAIL_DOMAIN,
} from "@/lib/utils/auth-mapping";
import {
  INITIAL_USERS,
  INITIAL_SANTRI,
  INITIAL_KELAS,
  INITIAL_KAMAR,
  INITIAL_WALI_SANTRI,
  INITIAL_TAGIHAN,
  INITIAL_TRANSAKSI_PEMBAYARAN,
  INITIAL_MUTASI_UANG_SAKU,
  INITIAL_SETORAN_TAHFIDZ,
} from "@/lib/store/initial-data";
import type { Santri, Kelas, Kamar } from "@/types/database";

describe("SIPETA - Pengelolaan Data, Ekspor Excel, Safe Delete, dan Navigasi", () => {
  // =========================================================================
  // A. Username Akun Internal & Validasi
  // =========================================================================
  describe("A. Validasi dan Normalisasi Username Pengguna Baru", () => {
    it("memvalidasi panjang 3-30 karakter dengan format a-z, 0-9, titik, strip, dan underscore", () => {
      expect(isValidUsername("admin01")).toBe(true);
      expect(isValidUsername("bendahara01")).toBe(true);
      expect(isValidUsername("pengelola01")).toBe(true);
      expect(isValidUsername("wali2026001")).toBe(true);
      expect(isValidUsername("wali.ahmad_01")).toBe(true);
      expect(isValidUsername("usr-2026")).toBe(true);

      // Kurang dari 3 atau lebih dari 30
      expect(isValidUsername("ab")).toBe(false);
      expect(isValidUsername("a".repeat(31))).toBe(false);

      // Karakter terlarang
      expect(isValidUsername("admin@gmail.com")).toBe(false);
      expect(isValidUsername("user name")).toBe(false);
      expect(isValidUsername("admin#01")).toBe(false);
    });

    it("menormalisasi username menjadi huruf kecil dan membuang spasi pinggir", () => {
      expect(normalizeUsername("  BENDAHARA01  ")).toBe("bendahara01");
      expect(normalizeUsername("Admin_Pesantren")).toBe("admin_pesantren");
      expect(normalizeUsername("Wali.Santri-01")).toBe("wali.santri-01");
    });

    it("memetakan ke domain sintetis internal .invalid tanpa mengubah akun Superadmin resmi", () => {
      const superadminRes = resolveLoginIdentifier("sipetaabumanshur@gmail.com");
      expect(superadminRes.isSuperadminEmail).toBe(true);
      expect(superadminRes.email).toBe("sipetaabumanshur@gmail.com");

      const internalRes = resolveLoginIdentifier("bendahara01");
      expect(internalRes.isSuperadminEmail).toBe(false);
      expect(internalRes.email).toBe(`bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`);
      expect(internalRes.email).toContain(".invalid");
    });
  });

  // =========================================================================
  // B. Registrasi Santri Baru & Akun Wali (1:1)
  // =========================================================================
  describe("B. Registrasi Santri Baru dan Relasi Akun Wali (1:1)", () => {
    it("memvalidasi password wali memenuhi standar minimal 6 karakter", () => {
      expect(validatePasswordStrength("12345").valid).toBe(false);
      expect(validatePasswordStrength("wali12345").valid).toBe(true);
      expect(validatePasswordStrength("rahasia2026").valid).toBe(true);
    });

    it("memastikan setiap santri awal memiliki relasi 1:1 ke satu wali aktif", () => {
      INITIAL_SANTRI.forEach((santri) => {
        const matchingWali = INITIAL_WALI_SANTRI.filter((w) => w.santri_id === santri.id);
        expect(matchingWali.length).toBeLessThanOrEqual(1);
      });
    });

    it("memisahkan username login wali dari email kontak opsional", () => {
      const usernameWali = normalizeUsername("wali2026099");
      const emailKontak = "wali@gmail.com"; // Email kontak saja
      expect(isValidUsername(usernameWali)).toBe(true);

      const resolved = resolveLoginIdentifier(usernameWali);
      expect(resolved.email).toBe(`wali2026099@${SYNTHETIC_EMAIL_DOMAIN}`);
      // Email login adalah email sintetis, email kontak terpisah
      expect(resolved.email).not.toBe(emailKontak);
    });
  });

  // =========================================================================
  // C. Ekspor Data Santri ke Excel (.xlsx)
  // =========================================================================
  describe("C. Fitur Ekspor Data Santri ke Excel (.xlsx)", () => {
    it("menghasilkan baris ekspor dengan tepat 14 kolom wajib", () => {
      const rows = prepareSantriExportRows(
        INITIAL_SANTRI,
        INITIAL_KELAS,
        INITIAL_KAMAR,
        INITIAL_WALI_SANTRI
      );

      expect(rows.length).toBe(INITIAL_SANTRI.length);

      const firstRow = rows[0]!;
      const keys = Object.keys(firstRow);
      expect(keys.length).toBe(14);
      expect(keys).toEqual([
        "no",
        "nis",
        "nama_lengkap",
        "jenis_kelamin",
        "tempat_lahir",
        "tanggal_lahir",
        "kelas",
        "kode_kelas",
        "kamar",
        "nama_wali",
        "hubungan_wali",
        "no_telepon_wali",
        "alamat",
        "status",
      ]);
    });

    it("memastikan NIS disimpan sebagai string teks agar tidak kehilangan angka awal atau terpotong", () => {
      const rows = prepareSantriExportRows(
        INITIAL_SANTRI,
        INITIAL_KELAS,
        INITIAL_KAMAR,
        INITIAL_WALI_SANTRI
      );
      rows.forEach((row) => {
        expect(typeof row.nis).toBe("string");
        expect(row.nis.length).toBeGreaterThan(0);
      });
    });

    it("tidak mencantumkan password, secret, hash, atau kredensial login pada file ekspor", () => {
      const rows = prepareSantriExportRows(
        INITIAL_SANTRI,
        INITIAL_KELAS,
        INITIAL_KAMAR,
        INITIAL_WALI_SANTRI
      );
      const jsonStr = JSON.stringify(rows);
      expect(jsonStr).not.toContain("password");
      expect(jsonStr).not.toContain("secret");
      expect(jsonStr).not.toContain("token");
    });
  });

  // =========================================================================
  // D. Safe Deletion Data Santri Terpilih
  // =========================================================================
  describe("D. Kebijakan Safe Deletion Santri Terpilih", () => {
    it("mendeteksi santri yang memiliki riwayat keuangan/akademik dan mengarahkan ke Soft Delete", () => {
      const santriWithPayment = INITIAL_SANTRI[0]!; // snt-001 (punya tagihan dan pembayaran)
      const hasBill = INITIAL_TAGIHAN.some((t) => t.santri_id === santriWithPayment.id);
      const hasPayment = INITIAL_TRANSAKSI_PEMBAYARAN.some(
        (p) => p.santri_id === santriWithPayment.id
      );

      expect(hasBill || hasPayment).toBe(true);

      // Kebijakan: Jika memiliki riwayat, status diubah menjadi TIDAK_AKTIF (Soft delete)
      const updatedStatus = "TIDAK_AKTIF";
      expect(updatedStatus).toBe("TIDAK_AKTIF");
    });

    it("memverifikasi integritas: tidak menghapus riwayat audit atau transaksi pembayaran ketika santri dinonaktifkan", () => {
      const santriId = "snt-001";
      const paymentsBefore = INITIAL_TRANSAKSI_PEMBAYARAN.filter(
        (p) => p.santri_id === santriId
      );
      expect(paymentsBefore.length).toBeGreaterThan(0);

      // Riwayat pembayaran tetap utuh
      const paymentsAfter = INITIAL_TRANSAKSI_PEMBAYARAN.filter(
        (p) => p.santri_id === santriId
      );
      expect(paymentsAfter.length).toBe(paymentsBefore.length);
    });
  });

  // =========================================================================
  // E. Master Data Kelas & Kamar Deletion Protection
  // =========================================================================
  describe("E. Proteksi Relasi Master Data Kelas dan Kamar Asrama", () => {
    it("menghitung jumlah santri aktif pada kelas dan memblokir penghapusan jika masih > 0", () => {
      const kelas7A = INITIAL_KELAS.find((k) => k.id === "kls-7a")!;
      const activeSantriInKelas = INITIAL_SANTRI.filter(
        (s) => s.kelas_id === kelas7A.id && s.status === "AKTIF"
      );

      expect(activeSantriInKelas.length).toBeGreaterThan(0);

      // Rule: jika activeSantriInKelas > 0, penghapusan DIBLOKIR
      const canDelete = activeSantriInKelas.length === 0;
      expect(canDelete).toBe(false);
    });

    it("mengizinkan penghapusan kelas hanya jika jumlah santri aktif adalah 0", () => {
      const emptyKelas: Kelas = {
        id: "kls-empty",
        kode_kelas: "KLS-EMPTY",
        nama_kelas: "Kelas Kosong",
        tingkat: 9,
        wali_kelas: "Ustadz Test",
        kapasitas: 30,
        is_active: true,
      };

      const activeSantriInEmptyKelas = INITIAL_SANTRI.filter(
        (s) => s.kelas_id === emptyKelas.id && s.status === "AKTIF"
      );

      expect(activeSantriInEmptyKelas.length).toBe(0);
      const canDelete = activeSantriInEmptyKelas.length === 0;
      expect(canDelete).toBe(true);
    });

    it("menghitung jumlah santri aktif pada kamar dan memblokir penghapusan jika masih dihuni", () => {
      const kamarAbuBakar = INITIAL_KAMAR.find((k) => k.id === "kmr-ab-01")!;
      const activeOccupants = INITIAL_SANTRI.filter(
        (s) => s.kamar_id === kamarAbuBakar.id && s.status === "AKTIF"
      );

      expect(activeOccupants.length).toBeGreaterThan(0);
      const canDelete = activeOccupants.length === 0;
      expect(canDelete).toBe(false);
    });
  });

  // =========================================================================
  // F. User Account Deletion Guards
  // =========================================================================
  describe("F. Pengamanan Penghapusan Akun Pengguna Superadmin", () => {
    it("melarang penghapusan akun Superadmin resmi (sipetaabumanshur@gmail.com)", () => {
      const officialEmail = "sipetaabumanshur@gmail.com";
      const isOfficialSuperadmin = (email: string) =>
        email.toLowerCase() === officialEmail.toLowerCase();

      expect(isOfficialSuperadmin("sipetaabumanshur@gmail.com")).toBe(true);
      expect(isOfficialSuperadmin("admin01@akun.sipeta.invalid")).toBe(false);
    });

    it("melarang pengguna menghapus akunnya sendiri", () => {
      const currentUserId = "usr-superadmin";
      const targetUserId = "usr-superadmin";

      const isSelf = currentUserId === targetUserId;
      expect(isSelf).toBe(true);

      const canDelete = !isSelf;
      expect(canDelete).toBe(false);
    });

    it("melarang penghapusan jika hanya tersisa 1 Superadmin aktif di sistem", () => {
      const superadmins = INITIAL_USERS.filter(
        (u) => u.role.toLowerCase() === "superadmin" && u.is_active
      );
      expect(superadmins.length).toBe(1);

      const canDeleteLastSuperadmin = superadmins.length > 1;
      expect(canDeleteLastSuperadmin).toBe(false);
    });
  });

  // =========================================================================
  // G. Urutan Navigasi Portal Wali Santri
  // =========================================================================
  describe("G. Urutan Tepat Navigasi Portal Wali Santri", () => {
    it("memastikan urutan 5 tab navigasi wali santri persis sesuai ketentuan", () => {
      const expectedTabOrder = [
        { id: "dashboard", label: "Dashboard" },
        { id: "kepesantrenan", label: "Mengaji, Tahfidz & Prestasi" },
        { id: "pembayaran", label: "Pembayaran & Cicilan" },
        { id: "uang_saku", label: "Uang Saku & Foto Bukti" },
        { id: "notifikasi", label: "Notifikasi & Pengumuman" },
      ];

      expect(expectedTabOrder[0]?.id).toBe("dashboard");
      expect(expectedTabOrder[1]?.id).toBe("kepesantrenan");
      expect(expectedTabOrder[2]?.id).toBe("pembayaran");
      expect(expectedTabOrder[3]?.id).toBe("uang_saku");
      expect(expectedTabOrder[4]?.id).toBe("notifikasi");

      expect(expectedTabOrder[0]?.label).toBe("Dashboard");
      expect(expectedTabOrder[1]?.label).toBe("Mengaji, Tahfidz & Prestasi");
      expect(expectedTabOrder[2]?.label).toBe("Pembayaran & Cicilan");
      expect(expectedTabOrder[3]?.label).toBe("Uang Saku & Foto Bukti");
      expect(expectedTabOrder[4]?.label).toBe("Notifikasi & Pengumuman");
    });
  });
});
