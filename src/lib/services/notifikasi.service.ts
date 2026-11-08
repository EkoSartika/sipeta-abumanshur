// ============================================================================
// SIPETA - Modul Notifikasi Repository / Service Layer
// Melayani pembacaan, status baca, & agregasi notifikasi akun terdaftar
// Sesuai Bagian H PRD & Instruksi Notifikasi
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { NotifikasiItem } from "@/types/database";

export class NotifikasiService {
  private client = createSupabaseBrowserClient();

  async getNotifikasi(limit = 30): Promise<NotifikasiItem[]> {
    if (!isSupabaseConfigured()) return [];
    const {
      data: { user },
    } = await this.client.auth.getUser();

    if (!user) return [];

    const { data, error } = await this.client
      .from("notifikasi")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Gagal memuat notifikasi: ${error.message}`);
    return (data as NotifikasiItem[]) ?? [];
  }

  async getUnreadCount(): Promise<number> {
    if (!isSupabaseConfigured()) return 0;
    const {
      data: { user },
    } = await this.client.auth.getUser();

    if (!user) return 0;

    const { count, error } = await this.client
      .from("notifikasi")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) return 0;
    return count ?? 0;
  }

  async markAsRead(notifikasiId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: true, message: "OK (Demo Mode)" };

    const { error } = await this.client
      .from("notifikasi")
      .update({ is_read: true })
      .eq("id", notifikasiId);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Notifikasi ditandai sudah dibaca." };
  }

  async markAllAsRead(): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: true, message: "OK (Demo Mode)" };

    const {
      data: { user },
    } = await this.client.auth.getUser();

    if (!user) return { ok: false, message: "Pengguna tidak terautentikasi." };

    const { error } = await this.client
      .from("notifikasi")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Seluruh notifikasi ditandai sudah dibaca." };
  }

  async kirimNotifikasi(payload: {
    userId: string;
    santriId?: string;
    jenisNotifikasi: string;
    judul: string;
    pesan: string;
    tautan?: string;
  }): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) return { ok: true, message: "OK (Demo Mode)" };

    const { error } = await this.client.from("notifikasi").insert({
      user_id: payload.userId,
      santri_id: payload.santriId ?? null,
      jenis_notifikasi: payload.jenisNotifikasi,
      judul: payload.judul,
      pesan: payload.pesan,
      tautan: payload.tautan ?? null,
      is_read: false,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Notifikasi berhasil dikirim." };
  }
}

export const notifikasiService = new NotifikasiService();

