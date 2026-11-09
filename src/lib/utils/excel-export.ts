// ============================================================================
// SIPETA - Excel (.xlsx) Export Utility
// Mengekspor data santri ke format biner .xlsx resmi menggunakan SheetJS (xlsx)
// Menjamin NIS diperlakukan sebagai teks murni dan header diformat profesional
// ============================================================================

import * as XLSX from "xlsx";
import type { Kamar, Kelas, Santri, WaliSantri } from "@/types/database";

export interface ExportSantriRow {
  no: number;
  nis: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  kelas: string;
  kode_kelas: string;
  kamar: string;
  nama_wali: string;
  hubungan_wali: string;
  no_telepon_wali: string;
  alamat: string;
  status: string;
}

/**
 * Format tanggal YYYY-MM-DD menjadi format standar DD/MM/YYYY
 */
export function formatTanggalStandard(isoDate: string): string {
  if (!isoDate) return "-";
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return isoDate;
  }
}

/**
 * Menyiapkan baris data santri untuk ekspor Excel (.xlsx)
 */
export function prepareSantriExportRows(
  santriList: Santri[],
  kelasList: Kelas[],
  kamarList: Kamar[],
  waliList: WaliSantri[]
): ExportSantriRow[] {
  return santriList.map((s, index) => {
    const kls = kelasList.find((k) => k.id === s.kelas_id);
    const kmr = kamarList.find((k) => k.id === s.kamar_id);
    const wali = waliList.find((w) => w.santri_id === s.id);

    return {
      no: index + 1,
      nis: s.nis,
      nama_lengkap: s.nama_lengkap,
      jenis_kelamin: s.jenis_kelamin === "L" ? "Laki-laki" : "Perempuan",
      tempat_lahir: s.tempat_lahir,
      tanggal_lahir: formatTanggalStandard(s.tanggal_lahir),
      kelas: kls?.nama_kelas || "-",
      kode_kelas: kls?.kode_kelas || "-",
      kamar: kmr?.nama_kamar || "-",
      nama_wali: wali?.nama_lengkap || "-",
      hubungan_wali: wali?.hubungan || "-",
      no_telepon_wali: wali?.no_telepon || "-",
      alamat: s.alamat || "-",
      status: s.status,
    };
  });
}

/**
 * Generate dan trigger unduh file .xlsx resmi dari data santri
 */
export function exportSantriToExcel(
  santriList: Santri[],
  kelasList: Kelas[],
  kamarList: Kamar[],
  waliList: WaliSantri[],
  filenamePrefix = "Data_Santri_SIPETA"
): { ok: boolean; count: number; filename: string } {
  if (!santriList || santriList.length === 0) {
    return { ok: false, count: 0, filename: "" };
  }

  const rows = prepareSantriExportRows(santriList, kelasList, kamarList, waliList);

  // Buat header dengan label profesional bahasa Indonesia
  const headers = [
    "No",
    "NIS",
    "Nama Lengkap Santri",
    "Jenis Kelamin",
    "Tempat Lahir",
    "Tanggal Lahir",
    "Kelas",
    "Kode Kelas",
    "Kamar Asrama",
    "Nama Orang Tua/Wali",
    "Hubungan Wali",
    "No. Telepon / WA Wali",
    "Alamat Lengkap",
    "Status Santri",
  ];

  // Matriks data: Baris header + Baris data
  const aoaData: (string | number)[][] = [
    headers,
    ...rows.map((r) => [
      r.no,
      r.nis, // NIS diperlakukan sebagai string
      r.nama_lengkap,
      r.jenis_kelamin,
      r.tempat_lahir,
      r.tanggal_lahir,
      r.kelas,
      r.kode_kelas,
      r.kamar,
      r.nama_wali,
      r.hubungan_wali,
      r.no_telepon_wali,
      r.alamat,
      r.status,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

  // Pastikan kolom NIS eksplisit bertipe String (type: 's') agar format numerik tidak memotong awalan 0
  rows.forEach((r, idx) => {
    const cellAddress = XLSX.utils.encode_cell({ r: idx + 1, c: 1 }); // kolom 1 adalah NIS
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].t = "s";
      worksheet[cellAddress].v = String(r.nis);
    }
  });

  // Hitung lebar kolom otomatis menyesuaikan panjang karakter isi
  const colWidths = headers.map((header, colIdx) => {
    let maxLen = header.length;
    aoaData.slice(1).forEach((row) => {
      const cellVal = row[colIdx];
      const strLen = cellVal !== undefined && cellVal !== null ? String(cellVal).length : 0;
      if (strLen > maxLen) {
        maxLen = strLen;
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
  });

  worksheet["!cols"] = colWidths;

  // Buat workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data Santri");

  // Format timestamp nama file: Data_Santri_SIPETA_YYYYMMDD_HHmm.xlsx
  const now = new Date();
  const dateStr =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    "_" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0");

  const fullFilename = `${filenamePrefix}_${dateStr}.xlsx`;

  // Trigger unduh browser
  XLSX.writeFile(workbook, fullFilename, { bookType: "xlsx", type: "binary" });

  return { ok: true, count: rows.length, filename: fullFilename };
}

