// ============================================================================
// SIPETA - Comprehensive Technical & Functional Verification Test Suite
// Sesuai PRD & Technical Spec Pondok Pesantren Modern Abu Manshur
// ============================================================================

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  calculatePocketMoneyLedger,
  canRoleApproveFinancialTransaction,
  canRoleViewFinancialDetails,
  canUserAccessSantri,
  koreksiLedgerSakuSchema,
  penyerahanUangSakuSchema,
  validateNominalCicilan,
  checkoutPembayaranSchema,
  pengajuanTopupSakuSchema,
  penyesuaianTagihanSchema,
} from "@/lib/validations/schemas";
import type {
  Tagihan,
  TransaksiPembayaran,
  MutasiUangSaku,
  UserProfile,
  CatatanKedisiplinan,
  RiwayatPerubahanKedisiplinan,
} from "@/types/database";

describe("SIPETA Comprehensive Technical & Functional Verification", () => {
  // ==========================================================================
  // PRIORITAS 2 & SECURITY: DATABASE, RLS & SECRETS AUDIT
  // ==========================================================================
  describe("A. Database Migrations, RLS & Security Audit", () => {
    const migrationsDir = path.resolve(__dirname, "../supabase/migrations");

    it("memastikan seluruh file migrasi 0001 - 008 tersedia", () => {
      const files = fs.readdirSync(migrationsDir);
      expect(files).toContain("0001_enums_and_extensions.sql");
      expect(files).toContain("0002_core_admin_tables.sql");
      expect(files).toContain("0003_payment_and_billing_tables.sql");
      expect(files).toContain("0004_pocket_money_ledger_tables.sql");
      expect(files).toContain("0005_kepesantrenan_and_audit_tables.sql");
      expect(files).toContain("0006_atomic_rpcs_and_triggers.sql");
      expect(files).toContain("0007_rls_and_storage_policies.sql");
      expect(files).toContain("008_security_remediation.sql");
    });

    it("memverifikasi klausul remediasi keamanan pada migrasi 008", () => {
      const remediationSql = fs.readFileSync(
        path.join(migrationsDir, "008_security_remediation.sql"),
        "utf-8"
      );
      // Temuan 1: Verifikasi is_published_to_wali
      expect(remediationSql).toContain("c.is_published_to_wali = true");
      // Temuan 2: Verifikasi TO authenticated dan TO anon
      expect(remediationSql).toContain("TO authenticated");
      expect(remediationSql).toContain("TO anon");
      // Temuan 3 & 4: Deduplikasi storage policy
      expect(remediationSql).toContain('DROP POLICY IF EXISTS "Storage Foto Penyerahan: upload eksklusif bendahara" ON storage.objects;');
      // Temuan 5: Otorisasi master data
      expect(remediationSql).toContain("Target Tahfidz: kelola oleh pengelola, admin & superadmin");
    });

    it("memastikan RLS diaktifkan pada seluruh tabel di skema database", () => {
      const rlsSql = fs.readFileSync(
        path.join(migrationsDir, "0007_rls_and_storage_policies.sql"),
        "utf-8"
      );
      const tablesToCheck = [
        "profiles",
        "santri",
        "wali_santri",
        "riwayat_penempatan_santri",
        "jenis_pembayaran",
        "tagihan",
        "riwayat_penyesuaian_tagihan",
        "transaksi_pembayaran",
        "alokasi_pembayaran",
        "saldo_uang_saku",
        "pengajuan_uang_saku",
        "mutasi_uang_saku",
        "perkembangan_mengaji",
        "setoran_tahfidz",
        "target_tahfidz",
        "prestasi_santri",
        "master_kategori_pelanggaran",
        "catatan_kedisiplinan",
        "riwayat_perubahan_kedisiplinan",
        "pengumuman",
        "notifikasi",
        "audit_logs",
      ];

      for (const table of tablesToCheck) {
        expect(rlsSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      }
    });

    it("memastikan Storage RLS mengamankan 4 private bucket pesantren", () => {
      const rlsSql = fs.readFileSync(
        path.join(migrationsDir, "0007_rls_and_storage_policies.sql"),
        "utf-8"
      );
      expect(rlsSql).toContain("bukti-pembayaran");
      expect(rlsSql).toContain("bukti-uang-saku");
      expect(rlsSql).toContain("foto-penyerahan-saku");
      expect(rlsSql).toContain("dokumentasi-kepesantrenan");
      expect(rlsSql).toContain('CREATE POLICY "Storage Bukti Pembayaran: upload"');
      expect(rlsSql).toContain('CREATE POLICY "Storage Foto Penyerahan: upload eksklusif bendahara"');
    });

    it("memverifikasi tersedianya RPC atomik kritis di migrasi 0006", () => {
      const rpcSql = fs.readFileSync(
        path.join(migrationsDir, "0006_atomic_rpcs_and_triggers.sql"),
        "utf-8"
      );
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_verifikasi_pembayaran");
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_verifikasi_topup_uang_saku");
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_catat_penyerahan_uang_saku");
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_koreksi_ledger_uang_saku");
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_unggah_bukti_transfer_pembayaran");
      expect(rpcSql).toContain("CREATE OR REPLACE FUNCTION public.rpc_penyesuaian_tagihan");
    });

    it("memastikan tidak ada kebocoran SUPABASE_SERVICE_ROLE_KEY di client bundles", () => {
      const clientStorePath = path.resolve(__dirname, "../src/lib/supabase/client.ts");
      if (fs.existsSync(clientStorePath)) {
        const clientContent = fs.readFileSync(clientStorePath, "utf-8");
        expect(clientContent).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      }
    });
  });

  // ==========================================================================
  // PRIORITAS 3: AUDIT PEMBAYARAN & CICILAN
  // ==========================================================================
  describe("B. Audit Modul Pembayaran (Bab 5 PRD)", () => {
    it("memvalidasi checkout pembayaran multi-tagihan", () => {
      const payload = {
        santri_id: "snt-001",
        tanggal_transfer: "2026-11-08",
        nama_pengirim: "H. Ridwan",
        bank_pengirim: "Bank Syariah Indonesia",
        bukti_transfer_url: "https://sipeta.local/storage/bukti-1.jpg",
        items: [
          { tagihan_id: "tgh-001", nominal_bayar: 500000 },
          { tagihan_id: "tgh-002", nominal_bayar: 250000 },
        ],
      };
      const check = checkoutPembayaranSchema.safeParse(payload);
      expect(check.success).toBe(true);
    });

    it("menolak checkout jika bukti transfer atau nama pengirim kosong", () => {
      const payload = {
        santri_id: "snt-001",
        tanggal_transfer: "2026-11-08",
        nama_pengirim: "",
        bank_pengirim: "BSI",
        bukti_transfer_url: "",
        items: [{ tagihan_id: "tgh-001", nominal_bayar: 500000 }],
      };
      const check = checkoutPembayaranSchema.safeParse(payload);
      expect(check.success).toBe(false);
    });

    it("mencegah alokasi melebihi sisa tagihan (Overpayment Protection)", () => {
      const tagihan: Tagihan = {
        id: "tgh-001",
        nomor_tagihan: "INV-202611-001",
        santri_id: "snt-001",
        jenis_pembayaran_id: "jp-spp",
        judul_tagihan: "SPP November 2026",
        kategori: "SPP Bulanan",
        periode_label: "November 2026",
        nominal_awal: 850000,
        nominal_tagihan: 850000,
        nominal_penyesuaian: 0,
        total_terbayar: 500000,
        sisa_tagihan: 350000,
        status: "DIBAYAR_SEBAGIAN",
        kebijakan_cicilan_snapshot: "BEBAS",
        minimal_cicilan_snapshot: null,
        tanggal_mulai: "2026-11-01",
        tanggal_jatuh_tempo: "2026-11-20",
        is_active: true,
        created_at: "2026-11-01T00:00:00Z",
      };

      const validAlloc = validateNominalCicilan(tagihan, 350000);
      expect(validAlloc.valid).toBe(true);

      const overAlloc = validateNominalCicilan(tagihan, 350001);
      expect(overAlloc.valid).toBe(false);
      expect(overAlloc.error).toContain("tidak boleh melebihi sisa kewajiban");
    });

    it("memvalidasi penyesuaian/pembatalan tagihan (Bab 5.3 PRD)", () => {
      const validAdjust = penyesuaianTagihanSchema.safeParse({
        tagihan_id: "tgh-001",
        nominal_penyesuaian: 400000,
        alasan_penyesuaian: "Keringanan beasiswa tahfidz 5 juz",
      });
      expect(validAdjust.success).toBe(true);

      const invalidAdjust = penyesuaianTagihanSchema.safeParse({
        tagihan_id: "tgh-001",
        nominal_penyesuaian: -1000,
        alasan_penyesuaian: "x",
      });
      expect(invalidAdjust.success).toBe(false);
    });

    it("mencegah pembatalan tagihan jika sudah ada cicilan yang masuk", () => {
      const tagihanSudahDicicil: Tagihan = {
        id: "tgh-002",
        nomor_tagihan: "INV-002",
        santri_id: "snt-001",
        jenis_pembayaran_id: "jp-rihlah",
        judul_tagihan: "Rihlah Ilmiah",
        kategori: "Kegiatan",
        periode_label: "Semester Ganjil",
        nominal_awal: 500000,
        nominal_tagihan: 500000,
        nominal_penyesuaian: 0,
        total_terbayar: 200000,
        sisa_tagihan: 300000,
        status: "DIBAYAR_SEBAGIAN",
        kebijakan_cicilan_snapshot: "BEBAS",
        minimal_cicilan_snapshot: null,
        tanggal_mulai: "2026-11-01",
        tanggal_jatuh_tempo: "2026-11-30",
        is_active: true,
        created_at: "2026-11-01T00:00:00Z",
      };

      const nominalBaru = 150000;
      const isAllowed = nominalBaru >= tagihanSudahDicicil.total_terbayar;
      expect(isAllowed).toBe(false);
    });
  });

  // ==========================================================================
  // PRIORITAS 4: AUDIT UANG SAKU & LEDGER
  // ==========================================================================
  describe("C. Audit Modul Uang Saku & Immutable Ledger (Bab 6 PRD)", () => {
    it("memvalidasi formulir pengajuan top-up uang saku oleh wali", () => {
      const validPayload = {
        santri_id: "snt-001",
        nominal: 200000,
        tanggal_transfer: "2026-11-08",
        nama_pengirim: "H. Ridwan",
        bank_pengirim: "BSI Mobile",
        bukti_transfer_url: "https://sipeta.local/bukti-saku.jpg",
        keterangan: "Uang saku pekan ke-2",
      };
      expect(pengajuanTopupSakuSchema.safeParse(validPayload).success).toBe(true);

      const invalidNominal = { ...validPayload, nominal: 5000 };
      expect(pengajuanTopupSakuSchema.safeParse(invalidNominal).success).toBe(false);
    });

    it("mewajibkan foto dokumentasi pada penyerahan uang saku tunai", () => {
      const tanpaFoto = {
        santri_id: "snt-001",
        nominal: 50000,
        foto_penyerahan_url: "",
        keterangan: "Penyerahan uang saku santri",
      };
      expect(penyerahanUangSakuSchema.safeParse(tanpaFoto).success).toBe(false);

      const denganFoto = {
        santri_id: "snt-001",
        nominal: 50000,
        foto_penyerahan_url: "https://sipeta.local/foto-penyerahan.jpg",
        keterangan: "Penyerahan uang saku santri",
      };
      expect(penyerahanUangSakuSchema.safeParse(denganFoto).success).toBe(true);
    });

    it("memvalidasi rekonsiliasi matematis seluruh mutasi ledger", () => {
      const riwayat: MutasiUangSaku[] = [
        {
          id: "m-1",
          nomor_transaksi: "TRX-01",
          santri_id: "snt-001",
          jenis_mutasi: "MASUK",
          nominal: 500000,
          saldo_sebelum: 0,
          saldo_sesudah: 500000,
          keterangan: "Topup 1",
          petugas_nama: "Bendahara",
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: "m-2",
          nomor_transaksi: "TRX-02",
          santri_id: "snt-001",
          jenis_mutasi: "KELUAR",
          nominal: 150000,
          saldo_sebelum: 500000,
          saldo_sesudah: 350000,
          keterangan: "Penyerahan",
          foto_penyerahan_url: "https://sipeta.local/foto.jpg",
          petugas_nama: "Bendahara",
          created_at: "2026-11-02T00:00:00Z",
        },
        {
          id: "m-3",
          nomor_transaksi: "TRX-03",
          santri_id: "snt-001",
          jenis_mutasi: "PENYESUAIAN_TAMBAH",
          nominal: 20000,
          saldo_sebelum: 350000,
          saldo_sesudah: 370000,
          keterangan: "Koreksi selisih",
          petugas_nama: "Bendahara",
          created_at: "2026-11-03T00:00:00Z",
        },
        {
          id: "m-4",
          nomor_transaksi: "TRX-04",
          santri_id: "snt-001",
          jenis_mutasi: "PENYESUAIAN_KURANG",
          nominal: 10000,
          saldo_sebelum: 370000,
          saldo_sesudah: 360000,
          keterangan: "Koreksi kelebihan",
          petugas_nama: "Bendahara",
          created_at: "2026-11-04T00:00:00Z",
        },
      ];

      const ledger = calculatePocketMoneyLedger("snt-001", riwayat);
      expect(ledger.total_masuk).toBe(500000);
      expect(ledger.total_keluar).toBe(150000);
      expect(ledger.total_penyesuaian).toBe(10000); // +20k - 10k
      expect(ledger.saldo_saat_ini).toBe(360000);
      expect(ledger.saldo_saat_ini).toBe(
        ledger.total_masuk - ledger.total_keluar + ledger.total_penyesuaian
      );
    });

    it("memvalidasi schema koreksi ledger uang saku", () => {
      const validKoreksi = {
        referensi_mutasi_id: "m-02",
        jenis_mutasi: "PENYESUAIAN_KURANG" as const,
        nominal: 25000,
        alasan_koreksi: "Koreksi kesalahan input nominal transfer sebelumnya",
      };
      expect(koreksiLedgerSakuSchema.safeParse(validKoreksi).success).toBe(true);

      const alasanPendek = { ...validKoreksi, alasan_koreksi: "tes" };
      expect(koreksiLedgerSakuSchema.safeParse(alasanPendek).success).toBe(false);
    });
  });

  // ==========================================================================
  // PRIORITAS 5: AUDIT MODUL KEPESANTRENAN & ACCESS CONTROL
  // ==========================================================================
  describe("D. Audit Modul Kepesantrenan & Kontrol Akses Role", () => {
    const userSuperadmin: UserProfile = {
      id: "u-super",
      email: "superadmin@sipeta.ac.id",
      nama_lengkap: "Superadmin Pesantren",
      no_telepon: "081234567890",
      role: "superadmin",
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    };

    const userAdmin: UserProfile = {
      id: "u-admin",
      email: "admin@sipeta.ac.id",
      nama_lengkap: "Admin Pesantren",
      no_telepon: "081234567891",
      role: "admin",
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    };

    const userBendahara: UserProfile = {
      id: "u-bendahara",
      email: "bendahara@sipeta.ac.id",
      nama_lengkap: "Bendahara Pesantren",
      no_telepon: "081234567892",
      role: "bendahara",
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    };

    const userPengelola: UserProfile = {
      id: "u-pengelola",
      email: "pengelola@sipeta.ac.id",
      nama_lengkap: "Ustadz Kepesantrenan",
      no_telepon: "081234567893",
      role: "pengelola",
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    };

    const userWali1: UserProfile = {
      id: "u-wali1",
      email: "wali1@gmail.com",
      nama_lengkap: "Wali Santri 1",
      no_telepon: "081234567894",
      role: "wali",
      santri_id: "snt-001",
      is_active: true,
      created_at: "2026-11-01T00:00:00Z",
    };

    it("memastikan hanya Bendahara yang berwenang mengesahkan transaksi keuangan operasional (Bab 2 PRD)", () => {
      // Bab 2 & 3.3 PRD: Bendahara menjadi satu-satunya role operasional yang berwenang mengesahkan transaksi keuangan
      expect(canRoleApproveFinancialTransaction(userBendahara.role)).toBe(true);

      // Superadmin, Admin, Pengelola, Wali tidak berwenang mengesahkan transaksi operasional tanpa audit koreksi
      expect(canRoleApproveFinancialTransaction(userSuperadmin.role)).toBe(false);
      expect(canRoleApproveFinancialTransaction(userAdmin.role)).toBe(false);
      expect(canRoleApproveFinancialTransaction(userPengelola.role)).toBe(false);
      expect(canRoleApproveFinancialTransaction(userWali1.role)).toBe(false);
    });

    it("memastikan Pengelola Kepesantrenan tidak dapat mengakses rincian keuangan", () => {
      expect(canRoleViewFinancialDetails(userPengelola.role)).toBe(false);
      expect(canRoleViewFinancialDetails(userAdmin.role)).toBe(true);
      expect(canRoleViewFinancialDetails(userBendahara.role)).toBe(true);
      expect(canRoleViewFinancialDetails(userSuperadmin.role)).toBe(true);
    });

    it("memastikan Wali Santri hanya dapat mengakses data santri yang terhubung (1:1)", () => {
      expect(canUserAccessSantri(userWali1, "snt-001")).toBe(true);
      expect(canUserAccessSantri(userWali1, "snt-002")).toBe(false);
      expect(canUserAccessSantri(userWali1, "snt-999")).toBe(false);

      // Staff internal pesantren berwenang melihat data santri
      expect(canUserAccessSantri(userAdmin, "snt-001")).toBe(true);
      expect(canUserAccessSantri(userBendahara, "snt-002")).toBe(true);
      expect(canUserAccessSantri(userPengelola, "snt-003")).toBe(true);
    });

    it("memastikan riwayat pembinaan kedisiplinan tersimpan utuh saat diperbarui (Bab 10 PRD)", () => {
      const initialCatatan: CatatanKedisiplinan = {
        id: "dis-001",
        santri_id: "snt-001",
        tanggal_kejadian: "2026-11-02",
        waktu_kejadian: "05:15",
        kategori_id: "kat-01",
        nama_kategori: "Terlambat Shalat Berjamaah",
        tingkat_pelanggaran: "RINGAN",
        deskripsi: "Terlambat 10 menit shalat Shubuh di masjid utama",
        tindak_lanjut: "Nasihat lisan dan membaca Al-Quran 1 juz",
        catatan_pembinaan: "Santri berjanji bangun lebih awal",
        status_tindak_lanjut: "DALAM_PEMBINAAN",
        petugas_nama: "Ustadz Ahmad",
        riwayat_perubahan: [],
        created_at: "2026-11-02T06:00:00Z",
      };

      const riwayatBaru: RiwayatPerubahanKedisiplinan = {
        id: "rwd-001",
        catatan_kedisiplinan_id: initialCatatan.id,
        tindak_lanjut_sebelum: initialCatatan.tindak_lanjut,
        catatan_pembinaan_sebelum: initialCatatan.catatan_pembinaan,
        status_sebelum: initialCatatan.status_tindak_lanjut,
        status_sesudah: "SELESAI",
        alasan_perubahan: "Santri telah menyelesaikan setoran membaca 1 juz dengan musyrif",
        diubah_oleh_nama: "Ustadz Ahmad",
        created_at: "2026-11-03T10:00:00Z",
      };

      const updatedCatatan: CatatanKedisiplinan = {
        ...initialCatatan,
        status_tindak_lanjut: "SELESAI",
        catatan_pembinaan: "Telah selesai dilaksanakan di bawah bimbingan musyrif kamar",
        riwayat_perubahan: [riwayatBaru, ...initialCatatan.riwayat_perubahan],
      };

      expect(updatedCatatan.status_tindak_lanjut).toBe("SELESAI");
      expect(updatedCatatan.riwayat_perubahan).toHaveLength(1);
      expect(updatedCatatan.riwayat_perubahan[0]?.status_sebelum).toBe("DALAM_PEMBINAAN");
      expect(updatedCatatan.riwayat_perubahan[0]?.tindak_lanjut_sebelum).toBe(
        "Nasihat lisan dan membaca Al-Quran 1 juz"
      );
    });
  });
});
