// ============================================================================
// SIPETA - Secure Server-Side Santri Registration & Safe Deletion Endpoint
// Melayani registrasi atomik santri + akun wali (1:1) dengan rollback aman,
// serta penghapusan massal santri dengan verifikasi relasi keuangan/akademik.
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

const registerSantriSchema = z.object({
  nis: z.string().min(3, "NIS minimal 3 karakter."),
  nama_lengkap: z.string().min(3, "Nama santri minimal 3 karakter."),
  tempat_lahir: z.string().min(2, "Tempat lahir wajib diisi."),
  tanggal_lahir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir harus YYYY-MM-DD."),
  jenis_kelamin: z.enum(["L", "P"]),
  alamat: z.string().min(5, "Alamat minimal 5 karakter."),
  tahun_masuk: z.number().int().min(2000),
  kelas_id: z.string().min(1, "Kelas wajib dipilih."),
  kamar_id: z.string().min(1, "Kamar asrama wajib dipilih."),
  wali: z.object({
    nama_lengkap: z.string().min(3, "Nama wali minimal 3 karakter."),
    hubungan: z.enum(["Ayah", "Ibu", "Wali"]),
    no_telepon: z.string().min(8, "Nomor telepon wali minimal 8 digit."),
    username_wali: z.string().optional(),
    password_wali: z.string().optional(),
    email_kontak: z.string().email("Format email kontak tidak valid.").optional().or(z.literal("")),
  }),
});

