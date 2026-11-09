// ============================================================================
// SIPETA - Excel Import & Validation Utilities for Santri & NIS-Based Wali
// Mendukung pembacaan, validasi bertahap, download template, dan laporan hasil
// ============================================================================

import * as XLSX from "xlsx";
import type {
  ImportBatchReport,
  ImportRowError,
  ImportSantriRow,
  ImportValidationSummary,
  Kamar,
  Kelas,
} from "@/types/database";

export const IMPORT_COLUMNS = [
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
  "Nomor Telepon Wali",
  "Email Kontak (Opsional)",
  "Alamat",
] as const;

/**
 * Buat dan trigger unduh Template Excel Resmi (.xlsx)
 * Disertai Sheet Petunjuk Pengisian & Format Teks NIS
 */
export function downloadSantriImportTemplate(): void {
  const wb = XLSX.utils.book_new();

  // 1. Sheet Utama: Template Pengisian
  const templateHeaders = [...IMPORT_COLUMNS];
  const sampleRows = [
    [
      "20260001",
      "Muhammad Fauzan Kamil",
      "L",
      "Cirebon",
      "2013-05-12",
      "Kelas VII-A (MTs Putra)",
      "KLS-7A",
      "Kamar Abu Bakar 01",
      "H. Ahmad Fauzi",
      "Ayah",
      "081234567890",
      "fauzi@gmail.com",
      "Jl. Fatahillah No. 12, Plered, Cirebon",
    ],
    [
      "02026002",
      "Fathimah Azzahra",
      "P",
      "Bandung",
      "2013-08-20",
      "Kelas VII-B (MTs Putri)",
      "KLS-7B",
      "Kamar Khadijah 01",
      "Hj. Siti Nurhaliza",
      "Ibu",
      "081298765432",
      "",
      "Jl. Terusan Buah Batu No. 45, Bandung",
    ],
  ];

  const wsTemplate = XLSX.utils.aoa_to_sheet([templateHeaders, ...sampleRows]);

  // Set lebar kolom yang proporsional
  wsTemplate["!cols"] = [
    { wch: 14 }, // NIS
    { wch: 28 }, // Nama
    { wch: 14 }, // JK
    { wch: 16 }, // Tempat Lahir
    { wch: 16 }, // Tgl Lahir
    { wch: 24 }, // Kelas
    { wch: 14 }, // Kode Kelas
    { wch: 22 }, // Kamar
    { wch: 24 }, // Nama Wali
    { wch: 16 }, // Hubungan
    { wch: 20 }, // No Telp
    { wch: 26 }, // Email
    { wch: 36 }, // Alamat
  ];

  // 2. Sheet Kedua: Petunjuk Pengisian
  const petunjukData = [
    ["PETUNJUK PENGISIAN IMPORT DATA SANTRI & AKUN WALI SIPETA"],
    ["Pondok Pesantren Modern Abu Manshur — Plered, Cirebon"],
    [""],
    ["KOLOM", "KEWAJIBAN", "KETENTUAN & CONTOH FORMAT"],
    [
      "NIS",
      "Wajib",
      "Nomor Induk Santri (Harus unik). Diformat sebagai TEKS agar angka 0 di depan tidak hilang. Contoh: 20260001 atau 02026002.",
    ],
    [
      "Nama Lengkap Santri",
      "Wajib",
      "Nama lengkap santri sesuai akta/kartu keluarga. Contoh: Muhammad Fauzan Kamil.",
    ],
    [
      "Jenis Kelamin",
      "Wajib",
      "Ketik 'L' untuk Laki-laki (Putra) atau 'P' untuk Perempuan (Putri).",
    ],
    [
      "Tempat Lahir",
      "Wajib",
      "Kota atau kabupaten kelahiran santri. Contoh: Cirebon.",
    ],
    [
      "Tanggal Lahir",
      "Wajib",
      "Format tanggal baku internasional: YYYY-MM-DD (Tahun-Bulan-Hari). Contoh: 2013-05-12.",
    ],
    [
      "Kelas",
      "Wajib",
      "Nama kelas penempatan santri. Contoh: Kelas VII-A (MTs Putra).",
    ],
    [
      "Kode Kelas",
      "Wajib",
      "Kode kelas unik sesuai Master Kelas. Contoh: KLS-7A, KLS-7B, KLS-8A.",
    ],
    [
      "Kamar Asrama",
      "Wajib",
      "Nama kamar asrama santri sesuai Master Kamar. Contoh: Kamar Abu Bakar 01.",
    ],
    [
      "Nama Orang Tua/Wali",
      "Wajib",
      "Nama lengkap orang tua atau wali santri. Contoh: H. Ahmad Fauzi.",
    ],
    [
      "Hubungan Wali",
      "Wajib",
      "Pilih salah satu: 'Ayah', 'Ibu', atau 'Wali'.",
    ],
    [
      "Nomor Telepon Wali",
      "Wajib",
      "Nomor kontak aktif WhatsApp/telepon wali santri (minimal 8 digit). Contoh: 081234567890.",
    ],
    [
      "Email Kontak",
      "Opsional",
      "Alamat email untuk pengiriman info (opsional, bukan untuk login). Boleh dikosongkan.",
    ],
    [
      "Alamat",
      "Wajib",
      "Alamat domisili lengkap santri & orang tua/wali.",
    ],
    [""],
    ["ATURAN KEBIJAKAN OTOMATISASI AKUN WALI:"],
    ["1. Setiap santri yang diimport otomatis dibuatkan 1 akun login Orang Tua/Wali (Relasi 1:1)."],
    ["2. Username Login Wali = NIS santri."],
    ["3. Password Awal Login Wali = NIS santri."],
    ["4. Wali wajib mengganti password saat login pertama kali (kewajiban must_change_password)."],
    ["5. Password baru wali tidak boleh sama dengan NIS santri."],
  ];

  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjukData);
  wsPetunjuk["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 75 }];

  XLSX.utils.book_append_sheet(wb, wsTemplate, "Template Santri");
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, "Petunjuk Pengisian");

  XLSX.writeFile(wb, "Template_Import_Santri_SIPETA.xlsx");
}

