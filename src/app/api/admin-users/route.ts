// ============================================================================
// SIPETA - Secure Server-Side Account Provisioning & Management Endpoint
// Eksklusif hanya dapat dipanggil oleh Superadmin terautentikasi
// Sesuai Bab 3.1 & 3.2 PRD & Kebijakan Akun Internal Username
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

export const preferredRegion = "sin1";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  extractUsername,
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";

const isUuid = (val: string) =>
  typeof val === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());

const createUserSchema = z.object({
  nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter."),
  username: z
    .string({ required_error: "Username wajib diisi untuk akun pengguna internal." })
    .min(3, "Username minimal 3 karakter.")
    .max(30, "Username maksimal 30 karakter."),
  no_telepon: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (!val || val.trim() === "" ? "-" : val.trim())),
  role: z.enum(["admin", "tu", "bendahara", "pengelola", "wali", "asatidz"]),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
  santri_id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (!val || val.trim() === "" ? undefined : val.trim()))
    .pipe(z.string().uuid("ID Santri tidak valid.").optional()),
});

const patchUserSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("MANAGE_ACCOUNT"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    nama_lengkap: z.string().min(3, "Nama lengkap minimal 3 karakter.").optional(),
    username: z
      .string()
      .optional()
      .nullable()
      .transform((val) => (!val || val.trim() === "" ? undefined : normalizeUsername(val))),
    new_password: z
      .string()
      .optional()
      .nullable()
      .transform((val) => (!val || val.trim() === "" ? undefined : val.trim())),
    no_telepon: z
      .string()
      .optional()
      .nullable()
      .transform((val) => (!val || val.trim() === "" ? "-" : val.trim())),
    role: z.enum(["admin", "tu", "bendahara", "pengelola", "wali", "asatidz"]).optional(),
    is_active: z.boolean().optional(),
    must_change_password: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("RESET_PASSWORD"),
    user_id: z.string().min(1, "ID Pengguna wajib diisi."),
    new_password: z.string().min(8, "Kata sandi baru minimal 8 karakter."),
    must_change_password: z.boolean().optional(),
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
    no_telepon: z
      .string()
      .optional()
      .nullable()
      .transform((val) => (!val || val.trim() === "" ? "-" : val.trim())),
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

    // Batasan Role: Pembuatan akun Superadmin tambahan tidak diizinkan
    if ((payload.role as string) === "superadmin") {
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
          role: payload.role,
          no_telepon: payload.no_telepon,
          is_active: true,
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
    const { data: existingUser } = await adminClient
      .from("profiles")
      .select("id, username")
      .eq("username", finalUsername)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { ok: false, message: `Username '${finalUsername}' sudah digunakan. Silakan gunakan username lain.` },
        { status: 409 }
      );
    }

    const { data: existingEmail } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("email", finalEmail)
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json(
        { ok: false, message: `Username '${finalUsername}' sudah terdaftar dalam sistem.` },
        { status: 409 }
      );
    }

    // 4. Provisioning Akun melalui Supabase Admin Client (Service Role Key - Server Only)
    // Email sintetis dibuat murni di backend, email otomatis dikonfirmasi (email_confirm: true)
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

    if (createAuthErr || !authCreated?.user) {
      const errMsg = createAuthErr?.message || "Gagal membuat identitas autentikasi.";
      const isDuplicate =
        errMsg.toLowerCase().includes("already") ||
        errMsg.toLowerCase().includes("registered") ||
        errMsg.toLowerCase().includes("exists");
      return NextResponse.json(
        {
          ok: false,
          message: isDuplicate
            ? `Username '${finalUsername}' sudah terdaftar dalam autentikasi sistem. Silakan pilih username berbeda.`
            : `Gagal membuat akun autentikasi: ${errMsg}`,
        },
        { status: isDuplicate ? 409 : 400 }
      );
    }

    const newUserId = authCreated.user.id;
    const normalizedDbRole = payload.role === "asatidz" ? "pengelola" : payload.role;

    // 5. Simpan profil ke public.profiles
    const profileInsertData: Record<string, any> = {
      id: newUserId,
      nama_lengkap: payload.nama_lengkap,
      email: finalEmail,
      no_telepon: payload.no_telepon,
      role: normalizedDbRole,
      is_active: true,
      username: finalUsername,
    };

    const { error: insertProfileErr } = await adminClient.from("profiles").insert(profileInsertData);

    if (insertProfileErr) {
      // Rollback kompensasi atomik: Hapus kembali akun Auth yang baru dibuat agar tidak meninggalkan orphaned auth user
      let rollbackSuccess = false;
      let rollbackErrorMsg: string | undefined;
      try {
        const { error: rollbackErr } = await adminClient.auth.admin.deleteUser(newUserId);
        if (rollbackErr) {
          rollbackErrorMsg = rollbackErr.message;
          console.error(
            `[CRITICAL][COMPENSATION_FAILED] Gagal menghapus akun auth yatim ${newUserId} (${finalEmail}) setelah insert profile gagal:`,
            rollbackErr.message
          );
        } else {
          rollbackSuccess = true;
          console.info(
            `[COMPENSATION_SUCCESS] Akun auth ${newUserId} (${finalEmail}) berhasil dibatalkan dan dihapus setelah insert profile gagal.`
          );
        }
      } catch (rbEx) {
        rollbackErrorMsg = rbEx instanceof Error ? rbEx.message : String(rbEx);
        console.error(
          `[CRITICAL][COMPENSATION_FAILED] Exception saat rollback akun auth ${newUserId} (${finalEmail}):`,
          rbEx
        );
      }

      return NextResponse.json(
        {
          ok: false,
          message: rollbackSuccess
            ? `Gagal membuat profil pengguna: ${insertProfileErr.message}. Akun autentikasi berhasil dibatalkan.`
            : `Gagal membuat profil pengguna: ${insertProfileErr.message}. PERINGATAN: Akun auth gagal dibatalkan (${rollbackErrorMsg ?? "Unknown error"}).`,
        },
        { status: 500 }
      );
    }

    // 5b. Jika role wali dan santri_id disediakan, hubungkan ke tabel wali_santri
    if (normalizedDbRole === "wali" && payload.santri_id) {
      const { error: insertWaliErr } = await adminClient.from("wali_santri").insert({
        user_id: newUserId,
        santri_id: payload.santri_id,
        nama_lengkap: payload.nama_lengkap,
        hubungan: "Wali",
        no_telepon: payload.no_telepon || "-",
        email: finalEmail,
        alamat: "-",
      });
      if (insertWaliErr) {
        console.warn("Peringatan: Gagal menghubungkan profil wali ke tabel wali_santri:", insertWaliErr.message);
      }
    }

    // 6. Catat ke Audit Log secara otomatis (Password TIDAK PERNAH dicatat)
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_role: "superadmin",
      aktivitas: "CREATE_USER_ACCOUNT",
      jenis_objek: "profiles",
      objek_id: newUserId,
      data_sesudah: {
        username: finalUsername,
        nama_lengkap: payload.nama_lengkap,
        role: payload.role,
        no_telepon: payload.no_telepon,
      },
      alasan_perubahan: "Pembuatan akun resmi internal oleh Superadmin via Server API tanpa input email",
    });

    return NextResponse.json({
      ok: true,
      message: `Akun ${payload.nama_lengkap} (${payload.role}) dengan username '${finalUsername}' berhasil dibuat.`,
      data: {
        id: newUserId,
        username: finalUsername,
        nama_lengkap: payload.nama_lengkap,
        email: finalEmail,
        role: payload.role,
        no_telepon: payload.no_telepon || "-",
        is_active: true,
        santri_id: payload.santri_id,
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
        ((payload.role && (payload.role as string) !== "superadmin") || payload.is_active === false)
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

      // Proteksi Peran Wali Santri yang terikat dengan santri
      if (targetUser.role === "wali" && payload.role && payload.role !== "wali") {
        const { count: childCount } = await adminClient
          .from("wali_santri")
          .select("id", { count: "exact", head: true })
          .eq("user_id", payload.user_id);
        if ((childCount ?? 0) > 0) {
          return NextResponse.json(
            { ok: false, message: "Peran akun Wali Santri yang terhubung dengan santri tidak dapat diubah karena terikat relasi data santri." },
            { status: 400 }
          );
        }
      }

      // Proteksi Superadmin Mutlak (Mandat B & af7315fd):
      const isTargetSuperadmin =
        targetUser.role === "superadmin" ||
        targetUser.id === "af7315fd-a82f-4c73-9bd1-4967d038ae7e" ||
        targetUser.email?.toLowerCase() === "sipetaabumanshur@gmail.com" ||
        targetUser.username?.toLowerCase() === "superadmin";

      if (payload.role && (payload.role as string) === "superadmin" && !isTargetSuperadmin) {
        return NextResponse.json(
          { ok: false, message: "Promosi akun menjadi Superadmin dilarang oleh kebijakan keamanan sistem." },
          { status: 403 }
        );
      }

      if (isTargetSuperadmin && payload.role && (payload.role as string) !== "superadmin") {
        return NextResponse.json(
          { ok: false, message: "Role Superadmin utama tidak dapat diubah." },
          { status: 403 }
        );
      }

      if (isTargetSuperadmin && payload.is_active === false) {
        return NextResponse.json(
          { ok: false, message: "Akun Superadmin utama tidak dapat dinonaktifkan." },
          { status: 403 }
        );
      }

      // 2. Validasi Password Baru (Opsional)
      if (payload.new_password) {
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

      if (payload.username && targetUser.role !== "superadmin") {
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
          finalNewEmail = usernameToInternalEmail(cleanUsername);

          // Periksa keunikan email sintetis
          const { data: existingEmailUser } = await adminClient
            .from("profiles")
            .select("id, email")
            .eq("email", finalNewEmail)
            .neq("id", payload.user_id)
            .maybeSingle();

          if (existingEmailUser) {
            return NextResponse.json(
              {
                ok: false,
                message: `Identitas login untuk username '${cleanUsername}' sudah terdaftar di sistem.`,
              },
              { status: 409 }
            );
          }
        }
      }

      // 4. Update Supabase Auth via Admin Client
      const authUpdates: Record<string, any> = {};
      if (payload.new_password) {
        authUpdates.password = payload.new_password;
      }
      if (finalNewEmail) {
        authUpdates.email = finalNewEmail;
        authUpdates.email_confirm = true; // Langsung aktif tanpa verifikasi email
      }
      if (payload.nama_lengkap || finalNewUsername || payload.role || payload.must_change_password !== undefined) {
        authUpdates.user_metadata = {
          nama_lengkap: payload.nama_lengkap ? payload.nama_lengkap.trim() : targetUser.nama_lengkap,
          username: finalNewUsername ?? targetUser.username,
          role: payload.role ?? targetUser.role,
          ...(payload.must_change_password !== undefined
            ? { must_change_password: payload.must_change_password }
            : {}),
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
      if (payload.role) profileUpdates.role = payload.role === "asatidz" ? "pengelola" : payload.role;
      if (payload.is_active !== undefined) profileUpdates.is_active = payload.is_active;
      if (payload.must_change_password !== undefined) profileUpdates.must_change_password = payload.must_change_password;
      if (finalNewUsername) profileUpdates.username = finalNewUsername;
      if (finalNewEmail) profileUpdates.email = finalNewEmail;

      if (Object.keys(profileUpdates).length > 0) {
        const { error: updateProfileErr } = await adminClient
          .from("profiles")
          .update(profileUpdates)
          .eq("id", payload.user_id);

        if (updateProfileErr) {
          // KOMPENSASI: Batalkan perubahan pada Auth jika update profiles gagal
          if (Object.keys(authUpdates).length > 0) {
            try {
              const rollbackAuthUpdates: Record<string, any> = {
                email: targetUser.email,
                email_confirm: true,
                user_metadata: {
                  nama_lengkap: targetUser.nama_lengkap,
                  username: targetUser.username,
                  role: targetUser.role,
                },
              };
              await adminClient.auth.admin.updateUserById(payload.user_id, rollbackAuthUpdates);
            } catch (rollbackErr) {
              console.error("Critical: Rollback Auth failed after profiles update failure:", rollbackErr);
            }
          }
          return NextResponse.json(
            {
              ok: false,
              message: `Gagal memperbarui profil pengguna: ${updateProfileErr.message}. Perubahan autentikasi telah dibatalkan.`,
            },
            { status: 500 }
          );
        }

        // Jika peran adalah wali, sinkronisasi juga tabel wali_santri
        if (targetUser.role === "wali") {
          const waliUpdates: Record<string, any> = {};
          if (profileUpdates.nama_lengkap) waliUpdates.nama_lengkap = profileUpdates.nama_lengkap;
          if (profileUpdates.no_telepon) waliUpdates.no_telepon = profileUpdates.no_telepon;
          if (profileUpdates.email) waliUpdates.email = profileUpdates.email;
          if (Object.keys(waliUpdates).length > 0) {
            await adminClient.from("wali_santri").update(waliUpdates).eq("user_id", payload.user_id);
          }
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
          email: targetUser.email,
          role: targetUser.role,
          is_active: targetUser.is_active,
          no_telepon: targetUser.no_telepon,
        },
        data_sesudah: {
          nama_lengkap: profileUpdates.nama_lengkap ?? targetUser.nama_lengkap,
          username: profileUpdates.username ?? targetUser.username,
          email: profileUpdates.email ?? targetUser.email,
          role: profileUpdates.role ?? targetUser.role,
          is_active: profileUpdates.is_active ?? targetUser.is_active,
          no_telepon: profileUpdates.no_telepon ?? targetUser.no_telepon,
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
          email: profileUpdates.email ?? targetUser.email,
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
      const mustChange = payload.must_change_password ?? true;
      const { error: resetErr } = await adminClient.auth.admin.updateUserById(payload.user_id, {
        password: payload.new_password,
        user_metadata: {
          must_change_password: mustChange,
        },
      });

      if (resetErr) {
        return NextResponse.json(
          { ok: false, message: `Gagal mengatur ulang kata sandi: ${resetErr.message}` },
          { status: 500 }
        );
      }

      // Update flag must_change_password di profiles jika kolom tersedia
      try {
        await adminClient
          .from("profiles")
          .update({ must_change_password: mustChange })
          .eq("id", payload.user_id);
      } catch {
        // Abaikan jika kolom di DB belum ada atau RPC terpisah
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
          must_change_password: mustChange,
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

      // Proteksi 2: Akun Superadmin mutlak tidak boleh dinonaktifkan
      const isSuperadminTarget =
        targetUser.role === "superadmin" ||
        targetUser.id === "af7315fd-a82f-4c73-9bd1-4967d038ae7e" ||
        targetUser.email?.toLowerCase() === "sipetaabumanshur@gmail.com" ||
        targetUser.username?.toLowerCase() === "superadmin";

      if (isSuperadminTarget && !payload.is_active) {
        return NextResponse.json(
          { ok: false, message: "Akun Superadmin tidak dapat dinonaktifkan oleh siapa pun." },
          { status: 403 }
        );
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
      // Proteksi promosi menjadi Superadmin
      if (payload.role && (payload.role as string) === "superadmin") {
        return NextResponse.json(
          { ok: false, message: "Promosi akun menjadi Superadmin dilarang oleh kebijakan keamanan sistem." },
          { status: 403 }
        );
      }

      // Proteksi perubahan role akun Superadmin
      if (targetUser.role === "superadmin" && payload.role && (payload.role as string) !== "superadmin") {
        return NextResponse.json(
          { ok: false, message: "Role Superadmin tidak dapat diubah oleh akun lain." },
          { status: 403 }
        );
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
    const queryUserId = searchParams.get("user_id") || searchParams.get("id") || searchParams.get("username");

    let targetIds: string[] = [];
    let isBulk = false;

    if (queryUserId) {
      targetIds = [queryUserId.trim()];
    }

    try {
      const body = await request.json();
      if (body) {
        if (Array.isArray(body.user_ids)) {
          targetIds = body.user_ids.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "");
          isBulk = true;
        } else if (Array.isArray(body.ids)) {
          targetIds = body.ids.filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "");
          isBulk = true;
        } else if (typeof body.user_id === "string" && body.user_id.trim() !== "") {
          targetIds = [body.user_id.trim()];
        } else if (typeof body.id === "string" && body.id.trim() !== "") {
          targetIds = [body.id.trim()];
        } else if (typeof body.username === "string" && body.username.trim() !== "") {
          targetIds = [body.username.trim()];
        }
      }
    } catch {
      // Body kosong atau bukan JSON (pemanggilan DELETE via query parameter)
    }

    if (targetIds.length === 0) {
      return NextResponse.json(
        { ok: false, message: "Parameter user_id, id, username, atau array user_ids wajib disertakan." },
        { status: 400 }
      );
    }

    // Mode Demo / Simulasi jika Supabase belum terhubung
    if (!isSupabaseConfigured()) {
      if (isBulk) {
        return NextResponse.json({
          ok: true,
          results: targetIds.map((id) => ({
            id,
            status: "DELETED",
            actionTaken: "DELETED",
            message: "Akun berhasil dihapus (Mode Demo Standalone).",
          })),
          summary: {
            total: targetIds.length,
            deleted: targetIds.length,
            deactivated: 0,
            skipped: 0,
            failed: 0,
          },
        });
      }
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

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    // 3. Proses Penghapusan / Penonaktifan per Akun (Resolusi Multi-Strategi)
    const results: Array<{
      id: string;
      nama_lengkap?: string;
      status: "DELETED" | "DEACTIVATED" | "SKIPPED" | "FAILED";
      actionTaken?: "DELETED" | "DEACTIVATED";
      message: string;
    }> = [];

    for (const rawUserId of targetIds) {
      const cleanRawId = typeof rawUserId === "string" ? rawUserId.trim() : String(rawUserId).trim();
      if (!cleanRawId) continue;
      const cleanUser = cleanRawId.replace(/^@/, "").toLowerCase();
      const syntheticEmail = usernameToInternalEmail(cleanUser);

      // Resolusi Target Pengguna (UUID -> Username -> Email -> Auth User Yatim -> Mock ID)
      let targetUser: any = null;

      // a. Kueri berdasarkan UUID jika format valid UUID
      if (isUuid(cleanRawId)) {
        const { data: byId } = await adminClient
          .from("profiles")
          .select("*")
          .eq("id", cleanRawId)
          .maybeSingle();
        if (byId) targetUser = byId;
      }

      // b. Kueri berdasarkan username di public.profiles
      if (!targetUser) {
        const { data: byUsername } = await adminClient
          .from("profiles")
          .select("*")
          .ilike("username", cleanUser)
          .maybeSingle();
        if (byUsername) targetUser = byUsername;
      }

      // c. Kueri berdasarkan email di public.profiles
      if (!targetUser) {
        const { data: byEmail } = await adminClient
          .from("profiles")
          .select("*")
          .or(`email.ilike.${cleanRawId},email.ilike.${syntheticEmail}`)
          .maybeSingle();
        if (byEmail) targetUser = byEmail;
      }

      // d. Jika tidak ditemukan di public.profiles, periksa apakah ada akun yatim di Supabase Auth
      if (!targetUser) {
        let authUser: any = null;
        if (isUuid(cleanRawId)) {
          try {
            const { data } = await adminClient.auth.admin.getUserById(cleanRawId);
            if (data?.user) authUser = data.user;
          } catch {}
        }
        if (!authUser) {
          try {
            const { data: listData } = await adminClient.auth.admin.listUsers();
            if (listData?.users) {
              authUser = listData.users.find(
                (u) =>
                  u.id === cleanRawId ||
                  u.email?.toLowerCase() === cleanRawId.toLowerCase() ||
                  u.email?.toLowerCase() === syntheticEmail.toLowerCase() ||
                  u.user_metadata?.username?.toLowerCase() === cleanUser
              );
            }
          } catch {}
        }

        if (authUser) {
          try {
            await adminClient.auth.admin.deleteUser(authUser.id);
            results.push({
              id: authUser.id,
              nama_lengkap: authUser.user_metadata?.nama_lengkap || authUser.email,
              status: "DELETED",
              actionTaken: "DELETED",
              message: `Akun autentikasi yatim (${authUser.email}) berhasil dibersihkan dari Supabase Auth.`,
            });
            continue;
          } catch (e: any) {
            results.push({
              id: authUser.id,
              status: "FAILED",
              message: `Gagal menghapus akun auth yatim: ${e?.message}`,
            });
            continue;
          }
        }
      }

      // e. Tangani akun mock/contoh lokal yang tidak ada di Cloud database
      if (!targetUser) {
        if (cleanRawId.startsWith("usr-")) {
          results.push({
            id: cleanRawId,
            status: "DELETED",
            actionTaken: "DELETED",
            message: `Akun lokal/contoh '${cleanRawId}' berhasil dibersihkan dari tampilan sistem.`,
          });
          continue;
        }

        results.push({
          id: cleanRawId,
          status: "FAILED",
          message: `Pengguna '${cleanRawId}' tidak ditemukan dalam sistem database Supabase (profiles & auth).`,
        });
        continue;
      }

      const targetUserId = targetUser.id;

      // Proteksi 1: Tidak boleh menghapus akun sendiri saat sedang aktif
      if (callerUser.id === targetUserId) {
        results.push({
          id: targetUserId,
          nama_lengkap: targetUser.nama_lengkap,
          status: "SKIPPED",
          message: "Keamanan: Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif.",
        });
        continue;
      }

      // Proteksi 2: Akun Superadmin mutlak tidak boleh dihapus (Mandat B & af7315fd)
      const isSuperadminTarget =
        targetUser.role === "superadmin" ||
        targetUserId === "af7315fd-a82f-4c73-9bd1-4967d038ae7e" ||
        targetUser.email?.toLowerCase() === "sipetaabumanshur@gmail.com" ||
        targetUser.username?.toLowerCase() === "superadmin";

      if (isSuperadminTarget) {
        results.push({
          id: targetUserId,
          nama_lengkap: targetUser.nama_lengkap,
          status: "SKIPPED",
          message: "Keamanan: Akun Superadmin dilindungi sistem dan tidak boleh dihapus.",
        });
        continue;
      }

      // Periksa Relasi Historis / Transaksi Kritis Keuangan
      // a. Pembayaran SPP / Cicilan (sebagai wali atau petugas verifikator)
      const { count: countPembayaran } = await adminClient
        .from("transaksi_pembayaran")
        .select("id", { count: "exact", head: true })
        .or(`wali_user_id.eq.${targetUserId},verified_by.eq.${targetUserId}`);

      // b. Uang Saku (sebagai petugas)
      const { count: countUangSaku } = await adminClient
        .from("mutasi_uang_saku")
        .select("id", { count: "exact", head: true })
        .eq("petugas_id", targetUserId);

      // c. Topup Uang Saku (sebagai wali atau petugas verifikator)
      const { count: countTopup } = await adminClient
        .from("topup_uang_saku")
        .select("id", { count: "exact", head: true })
        .or(`wali_user_id.eq.${targetUserId},verified_by.eq.${targetUserId}`);

      const hasFinancialHistory =
        (countPembayaran ?? 0) > 0 ||
        (countUangSaku ?? 0) > 0 ||
        (countTopup ?? 0) > 0;

      // KASUS A: Memiliki riwayat transaksi keuangan -> Penonaktifan Aman (Soft Delete)
      if (hasFinancialHistory) {
        await adminClient
          .from("profiles")
          .update({ is_active: false })
          .eq("id", targetUserId);

        try {
          await adminClient.auth.admin.updateUserById(targetUserId, {
            user_metadata: { is_active: false },
          });
        } catch {
          // Abaikan jika auth metadata update tidak didukung
        }

        // Catat ke Audit Log
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_role: "superadmin",
          aktivitas: "DEACTIVATE_USER_ACCOUNT",
          jenis_objek: "profiles",
          objek_id: targetUserId,
          data_sebelum: { is_active: targetUser.is_active },
          data_sesudah: { is_active: false },
          alasan_perubahan: `Akun ${targetUser.nama_lengkap} memiliki riwayat transaksi keuangan aktif sehingga dinonaktifkan secara aman (soft-deactivate) demi integritas pembukuan pesantren.`,
        });

        results.push({
          id: targetUserId,
          nama_lengkap: targetUser.nama_lengkap,
          status: "DEACTIVATED",
          actionTaken: "DEACTIVATED",
          message: `Akun ${targetUser.nama_lengkap} memiliki riwayat transaksi keuangan aktif (SPP/Uang Saku). Akun dinonaktifkan secara aman (soft-delete) untuk menjaga integritas pembukuan dan audit trail pesantren.`,
        });
        continue;
      }

      // KASUS B: Tidak memiliki transaksi keuangan -> Hapus Bersih dengan Fallback Aman
      // Jika role wali: Lepas relasi wali_santri terlebih dahulu agar profil dapat dihapus tanpa melanggar constraint FK
      // Penting: Data santri, kelas, kamar, dan riwayat akademik di public.santri tetap 100% utuh!
      if (targetUser.role === "wali") {
        try {
          await adminClient.from("wali_santri").delete().eq("user_id", targetUserId);
        } catch (e: any) {
          console.warn("Peringatan saat membersihkan data relasi wali_santri:", e?.message);
        }
      }

      const { error: delProfileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetUserId);

      if (delProfileErr) {
        // Fallback aman: jika delete profil gagal karena constraint foreign key tak terduga, lakukan soft-deactivate
        await adminClient
          .from("profiles")
          .update({ is_active: false })
          .eq("id", targetUserId);

        results.push({
          id: targetUserId,
          nama_lengkap: targetUser.nama_lengkap,
          status: "DEACTIVATED",
          actionTaken: "DEACTIVATED",
          message: `Akun ${targetUser.nama_lengkap} dinonaktifkan secara aman (soft-delete) karena terdapat relasi data yang dilindungi (${delProfileErr.message}).`,
        });
        continue;
      }

      // Hapus dari Supabase Auth
      try {
        await adminClient.auth.admin.deleteUser(targetUserId);
      } catch (e: any) {
        console.warn("Peringatan: Gagal menghapus akun auth Supabase:", e?.message);
      }

      // Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: "superadmin",
        aktivitas: "DELETE_USER_ACCOUNT",
        jenis_objek: "profiles",
        objek_id: targetUserId,
        data_sebelum: {
          nama_lengkap: targetUser.nama_lengkap,
          username: targetUser.username,
          email: targetUser.email,
          role: targetUser.role,
        },
        alasan_perubahan: `Penghapusan akun resmi oleh Superadmin (${targetUser.nama_lengkap})`,
      });

      results.push({
        id: targetUserId,
        nama_lengkap: targetUser.nama_lengkap,
        status: "DELETED",
        actionTaken: "DELETED",
        message:
          targetUser.role === "wali"
            ? `Akun Wali Santri ${targetUser.nama_lengkap} berhasil dihapus permanen dari sistem. Data santri, kelas, dan riwayat akademik tetap aman tersimpan.`
            : `Akun ${targetUser.nama_lengkap} berhasil dihapus permanen dari sistem.`,
      });
    }

    // Jika pemanggilan tunggal, kembalikan format response tunggal yang ramah
    if (!isBulk && results.length === 1 && results[0]) {
      const single = results[0];
      return NextResponse.json({
        ok: single.status === "DELETED" || single.status === "DEACTIVATED",
        actionTaken: single.actionTaken,
        message: single.message,
        id: single.id,
      });
    }

    // Jika pemanggilan massal (bulk), kembalikan ringkasan dan rincian per akun
    const summary = {
      total: results.length,
      deleted: results.filter((r) => r.status === "DELETED").length,
      deactivated: results.filter((r) => r.status === "DEACTIVATED").length,
      skipped: results.filter((r) => r.status === "SKIPPED").length,
      failed: results.filter((r) => r.status === "FAILED").length,
    };

    return NextResponse.json({
      ok: summary.deleted > 0 || summary.deactivated > 0,
      results,
      summary,
      message: `Proses penghapusan selesai: ${summary.deleted} akun dihapus permanen, ${summary.deactivated} dinonaktifkan aman, ${summary.skipped} dilewati, ${summary.failed} gagal.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        data: [],
        message: "Mode Demo Standalone: Supabase belum dikonfigurasi.",
      });
    }

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

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        { ok: false, message: "Konfigurasi server admin Supabase belum lengkap." },
        { status: 500 }
      );
    }

    // Ambil data profil dan relasi wali_santri secara paralel
    const [profRes, waliRes] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, nama_lengkap, email, username, role, is_active, no_telepon, must_change_password, created_at")
        .order("created_at", { ascending: false }),
      adminClient
        .from("wali_santri")
        .select("user_id, santri_id"),
    ]);

    if (profRes.error) {
      return NextResponse.json(
        { ok: false, message: `Gagal memuat profil: ${profRes.error.message}` },
        { status: 500 }
      );
    }

    const profiles = profRes.data ?? [];
    const waliList = waliRes.data ?? [];

    const waliMap = new Map<string, string>();
    if (waliList) {
      for (const w of waliList) {
        if (w.user_id && w.santri_id) {
          waliMap.set(w.user_id, w.santri_id);
        }
      }
    }

    const users = (profiles || []).map((p) => ({
      id: p.id,
      email: p.email,
      username: extractUsername(p.email, p.username),
      nama_lengkap: p.nama_lengkap,
      no_telepon: p.no_telepon ?? "-",
      role: p.role,
      is_active: p.is_active,
      santri_id: waliMap.get(p.id),
      must_change_password: p.must_change_password === true,
      created_at: p.created_at,
    }));

    return NextResponse.json({
      ok: true,
      data: users,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}
