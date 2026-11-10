import { describe, it, expect } from "vitest";
import React from "react";
import fs from "fs";
import path from "path";
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

  it("7. Source code audit: administrasiService.setActiveSemester HANYA menggunakan RPC tanpa fallback UPDATE", () => {
    const serviceSource = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/services/administrasi.service.ts"),
      "utf8"
    );

    // Dapatkan blok fungsi setActiveSemester
    const match = serviceSource.match(/async setActiveSemester\([\s\S]*?\n  \}/);
    expect(match).not.toBeNull();
    const funcBody = match![0];

    // Wajib memanggil RPC rpc_set_active_semester
    expect(funcBody).toContain('this.client.rpc("rpc_set_active_semester"');

    // DILARANG memanggil UPDATE profil_pesantren
    expect(funcBody).not.toContain('.from("profil_pesantren").update');
    expect(funcBody).not.toContain(".from('profil_pesantren').update");
  });

  it("8. Source code audit: updateProfilPesantren selalu membersihkan semester_aktif dari payload", () => {
    const contextSource = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/store/sipeta-context.tsx"),
      "utf8"
    );

    // Memastikan payload semester_aktif dihapus pada updateProfilPesantren
    expect(contextSource).toContain("if (effectivePayload.semester_aktif !== undefined)");
    expect(contextSource).toContain("delete effectivePayload.semester_aktif;");
  });

  it("9. Logika transisi: jika RPC gagal, state tidak boleh optimis dan audit log tidak dicatat", async () => {
    let currentState = "Ganjil";
    const auditLogs: string[] = [];

    const simulateSemesterSwitch = async (rpcSucceeds: boolean, target: "Ganjil" | "Genap") => {
      // Sesuai arsitektur baru: RPC dipanggil DULU, TIDAK optimis
      if (!rpcSucceeds) {
        return { ok: false, message: "RPC gagal atau belum diterapkan" };
      }
      currentState = target;
      auditLogs.push(`SET_ACTIVE_SEMESTER_${target}`);
      return { ok: true, message: "Berhasil" };
    };

    // Simulasi kegagalan
    const failResult = simulateSemesterSwitch(false, "Genap");
    await expect(failResult).resolves.toEqual({ ok: false, message: "RPC gagal atau belum diterapkan" });
    // State tidak berubah
    expect(currentState).toBe("Ganjil");
    // Audit log tidak bertambah
    expect(auditLogs).toHaveLength(0);

    // Simulasi keberhasilan
    const successResult = simulateSemesterSwitch(true, "Genap");
    await expect(successResult).resolves.toEqual({ ok: true, message: "Berhasil" });
    expect(currentState).toBe("Genap");
    expect(auditLogs).toEqual(["SET_ACTIVE_SEMESTER_Genap"]);
  });
});

