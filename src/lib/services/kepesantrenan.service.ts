// ============================================================================
// SIPETA - Modul Kepesantrenan Repository / Service Layer
// Melayani pencatatan perkembangan mengaji, setoran tahfidz, prestasi,
// serta kedisiplinan santri dengan riwayat pembinaan (audit trail)
// Sesuai Bagian F PRD & Instruksi Modul Kepesantrenan
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  CatatanKedisiplinan,
  MasterKategoriPelanggaran,
  PerkembanganMengaji,
  PrestasiSantri,
  RiwayatPerubahanKedisiplinan,
  SetoranTahfidz,
  StatusTindakLanjut,
} from "@/types/database";

export interface CatatMengajiParams {
  santri_id: string;
  tanggal_penilaian?: string;
  pembimbing_name: string;
  metode_pembelajaran: string;
  tingkat_jilid: string;
  materi_terakhir: string;
  kelancaran_bacaan: string;
  makharijul_huruf: string;
  tajwid: string;
  catatan_perkembangan: string;
}

export interface CatatTahfidzParams {
  santri_id: string;
  tanggal_setoran?: string;
  pembimbing_name: string;
  nama_surah: string;
  juz: number;
  ayat_awal: number;
  ayat_akhir: number;
  jenis_setoran: "HAFALAN_BARU" | "MUROJAAH";
  kualitas_hafalan: string;
  catatan_pembimbing?: string;
}

export interface CatatPrestasiParams {
  santri_id: string;
  tanggal_prestasi?: string;
  nama_kegiatan: string;
  kategori: string;
  tingkat_prestasi: "INTERNAL" | "KECAMATAN" | "KABUPATEN_KOTA" | "PROVINSI" | "NASIONAL" | "INTERNASIONAL";
  peringkat: string;
  deskripsi: string;
  dokumentasi_path?: string;
}

export interface CatatKedisiplinanParams {
  santri_id: string;
  tanggal_kejadian?: string;
  waktu_kejadian?: string;
  kategori_id: string;
  deskripsi: string;
  tindak_lanjut: string;
  catatan_pembinaan: string;
  status_tindak_lanjut?: StatusTindakLanjut;
  dokumentasi_path?: string;
  is_published_to_wali?: boolean;
}

export class KepesantrenanService {
  private client = createSupabaseBrowserClient();

  // --------------------------------------------------------------------------
  // 1. PERKEMBANGAN MENGAJI
  // --------------------------------------------------------------------------
  async getPerkembanganMengaji(santriId?: string): Promise<PerkembanganMengaji[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("perkembangan_mengaji")
      .select("*, santri:santri_id(*), petugas:petugas_id(*)")
      .order("tanggal_penilaian", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat data mengaji: ${error.message}`);
    return (data as PerkembanganMengaji[]) ?? [];
  }

  async catatPerkembanganMengaji(params: CatatMengajiParams): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { error } = await this.client.from("perkembangan_mengaji").insert({
      santri_id: params.santri_id,
      tanggal_penilaian: params.tanggal_penilaian ?? new Date().toISOString().split("T")[0],
      pembimbing_name: params.pembimbing_name,
      metode_pembelajaran: params.metode_pembelajaran,
      tingkat_jilid: params.tingkat_jilid,
      materi_terakhir: params.materi_terakhir,
      kelancaran_bacaan: params.kelancaran_bacaan,
      makharijul_huruf: params.makharijul_huruf,
      tajwid: params.tajwid,
      catatan_perkembangan: params.catatan_perkembangan,
      petugas_id: user?.id,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Catatan perkembangan mengaji berhasil disimpan." };
  }

  // --------------------------------------------------------------------------
  // 2. SETORAN TAHFIDZ & TARGET
  // --------------------------------------------------------------------------
  async getSetoranTahfidz(santriId?: string): Promise<SetoranTahfidz[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("setoran_tahfidz")
      .select("*, santri:santri_id(*), petugas:petugas_id(*)")
      .order("tanggal_setoran", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat setoran tahfidz: ${error.message}`);
    return (data as SetoranTahfidz[]) ?? [];
  }