/**
 * Parsing file Excel ArrayBuffer menjadi array objek mentah
 */
export function parseSantriExcel(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File Excel tidak memiliki sheet yang valid.");
  }

  const ws = wb.Sheets[firstSheetName];
  if (!ws) {
    throw new Error("Sheet pertama tidak dapat dibaca.");
  }

  // Ambil data dalam format matriks array of arrays
  const data = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!data || data.length < 2) {
    throw new Error("File Excel kosong atau tidak memiliki baris data setelah header.");
  }

  const headerRow = data[0] as string[];
  const normalizedHeaders = headerRow.map((h) =>
    String(h || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );

  // Mapping index kolom
  const getColIdx = (aliases: string[]) => {
    return normalizedHeaders.findIndex((h) =>
      aliases.some((alias) => h === alias || h.includes(alias))
    );
  };

  const idxNIS = getColIdx(["nis", "nomorinduksantri", "noinduk"]);
  const idxNama = getColIdx(["namalengkap", "namasantri", "nama"]);
  const idxJK = getColIdx(["jeniskelamin", "jk", "gender", "kelamin"]);
  const idxTempat = getColIdx(["tempatlahir", "tempat"]);
  const idxTgl = getColIdx(["tanggallahir", "tgllahir", "tgllahir"]);
  const idxKelas = getColIdx(["namakelas", "kelas"]);
  const idxKodeKelas = getColIdx(["kodekelas", "kdkelas"]);
  const idxKamar = getColIdx(["kamar", "kamarasrama", "namakamar"]);
  const idxNamaWali = getColIdx(["namaorangtuawali", "namawali", "orangtua", "wali"]);
  const idxHubungan = getColIdx(["hubunganwali", "hubungan", "statuswali"]);
  const idxTelp = getColIdx(["nomorteleponwali", "notelepon", "teleponwali", "nowa", "telepon"]);
  const idxEmail = getColIdx(["emailkontak", "emailwali", "email"]);
  const idxAlamat = getColIdx(["alamatlengkap", "alamat", "domisili"]);

  const resultRows: Record<string, string>[] = [];

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length === 0) continue;

    const rowVal = (idx: number) => {
      if (idx === -1 || idx >= row.length) return "";
      const val = row[idx];
      return String(val ?? "").trim();
    };

    const nis = rowVal(idxNIS);
    const nama = rowVal(idxNama);

    // Abaikan baris kosong tanpa NIS dan nama
    if (!nis && !nama) continue;

    resultRows.push({
      _row_number: String(r + 1), // Sesuai baris nomor Excel
      nis,
      nama_lengkap: nama,
      jenis_kelamin: rowVal(idxJK),
      tempat_lahir: rowVal(idxTempat),
      tanggal_lahir: rowVal(idxTgl),
      kelas: rowVal(idxKelas),
      kode_kelas: rowVal(idxKodeKelas),
      kamar: rowVal(idxKamar),
      nama_wali: rowVal(idxNamaWali),
      hubungan_wali: rowVal(idxHubungan),
      no_telepon_wali: rowVal(idxTelp),
      email_kontak: rowVal(idxEmail),
      alamat: rowVal(idxAlamat),
    });
  }

  return resultRows;
}

