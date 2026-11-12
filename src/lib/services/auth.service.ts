// ============================================================================
// SIPETA - Supabase Authentication & Profile Service
// Mengelola login username/email, logout, sesi, hak akses role, dan status aktif akun
// Sesuai Kebijakan Identitas & Akun Pengguna Internal PRD
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  extractUsername,
  resolveLoginIdentifier,
} from "@/lib/utils/auth-mapping";
import { getRoleLabel, getRoleLoginUrl } from "@/lib/utils/format";
import type { UserProfile, UserRole } from "@/types/database";

export interface AuthResponse {
  ok: boolean;
  user?: UserProfile;
  message: string;
}

export type AuthSessionCheckResult =
  | { status: "authenticated"; user: UserProfile }
  | { status: "unauthenticated"; reason?: string }
  | { status: "network_error"; error: string };

export class AuthService {
  private client = createSupabaseBrowserClient();

  /**
   * Memeriksa status sesi secara presisi dengan membedakan 3 kondisi:
   * 1. 'authenticated': Sesi Supabase valid & profil aktif
   * 2. 'unauthenticated': Kredensial kosong / sesi tidak ada / akun dinonaktifkan
   * 3. 'network_error': Jaringan terputus / fetch error / Supabase unreachable
   */
  async checkSession(): Promise<AuthSessionCheckResult> {
    if (!isSupabaseConfigured()) {
      return { status: "unauthenticated", reason: "not_configured" };
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await this.client.auth.getUser();

      if (userError) {
        const msg = (userError.message || "").toLowerCase();
        const isNetworkErr =
          msg.includes("failed to fetch") ||
          msg.includes("network") ||
          msg.includes("timeout") ||
          userError.status === 0;

        if (isNetworkErr) {
          return {
            status: "network_error",
            error: userError.message || "Gagal menghubungi server autentikasi Supabase.",
          };
        }

        // AuthSessionMissingError atau 400/401 menandakan memang tidak ada sesi
        return { status: "unauthenticated", reason: userError.message };
      }

      if (!user) {
        return { status: "unauthenticated", reason: "no_user" };
      }

      // Ambil profil dari tabel public.profiles
      const { data: profile, error: profileError } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        const pMsg = (profileError.message || "").toLowerCase();
        const isNetworkErr =
          pMsg.includes("failed to fetch") ||
          pMsg.includes("network") ||
          pMsg.includes("timeout") ||
          profileError.code === "PGRST000";

        if (isNetworkErr) {
          return {
            status: "network_error",
            error: profileError.message || "Koneksi database terputus saat membaca profil.",
          };
        }

        // PGRST116: Baris tidak ditemukan (profil belum dibuat)
        if (profileError.code === "PGRST116") {
          return { status: "unauthenticated", reason: "profile_not_found" };
        }

        return {
          status: "network_error",
          error: profileError.message || "Gagal mengambil data profil.",
        };
      }

      if (!profile) {
        return { status: "unauthenticated", reason: "profile_null" };
      }

      // Jika akun dinonaktifkan, blokir sesi
      if (!profile.is_active) {
        await this.client.auth.signOut();
        return { status: "unauthenticated", reason: "account_inactive" };
      }

      let santriId: string | undefined = undefined;
      let displayNama = profile.nama_lengkap;
      let displayTelepon = profile.no_telepon ?? "-";
      if (profile.role === "wali") {
        try {
          const { data: wali } = await this.client
            .from("wali_santri")
            .select("santri_id, nama_lengkap, no_telepon")
            .eq("user_id", profile.id)
            .single();
          santriId = wali?.santri_id;
          if (wali?.nama_lengkap) displayNama = wali.nama_lengkap;
          if (wali?.no_telepon) displayTelepon = wali.no_telepon;
        } catch {
          // Abaikan kegagalan data relasi santri non-kritis
        }
      }

      const cleanUsername = extractUsername(profile.email, profile.username);

      return {
        status: "authenticated",
        user: {
          id: profile.id,
          email: profile.email,
          username: cleanUsername,
          nama_lengkap: displayNama,
          no_telepon: displayTelepon,
          role: profile.role as UserRole,
          is_active: profile.is_active,
          santri_id: santriId,
          must_change_password: profile.must_change_password === true,
          created_at: profile.created_at,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: "network_error",
        error: msg || "Terjadi kesalahan koneksi tak terduga.",
      };
    }
  }

  /**
   * Mendapatkan sesi autentikasi dan profil pengguna saat ini dari Supabase
   */
  async getCurrentProfile(): Promise<UserProfile | null> {
    const res = await this.checkSession();
    return res.status === "authenticated" ? res.user : null;
  }

  /**
   * Mengambil seluruh profil pengguna dari Supabase (khusus akun internal berwenang)
   */
  async getAllProfiles(): Promise<UserProfile[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      // 1. Coba melalui secure server endpoint GET /api/admin-users
      try {
        const res = await fetch("/api/admin-users", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.ok && Array.isArray(json.data) && json.data.length > 0) {
            return json.data;
          }
        }
      } catch {
        // Fallback ke kueri browser client langsung melalui RLS
      }

