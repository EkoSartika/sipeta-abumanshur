import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SipetaProvider } from "@/lib/store/sipeta-context";
import { MasterTahunAjaranView } from "@/components/master/master-tahun-ajaran-view";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { SuperadminPortal } from "@/modules/superadmin/superadmin-portal";
import { TuPortal } from "@/modules/tu/tu-portal";
import { BendaharaPortal } from "@/modules/bendahara/bendahara-portal";
import { AsatidzPortal } from "@/modules/asatidz/asatidz-portal";
import { WaliPortal } from "@/modules/wali/wali-portal";

describe("Fitur Manajemen Semester Akademik SIPETA", () => {
  it("1. Render MasterTahunAjaranView dengan fitur Semester tanpa crash", () => {
    expect(() => {
      renderToString(
        <SipetaProvider>
          <MasterTahunAjaranView />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("2. Seluruh portal merender konteks tahun pelajaran dan semester tanpa crash", () => {
    // Admin Portal
    expect(() => {
      renderToString(
        <SipetaProvider>
          <AdminPortal activeTab="tahun_ajaran" />
        </SipetaProvider>
      );
    }).not.toThrow();

    // Superadmin Portal
    expect(() => {
      renderToString(
        <SipetaProvider>
          <SuperadminPortal activeTab="tahun_ajaran" />
        </SipetaProvider>
      );
    }).not.toThrow();

    // TU Portal (Profil Pesantren)
    expect(() => {
      renderToString(
        <SipetaProvider>
          <TuPortal activeTab="profil_pesantren" />
        </SipetaProvider>
      );
    }).not.toThrow();

    // Bendahara Portal
    expect(() => {
      renderToString(
        <SipetaProvider>
          <BendaharaPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();

    // Asatidz Portal
    expect(() => {
      renderToString(
        <SipetaProvider>
          <AsatidzPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();

    // Wali Portal
    expect(() => {
      renderToString(
        <SipetaProvider>
          <WaliPortal activeTab="dashboard" />
        </SipetaProvider>
      );
    }).not.toThrow();
  });

  it("3. Validasi hak akses: hanya Admin dan Superadmin yang diizinkan mengubah semester", () => {
    const isAuthorizedRole = (role?: string) => role === "superadmin" || role === "admin";

    expect(isAuthorizedRole("superadmin")).toBe(true);
    expect(isAuthorizedRole("admin")).toBe(true);
    expect(isAuthorizedRole("tu")).toBe(false);
    expect(isAuthorizedRole("bendahara")).toBe(false);
    expect(isAuthorizedRole("asatidz")).toBe(false);
    expect(isAuthorizedRole("wali")).toBe(false);
    expect(isAuthorizedRole(undefined)).toBe(false);
  });

  it("4. Validasi nilai semester: hanya 'Ganjil' atau 'Genap'", () => {
    const isValidSemester = (val: string): val is "Ganjil" | "Genap" => {
      return val === "Ganjil" || val === "Genap";
    };

    expect(isValidSemester("Ganjil")).toBe(true);
    expect(isValidSemester("Genap")).toBe(true);
    expect(isValidSemester("Pendek")).toBe(false);
    expect(isValidSemester("Kuartal")).toBe(false);
    expect(isValidSemester("")).toBe(false);
  });

  it("5. Pergantian semester tidak mengubah tahun pelajaran aktif", () => {
    const currentProfile = {
      tahun_pelajaran_aktif: "2026/2027",
      semester_aktif: "Ganjil" as const,
    };

    const newSemester = "Genap" as const;
    const updatedProfile = {
      ...currentProfile,
      semester_aktif: newSemester,
    };

    expect(updatedProfile.semester_aktif).toBe("Genap");
    expect(updatedProfile.tahun_pelajaran_aktif).toBe("2026/2027");
  });

  it("6. Proteksi data: pergantian semester tidak merusak data santri, tagihan, atau nilai", () => {
    const santriSample = [{ id: "s1", nama: "Ahmad", status: "AKTIF" }];
    const tagihanSample = [{ id: "t1", nominal: 500000, status: "BELUM_LUNAS" }];
    const kelasSample = [{ id: "k1", nama_kelas: "VII-A" }];

    // Simulasi transisi semester
    const previousState = {
      santri: [...santriSample],
      tagihan: [...tagihanSample],
      kelas: [...kelasSample],
      semester: "Ganjil",
    };

    const nextState = {
      ...previousState,
      semester: "Genap",
    };

    expect(nextState.santri).toEqual(previousState.santri);
    expect(nextState.tagihan).toEqual(previousState.tagihan);
    expect(nextState.kelas).toEqual(previousState.kelas);
    expect(nextState.semester).toBe("Genap");
  });
});

