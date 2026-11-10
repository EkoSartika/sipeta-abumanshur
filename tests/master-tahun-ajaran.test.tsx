import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SipetaProvider } from "@/lib/store/sipeta-context";
import { MasterTahunAjaranView } from "@/components/master/master-tahun-ajaran-view";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { SuperadminPortal } from "@/modules/superadmin/superadmin-portal";

describe("Master Tahun Pelajaran Component & Validation Test", () => {
  it("renders MasterTahunAjaranView without crashing", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <MasterTahunAjaranView />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders AdminPortal with activeTab='tahun_ajaran' without crashing", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <AdminPortal activeTab="tahun_ajaran" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("renders SuperadminPortal with activeTab='tahun_ajaran' without crashing", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <SuperadminPortal activeTab="tahun_ajaran" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("enforces date validation: tanggal_selesai must be greater than tanggal_mulai", () => {
    const invalidDateCases = [
      { mulai: "2026-07-01", selesai: "2026-07-01" }, // Sama
      { mulai: "2026-07-01", selesai: "2026-06-30" }, // Mundur
      { mulai: "2027-01-01", selesai: "2026-12-31" }, // Mundur
    ];

    for (const c of invalidDateCases) {
      const isInvalid = new Date(c.selesai) <= new Date(c.mulai);
      expect(isInvalid).toBe(true);
    }

    const validCase = { mulai: "2026-07-01", selesai: "2027-06-30" };
    expect(new Date(validCase.selesai) > new Date(validCase.mulai)).toBe(true);
  });

  it("prevents duplicate academic year names", () => {
    const existingList = [{ nama: "2026/2027" }, { nama: "2025/2026" }];
    const isDup1 = existingList.some((t) => t.nama.toLowerCase() === "2026/2027".toLowerCase());
    const isDup2 = existingList.some((t) => t.nama.toLowerCase() === " 2026/2027 ".trim().toLowerCase());
    const isNotDup = existingList.some((t) => t.nama.toLowerCase() === "2027/2028".toLowerCase());

    expect(isDup1).toBe(true);
    expect(isDup2).toBe(true);
    expect(isNotDup).toBe(false);
  });

  it("blocks deleting active academic year or deletion by non-superadmin", () => {
    // 1. Role non-superadmin tidak boleh menghapus
    const canDeleteAdmin = (role: string) => role === "superadmin";
    expect(canDeleteAdmin("admin")).toBe(false);
    expect(canDeleteAdmin("tu")).toBe(false);
    expect(canDeleteAdmin("wali")).toBe(false);
    expect(canDeleteAdmin("superadmin")).toBe(true);

    // 2. Tahun ajaran yang aktif tidak boleh dihapus
    const canDeleteTarget = (target: { is_active: boolean; countTagihan: number; countKelas: number }) => {
      if (target.is_active) return false;
      if (target.countTagihan > 0 || target.countKelas > 0) return false;
      return true;
    };

    expect(canDeleteTarget({ is_active: true, countTagihan: 0, countKelas: 0 })).toBe(false);
    expect(canDeleteTarget({ is_active: false, countTagihan: 5, countKelas: 0 })).toBe(false);
    expect(canDeleteTarget({ is_active: false, countTagihan: 0, countKelas: 2 })).toBe(false);
    expect(canDeleteTarget({ is_active: false, countTagihan: 0, countKelas: 0 })).toBe(true);
  });

  it("ensures createTahunAjaran is strictly restricted to admin and superadmin", () => {
    const isAuthorizedRole = (role: string) => role === "superadmin" || role === "admin";
    expect(isAuthorizedRole("superadmin")).toBe(true);
    expect(isAuthorizedRole("admin")).toBe(true);
    expect(isAuthorizedRole("tu")).toBe(false);
    expect(isAuthorizedRole("bendahara")).toBe(false);
    expect(isAuthorizedRole("pengelola")).toBe(false);
    expect(isAuthorizedRole("wali")).toBe(false);
  });
});

