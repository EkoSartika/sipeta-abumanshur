// ============================================================================
// SIPETA - Unit & Business Rule Tests (Vitest)
// Menguji seluruh Kriteria Keberhasilan (Bab 17 PRD):
// 1. Validasi kebijakan cicilan (TIDAK_BOLEH, MINIMAL_NOMINAL, BEBAS)
// 2. Kalkulasi Ledger Uang Saku (Saldo = Masuk - Keluar + Penyesuaian)
// 3. Validasi wajib foto penyerahan uang saku
// 4. Otorisasi Bendahara & isolasi data lintas santri (Relasi 1:1 Wali-Santri)
// 5. Validasi keamanan file unggahan
// ============================================================================

import { describe, expect, it } from "vitest";
import {
  calculatePocketMoneyLedger,
  canRoleApproveFinancialTransaction,
  canRoleViewFinancialDetails,
  canUserAccessSantri,
  koreksiLedgerSakuSchema,
  penyerahanUangSakuSchema,
  validateNominalCicilan,
} from "@/lib/validations/schemas";
import { validateUploadedFile } from "@/lib/supabase/storage";
import type { MutasiUangSaku, UserProfile } from "@/types/database";

describe("SIPETA Core Business Rules & Security Tests", () => {
  describe("1. Kebijakan Cicilan Tagihan (Bab 5.2 & 5.4 PRD)", () => {
    it("menolak pembayaran sebagian jika kebijakan TIDAK_BOLEH dicicil", () => {
      const tagihanSpp = {
        judul_tagihan: "Syahriyah SPP November 2026",
        sisa_tagihan: 850000,
        status: "BELUM_BAYAR" as const,
        kebijakan_cicilan_snapshot: "TIDAK_BOLEH" as const,
        minimal_cicilan_snapshot: null,
      };

      const gagalCicil = validateNominalCicilan(tagihanSpp, 500000);
      expect(gagalCicil.valid).toBe(false);

      const bayarPenuh = validateNominalCicilan(tagihanSpp, 850000);
      expect(bayarPenuh.valid).toBe(true);
    });

    it("memvalidasi batas minimum pada kebijakan MINIMAL_NOMINAL", () => {
      const tagihanMakan = {
        judul_tagihan: "Uang Makan November 2026",
        sisa_tagihan: 650000,
        status: "BELUM_BAYAR" as const,
        kebijakan_cicilan_snapshot: "MINIMAL_NOMINAL" as const,
        minimal_cicilan_snapshot: 300000,
      };

      expect(validateNominalCicilan(tagihanMakan, 200000).valid).toBe(false);
      expect(validateNominalCicilan(tagihanMakan, 300000).valid).toBe(true);
      expect(validateNominalCicilan(tagihanMakan, 650000).valid).toBe(true);
      expect(validateNominalCicilan(tagihanMakan, 700000).valid).toBe(false);
    });

    it("mengizinkan pelunasan sisa tagihan yang lebih kecil dari minimal cicilan", () => {
      const tagihanSisaKecil = {
        judul_tagihan: "Kegiatan Rihlah",
        sisa_tagihan: 150000,
        status: "DIBAYAR_SEBAGIAN" as const,
        kebijakan_cicilan_snapshot: "MINIMAL_NOMINAL" as const,
        minimal_cicilan_snapshot: 400000,
      };

      expect(validateNominalCicilan(tagihanSisaKecil, 150000).valid).toBe(true);
    });

    it("mengizinkan nominal bebas (<= sisa_tagihan) pada kebijakan BEBAS", () => {
      const tagihanKitab = {
        judul_tagihan: "Paket Kitab Turats",
        sisa_tagihan: 500000,
        status: "DIBAYAR_SEBAGIAN" as const,
        kebijakan_cicilan_snapshot: "BEBAS" as const,
        minimal_cicilan_snapshot: null,
      };

      expect(validateNominalCicilan(tagihanKitab, 50000).valid).toBe(true);
      expect(validateNominalCicilan(tagihanKitab, 500000).valid).toBe(true);
    });
  });

  describe("2. Ledger Uang Saku & Wajib Foto Penyerahan (Bab 6 PRD)", () => {
    it("menghitung saldo secara akurat dari ledger (Masuk - Keluar + Penyesuaian)", () => {
      const mutasi: MutasiUangSaku[] = [
        {
          id: "m1",
          nomor_transaksi: "SAK-IN-01",
          santri_id: "snt-001",
          jenis_mutasi: "MASUK",
          nominal: 400000,
          saldo_sebelum: 0,
          saldo_sesudah: 400000,
          keterangan: "Topup awal",
          petugas_nama: "Bendahara",
          created_at: "2026-11-01T10:00:00Z",
        },
        {
          id: "m2",
          nomor_transaksi: "SAK-OUT-01",
          santri_id: "snt-001",
          jenis_mutasi: "KELUAR",
          nominal: 75000,
          saldo_sebelum: 400000,
          saldo_sesudah: 325000,
          keterangan: "Uang saku mingguan",
          foto_penyerahan_url: "https://storage.example/foto.jpg",
          petugas_nama: "Bendahara",
          created_at: "2026-11-04T10:00:00Z",
        },
        {
          id: "m3",
          nomor_transaksi: "SAK-ADJ-01",
          santri_id: "snt-001",
          jenis_mutasi: "PENYESUAIAN_KURANG",
          nominal: 25000,
          saldo_sebelum: 325000,
          saldo_sesudah: 300000,
          keterangan: "Koreksi selisih input",
          referensi_mutasi_id: "m1",
          alasan_koreksi: "Koreksi nominal bukti transfer",
          petugas_nama: "Bendahara",
          created_at: "2026-11-05T10:00:00Z",
        },
      ];

      const summary = calculatePocketMoneyLedger("snt-001", mutasi);
      expect(summary.total_masuk).toBe(400000);
      expect(summary.total_keluar).toBe(75000);
      expect(summary.total_penyesuaian).toBe(-25000);
      expect(summary.saldo_saat_ini).toBe(300000);
    });

    it("menolak pencatatan uang keluar apabila foto penyerahan tidak tersedia", () => {
      const tanpaFoto = penyerahanUangSakuSchema.safeParse({
        santri_id: "snt-001",
        nominal: 50000,
        keterangan: "Penyerahan uang saku mingguan",
        foto_penyerahan_url: "",
      });
      expect(tanpaFoto.success).toBe(false);

      const denganFoto = penyerahanUangSakuSchema.safeParse({
        santri_id: "snt-001",
        nominal: 50000,
        keterangan: "Penyerahan uang saku mingguan",
        foto_penyerahan_url: "data:image/svg+xml;utf8,<svg></svg>",
      });
      expect(denganFoto.success).toBe(true);
    });

    it("mewajibkan referensi transaksi dan alasan pada jurnal koreksi ledger", () => {
      const tanpaAlasan = koreksiLedgerSakuSchema.safeParse({
        referensi_mutasi_id: "mut-001",
        jenis_mutasi: "PENYESUAIAN_TAMBAH",
        nominal: 10000,
        alasan_koreksi: "abc",
      });
      expect(tanpaAlasan.success).toBe(false);
    });
  });

  describe("3. Otorisasi Role & Proteksi Lintas Santri (Bab 3 & Bab 15 PRD)", () => {
    it("memastikan hanya Bendahara yang dapat menyetujui transaksi keuangan", () => {
      expect(canRoleApproveFinancialTransaction("bendahara")).toBe(true);
      expect(canRoleApproveFinancialTransaction("admin")).toBe(false);
      expect(canRoleApproveFinancialTransaction("superadmin")).toBe(false);
      expect(canRoleApproveFinancialTransaction("pengelola")).toBe(false);
      expect(canRoleApproveFinancialTransaction("wali")).toBe(false);
    });

    it("mencegah Pengelola Kepesantrenan mengakses rincian transaksi keuangan", () => {
      expect(canRoleViewFinancialDetails("pengelola")).toBe(false);
      expect(canRoleViewFinancialDetails("bendahara")).toBe(true);
      expect(canRoleViewFinancialDetails("admin")).toBe(true);
    });

    it("mencegah akun Orang Tua/Wali mengakses data santri milik orang tua lain", () => {
      const waliZaki: UserProfile = {
        id: "usr-wali-01",
        nama_lengkap: "H. Ahmad Firdaus",
        email: "ahmad@example.com",
        no_telepon: "08123",
        role: "wali",
        is_active: true,
        santri_id: "snt-001",
        created_at: "2026-07-01T00:00:00Z",
      };

      expect(canUserAccessSantri(waliZaki, "snt-001")).toBe(true);
      expect(canUserAccessSantri(waliZaki, "snt-002")).toBe(false);
    });
  });

  describe("4. Validasi File Unggahan (Bab 15.12 PRD)", () => {
    it("menolak file lebih dari 5MB atau ekstensi berbahaya", () => {
      expect(
        validateUploadedFile(
          { name: "malware.exe", size: 1024, type: "application/x-msdownload" },
          "image_or_pdf"
        ).valid
      ).toBe(false);

      expect(
        validateUploadedFile(
          { name: "huge.jpg", size: 6 * 1024 * 1024, type: "image/jpeg" },
          "image_only"
        ).valid
      ).toBe(false);

      expect(
        validateUploadedFile(
          { name: "foto-penyerahan.jpg", size: 500_000, type: "image/jpeg" },
          "image_only"
        ).valid
      ).toBe(true);
    });
  });
});

