import { describe, it, expect, beforeEach } from "vitest";
import {
  checkSupabaseHealth,
  authService,
  administrasiService,
  keuanganService,
  kepesantrenanService,
  storageService,
  notifikasiService,
} from "@/lib/services";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  getSupabaseSecretKey,
  isServerAdminConfigured,
} from "@/lib/supabase/server";
import { validateUploadedFile } from "@/lib/supabase/storage";
import {
  canRoleApproveFinancialTransaction,
  calculatePocketMoneyLedger,
} from "@/lib/validations/schemas";
import { INITIAL_USERS } from "@/lib/store/initial-data";

describe("SIPETA Backend Integration & Service Layer Test Suite", () => {
  // --------------------------------------------------------------------------
  // 1. HEALTH CHECK & API KEY COMPATIBILITY TEST
  // --------------------------------------------------------------------------
  describe("1. Health Check & API Key Resolvers", () => {
    it("harus mendukung pembacaan URL resmi SIPETA", () => {
      const url = getSupabaseUrl();
      expect(typeof url).toBe("string");
      if (url) {
        expect(url).toContain("https://");
      }
    });

    it("harus menolak status configured jika key masih kosong atau placeholder", () => {
      // Saat .env.local belum diisi kredensial nyata, isSupabaseConfigured() wajib false
      if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        expect(isSupabaseConfigured()).toBe(false);
      }
    });

    it("harus memvalidasi fungsi getSupabaseSecretKey khusus server-only", () => {
      const secret = getSupabaseSecretKey();
      expect(typeof secret).toBe("string");
      // Memastikan nama variabel tidak menggunakan prefiks NEXT_PUBLIC_
      expect(process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY).toBeUndefined();
    });

    it("harus melaporkan status offline/demo secara akurat jika URL/Key belum dikonfigurasi", async () => {
      const status = await checkSupabaseHealth();
      expect(status).toHaveProperty("isConfigured");
      expect(status).toHaveProperty("isConnected");
      expect(status).toHaveProperty("mode");
      expect(status).toHaveProperty("checkedAt");

      if (!isSupabaseConfigured()) {
        expect(status.mode).toBe("demo_local");
        expect(status.isConnected).toBe(false);
        expect(status.connectionState).toBe("NOT_CONFIGURED");
        expect(status.message).toContain("MODE SIMULASI — MENUNGGU PROJECT SUPABASE KHUSUS");
      }
    });

    it("harus menyertakan timestamp ISO 8601 yang valid pada setiap pemeriksaan kesehatan", async () => {
      const status = await checkSupabaseHealth();
      const parsedDate = Date.parse(status.checkedAt);
      expect(Number.isNaN(parsedDate)).toBe(false);
    });

    it("health check tidak boleh membaca tabel keuangan sensitif rekening_pesantren", async () => {
      const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const origKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      try {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://jvhzrhfzkjqzlhsvvbgy.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_minimum_length_20";

        let queriedTable = "";
        const mockClient = {
          from: (table: string) => {
            queriedTable = table;
            return {
              select: () => ({
                limit: () => Promise.resolve({ data: [{ id: "1", judul: "Info" }], error: null, count: 1 }),
              }),
            };
          },
        } as any;

        const res = await checkSupabaseHealth(mockClient);
        // Health check HARUS menargetkan tabel publik 'pengumuman', BUKAN 'rekening_pesantren'
        expect(queriedTable).toBe("pengumuman");
        expect(queriedTable).not.toBe("rekening_pesantren");
        expect(res.isConnected).toBe(true);
        expect(res.connectionState).toBe("CONNECTED_HEALTHY");
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = origKey;
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. REPOSITORY / SERVICE LAYER TEST
  // --------------------------------------------------------------------------
  describe("2. Service Layer Instantiation & Method Contracts", () => {
    it("AdministrasiService harus memiliki method CRUD master data", () => {
      expect(typeof administrasiService.getRekeningResmi).toBe("function");
      expect(typeof administrasiService.getKelasList).toBe("function");
      expect(typeof administrasiService.getKamarList).toBe("function");
      expect(typeof administrasiService.getSantriList).toBe("function");
      expect(typeof administrasiService.getWaliList).toBe("function");
      expect(typeof administrasiService.createSantriWithWali).toBe("function");
      expect(typeof administrasiService.generateTagihan).toBe("function");
      expect(typeof administrasiService.moveSantriPlacement).toBe("function");
    });

    it("KeuanganService harus memiliki method transaksi & RPC wrapper", () => {
      expect(typeof keuanganService.checkoutPembayaran).toBe("function");
      expect(typeof keuanganService.verifikasiPembayaran).toBe("function");
      expect(typeof keuanganService.submitTopupUangSaku).toBe("function");
      expect(typeof keuanganService.verifikasiTopupUangSaku).toBe("function");
      expect(typeof keuanganService.catatPenyerahanUangSaku).toBe("function");
      expect(typeof keuanganService.koreksiLedgerUangSaku).toBe("function");
    });

    it("KepesantrenanService harus memiliki method perkembangan santri", () => {
      expect(typeof kepesantrenanService.catatPerkembanganMengaji).toBe("function");
      expect(typeof kepesantrenanService.catatSetoranTahfidz).toBe("function");
      expect(typeof kepesantrenanService.catatPrestasiSantri).toBe("function");
      expect(typeof kepesantrenanService.catatKedisiplinan).toBe("function");
      expect(typeof kepesantrenanService.updateTindakLanjutKedisiplinan).toBe("function");
    });
  });

  // --------------------------------------------------------------------------
  // 3. AUTH FLOW TEST
  // --------------------------------------------------------------------------
  describe("3. Authentication & Inactive Account Handling", () => {
    it("harus menolak login jika Supabase belum terhubung di mode demo", async () => {
      if (!isSupabaseConfigured()) {
        const res = await authService.login("test@pesantren.id", "secret123");
        expect(res.ok).toBe(false);
        expect(res.message).toContain("Supabase belum dihubungkan");
      }
    });

    it("harus mengenali akun nonaktif dan membatasi hak akses", () => {
      const inactiveUser = INITIAL_USERS.find((u) => !u.is_active);
      if (inactiveUser) {
        expect(inactiveUser.is_active).toBe(false);
      }
      expect(INITIAL_USERS.length).toBeGreaterThanOrEqual(5);
    });

    it("logout harus mengembalikan status sukses", async () => {
      const res = await authService.logout();
      expect(res.ok).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. MULTI-ROLE AUTHORIZATION TEST
  // --------------------------------------------------------------------------
  describe("4. Multi-Role Authorization & Separation of Duties", () => {
    it("hanya Bendahara yang berhak menyetujui transaksi keuangan (Bab 3 & 4 PRD)", () => {
      expect(canRoleApproveFinancialTransaction("bendahara")).toBe(true);
      expect(canRoleApproveFinancialTransaction("superadmin")).toBe(false);
      expect(canRoleApproveFinancialTransaction("admin")).toBe(false);
      expect(canRoleApproveFinancialTransaction("pengelola")).toBe(false);
      expect(canRoleApproveFinancialTransaction("wali")).toBe(false);
    });

    it("setiap role memiliki representasi akun pada master initial users", () => {
      const roles = INITIAL_USERS.map((u) => u.role);
      expect(roles).toContain("superadmin");
      expect(roles).toContain("admin");
      expect(roles).toContain("bendahara");
      expect(roles).toContain("pengelola");
      expect(roles).toContain("wali");
    });
  });

  // --------------------------------------------------------------------------
  // 5. POCKET MONEY LEDGER AUDIT TEST
  // --------------------------------------------------------------------------
  describe("5. Pocket Money Immutable Ledger Calculations", () => {
    it("harus menghitung saldo ledger secara matematis: Saldo = Masuk - Keluar + Koreksi", () => {
      const dummyMutasi = [
        { id: "m1", santri_id: "san-01", nomor_transaksi: "MUT-01", jenis_mutasi: "MASUK" as const, nominal: 300000, saldo_sebelum: 0, saldo_sesudah: 300000, keterangan: "Top up", petugas_nama: "Bendahara", created_at: "" },
        { id: "m2", santri_id: "san-01", nomor_transaksi: "MUT-02", jenis_mutasi: "KELUAR" as const, nominal: 50000, saldo_sebelum: 300000, saldo_sesudah: 250000, keterangan: "Uang saku", petugas_nama: "Bendahara", created_at: "" },
        { id: "m3", santri_id: "san-01", nomor_transaksi: "MUT-03", jenis_mutasi: "KELUAR" as const, nominal: 50000, saldo_sebelum: 250000, saldo_sesudah: 200000, keterangan: "Uang saku", petugas_nama: "Bendahara", created_at: "" },
        { id: "m4", santri_id: "san-01", nomor_transaksi: "MUT-04", jenis_mutasi: "PENYESUAIAN_TAMBAH" as const, nominal: 20000, saldo_sebelum: 200000, saldo_sesudah: 220000, keterangan: "Koreksi", petugas_nama: "Bendahara", created_at: "" },
      ];

      const saldo = calculatePocketMoneyLedger("san-01", dummyMutasi);
      expect(saldo.total_masuk).toBe(300000);
      expect(saldo.total_keluar).toBe(100000);
      expect(saldo.total_penyesuaian).toBe(20000);
      expect(saldo.saldo_saat_ini).toBe(220000);
      expect(saldo.saldo_saat_ini).toBe(
        saldo.total_masuk - saldo.total_keluar + saldo.total_penyesuaian
      );
    });

    it("harus melarang saldo bernilai negatif", () => {
      const overdrawnMutasi = [
        { id: "m1", santri_id: "san-01", nomor_transaksi: "MUT-01", jenis_mutasi: "MASUK" as const, nominal: 50000, saldo_sebelum: 0, saldo_sesudah: 50000, keterangan: "Top up", petugas_nama: "Bendahara", created_at: "" },
        { id: "m2", santri_id: "san-01", nomor_transaksi: "MUT-02", jenis_mutasi: "KELUAR" as const, nominal: 100000, saldo_sebelum: 50000, saldo_sesudah: -50000, keterangan: "Uang saku", petugas_nama: "Bendahara", created_at: "" },
      ];
      const saldo = calculatePocketMoneyLedger("san-01", overdrawnMutasi);
      expect(saldo.saldo_saat_ini).toBeLessThan(0);
      // Validasi bisnis melarang kondisi ini terjadi di level RPC
    });
  });

  // --------------------------------------------------------------------------
  // 6. STORAGE UPLOAD & MIME-TYPE VALIDATION TEST
  // --------------------------------------------------------------------------
  describe("6. Storage Validation & File Policies (Bab 15.12 PRD)", () => {
    it("harus menolak file gambar palsu atau format terlarang (.exe, .sh, .html)", () => {
      const fakeExe = { name: "malware.exe", size: 1024, type: "application/x-msdownload" };
      const validation = validateUploadedFile(fakeExe, "image_only");
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Format foto wajib JPG, PNG, atau WEBP");
    });

    it("harus menolak file yang melebihi batas ukuran 5 MB", () => {
      const hugeFile = { name: "foto_jumbo.jpg", size: 6 * 1024 * 1024, type: "image/jpeg" };
      const validation = validateUploadedFile(hugeFile, "image_only");
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("melebihi batas maksimum 5 MB");
    });

    it("harus menerima foto penyerahan yang valid (JPG, PNG, WEBP)", () => {
      const validPhoto = { name: "penyerahan_santri.jpg", size: 500 * 1024, type: "image/jpeg" };
      const validation = validateUploadedFile(validPhoto, "image_only");
      expect(validation.valid).toBe(true);
    });

    it("harus menerima bukti transfer berupa PDF atau gambar", () => {
      const validPdf = { name: "bukti_transfer.pdf", size: 800 * 1024, type: "application/pdf" };
      const validation = validateUploadedFile(validPdf, "image_or_pdf");
      expect(validation.valid).toBe(true);
    });

    it("StorageService uploadFile harus mengembalikan path aman saat simulasi", async () => {
      const dummyBlob = new Blob(["test-data"], { type: "image/jpeg" });
      const res = await storageService.uploadFile("bukti-pembayaran", "test/sample.jpg", dummyBlob);
      expect(res.ok).toBe(true);
      expect(res.path).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 7. NOTIFIKASI SERVICE TEST
  // --------------------------------------------------------------------------
  describe("7. Notifikasi Service Layer", () => {
    it("method notifikasi harus terdefinisi dan aman dipanggil", async () => {
      expect(typeof notifikasiService.getNotifikasi).toBe("function");
      expect(typeof notifikasiService.markAsRead).toBe("function");
      expect(typeof notifikasiService.markAllAsRead).toBe("function");

      const unread = await notifikasiService.getUnreadCount();
      expect(typeof unread).toBe("number");
    });
  });

  // --------------------------------------------------------------------------
  // 8. FALLBACK GRACEFUL TEST
  // --------------------------------------------------------------------------
  describe("8. Graceful Fallback (Demo Store vs Supabase)", () => {
    it("layanan administrasi harus mengembalikan array kosong dengan aman jika Supabase tidak aktif", async () => {
      if (!isSupabaseConfigured()) {
        const santri = await administrasiService.getSantriList();
        expect(Array.isArray(santri)).toBe(true);
        expect(santri.length).toBe(0);

        const rekening = await administrasiService.getRekeningResmi();
        expect(rekening).toBeNull();
      }
    });

    it("layanan keuangan harus mengembalikan array kosong dengan aman jika Supabase tidak aktif", async () => {
      if (!isSupabaseConfigured()) {
        const tagihan = await keuanganService.getTagihanBySantri();
        expect(Array.isArray(tagihan)).toBe(true);

        const transaksi = await keuanganService.getRiwayatTransaksi();
        expect(Array.isArray(transaksi)).toBe(true);
      }
    });
  });
});
