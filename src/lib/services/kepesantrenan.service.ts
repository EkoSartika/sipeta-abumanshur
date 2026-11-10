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
    try {
      const url = santriId ? `/api/kepesantrenan?type=mengaji&santri_id=${encodeURIComponent(santriId)}` : `/api/kepesantrenan?type=mengaji`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}

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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_mengaji",
          payload: params,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Catatan perkembangan mengaji berhasil disimpan." : "Gagal menyimpan evaluasi mengaji."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async updatePenilaianMengaji(id: string, payload: Partial<PerkembanganMengaji>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_mengaji",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Evaluasi mengaji berhasil diperbarui." : "Gagal memperbarui evaluasi mengaji."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async deletePenilaianMengaji(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_mengaji",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Catatan evaluasi mengaji berhasil dihapus." : "Gagal menghapus evaluasi mengaji."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  // --------------------------------------------------------------------------
  // 2. SETORAN TAHFIDZ & TARGET
  // --------------------------------------------------------------------------
  async getSetoranTahfidz(santriId?: string): Promise<SetoranTahfidz[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const url = santriId ? `/api/kepesantrenan?type=tahfidz&santri_id=${encodeURIComponent(santriId)}` : `/api/kepesantrenan?type=tahfidz`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}

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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_tahfidz",
          payload: params,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Setoran tahfidz berhasil disimpan." : "Gagal menyimpan setoran tahfidz."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async updateSetoranTahfidz(id: string, payload: Partial<SetoranTahfidz>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_tahfidz",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Data setoran tahfidz berhasil diperbarui." : "Gagal memperbarui setoran tahfidz."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async deleteSetoranTahfidz(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_tahfidz",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Data setoran tahfidz berhasil dihapus." : "Gagal menghapus setoran tahfidz."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  // --------------------------------------------------------------------------
  // 3. PRESTASI SANTRI
  // --------------------------------------------------------------------------
  async getPrestasiSantri(santriId?: string): Promise<PrestasiSantri[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const url = santriId ? `/api/kepesantrenan?type=prestasi&santri_id=${encodeURIComponent(santriId)}` : `/api/kepesantrenan?type=prestasi`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}

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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_prestasi",
          payload: params,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Prestasi santri berhasil didokumentasikan." : "Gagal mendokumentasikan prestasi."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async updatePrestasiSantri(id: string, payload: Partial<PrestasiSantri>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_prestasi",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Data prestasi santri berhasil diperbarui." : "Gagal memperbarui prestasi."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async deletePrestasiSantri(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Koneksi Supabase belum aktif." };
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_prestasi",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Data prestasi santri berhasil dihapus." : "Gagal menghapus prestasi."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  // --------------------------------------------------------------------------
  // 4. KEDISIPLINAN & RIWAYAT PEMBINAAN
  // --------------------------------------------------------------------------
  async getMasterKategoriPelanggaran(includeInactive = false): Promise<MasterKategoriPelanggaran[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const res = await fetch(`/api/kepesantrenan?type=kategori&include_inactive=${includeInactive}`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}

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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_kategori_pelanggaran",
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        data: data.data,
        message: data.message ?? "Kategori pelanggaran berhasil ditambahkan.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal menambahkan kategori." };
    }
  }

  async updateMasterKategoriPelanggaran(
    id: string,
    payload: Partial<MasterKategoriPelanggaran>
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, message: "Kategori pelanggaran berhasil diperbarui (Mode Demo Standalone)." };
    }
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_kategori_pelanggaran",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Kategori pelanggaran berhasil diperbarui.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal memperbarui kategori." };
    }
  }

  async deleteOrDeactivateMasterKategoriPelanggaran(
    id: string
  ): Promise<{ ok: boolean; actionTaken: "DELETED" | "DEACTIVATED"; message: string }> {
    const res = await this.deleteMasterKategoriPelanggaranBatch([id]);
    return {
      ok: res.ok,
      actionTaken: res.summary.deleted > 0 ? "DELETED" : "DEACTIVATED",
      message: res.message,
    };
  }

  async deleteMasterKategoriPelanggaranBatch(ids: string[]): Promise<{
    ok: boolean;
    message: string;
    summary: { total: number; deleted: number; deactivated: number; failed: number };
  }> {
    if (!isSupabaseConfigured()) {
      return {
        ok: true,
        message: "Kategori berhasil diproses.",
        summary: { total: ids.length, deleted: ids.length, deactivated: 0, failed: 0 },
      };
    }
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_kategori_pelanggaran_batch",
          ids,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Kategori berhasil diproses.",
        summary: data.summary ?? { total: ids.length, deleted: 0, deactivated: 0, failed: 0 },
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err.message ?? "Gagal memproses kategori.",
        summary: { total: ids.length, deleted: 0, deactivated: 0, failed: ids.length },
      };
    }
  }

  async getCatatanKedisiplinan(santriId?: string): Promise<CatatanKedisiplinan[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const url = santriId ? `/api/kepesantrenan?type=kedisiplinan&santri_id=${encodeURIComponent(santriId)}` : `/api/kepesantrenan?type=kedisiplinan`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}

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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_kedisiplinan",
          payload: params,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Catatan kedisiplinan santri berhasil disimpan." : "Gagal menyimpan catatan kedisiplinan."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
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
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_tindak_lanjut_kedisiplinan",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Status tindak lanjut diperbarui dan riwayat pembinaan berhasil dicatat." : "Gagal memperbarui tindak lanjut."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async updateCatatanKedisiplinan(
    id: string,
    payload: Partial<CatatanKedisiplinan>
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_kedisiplinan",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Catatan pelanggaran santri berhasil diperbarui." : "Gagal memperbarui catatan pelanggaran."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
  }

  async deleteCatatanKedisiplinan(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    try {
      const res = await fetch("/api/kepesantrenan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_kedisiplinan",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Catatan pelanggaran santri berhasil dihapus secara aman." : "Gagal menghapus catatan pelanggaran."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan koneksi." };
    }
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

