// ============================================================================
// SIPETA - Secure Server-Side Santri Registration & Safe Deletion Endpoint
// Melayani registrasi atomik santri + akun wali (1:1) dengan rollback aman,
// serta penghapusan massal santri dengan verifikasi relasi keuangan/akademik.
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
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import {
  isDataWaliLengkap,
  packWaliAlamatWithFamilyMetadata,
} from "@/lib/utils/family-metadata";
import type { IdentitasKeluargaSantri } from "@/types/database";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const registerSantriSchema = z.object({
  nis: z.string().min(3, "NIS minimal 3 karakter."),
  nama_lengkap: z.string().min(3, "Nama santri minimal 3 karakter."),
  tempat_lahir: z.string().min(2, "Tempat lahir wajib diisi."),
  tanggal_lahir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal lahir harus YYYY-MM-DD."),
  jenis_kelamin: z.enum(["L", "P"]),
  alamat: z.string().min(5, "Alamat minimal 5 karakter."),
  tahun_masuk: z.number().int().min(2000),
  tahun_ajaran_id: z.string().optional(),
  kelas_id: z.string().min(1, "Kelas wajib dipilih."),
  kamar_id: z.string().min(1, "Kamar asrama wajib dipilih."),
  ayah: z
    .object({
      nama_lengkap: z.string().optional().or(z.literal("")),
      no_telepon: z.string().optional().or(z.literal("")),
      pekerjaan: z.string().optional().or(z.literal("")),
    })
    .optional(),
  ibu: z
    .object({
      nama_lengkap: z.string().optional().or(z.literal("")),
      no_telepon: z.string().optional().or(z.literal("")),
      pekerjaan: z.string().optional().or(z.literal("")),
    })
    .optional(),
  data_wali: z
    .object({
      nama_lengkap: z.string().optional().or(z.literal("")),
      hubungan: z.string().optional().or(z.literal("")),
      no_telepon: z.string().optional().or(z.literal("")),
    })
    .optional()
    .nullable(),
  penanggung_jawab: z.enum(["Ayah", "Ibu", "Wali"]).optional(),
  wali: z
    .object({
      nama_lengkap: z.string().optional().or(z.literal("")),
      hubungan: z.enum(["Ayah", "Ibu", "Wali"]).optional(),
      no_telepon: z.string().optional().or(z.literal("")),
      username_wali: z.string().optional(),
      password_wali: z.string().optional(),
      email_kontak: z.string().email("Format email kontak tidak valid.").optional().or(z.literal("")),
    })
    .optional(),
});

const deleteSantriSchema = z.object({
  santri_ids: z.array(z.string().min(1)).min(1, "Minimal pilih 1 santri untuk dihapus."),
});

