// ============================================================================
// SIPETA — Keuangan Transaksi Endpoint Authorization & Security Test Suite
// Menguji validasi role server-side, isolasi data wali, dan blokir TU/Asatidz
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as getTransaksi, POST as postTransaksi } from "@/app/api/keuangan/transaksi/route";
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

    const mockRpc = vi.fn();
    const mockServerClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
      rpc: mockRpc,
    };

    vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockServerClient as any);
    vi.spyOn(serverLib, "createSupabaseAdminClient").mockReturnValue(mockAdminClient as any);

    return { mockAdminClient, mockServerClient, mockRpc, trxQueryBuilder, topupQueryBuilder };
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
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    };
    vi.spyOn(serverLib, "createSupabaseServerClient").mockResolvedValue(mockServerClient as any);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", { method: "GET" });
    const res = await getTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 4. Uji Integrasi Atomic RPC pada POST /api/keuangan/transaksi
  // --------------------------------------------------------------------------
  it("10. Asatidz & TU DITOLAK KERAS dengan HTTP 403 saat memanggil POST /api/keuangan/transaksi", async () => {
    setupMockSupabase("pengelola");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({ action: "CHECKOUT_PEMBAYARAN" }),
    });
    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Asatidz (Pengelola) tidak memiliki wewenang");
  });

  it("11. Wali Santri berhasil melakukan checkout tagihan via rpc_checkout_pembayaran_v2", async () => {
    const { mockRpc } = setupMockSupabase("wali", ["santri-001"]);

    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        transaksi_id: "trx-uuid-123",
        nomor_transaksi: "TRX-BYR-20261110-XYZ",
        total_nominal: 150000,
        status: "MENUNGGU_VERIFIKASI",
        message: "Checkout berhasil.",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "CHECKOUT_PEMBAYARAN",
        santri_id: "santri-001",
        items: [{ tagihan_id: "tgh-001", nominal_bayar: 150000 }],
        nama_pengirim: "Fulan bin Fulan",
        bank_pengirim: "BSI",
        bukti_transfer: "santri-001/bukti.jpg",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.transaksi_id).toBe("trx-uuid-123");
    expect(json.nomor_transaksi).toBe("TRX-BYR-20261110-XYZ");

    // Pastikan userClient.rpc dipanggil dengan nama fungsi yang benar dan parameter terpetakan
    expect(mockRpc).toHaveBeenCalledWith("rpc_checkout_pembayaran_v2", {
      p_santri_id: "santri-001",
      p_items: [{ tagihan_id: "tgh-001", nominal_bayar: 150000 }],
      p_tanggal_transfer: expect.any(String),
      p_nama_pengirim: "Fulan bin Fulan",
      p_bank_pengirim: "BSI",
      p_bukti_transfer_path: "santri-001/bukti.jpg",
    });
  });

  it("12. Checkout menolak item keranjang kosong dengan HTTP 400", async () => {
    setupMockSupabase("wali", ["santri-001"]);

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "CHECKOUT_PEMBAYARAN",
        santri_id: "santri-001",
        items: [],
        nama_pengirim: "Fulan",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Keranjang pembayaran masih kosong");
  });

  it("13. Bendahara berhasil menyetujui verifikasi pembayaran via rpc_verifikasi_pembayaran_v2", async () => {
    const { mockRpc } = setupMockSupabase("bendahara");

    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        nomor_transaksi: "TRX-BYR-20261110-XYZ",
        status: "DISETUJUI",
        message: "Pembayaran disetujui.",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "VERIFIKASI_PEMBAYARAN",
        transaksi_id: "trx-uuid-123",
        keputusan: "DISETUJUI",
        catatan: "Dana telah masuk ke rekening BSI pesantren.",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.nomor_transaksi).toBe("TRX-BYR-20261110-XYZ");

    expect(mockRpc).toHaveBeenCalledWith("rpc_verifikasi_pembayaran_v2", {
      p_transaksi_id: "trx-uuid-123",
      p_keputusan: "DISETUJUI",
      p_catatan: "Dana telah masuk ke rekening BSI pesantren.",
    });
  });

  it("14. Bendahara menolak verifikasi pembayaran dengan alasan wajib via rpc_verifikasi_pembayaran_v2", async () => {
    const { mockRpc } = setupMockSupabase("bendahara");

    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        nomor_transaksi: "TRX-BYR-20261110-XYZ",
        status: "DITOLAK",
        message: "Pembayaran ditolak.",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "VERIFIKASI_PEMBAYARAN",
        transaksi_id: "trx-uuid-123",
        keputusan: "DITOLAK",
        catatan: "Bukti transfer buram dan tidak terbaca.",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);

    expect(mockRpc).toHaveBeenCalledWith("rpc_verifikasi_pembayaran_v2", {
      p_transaksi_id: "trx-uuid-123",
      p_keputusan: "DITOLAK",
      p_catatan: "Bukti transfer buram dan tidak terbaca.",
    });
  });

  it("15. Wali Santri DITOLAK dengan HTTP 403 saat mencoba memverifikasi pembayaran", async () => {
    setupMockSupabase("wali");

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "VERIFIKASI_PEMBAYARAN",
        transaksi_id: "trx-uuid-123",
        keputusan: "DISETUJUI",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Hanya Bendahara yang berwenang");
  });

  it("16. Bendahara berhasil menyetujui verifikasi top-up uang saku via rpc_verifikasi_topup_uang_saku_v2", async () => {
    const { mockRpc } = setupMockSupabase("bendahara");

    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        nomor_pengajuan: "TOPUP-20261110-ABC",
        status: "DISETUJUI",
        mutasi_id: "mutasi-uuid-456",
        saldo_akhir: 250000,
        message: "Top-up uang saku berhasil disetujui.",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "VERIFIKASI_TOPUP",
        pengajuan_id: "pengajuan-uuid-456",
        keputusan: "DISETUJUI",
        catatan: "Top-up Rp 100.000 diverifikasi.",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.nomor_pengajuan).toBe("TOPUP-20261110-ABC");
    expect(json.saldo_akhir).toBe(250000);

    expect(mockRpc).toHaveBeenCalledWith("rpc_verifikasi_topup_uang_saku_v2", {
      p_pengajuan_id: "pengajuan-uuid-456",
      p_keputusan: "DISETUJUI",
      p_catatan: "Top-up Rp 100.000 diverifikasi.",
    });
  });

  it("17. Error PostgreSQL dari RPC disanitasi menjadi pesan ramah pengguna tanpa rincian internal", async () => {
    const { mockRpc } = setupMockSupabase("bendahara");

    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "RAISE EXCEPTION 'Pengajuan transaksi ini sudah pernah diverifikasi sebelumnya.'",
      },
    });

    const req = new NextRequest("http://localhost:3000/api/keuangan/transaksi", {
      method: "POST",
      body: JSON.stringify({
        action: "VERIFIKASI_PEMBAYARAN",
        transaksi_id: "trx-uuid-123",
        keputusan: "DISETUJUI",
      }),
    });

    const res = await postTransaksi(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.message).toBe("Pengajuan transaksi ini sudah pernah diverifikasi sebelumnya.");
  });
});