const deleteSantriSchema = z.object({
  santri_ids: z.array(z.string().min(1)).min(1, "Minimal pilih 1 santri untuk dihapus."),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = registerSantriSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input tidak valid." },
        { status: 400 }
      );
    }

    const payload = validation.data;

    // 1. Kebijakan Akun Wali Otomatis: Username = NIS, Password Awal = NIS
    const cleanNis = payload.nis.trim();
    const cleanUsername = normalizeUsername(payload.wali.username_wali || cleanNis);
    const initialPassword = payload.wali.password_wali || cleanNis;

    if (!isValidUsername(cleanUsername)) {
      return NextResponse.json(
        {
          ok: false,
          message: "Username wali hanya boleh berisi huruf kecil, angka, titik, strip (-), atau garis bawah (_), 3-30 karakter.",
        },
        { status: 400 }
      );
    }

    const syntheticEmail = usernameToInternalEmail(cleanUsername);

    // Mode Simulasi jika project Supabase belum dihubungkan
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: `Santri ${payload.nama_lengkap} (NIS: ${payload.nis}) dan akun wali @${cleanUsername} berhasil didaftarkan (Mode Demo Standalone).`,
        data: {
          santri_id: `snt-demo-${Date.now()}`,
          wali_username: cleanUsername,
        },
      });
    }

    // 2. Verifikasi Autentikasi Pemanggil melalui Sesi Server
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

    // 3. Verifikasi Hak Akses: Superadmin, Admin (Pengasuh), atau TU
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (
      !callerProfile ||
      !callerProfile.is_active ||
      (callerProfile.role !== "superadmin" && callerProfile.role !== "admin" && callerProfile.role !== "tu")
    ) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang mendaftarkan santri." },
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

    // 4. Verifikasi Keunikan NIS
    const { data: existingSantri } = await adminClient
      .from("santri")
      .select("id, nis")
      .eq("nis", payload.nis.trim())
      .maybeSingle();

    if (existingSantri) {
      return NextResponse.json(
        { ok: false, message: `NIS '${payload.nis}' sudah terdaftar dalam sistem. NIS harus unik.` },
        { status: 409 }
      );
    }

    // 5. Verifikasi Keunikan Username Wali
    const { data: existingUser } = await adminClient
      .from("profiles")
      .select("id, username")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { ok: false, message: `Username wali '@${cleanUsername}' sudah digunakan. Pilih username lain.` },
        { status: 409 }
      );
    }

    // =========================================================================
    // PROSES TRANSAKSI DENGAN ROLLBACK OTOMATIS JIKA SALAH SATU TAHAP GAGAL
    // =========================================================================
    let createdSantriId: string | null = null;
    let createdAuthUserId: string | null = null;

    try {
      // Tahap A: Insert data santri
      const { data: santriResult, error: santriErr } = await adminClient
        .from("santri")
        .insert({
          nis: payload.nis.trim(),
          nama_lengkap: payload.nama_lengkap.trim(),
          tempat_lahir: payload.tempat_lahir.trim(),
          tanggal_lahir: payload.tanggal_lahir,
          jenis_kelamin: payload.jenis_kelamin,
          alamat: payload.alamat.trim(),
          tahun_masuk: payload.tahun_masuk,
          tahun_ajaran_id: "ta-2026-2027",
          kelas_id: payload.kelas_id,
          kamar_id: payload.kamar_id,
          status: "AKTIF",
        })
        .select()
        .single();

      if (santriErr || !santriResult) {
        throw new Error(`Gagal menyimpan data santri: ${santriErr?.message}`);
      }

      createdSantriId = santriResult.id;

      // Tahap B: Buat Akun Auth Supabase untuk Wali (Username = NIS, Password Awal = NIS)
      const { data: authCreated, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          nama_lengkap: payload.wali.nama_lengkap,
          username: cleanUsername,
          role: "wali",
          santri_id: createdSantriId,
          must_change_password: true,
        },
      });

      if (authErr || !authCreated.user) {
        throw new Error(`Gagal membuat akun auth wali: ${authErr?.message}`);
      }

      createdAuthUserId = authCreated.user.id;

      // Tahap C: Buat profil wali di public.profiles dengan must_change_password = true
      const { error: profileErr } = await adminClient.from("profiles").insert({
        id: createdAuthUserId,
        nama_lengkap: `${payload.wali.nama_lengkap.trim()} (Wali ${payload.nama_lengkap.trim()})`,
        username: cleanUsername,
        email: syntheticEmail,
        no_telepon: payload.wali.no_telepon.trim(),
        role: "wali",
        is_active: true,
        santri_id: createdSantriId,
        must_change_password: true,
      });

      if (profileErr) {
        throw new Error(`Gagal membuat profil wali: ${profileErr.message}`);
      }

      // Tahap D: Hubungkan relasi 1:1 di public.wali_santri
      const { error: waliRelErr } = await adminClient.from("wali_santri").insert({
        user_id: createdAuthUserId,
        santri_id: createdSantriId,
        nama_lengkap: payload.wali.nama_lengkap.trim(),
        hubungan: payload.wali.hubungan,
        no_telepon: payload.wali.no_telepon.trim(),
        email: payload.wali.email_kontak ? payload.wali.email_kontak.trim() : syntheticEmail,
        alamat: payload.alamat.trim(),
      });

      if (waliRelErr) {
        throw new Error(`Gagal menghubungkan relasi wali 1:1: ${waliRelErr.message}`);
      }

      // Tahap E: Catat riwayat penempatan awal
      await adminClient.from("riwayat_penempatan_santri").insert({
        santri_id: createdSantriId,
        kelas_lama_id: null,
        kelas_baru_id: payload.kelas_id,
        kamar_lama_id: null,
        kamar_baru_id: payload.kamar_id,
        tanggal_efektif: new Date().toISOString().slice(0, 10),
        keterangan: "Penempatan awal pendaftaran santri baru",
        petugas_nama: callerProfile.role,
      });

      // Tahap F: Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: callerProfile.role,
        aktivitas: "CREATE_SANTRI_WITH_WALI",
        jenis_objek: "santri",
        objek_id: createdSantriId,
        data_sesudah: {
          nis: payload.nis,
          nama_lengkap: payload.nama_lengkap,
          wali_username: cleanUsername,
          kelas_id: payload.kelas_id,
          kamar_id: payload.kamar_id,
        },
        alasan_perubahan: "Registrasi santri baru dan pembuatan akun wali (1:1) melalui server endpoint",
      });

      return NextResponse.json({
        ok: true,
        message: `Santri ${payload.nama_lengkap} (NIS: ${payload.nis}) dan Akun Wali '@${cleanUsername}' berhasil didaftarkan secara atomik.`,
        data: {
          santri_id: createdSantriId,
          wali_username: cleanUsername,
          wali_user_id: createdAuthUserId,
        },
      });
    } catch (txError: any) {
      // MEKANISME ROLLBACK AMAN JIKA TERJADI KEGAGALAN DI TENGAH PROSES
      if (createdAuthUserId) {
        try {
          await adminClient.from("profiles").delete().eq("id", createdAuthUserId);
          await adminClient.auth.admin.deleteUser(createdAuthUserId);
        } catch (rollbackAuthErr) {
          console.error("Rollback Auth Error:", rollbackAuthErr);
        }
      }

      if (createdSantriId) {
        try {
          await adminClient.from("santri").delete().eq("id", createdSantriId);
        } catch (rollbackSantriErr) {
          console.error("Rollback Santri Error:", rollbackSantriErr);
        }
      }

      return NextResponse.json(
        {
          ok: false,
          message: `Transaksi registrasi dibatalkan secara aman (Rollback): ${txError.message}`,
        },
        { status: 500 }
      );
    }
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
    const json = await request.json();
    const validation = deleteSantriSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        { ok: false, message: validation.error.errors[0]?.message ?? "Input tidak valid." },
        { status: 400 }
      );
    }

    const { santri_ids } = validation.data;

    // Mode Demo jika Supabase belum terhubung
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        deleted: santri_ids.length,
        deactivated: 0,
        message: `${santri_ids.length} data santri terpilih berhasil diproses (Mode Demo Standalone).`,
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

    // 2. Verifikasi Hak Akses: Hanya Superadmin dan Admin (Pengasuh Pondok)
    // Sesuai prinsip Anti-Hard-Delete least privilege, role Tata Usaha (TU) DILARANG keras menghapus data santri.
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (
      !callerProfile ||
      !callerProfile.is_active ||
      (callerProfile.role !== "superadmin" && callerProfile.role !== "admin")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Akses ditolak: Hanya Pengasuh Pondok (Admin) atau Superadmin yang berwenang menghapus data santri. Role Tata Usaha (TU) tidak memiliki hak penghapusan data.",
        },
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

    let hardDeletedCount = 0;
    let softDeactivatedCount = 0;

    for (const santriId of santri_ids) {
      // Dapatkan info santri
      const { data: s } = await adminClient
        .from("santri")
        .select("id, nis, nama_lengkap, status")
        .eq("id", santriId)
        .maybeSingle();

      if (!s) continue;

      // Periksa apakah santri memiliki riwayat keuangan atau catatan penting
      const { count: countBayar } = await adminClient
        .from("transaksi_pembayaran")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const { count: countTagihan } = await adminClient
        .from("tagihan")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const { count: countUangSaku } = await adminClient
        .from("mutasi_uang_saku")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const { count: countTahfidz } = await adminClient
        .from("setoran_tahfidz")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const hasHistory =
        (countBayar ?? 0) > 0 ||
        (countTagihan ?? 0) > 0 ||
        (countUangSaku ?? 0) > 0 ||
        (countTahfidz ?? 0) > 0;

      if (hasHistory) {
        // SOFT DELETE: Ubah status menjadi TIDAK_AKTIF agar integritas keuangan terjaga
        await adminClient
          .from("santri")
          .update({ status: "TIDAK_AKTIF" })
          .eq("id", santriId);

        // Nonaktifkan profil wali terkait jika ada
        const { data: waliRecord } = await adminClient
          .from("wali_santri")
          .select("user_id")
          .eq("santri_id", santriId)
          .maybeSingle();

        if (waliRecord?.user_id) {
          await adminClient
            .from("profiles")
            .update({ is_active: false })
            .eq("id", waliRecord.user_id);
        }

        // Catat ke Audit Log
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_role: callerProfile.role,
          aktivitas: "DEACTIVATE_SANTRI_SAFE_DELETE",
          jenis_objek: "santri",
          objek_id: santriId,
          data_sebelum: { status: s.status },
          data_sesudah: { status: "TIDAK_AKTIF" },
          alasan_perubahan: `Penghapusan santri terpilih: ${s.nama_lengkap} (NIS: ${s.nis}) memiliki riwayat transaksi/akademik aktif sehingga dinonaktifkan secara aman (Soft Delete).`,
        });

        softDeactivatedCount++;
      } else {
        // HARD DELETE AMAN: Tidak ada riwayat transaksi atau keuangan
        // 1. Hapus relasi wali_santri dan akun wali jika baru
        const { data: waliRecord } = await adminClient
          .from("wali_santri")
          .select("user_id")
          .eq("santri_id", santriId)
          .maybeSingle();

        if (waliRecord?.user_id) {
          await adminClient.from("wali_santri").delete().eq("santri_id", santriId);
          await adminClient.from("profiles").delete().eq("id", waliRecord.user_id);
          try {
            await adminClient.auth.admin.deleteUser(waliRecord.user_id);
          } catch {}
        }

        // 2. Hapus riwayat penempatan santri
        await adminClient.from("riwayat_penempatan_santri").delete().eq("santri_id", santriId);

        // 3. Hapus baris santri
        await adminClient.from("santri").delete().eq("id", santriId);

        // Catat ke Audit Log
        await adminClient.from("audit_logs").insert({
          user_id: callerUser.id,
          user_role: callerProfile.role,
          aktivitas: "HARD_DELETE_SANTRI",
          jenis_objek: "santri",
          objek_id: santriId,
          data_sebelum: { nis: s.nis, nama_lengkap: s.nama_lengkap },
          alasan_perubahan: `Penghapusan permanen santri terpilih tanpa riwayat transaksi (${s.nama_lengkap})`,
        });

        hardDeletedCount++;
      }
    }

    const totalProcessed = hardDeletedCount + softDeactivatedCount;
    let message = "";
    if (hardDeletedCount > 0 && softDeactivatedCount > 0) {
      message = `${totalProcessed} data santri berhasil diproses (${hardDeletedCount} dihapus permanen, ${softDeactivatedCount} dinonaktifkan aman karena memiliki riwayat).`;
    } else if (softDeactivatedCount > 0) {
      message = `${softDeactivatedCount} data santri dinonaktifkan secara aman (soft delete) untuk melindungi riwayat transaksi & nilai.`;
    } else {
      message = `${hardDeletedCount} data santri berhasil dihapus dari sistem.`;
    }

    return NextResponse.json({
      ok: true,
      deleted: hardDeletedCount,
      deactivated: softDeactivatedCount,
      message,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, message: `Kesalahan server internal: ${msg}` },
      { status: 500 }
    );
  }
}

