// ============================================================================
// SIPETA - Modul Storage Repository / Service Layer
// Melayani upload & generate signed URLs untuk 4 private buckets:
// 1. bukti-pembayaran
// 2. bukti-uang-saku
// 3. foto-penyerahan-saku
// 4. dokumentasi-kepesantrenan
// Sesuai Bagian G PRD & Instruksi Storage
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { validateUploadedFile, type FileValidationResult } from "@/lib/supabase/storage";

export type SipetaBucket =
  | "bukti-pembayaran"
  | "bukti-uang-saku"
  | "foto-penyerahan-saku"
  | "dokumentasi-kepesantrenan";

export class StorageService {
  private client = createSupabaseBrowserClient();

  // --------------------------------------------------------------------------
  // VALIDASI FILE SEBELUM UNGGAH
  // --------------------------------------------------------------------------
  validateFile(
    file: { name: string; size: number; type: string },
    mode: "image_only" | "image_or_pdf" = "image_or_pdf"
  ): FileValidationResult {
    return validateUploadedFile(file, mode);
  }

  // --------------------------------------------------------------------------
  // PATH GENERATOR ISOLASI PER SANTRI (REMEDIASI H-01)
  // Format: `${santriId}/${timestamp}-${sanitizedFilename}`
  // --------------------------------------------------------------------------
  buildSantriStoragePath(santriId: string, filename: string): string {
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${santriId}/${Date.now()}-${cleanFilename}`;
  }

  // --------------------------------------------------------------------------
  // UPLOAD FILE KE PRIVATE BUCKET
  // --------------------------------------------------------------------------
  async uploadFile(
    bucket: SipetaBucket,
    path: string,
    file: Blob | File,
    options: { contentType?: string; upsert?: boolean } = {}
  ): Promise<{ ok: boolean; path?: string; message: string }> {
    if (!isSupabaseConfigured()) {
      // Simpan lokal/mock path saat demo mode
      const mockPath = `${bucket}/${Date.now()}-${file instanceof File ? file.name : "upload.bin"}`;
      return { ok: true, path: mockPath, message: "File berhasil disimpan (Demo Mode)." };
    }

    const { error, data } = await this.client.storage.from(bucket).upload(path, file, {
      contentType: options.contentType,
      upsert: options.upsert ?? false,
    });

    if (error) {
      return { ok: false, message: `Gagal mengunggah file ke ${bucket}: ${error.message}` };
    }

    return {
      ok: true,
      path: data.path,
      message: "File berhasil diunggah dengan aman ke storage.",
    };
  }

  // --------------------------------------------------------------------------
  // MENDAPATKAN SIGNED URL AMAN (EXPIRING TEMPORARY LINK)
  // --------------------------------------------------------------------------
  async getSignedUrl(
    bucket: SipetaBucket,
    path: string,
    expiresInSeconds = 3600
  ): Promise<string | null> {
    if (!isSupabaseConfigured() || !path) {
      return null;
    }

    // Jika path berupa data URL atau URL publik lokal, kembalikan langsung
    if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }

    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  }

  // --------------------------------------------------------------------------
  // HAPUS FILE DARI STORAGE
  // --------------------------------------------------------------------------
  async deleteFile(bucket: SipetaBucket, path: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: true, message: "File dihapus (Demo Mode)." };
    }

    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) {
      return { ok: false, message: `Gagal menghapus file: ${error.message}` };
    }
    return { ok: true, message: "File berhasil dihapus dari storage." };
  }
}

export const storageService = new StorageService();

