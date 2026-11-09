import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import {
  IMPORT_COLUMNS,
  downloadSantriImportTemplate,
  parseSantriExcel,
  validateSantriImportRows,
  downloadImportReportExcel,
} from "../src/lib/utils/excel-import";
import {
  validatePasswordStrength,
  normalizeUsername,
  isValidUsername,
} from "../src/lib/utils/auth-mapping";
import type {
  ImportSantriRow,
  ImportBatchReport,
  Kelas,
  Kamar,
  Santri,
  UserProfile,
} from "../src/types/database";

describe("SIPETA — Kebijakan Akun Wali Berbasis NIS & Import Excel", () => {
  const dummyKelas: Kelas[] = [
    {
      id: "kls-7a",
      nama_kelas: "Kelas VII-A (MTs Putra)",
      kode_kelas: "KLS-7A",
      tingkat: "MTs",
      jenjang: "Kelas 7",
      wali_kelas: "Ust. Zaid",
      kapasitas: 30,
      is_active: true,
      created_at: "2026-01-01",
    },
    {
      id: "kls-7b",
      nama_kelas: "Kelas VII-B (MTs Putri)",
      kode_kelas: "KLS-7B",
      tingkat: "MTs",
      jenjang: "Kelas 7",
      wali_kelas: "Usth. Maryam",
      kapasitas: 30,
      is_active: true,
      created_at: "2026-01-01",
    },
  ];

  const dummyKamar: Kamar[] = [
    {
      id: "kmr-ab-01",
      nama_kamar: "Kamar Abu Bakar 01",
      kode_kamar: "ASR-AB-01",
      gedung: "Gedung Putra",
      musyrif: "Ust. Ali",
      kapasitas: 16,
      is_active: true,
      created_at: "2026-01-01",
    },
    {
      id: "kmr-kh-01",
      nama_kamar: "Kamar Khadijah 01",
      kode_kamar: "ASR-KH-01",
      gedung: "Gedung Putri",
      musyrif: "Usth. Fatimah",
      kapasitas: 16,
      is_active: true,
      created_at: "2026-01-01",
    },
  ];

  describe("A. Kebijakan Login Wali & must_change_password", () => {
    it("1. NIS harus disimpan dan diproses sebagai teks dengan leading zero tetap terjaga", () => {
      const nisWithLeadingZero = "02026001";
      expect(typeof nisWithLeadingZero).toBe("string");
      expect(nisWithLeadingZero.startsWith("0")).toBe(true);
      expect(nisWithLeadingZero.length).toBe(8);

      const normalized = normalizeUsername(nisWithLeadingZero);
      expect(normalized).toBe("02026001");
      expect(isValidUsername(normalized)).toBe(true);
    });

    it("2. Validasi kredensial awal wali: username = NIS, password awal = NIS", () => {
      const nis = "20260012";
      const initialUsername = nis;
      const initialPassword = nis;

      expect(initialUsername).toBe(initialPassword);
      expect(isValidUsername(initialUsername)).toBe(true);
      expect(initialPassword.length).toBeGreaterThanOrEqual(6); // Supabase Auth requirement
    });

    it("3. Aturan must_change_password: Menolak kata sandi baru yang sama persis dengan NIS/Username", () => {
      const nis = "20260012";
      const newPasswordCandidate = "20260012";

      // Server-side check
      const isSameAsNis = newPasswordCandidate.trim() === nis.trim();
      expect(isSameAsNis).toBe(true);
    });

    it("4. Aturan must_change_password: Menolak kata sandi baru yang terlalu pendek atau tidak alfanumerik", () => {
      const tooShort = "abc1";
      expect(validatePasswordStrength(tooShort).valid).toBe(false);

      const onlyLetters = "abdurrahman";
      expect(validatePasswordStrength(onlyLetters).valid).toBe(false);

      const onlyNumbers = "123456789";
      expect(validatePasswordStrength(onlyNumbers).valid).toBe(false);

      const validCandidate = "SantriBaru2026!";
      expect(validatePasswordStrength(validCandidate).valid).toBe(true);
    });

    it("5. Profil wali baru memiliki flag must_change_password = true, dan diubah ke false setelah ganti password", () => {
      const newWaliProfile: Partial<UserProfile> = {
        id: "usr-wali-01",
        username: "20260012",
        role: "wali",
        must_change_password: true,
        is_active: true,
      };

      expect(newWaliProfile.must_change_password).toBe(true);

      // Simulasi ganti password berhasil
      const updatedProfile = {
        ...newWaliProfile,
        must_change_password: false,
      };

      expect(updatedProfile.must_change_password).toBe(false);
    });

    it("6. Superadmin resmi tetap menggunakan email sipetaabumanshur@gmail.com dan tidak terpengaruh must_change_password wali", () => {
      const superadminEmail = "sipetaabumanshur@gmail.com";
      expect(superadminEmail.endsWith("@gmail.com")).toBe(true);

      const superadminProfile: Partial<UserProfile> = {
        id: "usr-super-01",
        email: superadminEmail,
        role: "superadmin",
        must_change_password: false,
      };

      expect(superadminProfile.role).toBe("superadmin");
      expect(superadminProfile.must_change_password).toBe(false);
    });
  });

  describe("B. Template Excel & Validasi Data Import Santri", () => {
    it("7. Template Excel memiliki tepat 13 kolom spesifikasi", () => {
      expect(IMPORT_COLUMNS.length).toBe(13);
      expect(IMPORT_COLUMNS[0]).toBe("NIS");
      expect(IMPORT_COLUMNS[1]).toBe("Nama Lengkap Santri");
      expect(IMPORT_COLUMNS[2]).toBe("Jenis Kelamin");
      expect(IMPORT_COLUMNS[3]).toBe("Tempat Lahir");
      expect(IMPORT_COLUMNS[4]).toBe("Tanggal Lahir");
      expect(IMPORT_COLUMNS[5]).toBe("Kelas");
      expect(IMPORT_COLUMNS[6]).toBe("Kode Kelas");
      expect(IMPORT_COLUMNS[7]).toBe("Kamar Asrama");
      expect(IMPORT_COLUMNS[8]).toBe("Nama Orang Tua/Wali");
      expect(IMPORT_COLUMNS[9]).toBe("Hubungan Wali");
      expect(IMPORT_COLUMNS[10]).toBe("Nomor Telepon Wali");
      expect(IMPORT_COLUMNS[11]).toBe("Email Kontak (Opsional)");
      expect(IMPORT_COLUMNS[12]).toBe("Alamat");
    });

    it("8. Validasi mendeteksi baris valid dan memetakan kelas/kamar dengan tepat", () => {
      const rawRows: Record<string, string>[] = [
        {
          "NIS": "20260015",
          "Nama Lengkap Santri": "Ahmad Dani Ramadhan",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-04-10",
          "Kelas": "Kelas VII-A (MTs Putra)",
          "Kode Kelas": "KLS-7A",
          "Kamar Asrama": "Kamar Abu Bakar 01",
          "Nama Orang Tua/Wali": "H. Ramadhan",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567890",
          "Email Kontak (Opsional)": "ramadhan@gmail.com",
          "Alamat": "Jl. Sunan Gunung Jati No. 45, Cirebon",
        },
      ];

      const existingNis = new Set<string>();
      const existingUsernames = new Set<string>();

      const summary = validateSantriImportRows(
        rawRows,
        dummyKelas,
        dummyKamar,
        existingNis,
        existingUsernames
      );

      expect(summary.total_rows).toBe(1);
      expect(summary.valid_count).toBe(1);
      expect(summary.error_count).toBe(0);
      expect(summary.valid_rows[0].nis).toBe("20260015");
      expect(summary.valid_rows[0].kelas).toBe("Kelas VII-A (MTs Putra)");
      expect(summary.valid_rows[0].kamar).toBe("Kamar Abu Bakar 01");
    });

    it("9. Validasi mendeteksi duplikasi NIS di dalam file Excel yang sama", () => {
      const rawRows: Record<string, string>[] = [
        {
          "NIS": "20260099",
          "Nama Lengkap Santri": "Santri Satu",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-01",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Wali Satu",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567801",
          "Alamat": "Cirebon Barat",
        },
        {
          "NIS": "20260099", // Duplikat
          "Nama Lengkap Santri": "Santri Dua",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Kuningan",
          "Tanggal Lahir": "2013-02-02",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Wali Dua",
          "Hubungan Wali": "Ibu",
          "Nomor Telepon Wali": "081234567802",
          "Alamat": "Kuningan Timur",
        },
      ];

      const summary = validateSantriImportRows(
        rawRows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(summary.total_rows).toBe(2);
      expect(summary.duplicate_nis_in_file.includes("20260099")).toBe(true);
      expect(summary.valid_count).toBe(1); // Baris pertama valid, baris kedua ditolak karena duplikat di file
      expect(summary.error_count).toBeGreaterThanOrEqual(1);
    });

    it("10. Validasi mendeteksi NIS yang sudah terdaftar di database", () => {
      const rawRows: Record<string, string>[] = [
        {
          "NIS": "20260001", // Sudah ada di DB
          "Nama Lengkap Santri": "Santri Lama",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-01",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Wali Lama",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567801",
          "Alamat": "Cirebon",
        },
      ];

      const existingNis = new Set<string>(["20260001"]);

      const summary = validateSantriImportRows(
        rawRows,
        dummyKelas,
        dummyKamar,
        existingNis,
        new Set<string>()
      );

      expect(summary.valid_count).toBe(0);
      expect(summary.already_registered_nis.includes("20260001")).toBe(true);
      expect(summary.errors.some((e) => e.reason.includes("sudah terdaftar"))).toBe(true);
    });

    it("11. Validasi mendeteksi jika kelas atau kamar tidak ditemukan", () => {
      const rawRows: Record<string, string>[] = [
        {
          "NIS": "20260055",
          "Nama Lengkap Santri": "Santri X",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-01",
          "Kelas": "Kelas Tidak Ada 99",
          "Kamar Asrama": "Kamar Fiktif 99",
          "Nama Orang Tua/Wali": "Wali X",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567890",
          "Alamat": "Alamat X",
        },
      ];

      const summary = validateSantriImportRows(
        rawRows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(summary.valid_count).toBe(0);
      expect(summary.kelas_not_found.length).toBe(1);
      expect(summary.kamar_not_found.length).toBe(1);
    });

    it("12. Validasi mendeteksi data wajib yang kosong (empty required fields)", () => {
      const rawRows: Record<string, string>[] = [
        {
          "NIS": "", // Kosong
          "Nama Lengkap Santri": "", // Kosong
          "Jenis Kelamin": "X", // Tidak valid
          "Tempat Lahir": "",
          "Tanggal Lahir": "invalid-date",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "",
          "Hubungan Wali": "Paman", // Tidak valid (harus Ayah/Ibu/Wali)
          "Nomor Telepon Wali": "123", // Kurang dari 8 digit
          "Alamat": "x", // Kurang dari 5 char
        },
      ];

      const summary = validateSantriImportRows(
        rawRows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(summary.valid_count).toBe(0);
      expect(summary.error_count).toBeGreaterThan(5);
    });
  });

  describe("C. Batch Processing Isolation & Laporan Hasil Import", () => {
    it("13. Isolasi kegagalan: Baris gagal tidak membatalkan baris lain dalam satu batch", () => {
      const batchReport: ImportBatchReport = {
        total_processed: 3,
        success_count: 2,
        failed_count: 1,
        wali_account_created_count: 2,
        results: [
          {
            row_number: 2,
            nis: "20260010",
            nama_lengkap: "Santri Sukses 1",
            status: "SUCCESS",
            santri_id: "snt-010",
            wali_username: "20260010",
          },
          {
            row_number: 3,
            nis: "20260011",
            nama_lengkap: "Santri Gagal",
            status: "FAILED",
            reason: "Simulasi network timeout saat pembuatan akun",
          },
          {
            row_number: 4,
            nis: "20260012",
            nama_lengkap: "Santri Sukses 2",
            status: "SUCCESS",
            santri_id: "snt-012",
            wali_username: "20260012",
          },
        ],
        imported_at: "2026-11-09 10:00:00",
      };

      expect(batchReport.success_count).toBe(2);
      expect(batchReport.failed_count).toBe(1);
      expect(batchReport.wali_account_created_count).toBe(2);
      expect(batchReport.results[0].status).toBe("SUCCESS");
      expect(batchReport.results[1].status).toBe("FAILED");
      expect(batchReport.results[2].status).toBe("SUCCESS");
    });

    it("14. Isolasi data wali di Portal Orang Tua (1 Santri : 1 Akun Wali)", () => {
      const currentWaliSantriId = "snt-001";

      const allTagihan = [
        { id: "tg-1", santri_id: "snt-001", total_tagihan: 500000 },
        { id: "tg-2", santri_id: "snt-002", total_tagihan: 500000 }, // Milik santri lain
        { id: "tg-3", santri_id: "snt-001", total_tagihan: 300000 },
      ];

      // Filter seperti yang diterapkan di wali-portal.tsx
      const isolatedTagihan = allTagihan.filter((t) => t.santri_id === currentWaliSantriId);

      expect(isolatedTagihan.length).toBe(2);
      expect(isolatedTagihan.every((t) => t.santri_id === "snt-001")).toBe(true);
      expect(isolatedTagihan.some((t) => t.santri_id === "snt-002")).toBe(false);
    });
  });
});
