// ============================================================================
// SIPETA - Server-Side Batch Import Santri & Automated Wali Account Endpoint
// Melakukan validasi ulang di server, eksekusi batch per baris, dan isolasi kegagalan
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  usernameToInternalEmail,
} from "@/lib/utils/auth-mapping";
import type { ImportBatchReport, ImportRowResult } from "@/types/database";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const importRowSchema = z.object({
  row_number: z.number().int(),
  nis: z.string().min(3).max(30),
  nama_lengkap: z.string().min(3),
  jenis_kelamin: z.enum(["L", "P"]),
  tempat_lahir: z.string().min(2),
  tanggal_lahir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kelas: z.string().min(1),
  kode_kelas: z.string().min(1),
  kamar: z.string().min(1),
  nama_wali: z.string().min(3),
  hubungan_wali: z.enum(["Ayah", "Ibu", "Wali"]),
  no_telepon_wali: z.string().min(8),
  email_kontak: z.string().optional(),
  alamat: z.string().min(5),
  tahun_ajaran: z.string().optional(),
});

const importPayloadSchema = z.object({
  rows: z.array(importRowSchema).min(1, "Minimal sertakan 1 baris data santri."),
  tahun_ajaran_id: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const validation = importPayloadSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        {
          ok: false,
          message: validation.error.errors[0]?.message || "Format data import tidak valid.",
        },
        { status: 400 }
      );
    }

    const { rows } = validation.data;

    // Batasi ukuran batch maksimal 500 baris per request
    if (rows.length > 500) {
      return NextResponse.json(
        { ok: false, message: "Maksimal 500 data santri per satu kali proses import." },
        { status: 400 }
      );
    }

    // Mode Simulasi jika project Supabase belum terkonfigurasi
    if (!isSupabaseConfigured()) {
      const demoResults: ImportRowResult[] = rows.map((r) => ({
        row_number: r.row_number,
        nis: r.nis,
        nama_lengkap: r.nama_lengkap,
        status: "SUCCESS",
        santri_id: `snt-demo-${r.nis}`,
        wali_username: r.nis,
      }));

      const demoReport: ImportBatchReport = {
        total_processed: rows.length,
        success_count: rows.length,
        failed_count: 0,
        wali_account_created_count: rows.length,
        results: demoResults,
        imported_at: new Date().toISOString(),
      };

      return NextResponse.json({
        ok: true,
        message: `Berhasil memproses import ${rows.length} santri dan akun wali (Mode Demo).`,
        report: demoReport,
      });
    }

    // 1. Verifikasi Autentikasi Pengguna di Server
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

    // 2. Verifikasi Otorisasi (Hanya Superadmin & Admin)
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role, is_active, nama_lengkap")
      .eq("id", callerUser.id)
      .single();

    if (
      !callerProfile ||
      !callerProfile.is_active ||
      (callerProfile.role !== "superadmin" && callerProfile.role !== "admin" && callerProfile.role !== "tu")
    ) {
      return NextResponse.json(
        {
          ok: false,
          message: "Akses ditolak: Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang melakukan import data santri.",
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

    // 3. Cache Data Master Kelas, Kamar, & Tahun Pelajaran
    const [{ data: kelasDb }, { data: kamarDb }, { data: tahunAjaranDb }] = await Promise.all([
      adminClient.from("kelas").select("id, kode_kelas, nama_kelas"),
      adminClient.from("kamar").select("id, kode_kamar, nama_kamar"),
      adminClient.from("tahun_ajaran").select("id, nama, is_active").order("created_at", { ascending: false }),
    ]);

    const kelasList = kelasDb || [];
    const kamarList = kamarDb || [];
    const tahunAjaranList = tahunAjaranDb || [];

    // Resolusi UUID Tahun Pelajaran Aktif
    const requestedTaId = validation.data.tahun_ajaran_id?.trim();
    const activeTaRecord =
      (requestedTaId && UUID_REGEX.test(requestedTaId)
        ? tahunAjaranList.find((t) => t.id === requestedTaId)
        : undefined) ||
      tahunAjaranList.find((t) => t.is_active && UUID_REGEX.test(t.id)) ||
      tahunAjaranList.find((t) => UUID_REGEX.test(t.id));

    if (!activeTaRecord || !UUID_REGEX.test(activeTaRecord.id)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Proses import dihentikan: Tahun Pelajaran aktif belum ditemukan di database. Silakan tambahkan dan aktifkan Tahun Pelajaran terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const results: ImportRowResult[] = [];
    let successCount = 0;
    let failedCount = 0;
    let waliCreatedCount = 0;

    // 4. Proses Batch Baris per Baris Secara Aman
    for (const r of rows) {
      const cleanNis = r.nis.trim();
      const cleanNama = r.nama_lengkap.trim();

      // Pemetaan Tahun Pelajaran per baris (jika kolom tahun_ajaran diisi label mis. "2026/2027", petakan ke UUID asli)
      let rowTahunAjaranId = activeTaRecord.id;
      if (r.tahun_ajaran && r.tahun_ajaran.trim()) {
        const cleanTaLabel = r.tahun_ajaran.trim();
        const matchedTa = tahunAjaranList.find(
          (t) =>
            UUID_REGEX.test(t.id) &&
            (t.nama.trim().toLowerCase() === cleanTaLabel.toLowerCase() || t.id === cleanTaLabel)
        );
        if (matchedTa) {
          rowTahunAjaranId = matchedTa.id;
        }
      }

      // Cari Kelas & Kamar ID
      const matchedKelas = kelasList.find(
        (k) =>
          k.kode_kelas.toUpperCase() === r.kode_kelas.toUpperCase().trim() ||
          k.nama_kelas.toLowerCase().includes(r.kelas.toLowerCase().trim())
      );

      const matchedKamar = kamarList.find(
        (km) =>
          km.nama_kamar.toLowerCase().includes(r.kamar.toLowerCase().trim()) ||
          km.kode_kamar.toLowerCase() === r.kamar.toLowerCase().trim()
      );

      if (!matchedKelas) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `Kelas '${r.kode_kelas || r.kelas}' tidak ditemukan di database.`,
        });
        failedCount++;
        continue;
      }

      if (!matchedKamar) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `Kamar '${r.kamar}' tidak ditemukan di database.`,
        });
        failedCount++;
        continue;
      }

      // Cek apakah NIS sudah ada di database
      const { data: existingSantri } = await adminClient
        .from("santri")
        .select("id")
        .eq("nis", cleanNis)
        .maybeSingle();

      if (existingSantri) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `NIS '${cleanNis}' sudah terdaftar dalam sistem.`,
        });
        failedCount++;
        continue;
      }

      const syntheticEmail = usernameToInternalEmail(cleanNis);

      let createdSantriId: string | null = null;
      let createdAuthUserId: string | null = null;

      try {
        // A. Insert Santri (dengan UUID tahun_ajaran_id dari record public.tahun_ajaran)
        const { data: santriInserted, error: sntErr } = await adminClient
          .from("santri")
          .insert({
            nis: cleanNis,
            nama_lengkap: cleanNama,
            tempat_lahir: r.tempat_lahir.trim(),
            tanggal_lahir: r.tanggal_lahir,
            jenis_kelamin: r.jenis_kelamin,
            alamat: r.alamat.trim(),
            tahun_masuk: 2026,
            tahun_ajaran_id: rowTahunAjaranId,
            kelas_id: matchedKelas.id,
            kamar_id: matchedKamar.id,
            status: "AKTIF",
          })
          .select("id")
          .single();

        if (sntErr || !santriInserted) {
          throw new Error(`Gagal menyimpan data santri: ${sntErr?.message}`);
        }

        createdSantriId = santriInserted.id;

        // B. Buat Akun Auth Supabase untuk Wali (Username = NIS, Password Awal = NIS)
        // Set must_change_password = true di user_metadata
        const { data: authCreated, error: authErr } = await adminClient.auth.admin.createUser({
          email: syntheticEmail,
          password: cleanNis, // Password awal = NIS santri
          email_confirm: true,
          user_metadata: {
            nama_lengkap: r.nama_wali.trim(),
            username: cleanNis,
            role: "wali",
            santri_id: createdSantriId,
            must_change_password: true,
          },
        });

        if (authErr || !authCreated.user) {
          throw new Error(`Gagal membuat akun auth wali: ${authErr?.message}`);
        }

        createdAuthUserId = authCreated.user.id;

        // C. Buat Profile Wali di public.profiles dengan must_change_password = TRUE (tanpa santri_id karena relasi 1:1 di public.wali_santri)
        const { error: profErr } = await adminClient.from("profiles").insert({
          id: createdAuthUserId,
          nama_lengkap: r.nama_wali.trim(),
          username: cleanNis,
          email: syntheticEmail,
          no_telepon: r.no_telepon_wali.trim(),
          role: "wali",
          is_active: true,
          must_change_password: true,
        });

        if (profErr) {
          throw new Error(`Gagal membuat profil wali: ${profErr.message}`);
        }

        // D. Buat Relasi 1:1 di public.wali_santri
        const { error: waliRelErr } = await adminClient.from("wali_santri").insert({
          user_id: createdAuthUserId,
          santri_id: createdSantriId,
          nama_lengkap: r.nama_wali.trim(),
          hubungan: r.hubungan_wali,
          no_telepon: r.no_telepon_wali.trim(),
          email: r.email_kontak ? r.email_kontak.trim() : syntheticEmail,
          alamat: r.alamat.trim(),
        });

        if (waliRelErr) {
          throw new Error(`Gagal menghubungkan relasi wali 1:1: ${waliRelErr.message}`);
        }

        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "SUCCESS",
          santri_id: createdSantriId || undefined,
          wali_username: cleanNis,
        });

        successCount++;
        waliCreatedCount++;
      } catch (err: unknown) {
        // Rollback atomik untuk baris ini jika sempat membuat entitas
        if (createdSantriId) {
          try {
            await adminClient.from("wali_santri").delete().eq("santri_id", createdSantriId);
          } catch {}
        }
        if (createdAuthUserId) {
          try {
            await adminClient.from("wali_santri").delete().eq("user_id", createdAuthUserId);
            await adminClient.from("profiles").delete().eq("id", createdAuthUserId);
            await adminClient.auth.admin.deleteUser(createdAuthUserId);
          } catch {
            // ignore rollback cleanup error
          }
        }
        if (createdSantriId) {
          try {
            await adminClient.from("riwayat_penempatan_santri").delete().eq("santri_id", createdSantriId);
            await adminClient.from("saldo_uang_saku").delete().eq("santri_id", createdSantriId);
            await adminClient.from("santri").delete().eq("id", createdSantriId);
          } catch {
            // ignore rollback cleanup error
          }
        }

        const msg = err instanceof Error ? err.message : "Kesalahan tidak terduga.";
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: msg,
        });
        failedCount++;
      }
    }

    // 5. Catat Aktivitas Import ke Audit Log (Tanpa Rahasia / Password)
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_nama: callerProfile.nama_lengkap || "Petugas Administrasi",
      user_role: callerProfile.role,
      aktivitas: "IMPORT_SANTRI_EXCEL",
      jenis_objek: "SANTRI_BATCH",
      objek_id: `batch-${Date.now()}`,
      alasan_perubahan: `Import massal santri & akun wali via Excel. Total: ${rows.length}, Berhasil: ${successCount}, Gagal: ${failedCount}`,
      data_sesudah: {
        total_diproses: rows.length,
        berhasil_dibuat: successCount,
        gagal: failedCount,
        akun_wali_dibuat: waliCreatedCount,
      },
      waktu: new Date().toISOString(),
    });

    const report: ImportBatchReport = {
      total_processed: rows.length,
      success_count: successCount,
      failed_count: failedCount,
      wali_account_created_count: waliCreatedCount,
      results,
      imported_at: new Date().toISOString(),
    };

    return NextResponse.json({
      ok: true,
      message: `Proses import selesai: ${successCount} data berhasil, ${failedCount} data gagal.`,
      report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