      // 2. Kueri browser client langsung melalui RLS
      const { data: profiles, error } = await this.client
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !profiles || profiles.length === 0) return [];

      const { data: waliList } = await this.client
        .from("wali_santri")
        .select("user_id, santri_id");

      const waliMap = new Map<string, string>();
      if (waliList) {
        for (const w of waliList) {
          if (w.user_id && w.santri_id) {
            waliMap.set(w.user_id, w.santri_id);
          }
        }
      }

      return profiles.map((p) => ({
        id: p.id,
        email: p.email,
        username: extractUsername(p.email, p.username),
        nama_lengkap: p.nama_lengkap,
        no_telepon: p.no_telepon ?? "-",
        role: p.role as UserRole,
        is_active: p.is_active,
        santri_id: waliMap.get(p.id),
        must_change_password: p.must_change_password === true,
        created_at: p.created_at,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Login pengguna menggunakan username (akun internal) atau email resmi (Superadmin)
   * Dilengkapi validasi kecocokan role portal (Role Isolation)
   */
  async login(identifier: string, kataSandi: string, expectedRole?: UserRole): Promise<AuthResponse> {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        message: "Supabase belum dihubungkan. Gunakan simulasi login di mode Demo.",
      };
    }

    try {
      const cleanInput = identifier.trim();

      // Jika yang login memasukkan NIS / angka, atau mencoba login wali, lakukan pra-sinkronisasi aman
      if (/^\d{3,}$/.test(cleanInput) || expectedRole === "wali") {
        try {
          await fetch("/api/auth/wali-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: cleanInput }),
          });
        } catch {
          // Lanjutkan alur normal jika fetch lokal gagal
        }
      }

      const { email, displayIdentifier, username } = resolveLoginIdentifier(cleanInput);

      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password: kataSandi,
      });

      if (error || !data.user) {
        return {
          ok: false,
          message: "Username / Email atau kata sandi tidak cocok. Silakan periksa kembali kredensial Anda.",
        };
      }

      // Validasi status akun aktif pada public.profiles
      const { data: profile, error: profileErr } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (profileErr || !profile) {
        await this.client.auth.signOut();
        return {
          ok: false,
          message: "Data profil pengguna tidak ditemukan di database SIPETA.",
        };
      }

      if (!profile.is_active) {
        await this.client.auth.signOut();
        return {
          ok: false,
          message:
            "AKUN DINONAKTIFKAN: Akun pengguna ini telah dinonaktifkan oleh Administrator. Hubungi pihak pesantren untuk aktivasi.",
        };
      }

      // Validasi role di sisi server sesuai halaman portal yang dituju (dengan kompatibilitas pengelola <=> asatidz)
      const isRoleMatching =
        !expectedRole ||
        profile.role === expectedRole ||
        ((expectedRole === "asatidz" || expectedRole === "pengelola") &&
          (profile.role === "pengelola" || profile.role === "asatidz"));

      if (!isRoleMatching) {
        await this.client.auth.signOut();
        const correctPortalName = getRoleLabel(profile.role as UserRole);
        const correctPortalUrl = getRoleLoginUrl(profile.role as UserRole);
        return {
          ok: false,
          message: `Akses ditolak: Akun Anda terdaftar sebagai ${correctPortalName}. Silakan gunakan portal masuk ${correctPortalName} (${correctPortalUrl}).`,
        };
      }

      let santriId: string | undefined = undefined;
      let displayNama = profile.nama_lengkap;
      let displayTelepon = profile.no_telepon ?? "-";
      if (profile.role === "wali") {
        const { data: wali } = await this.client
          .from("wali_santri")
          .select("santri_id, nama_lengkap, no_telepon")
          .eq("user_id", profile.id)
          .single();
        santriId = wali?.santri_id;
        if (wali?.nama_lengkap) displayNama = wali.nama_lengkap;
        if (wali?.no_telepon) displayTelepon = wali.no_telepon;
      }

      const cleanUsername = username ?? extractUsername(profile.email, profile.username);

      const userProfile: UserProfile = {
        id: profile.id,
        email: profile.email,
        username: cleanUsername,
        nama_lengkap: displayNama,
        no_telepon: displayTelepon,
        role: profile.role as UserRole,
        is_active: profile.is_active,
        santri_id: santriId,
        must_change_password: profile.must_change_password === true,
        created_at: profile.created_at,
      };

      return {
        ok: true,
        user: userProfile,
        message: `Selamat datang, ${displayNama} (${profile.role}).`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message: `Gagal melakukan login: ${msg}`,
      };
    }
  }

  /**
   * Logout pengguna dan bersihkan sesi Supabase Auth
   */
  async logout(): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, message: "Berhasil keluar dari mode simulasi." };
    }

    try {
      await this.client.auth.signOut();
      return { ok: true, message: "Sesi berhasil ditutup." };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal logout: ${msg}` };
    }
  }

  /**
   * Pembuatan akun baru oleh Superadmin melalui Secure Server Endpoint (/api/admin-users)
   * Menggunakan Service Role Key secara eksklusif di server, tidak pernah di client.
   */
  async createUserAccount(payload: {
    nama_lengkap: string;
    username: string;
    password: string;
    no_telepon?: string;
    role: UserRole;
    santri_id?: string;
  }): Promise<AuthResponse> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, message: data.message ?? "Gagal membuat akun pengguna." };
      }

      return {
        ok: true,
        user: data.data,
        message: data.message,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg ?? "Terjadi kesalahan jaringan saat membuat akun." };
    }
  }

  /**
   * Reset password pengguna oleh Superadmin melalui Secure Server Endpoint
   */
  async resetUserPassword(
    userId: string,
    newPassword: string,
    mustChangePassword: boolean = true
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_PASSWORD",
          user_id: userId,
          new_password: newPassword,
          must_change_password: mustChangePassword,
        }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Kata sandi berhasil diatur ulang." : "Gagal mengatur ulang kata sandi."),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal reset password: ${msg}` };
    }
  }

  /**
   * Aktifkan atau nonaktifkan akun pengguna oleh Superadmin melalui Secure Server Endpoint
   */
  async toggleUserActive(userId: string, isActive: boolean): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TOGGLE_ACTIVE",
          user_id: userId,
          is_active: isActive,
        }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Status akun berhasil diubah." : "Gagal mengubah status akun."),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal mengubah status akun: ${msg}` };
    }
  }

  /**
   * Pengelolaan Akun Terpadu (Username, Password Baru, Profil, Role, Status) oleh Superadmin
   * Sesuai Bagian A PRD: Satu Modal Terpadu "Kelola Akun"
   */
  async manageUserAccount(
    userId: string,
    payload: {
      nama_lengkap?: string;
      username?: string;
      new_password?: string;
      no_telepon?: string;
      role?: UserRole;
      is_active?: boolean;
      must_change_password?: boolean;
    }
  ): Promise<{ ok: boolean; message: string; updatedUser?: Partial<UserProfile> }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MANAGE_ACCOUNT",
          user_id: userId,
          ...payload,
        }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Informasi akun berhasil diperbarui." : "Gagal memperbarui akun."),
        updatedUser: data.data,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal memperbarui akun: ${msg}` };
    }
  }

  /**
   * Pembaruan data profil akun oleh Superadmin melalui Secure Server Endpoint
   */
  async updateUserProfile(
    userId: string,
    payload: { nama_lengkap: string; no_telepon?: string; role?: UserRole }
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          user_id: userId,
          ...payload,
        }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Profil akun berhasil diperbarui." : "Gagal memperbarui profil akun."),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal memperbarui profil: ${msg}` };
    }
  }

  /**
   * Mengganti password pengguna (khususnya untuk kewajiban must_change_password)
   */
  async changePassword(newPassword: string): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Kata sandi berhasil diperbarui." : "Gagal mengganti kata sandi."),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal ganti kata sandi: ${msg}` };
    }
  }

  /**
   * Hapus atau nonaktifkan akun pengguna oleh Superadmin via Secure Server Endpoint (DELETE /api/admin-users)
   */
  async deleteUserAccount(userId: string): Promise<{ ok: boolean; message: string; actionTaken?: string }> {
    try {
      const res = await fetch(`/api/admin-users?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Akun berhasil diproses." : "Gagal menghapus akun pengguna."),
        actionTaken: data.actionTaken,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal menghapus akun: ${msg}` };
    }
  }

  /**
   * Hapus atau nonaktifkan akun pengguna secara massal oleh Superadmin (DELETE /api/admin-users)
   */
  async deleteUserAccountBatch(userIds: string[]): Promise<{
    ok: boolean;
    message: string;
    results?: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }>;
    summary?: { total: number; deleted: number; deactivated: number; skipped: number; failed: number };
  }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: userIds }),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Penghapusan massal berhasil diproses." : "Gagal memproses penghapusan massal."),
        results: data.results,
        summary: data.summary,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal memproses penghapusan massal: ${msg}` };
    }
  }

  /**
   * Pembaruan profil mandiri dan kata sandi oleh pengguna aktif ("Profil Saya")
   */
  async updateMyProfile(payload: {
    nama_lengkap: string;
    no_telepon?: string;
    old_password?: string;
    new_password?: string;
  }): Promise<{ ok: boolean; message: string; data?: Partial<UserProfile> }> {
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      return {
        ok: res.ok && data.ok,
        message: data.message ?? (res.ok ? "Profil berhasil diperbarui." : "Gagal memperbarui profil."),
        data: data.data,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Gagal memperbarui profil: ${msg}` };
    }
  }
}

export const authService = new AuthService();
