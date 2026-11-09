// ============================================================================
// SIPETA - Health Check & Real Connection Verification Service
// Memverifikasi status koneksi aktual ke database PostgreSQL Supabase
// Sesuai Bagian E Audit Pra-Supabase & Instruksi Health Check
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type ConnectionState =
  | "NOT_CONFIGURED"         // Config belum ada / masih placeholder
  | "CONNECTION_FAILED"      // Jaringan gagal / kredensial tidak valid
  | "CONNECTED_EMPTY_SCHEMA" // Legacy fallback untuk kompatibilitas
  | "CONNECTED_UNMIGRATED"   // Terhubung ke PostgreSQL, tetapi tabel belum dibuat (42P01 / PGRST205)
  | "CONNECTED_EMPTY_DATA"   // Skema tabel sudah siap & termigrasi, namun data tabel masih 0 baris
  | "CONNECTED_HEALTHY";     // Terhubung aktif & data master operasional siap

export interface DatabaseHealthStatus {
  isConfigured: boolean;
  isConnected: boolean;
  connectionState: ConnectionState;
  schemaStatus?: "TABLES_MISSING" | "SCHEMA_READY_EMPTY" | "SCHEMA_READY_WITH_DATA" | "NOT_CONFIGURED" | "UNREACHABLE";
  mode: "supabase_live" | "demo_local";
  latencyMs?: number;
  databaseVersion?: string;
  recordCount?: number;
  message: string;
  error?: string;
  checkedAt: string;
}

/**
 * Melakukan ping aktual ke database Supabase untuk membuktikan status koneksi nyata:
 * 1. Mendeteksi jika environment variables belum dikonfigurasi.
 * 2. Mendeteksi kegagalan koneksi jaringan atau otentikasi key.
 * 3. Mendeteksi jika database terhubung tetapi belum memiliki data / schema belum dimigrasikan (42P01).
 * 4. Mengukur latensi round-trip jika database sehat dan operasional.
 */
export async function checkSupabaseHealth(
  customClient?: ReturnType<typeof createSupabaseBrowserClient>
): Promise<DatabaseHealthStatus> {
  const configured = isSupabaseConfigured();
  const checkedAt = new Date().toISOString();

  // Kasus 1: Konfigurasi belum diisi (Menunggu Project Supabase Khusus)
  if (!configured) {
    return {
      isConfigured: false,
      isConnected: false,
      connectionState: "NOT_CONFIGURED",
      mode: "demo_local",
      message: "MODE SIMULASI — MENUNGGU PROJECT SUPABASE KHUSUS",
      checkedAt,
    };
  }

  const startTime = Date.now();
  const client = customClient ?? createSupabaseBrowserClient();

  try {
    // Query ringan ke tabel publik pengumuman (aman dan diizinkan untuk role anon / unauthenticated)
    // Sesuai Bab 15.3 PRD: pengumuman adalah tabel publik dengan GRANT SELECT ke anon & RLS is_published = true.
    // Menghindari tabel keuangan sensitif (rekening_pesantren) yang diproteksi REVOKE SELECT dari anon.
    const { data, error, count } = await client
      .from("pengumuman")
      .select("id, judul", { count: "exact" })
      .limit(1);

    const latencyMs = Date.now() - startTime;

    // Kasus 2: Penanganan Error dari Server Supabase / PostgreSQL
    if (error) {
      // Deteksi khusus: Terhubung ke Postgres, tetapi tabel belum dibuat (PostgreSQL 42P01 / PostgREST PGRST205)
      const isTableNotCreated =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message?.toLowerCase().includes("could not find the table") ||
        error.message?.toLowerCase().includes("does not exist") ||
        error.message?.toLowerCase().includes("relation") ||
        error.details?.toLowerCase().includes("does not exist");

      if (isTableNotCreated) {
        return {
          isConfigured: true,
          isConnected: true,
          connectionState: "CONNECTED_UNMIGRATED",
          schemaStatus: "TABLES_MISSING",
          mode: "supabase_live",
          latencyMs,
          recordCount: 0,
          databaseVersion: "PostgreSQL 15+ (Supabase Managed - Belum Migrasi)",
          message:
            "Koneksi berhasil ke PostgreSQL Supabase, namun skema tabel belum dimigrasikan (siap menjalankan migrasi 0001–012).",
          checkedAt,
        };
      }

      // Kasus 2b: Error koneksi riil (Invalid Key, 401/403, Network down)
      return {
        isConfigured: true,
        isConnected: false,
        connectionState: "CONNECTION_FAILED",
        schemaStatus: "UNREACHABLE",
        mode: "demo_local",
        latencyMs,
        message: `Koneksi ke Supabase gagal: ${error.message}`,
        error: error.message,
        checkedAt,
      };
    }

    // Kasus 3: Tabel sudah ada dan skema siap, namun belum diisi data awal
    if (!data || data.length === 0) {
      return {
        isConfigured: true,
        isConnected: true,
        connectionState: "CONNECTED_EMPTY_DATA",
        schemaStatus: "SCHEMA_READY_EMPTY",
        mode: "supabase_live",
        latencyMs,
        recordCount: 0,
        databaseVersion: "PostgreSQL 15+ (Supabase Managed - Skema Siap, Data Kosong)",
        message:
          "Terhubung ke database dan skema tabel sudah siap, namun tabel master belum berisi data (siap input operasional).",
        checkedAt,
      };
    }

    // Kasus 4: Terhubung aktif & data master operasional siap
    return {
      isConfigured: true,
      isConnected: true,
      connectionState: "CONNECTED_HEALTHY",
      schemaStatus: "SCHEMA_READY_WITH_DATA",
      mode: "supabase_live",
      latencyMs,
      recordCount: count ?? data.length,
      databaseVersion: "PostgreSQL 15+ (Supabase Managed - Operasional)",
      message: `Terhubung aktif ke database khusus SIPETA (${latencyMs}ms). Data master terverifikasi.`,
      checkedAt,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return {
      isConfigured: true,
      isConnected: false,
      connectionState: "CONNECTION_FAILED",
      mode: "demo_local",
      latencyMs,
      message: `Kesalahan jaringan saat menghubungi Supabase: ${err.message ?? err}`,
      error: err.message ?? String(err),
      checkedAt,
    };
  }
}
