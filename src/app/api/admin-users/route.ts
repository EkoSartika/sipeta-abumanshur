// ============================================================================
// SIPETA - Secure Server-Side Account Provisioning & Management Endpoint
// Eksklusif hanya dapat dipanggil oleh Superadmin terautentikasi
// Sesuai Bab 3.1 & 3.2 PRD & Kebijakan Akun Internal Username
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";

const createUserSchema = z.object({
  nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter."),
  username: z
    .string()
    .min(3, "Username minimal 3 karakter.")
    .max(30, "Username maksimal 30 karakter.")
    .optional(),
  email: z.string().email("Format email tidak valid.").optional(),
  no_telepon: z.string().min(8, "Nomor telepon minimal 8 digit.").optional().default("-"),
  role: z.enum(["superadmin", "admin", "bendahara", "pengelola", "wali"]),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
  santri_id: z.string().uuid("ID Santri tidak valid.").optional(),
});

const patchUserSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RESET_PASSWORD"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    new_password: z.string().min(8, "Kata sandi baru minimal 8 karakter."),
  }),
  z.object({
    action: z.literal("TOGGLE_ACTIVE"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    is_active: z.boolean(),
  }),
  z.object({
    action: z.literal("UPDATE_PROFILE"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter.").optional(),
    no_telepon: z.string().min(8, "Nomor telepon minimal 8 digit.").optional(),
    role: z.enum(["superadmin", "admin", "bendahara", "pengelola", "wali"]).optional(),
  }),
]);

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

    // Password validation check
    const pwdStrength = validatePasswordStrength(payload.password);
    if (!pwdStrength.valid) {
      return NextResponse.json(
        { ok: false, message: pwdStrength.message },
        { status: 400 }
      );
    }

    // Resolusi email & username berdasarkan kebijakan internal
    let finalUsername: string | undefined;
    let finalEmail: string;

    if (payload.role === "superadmin") {
      // Superadmin tetap menggunakan email resmi terdaftar
      if (!payload.email) {
        return NextResponse.json(
          { ok: false, message: "Email resmi wajib disertakan untuk pembuatan akun Superadmin." },
          { status: 400 }
        );
      }
      finalEmail = payload.email.trim().toLowerCase();
      finalUsername = payload.username ? normalizeUsername(payload.username) : finalEmail.split("@")[0];
    } else {
      // Akun internal (admin, bendahara, pengelola, wali): wajib username, email sintetis .invalid
      if (!payload.username) {
        return NextResponse.json(
          { ok: false, message: "Username wajib diisi untuk akun pengguna internal." },
          { status: 400 }
        );
      }
      finalUsername = normalizeUsername(payload.username);
      if (!isValidUsername(finalUsername)) {
        return NextResponse.json(
          {
            ok: false,
            message: "Username hanya boleh memuat huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter.",
          },
          { status: 400 }
        );
      }
      finalEmail = usernameToInternalEmail(finalUsername);
    }

    // Mode Simulasi jika project Supabase belum dihubungkan
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: `Akun ${payload.nama_lengkap} (${payload.role}) dengan username '${finalUsername}' berhasil didaftarkan (Mode Demo Standalone).`,
        data: {
          id: `usr-demo-${Date.now()}`,
          nama_lengkap: payload.nama_lengkap,
          username: finalUsername,
          email: finalEmail,
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
        { ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu sebagai Superadmin." },
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

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY missing)." },
        { status: 500 }
      );
    }

    // 3. Verifikasi Unik Username dan Email di Tabel Profiles
    if (finalUsername) {
      const { data: existingUser } = await adminClient
        .from("profiles")
        .select("id, username")
        .eq("username", finalUsername)
        .maybeSingle();

      if (existingUser) {
        return NextResponse.json(
          { ok: false, message: `Username '${finalUsername}' sudah digunakan. Pilih username lain.` },
          { status: 409 }
        );
      }
    }

    const { data: existingEmail } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("email", finalEmail)
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json(
        { ok: false, message: `Email / Username sudah terdaftar di sistem (${finalEmail}).` },
        { status: 409 }
      );
    }

    // 4. Validasi Khusus Role Wali: Relasi 1:1 dengan Santri (Bab 2 PRD)
    if (payload.role === "wali") {
      if (!payload.santri_id) {
        return NextResponse.json(
          { ok: false, message: "Akun wali santri wajib dihubungkan dengan 1 santri (santri_id diperlukan)." },
          { status: 400 }
        );
      }

      // Periksa apakah santri sudah memiliki akun wali terdaftar
      const { data: existingWali } = await adminClient
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

    // 5. Provisioning Akun melalui Supabase Admin Client (Service Role Key - Server Only)
    // Email otomatis dikonfirmasi (email_confirm: true), tidak ada email undangan/verifikasi keluar
    const { data: authCreated, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: finalEmail,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        nama_lengkap: payload.nama_lengkap,
        username: finalUsername,
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

    // 6. Simpan profil ke public.profiles
    const profileInsertData: Record<string, any> = {
      id: newUserId,
      nama_lengkap: payload.nama_lengkap,
      email: finalEmail,
      no_telepon: payload.no_telepon,
      role: payload.role,
      is_active: true,
    };

    if (finalUsername) {
      profileInsertData.username = finalUsername;
    }

    const { error: insertProfileErr } = await adminClient.from("profiles").insert(profileInsertData);

    if (insertProfileErr) {
      // Rollback auth user jika insert profile gagal
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { ok: false, message: `Gagal membuat profil pengguna: ${insertProfileErr.message}` },
        { status: 500 }
      );
    }

    // 7. Jika Wali, simpan ke public.wali_santri (1:1 relation)
    if (payload.role === "wali" && payload.santri_id) {
      const { error: insertWaliErr } = await adminClient.from("wali_santri").insert({
        user_id: newUserId,
        santri_id: payload.santri_id,
        nama_lengkap: payload.nama_lengkap,
        hubungan: "Wali",
        no_telepon: payload.no_telepon,
        email: finalEmail,
        alamat: "Pondok Pesantren Modern Abu Manshur",
      });

      if (insertWaliErr) {
        return NextResponse.json(
          { ok: false, message: `Akun dibuat namun gagal menghubungkan data wali: ${insertWaliErr.message}` },
          { status: 500 }
        );
      }
    }

    // 8. Catat ke Audit Log secara otomatis (Password TIDAK PERNAH dicatat)
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_role: "superadmin",
      aktivitas: "CREATE_USER_ACCOUNT",
      jenis_objek: "profiles",
      objek_id: newUserId,
      data_sesudah: {
        username: finalUsername,
        email: finalEmail,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
        santri_id: payload.santri_id ?? null,
      },
      alasan_perubahan: "Pembuatan akun resmi oleh Superadmin via Server API",
    });

    return NextResponse.json({
      ok: true,
      message: `Akun ${payload.nama_lengkap} (${payload.role}) dengan username '${finalUsername}' berhasil dibuat.`,
      data: {
        id: newUserId,
        username: finalUsername,
        email: finalEmail,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = patchUserSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input aksi tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    // Mode demo fallback
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: `Aksi ${payload.action} berhasil diterapkan pada pengguna '${payload.user_id}' (Mode Demo).`,
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
        { ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu sebagai Superadmin." },
        { status: 401 }
      );
    }

    // 2. Verifikasi Hak Akses: Hanya Superadmin aktif
    const { data: callerProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== "superadmin" || !callerProfile.is_active) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya Superadmin aktif yang berwenang mengelola akun pengguna." },
        { status: 403 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    // Ambil data target pengguna
    const { data: targetUser, error: targetErr } = await adminClient
      .from("profiles")
      .select("id, nama_lengkap, email, username, role, is_active")
      .eq("id", payload.user_id)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json(
        { ok: false, message: "Pengguna target tidak ditemukan di sistem." },
        { status: 404 }
      );
    }

    // =========================================================================
    // AKSI 1: RESET PASSWORD
    // =========================================================================
    if (payload.action === "RESET_PASSWORD") {
      const pwdStrength = validatePasswordStrength(payload.new_password);
      if (!pwdStrength.valid) {
        return NextResponse.json(
          { ok: false, message: pwdStrength.message },
          { status: 400 }
        );
      }

      // Update password di Supabase Auth via Admin API
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(payload.user_id, {
        password: payload.new_password,
      });

      if (resetErr) {
        return NextResponse.json(
          { ok: false, message: `Gagal mengatur ulang kata sandi: ${resetErr.message}` },
          { status: 500 }
        );
      }

      // Catat di Audit Log (Password TIDAK PERNAH dicatat)
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: "RESET_USER_PASSWORD",
        jenis_objek: "profiles",
        objek_id: payload.user_id,
        data_sesudah: {
          target_username: targetUser.username ?? targetUser.email,
          target_nama: targetUser.nama_lengkap,
        },
        alasan_perubahan: "Pengaturan ulang kata sandi oleh Superadmin",
      });

      return NextResponse.json({
        ok: true,
        message: `Kata sandi akun ${targetUser.nama_lengkap} (${targetUser.username ?? targetUser.email}) berhasil diatur ulang.`,
      });
    }

    // =========================================================================
    // AKSI 2: TOGGLE ACTIVE (AKTIFKAN / NONAKTIFKAN)
    // =========================================================================
    if (payload.action === "TOGGLE_ACTIVE") {
      // Proteksi 1: Superadmin tidak boleh menonaktifkan dirinya sendiri
      if (callerUser.id === payload.user_id && !payload.is_active) {
        return NextResponse.json(
          { ok: false, message: "Superadmin tidak dapat menonaktifkan akun sendiri." },
          { status: 400 }
        );
      }

      // Proteksi 2: Tidak boleh menonaktifkan Superadmin terakhir
      if (targetUser.role === "superadmin" && !payload.is_active) {
        const { count: activeSuperadmins } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "superadmin")
          .eq("is_active", true);

        if ((activeSuperadmins ?? 0) <= 1) {
          return NextResponse.json(
            { ok: false, message: "Tidak dapat menonaktifkan Superadmin terakhir dalam sistem." },
            { status: 400 }
          );
        }
      }

      const { error: updateErr } = await adminClient
        .from("profiles")
        .update({ is_active: payload.is_active })
        .eq("id", payload.user_id);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, message: `Gagal mengubah status aktif akun: ${updateErr.message}` },
          { status: 500 }
        );
      }

      // Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: payload.is_active ? "ACTIVATE_USER_ACCOUNT" : "DEACTIVATE_USER_ACCOUNT",
        jenis_objek: "profiles",
        objek_id: payload.user_id,
        data_sebelum: { is_active: targetUser.is_active },
        data_sesudah: { is_active: payload.is_active },
        alasan_perubahan: `Pengubahan status akun oleh Superadmin ke ${payload.is_active ? "Aktif" : "Nonaktif"}`,
      });

      return NextResponse.json({
        ok: true,
        message: `Akun ${targetUser.nama_lengkap} berhasil ${payload.is_active ? "diaktifkan" : "dinonaktifkan"}.`,
      });
    }

    // =========================================================================
    // AKSI 3: UPDATE PROFILE
    // =========================================================================
    if (payload.action === "UPDATE_PROFILE") {
      // Proteksi jika role diubah dari superadmin ke yang lain
      if (targetUser.role === "superadmin" && payload.role && payload.role !== "superadmin") {
        const { count: activeSuperadmins } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "superadmin")
          .eq("is_active", true);

        if ((activeSuperadmins ?? 0) <= 1) {
          return NextResponse.json(
            { ok: false, message: "Tidak dapat mengubah role Superadmin terakhir dalam sistem." },
            { status: 400 }
          );
        }
      }

      const updates: Record<string, any> = {};
      if (payload.nama_lengkap) updates.nama_lengkap = payload.nama_lengkap.trim();
      if (payload.no_telepon) updates.no_telepon = payload.no_telepon.trim();
      if (payload.role) updates.role = payload.role;

      const { error: updateErr } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", payload.user_id);

      if (updateErr) {
        return NextResponse.json(
          { ok: false, message: `Gagal memperbarui profil: ${updateErr.message}` },
          { status: 500 }
        );
      }

      // Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: "UPDATE_USER_PROFILE",
        jenis_objek: "profiles",
        objek_id: payload.user_id,
        data_sebelum: {
          nama_lengkap: targetUser.nama_lengkap,
          role: targetUser.role,
        },
        data_sesudah: updates,
        alasan_perubahan: "Pembaruan data profil pengguna oleh Superadmin",
      });

      return NextResponse.json({
        ok: true,
        message: `Profil ${targetUser.nama_lengkap} berhasil diperbarui.`,
      });
    }

    return NextResponse.json({ ok: false, message: "Aksi tidak dikenali." }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}