  async catatSetoranTahfidz(params: CatatTahfidzParams): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { error } = await this.client.from("setoran_tahfidz").insert({
      santri_id: params.santri_id,
      tanggal_setoran: params.tanggal_setoran ?? new Date().toISOString().split("T")[0],
      pembimbing_name: params.pembimbing_name,
      nama_surah: params.nama_surah,
      juz: params.juz,
      ayat_awal: params.ayat_awal,
      ayat_akhir: params.ayat_akhir,
      jenis_setoran: params.jenis_setoran,
      kualitas_hafalan: params.kualitas_hafalan,
      catatan_pembimbing: params.catatan_pembimbing ?? null,
      petugas_id: user?.id,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Setoran tahfidz berhasil disimpan." };
  }

  // --------------------------------------------------------------------------
  // 3. PRESTASI SANTRI
  // --------------------------------------------------------------------------
  async getPrestasiSantri(santriId?: string): Promise<PrestasiSantri[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("prestasi_santri")
      .select("*, santri:santri_id(*), petugas:petugas_id(*)")
      .order("tanggal_prestasi", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat prestasi santri: ${error.message}`);
    return (data as PrestasiSantri[]) ?? [];
  }

  async catatPrestasiSantri(params: CatatPrestasiParams): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { error } = await this.client.from("prestasi_santri").insert({
      santri_id: params.santri_id,
      tanggal_prestasi: params.tanggal_prestasi ?? new Date().toISOString().split("T")[0],
      nama_kegiatan: params.nama_kegiatan,
      kategori: params.kategori,
      tingkat_prestasi: params.tingkat_prestasi,
      peringkat: params.peringkat,
      deskripsi: params.deskripsi,
      dokumentasi_path: params.dokumentasi_path ?? null,
      petugas_id: user?.id,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Prestasi santri berhasil didokumentasikan." };
  }

  // --------------------------------------------------------------------------
  // 4. KEDISIPLINAN & RIWAYAT PEMBINAAN
  // --------------------------------------------------------------------------
  async getMasterKategoriPelanggaran(): Promise<MasterKategoriPelanggaran[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await this.client
      .from("master_kategori_pelanggaran")
      .select("*")
      .eq("is_active", true)
      .order("poin_pembinaan", { ascending: true });

    if (error) throw new Error(`Gagal memuat master pelanggaran: ${error.message}`);
    return (data as MasterKategoriPelanggaran[]) ?? [];
  }

  async getCatatanKedisiplinan(santriId?: string): Promise<CatatanKedisiplinan[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("catatan_kedisiplinan")
      .select("*, santri:santri_id(*), kategori:kategori_id(*), petugas:petugas_id(*)")
      .order("tanggal_kejadian", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat catatan kedisiplinan: ${error.message}`);
    return (data as CatatanKedisiplinan[]) ?? [];
  }

  async catatKedisiplinan(params: CatatKedisiplinanParams): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const now = new Date();
    const currentTime = now.toTimeString().split(" ")[0];

    const { error } = await this.client.from("catatan_kedisiplinan").insert({
      santri_id: params.santri_id,
      tanggal_kejadian: params.tanggal_kejadian ?? now.toISOString().split("T")[0],
      waktu_kejadian: params.waktu_kejadian ?? currentTime,
      kategori_id: params.kategori_id,
      deskripsi: params.deskripsi,
      tindak_lanjut: params.tindak_lanjut,
      catatan_pembinaan: params.catatan_pembinaan,
      status_tindak_lanjut: params.status_tindak_lanjut ?? "DALAM_PEMBINAAN",
      dokumentasi_path: params.dokumentasi_path ?? null,
      is_published_to_wali: params.is_published_to_wali ?? true,
      petugas_id: user?.id,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Catatan kedisiplinan santri berhasil disimpan." };
  }

  async updateTindakLanjutKedisiplinan(
    id: string,
    payload: {
      status_tindak_lanjut: StatusTindakLanjut;
      tindak_lanjut?: string;
      catatan_pembinaan?: string;
      alasan_perubahan: string;
    }
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    // Trigger handle_before_kedisiplinan_update() otomatis mencatat ke riwayat_perubahan_kedisiplinan
    const updateData: Record<string, unknown> = {
      status_tindak_lanjut: payload.status_tindak_lanjut,
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    };
    if (payload.tindak_lanjut) updateData.tindak_lanjut = payload.tindak_lanjut;
    if (payload.catatan_pembinaan) updateData.catatan_pembinaan = payload.catatan_pembinaan;

    const { error } = await this.client
      .from("catatan_kedisiplinan")
      .update(updateData)
      .eq("id", id);

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: "Status tindak lanjut diperbarui dan riwayat pembinaan berhasil dicatat.",
    };
  }

  async getRiwayatPerubahanKedisiplinan(
    catatanId: string
  ): Promise<RiwayatPerubahanKedisiplinan[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await this.client
      .from("riwayat_perubahan_kedisiplinan")
      .select("*, pengubah:diubah_oleh(*)")
      .eq("catatan_kedisiplinan_id", catatanId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Gagal memuat riwayat pembinaan: ${error.message}`);
    return (data as RiwayatPerubahanKedisiplinan[]) ?? [];
  }
}

export const kepesantrenanService = new KepesantrenanService();

