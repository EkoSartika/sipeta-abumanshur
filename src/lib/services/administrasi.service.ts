// ============================================================================
// SIPETA - Modul Administrasi Repository / Service Layer
// Melayani CRUD data master pesantren, pendaftaran santri/wali (1:1),
// penempatan kelas/kamar, jenis pembayaran, generator tagihan, & pengumuman
// Sesuai Bagian D PRD & Instruksi Modul Administrasi
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  packWaliAlamatWithFamilyMetadata,
  unpackWaliSantriRecord,
} from "@/lib/utils/family-metadata";
import type {
  AuditLogItem,
  IdentitasKeluargaSantri,
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
  private static cachedRekeningList: RekeningPesantren[] | null = null;
  private static lastRekeningFetch = 0;
  private static inFlightRekeningPromise: Promise<RekeningPesantren[]> | null = null;

  public static clearRekeningCache() {
    AdministrasiService.cachedRekeningList = null;
    AdministrasiService.lastRekeningFetch = 0;
  }

  // --------------------------------------------------------------------------
  // MASTER DATA: REKENING RESMI & TAHUN AJARAN
  // --------------------------------------------------------------------------
  async getRekeningList(force = false): Promise<RekeningPesantren[]> {
    if (!isSupabaseConfigured()) return [];

    // Cache hit: kembalikan langsung jika data masih segar (<15s) dan tidak dipaksa refresh
    if (!force && AdministrasiService.cachedRekeningList && (Date.now() - AdministrasiService.lastRekeningFetch < 15000)) {
      return AdministrasiService.cachedRekeningList;
    }

    // Coalescing in-flight request: cegah kueri berganda simultan
    if (AdministrasiService.inFlightRekeningPromise) {
      return AdministrasiService.inFlightRekeningPromise;
    }

    AdministrasiService.inFlightRekeningPromise = (async () => {
      try {
        const { data, error } = await this.client
          .from("rekening_pesantren")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) {
          AdministrasiService.cachedRekeningList = data as RekeningPesantren[];
          AdministrasiService.lastRekeningFetch = Date.now();
          return data as RekeningPesantren[];
        }
      } catch {
        // Fallback ke server endpoint jika kueri direct client gagal
      }

      try {
        const res = await fetch("/api/admin/rekening", { method: "GET" });
        if (res.ok) {
          const json = await res.json();
          if (json.ok && Array.isArray(json.data)) {
            AdministrasiService.cachedRekeningList = json.data as RekeningPesantren[];
            AdministrasiService.lastRekeningFetch = Date.now();
            return json.data as RekeningPesantren[];
          }
        }
      } catch {
        // Fallback jika di luar konteks browser fetch
      }

      return AdministrasiService.cachedRekeningList ?? [];
    })().finally(() => {
      AdministrasiService.inFlightRekeningPromise = null;
    });

    return AdministrasiService.inFlightRekeningPromise;
  }

  async getRekeningResmi(): Promise<RekeningPesantren | null> {
    const list = await this.getRekeningList();
    if (list.length === 0) return null;
    const active = list.find((r) => r.is_active);
    return active ?? null;
  }

  async createRekening(payload: {
    nama_bank: string;
    kode_bank?: string;
    nomor_rekening: string;
    atas_nama: string;
    catatan_instruksi?: string;
    alasan?: string;
  }): Promise<{ ok: boolean; message: string; data?: RekeningPesantren }> {
    AdministrasiService.clearRekeningCache();
    if (!isSupabaseConfigured()) {
      return {
        ok: true,
        message: "Rekening resmi pesantren berhasil ditambahkan (Demo Standalone).",
        data: {
          id: `rek-${Date.now()}`,
          ...payload,
          is_active: false,
        } as RekeningPesantren,
      };
    }

    try {
      const res = await fetch("/api/admin/rekening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama_bank: payload.nama_bank,
          kode_bank: payload.kode_bank || null,
          nomor_rekening: payload.nomor_rekening,
          atas_nama: payload.atas_nama,
          catatan_instruksi: payload.catatan_instruksi || null,
          alasan: payload.alasan || "Penambahan rekening pesantren",
        }),
      });
      const json = await res.json();
      AdministrasiService.clearRekeningCache();
      return json;
    } catch {
      // Fallback direct RPC jika dipanggil dari internal server context
      const { data, error } = await this.client.rpc("rpc_tambah_rekening_pesantren_v1", {
        p_nama_bank: payload.nama_bank,
        p_kode_bank: payload.kode_bank || null,
        p_nomor_rekening: payload.nomor_rekening,
        p_atas_nama: payload.atas_nama,
        p_catatan_instruksi: payload.catatan_instruksi || null,
        p_alasan: payload.alasan || "Penambahan rekening pesantren",
      });
      AdministrasiService.clearRekeningCache();
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: (data as any)?.message ?? "Rekening berhasil ditambahkan.", data: (data as any)?.data };
    }
  }

  async updateRekeningResmi(payload: Partial<RekeningPesantren>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, message: "Rekening resmi pesantren berhasil diperbarui (Demo Standalone)." };
    }
    if (!payload.id) {
      return { ok: false, message: "ID Rekening wajib disertakan untuk pembaruan." };
    }
    return this.updateRekeningById(payload.id, payload);
  }

  async updateRekeningById(id: string, payload: Partial<RekeningPesantren>): Promise<{ ok: boolean; message: string; data?: RekeningPesantren }> {
    AdministrasiService.clearRekeningCache();
    if (!isSupabaseConfigured()) return { ok: true, message: "Rekening berhasil diperbarui (Demo Standalone)." };

    try {
      const res = await fetch("/api/admin/rekening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          nama_bank: payload.nama_bank || null,
          kode_bank: payload.kode_bank || null,
          nomor_rekening: payload.nomor_rekening || null,
          atas_nama: payload.atas_nama || null,
          catatan_instruksi: payload.catatan_instruksi || null,
          alasan: "Pembaruan data rekening pesantren via RPC atomik",
        }),
      });
      const json = await res.json();
      AdministrasiService.clearRekeningCache();
      return json;
    } catch {
      const { data, error } = await this.client.rpc("rpc_update_rekening_pesantren_v1", {
        p_rekening_id: id,
        p_nama_bank: payload.nama_bank || null,
        p_kode_bank: payload.kode_bank || null,
        p_nomor_rekening: payload.nomor_rekening || null,
        p_atas_nama: payload.atas_nama || null,
        p_catatan_instruksi: payload.catatan_instruksi || null,
        p_alasan: "Pembaruan data rekening pesantren via RPC atomik",
      });
      AdministrasiService.clearRekeningCache();
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: (data as any)?.message ?? "Rekening berhasil diperbarui secara atomik.", data: (data as any)?.data };
    }
  }

  async activateRekening(id: string, alasan?: string): Promise<{ ok: boolean; message: string; data?: RekeningPesantren }> {
    AdministrasiService.clearRekeningCache();
    if (!isSupabaseConfigured()) {
      return {
        ok: true,
        message: "Rekening berhasil diaktifkan sebagai rekening utama (Demo Standalone).",
        data: { id, is_active: true } as any,
      };
    }

    try {
      const res = await fetch("/api/admin/rekening", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "ACTIVATE",
          alasan: alasan || "Aktivasi rekening utama pesantren",
        }),
      });
      const json = await res.json();
      AdministrasiService.clearRekeningCache();
      return json;
    } catch {
      const { data, error } = await this.client.rpc("rpc_aktifkan_rekening_pesantren_v1", {
        p_rekening_id: id,
        p_alasan: alasan || "Aktivasi rekening utama pesantren",
      });
      AdministrasiService.clearRekeningCache();
      if (error) return { ok: false, message: error.message };
      return {
        ok: true,
        message: (data as any)?.message ?? "Rekening berhasil diaktifkan sebagai rekening utama.",
        data: (data as any)?.data,
      };
    }
  }

  async deactivateRekening(id: string, alasan?: string): Promise<{ ok: boolean; message: string; data?: RekeningPesantren }> {
    AdministrasiService.clearRekeningCache();
    if (!isSupabaseConfigured()) {
      return {
        ok: true,
        message: "Rekening berhasil dinonaktifkan (Demo Standalone).",
        data: { id, is_active: false } as any,
      };
    }

    try {
      const res = await fetch("/api/admin/rekening", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action: "DEACTIVATE",
          alasan: alasan || "Penonaktifan rekening utama pesantren",
        }),
      });
      const json = await res.json();
      AdministrasiService.clearRekeningCache();
      return json;
    } catch {
      const { data, error } = await this.client.rpc("rpc_nonaktifkan_rekening_pesantren_v1", {
        p_rekening_id: id,
        p_alasan: alasan || "Penonaktifan rekening utama pesantren",
      });
      AdministrasiService.clearRekeningCache();
      if (error) return { ok: false, message: error.message };
      return {
        ok: true,
        message: (data as any)?.message ?? "Rekening berhasil dinonaktifkan.",
        data: (data as any)?.data,
      };
    }
  }

  async setRekeningUtama(id: string, alasan?: string): Promise<{ ok: boolean; message: string; data?: RekeningPesantren }> {
    return this.activateRekening(id, alasan);
  }

  async deleteRekeningById(id: string, alasan?: string): Promise<{ ok: boolean; message: string }> {
    AdministrasiService.clearRekeningCache();
    if (!isSupabaseConfigured()) return { ok: true, message: "Rekening berhasil dihapus (Demo Standalone)." };

    try {
      const res = await fetch(`/api/admin/rekening?id=${encodeURIComponent(id)}&alasan=${encodeURIComponent(alasan || "")}`, {
        method: "DELETE",
      });
      const json = await res.json();
      AdministrasiService.clearRekeningCache();
      return json;
    } catch {
      // Fallback direct RPC
      const { data, error } = await this.client.rpc("rpc_hapus_rekening_pesantren_v1", {
        p_rekening_id: id,
        p_alasan: alasan || "Penghapusan rekening",
      });
      AdministrasiService.clearRekeningCache();
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: (data as any)?.message ?? "Rekening berhasil dihapus." };
    }
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

      let finalData = data as TahunAjaran;
      // Jika belum ada satu pun tahun pelajaran aktif di database, aktifkan secara atomik via RPC resmi
      const { count: activeCount } = await this.client
        .from("tahun_ajaran")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      if ((activeCount ?? 0) === 0 && finalData?.id) {
        const activateRes = await this.setActiveTahunAjaran(finalData.id);
        if (activateRes.ok) {
          finalData = { ...finalData, is_active: true };
        }
      }

      return {
        ok: true,
        message: finalData.is_active
          ? `Tahun pelajaran ${cleanNama} berhasil ditambahkan dan ditetapkan sebagai tahun pelajaran aktif.`
          : `Tahun pelajaran ${cleanNama} berhasil ditambahkan ke database.`,
        data: finalData,
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!tahunAjaranId || !uuidRegex.test(tahunAjaranId.trim())) {
      return {
        ok: false,
        message:
          "ID Tahun Pelajaran tidak valid (bukan UUID database resmi). Silakan tambahkan tahun pelajaran ke database terlebih dahulu.",
      };
    }
    try {
      // Aktivasi tahun pelajaran HANYA boleh dilakukan melalui RPC atomik resmi rpc_set_active_tahun_ajaran
      const { data: rpcData, error: rpcError } = await this.client.rpc("rpc_set_active_tahun_ajaran", {
        p_tahun_ajaran_id: tahunAjaranId.trim(),
      });
      if (rpcError) {
        return {
          ok: false,
          message: rpcError.message || "Gagal memperbarui tahun pelajaran aktif melalui RPC database.",
        };
      }
      if (!rpcData) {
        return {
          ok: false,
          message: "Tidak ada respons dari RPC rpc_set_active_tahun_ajaran.",
        };
      }
      const resObj = rpcData as { success?: boolean; message?: string };
      if (resObj.success === false) {
        return {
          ok: false,
          message: resObj.message || "Aktivasi tahun pelajaran ditolak oleh RPC database.",
        };
      }
      return {
        ok: true,
        message: resObj.message || "Tahun pelajaran aktif berhasil diperbarui dan disinkronkan.",
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal memperbarui tahun pelajaran aktif." };
    }
  }

  async setActiveSemester(semester: "Ganjil" | "Genap"): Promise<{ ok: boolean; message: string; data?: unknown }> {
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        message: "Koneksi database Supabase belum terkonfigurasi. Pergantian semester memerlukan RPC database resmi.",
      };
    }
    try {
      // Pergantian semester HANYA boleh dilakukan melalui RPC resmi rpc_set_active_semester
      // TIDAK ADA fallback ke UPDATE langsung ke tabel profil_pesantren
      const { data: rpcData, error: rpcError } = await this.client.rpc("rpc_set_active_semester", {
        p_semester: semester,
      });

      if (rpcError) {
        // Deteksi jika fungsi RPC belum ada di database (migration 016 belum dieksekusi di Supabase Cloud)
        if (
          rpcError.message.includes("does not exist") ||
          (rpcError as { code?: string }).code === "PGRST202" ||
          (rpcError as { code?: string }).code === "42883"
        ) {
          return {
            ok: false,
            message:
              "Fitur pergantian semester belum tersedia di database atau migration 016_semester_akademik.sql belum diterapkan di Supabase Cloud. Jalankan naskah migrasi 016 di SQL Editor.",
          };
        }
        return {
          ok: false,
          message: rpcError.message || "Gagal mengubah semester aktif melalui RPC resmi.",
        };
      }

      if (!rpcData) {
        return {
          ok: false,
          message: "Tidak ada data respon yang diterima dari RPC rpc_set_active_semester.",
        };
      }

      const resObj = rpcData as { success?: boolean; message?: string };
      if (resObj.success === false) {
        return {
          ok: false,
          message: resObj.message || "Pergantian semester ditolak oleh RPC database.",
        };
      }

      return {
        ok: true,
        message: resObj.message || `Semester aktif berhasil diubah menjadi Semester ${semester}.`,
        data: rpcData,
      };
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan internal saat memanggil RPC rpc_set_active_semester.",
      };
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
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_profil_pesantren",
          payload,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, message: data.message ?? "Gagal menyimpan profil pesantren." };
      }
      return { ok: true, message: data.message ?? "Profil pesantren berhasil disimpan ke database." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal menyimpan profil pesantren." };
    }
  }

  // --------------------------------------------------------------------------
  // KELAS & KAMAR ASRAMA
  // --------------------------------------------------------------------------
  async getKelasList(): Promise<Kelas[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await this.client
      .from("kelas")
      .select("*")
      .eq("is_active", true)
      .order("tingkat")
      .order("kode_kelas");
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as Kelas[];
    }
    try {
      const res = await fetch("/api/master-data?type=kelas");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}
    return (data as Kelas[]) ?? [];
  }

  async createKelas(payload: Omit<Kelas, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; data?: Kelas; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_kelas",
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        data: data.data,
        message: data.message ?? "Kelas baru berhasil dibuat.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal membuat kelas." };
    }
  }

  async updateKelas(id: string, payload: Partial<Kelas>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_kelas",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Data kelas berhasil diperbarui.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal memperbarui kelas." };
    }
  }

  async deleteKelas(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_kelas",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Kelas berhasil dihapus.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal menghapus kelas." };
    }
  }

  async getKamarList(): Promise<Kamar[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await this.client
      .from("kamar")
      .select("*")
      .eq("is_active", true)
      .order("kode_kamar");
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as Kamar[];
    }
    try {
      const res = await fetch("/api/master-data?type=kamar");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.data)) return json.data;
      }
    } catch {}
    return (data as Kamar[]) ?? [];
  }

  async createKamar(payload: Omit<Kamar, "id" | "is_active" | "created_at" | "updated_at">): Promise<{ ok: boolean; data?: Kamar; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_kamar",
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        data: data.data,
        message: data.message ?? "Kamar asrama baru berhasil ditambahkan.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal membuat kamar." };
    }
  }

  async updateKamar(id: string, payload: Partial<Kamar>): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_kamar",
          id,
          payload,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Data kamar asrama berhasil diperbarui.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal memperbarui kamar." };
    }
  }

  async deleteKamar(id: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: false, message: "Supabase belum dihubungkan." };
    try {
      const res = await fetch("/api/master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete_kamar",
          id,
        }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? "Kamar asrama berhasil dihapus.",
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal menghapus kamar." };
    }
  }

  // --------------------------------------------------------------------------
  // DATA SANTRI & WALI (RELASI 1:1)
  // --------------------------------------------------------------------------
  private adminSantriFetchInFlight: Promise<{ santriList?: Santri[]; waliList?: any[] } | null> | null = null;

  private fetchAdminSantriShared(): Promise<{ santriList?: Santri[]; waliList?: any[] } | null> {
    if (!this.adminSantriFetchInFlight) {
      this.adminSantriFetchInFlight = (async () => {
        try {
          const res = await fetch("/api/admin-santri");
          if (res.ok) {
            const json = await res.json();
            if (json.ok && json.data) {
              return json.data as { santriList?: Santri[]; waliList?: any[] };
            }
          }
        } catch {}
        return null;
      })().finally(() => {
        this.adminSantriFetchInFlight = null;
      });
    }
    return this.adminSantriFetchInFlight;
  }

  clearCache(): void {
    this.adminSantriFetchInFlight = null;
  }

  async getSantriList(): Promise<Santri[]> {
    if (!isSupabaseConfigured()) return [];
    const shared = await this.fetchAdminSantriShared();
    if (shared && Array.isArray(shared.santriList)) {
      return shared.santriList;
    }
    const { data } = await this.client.from("santri").select("*").order("nama_lengkap");
    return (data as Santri[]) ?? [];
  }

  async getWaliList(): Promise<WaliSantri[]> {
    if (!isSupabaseConfigured()) return [];
    const shared = await this.fetchAdminSantriShared();
    if (shared && Array.isArray(shared.waliList)) {
      return shared.waliList.map((row: any) => unpackWaliSantriRecord(row));
    }
    const { data } = await this.client.from("wali_santri").select("*");
    if (!data) return [];
    return (data as Record<string, any>[]).map((row) => unpackWaliSantriRecord(row));
  }

  async updateSantriWithWali(
    santriId: string,
    payload: {
      nama_lengkap?: string;
      tempat_lahir?: string;
      tanggal_lahir?: string;
      jenis_kelamin?: "L" | "P";
      alamat?: string;
      tahun_masuk?: number;
      kelas_id?: string;
      kamar_id?: string;
      status?: StatusSantri;
      penanggung_jawab?: "Ayah" | "Ibu" | "Wali";
      identitas_keluarga?: IdentitasKeluargaSantri;
      wali?: {
        nama_lengkap: string;
        hubungan: "Ayah" | "Ibu" | "Wali";
        no_telepon: string;
      };
    }
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/admin-santri", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: santriId, payload }),
      });
      const data = await res.json();
      return {
        ok: data.ok ?? false,
        message: data.message ?? (res.ok ? "Data santri berhasil diperbarui." : "Gagal memperbarui data santri."),
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Gagal menghubungi server." };
    }
  }

  async getRiwayatPenempatanList(santriId?: string): Promise<RiwayatPenempatanSantri[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("riwayat_penempatan_santri")
      .select("*, petugas:petugas_id(nama_lengkap)")
      .order("created_at", { ascending: false });
    if (santriId) query = query.eq("santri_id", santriId);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as any[]).map((row) => ({
      ...row,
      tanggal_efektif:
        row.tanggal_efektif ||
        (row.created_at ? String(row.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)),
      petugas_nama: row.petugas_nama || row.petugas?.nama_lengkap || "Tata Usaha",
    })) as RiwayatPenempatanSantri[];
  }

  async getAuditLogs(limit = 150): Promise<AuditLogItem[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const { data, error } = await this.client
        .from("audit_logs")
        .select("*, user:user_id(nama_lengkap, role)")
        .order("waktu", { ascending: false })
        .limit(limit);
      if (error || !data) return [];
      return (data as any[]).map((row) => ({
        id: row.id,
        user_id: row.user_id || "",
        user_nama: row.user_nama || row.user?.nama_lengkap || "Sistem SIPETA",
        user_role: (row.user_role || row.user?.role || "superadmin") as any,
        aktivitas: row.aktivitas || "",
        jenis_objek: row.jenis_objek || "",
        objek_id: String(row.objek_id || ""),
        data_sebelum: row.data_sebelum || undefined,
        data_sesudah: row.data_sesudah || undefined,
        alasan_perubahan: row.alasan_perubahan || undefined,
        waktu: row.waktu || row.created_at || new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }

  async resolveActiveTahunAjaranUuid(candidateId?: string): Promise<string | null> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (candidateId && uuidRegex.test(candidateId.trim())) {
      return candidateId.trim();
    }
    if (!isSupabaseConfigured()) return null;

    const { data: activeTa } = await this.client
      .from("tahun_ajaran")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (activeTa?.id && uuidRegex.test(activeTa.id)) {
      return activeTa.id;
    }

    const { data: fallbackTa } = await this.client
      .from("tahun_ajaran")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return fallbackTa?.id && uuidRegex.test(fallbackTa.id) ? fallbackTa.id : null;
  }

  async createSantriWithWali(payload: {
    nis: string;
    nama_lengkap: string;
    tempat_lahir: string;
    tanggal_lahir: string;
    jenis_kelamin: "L" | "P";
    alamat: string;
    tahun_masuk: number;
    tahun_ajaran_id?: string;
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
      const resolvedTahunAjaranId = await this.resolveActiveTahunAjaranUuid(payload.tahun_ajaran_id);
      if (!resolvedTahunAjaranId) {
        return {
          ok: false,
          message: "Registrasi dihentikan: Tahun Pelajaran aktif belum ditemukan di database.",
        };
      }

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
          tahun_ajaran_id: resolvedTahunAjaranId,
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
    const resolvedTaId = await this.resolveActiveTahunAjaranUuid(payload.tahun_ajaran_id);
    if (!resolvedTaId) {
      return {
        ok: false,
        message: "Pengajuan pembiayaan dihentikan: Tahun Pelajaran aktif belum ditemukan di database.",
      };
    }
    const { data, error } = await this.client.from("jenis_pembayaran").insert({
      ...payload,
      tahun_ajaran_id: resolvedTaId,
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

  async importSantriBatch(rows: any[], tahunAjaranId?: string): Promise<{
    ok: boolean;
    message: string;
    report?: any;
  }> {
    try {
      const response = await fetch("/api/admin-santri/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, tahun_ajaran_id: tahunAjaranId }),
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

