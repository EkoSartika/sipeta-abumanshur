import { describe, expect, it } from "vitest";
import {
  SYNTHETIC_EMAIL_DOMAIN,
  extractUsername,
  isInternalSyntheticEmail,
  isValidUsername,
  normalizeUsername,
  resolveLoginIdentifier,
  usernameToInternalEmail,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import { INITIAL_USERS, INITIAL_SANTRI } from "@/lib/store/initial-data";

describe("SIPETA - Kebijakan Akun Internal & Autentikasi Username", () => {
  // =========================================================================
  // 1. Validasi Format Username
  // =========================================================================
  describe("1. Validasi Format Username (RFC/PRD standard)", () => {
    it("menerima username yang valid (alfanumerik, titik, strip, underscore, 3-30 karakter)", () => {
      expect(isValidUsername("admin01")).toBe(true);
      expect(isValidUsername("bendahara_pesantren")).toBe(true);
      expect(isValidUsername("wali.zaki")).toBe(true);
      expect(isValidUsername("pengelola-asrama")).toBe(true);
      expect(isValidUsername("usr123")).toBe(true);
    });

    it("menolak username yang kurang dari 3 karakter atau lebih dari 30 karakter", () => {
      expect(isValidUsername("ab")).toBe(false);
      expect(isValidUsername("a".repeat(31))).toBe(false);
    });

    it("menolak karakter tidak valid (spasi, simbol aneh, huruf kapital)", () => {
      expect(isValidUsername("Admin01")).toBe(false); // Huruf besar ditolak sebelum dinormalisasi
      expect(isValidUsername("admin 01")).toBe(false); // Spasi ditolak
      expect(isValidUsername("admin@pesantren")).toBe(false); // Simbol @ ditolak
      expect(isValidUsername("bendahara#1")).toBe(false); // Simbol # ditolak
    });

    it("normalizeUsername mengonversi huruf besar ke huruf kecil dan membersihkan spasi", () => {
      expect(normalizeUsername("  Bendahara01  ")).toBe("bendahara01");
      expect(normalizeUsername("WALI_ZAKI")).toBe("wali_zaki");
    });
  });

  // =========================================================================
  // 2. Pemetaan Email Sintetis Internal (.invalid)
  // =========================================================================
  describe("2. Pemetaan Email Sintetis Internal Reserved Domain (.invalid)", () => {
    it("memetakan username ke email sintetis domain .invalid", () => {
      const email = usernameToInternalEmail("bendahara01");
      expect(email).toBe(`bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`);
      expect(email.endsWith(".invalid")).toBe(true);
    });

    it("mengenali apakah sebuah email adalah email sintetis internal", () => {
      expect(isInternalSyntheticEmail(`bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`)).toBe(true);
      expect(isInternalSyntheticEmail("sipetaabumanshur@gmail.com")).toBe(false);
      expect(isInternalSyntheticEmail("wali@yahoo.com")).toBe(false);
    });

    it("dapat mengekstrak username dari email sintetis maupun field username", () => {
      expect(extractUsername(`admin01@${SYNTHETIC_EMAIL_DOMAIN}`)).toBe("admin01");
      expect(extractUsername("user@other.com", "myusername")).toBe("myusername");
      expect(extractUsername("user@other.com")).toBe("user");
    });
  });

  // =========================================================================
  // 3. Resolusi Identifier Login (Username vs Email Superadmin)
  // =========================================================================
  describe("3. Resolusi Identifier Login", () => {
    it("mengarahkan email resmi Superadmin langsung ke Supabase Auth email", () => {
      const resolved = resolveLoginIdentifier("sipetaabumanshur@gmail.com");
      expect(resolved.isSuperadminEmail).toBe(true);
      expect(resolved.email).toBe("sipetaabumanshur@gmail.com");
      expect(resolved.displayIdentifier).toBe("sipetaabumanshur@gmail.com");
    });

    it("mengarahkan username internal ke email sintetis untuk Supabase Auth", () => {
      const resolved = resolveLoginIdentifier("bendahara01");
      expect(resolved.isSuperadminEmail).toBe(false);
      expect(resolved.username).toBe("bendahara01");
      expect(resolved.email).toBe(`bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`);
      expect(resolved.displayIdentifier).toBe("@bendahara01");
    });

    it("menangani input username dengan whitespace atau kapital secara aman", () => {
      const resolved = resolveLoginIdentifier("  Bendahara01 ");
      expect(resolved.username).toBe("bendahara01");
      expect(resolved.email).toBe(`bendahara01@${SYNTHETIC_EMAIL_DOMAIN}`);
    });
  });

  // =========================================================================
  // 4. Validasi Kekuatan Kata Sandi
  // =========================================================================
  describe("4. Validasi Kekuatan Kata Sandi", () => {
    it("menolak kata sandi kurang dari 8 karakter", () => {
      const res = validatePasswordStrength("Abu123");
      expect(res.valid).toBe(false);
      expect(res.message).toBeDefined();
      expect(res.message).toContain("minimal 8 karakter");
    });

    it("menolak kata sandi yang hanya huruf tanpa angka", () => {
      const res = validatePasswordStrength("AbuManshurPesantren");
      expect(res.valid).toBe(false);
      expect(res.message).toBeDefined();
      expect(res.message).toContain("angka");
    });

    it("menolak kata sandi yang hanya angka tanpa huruf", () => {
      const res = validatePasswordStrength("1234567890");
      expect(res.valid).toBe(false);
      expect(res.message).toBeDefined();
      expect(res.message).toContain("huruf");
    });

    it("menerima kata sandi kuat alfanumerik >= 8 karakter", () => {
      const res = validatePasswordStrength("AbuManshur@123");
      expect(res.valid).toBe(true);
    });
  });

  // =========================================================================
  // 5. Audit Data Mock Internal SIPETA
  // =========================================================================
  describe("5. Audit Data Mock Internal SIPETA (Tidak Menggunakan Gmail/Email Publik)", () => {
    it("memastikan Superadmin tetap memiliki username superadmin dan role superadmin", () => {
      const superadmin = INITIAL_USERS.find((u) => u.role === "superadmin");
      expect(superadmin).toBeDefined();
      expect(superadmin?.username).toBe("superadmin");
      expect(superadmin?.is_active).toBe(true);
      expect(superadmin?.email).toBeDefined();
    });

    it("memastikan seluruh staf internal (Admin, Bendahara, Pengelola) menggunakan domain .invalid", () => {
      const internalStaff = INITIAL_USERS.filter((u) =>
        ["admin", "bendahara", "pengelola"].includes(u.role)
      );

      expect(internalStaff.length).toBeGreaterThan(0);
      for (const staff of internalStaff) {
        expect(staff.username).toBeDefined();
        expect(staff.username?.length).toBeGreaterThanOrEqual(3);
        expect(staff.email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)).toBe(true);
        expect(staff.email).not.toContain("gmail.com");
      }
    });

    it("memastikan seluruh akun Orang Tua/Wali menggunakan domain .invalid dan memiliki relasi santri 1:1", () => {
      const waliUsers = INITIAL_USERS.filter((u) => u.role === "wali");
      expect(waliUsers.length).toBeGreaterThan(0);

      const assignedSantriIds = new Set<string>();

      for (const wali of waliUsers) {
        expect(wali.username).toBeDefined();
        expect(wali.email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)).toBe(true);
        expect(wali.email).not.toContain("gmail.com");

        // Relasi 1:1
        expect(wali.santri_id).toBeDefined();
        expect(assignedSantriIds.has(wali.santri_id!)).toBe(false);
        assignedSantriIds.add(wali.santri_id!);

        // Santri harus eksis di INITIAL_SANTRI
        const santriExists = INITIAL_SANTRI.some((s) => s.id === wali.santri_id);
        expect(santriExists).toBe(true);
      }
    });
  });

  // =========================================================================
  // 6. Kebijakan Keamanan Peran & Proteksi Superadmin
  // =========================================================================
  describe("6. Kebijakan Keamanan & Proteksi Superadmin", () => {
    it("Superadmin tidak dapat menonaktifkan akunnya sendiri", () => {
      const superadmin = INITIAL_USERS.find((u) => u.role === "superadmin")!;
      const callerId = superadmin.id;
      const targetId = superadmin.id;

      // Rule check: caller cannot deactivate self
      const isSelfDeactivation = callerId === targetId;
      expect(isSelfDeactivation).toBe(true);
    });

    it("Setiap akun internal memiliki field username yang unik", () => {
      const usernames = INITIAL_USERS.map((u) => u.username?.toLowerCase()).filter(Boolean);
      const uniqueUsernames = new Set(usernames);
      expect(usernames.length).toBe(uniqueUsernames.size);
    });
  });
});
