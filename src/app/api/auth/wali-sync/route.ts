// ============================================================================
// SIPETA - Provisioning & Sinkronisasi Akun Wali Santri Otomatis
// Memastikan santri resmi yang terdaftar memiliki akun Auth & wali_santri 1:1
// tanpa memodifikasi password atau akun yang sudah ada.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
} from "@/lib/utils/auth-mapping";
import { packWaliAlamatWithFamilyMetadata } from "@/lib/utils/family-metadata";
import type { IdentitasKeluargaSantri } from "@/types/database";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase belum terkonfigurasi." }, { status: 400 });
  }

  try {
    const json = await request.json();
    const identifier = String(json.identifier || "").trim();

    if (!identifier) {
      return NextResponse.json({ ok: false, message: "Identifier wajib disertakan." }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    if (!adminClient) {
      return NextResponse.json({ ok: false, message: "Klien admin Supabase tidak tersedia." }, { status: 500 });
    }

    // 1. Cek apakah identifier adalah NIS dari santri aktif yang ada di public.santri
    const { data: santri } = await adminClient
      .from("santri")
      .select("id, nis, nama_lengkap, alamat")
      .eq("nis", identifier)
      .maybeSingle();

    if (!santri) {
      // Bukan NIS santri atau santri tidak ditemukan -> biarkan alur login normal memeriksa username staff/superadmin
      return NextResponse.json({ ok: true, provisioned: false, message: "Bukan santri atau santri tidak ditemukan." });
    }

    // 2. Cek apakah santri ini sudah memiliki relasi di public.wali_santri
    const { data: existingWali } = await adminClient
      .from("wali_santri")
      .select("id, user_id, nama_lengkap")
      .eq("santri_id", santri.id)
      .maybeSingle();

    if (existingWali && existingWali.user_id) {
      // Sudah ada akun wali resmi yang terhubung 1:1 -> jangan modifikasi apapun
      return NextResponse.json({ ok: true, provisioned: false, message: "Akun wali santri sudah tersedia." });
    }

    // 3. Santri yatim (ada di public.santri tapi belum ada wali_santri / akun auth karena rollback bug sebelumnya)
    // Sediakan akun wali 1:1 resmi: username = NIS, initial password = NIS
    const cleanNis = santri.nis.trim();
    const cleanUsername = normalizeUsername(cleanNis);
    const initialPassword = cleanNis;
    const syntheticEmail = usernameToInternalEmail(cleanUsername);
    const defaultNamaWali = `Wali ${santri.nama_lengkap}`;

    const identitasKeluarga: IdentitasKeluargaSantri = {
      penanggung_jawab: "Ayah",
      santri_id: santri.id,
      santri_nis: cleanNis,
      santri_nama: santri.nama_lengkap,
      ayah: {
        nama_lengkap: defaultNamaWali,
        no_telepon: "-",
        pekerjaan: "-",
      },
      ibu: {
        nama_lengkap: "-",
        no_telepon: "-",
        pekerjaan: "-",
      },
      wali: null,
    };

    // Periksa apakah user di auth sudah ada dengan email syntheticEmail
    let targetUserId: string | null = null;
    const { data: existingAuthUser } = await adminClient.auth.admin.listUsers();
    const foundAuth = existingAuthUser?.users?.find(
      (u) => u.email?.toLowerCase() === syntheticEmail.toLowerCase()
    );

    if (foundAuth) {
      targetUserId = foundAuth.id;
    } else {
      const { data: newAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          nama_lengkap: defaultNamaWali,
          username: cleanUsername,
          role: "wali",
          santri_id: santri.id,
          santri_nis: cleanNis,
          santri_nama: santri.nama_lengkap,
          penanggung_jawab: "Ayah",
          identitas_keluarga: identitasKeluarga,
          must_change_password: true,
        },
      });

      if (createAuthErr || !newAuth.user) {
        return NextResponse.json(
          { ok: false, message: `Gagal membuat akun wali: ${createAuthErr?.message}` },
          { status: 500 }
        );
      }
      targetUserId = newAuth.user.id;
    }

    // Pastikan profil ada di public.profiles
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (!existingProfile) {
      await adminClient.from("profiles").insert({
        id: targetUserId,
        nama_lengkap: defaultNamaWali,
        username: cleanUsername,
        email: syntheticEmail,
        no_telepon: "-",
        role: "wali",
        is_active: true,
        must_change_password: true,
      });
    }

    // Pastikan relasi terhubung di public.wali_santri
    const packedAlamat = packWaliAlamatWithFamilyMetadata(santri.alamat || "-", identitasKeluarga);
    await adminClient.from("wali_santri").upsert({
      user_id: targetUserId,
      santri_id: santri.id,
      nama_lengkap: defaultNamaWali,
      hubungan: "Ayah",
      no_telepon: "-",
      email: syntheticEmail,
      alamat: packedAlamat,
    });

    return NextResponse.json({
      ok: true,
      provisioned: true,
      message: `Akun wali santri ${santri.nama_lengkap} (NIS: ${cleanNis}) berhasil disinkronkan.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

