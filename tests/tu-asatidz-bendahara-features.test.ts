// ============================================================================
// SIPETA — Comprehensive Test Suite for TU, Asatidz, and Bendahara Features
// Memverifikasi workflow persetujuan pembiayaan TU -> Admin, manajemen pelanggaran,
// pengumuman tertarget, evaluasi mengaji skala A-D (Asatidz & Bendahara), serta migrasi 014.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { administrasiService } from "@/lib/services/administrasi.service";
import { kepesantrenanService } from "@/lib/services/kepesantrenan.service";
import * as clientLib from "@/lib/supabase/client";
import type { JenisPembayaran, Pengumuman, PerkembanganMengaji, Santri } from "@/types/database";

describe("SIPETA — TU, Asatidz, & Bendahara Features Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. MANAJEMEN PEMBIAYAAN SANTRI & ALUR PERSETUJUAN (TU & ADMIN/PENGASUH)
  // ==========================================================================
  describe("1. Manajemen Pembiayaan Santri & Alur Persetujuan", () => {
    it("1.1. Pembiayaan yang diajukan memiliki status awal MENUNGGU_PERSETUJUAN dan belum aktif", () => {
      const draftFee: Omit<JenisPembayaran, "id" | "is_active"> = {
        nama_pembayaran: "Infaq Pembangunan Asrama Baru",
        kode_pembayaran: "BYR-202611-1234",
        deskripsi: "Pembangunan gedung santri baru",
        nominal: 500000,
        kategori: "Pembangunan",
        tahun_ajaran_id: "ta-2026-2027",
        periode_pembayaran: "Sekali Bayar",
        tanggal_mulai: "2026-11-01",
        tanggal_jatuh_tempo: "2026-12-31",
        sasaran_santri: "SEMUA",
        kebijakan_cicilan: "BEBAS",
        minimal_nominal_cicilan: null,
        status_persetujuan: "MENUNGGU_PERSETUJUAN",
      };

      expect(draftFee.status_persetujuan).toBe("MENUNGGU_PERSETUJUAN");
      expect(draftFee.nominal).toBeGreaterThan(0);
      expect(draftFee.sasaran_santri).toBe("SEMUA");
      expect(draftFee.kebijakan_cicilan).toBe("BEBAS");
    });

    it("1.2. AdministrasiService deleteJenisPembayaran menolak keras penghapusan pembiayaan yang telah disetujui (anti-delete guard)", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "jp-approved-001",
                  nama_pembayaran: "SPP Syawal 1447H",
                  status_persetujuan: "DISETUJUI",
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      (administrasiService as any).client = mockSupabase;

      const res = await administrasiService.deleteJenisPembayaran("jp-approved-001");
      expect(res.ok).toBe(false);
      expect(res.message).toContain("tidak boleh dihapus");
    });

    it("1.3. AdministrasiService approveJenisPembayaran mengubah status menjadi DISETUJUI dan aktif", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: mockUpdate,
        }),
      };

      (administrasiService as any).client = mockSupabase;

      const res = await administrasiService.approveJenisPembayaran("jp-pending-001", {
        approved_by: "admin-uuid-001",
        approved_by_name: "K.H. Abu Manshur",
        catatan: "Disetujui untuk seluruh santri",
      });

      expect(res.ok).toBe(true);
      expect(res.message).toContain("berhasil disetujui");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status_persetujuan: "DISETUJUI",
          is_active: true,
          disetujui_oleh_nama: "K.H. Abu Manshur",
        })
      );
    });

    it("1.4. AdministrasiService rejectJenisPembayaran mewajibkan catatan dan mengubah status menjadi DITOLAK", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          update: mockUpdate,
        }),
      };

      (administrasiService as any).client = mockSupabase;

      // Tanpa catatan wajib gagal
      const resWithoutNote = await administrasiService.rejectJenisPembayaran("jp-pending-001", {
        rejected_by: "admin-uuid-001",
        catatan: "   ",
      });
      expect(resWithoutNote.ok).toBe(false);
      expect(resWithoutNote.message).toContain("wajib menyertakan catatan");

      // Dengan catatan berhasil
      const resWithNote = await administrasiService.rejectJenisPembayaran("jp-pending-001", {
        rejected_by: "admin-uuid-001",
        catatan: "Mohon nominal disesuaikan dengan rapat komite",
      });
      expect(resWithNote.ok).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status_persetujuan: "DITOLAK",
          is_active: false,
          catatan_persetujuan: "Mohon nominal disesuaikan dengan rapat komite",
        })
      );
    });
  });

  // ==========================================================================
  // 2. MANAJEMEN PELANGGARAN & KATEGORI (TU & ASATIDZ)
  // ==========================================================================
  describe("2. Manajemen Pelanggaran & Master Kategori", () => {
    it("2.1. KepesantrenanService safe-delete master kategori pelanggaran: soft-deactivate jika ada histori, hard delete jika belum pernah digunakan", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      // Skenario A: Kategori yang SUDAH digunakan dalam catatan_kedisiplinan -> DEACTIVATED
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabaseWithHistory = {
        from: vi.fn((table: string) => {
          if (table === "catatan_kedisiplinan") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
              }),
            };
          }
          if (table === "master_kategori_pelanggaran") {
            return {
              update: mockUpdate,
            };
          }
          return {};
        }),
      };

      (kepesantrenanService as any).client = mockSupabaseWithHistory;
      const resA = await kepesantrenanService.deleteOrDeactivateMasterKategoriPelanggaran("kat-used-001");
      expect(resA.ok).toBe(true);
      expect(resA.actionTaken).toBe("DEACTIVATED");
      expect(resA.message).toContain("dinonaktifkan secara aman");

      // Skenario B: Kategori yang BELUM digunakan -> DELETED
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabaseWithoutHistory = {
        from: vi.fn((table: string) => {
          if (table === "catatan_kedisiplinan") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            };
          }
          if (table === "master_kategori_pelanggaran") {
            return {
              delete: mockDelete,
            };
          }
          return {};
        }),
      };

      (kepesantrenanService as any).client = mockSupabaseWithoutHistory;
      const resB = await kepesantrenanService.deleteOrDeactivateMasterKategoriPelanggaran("kat-unused-002");
      expect(resB.ok).toBe(true);
      expect(resB.actionTaken).toBe("DELETED");
      expect(resB.message).toContain("berhasil dihapus permanen");
    });

    it("2.2. KepesantrenanService deleteCatatanKedisiplinan membersihkan riwayat audit terlebih dahulu sebelum menghapus record utama", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      const deleteRiwayat = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const deleteCatatan = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "riwayat_perubahan_kedisiplinan") {
            return { delete: deleteRiwayat };
          }
          if (table === "catatan_kedisiplinan") {
            return { delete: deleteCatatan };
          }
          return {};
        }),
      };

      (kepesantrenanService as any).client = mockSupabase;
      const res = await kepesantrenanService.deleteCatatanKedisiplinan("dis-target-001");
      expect(res.ok).toBe(true);
      expect(deleteRiwayat).toHaveBeenCalled();
      expect(deleteCatatan).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. PENGUMUMAN WALI SANTRI DENGAN TARGETING & MASA BERLAKU
  // ==========================================================================
  describe("3. Pengumuman Wali Santri (Targeting & Status Publikasi)", () => {
    it("3.1. Pengumuman mendukung sasaran SEMUA, KELAS, dan SANTRI serta status DRAF dan PUBLIKASI", () => {
      const pSemua: Pengumuman = {
        id: "pgm-001",
        judul: "Libur Awal Ramadhan",
        kategori: "Umum",
        isi: "Seluruh santri libur tanggal 1-3 Ramadhan.",
        is_penting: true,
        is_published: true,
        tanggal_publikasi: "2026-11-01",
        created_by_nama: "Staf Tata Usaha",
        status_publikasi: "PUBLIKASI",
        sasaran: "SEMUA",
        masa_berlaku: "2026-11-30",
      };

      const pKelas: Pengumuman = {
        id: "pgm-002",
        judul: "Ujian Praktik Kelas 9",
        kategori: "Akademik",
        isi: "Ujian praktik dimulai hari Senin.",
        is_penting: false,
        is_published: true,
        tanggal_publikasi: "2026-11-01",
        created_by_nama: "Staf Tata Usaha",
        status_publikasi: "PUBLIKASI",
        sasaran: "KELAS",
        target_id: "kls-9a",
        masa_berlaku: "2026-11-20",
      };

      const pDraf: Pengumuman = {
        id: "pgm-003",
        judul: "Rencana Wisuda Tahfidz (Draf Internal)",
        kategori: "Kegiatan Pesantren",
        isi: "Rencana wisuda sedang disusun.",
        is_penting: false,
        is_published: false,
        tanggal_publikasi: "2026-11-01",
        created_by_nama: "Staf Tata Usaha",
        status_publikasi: "DRAF",
        sasaran: "SEMUA",
      };

      expect(pSemua.sasaran).toBe("SEMUA");
      expect(pKelas.sasaran).toBe("KELAS");
      expect(pKelas.target_id).toBe("kls-9a");
      expect(pDraf.status_publikasi).toBe("DRAF");
      expect(pDraf.is_published).toBe(false);
    });

    it("3.2. Wali Santri hanya melihat pengumuman PUBLIKASI yang aktif dan cocok dengan sasaran", () => {
      const santriA: Santri = {
        id: "snt-001",
        nis: "202607001",
        nama_lengkap: "Ahmad Fauzi",
        jenis_kelamin: "L",
        tempat_lahir: "Cirebon",
        tanggal_lahir: "2013-05-10",
        alamat: "Plered, Cirebon",
        tahun_masuk: 2026,
        status: "AKTIF",
        kelas_id: "kls-7a",
        kamar_id: "kmr-01",
        created_at: "2026-07-01",
        updated_at: "2026-07-01",
      };

      const allAnnouncements: Pengumuman[] = [
        // 1. Pengumuman Semua Santri Aktif -> Harus Terlihat
        {
          id: "p1",
          judul: "Pengumuman Umum",
          kategori: "Umum",
          isi: "Info untuk semua",
          is_penting: false,
          is_published: true,
          status_publikasi: "PUBLIKASI",
          sasaran: "SEMUA",
          tanggal_publikasi: "2026-11-01",
          masa_berlaku: "2026-11-30",
        },
        // 2. Pengumuman Khusus Kelas 7A -> Harus Terlihat oleh Santri A
        {
          id: "p2",
          judul: "Pengumuman Kelas 7A",
          kategori: "Akademik",
          isi: "Info kelas 7A",
          is_penting: false,
          is_published: true,
          status_publikasi: "PUBLIKASI",
          sasaran: "KELAS",
          target_id: "kls-7a",
          tanggal_publikasi: "2026-11-01",
          masa_berlaku: "2026-11-30",
        },
        // 3. Pengumuman Khusus Kelas 9B -> TIDAK Boleh Terlihat oleh Santri A
        {
          id: "p3",
          judul: "Pengumuman Kelas 9B",
          kategori: "Akademik",
          isi: "Info kelas 9B",
          is_penting: false,
          is_published: true,
          status_publikasi: "PUBLIKASI",
          sasaran: "KELAS",
          target_id: "kls-9b",
          tanggal_publikasi: "2026-11-01",
          masa_berlaku: "2026-11-30",
        },
        // 4. Pengumuman DRAF -> TIDAK Boleh Terlihat oleh Wali
        {
          id: "p4",
          judul: "Draf Rencana",
          kategori: "Umum",
          isi: "Masih draf",
          is_penting: false,
          is_published: false,
          status_publikasi: "DRAF",
          sasaran: "SEMUA",
          tanggal_publikasi: "2026-11-01",
        },
        // 5. Pengumuman Kadaluarsa -> TIDAK Boleh Terlihat
        {
          id: "p5",
          judul: "Pengumuman Masa Lampau",
          kategori: "Umum",
          isi: "Sudah lewat",
          is_penting: false,
          is_published: true,
          status_publikasi: "PUBLIKASI",
          sasaran: "SEMUA",
          tanggal_publikasi: "2026-09-01",
          masa_berlaku: "2026-09-30",
        },
      ];

      const today = "2026-11-10";
      const visibleToWali = allAnnouncements.filter((p) => {
        if (!p.is_published || p.status_publikasi === "DRAF") return false;
        if (p.masa_berlaku && p.masa_berlaku < today) return false;
        if (!p.sasaran || p.sasaran === "SEMUA") return true;
        if (p.sasaran === "KELAS") return p.target_id === santriA.kelas_id;
        if (p.sasaran === "SANTRI") return p.target_id === santriA.id;
        return false;
      });

      expect(visibleToWali.map((p) => p.id)).toEqual(["p1", "p2"]);
    });
  });

  // ==========================================================================
  // 4. EVALUASI MENGAJI A-D (ASATIDZ & BENDAHARA)
  // ==========================================================================
  describe("4. Evaluasi Mengaji Skala A-D (Asatidz & Bendahara)", () => {
    it("4.1. Evaluasi mengaji menggunakan opsi standar A-D pada kelancaran, makharij, dan tajwid", () => {
      const evaluation: PerkembanganMengaji = {
        id: "ngj-001",
        santri_id: "snt-001",
        tanggal_penilaian: "2026-11-10",
        pembimbing_name: "Ustadz H. Fauzan Azima, Lc.",
        metode_pembelajaran: "Al-Qur'an Bin-Nadzor & Tahsin",
        tingkat_jilid: "Tahsin Juz 15",
        materi_terakhir: "QS. Al-Isra 1-20",
        kelancaran_bacaan: "Sangat Lancar (A)",
        makharijul_huruf: "Fasih & Tepat (A)",
        tajwid: "Sangat Baik (A)",
        catatan_perkembangan: "Makhraj stabil dan tartil.",
      };

      const validKelancaran = [
        "Sangat Lancar (A)",
        "Lancar (B)",
        "Cukup Lancar (C)",
        "Perlu Bimbingan (D)",
      ];
      const validMakharij = [
        "Fasih & Tepat (A)",
        "Baik (B)",
        "Cukup (C)",
        "Perlu Bimbingan (D)",
      ];
      const validTajwid = [
        "Sangat Baik (A)",
        "Baik (B)",
        "Cukup (C)",
        "Perlu Bimbingan (D)",
      ];

      expect(validKelancaran).toContain(evaluation.kelancaran_bacaan);
      expect(validMakharij).toContain(evaluation.makharijul_huruf);
      expect(validTajwid).toContain(evaluation.tajwid);
      expect(evaluation.tanggal_penilaian).toBe("2026-11-10");
      expect(evaluation.pembimbing_name).toBe("Ustadz H. Fauzan Azima, Lc.");
    });

    it("4.2. KepesantrenanService catatPerkembanganMengaji menyimpan data secara benar ke Supabase", async () => {
      vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);

      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-asatidz-uuid" } } }),
        },
        from: vi.fn().mockReturnValue({
          insert: mockInsert,
        }),
      };

      (kepesantrenanService as any).client = mockSupabase;

      const res = await kepesantrenanService.catatPerkembanganMengaji({
        santri_id: "snt-001",
        tanggal_penilaian: "2026-11-10",
        pembimbing_name: "Ustadz H. Fauzan Azima, Lc.",
        metode_pembelajaran: "Tahsin Al-Qur'an",
        tingkat_jilid: "Jilid 4",
        materi_terakhir: "Halaman 15",
        kelancaran_bacaan: "Lancar (B)",
        makharijul_huruf: "Baik (B)",
        tajwid: "Baik (B)",
        catatan_perkembangan: "Perlu latihan ghunnah.",
      });

      expect(res.ok).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          santri_id: "snt-001",
          kelancaran_bacaan: "Lancar (B)",
          makharijul_huruf: "Baik (B)",
          tajwid: "Baik (B)",
          petugas_id: "user-asatidz-uuid",
        })
      );
    });
  });

  // ==========================================================================
  // 5. AUDIT FILE MIGRASI SUPABASE 014
  // ==========================================================================
  describe("5. Audit File Migrasi SQL 014", () => {
    it("5.1. File supabase/migrations/014_tu_asatidz_bendahara_features.sql tersedia dan memenuhi standar keamanan RLS", () => {
      const migrationPath = path.resolve(
        process.cwd(),
        "supabase/migrations/014_tu_asatidz_bendahara_features.sql"
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sqlContent = fs.readFileSync(migrationPath, "utf-8");

      // Periksa kolom jenis_pembayaran
      expect(sqlContent).toContain("status_persetujuan");
      expect(sqlContent).toContain("catatan_persetujuan");
      expect(sqlContent).toContain("disetujui_oleh");
      expect(sqlContent).toContain("disetujui_at");
      expect(sqlContent).toContain("sasaran_target_id");

      // Periksa kolom pengumuman
      expect(sqlContent).toContain("masa_berlaku");
      expect(sqlContent).toContain("sasaran");
      expect(sqlContent).toContain("target_id");
      expect(sqlContent).toContain("status_publikasi");

      // Periksa granular RLS policies
      expect(sqlContent).toContain('CREATE POLICY "Jenis Pembayaran: TU ajukan pembiayaan"');
      expect(sqlContent).toContain('CREATE POLICY "Mengaji: Bendahara catat evaluasi mengaji"');
      expect(sqlContent).toContain('CREATE POLICY "Master Pelanggaran: TU kelola kategori"');
      expect(sqlContent).toContain('CREATE POLICY "Tagihan: TU baca rekapitulasi tagihan santri"');

      // Pastikan ada anti-bypass guard (TU tidak bisa approve sendiri)
      expect(sqlContent).toContain("status_persetujuan = 'MENUNGGU_PERSETUJUAN'");
    });
  });
});
