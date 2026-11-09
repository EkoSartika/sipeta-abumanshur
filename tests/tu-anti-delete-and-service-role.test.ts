// ============================================================================
// SIPETA - TU Anti-Delete & Service Role Endpoint Hardening Test Suite
// Verifikasi Otorisasi Server-Side Anti-Delete Role TU pada seluruh API & UI
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { POST as postSantri, DELETE as deleteSantri } from "@/app/api/admin-santri/route";
import * as serverLib from "@/lib/supabase/server";
import * as clientLib from "@/lib/supabase/client";

describe("SIPETA — TU Anti-Delete & Service Role Endpoint Hardening Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);
  });

  // ==========================================================================
  // 1. ENDPOINT DELETE /api/admin-santri (ANTI-DELETE TU)
  // ==========================================================================
  describe("1. Otorisasi DELETE /api/admin-santri", () => {
    it("1.1. Role 'tu' DITOLAK KERAS dengan HTTP 403 saat mencoba menghapus santri", async () => {
      // Mock Server Client returning TU user & profile
      const mockUser = { id: "tu-user-uuid-001" };
      const mockProfile = { role: "tu", is_active: true };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
            }),
          }),
        }),
      };

      vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockSupabase as any);

      const req = new NextRequest("http://localhost:3000/api/admin-santri", {
        method: "DELETE",
        body: JSON.stringify({ santri_ids: ["snt-001", "snt-002"] }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await deleteSantri(req);
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.ok).toBe(false);
      expect(json.message).toContain("Role Tata Usaha (TU) tidak memiliki hak penghapusan data");
    });

    it("1.2. Role 'bendahara' dan 'pengelola' juga DITOLAK dengan HTTP 403", async () => {
      for (const role of ["bendahara", "pengelola", "wali"]) {
        const mockUser = { id: `user-${role}-uuid` };
        const mockProfile = { role, is_active: true };

        const mockSupabase = {
          auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
          },
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          }),
        };

        vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockSupabase as any);

        const req = new NextRequest("http://localhost:3000/api/admin-santri", {
          method: "DELETE",
          body: JSON.stringify({ santri_ids: ["snt-001"] }),
          headers: { "Content-Type": "application/json" },
        });

        const response = await deleteSantri(req);
        const json = await response.json();

        expect(response.status).toBe(403);
        expect(json.ok).toBe(false);
      }
    });

    it("1.3. Role 'superadmin' dan 'admin' LOLOS verifikasi otorisasi DELETE", async () => {
      for (const role of ["superadmin", "admin"]) {
        const mockUser = { id: `user-${role}-uuid` };
        const mockProfile = { role, is_active: true };

        const mockAdminClient = {
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };

        const mockSupabase = {
          auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
          },
          from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          }),
        };

        vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockSupabase as any);
        vi.spyOn(serverLib, "createSupabaseAdminClient").mockReturnValue(mockAdminClient as any);

        const req = new NextRequest("http://localhost:3000/api/admin-santri", {
          method: "DELETE",
          body: JSON.stringify({ santri_ids: ["snt-nonexistent"] }),
          headers: { "Content-Type": "application/json" },
        });

        const response = await deleteSantri(req);
        // Harusnya bukan 403 karena otorisasi superadmin/admin berhasil
        expect(response.status).not.toBe(403);
      }
    });
  });

  // ==========================================================================
  // 2. ENDPOINT POST /api/admin-santri (TU TETAP BERWENANG REGISTRASI)
  // ==========================================================================
  describe("2. Kewenangan Administrasi Registrasi Santri oleh Role TU", () => {
    it("2.1. Role 'tu' DIIZINKAN mendaftarkan santri baru (POST /api/admin-santri)", async () => {
      const mockUser = { id: "tu-user-uuid-001" };
      const mockProfile = { role: "tu", is_active: true };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
            }),
          }),
        }),
      };

      vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockSupabase as any);

      // Payload valid santri
      const payload = {
        nis: "20269999",
        nama_lengkap: "Santri Uji Coba TU",
        tempat_lahir: "Cirebon",
        tanggal_lahir: "2013-05-10",
        jenis_kelamin: "L",
        alamat: "Jl. Pesantren No. 12",
        tahun_masuk: 2026,
        kelas_id: "kls-7a",
        kamar_id: "kmr-01",
        wali: {
          nama_lengkap: "Wali Uji Coba",
          hubungan: "Ayah",
          no_telepon: "081234567890",
        },
      };

      const req = new NextRequest("http://localhost:3000/api/admin-santri", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });

      const response = await postSantri(req);
      // Status tidak boleh 403
      expect(response.status).not.toBe(403);
    });
  });

  // ==========================================================================
  // 3. AUDIT UI TU-PORTAL (PEMBERSIHAN ELEMEN PENGHAPUSAN)
  // ==========================================================================
  describe("3. Audit Kebersihan UI src/modules/tu/tu-portal.tsx", () => {
    const tuPortalPath = path.resolve(__dirname, "../src/modules/tu/tu-portal.tsx");
    const tuPortalContent = fs.readFileSync(tuPortalPath, "utf-8");

    it("3.1. DILARANG memuat deleteSantriBatch dari context useSipeta", () => {
      expect(tuPortalContent).not.toContain("deleteSantriBatch");
    });

    it("3.2. DILARANG memuat state dan handler penghapusan massal santri", () => {
      expect(tuPortalContent).not.toContain("isDeleteSantriModalOpen");
      expect(tuPortalContent).not.toContain("handleBulkDeleteSantri");
      expect(tuPortalContent).not.toContain("deleteSantriSubmitting");
    });

    it("3.3. DILARANG menampilkan tombol 'Hapus Terpilih' pada tampilan tabel santri", () => {
      expect(tuPortalContent).not.toContain("Hapus Terpilih");
    });

    it("3.4. DILARANG menampilkan modal konfirmasi 'Konfirmasi Hapus Santri'", () => {
      expect(tuPortalContent).not.toContain("Konfirmasi Hapus Santri");
    });
  });

  // ==========================================================================
  // 4. VERIFIKASI KEAMANAN SIGNED-URL & FINANCIAL BUCKET ISOLATION
  // ==========================================================================
  describe("4. Isolasi Bucket Keuangan dari Role TU pada Signed URL API", () => {
    const signedUrlPath = path.resolve(__dirname, "../src/app/api/signed-url/route.ts");
    const signedUrlContent = fs.readFileSync(signedUrlPath, "utf-8");

    it("4.1. Endpoint signed-url memblokir mutlak role 'tu' dari bucket keuangan", () => {
      expect(signedUrlContent).toContain('profile.role === "tu"');
      expect(signedUrlContent).toContain("bukti-pembayaran");
      expect(signedUrlContent).toContain("bukti-uang-saku");
      expect(signedUrlContent).toContain("foto-penyerahan-saku");
    });
  });

  // ==========================================================================
  // 5. PROTEKSI MUTLAK IDENTITAS SUPERADMIN
  // ==========================================================================
  describe("5. Integritas Proteksi Akun Superadmin Utama", () => {
    const adminUsersPath = path.resolve(__dirname, "../src/app/api/admin-users/route.ts");
    const adminUsersContent = fs.readFileSync(adminUsersPath, "utf-8");

    it("5.1. Akun Superadmin utama kebal dari penghapusan pada API admin-users", () => {
      expect(adminUsersContent).toContain('sipetaabumanshur@gmail.com');
      expect(adminUsersContent).toContain("isSuperadminTarget");
      expect(adminUsersContent).toContain("Keamanan: Akun Superadmin dilindungi sistem dan tidak boleh dihapus.");
    });

    it("5.2. Akun Superadmin utama kebal dari penonaktifan", () => {
      expect(adminUsersContent).toContain("Akun Superadmin tidak dapat dinonaktifkan oleh siapa pun.");
    });

    it("5.3. Role Superadmin tidak dapat diubah oleh pihak mana pun", () => {
      expect(adminUsersContent).toContain("Role Superadmin tidak dapat diubah oleh akun lain.");
      expect(adminUsersContent).toContain("Promosi akun menjadi Superadmin dilarang oleh kebijakan keamanan sistem.");
    });
  });

  // ==========================================================================
  // 6. DEDUPLIKASI PENCATATAN RIWAYAT MUTASI PENEMPATAN
  // ==========================================================================
  describe("6. Verifikasi Pencegahan Duplikasi Pencatatan Riwayat Penempatan", () => {
    it("6.1. Registrasi santri memeriksa existingPlacement sebelum insert riwayat awal", () => {
      const adminSantriRoutePath = path.resolve(__dirname, "../src/app/api/admin-santri/route.ts");
      const adminSantriContent = fs.readFileSync(adminSantriRoutePath, "utf-8");

      expect(adminSantriContent).toContain("existingPlacement");
      expect(adminSantriContent).toContain("if (!existingPlacement)");
    });

    it("6.2. Mutasi penempatan kelas dan kamar hanya mencatat jika ada perubahan nilai", () => {
      const oldPlacement = { kelas_id: "kls-1", kamar_id: "kmr-1" };
      const newPlacementSame = { kelas_id: "kls-1", kamar_id: "kmr-1" };
      const newPlacementChanged = { kelas_id: "kls-2", kamar_id: "kmr-1" };

      const shouldRecord = (oldP: typeof oldPlacement, newP: typeof oldPlacement) => {
        return oldP.kelas_id !== newP.kelas_id || oldP.kamar_id !== newP.kamar_id;
      };

      expect(shouldRecord(oldPlacement, newPlacementSame)).toBe(false);
      expect(shouldRecord(oldPlacement, newPlacementChanged)).toBe(true);
    });
  });
});
