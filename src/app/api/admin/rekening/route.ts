// ============================================================================
// SIPETA - Endpoint Server Pengelolaan Rekening Resmi Pesantren
// Khusus Pengasuh (role: admin) dan Superadmin
// Sesuai Bab 3.1 & 3.2 PRD & Standar Keamanan Transaksi Atomik
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

// Skema Validasi Input Pergantian / Aktivasi Rekening
const gantiRekeningSchema = z.object({
  target_rekening_id: z.string().uuid("ID Rekening tidak valid.").optional().nullable(),
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

// Helper Verifikasi Autentikasi & Otorisasi Server
async function verifyPengasuhOrSuperadmin(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return { ok: true, isDemo: true, userId: "usr-demo-admin", role: "admin" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false,
      status: 401,
      message: "Akses ditolak: Sesi otentikasi tidak ditemukan. Silakan login kembali.",
    };
  }

  // Ambil role terverifikasi dari profiles (bukan dari client payload)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profErr || !profile || !profile.is_active) {
    return {
      ok: false,
      status: 403,
      message: "Akses ditolak: Profil pengguna tidak aktif atau tidak ditemukan.",
    };
  }

  if (profile.role !== "superadmin" && profile.role !== "admin") {
    return {
      ok: false,
      status: 403,
      message: `Akses ditolak: Hanya Pengasuh atau Superadmin yang berwenang mengelola rekening resmi pesantren. Role Anda (${profile.role}) tidak diizinkan.`,
    };
  }

  return { ok: true, isDemo: false, userId: user.id, role: profile.role };
}

// ----------------------------------------------------------------------------
// POST /api/admin/rekening
// Mengaktifkan, mengganti, atau menambah rekening resmi secara atomik via RPC
// ----------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const authCheck = await verifyPengasuhOrSuperadmin(request);
    if (!authCheck.ok) {
      return NextResponse.json({ ok: false, message: authCheck.message }, { status: authCheck.status });
    }

    const body = await request.json();
    const validation = gantiRekeningSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input rekening tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    if (authCheck.isDemo) {
      return NextResponse.json({
        ok: true,
        message: "Rekening resmi berhasil diperbarui (Mode Standalone/Demo).",
        data: {
          id: payload.target_rekening_id || `rek-demo-${Date.now()}`,
          nama_bank: payload.nama_bank || "Bank Syariah Indonesia (BSI)",
          nomor_rekening: payload.nomor_rekening || "7198823456",
          atas_nama: payload.atas_nama || "Yayasan Pondok Pesantren Modern Abu Manshur",
          is_active: true,
        },
      });
    }

    // Panggil RPC Database PostgreSQL Atomik dengan kredensial server admin
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Klien administrasi server belum terkonfigurasi." },
        { status: 500 }
      );
    }
    const { data: rpcRes, error: rpcErr } = await adminClient.rpc("rpc_ganti_rekening_resmi_v1", {
      p_target_rekening_id: payload.target_rekening_id || null,
      p_nama_bank: payload.nama_bank || null,
      p_kode_bank: payload.kode_bank || null,
      p_nomor_rekening: payload.nomor_rekening || null,
      p_atas_nama: payload.atas_nama || null,
      p_catatan_instruksi: payload.catatan_instruksi || null,
      p_alasan: payload.alasan || null,
      p_actor_user_id: authCheck.userId,
    });

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, message: rpcErr.message || "Gagal memperbarui rekening resmi pesantren via RPC." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: (rpcRes as any)?.message ?? "Rekening resmi berhasil ditetapkan secara atomik.",
      data: (rpcRes as any)?.rekening_aktif,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan internal server saat memproses rekening." },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// DELETE /api/admin/rekening
// Menghapus rekening cadangan dengan perlindungan riwayat transaksi historis
// ----------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const authCheck = await verifyPengasuhOrSuperadmin(request);
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

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Klien administrasi server belum terkonfigurasi." },
        { status: 500 }
      );
    }
    const { data: rpcRes, error: rpcErr } = await adminClient.rpc("rpc_hapus_rekening_pesantren_v1", {
      p_rekening_id: validation.data.rekening_id,
      p_alasan: validation.data.alasan || null,
      p_actor_user_id: authCheck.userId,
    });

    if (rpcErr) {
      return NextResponse.json(
        { ok: false, message: rpcErr.message || "Gagal menghapus rekening." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: (rpcRes as any)?.message ?? "Rekening cadangan berhasil dihapus secara aman.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error.message || "Terjadi kesalahan server saat menghapus rekening." },
      { status: 500 }
    );
  }
}
