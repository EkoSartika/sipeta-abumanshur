// ============================================================================
// SIPETA — Keuangan Transaksi Endpoint Authorization & Security Test Suite
// Menguji validasi role server-side, isolasi data wali, dan blokir TU/Asatidz
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getTransaksi } from "@/app/api/keuangan/transaksi/route";
import * as serverLib from "@/lib/supabase/server";
import * as clientLib from "@/lib/supabase/client";

describe("SIPETA — Keuangan Transaksi Endpoint Authorization Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(clientLib, "isSupabaseConfigured").mockReturnValue(true);
  });

  // Helper untuk membuat mock Supabase client
  function setupMockSupabase(role: string, waliSantriIds: string[] = ["santri-wali-001"]) {
    const mockUser = { id: `user-${role}-uuid` };
    const mockProfile = { id: mockUser.id, role, is_active: true, nama_lengkap: `User ${role}` };

    const trxQueryBuilder: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };

    const topupQueryBuilder: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };

    const mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          };
        }
        if (table === "wali_santri") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: waliSantriIds.map((id) => ({ santri_id: id })),
                error: null,
              }),
            }),
          };
        }
        if (table === "transaksi_pembayaran") {
          return trxQueryBuilder;
        }
        if (table === "pengajuan_uang_saku") {
          return topupQueryBuilder;
        }
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
      }),
    };

    const mockServerClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
      },
    };

    vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockServerClient as any);
    vi.spyOn(serverLib, "createSupabaseAdminClient").mockReturnValue(mockAdminClient as any);

    return { mockAdminClient, mockServerClient, trxQueryBuilder, topupQueryBuilder };
  }

  // --------------------------------------------------------------------------
  // 1. Uji Penolakan Role Asatidz & TU (HTTP 403)
  // --------------------------------------------------------------------------
  it("1. Asatidz (pengelola) DITOLAK KERAS dengan HTTP 403 saat memanggil GET /api/keuangan/transaksi", async () => {
    setupMockSupabase("pengelola");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Role Asatidz (Pengelola) tidak memiliki wewenang");
  });

  it("2. Tata Usaha (tu) DITOLAK KERAS dengan HTTP 403 saat memanggil GET /api/keuangan/transaksi", async () => {
    setupMockSupabase("tu");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Role Tata Usaha (TU) tidak memiliki wewenang");
  });

  // --------------------------------------------------------------------------
  // 2. Uji Isolasi Data Wali Santri
  // --------------------------------------------------------------------------
  it("3. Wali Santri membaca data santri miliknya (HTTP 200) tanpa query parameter", async () => {
    const { trxQueryBuilder, topupQueryBuilder } = setupMockSupabase("wali", ["santri-a", "santri-b"]);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.transaksiPembayaranList)).toBe(true);
    expect(Array.isArray(json.pengajuanUangSakuList)).toBe(true);

    // Pastikan query transaksi_pembayaran menggunakan filter .in("santri_id", ["santri-a", "santri-b"])
    expect(trxQueryBuilder.in).toHaveBeenCalledWith("santri_id", ["santri-a", "santri-b"]);
    expect(topupQueryBuilder.in).toHaveBeenCalledWith("santri_id", ["santri-a", "santri-b"]);
  });

  it("4. Wali Santri DITOLAK dengan HTTP 403 saat mencoba memanipulasi parameter ?santri_id ke santri milik orang lain", async () => {
    setupMockSupabase("wali", ["santri-wali-resmi"]);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi?santri_id=santri-milik-orang-lain", {
      method: "GET",
    });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("tidak memiliki akses ke data santri tersebut");
  });

  it("5. Wali Santri BERHASIL membaca data jika parameter ?santri_id sesuai dengan santri miliknya", async () => {
    const { trxQueryBuilder, topupQueryBuilder } = setupMockSupabase("wali", ["santri-anak-1", "santri-anak-2"]);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi?santri_id=santri-anak-1", {
      method: "GET",
    });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(trxQueryBuilder.eq).toHaveBeenCalledWith("santri_id", "santri-anak-1");
    expect(topupQueryBuilder.eq).toHaveBeenCalledWith("santri_id", "santri-anak-1");
  });

  // --------------------------------------------------------------------------
  // 3. Uji Hak Akses Bendahara, Pengasuh (Admin), & Superadmin
  // --------------------------------------------------------------------------
  it("6. Bendahara dapat membaca antrean verifikasi dan seluruh transaksi keuangan (HTTP 200)", async () => {
    setupMockSupabase("bendahara");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.transaksiPembayaranList)).toBe(true);
    expect(Array.isArray(json.pengajuanUangSakuList)).toBe(true);
  });

  it("7. Admin (Pengasuh Pondok) mendapatkan akses monitoring (HTTP 200)", async () => {
    setupMockSupabase("admin");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("8. Superadmin mendapatkan akses penuh administratif (HTTP 200)", async () => {
    setupMockSupabase("superadmin");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it("9. Permintaan tanpa autentikasi langsung DITOLAK dengan HTTP 401", async () => {
    const mockServerClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("Unauthorized") }),
      },
    };
    vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockServerClient as any);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });
});