/**
 * Validasi mendalam untuk seluruh baris data import santri
 */
export function validateSantriImportRows(
  rawRows: Record<string, string>[],
  kelasList: Kelas[],
  kamarList: Kamar[],
  existingNisSet: Set<string>,
  existingUsernameSet: Set<string>
): ImportValidationSummary {
  const errors: ImportRowError[] = [];
  const validRows: ImportSantriRow[] = [];

  const seenNisInFile = new Map<string, number>();
  const duplicateNisInFileSet = new Set<string>();
  const alreadyRegisteredNisSet = new Set<string>();
  const kelasNotFoundSet = new Set<string>();
  const kamarNotFoundSet = new Set<string>();
  let emptyRequiredCount = 0;

  rawRows.forEach((r, idx) => {
    const rowNumber = Number(r._row_number || r.row_number || idx + 2);
    const nis = (r.nis || r["NIS"] || "").trim();
    const nama = (r.nama_lengkap || r["Nama Lengkap Santri"] || r.nama || "").trim();
    const jkRaw = (r.jenis_kelamin || r["Jenis Kelamin"] || "").toUpperCase().trim();
    const tempat = (r.tempat_lahir || r["Tempat Lahir"] || "").trim();
    const tglRaw = (r.tanggal_lahir || r["Tanggal Lahir"] || "").trim();
    const kelasStr = (r.kelas || r["Kelas"] || "").trim();
    const kodeKelas = (r.kode_kelas || r["Kode Kelas"] || "").trim().toUpperCase();
    const kamarStr = (r.kamar || r["Kamar Asrama"] || r.kamar_asrama || "").trim();
    const namaWali = (r.nama_wali || r["Nama Orang Tua/Wali"] || r.nama_orang_tua_wali || "").trim();
    const hubunganRaw = (r.hubungan_wali || r["Hubungan Wali"] || "").trim();
    const telp = (r.no_telepon_wali || r["Nomor Telepon Wali"] || r.telepon_wali || "").trim();
    const email = (r.email_kontak || r["Email Kontak (Opsional)"] || r.email || "").trim();
    const alamat = (r.alamat || r["Alamat"] || "").trim();

    let hasError = false;

    // 1. Validasi NIS
    if (!nis) {
      errors.push({
        row_number: rowNumber,
        column: "NIS",
        reason: "NIS santri wajib diisi.",
      });
      emptyRequiredCount++;
      hasError = true;
    } else if (nis.length < 3 || nis.length > 30) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "NIS",
        reason: `Panjang NIS '${nis}' harus antara 3–30 karakter.`,
      });
      hasError = true;
    } else {
      // Cek duplikat dalam file
      if (seenNisInFile.has(nis)) {
        duplicateNisInFileSet.add(nis);
        errors.push({
          row_number: rowNumber,
          nis,
          column: "NIS",
          reason: `NIS '${nis}' duplikat di dalam file Excel (pertama kali muncul di baris ${seenNisInFile.get(
            nis
          )}).`,
        });
        hasError = true;
      } else {
        seenNisInFile.set(nis, rowNumber);
      }

      // Cek sudah terdaftar di database
      if (existingNisSet.has(nis)) {
        alreadyRegisteredNisSet.add(nis);
        errors.push({
          row_number: rowNumber,
          nis,
          column: "NIS",
          reason: `NIS '${nis}' sudah terdaftar dalam sistem database pesantren.`,
        });
        hasError = true;
      }

      // Cek apakah username (yang menggunakan NIS) sudah dipakai akun lain
      if (existingUsernameSet.has(nis.toLowerCase())) {
        errors.push({
          row_number: rowNumber,
          nis,
          column: "NIS",
          reason: `Username '@${nis}' sudah digunakan oleh pengguna lain.`,
        });
        hasError = true;
      }
    }

    // 2. Validasi Nama Santri
    if (!nama || nama.length < 3) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Nama Lengkap Santri",
        reason: "Nama santri wajib diisi (minimal 3 karakter).",
      });
      emptyRequiredCount++;
      hasError = true;
    }

    // 3. Validasi Jenis Kelamin (L atau P)
    let jk: "L" | "P" = "L";
    if (jkRaw === "L" || jkRaw === "LAKI-LAKI" || jkRaw === "PUTRA") {
      jk = "L";
    } else if (jkRaw === "P" || jkRaw === "PEREMPUAN" || jkRaw === "PUTRI") {
      jk = "P";
    } else {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Jenis Kelamin",
        reason: `Jenis kelamin '${r.jenis_kelamin}' tidak valid. Gunakan 'L' atau 'P'.`,
      });
      hasError = true;
    }

    // 4. Validasi Tempat Lahir
    if (!tempat) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Tempat Lahir",
        reason: "Tempat lahir santri wajib diisi.",
      });
      emptyRequiredCount++;
      hasError = true;
    }

    // 5. Validasi Tanggal Lahir (YYYY-MM-DD)
    let normalizedTgl = tglRaw;
    if (tglRaw.includes("/")) {
      // Format DD/MM/YYYY
      const parts = tglRaw.split("/");
      if (parts.length === 3 && parts[2]?.length === 4) {
        normalizedTgl = `${parts[2]}-${parts[1]?.padStart(2, "0")}-${parts[0]?.padStart(2, "0")}`;
      }
    }

    if (!normalizedTgl || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedTgl)) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Tanggal Lahir",
        reason: `Format tanggal lahir '${tglRaw}' tidak valid. Gunakan format YYYY-MM-DD (contoh: 2013-05-12).`,
      });
      hasError = true;
    }

    // 6. Validasi Kelas (Cocokkan dengan Master Kelas)
    const matchedKelas = kelasList.find(
      (k) =>
        (kodeKelas && k.kode_kelas.toUpperCase() === kodeKelas) ||
        (kelasStr && k.kode_kelas.toUpperCase() === kelasStr.toUpperCase()) ||
        (kelasStr && k.nama_kelas.toLowerCase().includes(kelasStr.toLowerCase())) ||
        (k.id.toLowerCase() === kodeKelas.toLowerCase()) ||
        (k.id.toLowerCase() === kelasStr.toLowerCase())
    );

    if (!matchedKelas) {
      kelasNotFoundSet.add(kodeKelas || kelasStr || "Kosong");
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Kelas / Kode Kelas",
        reason: `Kelas '${kodeKelas || kelasStr}' tidak ditemukan dalam Master Data Kelas.`,
      });
      hasError = true;
    }

    // 7. Validasi Kamar (Cocokkan dengan Master Kamar)
    const matchedKamar = kamarList.find(
      (km) =>
        (kamarStr && km.kode_kamar.toLowerCase() === kamarStr.toLowerCase()) ||
        (kamarStr && km.nama_kamar.toLowerCase().includes(kamarStr.toLowerCase())) ||
        (km.id.toLowerCase() === kamarStr.toLowerCase())
    );

    if (!matchedKamar) {
      kamarNotFoundSet.add(kamarStr || "Kosong");
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Kamar Asrama",
        reason: `Kamar '${kamarStr}' tidak ditemukan dalam Master Data Kamar Asrama.`,
      });
      hasError = true;
    }

    // 8. Validasi Nama Wali
    if (!namaWali || namaWali.length < 3) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Nama Orang Tua/Wali",
        reason: "Nama orang tua/wali wajib diisi (minimal 3 karakter).",
      });
      emptyRequiredCount++;
      hasError = true;
    }

    // 9. Validasi Hubungan Wali
    let hubungan: "Ayah" | "Ibu" | "Wali" = "Ayah";
    const hNorm = hubunganRaw.toLowerCase();
    if (hNorm.includes("ayah") || hNorm.includes("bapak")) {
      hubungan = "Ayah";
    } else if (hNorm.includes("ibu") || hNorm.includes("mama") || hNorm.includes("umi")) {
      hubungan = "Ibu";
    } else if (hNorm.includes("wali")) {
      hubungan = "Wali";
    } else {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Hubungan Wali",
        reason: `Hubungan wali '${hubunganRaw}' tidak valid. Gunakan 'Ayah', 'Ibu', atau 'Wali'.`,
      });
      hasError = true;
    }

    // 10. Validasi Telepon Wali
    if (!telp || telp.length < 8) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Nomor Telepon Wali",
        reason: "Nomor telepon wali wajib diisi minimal 8 digit.",
      });
      emptyRequiredCount++;
      hasError = true;
    }

    // 11. Validasi Alamat
    if (!alamat || alamat.length < 5) {
      errors.push({
        row_number: rowNumber,
        nis,
        column: "Alamat",
        reason: "Alamat santri wajib diisi (minimal 5 karakter).",
      });
      emptyRequiredCount++;
      hasError = true;
    }

    // Jika baris valid, masukkan ke daftar validRows
    if (!hasError && matchedKelas && matchedKamar) {
      validRows.push({
        row_number: rowNumber,
        nis,
        nama_lengkap: nama,
        jenis_kelamin: jk,
        tempat_lahir: tempat,
        tanggal_lahir: normalizedTgl,
        kelas: matchedKelas.nama_kelas,
        kode_kelas: matchedKelas.kode_kelas,
        kamar: matchedKamar.nama_kamar,
        nama_wali: namaWali,
        hubungan_wali: hubungan,
        no_telepon_wali: telp,
        email_kontak: email || undefined,
        alamat,
      });
    }
  });

  return {
    total_rows: rawRows.length,
    valid_count: validRows.length,
    error_count: errors.length,
    duplicate_nis_in_file: Array.from(duplicateNisInFileSet),
    already_registered_nis: Array.from(alreadyRegisteredNisSet),
    kelas_not_found: Array.from(kelasNotFoundSet),
    kamar_not_found: Array.from(kamarNotFoundSet),
    empty_required_fields: emptyRequiredCount,
    errors,
    valid_rows: validRows,
  };
}

