// ============================================================================
// SIPETA - Supabase Authentication & Profile Service
// Mengelola login, logout, sesi, hak akses role, dan status aktif akun
// Sesuai Bagian B PRD & Instruksi Autentikasi
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
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

      return {
        id: profile.id,
        email: profile.email,
        nama_lengkap: profile.nama_lengkap,
        no_telepon: profile.no_telepon,
        role: profile.role as UserRole,
        is_active: profile.is_active,
        santri_id: santriId,
        created_at: profile.created_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Login pengguna menggunakan email dan kata sandi Supabase Auth
   */
  async login(email: string, kataSandi: string): Promise<AuthResponse> {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        message: "Supabase belum dihubungkan. Gunakan simulasi login di mode Demo.",
      };
    }

    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password: kataSandi,
      });

      if (error || !data.user) {
        return {
          ok: false,
          message: error?.message ?? "Email atau kata sandi tidak cocok.",
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
            "AKUN DINONAKTIFKAN: Akun Anda telah dinonaktifkan oleh Administrator. Silakan hubungi bagian administrasi pesantren.",
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

      const userProfile: UserProfile = {
        id: profile.id,
        email: profile.email,
        nama_lengkap: profile.nama_lengkap,
        no_telepon: profile.no_telepon,
        role: profile.role as UserRole,
        is_active: profile.is_active,
        santri_id: santriId,
        created_at: profile.created_at,
      };

      return {
        ok: true,
        user: userProfile,
        message: `Selamat datang, ${profile.nama_lengkap} (${profile.role}).`,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Gagal melakukan login: ${err.message ?? err}`,
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
    } catch (err: any) {
      return { ok: false, message: `Gagal logout: ${err.message ?? err}` };
    }
  }

  /**
   * Pembuatan akun baru oleh Superadmin melalui Secure Server Endpoint (/api/admin-users)
   * Menggunakan Service Role Key secara eksklusif di server, tidak pernah di client.
   */
  async createUserAccount(payload: {
    nama_lengkap: string;
    email: string;
    no_telepon: string;
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
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan jaringan saat membuat akun." };
    }
  }
}

export const authService = new AuthService();
