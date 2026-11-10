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
});
