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
  TingkatPrestasi,
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
  tingkat_prestasi: TingkatPrestasi | "KABUPATEN_KOTA";
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
    if (error) {
      console.warn(`Gagal memuat data mengaji: ${error.message}`);
      return [];
    }
    return ((data as any[]) ?? []).map((row) => ({
      ...row,
      petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || row.pembimbing_name || "Asatidz",
    })) as PerkembanganMengaji[];
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
    if (error) {
      console.warn(`Gagal memuat setoran tahfidz: ${error.message}`);
      return [];
    }
    return ((data as any[]) ?? []).map((row) => ({
      ...row,
      jumlah_ayat: row.jumlah_ayat ?? (row.ayat_akhir - row.ayat_awal + 1),
      catatan_pembimbing: row.catatan_pembimbing || "",
      petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || row.pembimbing_name || "Asatidz",
    })) as SetoranTahfidz[];
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
    if (error) {
      console.warn(`Gagal memuat prestasi santri: ${error.message}`);
      return [];
    }
    return ((data as any[]) ?? []).map((row) => ({
      ...row,
      dokumentasi_url: row.dokumentasi_url || row.dokumentasi_path || undefined,
      petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || "Asatidz",
    })) as PrestasiSantri[];
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
  async getMasterKategoriPelanggaran(includeInactive = false): Promise<MasterKategoriPelanggaran[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("master_kategori_pelanggaran")
      .select("*")
      .order("poin_pembinaan", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat master pelanggaran: ${error.message}`);
    return (data as MasterKategoriPelanggaran[]) ?? [];
  }

  async createMasterKategoriPelanggaran(payload: {
    kode_kategori: string;
    nama_kategori: string;
    tingkat_pelanggaran: "RINGAN" | "SEDANG" | "BERAT";
    poin_pembinaan: number;
    standar_tindak_lanjut: string;
    is_active?: boolean;
  }): Promise<{ ok: boolean; message: string; data?: MasterKategoriPelanggaran }> {
    if (!isSupabaseConfigured()) {
      return {
        ok: true,
        message: "Kategori pelanggaran berhasil dibuat (Mode Demo Standalone).",
      };
    }

    const { data, error } = await this.client
      .from("master_kategori_pelanggaran")
      .insert({
        kode_kategori: payload.kode_kategori.trim().toUpperCase(),
        nama_kategori: payload.nama_kategori.trim(),
        tingkat_pelanggaran: payload.tingkat_pelanggaran,
        poin_pembinaan: payload.poin_pembinaan,
        standar_tindak_lanjut: payload.standar_tindak_lanjut.trim(),
        is_active: payload.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return { ok: false, message: `Gagal menambahkan kategori: ${error.message}` };
    }
    return { ok: true, message: `Kategori '${payload.nama_kategori}' berhasil ditambahkan.`, data: data as MasterKategoriPelanggaran };
  }

  async updateMasterKategoriPelanggaran(
    id: string,
    payload: Partial<MasterKategoriPelanggaran>
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, message: "Kategori pelanggaran berhasil diperbarui (Mode Demo Standalone)." };
    }

    const updateObj: Record<string, unknown> = {};
    if (payload.nama_kategori !== undefined) updateObj.nama_kategori = payload.nama_kategori.trim();
    if (payload.tingkat_pelanggaran !== undefined) updateObj.tingkat_pelanggaran = payload.tingkat_pelanggaran;
    if (payload.poin_pembinaan !== undefined) updateObj.poin_pembinaan = payload.poin_pembinaan;
    if (payload.standar_tindak_lanjut !== undefined) updateObj.standar_tindak_lanjut = payload.standar_tindak_lanjut.trim();
    if (payload.is_active !== undefined) updateObj.is_active = payload.is_active;

    const { error } = await this.client
      .from("master_kategori_pelanggaran")
      .update(updateObj)
      .eq("id", id);

    if (error) {
      return { ok: false, message: `Gagal memperbarui kategori: ${error.message}` };
    }
    return { ok: true, message: "Kategori pelanggaran berhasil diperbarui." };
  }

  async deleteOrDeactivateMasterKategoriPelanggaran(
    id: string
  ): Promise<{ ok: boolean; actionTaken: "DELETED" | "DEACTIVATED"; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, actionTaken: "DELETED", message: "Kategori berhasil dihapus (Mode Demo Standalone)." };
    }

    // Periksa apakah kategori telah digunakan dalam catatan_kedisiplinan
    const { count, error: countErr } = await this.client
      .from("catatan_kedisiplinan")
      .select("id", { count: "exact", head: true })
      .eq("kategori_id", id);

    if (countErr) {
      return { ok: false, actionTaken: "DEACTIVATED", message: `Gagal memeriksa riwayat: ${countErr.message}` };
    }

    if ((count ?? 0) > 0) {
      // Nonaktifkan saja demi integritas data historis
      const { error: updErr } = await this.client
        .from("master_kategori_pelanggaran")
        .update({ is_active: false })
        .eq("id", id);

      if (updErr) {
        return { ok: false, actionTaken: "DEACTIVATED", message: `Gagal menonaktifkan kategori: ${updErr.message}` };
      }
      return {
        ok: true,
        actionTaken: "DEACTIVATED",
        message: "Kategori telah digunakan dalam riwayat kedisiplinan santri sehingga dinonaktifkan secara aman (soft-deactivate).",
      };
    }

    // Jika belum digunakan, coba hapus permanen
    const { error: delErr } = await this.client
      .from("master_kategori_pelanggaran")
      .delete()
      .eq("id", id);

    if (delErr) {
      // Fallback ke nonaktif jika ada dependensi
      await this.client.from("master_kategori_pelanggaran").update({ is_active: false }).eq("id", id);
      return {
        ok: true,
        actionTaken: "DEACTIVATED",
        message: "Kategori dinonaktifkan karena terdapat relasi data yang dilindungi.",
      };
    }

    return {
      ok: true,
      actionTaken: "DELETED",
      message: "Kategori pelanggaran berhasil dihapus permanen.",
    };
  }

  async deleteMasterKategoriPelanggaranBatch(ids: string[]): Promise<{
    ok: boolean;
    message: string;
    summary: { total: number; deleted: number; deactivated: number; failed: number };
  }> {
    let deleted = 0;
    let deactivated = 0;
    let failed = 0;

    for (const id of ids) {
      const res = await this.deleteOrDeactivateMasterKategoriPelanggaran(id);
      if (res.ok) {
        if (res.actionTaken === "DELETED") deleted++;
        else deactivated++;
      } else {
        failed++;
      }
    }

    return {
      ok: true,
      message: `Proses kategori: ${deleted} dihapus permanen, ${deactivated} dinonaktifkan aman, ${failed} gagal.`,
      summary: { total: ids.length, deleted, deactivated, failed },
    };
  }

  async getCatatanKedisiplinan(santriId?: string): Promise<CatatanKedisiplinan[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("catatan_kedisiplinan")
      .select("*, santri:santri_id(*), kategori:kategori_id(*), petugas:petugas_id(*), riwayat:riwayat_perubahan_kedisiplinan(*, pengubah:diubah_oleh(*))")
      .order("tanggal_kejadian", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`Gagal memuat catatan kedisiplinan: ${error.message}`);
      return [];
    }
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
    })) as CatatanKedisiplinan[];
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

  async updateCatatanKedisiplinan(
    id: string,
    payload: Partial<CatatanKedisiplinan>
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const {
      data: { user },
    } = await this.client.auth.getUser();

    const updateData: Record<string, unknown> = {
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    };
    if (payload.tanggal_kejadian) updateData.tanggal_kejadian = payload.tanggal_kejadian;
    if (payload.waktu_kejadian) updateData.waktu_kejadian = payload.waktu_kejadian;
    if (payload.kategori_id) updateData.kategori_id = payload.kategori_id;
    if (payload.deskripsi) updateData.deskripsi = payload.deskripsi;
    if (payload.tindak_lanjut) updateData.tindak_lanjut = payload.tindak_lanjut;
    if (payload.catatan_pembinaan) updateData.catatan_pembinaan = payload.catatan_pembinaan;
    if (payload.status_tindak_lanjut) updateData.status_tindak_lanjut = payload.status_tindak_lanjut;

    const { error } = await this.client
      .from("catatan_kedisiplinan")
      .update(updateData)
      .eq("id", id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Catatan pelanggaran santri berhasil diperbarui." };
  }

  async deleteCatatanKedisiplinan(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    // Hapus riwayat perubahan terlebih dahulu jika ada
    await this.client
      .from("riwayat_perubahan_kedisiplinan")
      .delete()
      .eq("catatan_kedisiplinan_id", id);

    const { error } = await this.client
      .from("catatan_kedisiplinan")
      .delete()
      .eq("id", id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Catatan pelanggaran santri berhasil dihapus secara aman." };
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

