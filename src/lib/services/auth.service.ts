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
import type { UserProfile, UserRole } from "@/types/database";

export interface AuthResponse {
  ok: boolean;
  user?: UserProfile;
  message: string;
}

export class AuthService {
  private client = createSupabaseBrowserClient();

  /**
   * Mendapatkan sesi autentikasi dan profil pengguna saat ini dari Supabase
   */
  async getCurrentProfile(): Promise<UserProfile | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const {
        data: { user },
        error: userError,
      } = await this.client.auth.getUser();

      if (userError || !user) return null;

      // Ambil profil dari tabel public.profiles
      const { data: profile, error: profileError } = await this.client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) return null;

      // Jika akun dinonaktifkan, blokir sesi
      if (!profile.is_active) {
        await this.client.auth.signOut();
        return null;
      }

      let santriId: string | undefined = undefined;
      if (profile.role === "wali") {
        const { data: wali } = await this.client
          .from("wali_santri")
          .select("santri_id")
          .eq("user_id", profile.id)
          .single();
        santriId = wali?.santri_id;
      }

      const cleanUsername = extractUsername(profile.email, profile.username);

      return {
        id: profile.id,
        email: profile.email,
        username: cleanUsername,
        nama_lengkap: profile.nama_lengkap,
        no_telepon: profile.no_telepon ?? "-",
        role: profile.role as UserRole,
        is_active: profile.is_active,
        santri_id: santriId,
        must_change_password: profile.must_change_password === true,
        created_at: profile.created_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Login pengguna menggunakan username (akun internal) atau email resmi (Superadmin)
   */
  async login(identifier: string, kataSandi: string): Promise<AuthResponse> {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        message: "Supabase belum dihubungkan. Gunakan simulasi login di mode Demo.",
      };
    }

    try {
      const { email, displayIdentifier, username } = resolveLoginIdentifier(identifier);

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

      let santriId: string | undefined = undefined;
      if (profile.role === "wali") {
        const { data: wali } = await this.client
          .from("wali_santri")
          .select("santri_id")
          .eq("user_id", profile.id)
          .single();
        santriId = wali?.santri_id;
      }

      const cleanUsername = username ?? extractUsername(profile.email, profile.username);

      const userProfile: UserProfile = {
        id: profile.id,
        email: profile.email,
        username: cleanUsername,
        nama_lengkap: profile.nama_lengkap,
        no_telepon: profile.no_telepon ?? "-",
        role: profile.role as UserRole,
        is_active: profile.is_active,
        santri_id: santriId,
        must_change_password: profile.must_change_password === true,
        created_at: profile.created_at,
      };

      return {
        ok: true,
        user: userProfile,
        message: `Selamat datang, ${profile.nama_lengkap} (${profile.role}).`,
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
  async resetUserPassword(userId: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/admin-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_PASSWORD",
          user_id: userId,
          new_password: newPassword,
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
}

export const authService = new AuthService();
