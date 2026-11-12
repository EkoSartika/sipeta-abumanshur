// ============================================================================
// SIPETA - API Health Check Endpoint (/api/health)
// Memeriksa status konektivitas database nyata (PostgreSQL / Supabase)
// ============================================================================

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export const preferredRegion = "sin1";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const isConfigured = isSupabaseConfigured();

  if (!isConfigured) {
    const hasUrl = Boolean(getSupabaseUrl());
    const hasKey = Boolean(getSupabasePublishableKey());

    return NextResponse.json({
      status: "simulation",
      connectionState: "NOT_CONFIGURED",
      mode: "standalone_demo",
      message: "MODE SIMULASI — Supabase Environment Variables belum lengkap atau belum di-Redeploy di Vercel.",
      diagnostics: {
        hasSupabaseUrl: hasUrl,
        hasSupabaseKey: hasKey,
        hint:
          !hasUrl || !hasKey
            ? "Pastikan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau NEXT_PUBLIC_SUPABASE_ANON_KEY) diset di Vercel Settings > Environment Variables, lalu lakukan REDEPLOY."
            : "Format URL atau Key tidak valid. URL harus diawali https:// dan Key minimal 20 karakter.",
      },
      checkedAt,
    });
  }

  const startTime = Date.now();

  try {
    const supabase = await createSupabaseServerClient();
    // Gunakan tabel pengumuman (tabel resmi publik dengan GRANT SELECT ke anon)
    // Hindari tabel keuangan rekening_pesantren yang memiliki hak akses terbatas (REVOKE SELECT dari anon)
    const { data, error, count } = await supabase
      .from("pengumuman")
      .select("id, judul", { count: "exact" })
      .limit(1);

    const latencyMs = Date.now() - startTime;

    if (error) {
      const isTableNotCreated =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message?.toLowerCase().includes("could not find the table") ||
        error.message?.toLowerCase().includes("does not exist") ||
        error.message?.toLowerCase().includes("relation") ||
        error.details?.toLowerCase().includes("does not exist");

      if (isTableNotCreated) {
        return NextResponse.json({
          status: "connected_unmigrated",
          connectionState: "CONNECTED_UNMIGRATED",
          schemaStatus: "TABLES_MISSING",
          mode: "supabase_live",
          latencyMs,
          message:
            "Koneksi berhasil ke PostgreSQL Supabase, namun skema tabel belum dimigrasikan (perlu menjalankan migrasi 0001–012).",
          checkedAt,
        });
      }

      return NextResponse.json(
        {
          status: "connection_error",
          connectionState: "CONNECTION_FAILED",
          schemaStatus: "UNREACHABLE",
          mode: "demo_local_fallback",
          message: `Koneksi database gagal: ${error.message}`,
          latencyMs,
          checkedAt,
        },
        { status: 503 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        status: "schema_ready_empty",
        connectionState: "CONNECTED_EMPTY_DATA",
        schemaStatus: "SCHEMA_READY_EMPTY",
        mode: "supabase_live",
        latencyMs,
        recordCount: 0,
        message:
          "Database terhubung dan skema tabel sudah siap/termigrasi, namun tabel master masih kosong (siap digunakan operasional).",
        checkedAt,
      });
    }

    return NextResponse.json({
      status: "healthy",
      connectionState: "CONNECTED_HEALTHY",
      schemaStatus: "SCHEMA_READY_WITH_DATA",
      mode: "supabase_live",
      latencyMs,
      recordCount: count ?? data.length,
      message: `Database PostgreSQL khusus SIPETA aktif (${latencyMs}ms). Data master terverifikasi.`,
      checkedAt,
    });
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        status: "network_error",
        connectionState: "CONNECTION_FAILED",
        mode: "demo_local_fallback",
        message: `Kendala jaringan menghubungi database: ${err.message ?? err}`,
        latencyMs,
        checkedAt,
      },
      { status: 500 }
    );
  }
}
