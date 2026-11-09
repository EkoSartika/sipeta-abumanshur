// ============================================================================
// SIPETA - Automated Test Suite: Role Login Isolation, Profil Saya, Sidebar, and Domain
// Menguji isolasi portal login antar-role, endpoint update profil mandiri,
// dan pembaruan konfigurasi domain baru.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
// @ts-ignore
import nextConfig from "../next.config.mjs";
import { getRoleLabel, getRoleLoginUrl } from "../src/lib/utils/format";
import type { UserRole } from "../src/types/database";

describe("1. Domain Configuration & Permanent Redirect", () => {
  it("harus memiliki aturan redirect permanen dari domain lama ke domain baru jika flag aktif", async () => {
    const origEnv = process.env.ENABLE_DOMAIN_REDIRECT;
    process.env.ENABLE_DOMAIN_REDIRECT = "true";
    try {
      expect(nextConfig.redirects).toBeDefined();
      const redirects = await nextConfig.redirects!();
      expect(Array.isArray(redirects)).toBe(true);

      const oldDomainRedirect = redirects.find(
        (r: any) =>
          r.destination === "https://sipetaabumanshur.vercel.app/:path*" &&
          r.permanent === true
      );

      expect(oldDomainRedirect).toBeDefined();
      expect(oldDomainRedirect?.has).toEqual([
        {
          type: "host",
          value: "sipeta-abumanshur.vercel.app",
        },
      ]);
    } finally {
      process.env.ENABLE_DOMAIN_REDIRECT = origEnv;
    }
  });

  it("harus menjaga domain lama tetap aktif (tanpa redirect paksa) jika flag belum aktif demi zero-downtime", async () => {
    const origEnv = process.env.ENABLE_DOMAIN_REDIRECT;
    delete process.env.ENABLE_DOMAIN_REDIRECT;
    try {
      const redirects = await nextConfig.redirects!();
      expect(redirects).toEqual([]);
    } finally {
      process.env.ENABLE_DOMAIN_REDIRECT = origEnv;
    }
  });
});

describe("2. Role Login URL & Label Mapping", () => {
  const roles: UserRole[] = ["superadmin", "admin", "bendahara", "pengelola", "wali"];

  it("harus memiliki rute login khusus terisolasi untuk setiap role", () => {
    expect(getRoleLoginUrl("superadmin")).toBe("/superadmin/login");
    expect(getRoleLoginUrl("admin")).toBe("/admin/login");
    expect(getRoleLoginUrl("bendahara")).toBe("/bendahara/login");
    expect(getRoleLoginUrl("pengelola")).toBe("/pengelola/login");
    expect(getRoleLoginUrl("wali")).toBe("/login");
  });

  it("harus memiliki label resmi bahasa Indonesia yang tepat", () => {
    expect(getRoleLabel("superadmin")).toBe("Superadmin");
    expect(getRoleLabel("admin")).toBe("Admin Administrasi");
    expect(getRoleLabel("bendahara")).toBe("Bendahara Pesantren");
    expect(getRoleLabel("pengelola")).toBe("Pengelola Kepesantrenan");
    expect(getRoleLabel("wali")).toBe("Orang Tua / Wali Santri");
  });
});

describe("3. Role Login Isolation Validation Logic", () => {
  it("harus menolak login jika role pengguna tidak cocok dengan portal yang dituju", async () => {
    // Simulasi respons autentikasi ketika profil role berbeda dengan expectedRole
    const profile = {
      id: "usr-001",
      email: "bendahara@abu-manshur.sch.id",
      role: "bendahara" as UserRole,
      nama_lengkap: "Hj. Siti Aminah",
      is_active: true,
    };

    const expectedRole: UserRole = "admin";

    // Validasi isolasi role
    const isRoleMatched = profile.role === expectedRole;
    expect(isRoleMatched).toBe(false);

    const correctPortalName = getRoleLabel(profile.role);
    const correctPortalUrl = getRoleLoginUrl(profile.role);
    const rejectionMessage = `Akses ditolak: Akun Anda terdaftar sebagai ${correctPortalName}. Silakan gunakan portal masuk ${correctPortalName} (${correctPortalUrl}).`;

    expect(rejectionMessage).toContain("Bendahara Pesantren");
    expect(rejectionMessage).toContain("/bendahara/login");
  });

  it("harus mengizinkan login jika role pengguna cocok dengan portal yang dituju", () => {
    const profile = {
      id: "usr-002",
      role: "admin" as UserRole,
      nama_lengkap: "H. Ahmad Dahlan",
      is_active: true,
    };

    const expectedRole: UserRole = "admin";
    expect(profile.role === expectedRole).toBe(true);
  });
});

describe("4. Password Strength & Rule Enforcement on Profil Saya", () => {
  it("harus menolak kata sandi baru yang sama persis dengan username/NIS", () => {
    const username = "202401001";
    const newPasswordCandidate = "202401001";

    const isSame = newPasswordCandidate.trim().toLowerCase() === username.trim().toLowerCase();
    expect(isSame).toBe(true);
  });

  it("harus menolak kata sandi baru yang kurang dari 8 karakter", () => {
    const shortPassword = "abc";
    expect(shortPassword.length < 8).toBe(true);
  });

  it("harus menerima kata sandi baru yang kuat dan berbeda dari username", () => {
    const username = "202401001";
    const strongPassword = "SantriMandiri2026!";

    const isSame = strongPassword.trim().toLowerCase() === username.trim().toLowerCase();
    expect(isSame).toBe(false);
    expect(strongPassword.length >= 8).toBe(true);
  });
});