/**
 * Download file Laporan Hasil Import (.xlsx)
 */
export function downloadImportReportExcel(report: ImportBatchReport): void {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryAoa = [
    ["LAPORAN HASIL IMPORT DATA SANTRI & OTOMATISASI AKUN WALI"],
    ["Pondok Pesantren Modern Abu Manshur — SIPETA"],
    [""],
    ["Waktu Eksekusi", report.imported_at],
    ["Total Data Diproses", report.total_processed],
    ["Berhasil Dibuat", report.success_count],
    ["Gagal Diproses", report.failed_count],
    ["Akun Wali Berhasil Dibuat", report.wali_account_created_count],
    ["Kebijakan Password Wali", "Password awal = NIS (Wajib ganti password pada login pertama)"],
    [""],
    ["RINCIAN STATUS PER BARIS DATA"],
    ["No. Baris Excel", "NIS", "Nama Lengkap Santri", "Status", "Keterangan / Alasan"],
    ...report.results.map((r) => [
      r.row_number,
      r.nis,
      r.nama_lengkap,
      r.status === "SUCCESS" ? "BERHASIL" : "GAGAL",
      r.reason || (r.status === "SUCCESS" ? `Santri & Akun Wali @${r.nis} berhasil dibuat.` : ""),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(summaryAoa);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 45 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Hasil Import");
  const filename = `Laporan_Import_Santri_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
}
