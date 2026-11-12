// ============================================================================
// SIPETA - Self-Service User Profile & Password Update Endpoint
// Mengelola fitur "Profil Saya" untuk seluruh role (Superadmin, Admin, Bendahara, Pengelola, Wali)
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/utils/auth-mapping";

export const preferredRegion = "sin1";

const updateProfileSchema = z.object({
  nama_lengkap: z.string().min(2, "Nama lengkap minimal 2 karakter.").max(120),
  no_telepon: z.string().optional(),
  old_password: z.string().optional(),
  new_password: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = updateProfileSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message || "Data profil tidak valid." },
        { status: 400 }
      );
    }

    const { nama_lengkap, no_telepon, old_password, new_password } = validation.data;
    const cleanNama = nama_lengkap.trim();
    const cleanTelepon = no_telepon ? no_telepon.trim() : "-";

    // Mode simulasi jika Supabase belum terkonfigurasi
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: "Profil berhasil diperbarui (Mode Demo).",
        data: {
          nama_lengkap: cleanNama,
          no_telepon: cleanTelepon,
        },
      });
    }

    // 1. Verifikasi Autentikasi Pengguna di Server
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { ok: false, message: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali." },
        { status: 401 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    // 2. Ambil profil pengguna saat ini
    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("id, email, username, nama_lengkap, no_telepon, role, is_active")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json(
        { ok: false, message: "Profil pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    if (!profile.is_active) {
      return NextResponse.json(
        { ok: false, message: "Akun Anda berstatus nonaktif. Perubahan profil ditolak." },
        { status: 403 }
      );
    }

    // 3. Jika pengguna ingin mengubah kata sandi
    let passwordChanged = false;
    if (new_password && new_password.trim() !== "") {
      if (!old_password || old_password.trim() === "") {
        return NextResponse.json(
          { ok: false, message: "Kata sandi lama wajib diisi untuk mengubah kata sandi." },
          { status: 400 }
        );
      }

      // Validasi kata sandi lama via auth test client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseAnonKey && user.email) {
        const testClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
        });
        const { error: testErr } = await testClient.auth.signInWithPassword({
          email: user.email,
          password: old_password,
        });

        if (testErr) {
          return NextResponse.json(
            { ok: false, message: "Kata sandi lama yang Anda masukkan tidak cocok." },
            { status: 400 }
          );
        }
      }

      // Validasi kekuatan kata sandi baru
      const pwdCheck = validatePasswordStrength(new_password);
      if (!pwdCheck.valid) {
        return NextResponse.json(
          { ok: false, message: pwdCheck.message || "Kata sandi baru tidak memenuhi syarat keamanan." },
          { status: 400 }
        );
      }

      // Aturan: Password baru tidak boleh sama dengan username / NIS
      if (profile.username && new_password.trim().toLowerCase() === profile.username.trim().toLowerCase()) {
        return NextResponse.json(
          { ok: false, message: "Kata sandi baru tidak boleh sama dengan username/NIS Anda." },
          { status: 400 }
        );
      }

      // Update password di Supabase Auth
      const { error: updatePwdErr } = await adminClient.auth.admin.updateUserById(user.id, {
        password: new_password,
        user_metadata: {
          ...user.user_metadata,
          nama_lengkap: cleanNama,
          full_name: cleanNama,
          no_telepon: cleanTelepon,
        },
      });

      if (updatePwdErr) {
        return NextResponse.json(
          { ok: false, message: `Gagal memperbarui kata sandi: ${updatePwdErr.message}` },
          { status: 500 }
        );
      }

      passwordChanged = true;
    }

    // 4. Update data profil di public.profiles
    const { error: updateProfileErr } = await adminClient
      .from("profiles")
      .update({
        nama_lengkap: cleanNama,
        no_telepon: cleanTelepon,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateProfileErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal memperbarui data profil: ${updateProfileErr.message}` },
        { status: 500 }
      );
    }

    // Update user_metadata jika password tidak diubah
    if (!passwordChanged) {
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          nama_lengkap: cleanNama,
          full_name: cleanNama,
          no_telepon: cleanTelepon,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: passwordChanged
        ? "Profil dan kata sandi Anda berhasil diperbarui."
        : "Profil Anda berhasil diperbarui.",
      data: {
        nama_lengkap: cleanNama,
        no_telepon: cleanTelepon,
        username: profile.username,
        role: profile.role,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Terjadi kesalahan saat memperbarui profil: ${msg}` },
      { status: 500 }
    );
  }
}

