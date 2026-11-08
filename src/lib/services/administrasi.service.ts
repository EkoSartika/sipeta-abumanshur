// ============================================================================
// SIPETA - Modul Administrasi Repository / Service Layer
// Melayani CRUD data master pesantren, pendaftaran santri/wali (1:1),
// penempatan kelas/kamar, jenis pembayaran, generator tagihan, & pengumuman
// Sesuai Bagian D PRD & Instruksi Modul Administrasi
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  JenisPembayaran,
  Kamar,
  Kelas,
  Pengumuman,
  RekeningPesantren,
  RiwayatPenempatanSantri,
  Santri,
  StatusSantri,
  Tagihan,
  TahunAjaran,
  WaliSantri,
} from "@/types/database";

export class AdministrasiService {
  private client = createSupabaseBrowserClient();

  // --------------------------------------------------------------------------
  // MASTER DATA: REKENING RESMI & TAHUN AJARAN
  // --------------------------------------------------------------------------
  async getRekeningResmi(): Promise<RekeningPesantren | null> {
    if (!isSupabaseConfigured()) return null;
    const { data } = await this.client
      .from("rekening_pesantren")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .single();
    return data ?? null;
  }

  async updateRekeningResmi(payload: Partial<RekeningPesantren>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client
      .from("rekening_pesantren")
      .update(payload)
      .eq("is_active", true);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Rekening resmi pesantren berhasil diperbarui." };
  }

  async getTahunAjaranList(): Promise<TahunAjaran[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("tahun_ajaran").select("*").order("created_at", { ascending: false });
    return (data as TahunAjaran[]) ?? [];
  }

  // --------------------------------------------------------------------------
  // KELAS & KAMAR ASRAMA
  // --------------------------------------------------------------------------
  async getKelasList(): Promise<Kelas[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("kelas").select("*").order("tingkat");
    return (data as Kelas[]) ?? [];
  }

