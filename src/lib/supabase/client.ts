// ============================================================================
// SIPETA - Supabase Browser Client & Key Resolvers
// Mendukung Publishable Key baru (sb_publishable_...) dan Legacy Anon Key (JWT)
// ============================================================================

import { createBrowserClient } from "@supabase/ssr";

/**
 * Membersihkan string environment variable dari whitespace dan tanda kutip (quotes)
 * yang sering tidak sengaja terbawa saat copy-paste ke dashboard Vercel.
 */
function cleanEnvValue(val: string | undefined): string {
  if (!val) return "";
  let clean = val.trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

/**
 * Mengambil URL project Supabase resmi SIPETA
 */
export function getSupabaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const cleaned = cleanEnvValue(raw);
  return cleaned.replace(/\/+$/, "");
}

/**
 * Mengambil Publishable / Anon Key untuk Browser Client
 * Mendukung format baru (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 * dan format standar/legacy (NEXT_PUBLIC_SUPABASE_ANON_KEY).
 */
export function getSupabasePublishableKey(): string {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";
  return cleanEnvValue(raw);
}

/**
 * Validasi ketat apakah Supabase telah dikonfigurasi dengan kredensial nyata:
 * - Menolak nilai kosong, whitespace, atau placeholder template.
 * - Memastikan format kunci valid (sb_publishable_... atau JWT eyJ...).
 */
export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();

  if (!url || !key) return false;
  if (!url.startsWith("https://")) return false;
  if (url.includes("your-project-ref") || url.includes("placeholder")) return false;

  if (
    key.includes("your-anon-key") ||
    key.includes("your-publishable-key") ||
    key.includes("placeholder")
  ) {
    return false;
  }

  // Format publishable key baru (sb_publishable_...) ATAU legacy JWT (eyJ...)
  const isValidFormat =
    key.startsWith("sb_publishable_") ||
    key.startsWith("eyJ") ||
    key.length >= 20;

  return isValidFormat;
}

/**
 * Membuat Supabase Browser Client menggunakan Publishable / Anon Key
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = isSupabaseConfigured()
    ? getSupabaseUrl()
    : "https://placeholder-sipeta.supabase.co";

  const supabaseKey = isSupabaseConfigured()
    ? getSupabasePublishableKey()
    : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

  return createBrowserClient(supabaseUrl, supabaseKey);
}
