// ============================================================================
// SIPETA - Endpoint Server Pengelolaan & Informasi Rekening Pesantren
// Mendukung CRUD Sederhana, Persistensi Data, dan Transaksi Atomik
// Pengasuh (admin) & Superadmin: Menambah, Mengedit, Menghapus via RPC Atomik
// Wali Santri, Bendahara, Asatidz: Membaca daftar rekening tersimpan
// Tata Usaha (TU): Ditolak total (403 Forbidden)
// PENTING: Penambahan/Pembaruan informasi rekening TIDAK MENGUBAH status is_active
// dan TIDAK MENGUBAH atau memengaruhi alur checkout pembayaran.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const preferredRegion = "sin1";

// Skema Validasi Input Tambah Rekening Informasi (Tanpa manipulasi is_active)
const tambahRekeningSchema = z.object({
  nama_bank: z.string().min(2, "Nama bank minimal 2 karakter."),
  kode_bank: z.string().optional().nullable(),
  nomor_rekening: z.string().min(5, "Nomor rekening minimal 5 digit."),
  atas_nama: z.string().min(3, "Nama pemilik rekening minimal 3 karakter."),
  catatan_instruksi: z.string().optional().nullable(),
  alasan: z.string().optional().nullable(),
});

// Skema Validasi Input Update / Edit Rekening Informasi (Tanpa manipulasi is_active)
const updateRekeningSchema = z.object({
  id: z.string().uuid("ID Rekening wajib berupa UUID yang valid."),
  nama_bank: z.string().min(2, "Nama bank minimal 2 karakter.").optional().nullable(),
  kode_bank: z.string().optional().nullable(),
  nomor_rekening: z.string().min(5, "Nomor rekening minimal 5 digit.").optional().nullable(),
  atas_nama: z.string().min(3, "Nama pemilik rekening minimal 3 karakter.").optional().nullable(),
  catatan_instruksi: z.string().optional().nullable(),
  alasan: z.string().optional().nullable(),
});

// Skema Validasi Hapus Rekening
const hapusRekeningSchema = z.object({
  rekening_id: z.string().uuid("ID Rekening wajib diisi dan harus berupa UUID."),
  alasan: z.string().optional().nullable(),
});

// Helper Verifikasi Autentikasi & Otorisasi Mutasi (Hanya Pengasuh / Superadmin)
async function verifyPengasuhOrSuperadmin() {
  if (!isSupabaseConfigured()) {
    return { ok: true as const, isDemo: true, userId: "usr-demo-admin", role: "admin" as const, client: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Akses ditolak: Sesi otentikasi tidak ditemukan. Silakan login kembali.",
      client: null,
    };
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profErr || !profile || !profile.is_active) {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Profil pengguna tidak aktif atau tidak ditemukan.",
      client: null,
    };
  }

  if (profile.role !== "superadmin" && profile.role !== "admin") {
    return {
      ok: false as const,
      status: 403,
      message: `Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang mengelola rekening pesantren. Role Anda (${profile.role}) tidak diizinkan.`,
      client: null,
    };
  }

  return { ok: true as const, isDemo: false, userId: user.id, role: profile.role, client: supabase };
}

// Helper Verifikasi Hak Baca Rekening (Pengasuh, Superadmin, Wali, Bendahara, Asatidz diperbolehkan; TU ditolak)
async function verifyRekeningReadAccess() {
  if (!isSupabaseConfigured()) {
    return { ok: true as const, isDemo: true, role: "admin" as const, client: null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Akses ditolak: Sesi otentikasi tidak ditemukan. Silakan login terlebih dahulu.",
      client: null,
    };
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profErr || !profile || !profile.is_active) {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Profil pengguna tidak aktif atau tidak ditemukan.",
      client: null,
    };
  }

  if (profile.role === "tu") {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Staf Tata Usaha (TU) tidak memiliki wewenang mengakses data rekening pesantren.",
      client: null,
    };
  }

  return { ok: true as const, isDemo: false, role: profile.role, client: supabase };
}

