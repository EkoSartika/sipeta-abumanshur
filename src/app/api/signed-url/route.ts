// ============================================================================
// SIPETA - Secure Signed URL Generator with Strict Role Authorization
// Mencegah akses tidak sah terhadap dokumen privat santri & bukti keuangan
// Sesuai Bab 15.5, 15.6, 15.12 PRD & Instruksi Keamanan Storage
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createPrivateSignedUrl, createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

// Rate Limiter Sederhana di Level IP (Mencegah Brute Force Enumeration)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxRequests = 40, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = requestCounts.get(ip);
  if (!current || now > current.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  return true;
}

const VALID_BUCKETS = [
  "bukti-pembayaran",
  "bukti-uang-saku",
  "foto-penyerahan-saku",
  "dokumentasi-kepesantrenan",
] as const;

type ValidBucket = (typeof VALID_BUCKETS)[number];

export async function POST(request: NextRequest) {
  const rawIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const clientIp = rawIp || "local";
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan tanda tangan dokumen. Silakan tunggu beberapa saat." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      bucket?: ValidBucket;
      filePath?: string;
    };

    if (!body.bucket || !body.filePath) {
      return NextResponse.json(
        { error: "Parameter bucket dan filePath wajib diisi." },
        { status: 400 }
      );
    }

    if (!VALID_BUCKETS.includes(body.bucket)) {
      return NextResponse.json(
        { error: "Bucket penyimpanan tidak dikenal atau tidak diizinkan." },
        { status: 400 }
      );
    }

    // 1. Sanitasi Path File (Mencegah Directory Traversal & Null Byte Injection)
    const cleanPath = body.filePath.trim();
    if (
      cleanPath.includes("..") ||
      cleanPath.startsWith("/") ||
      cleanPath.startsWith("\\") ||
      cleanPath.includes("\0")
    ) {
      return NextResponse.json(
        { error: "Path file tidak valid atau mengandung karakter terlarang." },
        { status: 400 }
      );
    }

    // Mode Simulasi Lokal (jika belum terhubung ke project Supabase nyata)
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        signedUrl: cleanPath,
        expiresIn: 900,
        mode: "standalone_demo",
      });
    }

    // 2. Verifikasi Autentikasi Pengguna di Sisi Server
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Akses ditolak: Anda harus login untuk mengakses dokumen ini." },
        { status: 401 }
      );
    }

    // 3. Verifikasi Profil & Status Aktif Pengguna
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role, is_active, must_change_password")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile || !profile.is_active) {
      return NextResponse.json(
        { error: "Akses ditolak: Akun pengguna tidak ditemukan atau telah dinonaktifkan." },
        { status: 403 }
      );
    }

    // Blokir jika wali belum mengganti password awal
    if (profile.role === "wali" && profile.must_change_password) {
      return NextResponse.json(
        {
          error:
            "Akses ditolak: Anda wajib mengganti kata sandi awal terlebih dahulu sebelum mengakses dokumen privat.",
          must_change_password: true,
        },
        { status: 403 }
      );
    }

    // 4. Otorisasi Spesifik Berdasarkan Role & Relasi Santri (Least Privilege)
    // a. Pengelola Kepesantrenan DIBLOKIR MUTLAK dari seluruh bucket keuangan
    if (
      profile.role === "pengelola" &&
      (body.bucket === "bukti-pembayaran" ||
        body.bucket === "bukti-uang-saku" ||
        body.bucket === "foto-penyerahan-saku")
    ) {
      return NextResponse.json(
        { error: "Akses ditolak: Pengelola Kepesantrenan tidak memiliki hak akses terhadap arsip keuangan." },
        { status: 403 }
      );
    }

    // b. Wali Santri HANYA berhak mengakses dokumen yang terkait dengan santrinya
    // atau dokumen edaran/publik pada dokumentasi-kepesantrenan
    if (profile.role === "wali") {
      const isGeneralDokumen =
        body.bucket === "dokumentasi-kepesantrenan" &&
        (cleanPath.startsWith("umum/") ||
          cleanPath.startsWith("publik/") ||
          cleanPath.startsWith("pengumuman/") ||
          cleanPath.startsWith("edaran/") ||
          cleanPath.startsWith("arsip/"));

      if (!isGeneralDokumen) {
        const { data: wali } = await supabase
          .from("wali_santri")
          .select("santri_id")
          .eq("user_id", profile.id)
          .single();

        if (!wali || !wali.santri_id) {
          return NextResponse.json(
            { error: "Akses ditolak: Profil wali tidak terhubung dengan data santri sah." },
            { status: 403 }
          );
        }

        // Validasi kepemilikan path: file wajib berada di folder santri ID atau diawali dengan santri ID
        const expectedPrefix = wali.santri_id;
        if (!cleanPath.startsWith(expectedPrefix) && !cleanPath.includes(expectedPrefix)) {
          return NextResponse.json(
            { error: "Akses ditolak: Anda tidak memiliki wewenang untuk melihat dokumen santri lain." },
            { status: 403 }
          );
        }
      }
    }

    // 5. Terbitkan Signed URL berbatas waktu 15 Menit (900 Detik)
    const signedUrl = await createPrivateSignedUrl(body.bucket, cleanPath, 900);
    if (!signedUrl) {
      return NextResponse.json(
        { error: "Gagal membuat Signed URL atau file tidak ditemukan di storage." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      signedUrl,
      expiresIn: 900,
      bucket: body.bucket,
    });
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses tanda tangan dokumen." },
      { status: 500 }
    );
  }
}
