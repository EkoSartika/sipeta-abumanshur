// ============================================================================
// SIPETA - PDF Report Generator Service
// Menghasilkan dokumen resmi A4 Portrait dengan Kop Surat Resmi Yayasan & Pesantren,
// logo, metadata filter, tabel otomatis, dan nomor halaman (Didukung jsPDF & AutoTable).
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ProfilPesantren } from "@/types/database";
import { formatTanggal, formatRupiah, formatWaktuLengkap } from "@/lib/utils/format";

export interface PdfReportOptions {
  kategori: "pembayaran" | "uang_saku" | "mengaji" | "tahfidz" | "kedisiplinan" | "prestasi";
  profilPesantren: ProfilPesantren;
  periodeLabel: string;
  semesterAktif: string;
  petugasName: string;
  filterDeskripsi?: string;
  columns: string[];
  rows: (string | number)[][];
  columnStyles?: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number | "auto" | "wrap" }>;
}

let cachedLogoBase64: string | null = null;

async function getLogoBase64(logoUrl?: string): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;
  if (typeof window === "undefined") return null;

  const url = logoUrl || "/images/logo-abu-manshur.png";

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width || 120;
        canvas.height = img.height || 120;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/png");
          cachedLogoBase64 = dataUrl;
          resolve(dataUrl);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function generateAndDownloadLaporanPdf(options: PdfReportOptions): Promise<{ ok: boolean; message: string; filename: string }> {
  try {
    const {
      kategori,
      profilPesantren,
      periodeLabel,
      semesterAktif,
      petugasName,
      filterDeskripsi,
      columns,
      rows,
      columnStyles = {},
    } = options;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4", // 210 x 297 mm
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;

    // 1. Dapatkan base64 logo pesantren
    const logoDataUrl = await getLogoBase64(profilPesantren?.logo_pesantren_url || profilPesantren?.logo_yayasan_url);

    // Bersihkan karakter terlarang pada nama file (seperti '/' menjadi '-')
    const safePeriode = (periodeLabel || "2026-2027").replace(/[\/\\:*?"<>|]/g, "-").replace(/\s+/g, "_");

    // Kategori Metadata
    const judulMap: Record<string, { title: string; defaultFilename: string }> = {
      pembayaran: {
        title: "LAPORAN REKAPITULASI PEMBAYARAN & KEWAJIBAN TAGIHAN SANTRI",
        defaultFilename: `Laporan_Pembayaran_${safePeriode}.pdf`,
      },
      uang_saku: {
        title: "LAPORAN REKAPITULASI SALDO & MUTASI UANG SAKU SANTRI",
        defaultFilename: `Laporan_Uang_Saku_${safePeriode}.pdf`,
      },
      mengaji: {
        title: "LAPORAN PERKEMBANGAN PEMBELAJARAN MENGAJI & TILAWAH SANTRI",
        defaultFilename: `Laporan_Mengaji_${safePeriode}.pdf`,
      },
      tahfidz: {
        title: "LAPORAN CAPAIAN & SETORAN TAHFIDZ AL-QUR'AN SANTRI",
        defaultFilename: `Laporan_Tahfidz_${safePeriode}.pdf`,
      },
      kedisiplinan: {
        title: "LAPORAN CATATAN KEDISIPLINAN & TINDAK LANJUT PEMBINAAN SANTRI",
        defaultFilename: `Laporan_Kedisiplinan_${safePeriode}.pdf`,
      },
      prestasi: {
        title: "LAPORAN REKAPITULASI PRESTASI AKADEMIK & NON-AKADEMIK SANTRI",
        defaultFilename: `Laporan_Prestasi_${safePeriode}.pdf`,
      },
    };

    const infoKategori = judulMap[kategori] || {
      title: "LAPORAN RESMI PONDOK PESANTREN MODERN ABU MANSHUR",
      defaultFilename: `Laporan_Santri_${safePeriode}.pdf`,
    };

    // Fungsi render Header Kop Surat Resmi pada setiap halaman
    const renderKopSurat = (pageIndex: number) => {
      // Logo Pesantren (20 x 20 mm)
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, "PNG", marginX, 10, 20, 20);
        } catch {
          // Abaikan jika error addImage
        }
      }

      // Teks Kop Surat Resmi
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59); // slate-800
      const namaYayasan = (profilPesantren?.nama_yayasan || "YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR").toUpperCase();
      doc.text(namaYayasan, pageWidth / 2 + 6, 13, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(18, 60, 53); // #123C35
      const namaPesantren = (profilPesantren?.nama_resmi || "PONDOK PESANTREN MODERN ABU MANSHUR").toUpperCase();
      doc.text(namaPesantren, pageWidth / 2 + 6, 19, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105); // slate-600
      const alamatLine = profilPesantren?.alamat || "Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652";
      doc.text(alamatLine, pageWidth / 2 + 6, 24, { align: "center", maxWidth: pageWidth - marginX * 2 - 25 });

      const kontakLine = `Email: ${profilPesantren?.email || "sekretariat@abumanshur.sch.id"}  |  Telp: ${profilPesantren?.no_telepon || "(0231) 8303388"}  |  Web: ${profilPesantren?.website || "https://abumanshur.sch.id"}`;
      doc.text(kontakLine, pageWidth / 2 + 6, 28, { align: "center" });

      // Garis Pembatas Kop Surat Ganda (Garis tebal atas, tipis bawah)
      doc.setDrawColor(18, 60, 53);
      doc.setLineWidth(0.8);
      doc.line(marginX, 32, pageWidth - marginX, 32);

      doc.setLineWidth(0.2);
      doc.line(marginX, 33, pageWidth - marginX, 33);
    };

    // Render Kop Surat Halaman Pertama
    renderKopSurat(1);

    // Metadata Judul Laporan & Periode
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(infoKategori.title, pageWidth / 2, 40, { align: "center", maxWidth: pageWidth - marginX * 2 });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const filterText = filterDeskripsi ? `Filter: ${filterDeskripsi}` : "Semua Data Terpilih";
    const subInfo = `Tahun Pelajaran: ${periodeLabel} (Semester ${semesterAktif})  |  ${filterText}`;
    doc.text(subInfo, pageWidth / 2, 45, { align: "center", maxWidth: pageWidth - marginX * 2 });

    // Tabel Laporan menggunakan autoTable
    autoTable(doc, {
      startY: 50,
      margin: { left: marginX, right: marginX, bottom: 20 },
      head: [columns],
      body: rows,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 2,
        valign: "middle",
        overflow: "linebreak",
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [18, 60, 53], // #123C35
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50
      },
      columnStyles: columnStyles,
      didDrawPage: (data) => {
        // Jika autoTable membuat halaman baru, gambar kop surat di halaman tersebut
        if (data.pageNumber > 1) {
          renderKopSurat(data.pageNumber);
        }
      },
    });

    // Nomor Halaman & Footer di Seluruh Halaman
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Garis footer tipis
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184); // slate-400

      const printInfo = `Dicetak otomatis melalui SIPETA — ${formatWaktuLengkap(new Date().toISOString())} • Petugas: ${petugasName || "Pengasuh"}`;
      doc.text(printInfo, marginX, pageHeight - 8);

      const pageNumText = `Halaman ${i} dari ${totalPages}`;
      doc.text(pageNumText, pageWidth - marginX, pageHeight - 8, { align: "right" });
    }

    // Trigger direct download ke browser
    const filename = infoKategori.defaultFilename;
    doc.save(filename);

    return {
      ok: true,
      message: `File PDF "${filename}" berhasil diunduh langsung (${rows.length} baris data).`,
      filename,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Gagal men-generate PDF:", err);
    return {
      ok: false,
      message: `Gagal mengunduh dokumen PDF: ${errorMsg}`,
      filename: "",
    };
  }
}