// ----------------------------------------------------------------------------
// GET /api/admin/rekening
// Mengambil daftar seluruh rekening yang tersimpan permanen di database
// ----------------------------------------------------------------------------
export async function GET() {
  try {
    const authCheck = await verifyRekeningReadAccess();
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, message: authCheck.message }, { status: authCheck.status });
    }

    if (authCheck.isDemo) {
      return NextResponse.json({
        ok: true,
        data: [],
      });
    }

    // Ambil seluruh rekening dari tabel database dengan urutan terbaru
    const { data: rekeningList, error: queryErr } = await authCheck.client!
      .from("rekening_pesantren")
      .select("*")
      .order("created_at", { ascending: false });

    if (queryErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal memuat rekening pesantren: ${queryErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: rekeningList ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan server saat memuat daftar rekening." },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// POST /api/admin/rekening
// Menambahkan rekening informasi baru secara atomik via RPC SECURITY DEFINER
// Catatan: Tidak mengubah status is_active atau alur checkout.
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const authCheck = await verifyPengasuhOrSuperadmin();
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, message: authCheck.message }, { status: authCheck.status });
    }

    const body = await request.json();
    const validation = tambahRekeningSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input data rekening tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    if (authCheck.isDemo) {
      return NextResponse.json({
        ok: true,
        message: "Rekening pesantren berhasil ditambahkan (Demo Standalone).",
        data: {
          id: `rek-demo-${Date.now()}`,
          nama_bank: payload.nama_bank,
          kode_bank: payload.kode_bank || "451",
          nomor_rekening: payload.nomor_rekening,
          atas_nama: payload.atas_nama,
          catatan_instruksi: payload.catatan_instruksi || "",
          is_active: false,
        },
      });
    }

    // Panggil RPC atomik tambah rekening informasi
    const { data: rpcRes, error: rpcErr } = await authCheck.client!.rpc("rpc_tambah_rekening_pesantren_v1", {
      p_nama_bank: payload.nama_bank,
      p_kode_bank: payload.kode_bank || null,
      p_nomor_rekening: payload.nomor_rekening,
      p_atas_nama: payload.atas_nama,
      p_catatan_instruksi: payload.catatan_instruksi || null,
      p_alasan: payload.alasan || "Penambahan rekening informasi pesantren oleh pimpinan",
    });

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, message: rpcErr.message || "Gagal menambahkan rekening via RPC atomik." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: (rpcRes as any)?.message ?? "Rekening pesantren berhasil ditambahkan secara permanen.",
      data: (rpcRes as any)?.data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan internal server saat memproses rekening." },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PUT /api/admin/rekening
// Mengedit informasi rekening yang sudah ada secara atomik via RPC
// Catatan: Tidak mengubah status is_active atau alur checkout.
// ----------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const authCheck = await verifyPengasuhOrSuperadmin();
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, message: authCheck.message }, { status: authCheck.status });
    }

    const body = await request.json();
    const validation = updateRekeningSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input pembaruan rekening tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    if (authCheck.isDemo) {
      return NextResponse.json({
        ok: true,
        message: "Rekening berhasil diperbarui (Demo Standalone).",
        data: payload,
      });
    }

    // Panggil RPC atomik update rekening
    const { data: rpcRes, error: rpcErr } = await authCheck.client!.rpc("rpc_update_rekening_pesantren_v1", {
      p_rekening_id: payload.id,
      p_nama_bank: payload.nama_bank || null,
      p_kode_bank: payload.kode_bank || null,
      p_nomor_rekening: payload.nomor_rekening || null,
      p_atas_nama: payload.atas_nama || null,
      p_catatan_instruksi: payload.catatan_instruksi || null,
      p_alasan: payload.alasan || "Pembaruan informasi rekening pesantren oleh pimpinan",
    });

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, message: rpcErr.message || "Gagal memperbarui rekening via RPC atomik." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: (rpcRes as any)?.message ?? "Rekening pesantren berhasil diperbarui secara permanen.",
      data: (rpcRes as any)?.data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan server saat memperbarui rekening." },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/admin/rekening
// Menghapus rekening secara atomik dengan perlindungan riwayat transaksi
// ----------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const authCheck = await verifyPengasuhOrSuperadmin();
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, message: authCheck.message }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const alasan = searchParams.get("alasan");

    const validation = hapusRekeningSchema.safeParse({ rekening_id: id, alasan });
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Parameter ID rekening tidak valid." },
        { status: 400 }
      );
    }

    if (authCheck.isDemo) {
      return NextResponse.json({
        ok: true,
        message: "Rekening berhasil dihapus (Mode Standalone/Demo).",
      });
    }

    const { data: rpcRes, error: rpcErr } = await authCheck.client!.rpc("rpc_hapus_rekening_pesantren_v1", {
      p_rekening_id: validation.data.rekening_id,
      p_alasan: validation.data.alasan || null,
    });

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, message: rpcErr.message || "Gagal menghapus rekening." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: (rpcRes as any)?.message ?? "Rekening berhasil dihapus secara aman.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan server saat menghapus rekening." },
      { status: 500 }
    );
  }
}
