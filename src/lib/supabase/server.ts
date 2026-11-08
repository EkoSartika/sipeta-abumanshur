// ============================================================================
// SIPETA - Supabase Server Client & Signed URL Helper (Bab 15.5, 15.6, 15.8 PRD)
// Mendukung Secret Key baru (sb_secret_...) dan Legacy Service Role Key (JWT)
// Catatan Keamanan: Secret Key TIDAK PERNAH diekspos ke browser bundle client.
// ============================================================================

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "./client";

/**
 * Mengambil Secret / Service Role Key khusus server runtime.
 * Mendukung format baru (SUPABASE_SECRET_KEY)
 * dan format standar/legacy (SUPABASE_SERVICE_ROLE_KEY).
 * DILARANG menyertakan prefiks NEXT_PUBLIC_ pada variabel ini.
 */
export function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
}

/**
 * Validasi apakah Secret Key server telah terisi dengan format valid
 */
export function isServerAdminConfigured(): boolean {
  const url = getSupabaseUrl();
  const secret = getSupabaseSecretKey();

  if (!url || !secret) return false;
  if (!url.startsWith("https://") || url.includes("your-project-ref") || url.includes("placeholder")) {
    return false;
  }
  if (
    secret.includes("your-service-role") ||
    secret.includes("your-secret-key") ||
    secret.includes("placeholder")
  ) {
    return false;
  }

  // Format secret key baru (sb_secret_...) ATAU legacy JWT (eyJ...)
  const isValidFormat =
    secret.startsWith("sb_secret_") ||
    secret.startsWith("eyJ") ||
    secret.length >= 20;

  return isValidFormat;
}

/**
 * Membuat Supabase Server Client berbasis SSR cookies untuk sesi pengguna
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = isSupabaseConfigured()
    ? getSupabaseUrl()
    : "https://placeholder-sipeta.supabase.co";
  const supabaseKey = isSupabaseConfigured()
    ? getSupabasePublishableKey()
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Diabaikan ketika dipanggil dari Server Component murni
        }
      },
    },
  });
}

/**
 * Server-only Admin Client menggunakan Secret / Service Role Key.
 * HANYA digunakan untuk operasi provisioning akun tingkat tinggi oleh Superadmin
 * pada Route Handler server terproteksi (/api/admin-users).
 * DILARANG KERAS diimpor atau dipanggil dari komponen client browser.
 */
export function createSupabaseAdminClient() {
  if (!isServerAdminConfigured()) {
    return null;
  }

  const supabaseUrl = getSupabaseUrl();
  const secretKey = getSupabaseSecretKey();

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Menghasilkan Signed URL berbatas waktu (default 15 menit / 900 detik)
 * untuk mengakses file dari Private Storage Bucket sesuai Bab 15.5 & 15.6 PRD.
 */
export async function createPrivateSignedUrl(
  bucket:
    | "bukti-pembayaran"
    | "bukti-uang-saku"
    | "foto-penyerahan-saku"
    | "dokumentasi-kepesantrenan",
  filePath: string,
  expiresInSeconds = 900
): Promise<string | null> {
  if (!filePath) return null;
  if (filePath.startsWith("data:") || filePath.startsWith("http")) {
    return filePath;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
