// ============================================================================
// SIPETA - Auth Mapping & Username Identity Utilities
// Menangani pemetaan username non-Gmail ke identitas internal Supabase Auth
// ============================================================================

export const SYNTHETIC_EMAIL_DOMAIN = "akun.sipeta.invalid";

/**
 * Normalisasi username: huruf kecil, trim spasi di awal/akhir
 */
export function normalizeUsername(raw: string): string {
  if (!raw) return "";
  return raw.trim().toLowerCase();
}

/**
 * Validasi format username:
 * - Panjang 3 - 30 karakter
 * - Hanya alfanumerik huruf kecil, angka, titik, strip, underscore
 * - Tidak boleh memuat huruf kapital, spasi, atau simbol dilarang
 */
export function isValidUsername(raw: string): boolean {
  if (!raw) return false;
  if (/\s|[A-Z]/.test(raw)) return false;
  return /^[a-z0-9_.-]{3,30}$/.test(raw);
}

/**
 * Mengubah username menjadi email sintetis internal Supabase
 * Contoh: 'bendahara01' -> 'bendahara01@akun.sipeta.invalid'
 */
export function usernameToInternalEmail(username: string): string {
  const clean = normalizeUsername(username);
  return `${clean}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

/**
 * Memeriksa apakah suatu email merupakan email internal sintetis SIPETA
 */
export function isInternalSyntheticEmail(email: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

/**
 * Ekstrak username dari email atau profil
 */
export function extractUsername(email: string, profileUsername?: string): string {
  if (profileUsername && profileUsername.trim().length > 0) {
    return normalizeUsername(profileUsername);
  }
  if (!email) return "user";
  if (isInternalSyntheticEmail(email)) {
    return normalizeUsername(email.split("@")[0] ?? "");
  }
  if (email.toLowerCase().includes("superadmin") || email.toLowerCase() === "sipetaabumanshur@gmail.com") {
    return "superadmin";
  }
  if (email.includes("@")) {
    return normalizeUsername(email.split("@")[0] ?? "");
  }
  return normalizeUsername(email);
}

/**
 * Menyelesaikan identifier login pengguna:
 * - Jika input mengandung '@', diasumsikan sebagai email login resmi (Superadmin).
 * - Jika input berupa username tanpa '@', dipetakan ke email sintetis internal.
 */
export function resolveLoginIdentifier(input: string): {
  isSuperadminEmail: boolean;
  email: string;
  displayIdentifier: string;
  username?: string;
} {
  const trimmed = input.trim();
  if (trimmed.includes("@")) {
    const cleanEmail = trimmed.toLowerCase();
    return {
      isSuperadminEmail: true,
      email: cleanEmail,
      displayIdentifier: cleanEmail,
      username: extractUsername(cleanEmail),
    };
  }

  const cleanUsername = normalizeUsername(trimmed);
  const syntheticEmail = usernameToInternalEmail(cleanUsername);
  return {
    isSuperadminEmail: false,
    email: syntheticEmail,
    displayIdentifier: `@${cleanUsername}`,
    username: cleanUsername,
  };
}

/**
 * Validasi kekuatan kata sandi:
 * - Minimal 8 karakter
 * - Mengandung huruf dan angka
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message?: string;
  error?: string;
} {
  if (!password || password.length < 8) {
    const msg = "Kata sandi minimal 8 karakter alfanumerik.";
    return { valid: false, message: msg, error: msg };
  }
  if (!/[a-zA-Z]/.test(password)) {
    const msg = "Kata sandi wajib mengandung setidaknya satu huruf.";
    return { valid: false, message: msg, error: msg };
  }
  if (!/[0-9]/.test(password)) {
    const msg = "Kata sandi wajib mengandung setidaknya satu angka.";
    return { valid: false, message: msg, error: msg };
  }
  return { valid: true };
}