export async function GET(request: NextRequest) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, message: "Supabase belum dihubungkan." }, { status: 400 });
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

    const [santriRes, waliRes, kelasRes, kamarRes] = await Promise.all([
      adminClient.from("santri").select("*").order("nama_lengkap"),
      adminClient.from("wali_santri").select("*"),
      adminClient.from("kelas").select("*").eq("is_active", true).order("tingkat").order("kode_kelas"),
      adminClient.from("kamar").select("*").eq("is_active", true).order("kode_kamar"),
    ]);

    const santriList = santriRes.data ?? [];
    const waliList = waliRes.data ?? [];

    return NextResponse.json({
      ok: true,
      data: {
        santriList,
        waliList,
        kelasList: kelasRes.data ?? [],
        kamarList: kamarRes.data ?? [],
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const json = await request.json();
    const { id, payload } = json;

    if (!id || !payload) {
      return NextResponse.json({ ok: false, message: "ID santri dan payload wajib disertakan." }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: false, message: "Supabase belum dihubungkan." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: callerUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !callerUser) {
      return NextResponse.json({ ok: false, message: "Akses ditolak: Anda harus login terlebih dahulu." }, { status: 401 });
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json({ ok: false, message: "Konfigurasi server admin Supabase belum lengkap." }, { status: 500 });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (
      !callerProfile ||
      !callerProfile.is_active ||
      (callerProfile.role !== "superadmin" && callerProfile.role !== "admin" && callerProfile.role !== "tu")
    ) {
      return NextResponse.json({ ok: false, message: "Akses ditolak: Tidak memiliki wewenang mengedit data santri." }, { status: 403 });
    }

    // 1. Ambil data santri saat ini untuk validasi dan perbandingan riwayat
    const { data: currentSantri } = await adminClient
      .from("santri")
      .select("id, nis, nama_lengkap, kelas_id, kamar_id, status")
      .eq("id", id)
      .maybeSingle();

    if (!currentSantri) {
      return NextResponse.json({ ok: false, message: "Data santri tidak ditemukan." }, { status: 404 });
    }

    // 2. Siapkan update data santri
    const updateSantriObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (payload.nis !== undefined) {
      const cleanNis = String(payload.nis).trim();
      if (!cleanNis) {
        return NextResponse.json({ ok: false, message: "NIS tidak boleh kosong." }, { status: 400 });
      }
      // Validasi duplikasi NIS terhadap santri lain
      const { data: existingNis } = await adminClient
        .from("santri")
        .select("id, nis")
        .eq("nis", cleanNis)
        .neq("id", id)
        .maybeSingle();

      if (existingNis) {
        return NextResponse.json(
          { ok: false, message: `NIS "${cleanNis}" sudah digunakan oleh santri lain.` },
          { status: 400 }
        );
      }
      updateSantriObj.nis = cleanNis;
    }

    if (payload.nama_lengkap !== undefined) updateSantriObj.nama_lengkap = String(payload.nama_lengkap).trim();
    if (payload.tempat_lahir !== undefined) updateSantriObj.tempat_lahir = String(payload.tempat_lahir).trim();
    if (payload.tanggal_lahir !== undefined) updateSantriObj.tanggal_lahir = payload.tanggal_lahir;
    if (payload.jenis_kelamin !== undefined) updateSantriObj.jenis_kelamin = payload.jenis_kelamin;
    if (payload.alamat !== undefined) updateSantriObj.alamat = String(payload.alamat).trim();
    if (payload.tahun_masuk !== undefined) updateSantriObj.tahun_masuk = Number(payload.tahun_masuk);
    if (payload.kelas_id !== undefined) updateSantriObj.kelas_id = payload.kelas_id;
    if (payload.kamar_id !== undefined) updateSantriObj.kamar_id = payload.kamar_id;
    if (payload.status !== undefined) updateSantriObj.status = payload.status;

    const { error: santriErr } = await adminClient
      .from("santri")
      .update(updateSantriObj)
      .eq("id", id);

    if (santriErr) {
      return NextResponse.json({ ok: false, message: `Gagal memperbarui santri: ${santriErr.message}` }, { status: 400 });
    }

    // Catat mutasi penempatan jika kelas atau kamar berubah
    if (
      (payload.kelas_id && payload.kelas_id !== currentSantri.kelas_id) ||
      (payload.kamar_id && payload.kamar_id !== currentSantri.kamar_id)
    ) {
      await adminClient.from("riwayat_penempatan_santri").insert({
        santri_id: id,
        kelas_lama_id: currentSantri.kelas_id,
        kelas_baru_id: payload.kelas_id || currentSantri.kelas_id,
        kamar_lama_id: currentSantri.kamar_id,
        kamar_baru_id: payload.kamar_id || currentSantri.kamar_id,
        alasan: "Pembaruan penempatan oleh Tata Usaha via menu Edit Santri",
        petugas_id: callerUser.id,
      });
    }

    // 3. Update identitas keluarga & wali jika disertakan
    if (payload.identitas_keluarga || payload.wali) {
      const { data: waliRecord } = await adminClient
        .from("wali_santri")
        .select("id, user_id, alamat")
        .eq("santri_id", id)
        .maybeSingle();

      const namaWali = payload.wali?.nama_lengkap || payload.identitas_keluarga?.ayah?.nama_lengkap || "Wali Santri";
      const noHpWali = payload.wali?.no_telepon || payload.identitas_keluarga?.ayah?.no_telepon || "-";
      const hubunganWali = payload.penanggung_jawab || payload.wali?.hubungan || "Ayah";

      let packedAlamat = payload.alamat || "-";
      if (payload.identitas_keluarga) {
        packedAlamat = packWaliAlamatWithFamilyMetadata(payload.alamat || "-", payload.identitas_keluarga);
      }

      if (waliRecord) {
        await adminClient
          .from("wali_santri")
          .update({
            nama_lengkap: namaWali,
            no_telepon: noHpWali,
            hubungan: hubunganWali,
            alamat: packedAlamat,
          })
          .eq("id", waliRecord.id);

        if (waliRecord.user_id) {
          await adminClient
            .from("profiles")
            .update({
              nama_lengkap: namaWali,
              no_telepon: noHpWali,
            })
            .eq("id", waliRecord.user_id);
        }
      }
    }

    // Catat Audit Log
    await adminClient.from("audit_logs").insert({
      user_id: callerUser.id,
      user_role: callerProfile.role,
      aktivitas: "UPDATE_SANTRI",
      jenis_objek: "santri",
      objek_id: id,
      data_sebelum: currentSantri,
      data_sesudah: updateSantriObj,
      alasan_perubahan: `Pembaruan data santri (${currentSantri.nama_lengkap}) oleh ${callerProfile.role}`,
    });

    return NextResponse.json({ ok: true, message: "Data santri dan wali berhasil diperbarui." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

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

    // Validasi Identitas Orang Tua / Wali & Penanggung Jawab Akun
    const hasStructuredFamily = Boolean(payload.ayah || payload.ibu || payload.penanggung_jawab);
    const rawNamaAyah = payload.ayah?.nama_lengkap?.trim() || "";
    const rawNoHpAyah = payload.ayah?.no_telepon?.trim() || "";
    const rawPekerjaanAyah = payload.ayah?.pekerjaan?.trim() || "";

    const rawNamaIbu = payload.ibu?.nama_lengkap?.trim() || "";
    const rawNoHpIbu = payload.ibu?.no_telepon?.trim() || "";
    const rawPekerjaanIbu = payload.ibu?.pekerjaan?.trim() || "";

    const rawNamaWaliOps = payload.data_wali?.nama_lengkap?.trim() || "";
    const rawHubunganWaliOps = payload.data_wali?.hubungan?.trim() || "";
    const rawNoHpWaliOps = payload.data_wali?.no_telepon?.trim() || "";

    if (hasStructuredFamily) {
      if (rawNamaAyah.length < 3) {
        return NextResponse.json(
          { ok: false, message: "Nama lengkap ayah wajib diisi (minimal 3 karakter)." },
          { status: 400 }
        );
      }
      if (rawNamaIbu.length < 3) {
        return NextResponse.json(
          { ok: false, message: "Nama lengkap ibu wajib diisi (minimal 3 karakter)." },
          { status: 400 }
        );
      }

      const anyWaliFieldFilled = Boolean(rawNamaWaliOps || rawHubunganWaliOps || rawNoHpWaliOps);
      const waliLengkap = isDataWaliLengkap({
        nama_lengkap: rawNamaWaliOps,
        hubungan: rawHubunganWaliOps,
        no_telepon: rawNoHpWaliOps,
      });

      if (anyWaliFieldFilled && !waliLengkap) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Data Wali belum lengkap: harap isi Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali secara lengkap, atau kosongkan seluruh bagian Data Wali jika wali tidak ada.",
          },
          { status: 400 }
        );
      }

      if (payload.penanggung_jawab === "Wali" && !waliLengkap) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Pilihan Penanggung Jawab Akun 'Wali' hanya valid jika Data Wali (Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali) diisi lengkap.",
          },
          { status: 400 }
        );
      }
    } else if (!payload.wali?.nama_lengkap || payload.wali.nama_lengkap.trim().length < 3) {
      return NextResponse.json(
        { ok: false, message: "Identitas orang tua (Data Ayah dan Data Ibu) wajib diisi." },
        { status: 400 }
      );
    }

    const penanggungJawab: "Ayah" | "Ibu" | "Wali" = hasStructuredFamily
      ? payload.penanggung_jawab || "Ayah"
      : payload.wali?.hubungan || "Ayah";

    const namaAyahFinal = hasStructuredFamily
      ? rawNamaAyah
      : penanggungJawab === "Ayah"
      ? payload.wali?.nama_lengkap?.trim() || "-"
      : "-";
    const namaIbuFinal = hasStructuredFamily
      ? rawNamaIbu
      : penanggungJawab === "Ibu"
      ? payload.wali?.nama_lengkap?.trim() || "-"
      : "-";
    const namaWaliFinal = hasStructuredFamily
      ? rawNamaWaliOps
      : penanggungJawab === "Wali"
      ? payload.wali?.nama_lengkap?.trim() || ""
      : "";

    const namaPenanggungJawab =
      penanggungJawab === "Ayah"
        ? namaAyahFinal
        : penanggungJawab === "Ibu"
        ? namaIbuFinal
        : namaWaliFinal || payload.wali?.nama_lengkap?.trim() || namaAyahFinal;

    const noTeleponPenanggungJawab =
      penanggungJawab === "Ayah"
        ? rawNoHpAyah || rawNoHpIbu || rawNoHpWaliOps || payload.wali?.no_telepon?.trim() || "-"
        : penanggungJawab === "Ibu"
        ? rawNoHpIbu || rawNoHpAyah || rawNoHpWaliOps || payload.wali?.no_telepon?.trim() || "-"
        : rawNoHpWaliOps || payload.wali?.no_telepon?.trim() || rawNoHpAyah || rawNoHpIbu || "-";

    // 1. Kebijakan Akun Wali Otomatis: Username = NIS, Password Awal = NIS
    const cleanNis = payload.nis.trim();
    const cleanUsername = normalizeUsername(payload.wali?.username_wali || cleanNis);
    const initialPassword = payload.wali?.password_wali || cleanNis;

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

    const identitasKeluarga: IdentitasKeluargaSantri = {
      penanggung_jawab: penanggungJawab,
      santri_nis: cleanNis,
      santri_nama: payload.nama_lengkap.trim(),
      ayah: {
        nama_lengkap: namaAyahFinal,
        no_telepon: rawNoHpAyah || (penanggungJawab === "Ayah" ? noTeleponPenanggungJawab : "-"),
        pekerjaan: rawPekerjaanAyah || "-",
      },
      ibu: {
        nama_lengkap: namaIbuFinal,
        no_telepon: rawNoHpIbu || (penanggungJawab === "Ibu" ? noTeleponPenanggungJawab : "-"),
        pekerjaan: rawPekerjaanIbu || "-",
      },
      wali: namaWaliFinal
        ? {
            nama_lengkap: namaWaliFinal,
            hubungan: rawHubunganWaliOps || "Wali",
            no_telepon: rawNoHpWaliOps || noTeleponPenanggungJawab,
          }
        : null,
    };

    // Mode Simulasi jika project Supabase belum dihubungkan
    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        ok: true,
        message: `Santri ${payload.nama_lengkap} (NIS: ${payload.nis}) dan akun wali '${namaPenanggungJawab}' (@${cleanUsername}) berhasil didaftarkan (Mode Demo Standalone).`,
        data: {
          santri_id: `snt-demo-${Date.now()}`,
          wali_username: cleanUsername,
          penanggung_jawab: penanggungJawab,
          nama_akun_wali: namaPenanggungJawab,
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

    // 4. Verifikasi Keunikan NIS (dan pembersihan otomatis baris yatim jika ada dari transaksi gagal sebelumnya)
    const { data: existingSantri } = await adminClient
      .from("santri")
      .select("id, nis")
      .eq("nis", cleanNis)
      .maybeSingle();

    if (existingSantri) {
      const { data: existingWaliRel } = await adminClient
        .from("wali_santri")
        .select("id")
        .eq("santri_id", existingSantri.id)
        .maybeSingle();

      if (existingWaliRel) {
        return NextResponse.json(
          { ok: false, message: `NIS '${payload.nis}' sudah terdaftar dalam sistem. NIS harus unik.` },
          { status: 409 }
        );
      }

      // Periksa apakah baris santri tanpa wali_santri ini memiliki transaksi
      const [{ count: cTgh }, { count: cByr }, { count: cMut }] = await Promise.all([
        adminClient.from("tagihan").select("id", { count: "exact", head: true }).eq("santri_id", existingSantri.id),
        adminClient.from("transaksi_pembayaran").select("id", { count: "exact", head: true }).eq("santri_id", existingSantri.id),
        adminClient.from("mutasi_uang_saku").select("id", { count: "exact", head: true }).eq("santri_id", existingSantri.id),
      ]);

      if ((cTgh ?? 0) === 0 && (cByr ?? 0) === 0 && (cMut ?? 0) === 0) {
        // Bersihkan baris santri yatim dari percobaan gagal sebelumnya agar pendaftaran ulang berjalan bersih
        await adminClient.from("riwayat_penempatan_santri").delete().eq("santri_id", existingSantri.id);
        await adminClient.from("saldo_uang_saku").delete().eq("santri_id", existingSantri.id);
        await adminClient.from("santri").delete().eq("id", existingSantri.id);
      } else {
        return NextResponse.json(
          { ok: false, message: `NIS '${payload.nis}' sudah terdaftar dalam sistem. NIS harus unik.` },
          { status: 409 }
        );
      }
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

    // 6. Resolusi UUID Tahun Pelajaran Aktif dari public.tahun_ajaran (Jangan pernah mengirim "ta-2026-2027" atau label teks ke kolom UUID)
    let resolvedTahunAjaranId: string | null = null;

    if (payload.tahun_ajaran_id && UUID_REGEX.test(payload.tahun_ajaran_id.trim())) {
      const { data: requestedTa } = await adminClient
        .from("tahun_ajaran")
        .select("id")
        .eq("id", payload.tahun_ajaran_id.trim())
        .maybeSingle();
      if (requestedTa?.id) {
        resolvedTahunAjaranId = requestedTa.id;
      }
    }

    if (!resolvedTahunAjaranId) {
      const { data: activeTa } = await adminClient
        .from("tahun_ajaran")
        .select("id, nama")
        .eq("is_active", true)
        .maybeSingle();

      if (activeTa?.id && UUID_REGEX.test(activeTa.id)) {
        resolvedTahunAjaranId = activeTa.id;
      } else {
        const { data: fallbackTa } = await adminClient
          .from("tahun_ajaran")
          .select("id, nama")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fallbackTa?.id && UUID_REGEX.test(fallbackTa.id)) {
          resolvedTahunAjaranId = fallbackTa.id;
        }
      }
    }

    if (!resolvedTahunAjaranId || !UUID_REGEX.test(resolvedTahunAjaranId)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Registrasi dihentikan: Tahun Pelajaran aktif belum ditemukan di database. Silakan tambahkan dan aktifkan Tahun Pelajaran terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    // 7. Validasi UUID Kelas & Kamar Asrama
    if (!UUID_REGEX.test(payload.kelas_id.trim()) || !UUID_REGEX.test(payload.kamar_id.trim())) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Kelas atau kamar asrama yang dipilih belum valid. Pastikan data Master Kelas dan Master Kamar Asrama sudah dipilih dari daftar aktif.",
        },
        { status: 400 }
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
          nis: cleanNis,
          nama_lengkap: payload.nama_lengkap.trim(),
          tempat_lahir: payload.tempat_lahir.trim(),
          tanggal_lahir: payload.tanggal_lahir,
          jenis_kelamin: payload.jenis_kelamin,
          alamat: payload.alamat.trim(),
          tahun_masuk: payload.tahun_masuk,
          tahun_ajaran_id: resolvedTahunAjaranId,
          kelas_id: payload.kelas_id.trim(),
          kamar_id: payload.kamar_id.trim(),
          status: "AKTIF",
        })
        .select()
        .single();

      if (santriErr || !santriResult) {
        throw new Error(`Gagal menyimpan data santri: ${santriErr?.message}`);
      }

      createdSantriId = santriResult.id;
      identitasKeluarga.santri_id = createdSantriId || undefined;

      // Tahap B: Buat Akun Auth Supabase untuk Wali (Username = NIS, Password Awal = NIS)
      const { data: authCreated, error: authErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          nama_lengkap: namaPenanggungJawab,
          username: cleanUsername,
          role: "wali",
          santri_id: createdSantriId,
          santri_nis: cleanNis,
          santri_nama: payload.nama_lengkap.trim(),
          penanggung_jawab: penanggungJawab,
          identitas_keluarga: identitasKeluarga,
          must_change_password: true,
        },
      });

      if (authErr || !authCreated.user) {
        throw new Error(`Gagal membuat akun auth wali: ${authErr?.message}`);
      }

      createdAuthUserId = authCreated.user.id;

      // Tahap C: Buat profil wali di public.profiles (TANPA kolom santri_id karena relasi 1:1 disimpan resmi di public.wali_santri)
      const { error: profileErr } = await adminClient.from("profiles").insert({
        id: createdAuthUserId,
        nama_lengkap: namaPenanggungJawab,
        username: cleanUsername,
        email: syntheticEmail,
        no_telepon: noTeleponPenanggungJawab,
        role: "wali",
        is_active: true,
        must_change_password: true,
      });

      if (profileErr) {
        throw new Error(`Gagal membuat profil wali: ${profileErr.message}`);
      }

      // Tahap D: Hubungkan relasi 1:1 di public.wali_santri + simpan identitas keluarga lengkap (Ayah, Ibu, Wali, Penanggung Jawab)
      const packedAlamat = packWaliAlamatWithFamilyMetadata(payload.alamat.trim(), identitasKeluarga);
      const { error: waliRelErr } = await adminClient.from("wali_santri").insert({
        user_id: createdAuthUserId,
        santri_id: createdSantriId,
        nama_lengkap: namaPenanggungJawab,
        hubungan: penanggungJawab,
        no_telepon: noTeleponPenanggungJawab,
        email: payload.wali?.email_kontak ? payload.wali.email_kontak.trim() : syntheticEmail,
        alamat: packedAlamat,
      });

      if (waliRelErr) {
        throw new Error(`Gagal menghubungkan relasi wali 1:1: ${waliRelErr.message}`);
      }

      // Tahap E: Catat riwayat penempatan awal (Cegah pencatatan ganda dengan trigger database)
      const { data: existingPlacement } = await adminClient
        .from("riwayat_penempatan_santri")
        .select("id")
        .eq("santri_id", createdSantriId)
        .maybeSingle();

      if (!existingPlacement) {
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
      }

      // Tahap F: Catat ke Audit Log
      await adminClient.from("audit_logs").insert({
        user_id: callerUser.id,
        user_role: callerProfile.role,
        aktivitas: "CREATE_SANTRI_WITH_WALI",
        jenis_objek: "santri",
        objek_id: createdSantriId,
        data_sesudah: {
          nis: cleanNis,
          nama_lengkap: payload.nama_lengkap.trim(),
          wali_username: cleanUsername,
          penanggung_jawab_akun: penanggungJawab,
          nama_akun_wali: namaPenanggungJawab,
          identitas_keluarga: identitasKeluarga,
          kelas_id: payload.kelas_id,
          kamar_id: payload.kamar_id,
        },
        alasan_perubahan: `Registrasi santri baru (${payload.nama_lengkap.trim()} - NIS: ${cleanNis}) dan pembuatan akun wali 1:1 (Penanggung Jawab: ${penanggungJawab} - ${namaPenanggungJawab})`,
      });

      return NextResponse.json({
        ok: true,
        message: `Santri ${payload.nama_lengkap.trim()} (NIS: ${cleanNis}) dan Akun Wali '${namaPenanggungJawab}' (${penanggungJawab}, Username: '@${cleanUsername}') berhasil didaftarkan secara atomik.`,
        data: {
          santri_id: createdSantriId,
          wali_username: cleanUsername,
          wali_user_id: createdAuthUserId,
          penanggung_jawab: penanggungJawab,
          nama_akun_wali: namaPenanggungJawab,
        },
      });
    } catch (txError: any) {
      // MEKANISME ROLLBACK AMAN & MENYELURUH JIKA TERJADI KEGAGALAN DI TENGAH PROSES
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
        } catch (rollbackAuthErr) {
          console.error("Rollback Auth Error:", rollbackAuthErr);
        }
      }

      if (createdSantriId) {
        try {
          // Hapus tabel anak yang dibuat oleh trigger trg_after_santri_insert (terutama saldo_uang_saku yang memiliki ON DELETE RESTRICT)
          await adminClient.from("riwayat_penempatan_santri").delete().eq("santri_id", createdSantriId);
          await adminClient.from("saldo_uang_saku").delete().eq("santri_id", createdSantriId);
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

    if (!callerProfile || !callerProfile.is_active) {
      return NextResponse.json(
        { ok: false, message: "Akses ditolak: Profil pengguna tidak aktif atau tidak ditemukan." },
        { status: 403 }
      );
    }

    if (callerProfile.role === "tu") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Akses ditolak: Role Tata Usaha (TU) tidak memiliki hak penghapusan data santri demi integritas arsip.",
        },
        { status: 403 }
      );
    }

    if (callerProfile.role !== "superadmin" && callerProfile.role !== "admin") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Akses ditolak: Hanya Pengasuh Pondok (Admin) dan Superadmin yang berwenang menghapus data santri.",
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

      const { count: countMengaji } = await adminClient
        .from("perkembangan_mengaji")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const { count: countPrestasi } = await adminClient
        .from("prestasi_santri")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const { count: countDisiplin } = await adminClient
        .from("catatan_kedisiplinan")
        .select("id", { count: "exact", head: true })
        .eq("santri_id", santriId);

      const hasHistory =
        (countBayar ?? 0) > 0 ||
        (countTagihan ?? 0) > 0 ||
        (countUangSaku ?? 0) > 0 ||
        (countTahfidz ?? 0) > 0 ||
        (countMengaji ?? 0) > 0 ||
        (countPrestasi ?? 0) > 0 ||
        (countDisiplin ?? 0) > 0;

      if (hasHistory) {
        // SOFT DELETE: Ubah status menjadi TIDAK_AKTIF agar integritas keuangan terjaga
        await adminClient
          .from("santri")
          .update({ status: "TIDAK_AKTIF" })
          .eq("id", santriId);

        // JANGAN nonaktifkan akun wali — satu wali mungkin memiliki lebih dari satu santri.
        // Hanya santri yang dinonaktifkan; akun wali tetap aktif.

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
        // Periksa apakah akun wali masih terhubung dengan santri lain sebelum menghapus
        const { data: waliRecord } = await adminClient
          .from("wali_santri")
          .select("user_id")
          .eq("santri_id", santriId)
          .maybeSingle();

        if (waliRecord?.user_id) {
          // Periksa apakah wali ini terhubung dengan santri lain
          const { count: waliSantriCount } = await adminClient
            .from("wali_santri")
            .select("id", { count: "exact", head: true })
            .eq("user_id", waliRecord.user_id);

          if ((waliSantriCount ?? 0) <= 1) {
            // Wali hanya terhubung dengan santri ini — aman untuk dihapus seluruhnya
            await adminClient.from("wali_santri").delete().eq("santri_id", santriId);
            await adminClient.from("profiles").delete().eq("id", waliRecord.user_id);
            try {
              await adminClient.auth.admin.deleteUser(waliRecord.user_id);
            } catch {}
          } else {
            // Wali terhubung dengan santri lain — hanya hapus relasi, bukan akun wali
            await adminClient.from("wali_santri").delete().eq("santri_id", santriId);
          }
        }

        // 2. Hapus riwayat penempatan santri & saldo uang saku awal
        await adminClient.from("riwayat_penempatan_santri").delete().eq("santri_id", santriId);
        await adminClient.from("saldo_uang_saku").delete().eq("santri_id", santriId);

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

