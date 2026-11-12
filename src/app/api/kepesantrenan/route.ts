// ============================================================================
// SIPETA - Secure Server-Side Kepesantrenan API Route
// Melayani pembacaan dan mutasi (Tambah, Edit, Hapus) data kepesantrenan:
// - Perkembangan Mengaji
// - Setoran Tahfidz
// - Prestasi Santri
// - Catatan Kedisiplinan & Tindak Lanjut Pembinaan
// - Master Kategori Pelanggaran
// Mendukung penuh peran Asatidz (pengelola/asatidz), Bendahara (yang juga Asatidz),
// Tata Usaha (TU), Pengasuh Pondok (Admin), dan Superadmin.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const preferredRegion = "sin1";

const ALLOWED_MUTATION_ROLES = new Set([
  "pengelola",
  "asatidz",
  "bendahara",
  "tu",
  "admin",
  "superadmin",
]);

async function verifyCaller(requireMutation = false) {
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

  if (requireMutation && !ALLOWED_MUTATION_ROLES.has(profile.role)) {
    return {
      ok: false as const,
      status: 403,
      message: "Akses ditolak: Peran akun Anda tidak memiliki izin perubahan data kepesantrenan.",
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

  const { adminClient, profile } = check;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  let santriId = searchParams.get("santri_id") || undefined;

  // Jika role adalah wali, batasi hanya pada santri yang terhubung 1:1
  if (profile.role === "wali") {
    const { data: waliRel } = await adminClient
      .from("wali_santri")
      .select("santri_id")
      .eq("user_id", profile.id)
      .maybeSingle();
    if (!waliRel?.santri_id) {
      return NextResponse.json({
        ok: true,
        data: {
          mengaji: [],
          tahfidz: [],
          prestasi: [],
          kedisiplinan: [],
          kategoriPelanggaran: [],
        },
      });
    }
    santriId = waliRel.santri_id;
  }

  try {
    const fetchMengaji = async () => {
      let q = adminClient
        .from("perkembangan_mengaji")
        .select("*, santri:santri_id(*), petugas:petugas_id(nama_lengkap)")
        .order("tanggal_penilaian", { ascending: false });
      if (santriId) q = q.eq("santri_id", santriId);
      const { data } = await q;
      return ((data as any[]) ?? []).map((row) => ({
        ...row,
        petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || row.pembimbing_name || "Asatidz",
      }));
    };

    const fetchTahfidz = async () => {
      let q = adminClient
        .from("setoran_tahfidz")
        .select("*, santri:santri_id(*), petugas:petugas_id(nama_lengkap)")
        .order("tanggal_setoran", { ascending: false });
      if (santriId) q = q.eq("santri_id", santriId);
      const { data } = await q;
      return ((data as any[]) ?? []).map((row) => ({
        ...row,
        jumlah_ayat: row.jumlah_ayat ?? (row.ayat_akhir - row.ayat_awal + 1),
        catatan_pembimbing: row.catatan_pembimbing || "",
        petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || row.pembimbing_name || "Asatidz",
      }));
    };

    const fetchPrestasi = async () => {
      let q = adminClient
        .from("prestasi_santri")
        .select("*, santri:santri_id(*), petugas:petugas_id(nama_lengkap)")
        .order("tanggal_prestasi", { ascending: false });
      if (santriId) q = q.eq("santri_id", santriId);
      const { data } = await q;
      return ((data as any[]) ?? []).map((row) => ({
        ...row,
        dokumentasi_url: row.dokumentasi_url || row.dokumentasi_path || undefined,
        petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || "Asatidz",
      }));
    };

    const fetchKedisiplinan = async () => {
      let q = adminClient
        .from("catatan_kedisiplinan")
        .select(
          "*, santri:santri_id(*), kategori:kategori_id(*), petugas:petugas_id(nama_lengkap), riwayat:riwayat_perubahan_kedisiplinan(*, pengubah:diubah_oleh(nama_lengkap))"
        )
        .order("tanggal_kejadian", { ascending: false });
      if (santriId) q = q.eq("santri_id", santriId);
      const { data } = await q;
      return ((data as any[]) ?? []).map((row) => ({
        ...row,
        nama_kategori: row.nama_kategori || row.kategori?.nama_kategori || "Pelanggaran",
        tingkat_pelanggaran: row.tingkat_pelanggaran || row.kategori?.tingkat_pelanggaran || "RINGAN",
        petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || "Petugas Pembinaan",
        dokumentasi_url: row.dokumentasi_url || row.dokumentasi_path || undefined,
        riwayat_perubahan: Array.isArray(row.riwayat_perubahan)
          ? row.riwayat_perubahan
          : Array.isArray(row.riwayat)
          ? row.riwayat.map((r: any) => ({
              ...r,
              diubah_oleh_nama: r.diubah_oleh_nama || r.pengubah?.nama_lengkap || "Petugas",
            }))
          : [],
      }));
    };

    const fetchKategori = async () => {
      const includeInactive = searchParams.get("include_inactive") === "true";
      let q = adminClient
        .from("master_kategori_pelanggaran")
        .select("*")
        .order("poin_pembinaan", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data } = await q;
      return data ?? [];
    };

    if (type === "mengaji") {
      return NextResponse.json({ ok: true, data: await fetchMengaji() });
    }
    if (type === "tahfidz") {
      return NextResponse.json({ ok: true, data: await fetchTahfidz() });
    }
    if (type === "prestasi") {
      return NextResponse.json({ ok: true, data: await fetchPrestasi() });
    }
    if (type === "kedisiplinan") {
      return NextResponse.json({ ok: true, data: await fetchKedisiplinan() });
    }
    if (type === "kategori") {
      return NextResponse.json({ ok: true, data: await fetchKategori() });
    }

    const [mengaji, tahfidz, prestasi, kedisiplinan, kategoriPelanggaran] = await Promise.all([
      fetchMengaji(),
      fetchTahfidz(),
      fetchPrestasi(),
      fetchKedisiplinan(),
      fetchKategori(),
    ]);

    return NextResponse.json({
      ok: true,
      data: { mengaji, tahfidz, prestasi, kedisiplinan, kategoriPelanggaran },
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
    // 1. PERKEMBANGAN MENGAJI
    // ------------------------------------------------------------------------
    if (action === "create_mengaji") {
      const p = body.payload || {};
      const { data, error } = await adminClient
        .from("perkembangan_mengaji")
        .insert({
          santri_id: p.santri_id,
          tanggal_penilaian: p.tanggal_penilaian || new Date().toISOString().split("T")[0],
          pembimbing_name: p.pembimbing_name || profile.nama_lengkap,
          metode_pembelajaran: p.metode_pembelajaran,
          tingkat_jilid: p.tingkat_jilid,
          materi_terakhir: p.materi_terakhir,
          kelancaran_bacaan: p.kelancaran_bacaan,
          makharijul_huruf: p.makharijul_huruf,
          tajwid: p.tajwid,
          catatan_perkembangan: p.catatan_perkembangan,
          petugas_id: user.id,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        data,
        message: "Catatan perkembangan mengaji berhasil disimpan.",
      });
    }

    if (action === "update_mengaji") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID catatan mengaji wajib diisi." }, { status: 400 });
      const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.santri_id !== undefined) updateObj.santri_id = p.santri_id;
      if (p.tanggal_penilaian !== undefined) updateObj.tanggal_penilaian = p.tanggal_penilaian;
      if (p.pembimbing_name !== undefined) updateObj.pembimbing_name = p.pembimbing_name;
      if (p.metode_pembelajaran !== undefined) updateObj.metode_pembelajaran = p.metode_pembelajaran;
      if (p.tingkat_jilid !== undefined) updateObj.tingkat_jilid = p.tingkat_jilid;
      if (p.materi_terakhir !== undefined) updateObj.materi_terakhir = p.materi_terakhir;
      if (p.kelancaran_bacaan !== undefined) updateObj.kelancaran_bacaan = p.kelancaran_bacaan;
      if (p.makharijul_huruf !== undefined) updateObj.makharijul_huruf = p.makharijul_huruf;
      if (p.tajwid !== undefined) updateObj.tajwid = p.tajwid;
      if (p.catatan_perkembangan !== undefined) updateObj.catatan_perkembangan = p.catatan_perkembangan;

      const { error } = await adminClient.from("perkembangan_mengaji").update(updateObj).eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Evaluasi perkembangan mengaji berhasil diperbarui." });
    }

    if (action === "delete_mengaji") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID catatan mengaji wajib diisi." }, { status: 400 });
      const { error } = await adminClient.from("perkembangan_mengaji").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Catatan evaluasi mengaji berhasil dihapus." });
    }

    // ------------------------------------------------------------------------
    // 2. SETORAN TAHFIDZ
    // ------------------------------------------------------------------------
    if (action === "create_tahfidz") {
      const p = body.payload || {};
      const { data, error } = await adminClient
        .from("setoran_tahfidz")
        .insert({
          santri_id: p.santri_id,
          tanggal_setoran: p.tanggal_setoran || new Date().toISOString().split("T")[0],
          pembimbing_name: p.pembimbing_name || profile.nama_lengkap,
          nama_surah: p.nama_surah,
          juz: Number(p.juz),
          ayat_awal: Number(p.ayat_awal),
          ayat_akhir: Number(p.ayat_akhir),
          jenis_setoran: p.jenis_setoran,
          kualitas_hafalan: p.kualitas_hafalan,
          catatan_pembimbing: p.catatan_pembimbing ?? null,
          petugas_id: user.id,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        data,
        message: "Setoran tahfidz berhasil disimpan.",
      });
    }

    if (action === "update_tahfidz") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID setoran tahfidz wajib diisi." }, { status: 400 });
      const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.santri_id !== undefined) updateObj.santri_id = p.santri_id;
      if (p.tanggal_setoran !== undefined) updateObj.tanggal_setoran = p.tanggal_setoran;
      if (p.pembimbing_name !== undefined) updateObj.pembimbing_name = p.pembimbing_name;
      if (p.nama_surah !== undefined) updateObj.nama_surah = p.nama_surah;
      if (p.juz !== undefined) updateObj.juz = Number(p.juz);
      if (p.ayat_awal !== undefined) updateObj.ayat_awal = Number(p.ayat_awal);
      if (p.ayat_akhir !== undefined) updateObj.ayat_akhir = Number(p.ayat_akhir);
      if (p.jenis_setoran !== undefined) updateObj.jenis_setoran = p.jenis_setoran;
      if (p.kualitas_hafalan !== undefined) updateObj.kualitas_hafalan = p.kualitas_hafalan;
      if (p.catatan_pembimbing !== undefined) updateObj.catatan_pembimbing = p.catatan_pembimbing;

      const { error } = await adminClient.from("setoran_tahfidz").update(updateObj).eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data setoran tahfidz berhasil diperbarui." });
    }

    if (action === "delete_tahfidz") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID setoran tahfidz wajib diisi." }, { status: 400 });
      const { error } = await adminClient.from("setoran_tahfidz").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data setoran tahfidz berhasil dihapus." });
    }

    // ------------------------------------------------------------------------
    // 3. PRESTASI SANTRI
    // ------------------------------------------------------------------------
    if (action === "create_prestasi") {
      const p = body.payload || {};
      const { data, error } = await adminClient
        .from("prestasi_santri")
        .insert({
          santri_id: p.santri_id,
          tanggal_prestasi: p.tanggal_prestasi || new Date().toISOString().split("T")[0],
          nama_kegiatan: p.nama_kegiatan,
          kategori: p.kategori,
          tingkat_prestasi: p.tingkat_prestasi,
          peringkat: p.peringkat,
          deskripsi: p.deskripsi,
          dokumentasi_path: p.dokumentasi_path ?? null,
          petugas_id: user.id,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        data,
        message: "Prestasi santri berhasil didokumentasikan.",
      });
    }

    if (action === "update_prestasi") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID prestasi wajib diisi." }, { status: 400 });
      const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (p.santri_id !== undefined) updateObj.santri_id = p.santri_id;
      if (p.tanggal_prestasi !== undefined) updateObj.tanggal_prestasi = p.tanggal_prestasi;
      if (p.nama_kegiatan !== undefined) updateObj.nama_kegiatan = p.nama_kegiatan;
      if (p.kategori !== undefined) updateObj.kategori = p.kategori;
      if (p.tingkat_prestasi !== undefined) updateObj.tingkat_prestasi = p.tingkat_prestasi;
      if (p.peringkat !== undefined) updateObj.peringkat = p.peringkat;
      if (p.deskripsi !== undefined) updateObj.deskripsi = p.deskripsi;
      if (p.dokumentasi_path !== undefined) updateObj.dokumentasi_path = p.dokumentasi_path;

      const { error } = await adminClient.from("prestasi_santri").update(updateObj).eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data prestasi santri berhasil diperbarui." });
    }

    if (action === "delete_prestasi") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID prestasi wajib diisi." }, { status: 400 });
      const { error } = await adminClient.from("prestasi_santri").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Data prestasi santri berhasil dihapus." });
    }

    // ------------------------------------------------------------------------
    // 4. CATATAN KEDISIPLINAN & TINDAK LANJUT
    // ------------------------------------------------------------------------
    if (action === "create_kedisiplinan") {
      const p = body.payload || {};
      const now = new Date();
      const currentTime = now.toTimeString().split(" ")[0];
      const { data, error } = await adminClient
        .from("catatan_kedisiplinan")
        .insert({
          santri_id: p.santri_id,
          tanggal_kejadian: p.tanggal_kejadian || now.toISOString().split("T")[0],
          waktu_kejadian: p.waktu_kejadian || currentTime,
          kategori_id: p.kategori_id,
          deskripsi: p.deskripsi,
          tindak_lanjut: p.tindak_lanjut,
          catatan_pembinaan: p.catatan_pembinaan,
          status_tindak_lanjut: p.status_tindak_lanjut || "DALAM_PEMBINAAN",
          dokumentasi_path: p.dokumentasi_path ?? null,
          is_published_to_wali: p.is_published_to_wali ?? true,
          petugas_id: user.id,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        data,
        message: "Catatan kedisiplinan santri berhasil disimpan.",
      });
    }

    if (action === "update_tindak_lanjut_kedisiplinan") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID catatan kedisiplinan wajib diisi." }, { status: 400 });
      const updateData: Record<string, unknown> = {
        status_tindak_lanjut: p.status_tindak_lanjut,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (p.tindak_lanjut !== undefined) updateData.tindak_lanjut = p.tindak_lanjut;
      if (p.catatan_pembinaan !== undefined) updateData.catatan_pembinaan = p.catatan_pembinaan;

      const { error } = await adminClient
        .from("catatan_kedisiplinan")
        .update(updateData)
        .eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        message: "Status tindak lanjut diperbarui dan riwayat pembinaan berhasil dicatat.",
      });
    }

    if (action === "update_kedisiplinan") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID catatan kedisiplinan wajib diisi." }, { status: 400 });
      const updateData: Record<string, unknown> = {
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (p.santri_id !== undefined) updateData.santri_id = p.santri_id;
      if (p.tanggal_kejadian !== undefined) updateData.tanggal_kejadian = p.tanggal_kejadian;
      if (p.waktu_kejadian !== undefined) updateData.waktu_kejadian = p.waktu_kejadian;
      if (p.kategori_id !== undefined) updateData.kategori_id = p.kategori_id;
      if (p.deskripsi !== undefined) updateData.deskripsi = p.deskripsi;
      if (p.tindak_lanjut !== undefined) updateData.tindak_lanjut = p.tindak_lanjut;
      if (p.catatan_pembinaan !== undefined) updateData.catatan_pembinaan = p.catatan_pembinaan;
      if (p.status_tindak_lanjut !== undefined) updateData.status_tindak_lanjut = p.status_tindak_lanjut;

      const { error } = await adminClient
        .from("catatan_kedisiplinan")
        .update(updateData)
        .eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Catatan pelanggaran santri berhasil diperbarui." });
    }

    if (action === "delete_kedisiplinan") {
      const { id } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID catatan kedisiplinan wajib diisi." }, { status: 400 });
      await adminClient
        .from("riwayat_perubahan_kedisiplinan")
        .delete()
        .eq("catatan_kedisiplinan_id", id);
      const { error } = await adminClient.from("catatan_kedisiplinan").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Catatan pelanggaran santri berhasil dihapus secara aman." });
    }

    // ------------------------------------------------------------------------
    // 5. MASTER KATEGORI PELANGGARAN
    // ------------------------------------------------------------------------
    if (action === "create_kategori_pelanggaran") {
      const p = body.payload || {};
      const cleanKode = String(p.kode_kategori || "").trim().toUpperCase();
      const cleanNama = String(p.nama_kategori || "").trim();
      if (!cleanKode || !cleanNama) {
        return NextResponse.json({ ok: false, message: "Kode dan nama kategori wajib diisi." }, { status: 400 });
      }

      const { data: existing } = await adminClient
        .from("master_kategori_pelanggaran")
        .select("*")
        .ilike("kode_kategori", cleanKode)
        .maybeSingle();

      if (existing) {
        if (existing.is_active) {
          return NextResponse.json(
            { ok: false, message: `Kode kategori '${cleanKode}' sudah digunakan oleh '${existing.nama_kategori}'.` },
            { status: 409 }
          );
        }
        const { data: reactivated, error: reactErr } = await adminClient
          .from("master_kategori_pelanggaran")
          .update({
            kode_kategori: cleanKode,
            nama_kategori: cleanNama,
            tingkat_pelanggaran: p.tingkat_pelanggaran,
            poin_pembinaan: Number(p.poin_pembinaan),
            standar_tindak_lanjut: String(p.standar_tindak_lanjut || "").trim(),
            is_active: true,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (reactErr) return NextResponse.json({ ok: false, message: reactErr.message }, { status: 400 });
        return NextResponse.json({
          ok: true,
          data: reactivated,
          message: `Kategori '${cleanNama}' berhasil diaktifkan kembali dan disimpan.`,
        });
      }

      const { data, error } = await adminClient
        .from("master_kategori_pelanggaran")
        .insert({
          kode_kategori: cleanKode,
          nama_kategori: cleanNama,
          tingkat_pelanggaran: p.tingkat_pelanggaran,
          poin_pembinaan: Number(p.poin_pembinaan),
          standar_tindak_lanjut: String(p.standar_tindak_lanjut || "").trim(),
          is_active: p.is_active ?? true,
        })
        .select()
        .single();
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({
        ok: true,
        data,
        message: `Kategori '${cleanNama}' berhasil ditambahkan.`,
      });
    }

    if (action === "update_kategori_pelanggaran") {
      const { id, payload: p } = body;
      if (!id) return NextResponse.json({ ok: false, message: "ID kategori wajib diisi." }, { status: 400 });
      const updateObj: Record<string, unknown> = {};
      if (p.kode_kategori !== undefined) updateObj.kode_kategori = String(p.kode_kategori).trim().toUpperCase();
      if (p.nama_kategori !== undefined) updateObj.nama_kategori = String(p.nama_kategori).trim();
      if (p.tingkat_pelanggaran !== undefined) updateObj.tingkat_pelanggaran = p.tingkat_pelanggaran;
      if (p.poin_pembinaan !== undefined) updateObj.poin_pembinaan = Number(p.poin_pembinaan);
      if (p.standar_tindak_lanjut !== undefined) updateObj.standar_tindak_lanjut = String(p.standar_tindak_lanjut).trim();
      if (p.is_active !== undefined) updateObj.is_active = p.is_active;

      const { error } = await adminClient
        .from("master_kategori_pelanggaran")
        .update(updateObj)
        .eq("id", id);
      if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Kategori pelanggaran berhasil diperbarui." });
    }

    if (action === "delete_kategori_pelanggaran_batch") {
      const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) {
        return NextResponse.json({ ok: false, message: "Minimal pilih 1 kategori untuk dihapus." }, { status: 400 });
      }
      let deleted = 0;
      let deactivated = 0;
      let failed = 0;

      for (const id of ids) {
        const { count } = await adminClient
          .from("catatan_kedisiplinan")
          .select("id", { count: "exact", head: true })
          .eq("kategori_id", id);

        if ((count ?? 0) > 0) {
          const { error: updErr } = await adminClient
            .from("master_kategori_pelanggaran")
            .update({ is_active: false })
            .eq("id", id);
          if (updErr) failed++;
          else deactivated++;
        } else {
          const { error: delErr } = await adminClient
            .from("master_kategori_pelanggaran")
            .delete()
            .eq("id", id);
          if (delErr) {
            const { error: fallbackErr } = await adminClient
              .from("master_kategori_pelanggaran")
              .update({ is_active: false })
              .eq("id", id);
            if (fallbackErr) failed++;
            else deactivated++;
          } else {
            deleted++;
          }
        }
      }

      return NextResponse.json({
        ok: failed === 0,
        message: `Proses kategori: ${deleted} dihapus permanen, ${deactivated} dinonaktifkan aman${failed > 0 ? `, ${failed} gagal` : ""}.`,
        summary: { total: ids.length, deleted, deactivated, failed },
      });
    }

    return NextResponse.json({ ok: false, message: `Aksi '${action}' tidak dikenali.` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}

