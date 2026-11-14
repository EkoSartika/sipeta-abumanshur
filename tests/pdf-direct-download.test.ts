import { describe, it, expect } from "vitest";
import { generateAndDownloadLaporanPdf } from "@/lib/utils/pdf-report-generator";
import { INITIAL_PROFIL_PESANTREN } from "@/lib/store/initial-data";

describe("Direct PDF Report Generation Suite (jsPDF A4 Portrait)", () => {
  it("1. Laporan Pembayaran menghasilkan struktur PDF A4 dan nama file yang tepat", async () => {
    const res = await generateAndDownloadLaporanPdf({
      kategori: "pembayaran",
      profilPesantren: INITIAL_PROFIL_PESANTREN,
      periodeLabel: "2026/2027",
      semesterAktif: "Ganjil",
      petugasName: "KH. Pengasuh",
      filterDeskripsi: "Kelas 7A",
      columns: ["No", "No Tagihan", "Santri", "Nominal", "Status"],
      rows: [
        [1, "TGH-001", "Ahmad Fauzi", "Rp 500.000", "LUNAS"],
        [2, "TGH-002", "Budi Santoso", "Rp 500.000", "BELUM BAYAR"],
      ],
    });

    expect(res.ok).toBe(true);
    expect(res.filename).toBe("Laporan_Pembayaran_2026-2027.pdf");
    expect(res.message).toContain("berhasil diunduh langsung");
  });

  it("2. Laporan Uang Saku menghasilkan nama file dan baris data", async () => {
    const res = await generateAndDownloadLaporanPdf({
      kategori: "uang_saku",
      profilPesantren: INITIAL_PROFIL_PESANTREN,
      periodeLabel: "2026/2027",
      semesterAktif: "Ganjil",
      petugasName: "KH. Pengasuh",
      columns: ["No", "NIS", "Santri", "Saldo"],
      rows: [[1, "2026001", "Ahmad Fauzi", "Rp 150.000"]],
    });

    expect(res.ok).toBe(true);
    expect(res.filename).toBe("Laporan_Uang_Saku_2026-2027.pdf");
  });

  it("3. Laporan Mengaji, Tahfidz, Kedisiplinan, dan Prestasi menghasilkan PDF resmi", async () => {
    for (const kat of ["mengaji", "tahfidz", "kedisiplinan", "prestasi"] as const) {
      const res = await generateAndDownloadLaporanPdf({
        kategori: kat,
        profilPesantren: INITIAL_PROFIL_PESANTREN,
        periodeLabel: "2026/2027",
        semesterAktif: "Ganjil",
        petugasName: "KH. Pengasuh",
        columns: ["No", "Santri", "Keterangan"],
        rows: [[1, "Muhammad Rizky", "Catatan Rekapitulasi"]],
      });
      expect(res.ok).toBe(true);
      expect(res.filename).toContain(kat.charAt(0).toUpperCase() + kat.slice(1));
    }
  });

  it("4. Kop surat dinamis menggunakan profil pesantren terkini", async () => {
    const customProfil = {
      ...INITIAL_PROFIL_PESANTREN,
      nama_yayasan: "YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR CIREBON",
      nama_resmi: "PONDOK PESANTREN MODERN ABU MANSHUR UTAMA",
      alamat: "Jl. Nyi Ageng Serang No. 01, Sindangmekar, Cirebon",
      email: "resmi@abumanshur.sch.id",
    };

    const res = await generateAndDownloadLaporanPdf({
      kategori: "pembayaran",
      profilPesantren: customProfil,
      periodeLabel: "2026/2027",
      semesterAktif: "Genap",
      petugasName: "Pengasuh Pondok",
      columns: ["No", "Santri"],
      rows: [[1, "Santri Uji"]],
    });

    expect(res.ok).toBe(true);
  });
});
