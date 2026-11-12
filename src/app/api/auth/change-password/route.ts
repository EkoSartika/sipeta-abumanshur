// ============================================================================
// SIPETA - Server-Side Change Password Endpoint
// Mengelola kewajiban must_change_password bagi Wali Santri pada login pertama kali
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { validatePasswordStrength } from "@/lib/utils/auth-mapping";

export const preferredRegion = "sin1";

const changePasswordSchema = z.object({
  new_password: z.string().min(8, "Kata sandi baru minimal 8 karakter."),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = changePasswordSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message || "Input tidak valid." },
        { status: 400 }
      );
    }

    const { new_password } = validation.data;

    // 1. Validasi kekuatan kata sandi baru (minimal 8 karakter alfanumerik)
    const pwdCheck = validatePasswordStrength(new_password);
    if (!pwdCheck.valid) {
      return NextResponse.json(
        { ok: false, message: pwdCheck.message || "Kata sandi baru tidak memenuhi syarat keamanan." },
        { status: 400 }
      );
    }

    // Mode simulasi jika Supabase belum terkonfigurasi
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: "Kata sandi berhasil diperbarui (Mode Demo).",
      });
    }

    // 2. Verifikasi Autentikasi Pengguna di Server
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { ok: false, message: "Sesi tidak valid. Silakan login kembali." },
        { status: 401 }
      );
    }

    // 3. Ambil profil pengguna
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("id, username, nama_lengkap, role, must_change_password")
      .eq("id", user.id)
      .single();

    if (profErr || !profile) {
      return NextResponse.json(
        { ok: false, message: "Profil pengguna tidak ditemukan." },
        { status: 404 }
      );
    }

    // 4. Aturan Wajib: Password baru TIDAK BOLEH sama dengan NIS / Username
    if (profile.username && new_password.trim() === profile.username.trim()) {
      return NextResponse.json(
        {
          ok: false,
          message: "Kata sandi baru tidak boleh sama dengan NIS Anda. Gunakan kata sandi pribadi yang unik.",
        },
        { status: 400 }
      );
    }

    // 5. Update password di Supabase Auth
    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(user.id, {
      password: new_password,
      user_metadata: {
        must_change_password: false,
      },
    });

    if (updateAuthErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal memperbarui kata sandi: ${updateAuthErr.message}` },
        { status: 500 }
      );
    }

    // 6. Tandai must_change_password = FALSE pada tabel profiles
    const { error: updateProfErr } = await adminClient
      .from("profiles")
      .update({
        must_change_password: false,
      })
      .eq("id", user.id);

    if (updateProfErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal memperbarui status profil: ${updateProfErr.message}` },
        { status: 500 }
      );
    }

    // 7. Catat ke Audit Log (Tanpa password)
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      user_nama: profile.nama_lengkap,
      user_role: profile.role,
      aktivitas: "GANTI_PASSWORD_PERTAMA_KALI",
      jenis_objek: "USER_AUTH",
      objek_id: user.id,
      alasan_perubahan: "Wali berhasil mengganti kata sandi awal (NIS) menjadi kata sandi pribadi.",
      waktu: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      message: "Kata sandi Anda berhasil diperbarui. Selamat datang di portal SIPETA!",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal server.";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