  async createKelas(payload: Omit<Kelas, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; data?: Kelas; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { data, error } = await this.client.from("kelas").insert(payload).select().single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as Kelas, message: "Kelas baru berhasil dibuat." };
  }

  async getKamarList(): Promise<Kamar[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("kamar").select("*").order("kode_kamar");
    return (data as Kamar[]) ?? [];
  }

  async createKamar(payload: Omit<Kamar, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; data?: Kamar; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { data, error } = await this.client.from("kamar").insert(payload).select().single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as Kamar, message: "Kamar asrama baru berhasil ditambahkan." };
  }

  // --------------------------------------------------------------------------
  // DATA SANTRI & WALI (RELASI 1:1)
  // --------------------------------------------------------------------------
  async getSantriList(): Promise<Santri[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("santri").select("*").order("nama_lengkap");
    return (data as Santri[]) ?? [];
  }

  async getWaliList(): Promise<WaliSantri[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("wali_santri").select("*");
    return (data as WaliSantri[]) ?? [];
  }

  async getRiwayatPenempatanList(santriId?: string): Promise<RiwayatPenempatanSantri[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client.from("riwayat_penempatan_santri").select("*").order("created_at", { ascending: false });
    if (santriId) query = query.eq("santri_id", santriId);
    const { data } = await query;
    return (data as RiwayatPenempatanSantri[]) ?? [];
  }

  async createSantriWithWali(payload: {
    nis: string;
    nama_lengkap: string;
    tempat_lahir: string;
    tanggal_lahir: string;
    jenis_kelamin: "L" | "P";
    alamat: string;
    tahun_masuk: number;
    tahun_ajaran_id: string;
    kelas_id: string;
    kamar_id: string;
    wali: {
      nama_lengkap: string;
      hubungan: "Ayah" | "Ibu" | "Wali";
      no_telepon: string;
      email: string;
    };
  }): Promise<{ ok: boolean; message: string; santriId?: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };

    try {
      // 1. Buat profil wali di auth/profiles
      const { data: waliProfile, error: profileErr } = await this.client
        .from("profiles")
        .insert({
          nama_lengkap: payload.wali.nama_lengkap,
          email: payload.wali.email,
          no_telepon: payload.wali.no_telepon,
          role: "wali",
          is_active: true,
        })
        .select()
        .single();

      if (profileErr || !waliProfile) {
        return { ok: false, message: `Gagal membuat akun profil wali: ${profileErr?.message}` };
      }

      // 2. Buat data santri (otomatis memicu trigger penempatan awal)
      const { data: santri, error: santriErr } = await this.client
        .from("santri")
        .insert({
          nis: payload.nis,
          nama_lengkap: payload.nama_lengkap,
          tempat_lahir: payload.tempat_lahir,
          tanggal_lahir: payload.tanggal_lahir,
          jenis_kelamin: payload.jenis_kelamin,
          alamat: payload.alamat,
          tahun_masuk: payload.tahun_masuk,
          tahun_ajaran_id: payload.tahun_ajaran_id,
          kelas_id: payload.kelas_id,
          kamar_id: payload.kamar_id,
          status: "AKTIF",
        })
        .select()
        .single();

      if (santriErr || !santri) {
        return { ok: false, message: `Gagal menyimpan data santri: ${santriErr?.message}` };
      }

      // 3. Hubungkan relasi 1:1 wali_santri
      const { error: relErr } = await this.client.from("wali_santri").insert({
        user_id: waliProfile.id,
        santri_id: santri.id,
        nama_lengkap: payload.wali.nama_lengkap,
        hubungan: payload.wali.hubungan,
        no_telepon: payload.wali.no_telepon,
        email: payload.wali.email,
        alamat: payload.alamat,
      });

      if (relErr) {
        return { ok: false, message: `Gagal menghubungkan relasi wali-santri: ${relErr.message}` };
      }

      return {
        ok: true,
        message: `Santri ${payload.nama_lengkap} (NIS: ${payload.nis}) dan akun wali berhasil didaftarkan.`,
        santriId: santri.id,
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Terjadi kesalahan internal." };
    }
  }

  async moveSantriPlacement(
    santriId: string,
    newKelasId: string,
    newKamarId: string,
    alasan: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };

    // Update santri memicu trigger PostgreSQL handle_before_santri_placement_update() otomatis mencatat ke riwayat_penempatan_santri
    const { error } = await this.client
      .from("santri")
      .update({
        kelas_id: newKelasId,
        kamar_id: newKamarId,
      })
      .eq("id", santriId);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Penempatan kelas dan kamar santri berhasil dipindahkan dan tercatat di riwayat." };
  }

  async updateStatusSantri(santriId: string, statusBaru: StatusSantri): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("santri").update({ status: statusBaru }).eq("id", santriId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Status santri berhasil diperbarui menjadi ${statusBaru}.` };
  }

  // --------------------------------------------------------------------------
  // JENIS PEMBAYARAN, GENERATOR TAGIHAN, & PENGUMUMAN
  // --------------------------------------------------------------------------
  async getJenisPembayaranList(): Promise<JenisPembayaran[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client.from("jenis_pembayaran").select("*").eq("is_active", true);
    return (data as JenisPembayaran[]) ?? [];
  }

  async createJenisPembayaran(payload: Omit<JenisPembayaran, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("jenis_pembayaran").insert(payload);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: `Jenis pembayaran "${payload.nama_pembayaran}" berhasil dibuat.` };
  }

  async getTagihanList(santriId?: string): Promise<Tagihan[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client.from("tagihan").select("*").order("tanggal_jatuh_tempo", { ascending: true });
    if (santriId) query = query.eq("santri_id", santriId);
    const { data } = await query;
    return (data as Tagihan[]) ?? [];
  }

  async generateTagihan(payload: {
    jenis_pembayaran_id: string;
    periode_label: string;
    tanggal_jatuh_tempo: string;
    target_santri_ids: string[];
  }): Promise<{ ok: boolean; count: number; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, count: 0, message: "Supabase belum dihubungkan." };

    try {
      const { data: jp, error: jpErr } = await this.client
        .from("jenis_pembayaran")
        .select("*")
        .eq("id", payload.jenis_pembayaran_id)
        .single();

      if (jpErr || !jp) return { ok: false, count: 0, message: "Jenis pembayaran tidak ditemukan." };

      const rows = payload.target_santri_ids.map((sId, idx) => ({
        nomor_tagihan: `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${idx + 1}`,
        santri_id: sId,
        jenis_pembayaran_id: jp.id,
        judul_tagihan: `${jp.nama_pembayaran} (${payload.periode_label})`,
        periode_label: payload.periode_label,
        nominal_awal: jp.nominal,
        nominal_penyesuaian: 0,
        kebijakan_cicilan_snapshot: jp.kebijakan_cicilan,
        minimal_cicilan_snapshot: jp.minimal_nominal_cicilan,
        tanggal_mulai: jp.tanggal_mulai,
        tanggal_jatuh_tempo: payload.tanggal_jatuh_tempo,
        status: "BELUM_BAYAR",
      }));

      const { data, error } = await this.client.from("tagihan").insert(rows).select("id");
      if (error) return { ok: false, count: 0, message: error.message };
      return { ok: true, count: data?.length ?? 0, message: `Berhasil menerbitkan ${data?.length ?? 0} tagihan santri.` };
    } catch (err: any) {
      return { ok: false, count: 0, message: err.message ?? "Gagal menerbitkan tagihan." };
    }
  }

  async getPengumumanList(): Promise<Pengumuman[]> {
    if (!isSupabaseConfigured()) return [];
    const { data } = await this.client
      .from("pengumuman")
      .select("*")
      .eq("is_published", true)
      .order("tanggal_publikasi", { ascending: false });
    return (data as Pengumuman[]) ?? [];
  }

  async createPengumuman(payload: {
    judul: string;
    kategori: string;
    isi: string;
    is_penting: boolean;
    created_by: string;
  }): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("pengumuman").insert({
      judul: payload.judul,
      kategori: payload.kategori,
      isi: payload.isi,
      is_penting: payload.is_penting,
      is_published: true,
      created_by: payload.created_by,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengumuman berhasil dipublikasikan." };
  }
}

export const administrasiService = new AdministrasiService();

