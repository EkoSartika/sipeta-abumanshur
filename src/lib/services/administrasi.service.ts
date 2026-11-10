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
  ProfilPesantren,
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

  async createTahunAjaran(payload: {
    nama: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
  }): Promise<{ ok: boolean; message: string; data?: TahunAjaran }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Supabase belum dihubungkan." };
    }

    const cleanNama = payload.nama.trim();
    if (!cleanNama) {
      return { ok: false, message: "Nama tahun pelajaran wajib diisi." };
    }
    if (!payload.tanggal_mulai || !payload.tanggal_selesai) {
      return { ok: false, message: "Tanggal mulai dan tanggal selesai wajib diisi berdasarkan kalender resmi pesantren." };
    }
    if (new Date(payload.tanggal_selesai) <= new Date(payload.tanggal_mulai)) {
      return { ok: false, message: "Tanggal selesai harus lebih besar daripada tanggal mulai." };
    }

    try {
      // 1. Cek duplikasi nama tahun ajaran
      const { data: existing } = await this.client
        .from("tahun_ajaran")
        .select("id, nama")
        .ilike("nama", cleanNama)
        .maybeSingle();

      if (existing) {
        return { ok: false, message: `Tahun pelajaran "${cleanNama}" sudah terdaftar di database.` };
      }

      // 2. Simpan master tahun ajaran baru (is_active awal = false)
      const { data, error } = await this.client
        .from("tahun_ajaran")
        .insert({
          nama: cleanNama,
          tanggal_mulai: payload.tanggal_mulai,
          tanggal_selesai: payload.tanggal_selesai,
          is_active: false,
        })
        .select()
        .single();

      if (error) {
        return { ok: false, message: error.message };
      }

      return {
        ok: true,
        message: `Tahun pelajaran ${cleanNama} berhasil ditambahkan ke database.`,
        data: data as TahunAjaran,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Gagal menambahkan tahun pelajaran.",
      };
    }
  }

  async deleteTahunAjaran(tahunAjaranId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Supabase belum dihubungkan." };
    }

    try {
      // 1. Cek keberadaan dan status aktif tahun pelajaran
      const { data: target, error: fetchErr } = await this.client
        .from("tahun_ajaran")
        .select("id, nama, is_active")
        .eq("id", tahunAjaranId)
        .maybeSingle();

      if (fetchErr || !target) {
        return { ok: false, message: "Tahun pelajaran tidak ditemukan di database." };
      }

      if (target.is_active) {
        return { ok: false, message: "Akses ditolak: Tahun pelajaran yang sedang aktif tidak boleh dihapus." };
      }

      // 2. Proteksi Integritas Relasi: Cek relasi data akademik, kelas, atau transaksi
      const [{ count: countTagihan }, { count: countKelas }] = await Promise.all([
        this.client.from("tagihan").select("*", { count: "exact", head: true }).eq("tahun_ajaran_id", tahunAjaranId),
        this.client.from("kelas_santri").select("*", { count: "exact", head: true }).eq("tahun_ajaran_id", tahunAjaranId),
      ]);

      if ((countTagihan ?? 0) > 0 || (countKelas ?? 0) > 0) {
        return {
          ok: false,
          message: `Penghapusan ditolak demi integritas data: Tahun pelajaran "${target.nama}" telah terhubung dengan data tagihan (${countTagihan || 0}) atau kelas santri (${countKelas || 0}). Gunakan status non-aktif sebagai arsip.`,
        };
      }

      // 3. Eksekusi penghapusan (hanya untuk master tahun ajaran kosong tanpa referensi)
      const { error } = await this.client
        .from("tahun_ajaran")
        .delete()
        .eq("id", tahunAjaranId);

      if (error) {
        return { ok: false, message: error.message };
      }

      return { ok: true, message: `Tahun pelajaran "${target.nama}" berhasil dihapus.` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Gagal menghapus tahun pelajaran.",
      };
    }
  }

  async setActiveTahunAjaran(tahunAjaranId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      // 1. Coba via RPC atomik jika telah termigrasi di Supabase
      const { data: rpcData, error: rpcError } = await this.client.rpc("rpc_set_active_tahun_ajaran", {
        p_tahun_ajaran_id: tahunAjaranId,
      });
      if (!rpcError && rpcData) {
        return {
          ok: true,
          message: (rpcData as { message?: string })?.message || "Tahun ajaran aktif berhasil diperbarui.",
        };
      }
      if (rpcError && !rpcError.message.includes("does not exist") && (rpcError as { code?: string }).code !== "PGRST202") {
        return { ok: false, message: rpcError.message };
      }

      // 2. Fallback update tabel langsung (hanya jika RPC belum termigrasi di dev)
      await this.client.from("tahun_ajaran").update({ is_active: false }).neq("id", tahunAjaranId);
      const { error } = await this.client
        .from("tahun_ajaran")
        .update({ is_active: true })
        .eq("id", tahunAjaranId);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: "Tahun ajaran aktif berhasil diperbarui." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal memperbarui tahun ajaran aktif." };
    }
  }

  async getProfilPesantren(): Promise<ProfilPesantren | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data, error } = await this.client
        .from("profil_pesantren")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data as ProfilPesantren;
    } catch {
      return null;
    }
  }

  async updateProfilPesantren(payload: Partial<ProfilPesantren>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const singletonId = "00000000-0000-0000-0000-000000000001";
      const { data: existing } = await this.client
        .from("profil_pesantren")
        .select("id")
        .limit(1)
        .maybeSingle();

      const targetId = existing?.id || singletonId;
      const { error } = await this.client
        .from("profil_pesantren")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: "Profil pesantren berhasil disimpan ke database." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal menyimpan profil pesantren." };
    }
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

  async updateKelas(id: string, payload: Partial<Kelas>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("kelas").update(payload).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Data kelas berhasil diperbarui." };
  }

  async deleteKelas(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    
    // Periksa apakah masih ada santri aktif di kelas ini
    const { count } = await this.client
      .from("santri")
      .select("id", { count: "exact", head: true })
      .eq("kelas_id", id)
      .eq("status", "AKTIF");

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: `Kelas ini masih memiliki ${count} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kelas.`,
      };
    }

    const { error } = await this.client.from("kelas").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Kelas berhasil dihapus." };
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

  async updateKamar(id: string, payload: Partial<Kamar>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("kamar").update(payload).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Data kamar asrama berhasil diperbarui." };
  }

  async deleteKamar(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };

    // Periksa apakah masih ada santri aktif di kamar ini
    const { count } = await this.client
      .from("santri")
      .select("id", { count: "exact", head: true })
      .eq("kamar_id", id)
      .eq("status", "AKTIF");

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: `Kamar ini masih ditempati oleh ${count} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kamar.`,
      };
    }

    const { error } = await this.client.from("kamar").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Kamar asrama berhasil dihapus." };
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

  async deleteSantriBatch(santriIds: string[]): Promise<{ ok: boolean; message: string; deleted?: number; deactivated?: number }> {
    try {
      const res = await fetch("/api/admin-santri", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ santri_ids: santriIds }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Penghapusan santri berhasil diproses." : "Gagal memproses penghapusan santri."),
        deleted: data.deleted,
        deactivated: data.deactivated,
      };
    } catch (e: any) {
      return { ok: false, message: e.message ?? "Terjadi kesalahan jaringan." };
    }
  }

  // --------------------------------------------------------------------------
  // JENIS PEMBAYARAN, GENERATOR TAGIHAN, & PENGUMUMAN
  // --------------------------------------------------------------------------
  async getJenisPembayaranList(includeAll = true): Promise<JenisPembayaran[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client.from("jenis_pembayaran").select("*").order("created_at", { ascending: false });
    if (!includeAll) {
      query = query.eq("is_active", true);
    }
    const { data } = await query;
    return (data as JenisPembayaran[]) ?? [];
  }

  async createJenisPembayaran(payload: Omit<JenisPembayaran, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; message: string; data?: JenisPembayaran }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { data, error } = await this.client.from("jenis_pembayaran").insert({
      ...payload,
      is_active: payload.status_persetujuan === "DISETUJUI",
    }).select().single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as JenisPembayaran, message: `Jenis pembiayaan "${payload.nama_pembayaran}" berhasil dibuat.` };
  }

  async updateJenisPembayaran(id: string, payload: Partial<JenisPembayaran>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("jenis_pembayaran").update(payload).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Data pembiayaan berhasil diperbarui." };
  }

  async deleteJenisPembayaran(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };

    // Pastikan pembiayaan belum disetujui / belum memiliki tagihan aktif
    const { data: jp } = await this.client.from("jenis_pembayaran").select("status_persetujuan, is_active").eq("id", id).single();
    if (jp && (jp.status_persetujuan === "DISETUJUI" || jp.is_active)) {
      return {
        ok: false,
        message: "Pembiayaan yang telah disetujui Pengasuh/Admin tidak boleh dihapus demi integritas data keuangan santri.",
      };
    }

    const { error } = await this.client.from("jenis_pembayaran").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengajuan pembiayaan berhasil dihapus." };
  }

  async approveJenisPembayaran(
    id: string,
    payload: { catatan?: string; approved_by: string; approved_by_name: string; periode_label?: string }
  ): Promise<{ ok: boolean; message: string; tagihan_diterbitkan?: number }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };

    // 1. Eksekusi melalui RPC Atomik PostgreSQL jika tersedia
    try {
      const { data: rpcData, error: rpcErr } = await this.client.rpc("rpc_approve_jenis_pembayaran", {
        p_jenis_pembayaran_id: id,
        p_catatan: payload.catatan || null,
        p_periode_label: payload.periode_label || null,
      });

      if (!rpcErr && rpcData) {
        return {
          ok: rpcData.ok ?? true,
          message: rpcData.message ?? "Pengajuan pembiayaan berhasil disetujui dan tagihan diterbitkan secara atomik.",
          tagihan_diterbitkan: rpcData.tagihan_diterbitkan,
        };
      }
    } catch {
      // Abaikan dan lanjut ke direct update jika RPC belum termigrasi di database
    }

    // 2. Fallback Direct Update
    const { error } = await this.client.from("jenis_pembayaran").update({
      status_persetujuan: "DISETUJUI",
      is_active: true,
      catatan_persetujuan: payload.catatan || "Disetujui oleh Pengasuh/Admin.",
      disetujui_oleh: payload.approved_by,
      disetujui_oleh_nama: payload.approved_by_name,
      disetujui_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengajuan pembiayaan berhasil disetujui dan berstatus aktif." };
  }

  async rejectJenisPembayaran(
    id: string,
    payload: { catatan: string; rejected_by: string; rejected_by_name?: string }
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    if (!payload.catatan || !payload.catatan.trim()) {
      return { ok: false, message: "Pengasuh/Admin wajib menyertakan catatan evaluasi penolakan pembiayaan." };
    }

    // 1. Eksekusi melalui RPC Atomik PostgreSQL jika tersedia
    try {
      const { data: rpcData, error: rpcErr } = await this.client.rpc("rpc_reject_jenis_pembayaran", {
        p_jenis_pembayaran_id: id,
        p_catatan: payload.catatan.trim(),
      });

      if (!rpcErr && rpcData) {
        return {
          ok: rpcData.ok ?? true,
          message: rpcData.message ?? "Pengajuan pembiayaan telah ditolak dengan catatan evaluasi.",
        };
      }
    } catch {
      // Abaikan dan lanjut ke direct update jika RPC belum termigrasi
    }

    // 2. Fallback Direct Update
    const { error } = await this.client.from("jenis_pembayaran").update({
      status_persetujuan: "DITOLAK",
      is_active: false,
      catatan_persetujuan: payload.catatan,
      disetujui_oleh: payload.rejected_by,
      disetujui_oleh_nama: payload.rejected_by_name,
      disetujui_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengajuan pembiayaan telah ditolak dengan catatan evaluasi." };
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

  async getPengumumanList(includeAll = false): Promise<Pengumuman[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("pengumuman")
      .select("*")
      .order("tanggal_publikasi", { ascending: false });

    if (!includeAll) {
      query = query.eq("is_published", true);
    }
    const { data } = await query;
    return (data as Pengumuman[]) ?? [];
  }

  async createPengumuman(payload: {
    judul: string;
    kategori: string;
    isi: string;
    is_penting: boolean;
    is_published?: boolean;
    created_by: string;
    created_by_nama?: string;
    masa_berlaku?: string;
    sasaran?: "SEMUA" | "KELAS" | "SANTRI";
    target_id?: string;
    status_publikasi?: "DRAF" | "PUBLIKASI";
  }): Promise<{ ok: boolean; message: string; data?: Pengumuman }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const isPub = payload.status_publikasi !== "DRAF" && (payload.is_published ?? true);
    const { data, error } = await this.client.from("pengumuman").insert({
      judul: payload.judul,
      kategori: payload.kategori,
      isi: payload.isi,
      is_penting: payload.is_penting,
      is_published: isPub,
      created_by: payload.created_by,
      masa_berlaku: payload.masa_berlaku,
      sasaran: payload.sasaran ?? "SEMUA",
      target_id: payload.target_id,
      status_publikasi: payload.status_publikasi ?? (isPub ? "PUBLIKASI" : "DRAF"),
    }).select().single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as Pengumuman, message: isPub ? "Pengumuman berhasil dipublikasikan." : "Pengumuman berhasil disimpan sebagai draf." };
  }

  async updatePengumuman(id: string, payload: Partial<Pengumuman>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("pengumuman").update(payload).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengumuman berhasil diperbarui." };
  }

  async deletePengumuman(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    const { error } = await this.client.from("pengumuman").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Pengumuman berhasil dihapus." };
  }

  async importSantriBatch(rows: any[]): Promise<{
    ok: boolean;
    message: string;
    report?: any;
  }> {
    try {
      const response = await fetch("/api/admin-santri/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json();
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses import santri.";
      return { ok: false, message: msg };
    }
  }
}

export const administrasiService = new AdministrasiService();

