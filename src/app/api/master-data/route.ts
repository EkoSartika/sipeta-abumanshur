// ============================================================================
// SIPETA - Secure Master Data API Route (Master Kelas, Kamar, Profil Pesantren)
// Menyediakan operasi CRUD atomik dengan proteksi integritas relasi:
// - Kelas (Tambah, Edit, Hapus Aman / Nonaktif)
// - Kamar Asrama (Tambah, Edit, Hapus Aman / Nonaktif)
// - Profil Pesantren (Update tanpa NPSN, tanpa manipulasi tahun ajaran langsung)
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const preferredRegion = "sin1";

const ALLOWED_ADMIN_ROLES = new Set(["tu", "admin", "superadmin"]);

async function verifyCaller(requireAdmin = false) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ok: false as const,
      status: 401,
      message: "Akses ditolak: Sesi autentikasi tidak ditemukan.",
    };
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    return {
      ok: false as const,
      status: 500,
      message: "Konfigurasi server admin Supabase belum lengkap.",
    };
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, nama_lengkap, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Profil pengguna tidak ditemukan atau tidak aktif.",
    };
  }

  if (requireAdmin && !ALLOWED_ADMIN_ROLES.has(profile.role)) {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Hanya peran Tata Usaha (TU), Pengasuh (Admin), atau Superadmin yang berwenang mengubah Master Data.",
    };
  }

  return {
    ok: true as const,
    user,
    profile,
    adminClient,
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase belum terhubung." }, { status: 400 });
  }

  const check = await verifyCaller(false);
  if (!check.ok) {
    return NextResponse.json({ ok: false, message: check.message }, { status: check.status });
  }

  const { adminClient } = check;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";

  try {
    const fetchKelas = async () => {
      const { data } = await adminClient
        .from("kelas")
        .select("*")
        .order("tingkat")
        .order("kode_kelas");
      return data ?? [];
    };

    const fetchKamar = async () => {
      const { data } = await adminClient
        .from("kamar")
        .select("*")
        .order("kode_kamar");
      return data ?? [];
    };

    const fetchProfil = async () => {
      const { data } = await adminClient
        .from("profil_pesantren")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data;
    };

    if (type === "kelas") return NextResponse.json({ ok: true, data: await fetchKelas() });
    if (type === "kamar") return NextResponse.json({ ok: true, data: await fetchKamar() });
    if (type === "profil") return NextResponse.json({ ok: true, data: await fetchProfil() });

    const [kelasList, kamarList, profil] = await Promise.all([
      fetchKelas(),
      fetchKamar(),
      fetchProfil(),
    ]);

    return NextResponse.json({
      ok: true,
      data: { kelasList, kamarList, profil },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, message: "Supabase belum terhubung." }, { status: 400 });
  }

  const check = await verifyCaller(true);
  if (!check.ok) {
    return NextResponse.json({ ok: false, message: check.message }, { status: check.status });
  }

  const { adminClient, user, profile } = check;

  try {
    const body = await request.json();
    const action = String(body.action || "");

    // ------------------------------------------------------------------------
    // 1. MASTER KELAS
    // ------------------------------------------------------------------------
    if (action === "create_kelas") {
      const p = body.payload || {};
      const cleanKode = String(p.kode_kelas || "").trim().toUpperCase();
      const cleanNama = String(p.nama_kelas || "").trim();
      const tingkat = Number(p.tingkat || 1);
      const kapasitas = Number(p.kapasitas || 30);
      const jenisKelamin = p.jenis_kelamin === "P" ? "P" : "L";

      if (!cleanKode || !cleanNama) {
        return NextResponse.json({ ok: false, message: "Kode kelas dan nama kelas wajib diisi." }, { status: 400 });
      }

      const { data: existing } = await adminClient
        .from("kelas")
        .select("*")
        .ilike("kode_kelas", cleanKode)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          return NextResponse.json(
            { ok: false, message: `Kode kelas '${cleanKode}' sudah digunakan oleh '${existing.nama_kelas}'.` },
            { status: 409 }
          );
        }
        const { data: reactivated, error: reactErr } = await adminClient
          .from("kelas")
          .update({
            kode_kelas: cleanKode,
            nama_kelas: cleanNama,
            tingkat,
            kapasitas,
            wali_kelas_id: p.wali_kelas_id || null,
            wali_kelas_nama: p.wali_kelas_nama || null,
            jenis_kelamin: jenisKelamin,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (reactErr) return NextResponse.json({ ok: false, message: reactErr.message }, { status: 400 });
        return NextResponse.json({
          ok: true,
          data: reactivated,
          message: `Kelas '${cleanNama}' berhasil diaktifkan kembali dan disimpan.`,
        });
      }

      const { data, error } = await adminClient
        .from("kelas")
        .insert({
          kode_kelas: cleanKode,
          nama_kelas: cleanNama,
          tingkat,
          kapasitas,
          wali_kelas_id: p.wali_kelas_id || null,
          wali_kelas_nama: p.wali_kelas_nama || null,
          jenis_kelamin: jenisKelamin,
          is_active: true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, data, message: `Kelas '${cleanNama}' berhasil dibuat.` });
    }

    if (action === "update_kelas") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID kelas wajib disertakan." }, { status: 400 });

      const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.kode_kelas !== undefined) updateObj.kode_kelas = String(p.kode_kelas).trim().toUpperCase();
      if (p.nama_kelas !== undefined) updateObj.nama_kelas = String(p.nama_kelas).trim();
      if (p.tingkat !== undefined) updateObj.tingkat = Number(p.tingkat);
      if (p.kapasitas !== undefined) updateObj.kapasitas = Number(p.kapasitas);
      if (p.wali_kelas_id !== undefined) updateObj.wali_kelas_id = p.wali_kelas_id || null;
      if (p.wali_kelas_nama !== undefined) updateObj.wali_kelas_nama = p.wali_kelas_nama || null;
      if (p.jenis_kelamin !== undefined) updateObj.jenis_kelamin = p.jenis_kelamin;
      if (p.is_active !== undefined) updateObj.is_active = p.is_active;

      const { error } = await adminClient.from("kelas").update(updateObj).eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data kelas berhasil diperbarui." });
    }

    if (action === "delete_kelas") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID kelas wajib disertakan." }, { status: 400 });

      // Cek apakah masih ada santri aktif di kelas ini
      const { count: santriCount } = await adminClient
        .from("santri")
        .select("id", { count: "exact", head: true })
        .eq("kelas_id", id)
        .eq("status", "AKTIF");

      if ((santriCount ?? 0) > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: `Kelas ini masih memiliki ${santriCount} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kelas.`,
          },
          { status: 409 }
        );
      }

      // Cek riwayat penempatan santri
      const { count: historyCount } = await adminClient
        .from("riwayat_penempatan_santri")
        .select("id", { count: "exact", head: true })
        .or(`kelas_lama_id.eq.${id},kelas_baru_id.eq.${id}`);

      if ((historyCount ?? 0) > 0) {
        // Soft deactivate agar riwayat penempatan masa lalu tetap utuh
        const { error: updErr } = await adminClient
          .from("kelas")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (updErr) return NextResponse.json({ ok: false, message: updErr.message }, { status: 400 });
        return NextResponse.json({
          ok: true,
          actionTaken: "DEACTIVATED",
          message: "Kelas dinonaktifkan secara aman karena memiliki histori penempatan santri terdahulu.",
        });
      }

      // Hard delete aman jika tidak ada referensi
      const { error } = await adminClient.from("kelas").delete().eq("id", id);
      if (error) {
        await adminClient.from("kelas").update({ is_active: false }).eq("id", id);
        return NextResponse.json({
          ok: true,
          actionTaken: "DEACTIVATED",
          message: "Kelas dinonaktifkan secara aman.",
        });
      }
      return NextResponse.json({ ok: true, actionTaken: "DELETED", message: "Kelas berhasil dihapus permanen." });
    }

    // ------------------------------------------------------------------------
    // 2. MASTER KAMAR ASRAMA
    // ------------------------------------------------------------------------
    if (action === "create_kamar") {
      const p = body.payload || {};
      const cleanKode = String(p.kode_kamar || "").trim().toUpperCase();
      const cleanNama = String(p.nama_kamar || "").trim();
      const cleanGedung = String(p.gedung_asrama || "").trim();
      const kapasitas = Number(p.kapasitas || 20);
      const jenisKelamin = p.jenis_kelamin === "P" ? "P" : "L";

      if (!cleanKode || !cleanNama || !cleanGedung) {
        return NextResponse.json({ ok: false, message: "Kode kamar, nama kamar, dan gedung asrama wajib diisi." }, { status: 400 });
      }

      const { data: existing } = await adminClient
        .from("kamar")
        .select("*")
        .ilike("kode_kamar", cleanKode)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          return NextResponse.json(
            { ok: false, message: `Kode kamar '${cleanKode}' sudah digunakan oleh '${existing.nama_kamar}'.` },
            { status: 409 }
          );
        }
        const { data: reactivated, error: reactErr } = await adminClient
          .from("kamar")
          .update({
            kode_kamar: cleanKode,
            nama_kamar: cleanNama,
            gedung_asrama: cleanGedung,
            kapasitas,
            musyrif_id: p.musyrif_id || null,
            musyrif_nama: p.musyrif_nama || null,
            jenis_kelamin: jenisKelamin,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (reactErr) return NextResponse.json({ ok: false, message: reactErr.message }, { status: 400 });
        return NextResponse.json({
          ok: true,
          data: reactivated,
          message: `Kamar asrama '${cleanNama}' berhasil diaktifkan kembali dan disimpan.`,
        });
      }

      const { data, error } = await adminClient
        .from("kamar")
        .insert({
          kode_kamar: cleanKode,
          nama_kamar: cleanNama,
          gedung_asrama: cleanGedung,
          kapasitas,
          musyrif_id: p.musyrif_id || null,
          musyrif_nama: p.musyrif_nama || null,
          jenis_kelamin: jenisKelamin,
          is_active: true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, data, message: `Kamar asrama '${cleanNama}' berhasil dibuat.` });
    }

    if (action === "update_kamar") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID kamar wajib disertakan." }, { status: 400 });

      const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.kode_kamar !== undefined) updateObj.kode_kamar = String(p.kode_kamar).trim().toUpperCase();
      if (p.nama_kamar !== undefined) updateObj.nama_kamar = String(p.nama_kamar).trim();
      if (p.gedung_asrama !== undefined) updateObj.gedung_asrama = String(p.gedung_asrama).trim();
      if (p.kapasitas !== undefined) updateObj.kapasitas = Number(p.kapasitas);
      if (p.musyrif_id !== undefined) updateObj.musyrif_id = p.musyrif_id || null;
      if (p.musyrif_nama !== undefined) updateObj.musyrif_nama = p.musyrif_nama || null;
      if (p.jenis_kelamin !== undefined) updateObj.jenis_kelamin = p.jenis_kelamin;
      if (p.is_active !== undefined) updateObj.is_active = p.is_active;

      const { error } = await adminClient.from("kamar").update(updateObj).eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data kamar asrama berhasil diperbarui." });
    }

    if (action === "delete_kamar") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID kamar wajib disertakan." }, { status: 400 });

      // Cek santri aktif
      const { count: santriCount } = await adminClient
        .from("santri")
        .select("id", { count: "exact", head: true })
        .eq("kamar_id", id)
        .eq("status", "AKTIF");

      if ((santriCount ?? 0) > 0) {
        return NextResponse.json(
          {
            ok: false,
            message: `Kamar asrama ini masih ditempati oleh ${santriCount} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kamar.`,
          },
          { status: 409 }
        );
      }

      // Cek riwayat penempatan santri
      const { count: historyCount } = await adminClient
        .from("riwayat_penempatan_santri")
        .select("id", { count: "exact", head: true })
        .or(`kamar_lama_id.eq.${id},kamar_baru_id.eq.${id}`);

      if ((historyCount ?? 0) > 0) {
        const { error: updErr } = await adminClient
          .from("kamar")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (updErr) return NextResponse.json({ ok: false, message: updErr.message }, { status: 400 });
        return NextResponse.json({
          ok: true,
          actionTaken: "DEACTIVATED",
          message: "Kamar asrama dinonaktifkan secara aman karena memiliki histori penempatan santri terdahulu.",
        });
      }

      const { error } = await adminClient.from("kamar").delete().eq("id", id);
      if (error) {
        await adminClient.from("kamar").update({ is_active: false }).eq("id", id);
        return NextResponse.json({
          ok: true,
          actionTaken: "DEACTIVATED",
          message: "Kamar asrama dinonaktifkan secara aman.",
        });
      }
      return NextResponse.json({ ok: true, actionTaken: "DELETED", message: "Kamar asrama berhasil dihapus permanen." });
    }

    // ------------------------------------------------------------------------
    // 3. PROFIL PESANTREN (TANPA NPSN)
    // ------------------------------------------------------------------------
    if (action === "update_profil_pesantren") {
      const p = body.payload || {};
      const singletonId = "00000000-0000-0000-0000-000000000001";
      const { data: existing } = await adminClient
        .from("profil_pesantren")
        .select("id")
        .limit(1)
        .maybeSingle();

      const targetId = existing?.id || singletonId;
      const safePayload = { ...p };
      delete safePayload.id;
      delete safePayload.tahun_pelajaran_aktif;
      delete safePayload.semester_aktif;
      delete safePayload.npsn; // HILANGKAN NPSN SESUAI INSTRUKSI 1

      // Coba simpan seluruh field terlebih dahulu (jika migration 026 sudah dieksekusi di Supabase Cloud)
      let updateResult = await adminClient
        .from("profil_pesantren")
        .update({
          ...safePayload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);

      // Jika kolom ekstensi migration 026 (nama_yayasan, logo_yayasan_url, dll) belum ada di DB Cloud, fallback secara anggun
      if (updateResult.error && updateResult.error.message.includes("does not exist")) {
        const legacyPayload = { ...safePayload };
        delete legacyPayload.nama_yayasan;
        delete legacyPayload.logo_yayasan_url;
        delete legacyPayload.logo_pesantren_url;
        delete legacyPayload.no_wa;
        delete legacyPayload.jabatan_penandatangan;

        updateResult = await adminClient
          .from("profil_pesantren")
          .update({
            ...legacyPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetId);
      }

      if (updateResult.error) return NextResponse.json({ ok: false, message: updateResult.error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Profil pesantren berhasil disimpan ke database." });
    }

    return NextResponse.json({ ok: false, message: `Aksi '${action}' tidak dikenali.` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

