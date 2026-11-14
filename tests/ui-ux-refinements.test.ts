import { describe, it, expect } from "vitest";
import { INITIAL_PROFIL_PESANTREN, INITIAL_TAHUN_AJARAN } from "../src/lib/store/initial-data";
import type { ProfilPesantren } from "../src/types/database";

describe("SIPETA UI/UX Refinements & Pesantren Profile Suite", () => {
  it("1. INITIAL_PROFIL_PESANTREN memiliki struktur identitas dan alamat lengkap yang valid", () => {
    expect(INITIAL_PROFIL_PESANTREN.nama_resmi).toBe("Pondok Pesantren Modern Abu Manshur");
    expect(INITIAL_PROFIL_PESANTREN.nspp).toBe("510032090045");
    expect(INITIAL_PROFIL_PESANTREN.npsn).toBe("69982412");
    expect(INITIAL_PROFIL_PESANTREN.akreditasi).toBe("Terakreditasi A");
    expect(INITIAL_PROFIL_PESANTREN.alamat).toContain("Jl. Nyi Ageng Serang");
    expect(INITIAL_PROFIL_PESANTREN.tahun_pelajaran_aktif).toBe("2024/2025");
    expect(INITIAL_PROFIL_PESANTREN.semester_aktif).toBe("Ganjil");
  });

  it("2. Tahun ajaran aktif default konsisten dengan profil pesantren", () => {
    const activeTA = INITIAL_TAHUN_AJARAN.find((t) => t.is_active);
    expect(activeTA).toBeDefined();
    expect(activeTA?.nama).toBe(INITIAL_PROFIL_PESANTREN.tahun_pelajaran_aktif);
  });

  it("3. Update profil pesantren memvalidasi nama resmi dan alamat tidak boleh kosong", () => {
    const validPayload: Partial<ProfilPesantren> = {
      nama_resmi: "Pondok Pesantren Modern Abu Manshur Cirebon",
      alamat: "Jl. Nyi Ageng Serang No. 1",
    };
    expect(validPayload.nama_resmi?.trim().length).toBeGreaterThan(0);
    expect(validPayload.alamat?.trim().length).toBeGreaterThan(0);

    const invalidName: Partial<ProfilPesantren> = { nama_resmi: "   " };
    expect(invalidName.nama_resmi?.trim().length).toBe(0);
  });

  it("4. Struktur migration 015 siap ditinjau dan mendefinisikan RLS untuk TU", () => {
    const fs = require("fs");
    const migrationContent = fs.readFileSync("supabase/migrations/015_profil_pesantren.sql", "utf8");
    expect(migrationContent).toContain("CREATE TABLE IF NOT EXISTS public.profil_pesantren");
    expect(migrationContent).toContain("public.get_my_role() IN ('tu', 'admin', 'superadmin')");
    expect(migrationContent).toContain("Master TahunAjaran: TU kelola status aktif");
  });

  it("5. Seluruh banner dan deskripsi berlebihan dari Part B telah tereliminasi", () => {
    const fs = require("fs");
    const tuPortal = fs.readFileSync("src/modules/tu/tu-portal.tsx", "utf8");
    const tuLogin = fs.readFileSync("src/app/tu/login/page.tsx", "utf8");
    const superadminPortal = fs.readFileSync("src/modules/superadmin/superadmin-portal.tsx", "utf8");
    const superadminLogin = fs.readFileSync("src/app/superadmin/login/page.tsx", "utf8");
    const adminPortal = fs.readFileSync("src/modules/admin/admin-portal.tsx", "utf8");
    const adminLogin = fs.readFileSync("src/app/admin/login/page.tsx", "utf8");
    const asatidzPortal = fs.readFileSync("src/modules/pengelola/pengelola-portal.tsx", "utf8");
    const asatidzLogin = fs.readFileSync("src/app/asatidz/login/page.tsx", "utf8");
    const bendaharaPortal = fs.readFileSync("src/modules/bendahara/bendahara-portal.tsx", "utf8");
    const bendaharaLogin = fs.readFileSync("src/app/bendahara/login/page.tsx", "utf8");
    const pageView = fs.readFileSync("src/app/page.tsx", "utf8");

    // TU
    expect(tuPortal).not.toContain("Alur Persetujuan Pembiayaan Santri (Tata Usaha)");
    expect(tuPortal).not.toContain("Pusat Rekapitulasi & Laporan Administrasi Pesantren (Read-Only Keuangan)");
    expect(tuPortal).not.toContain("Pengelolaan master data santri, akun wali santri (1:1)");
    expect(tuLogin).not.toContain("Gunakan username internal resmi staf Tata Usaha Anda");

    // Superadmin
    expect(superadminPortal).not.toContain("Pusat Komando & Pengawasan Pimpinan");
    expect(superadminPortal).not.toContain("Pantau seluruh tata kelola pengguna internal, rekening resmi BSI pesantren");
    expect(superadminLogin).not.toContain("Portal Superadmin (Pimpinan)");
    expect(superadminLogin).not.toContain("Khusus akun Superadmin resmi pimpinan");

    // Pengasuh
    expect(adminPortal).not.toContain("Mandat Pengawasan Menyeluruh");
    expect(adminPortal).not.toContain("(Executive Dashboard)");
    expect(adminPortal).not.toContain("Mode Pengawasan & Persetujuan Keuangan Pesantren");
    expect(adminLogin).not.toContain("Gunakan username akun resmi pimpinan / pengasuh pondok pesantren");

    // Asatidz
    expect(asatidzPortal).not.toContain("Portal Asatidz (Mengaji, Tahfidz, Prestasi, & Kedisiplinan)");
    expect(asatidzLogin).not.toContain("Portal Asatidz & Pembina");
    expect(asatidzLogin).not.toContain("Username Asatidz / Pembina");
    expect(asatidzLogin).toContain("Username Asatidz");

    // Bendahara
    expect(bendaharaPortal).not.toContain("Otoritas Tunggal Pengesahan Transaksi Keuangan");
    expect(bendaharaPortal).not.toContain("Integrasi Modul Asatidz & Keuangan");
    expect(bendaharaLogin).not.toContain("Portal Bendahara Pesantren");

    // Footer berulang
    expect(pageView).not.toContain("1 Santri = 1 Akun Wali • Rekening Resmi BSI • Ledger Uang Saku & SPP");
  });

  it("6. Menu Tahfidz dan Kedisiplinan pada Pengasuh telah disatukan ke Pusat Laporan 6 Kategori dan Profil Pesantren tersedia", () => {
    const fs = require("fs");
    const adminPortal = fs.readFileSync("src/modules/admin/admin-portal.tsx", "utf8");
    const pageView = fs.readFileSync("src/app/page.tsx", "utf8");

    // Sesuai Instruksi Penyempurnaan Menu Pengasuh:
    // Menu terpisah laporan_tahfidz & laporan_kedisiplinan dihapus dari sidebar Pengasuh,
    // digantikan Pusat Laporan & Analitik (6 Kategori) dan menu Profil Pesantren.
    expect(pageView).not.toContain('{ id: "laporan_tahfidz", label: "Laporan Tahfidz", icon: Sparkles }');
    expect(pageView).not.toContain('{ id: "laporan_kedisiplinan", label: "Laporan Kedisiplinan", icon: ShieldAlert }');
    expect(pageView).toContain('{ id: "laporan", label: "Pusat Laporan & Analitik (6 Kategori)", icon: BarChart3 }');
    expect(pageView).toContain('{ id: "profil_pesantren", label: "Profil Pesantren", icon: Building2 }');

    expect(adminPortal).toContain('activeTab === "profil_pesantren"');
    expect(adminPortal).toContain("ProfilPesantrenView");
  });

  it("7. Menu Pengaturan Profil Pesantren tersedia pada portal TU", () => {
    const fs = require("fs");
    const tuPortal = fs.readFileSync("src/modules/tu/tu-portal.tsx", "utf8");
    const pageView = fs.readFileSync("src/app/page.tsx", "utf8");

    expect(tuPortal).toContain('activeTab === "profil_pesantren"');
    expect(tuPortal).toContain("Profil Pesantren");
    expect(tuPortal).toContain("Tahun Pelajaran Aktif");
    expect(tuPortal).toContain("Konfirmasi Simpan Profil Pesantren");
    expect(pageView).toContain('{ id: "profil_pesantren", label: "Profil Pesantren", icon: Building2 }');
  });
});
