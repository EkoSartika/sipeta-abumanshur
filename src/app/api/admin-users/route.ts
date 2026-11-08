// ============================================================================
// SIPETA - Secure Server-Side Account Provisioning Endpoint
// Eksklusif hanya dapat dipanggil oleh Superadmin terautentikasi
// Sesuai Bab 3.1 & 3.2 PRD & Instruksi Keamanan Server-Side
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

const createUserSchema = z.object({
  nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter."),
  email: z.string().email("Format email tidak valid."),
  no_telepon: z.string().min(10, "Nomor telepon minimal 10 digit."),
  role: z.enum(["superadmin", "admin", "bendahara", "pengelola", "wali"]),
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").optional(),
  santri_id: z.string().uuid("ID Santri tidak valid.").optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = createUserSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    // Mode Simulasi jika project Supabase belum dihubungkan
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: `Akun simulasi ${payload.nama_lengkap} (${payload.role}) berhasil didaftarkan (Mode Demo Standalone).`,
        data: {
          id: `usr-demo-${Date.now()}`,
          nama_lengkap: payload.nama_lengkap,
          email: payload.email,
          role: payload.role,
        },
      });
    }

    // 1. Verifikasi Autentikasi Pemanggil melalui Sesi Server
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: callerUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !callerUser) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu." },
        { status: 401 }
      );
    }

    // 2. Verifikasi Hak Akses: Server-side check ke public.profiles (Anti Privilege Escalation)
    const { data: callerProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== "superadmin" || !callerProfile.is_active) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya Superadmin aktif yang berhak membuat akun pengguna baru." },
        { status: 403 }
      );
    }

    // 3. Validasi Khusus Role Wali: Relasi 1:1 dengan Santri (Bab 2 PRD)
    if (payload.role === "wali") {
      if (!payload.santri_id) {
        return NextResponse.json(
          { ok: false, message: "Akun wali santri wajib dihubungkan dengan 1 santri (santri_id diperlukan)." },
          { status: 400 }
        );
      }

      // Periksa apakah santri sudah memiliki akun wali terdaftar
      const { data: existingWali } = await supabase
        .from("wali_santri")
        .select("id, nama_lengkap")
        .eq("santri_id", payload.santri_id)
        .maybeSingle();

      if (existingWali) {
        return NextResponse.json(
          {
            ok: false,
            message: `Santri ini telah memiliki akun wali terdaftar (${existingWali.nama_lengkap}). Aturan Bab 2 PRD: 1 Santri hanya memiliki 1 akun wali.`,
          },
          { status: 409 }
        );
      }
    }

    // 4. Provisioning Akun melalui Supabase Admin Client (Service Role Key - Server Only)
    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap (SUPABASE_SERVICE_ROLE_KEY missing)." },
        { status: 500 }
      );
    }

    const temporaryPassword = payload.password ?? `AbuManshur@${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: authCreated, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
      },
    });

    if (createAuthErr || !authCreated.user) {
      return NextResponse.json(
        { ok: false, message: `Gagal membuat akun auth: ${createAuthErr?.message}` },
        { status: 400 }
      );
    }

    const newUserId = authCreated.user.id;

    // 5. Simpan profil ke public.profiles
    const { error: insertProfileErr } = await adminClient.from("profiles").insert({
      id: newUserId,
      nama_lengkap: payload.nama_lengkap,
      email: payload.email,
      no_telepon: payload.no_telepon,
      role: payload.role,
      is_active: true,
    });

    if (insertProfileErr) {
      // Rollback auth user jika insert profile gagal
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { ok: false, message: `Gagal membuat profil pengguna: ${insertProfileErr.message}` },
        { status: 500 }
      );
    }

    // 6. Jika Wali, simpan ke public.wali_santri (1:1 relation)
    if (payload.role === "wali" && payload.santri_id) {
      const { error: insertWaliErr } = await adminClient.from("wali_santri").insert({
        user_id: newUserId,
        santri_id: payload.santri_id,
        nama_lengkap: payload.nama_lengkap,
        hubungan: "Wali",
        no_telepon: payload.no_telepon,
        email: payload.email,
        alamat: "Pondok Pesantren Modern Abu Manshur",
      });

      if (insertWaliErr) {
        return NextResponse.json(
          { ok: false, message: `Akun dibuat namun gagal menghubungkan data wali: ${insertWaliErr.message}` },
          { status: 500 }
        );
      }
    }

    // 7. Catat ke Audit Log secara otomatis
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_role: "superadmin",
      aktivitas: "CREATE_USER_ACCOUNT",
      jenis_objek: "profiles",
      objek_id: newUserId,
      data_sesudah: {
        email: payload.email,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
        santri_id: payload.santri_id ?? null,
      },
      alasan_perubahan: "Pembuatan akun resmi oleh Superadmin via Server API",
    });

    return NextResponse.json({
      ok: true,
      message: `Akun ${payload.nama_lengkap} (${payload.role}) berhasil dibuat di Supabase Auth & Profil terdaftar.`,
      data: {
        id: newUserId,
        email: payload.email,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${err.message ?? err}` },
      { status: 500 }
    );
  }
}
