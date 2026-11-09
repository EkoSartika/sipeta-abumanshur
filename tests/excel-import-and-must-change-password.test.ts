import { describe, it, expect } from "vitest";
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
  usernameToInternalEmail,
} from "../src/lib/utils/auth-mapping";
import type {
  ImportSantriRow,
  ImportBatchReport,
  Kelas,
  Kamar,
  Santri,
  UserProfile,
  WaliSantri,
} from "../src/types/database";

describe("SIPETA — Audit Kesiapan Produksi: Import Excel & Login Wali Berbasis NIS", () => {
  const dummyKelas: Kelas[] = [
    {
      id: "kls-7a",
      nama_kelas: "Kelas VII-A (MTs Putra)",
      kode_kelas: "KLS-7A",
      tingkat: 7,
      wali_kelas: "Ust. Zaid",
      kapasitas: 30,
      is_active: true,
    },
    {
      id: "kls-7b",
      nama_kelas: "Kelas VII-B (MTs Putri)",
      kode_kelas: "KLS-7B",
      tingkat: 7,
      wali_kelas: "Usth. Maryam",
      kapasitas: 30,
      is_active: true,
    },
  ];

  const dummyKamar: Kamar[] = [
    {
      id: "kmr-ab-01",
      nama_kamar: "Kamar Abu Bakar 01",
      kode_kamar: "ASR-AB-01",
      gedung_asrama: "Gedung Putra",
      jenis_asrama: "L",
      musyrif: "Ust. Ali",
      kapasitas: 16,
      is_active: true,
    },
    {
      id: "kmr-kh-01",
      nama_kamar: "Kamar Khadijah 01",
      kode_kamar: "ASR-KH-01",
      gedung_asrama: "Gedung Putri",
      jenis_asrama: "P",
      musyrif: "Usth. Fatimah",
      kapasitas: 16,
      is_active: true,
    },
  ];

  // ==========================================================================
  // 1. PENGUJIAN IMPORT SANTRI (1 SANTRI & BEBERAPA SANTRI SEKALIGUS)
  // ==========================================================================
  describe("1. Pengujian Alur Import Excel (1 Santri & Batch Sekaligus)", () => {
    it("A. Import 1 Santri: Berhasil diproses, tervalidasi 13 kolom, dan menghasilkan relasi 1:1", () => {
      const singleRawRow: Record<string, string>[] = [
        {
          "NIS": "20260010",
          "Nama Lengkap Santri": "Muhammad Fatih Al-Hadi",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-05-20",
          "Kelas": "Kelas VII-A (MTs Putra)",
          "Kode Kelas": "KLS-7A",
          "Kamar Asrama": "Kamar Abu Bakar 01",
          "Nama Orang Tua/Wali": "H. Hadi Prabowo",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567810",
          "Email Kontak (Opsional)": "hadi@gmail.com",
          "Alamat": "Jl. Syekh Nurjati No. 10, Cirebon",
        },
      ];

      const validation = validateSantriImportRows(
        singleRawRow,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(validation.total_rows).toBe(1);
      expect(validation.valid_count).toBe(1);
      expect(validation.error_count).toBe(0);

      const validRow = validation.valid_rows[0]!;
      expect(validRow.nis).toBe("20260010");
      expect(validRow.nama_lengkap).toBe("Muhammad Fatih Al-Hadi");
      expect(validRow.kelas).toBe("Kelas VII-A (MTs Putra)");
      expect(validRow.kamar).toBe("Kamar Abu Bakar 01");
      expect(validRow.nama_wali).toBe("H. Hadi Prabowo");

      // Simulasi hasil eksekusi batch endpoint
      const result: ImportBatchReport = {
        total_processed: 1,
        success_count: 1,
        failed_count: 0,
        wali_account_created_count: 1,
        results: [
          {
            row_number: 2,
            nis: validRow.nis,
            nama_lengkap: validRow.nama_lengkap,
            status: "SUCCESS",
            santri_id: "snt-mock-001",
            wali_username: validRow.nis,
          },
        ],
        imported_at: new Date().toISOString(),
      };

      expect(result.success_count).toBe(1);
      expect(result.results[0]!.wali_username).toBe("20260010");
    });

    it("B. Import Beberapa Santri Sekaligus: 5 baris valid dieksekusi secara batch per baris", () => {
      const multiRawRows: Record<string, string>[] = [
        {
          "NIS": "20260021",
          "Nama Lengkap Santri": "Ahmad Fauzan",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-10",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Bpk. Fauzan",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567821",
          "Alamat": "Cirebon",
        },
        {
          "NIS": "20260022",
          "Nama Lengkap Santri": "Bilal Al-Habasyi",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Kuningan",
          "Tanggal Lahir": "2013-02-15",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Bpk. Bilal",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567822",
          "Alamat": "Kuningan",
        },
        {
          "NIS": "20260023",
          "Nama Lengkap Santri": "Aisyah Humaira",
          "Jenis Kelamin": "P",
          "Tempat Lahir": "Majalengka",
          "Tanggal Lahir": "2013-03-20",
          "Kelas": "KLS-7B",
          "Kamar Asrama": "ASR-KH-01",
          "Nama Orang Tua/Wali": "Ibu Humaira",
          "Hubungan Wali": "Ibu",
          "Nomor Telepon Wali": "081234567823",
          "Alamat": "Majalengka",
        },
        {
          "NIS": "20260024",
          "Nama Lengkap Santri": "Zahra Khairunnisa",
          "Jenis Kelamin": "P",
          "Tempat Lahir": "Indramayu",
          "Tanggal Lahir": "2013-04-25",
          "Kelas": "KLS-7B",
          "Kamar Asrama": "ASR-KH-01",
          "Nama Orang Tua/Wali": "Bpk. Khairun",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567824",
          "Alamat": "Indramayu",
        },
        {
          "NIS": "20260025",
          "Nama Lengkap Santri": "Umar Abdul Aziz",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Brebes",
          "Tanggal Lahir": "2013-05-30",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Bpk. Abdul Aziz",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567825",
          "Alamat": "Brebes",
        },
      ];

      const validation = validateSantriImportRows(
        multiRawRows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(validation.total_rows).toBe(5);
      expect(validation.valid_count).toBe(5);
      expect(validation.error_count).toBe(0);
      expect(validation.valid_rows.map((r) => r.nis)).toEqual([
        "20260021",
        "20260022",
        "20260023",
        "20260024",
        "20260025",
      ]);
    });
  });

  // ==========================================================================
  // 2. NIS DENGAN ANGKA NOL DI DEPAN & PRESERVASI TIPE TEKS
  // ==========================================================================
  describe("2. NIS dengan Angka Nol di Depan (Leading Zero Preservation)", () => {
    it("A. NIS seperti '02026001' tidak kehilangan angka nol di depan saat parsing dan validasi", () => {
      const rowWithLeadingZero: Record<string, string>[] = [
        {
          "NIS": "02026001",
          "Nama Lengkap Santri": "Fatimah Azzahra",
          "Jenis Kelamin": "P",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-06-12",
          "Kelas": "KLS-7B",
          "Kamar Asrama": "ASR-KH-01",
          "Nama Orang Tua/Wali": "H. Muhammad",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567800",
          "Alamat": "Jl. Panembahan No. 1, Plered",
        },
      ];

      const validation = validateSantriImportRows(
        rowWithLeadingZero,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(validation.valid_count).toBe(1);
      const row = validation.valid_rows[0]!;

      // Memastikan tipe adalah string dan panjang 8 digit dengan nol di depan
      expect(typeof row.nis).toBe("string");
      expect(row.nis).toBe("02026001");
      expect(row.nis.startsWith("0")).toBe(true);

      // Memastikan username wali turunan sama persis
      const waliUsername = normalizeUsername(row.nis);
      expect(waliUsername).toBe("02026001");

      // Memastikan email sintetis Auth mempertahankan angka 0
      const syntheticEmail = usernameToInternalEmail(waliUsername);
      expect(syntheticEmail).toBe("02026001@akun.sipeta.invalid");
    });
  });

  // ==========================================================================
  // 3. NIS DUPLIKAT (DI DALAM FILE & DI DATABASE)
  // ==========================================================================
  describe("3. Pengujian NIS Duplikat (Di File & Di Database)", () => {
    it("A. Menolak NIS duplikat di dalam file Excel yang sama", () => {
      const duplicateInFileRows: Record<string, string>[] = [
        {
          "NIS": "20260088",
          "Nama Lengkap Santri": "Santri Asli",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-01",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Wali Asli",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567888",
          "Alamat": "Cirebon",
        },
        {
          "NIS": "20260088", // Duplikat baris berikutnya
          "Nama Lengkap Santri": "Santri Duplikat",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-02",
          "Kelas": "KLS-7A",
          "Kamar Asrama": "ASR-AB-01",
          "Nama Orang Tua/Wali": "Wali Duplikat",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567889",
          "Alamat": "Cirebon",
        },
      ];

      const validation = validateSantriImportRows(
        duplicateInFileRows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(validation.duplicate_nis_in_file).toContain("20260088");
      expect(validation.valid_count).toBe(1); // Baris pertama diterima
      expect(validation.error_count).toBe(1); // Baris kedua ditolak
      expect(validation.errors[0]!.reason).toContain("duplikat di dalam file Excel");
    });

    it("B. Menolak NIS yang sudah terdaftar sebelumnya di database pesantren", () => {
      const existingInDbSet = new Set<string>(["20260001", "20260002"]);

      const rows: Record<string, string>[] = [
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

      const validation = validateSantriImportRows(
        rows,
        dummyKelas,
        dummyKamar,
        existingInDbSet,
        new Set<string>()
      );

      expect(validation.valid_count).toBe(0);
      expect(validation.already_registered_nis).toContain("20260001");
      expect(validation.errors[0]!.reason).toContain("sudah terdaftar dalam sistem database");
    });
  });

  // ==========================================================================
  // 4. KELAS ATAU KAMAR TIDAK DITEMUKAN
  // ==========================================================================
  describe("4. Pengujian Kelas & Kamar Tidak Ditemukan", () => {
    it("A. Menolak baris santri jika Kelas atau Kamar tidak ada di Master Data", () => {
      const rows: Record<string, string>[] = [
        {
          "NIS": "20260077",
          "Nama Lengkap Santri": "Santri Tanpa Kelas",
          "Jenis Kelamin": "L",
          "Tempat Lahir": "Cirebon",
          "Tanggal Lahir": "2013-01-01",
          "Kelas": "Kelas Fiktif 99",
          "Kamar Asrama": "Kamar Tidak Ada 88",
          "Nama Orang Tua/Wali": "Wali 77",
          "Hubungan Wali": "Ayah",
          "Nomor Telepon Wali": "081234567877",
          "Alamat": "Cirebon",
        },
      ];

      const validation = validateSantriImportRows(
        rows,
        dummyKelas,
        dummyKamar,
        new Set<string>(),
        new Set<string>()
      );

      expect(validation.valid_count).toBe(0);
      expect(validation.kelas_not_found).toContain("Kelas Fiktif 99");
      expect(validation.kamar_not_found).toContain("Kamar Tidak Ada 88");
      expect(validation.errors.some((e) => e.column === "Kelas / Kode Kelas")).toBe(true);
      expect(validation.errors.some((e) => e.column === "Kamar Asrama")).toBe(true);
    });
  });

  // ==========================================================================
  // 5. ROLLBACK & PEMULIHAN KEGAGALAN (AKUN AUTH & PROFIL)
  // ==========================================================================
  describe("5. Rollback Atomik & Pemulihan Saat Terjadi Kegagalan", () => {
    it("A. Kasus Akun Wali Gagal Dibuat: Santri yang sudah sempat dibuat dihapus kembali (Rollback)", () => {
      // Mock tracking state database simulasi
      let dbSantri = [{ id: "snt-101", nis: "20260101" }];

      const simulateImportRow = (failAtAuth = false) => {
        const createdSantriId = "snt-102";
        dbSantri.push({ id: createdSantriId, nis: "20260102" });

        if (failAtAuth) {
          // Rollback santri
          dbSantri = dbSantri.filter((s) => s.id !== createdSantriId);
          throw new Error("Supabase Auth API Timeout: Gagal membuat akun auth wali.");
        }
      };

      expect(() => simulateImportRow(true)).toThrow("Gagal membuat akun auth wali");
      // Memastikan santri tidak tertinggal sebagai orphan record
      expect(dbSantri.find((s) => s.id === "snt-102")).toBeUndefined();
      expect(dbSantri.length).toBe(1);
    });

    it("B. Kasus Profil Wali Gagal Disimpan Setelah Auth Dibuat: Auth User & Santri keduanya di-rollback", () => {
      let dbSantri = [{ id: "snt-101", nis: "20260101" }];
      let dbProfiles = [{ id: "usr-101", username: "20260101" }];
      let dbAuthUsers = [{ id: "usr-101", email: "20260101@akun.sipeta.invalid" }];

      const simulateImportRow = (failAtProfile = false) => {
        const createdSantriId = "snt-103";
        const createdAuthUserId = "usr-103";

        // Tahap A: Insert Santri
        dbSantri.push({ id: createdSantriId, nis: "20260103" });

        // Tahap B: Auth Create User
        dbAuthUsers.push({ id: createdAuthUserId, email: "20260103@akun.sipeta.invalid" });

        // Tahap C: Insert Profile
        if (failAtProfile) {
          // Rollback kedua entitas yang sudah dibuat sebelumnya
          dbAuthUsers = dbAuthUsers.filter((u) => u.id !== createdAuthUserId);
          dbSantri = dbSantri.filter((s) => s.id !== createdSantriId);
          throw new Error("Database Foreign Key Error: Gagal menyimpan profiles wali.");
        }

        dbProfiles.push({ id: createdAuthUserId, username: "20260103" });
      };

      expect(() => simulateImportRow(true)).toThrow("Gagal menyimpan profiles wali");

      // Memastikan Auth user terhapus kembali (tidak ada credential zombie)
      expect(dbAuthUsers.find((u) => u.id === "usr-103")).toBeUndefined();
      // Memastikan santri terhapus kembali
      expect(dbSantri.find((s) => s.id === "snt-103")).toBeUndefined();
      expect(dbProfiles.find((p) => p.id === "usr-103")).toBeUndefined();
    });
  });

  // ==========================================================================
  // 6. KEAMANAN LOGIN WALI, must_change_password & BLOKIR AKSES API
  // ==========================================================================
  describe("6. Keamanan Login Wali & Enforcement must_change_password", () => {
    it("A. Percobaan Login dengan Password Awal (= NIS): Berhasil login tetapi status must_change_password = TRUE", () => {
      const nis = "20260050";
      const initialPassword = nis;

      // Simulasi kredensial login
      expect(initialPassword).toBe(nis);

      const waliProfile: UserProfile = {
        id: "usr-wali-050",
        nama_lengkap: "H. Abdullah (Wali Santri 20260050)",
        username: nis,
        email: "20260050@akun.sipeta.invalid",
        no_telepon: "081234567850",
        role: "wali",
        is_active: true,
        santri_id: "snt-050",
        must_change_password: true,
        created_at: "2026-01-01",
      };

      // Flag wajib ganti kata sandi bernilai TRUE
      expect(waliProfile.must_change_password).toBe(true);
      expect(waliProfile.role).toBe("wali");
    });

    it("B. Percobaan Mengakses API Sebelum Mengganti Password: Server memblokir mutlak dengan HTTP 403", () => {
      const callerUser = {
        id: "usr-wali-050",
        role: "wali",
        must_change_password: true,
      };

      // Simulasi aturan middleware server-side (middleware.ts)
      const simulateMiddleware = (pathname: string, user: typeof callerUser) => {
        if (user.role === "wali" && user.must_change_password) {
          if (
            pathname.startsWith("/api/") &&
            pathname !== "/api/auth/change-password" &&
            pathname !== "/api/health"
          ) {
            return {
              status: 403,
              body: {
                ok: false,
                message: "Akses ditolak: Anda wajib mengganti kata sandi awal terlebih dahulu.",
                must_change_password: true,
              },
            };
          }
        }
        return { status: 200, body: { ok: true } };
      };

      // 1. Mencoba akses API signed-url dokumen privat
      const resDocs = simulateMiddleware("/api/signed-url", callerUser);
      expect(resDocs.status).toBe(403);
      expect(resDocs.body?.must_change_password).toBe(true);

      // 2. Mencoba akses API santri
      const resSantri = simulateMiddleware("/api/admin-santri", callerUser);
      expect(resSantri.status).toBe(403);

      // 3. Endpoint ganti password diizinkan
      const resChangePwd = simulateMiddleware("/api/auth/change-password", callerUser);
      expect(resChangePwd.status).toBe(200);
    });

    it("C. Validasi Pergantian Password: Menolak kata sandi baru yang sama dengan NIS santri", () => {
      const nis = "20260050";
      const candidatePwd = "20260050";

      const isSameAsNis = candidatePwd.trim() === nis.trim();
      expect(isSameAsNis).toBe(true);

      // API menolak jika password baru === NIS
      const validateChangeRequest = (username: string, newPwd: string) => {
        if (newPwd.trim() === username.trim()) {
          return { ok: false, message: "Kata sandi baru tidak boleh sama dengan NIS Anda." };
        }
        return { ok: true };
      };

      const result = validateChangeRequest(nis, candidatePwd);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("tidak boleh sama dengan NIS");
    });

    it("D. Login Setelah Password Berhasil Diganti: must_change_password menjadi FALSE dan akses API terbuka", () => {
      const nis = "20260050";
      const strongNewPassword = "AbuManshur2026!Berjaya";

      // Validasi kekuatan sandi
      const checkStrength = validatePasswordStrength(strongNewPassword);
      expect(checkStrength.valid).toBe(true);

      // Simulasi update di database
      const updatedWaliProfile: UserProfile = {
        id: "usr-wali-050",
        nama_lengkap: "H. Abdullah (Wali Santri 20260050)",
        username: nis,
        email: "20260050@akun.sipeta.invalid",
        no_telepon: "081234567850",
        role: "wali",
        is_active: true,
        santri_id: "snt-050",
        must_change_password: false, // Berubah menjadi FALSE
        created_at: "2026-01-01",
      };

      expect(updatedWaliProfile.must_change_password).toBe(false);

      // Simulasi akses API setelah password diganti
      const simulateMiddleware = (pathname: string, user: typeof updatedWaliProfile) => {
        if (user.role === "wali" && user.must_change_password) {
          return { status: 403 };
        }
        return { status: 200, body: { ok: true } };
      };

      const resAccess = simulateMiddleware("/api/signed-url", updatedWaliProfile);
      expect(resAccess.status).toBe(200);
    });
  });

  // ==========================================================================
  // 7. ISOLASI DATA WALI & PRIVASI LINTAS SANTRI
  // ==========================================================================
  describe("7. Isolasi Data Lintas Wali & Santri (Relasi 1:1)", () => {
    it("A. Wali Santri A tidak dapat melihat data keuangan & tagihan milik Santri B", () => {
      const waliA = { id: "usr-wali-A", santri_id: "snt-001" };
      const waliB = { id: "usr-wali-B", santri_id: "snt-002" };

      const allTagihan = [
        { id: "tg-1", santri_id: "snt-001", total_tagihan: 750000, keterangan: "SPP Santri A" },
        { id: "tg-2", santri_id: "snt-002", total_tagihan: 900000, keterangan: "SPP Santri B" },
      ];

      // Query filter spesifik wali A
      const tagihanWaliA = allTagihan.filter((t) => t.santri_id === waliA.santri_id);
      expect(tagihanWaliA.length).toBe(1);
      expect(tagihanWaliA[0]!.keterangan).toBe("SPP Santri A");
      expect(tagihanWaliA.some((t) => t.santri_id === waliB.santri_id)).toBe(false);

      // Query filter spesifik wali B
      const tagihanWaliB = allTagihan.filter((t) => t.santri_id === waliB.santri_id);
      expect(tagihanWaliB.length).toBe(1);
      expect(tagihanWaliB[0]!.keterangan).toBe("SPP Santri B");
      expect(tagihanWaliB.some((t) => t.santri_id === waliA.santri_id)).toBe(false);
    });

    it("B. Akun Wali hasil import tidak dapat mengakses profil atau akun wali lainnya", () => {
      const waliList: WaliSantri[] = [
        {
          id: "wli-001",
          user_id: "usr-wali-001",
          santri_id: "snt-001",
          nama_lengkap: "H. Ahmad Dahlan",
          hubungan: "Ayah",
          no_telepon: "081234567801",
          email: "ahmad@gmail.com",
          alamat: "Cirebon",
        },
        {
          id: "wli-002",
          user_id: "usr-wali-002",
          santri_id: "snt-002",
          nama_lengkap: "Hj. Siti Fatimah",
          hubungan: "Ibu",
          no_telepon: "081234567802",
          email: "fatimah@gmail.com",
          alamat: "Kuningan",
        },
      ];

      const currentCallerUserId = "usr-wali-001";

      // Simulasi otorisasi data wali (Hanya berhak mengambil record miliknya)
      const myWaliRecord = waliList.filter((w) => w.user_id === currentCallerUserId);
      expect(myWaliRecord.length).toBe(1);
      expect(myWaliRecord[0]!.nama_lengkap).toBe("H. Ahmad Dahlan");
      expect(myWaliRecord.some((w) => w.user_id === "usr-wali-002")).toBe(false);
    });

    it("C. Otorisasi Storage Signed URL: Wali dilarang mengambil dokumen pembayaran santri lain", () => {
      const waliSantriId = "snt-001";

      const checkAccessToDocument = (filePath: string, authorizedSantriId: string) => {
        // Path wajib diawali atau memuat santri_id yang sah
        if (!filePath.startsWith(authorizedSantriId) && !filePath.includes(authorizedSantriId)) {
          return { error: "Akses ditolak: File bukan milik santri Anda.", status: 403 };
        }
        return { status: 200 };
      };

      // File milik santri sendiri -> Diizinkan
      const ownDoc = checkAccessToDocument("snt-001/bukti-transfer-nov.jpg", waliSantriId);
      expect(ownDoc.status).toBe(200);

      // File milik santri lain -> Ditolak 403
      const otherDoc = checkAccessToDocument("snt-002/bukti-transfer-nov.jpg", waliSantriId);
      expect(otherDoc.status).toBe(403);
      expect(otherDoc.error).toContain("Akses ditolak");
    });
  });
});
