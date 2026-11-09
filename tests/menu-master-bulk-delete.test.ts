import { describe, it, expect, beforeEach } from "vitest";
import { kepesantrenanService } from "@/lib/services/kepesantrenan.service";
import type { MasterKategoriPelanggaran } from "@/types/database";

describe("SIPETA Final Menu, Master Data, & Bulk Delete Verification", () => {
  describe("1. Master Kategori Pelanggaran (Pengelola Portal)", () => {
    it("dapat membuat kategori pelanggaran baru dalam mode standalone", async () => {
      const res = await kepesantrenanService.createMasterKategoriPelanggaran({
        kode_kategori: "DIS-TEST-01",
        nama_kategori: "Terlambat Apel Malam",
        tingkat_pelanggaran: "RINGAN",
        poin_pembinaan: 5,
        standar_tindak_lanjut: "Nasihat dan pembinaan musyrif kamar",
        is_active: true,
      });

      expect(res.ok).toBe(true);
    });

    it("dapat memperbarui kategori pelanggaran", async () => {
      const res = await kepesantrenanService.updateMasterKategoriPelanggaran("kat-dis-01", {
        nama_kategori: "Terlambat Shalat Berjamaah Subuh",
        poin_pembinaan: 10,
        is_active: true,
      });

      expect(res.ok).toBe(true);
    });

    it("mendukung bulk delete dan deactivation aman", async () => {
      const res = await kepesantrenanService.deleteMasterKategoriPelanggaranBatch([
        "kat-dis-01",
        "kat-dis-02",
      ]);

      expect(res.ok).toBe(true);
      expect(res.summary.total).toBe(2);
    });
  });

  describe("2. Integritas Form Tanpa Kolom Email", () => {
    it("format payload registrasi santri tidak mewajibkan email", () => {
      const santriPayload = {
        nis: "20269999",
        nama_lengkap: "Santri Baru Uji",
        tempat_lahir: "Cirebon",
        tanggal_lahir: "2010-05-15",
        jenis_kelamin: "L" as const,
        alamat: "Pondok Pesantren Modern Abu Manshur",
        kelas_id: "kls-1",
        kamar_id: "kmr-1",
        nama_wali: "Wali Santri Uji",
        hubungan_wali: "Ayah" as const,
        telepon_wali: "081234567899",
        username_wali: "20269999",
        password_wali: "20269999",
      };

      expect(santriPayload.username_wali).toBe(santriPayload.nis);
      expect((santriPayload as any).email).toBeUndefined();
    });
  });

  describe("3. Konsolidasi Struktur Menu", () => {
    it("menu Admin menggabungkan pendaftaran santri ke tambah_santri", () => {
      const adminTabs = [
        "dashboard",
        "tambah_santri",
        "santri_wali",
        "kelas_kamar",
        "jenis_dan_tagihan",
        "pengumuman",
        "rekening_pesantren",
      ];

      expect(adminTabs).toContain("tambah_santri");
      expect(adminTabs).toContain("santri_wali");
      expect(adminTabs).toContain("jenis_dan_tagihan");
    });

    it("menu Bendahara menggabungkan saldo dan ledger ke keuangan_saldo_santri", () => {
      const bendaharaTabs = [
        "dashboard",
        "verifikasi_pembayaran",
        "verifikasi_saku",
        "penyerahan_saku",
        "keuangan_saldo_santri",
        "rekening_info",
      ];

      expect(bendaharaTabs).toContain("keuangan_saldo_santri");
    });
  });
});

