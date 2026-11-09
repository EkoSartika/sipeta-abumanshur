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
    action: z.literal("MANAGE_ACCOUNT"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter.").optional(),
    username: z
      .string()
      .min(3, "Username minimal 3 karakter.")
      .max(30, "Username maksimal 30 karakter.")
      .optional(),
    new_password: z.string().min(8, "Kata sandi baru minimal 8 karakter.").optional(),
    no_telepon: z.string().min(8, "Nomor telepon minimal 8 digit.").optional(),
    role: z.enum(["superadmin", "admin", "bendahara", "pengelola", "wali"]).optional(),
    is_active: z.boolean().optional(),
  }),
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

    // Batasan Role Pembuatan Akun Superadmin:
    // Sesuai Bagian B.1: Superadmin hanya boleh membuat akun Admin, Bendahara, Pengelola.
    // Superadmin TIDAK boleh membuat akun Wali Santri melalui menu Manajemen Akun.
    if (payload.role === "wali") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Superadmin tidak dapat membuat akun Orang Tua/Wali Santri melalui menu Manajemen Akun. Akun Wali hanya dapat dibuat oleh Admin Administrasi melalui registrasi santri baru atau import Excel.",
        },
        { status: 403 }
      );
    }

    if (payload.role === "superadmin") {
      return NextResponse.json(
        {
          ok: false,
          message: "Pembuatan akun Superadmin tambahan tidak diizinkan melalui menu ini.",
        },
        { status: 403 }
      );
    }

    // Password validation check
    const pwdStrength = validatePasswordStrength(payload.password);
    if (!pwdStrength.valid) {
      return NextResponse.json(
        { ok: false, message: pwdStrength.message },
        { status: 400 }
      );
    }

    // Resolusi email & username berdasarkan kebijakan internal (admin, bendahara, pengelola)
    if (!payload.username) {
      return NextResponse.json(
        { ok: false, message: "Username wajib diisi untuk akun pengguna internal." },
        { status: 400 }
      );
    }
    const finalUsername = normalizeUsername(payload.username);
    if (!isValidUsername(finalUsername)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Username hanya boleh memuat huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter.",
        },
        { status: 400 }
      );
    }
    const finalEmail = usernameToInternalEmail(finalUsername);

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
      username: finalUsername,
    };

    const { error: insertProfileErr } = await adminClient.from("profiles").insert(profileInsertData);

    if (insertProfileErr) {
      // Rollback auth user jika insert profile gagal
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { ok: false, message: `Gagal membuat profil pengguna: ${insertProfileErr.message}` },
        { status: 500 }
      );
    }

    // 7. Catat ke Audit Log secara otomatis (Password TIDAK PERNAH dicatat)
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
      },
      alasan_perubahan: "Pembuatan akun resmi internal oleh Superadmin via Server API",
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
      .select("id, nama_lengkap, email, username, role, is_active, no_telepon")
      .eq("id", payload.user_id)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json(
        { ok: false, message: "Pengguna target tidak ditemukan di sistem." },
        { status: 404 }
      );
    }

    // =========================================================================
    // AKSI UTAMA: MANAGE_ACCOUNT (Penyatuan Edit Profil, Username, Password, Status)
    // Sesuai Bagian A PRD: Satu Modal Terpadu "Kelola Akun"
    // =========================================================================
    if (payload.action === "MANAGE_ACCOUNT") {
      // 1. Validasi Proteksi Superadmin Terakhir pada Role & Status Aktif
      if (
        targetUser.role === "superadmin" &&
        ((payload.role && payload.role !== "superadmin") || payload.is_active === false)
      ) {
        if (callerUser.id === payload.user_id && payload.is_active === false) {
          return NextResponse.json(
            { ok: false, message: "Superadmin tidak dapat menonaktifkan akun sendiri." },
            { status: 400 }
          );
        }

        const { count: activeSuperadmins } = await adminClient
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "superadmin")
          .eq("is_active", true);

        if ((activeSuperadmins ?? 0) <= 1) {
          return NextResponse.json(
            { ok: false, message: "Tidak dapat mengubah role atau menonaktifkan Superadmin terakhir dalam sistem." },
            { status: 400 }
          );
        }
      }

      // 2. Validasi Password Baru (Opsional)
      if (payload.new_password && payload.new_password.trim() !== "") {
        const pwdStrength = validatePasswordStrength(payload.new_password);
        if (!pwdStrength.valid) {
          return NextResponse.json(
            { ok: false, message: pwdStrength.message },
            { status: 400 }
          );
        }
      }

      // 3. Validasi Username Baru (Opsional / Jika Diubah)
      let finalNewUsername: string | undefined = undefined;
      let finalNewEmail: string | undefined = undefined;

      if (payload.username && payload.username.trim() !== "") {
        const cleanUsername = normalizeUsername(payload.username);
        if (!isValidUsername(cleanUsername)) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "Username hanya boleh memuat huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter.",
            },
            { status: 400 }
          );
        }

        if (cleanUsername !== targetUser.username) {
          // Periksa keunikan username di tabel profiles
          const { data: existingUser } = await adminClient
            .from("profiles")
            .select("id, username")
            .eq("username", cleanUsername)
            .neq("id", payload.user_id)
            .maybeSingle();

          if (existingUser) {
            return NextResponse.json(
              {
                ok: false,
                message: `Username '${cleanUsername}' sudah digunakan oleh pengguna lain. Silakan pilih username berbeda.`,
              },
              { status: 409 }
            );
          }

          finalNewUsername = cleanUsername;

          // Jika bukan superadmin resmi, hitung email sintetis internal
          if (targetUser.role !== "superadmin") {
            finalNewEmail = usernameToInternalEmail(cleanUsername);
          }
        }
      }

      // 4. Update Supabase Auth via Admin Client
      const authUpdates: Record<string, any> = {};
      if (payload.new_password && payload.new_password.trim() !== "") {
        authUpdates.password = payload.new_password;
      }
      if (finalNewEmail) {
        authUpdates.email = finalNewEmail;
      }
      if (payload.nama_lengkap || finalNewUsername) {
        authUpdates.user_metadata = {
          nama_lengkap: payload.nama_lengkap ? payload.nama_lengkap.trim() : targetUser.nama_lengkap,
          username: finalNewUsername ?? targetUser.username,
        };
      }

      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateErr } = await adminClient.auth.admin.updateUserById(
          payload.user_id,
          authUpdates
        );

        if (authUpdateErr) {
          return NextResponse.json(
            { ok: false, message: `Gagal memperbarui autentikasi akun: ${authUpdateErr.message}` },
            { status: 500 }
          );
        }
      }

      // 5. Update public.profiles
      const profileUpdates: Record<string, any> = {};
      if (payload.nama_lengkap) profileUpdates.nama_lengkap = payload.nama_lengkap.trim();
      if (payload.no_telepon !== undefined) profileUpdates.no_telepon = payload.no_telepon.trim();
      if (payload.role) profileUpdates.role = payload.role;
      if (payload.is_active !== undefined) profileUpdates.is_active = payload.is_active;
      if (finalNewUsername) profileUpdates.username = finalNewUsername;
      if (finalNewEmail) profileUpdates.email = finalNewEmail;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateProfileErr } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", payload.user_id);

        if (updateProfileErr) {
          return NextResponse.json(
            { ok: false, message: `Gagal memperbarui profil pengguna: ${updateProfileErr.message}` },
            { status: 500 }
          );
        }
      }

      // 6. Catat ke Audit Log (Password TIDAK PERNAH dicatat)
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: "MANAGE_USER_ACCOUNT",
        jenis_objek: "profiles",
        objek_id: payload.user_id,
        data_sebelum: {
          nama_lengkap: targetUser.nama_lengkap,
          username: targetUser.username,
          role: targetUser.role,
          is_active: targetUser.is_active,
        },
        data_sesudah: {
          nama_lengkap: profileUpdates.nama_lengkap ?? targetUser.nama_lengkap,
          username: profileUpdates.username ?? targetUser.username,
          role: profileUpdates.role ?? targetUser.role,
          is_active: profileUpdates.is_active ?? targetUser.is_active,
          password_diubah: !!payload.new_password,
        },
        alasan_perubahan: "Pembaruan informasi akun terpadu oleh Superadmin",
      });

      return NextResponse.json({
        ok: true,
        message: "Informasi akun berhasil diperbarui.",
        data: {
          id: payload.user_id,
          nama_lengkap: profileUpdates.nama_lengkap ?? targetUser.nama_lengkap,
          username: profileUpdates.username ?? targetUser.username,
          role: profileUpdates.role ?? targetUser.role,
          is_active: profileUpdates.is_active ?? targetUser.is_active,
          no_telepon: profileUpdates.no_telepon ?? targetUser.no_telepon,
        },
      });
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

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { ok: false, message: "Parameter user_id wajib disertakan." },
        { status: 400 }
      );
    }

    // Mode Demo / Simulasi jika Supabase belum terhubung
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        actionTaken: "DELETED",
        message: "Akun pengguna berhasil dihapus (Mode Demo Standalone).",
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

    // 2. Verifikasi Hak Akses: Hanya Superadmin Aktif
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (!callerProfile || callerProfile.role !== "superadmin" || !callerProfile.is_active) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya Superadmin yang berwenang menghapus akun pengguna." },
        { status: 403 }
      );
    }

    // 3. Pengamanan: Tidak boleh menghapus akun sendiri
    if (callerUser.id === userId) {
      return NextResponse.json(
        { ok: false, message: "Keamanan: Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif." },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    // 4. Dapatkan data profil target
    const { data: targetUser } = await adminClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json(
        { ok: false, message: "Pengguna tidak ditemukan dalam sistem." },
        { status: 404 }
      );
    }

    // 5. Pengamanan: Superadmin terakhir tidak boleh dihapus
    if (targetUser.role === "superadmin") {
      const { count: superadminCount } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin");

      if ((superadminCount ?? 0) <= 1) {
        return NextResponse.json(
          { ok: false, message: "Akun Superadmin terakhir tidak boleh dihapus demi kelangsungan akses sistem." },
          { status: 400 }
        );
      }
    }

    // 6. Periksa relasi historis (Pembayaran, Uang Saku, Wali dengan riwayat keuangan)
    const { count: countPembayaran } = await adminClient
      .from("pembayaran")
      .select("id", { count: "exact", head: true })
      .or(`created_by.eq.${userId},diverifikasi_oleh.eq.${userId}`);

    const { count: countUangSaku } = await adminClient
      .from("transaksi_uang_saku")
      .select("id", { count: "exact", head: true })
      .eq("petugas_id", userId);

    const hasCriticalHistory = (countPembayaran ?? 0) > 0 || (countUangSaku ?? 0) > 0;

    // Jika memiliki riwayat keuangan penting, lakukan penonaktifan aman (Soft Delete)
    if (hasCriticalHistory) {
      await adminClient
        .from("profiles")
        .update({ is_active: false })
        .eq("id", userId);

      // Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: "DEACTIVATE_USER_ACCOUNT",
        jenis_objek: "profiles",
        objek_id: userId,
        data_sebelum: { is_active: targetUser.is_active },
        data_sesudah: { is_active: false },
        alasan_perubahan: `Akun ${targetUser.nama_lengkap} memiliki riwayat transaksi keuangan aktif sehingga dinonaktifkan secara aman (soft-deactivate), bukan dihapus permanen.`,
      });

      return NextResponse.json({
        ok: true,
        actionTaken: "DEACTIVATED",
        message: `Akun ${targetUser.nama_lengkap} memiliki riwayat transaksi/keuangan penting. Sesuai prinsip integritas audit, akun telah dinonaktifkan secara aman dan data historis dipertahankan.`,
      });
    }

    // Jika tidak memiliki riwayat penting: hapus profil & auth user secara bersih
    // Bersihkan relasi wali_santri jika ada
    if (targetUser.role === "wali") {
      await adminClient.from("wali_santri").delete().eq("user_id", userId);
    }

    const { error: delProfileErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (delProfileErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal menghapus profil: ${delProfileErr.message}` },
        { status: 500 }
      );
    }

    // Hapus dari Supabase Auth
    try {
      await adminClient.auth.admin.deleteUser(userId);
    } catch (e: any) {
      // Catat peringatan jika auth delete bermasalah, tapi profil sudah terhapus
      console.warn("Gagal menghapus akun auth Supabase:", e?.message);
    }

    // Catat ke Audit Log
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_role: "superadmin",
      aktivitas: "DELETE_USER_ACCOUNT",
      jenis_objek: "profiles",
      objek_id: userId,
      data_sebelum: {
        nama_lengkap: targetUser.nama_lengkap,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
      },
      alasan_perubahan: `Penghapusan akun resmi oleh Superadmin (${targetUser.nama_lengkap})`,
    });

    return NextResponse.json({
      ok: true,
      actionTaken: "DELETED",
      message: `Akun ${targetUser.nama_lengkap} berhasil dihapus permanen dari sistem.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}
