// ============================================================================
// SIPETA - Modul Keuangan Repository / Service Layer
// Melayani transaksi pembayaran tagihan, verifikasi bendahara,
// ledger uang saku immutable, penyerahan uang saku, & koreksi ledger
// Sesuai Bagian E PRD & Instruksi Modul Keuangan
// ============================================================================

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  KeranjangItem,
  MutasiUangSaku,
  PengajuanUangSaku,
  SaldoUangSaku,
  StatusTransaksi,
  Tagihan,
  TransaksiPembayaran,
} from "@/types/database";

export interface CheckoutParams {
  tanggalTransfer?: string;
  namaPengirim?: string;
  bankPengirim?: string;
  buktiTransferPath?: string;
}

export interface SubmitTopupParams {
  santriId: string;
  nominal: number;
  namaPengirim: string;
  bankPengirim?: string;
  buktiTransferPath: string;
  rekeningSnapshot: {
    nama_bank: string;
    nomor_rekening: string;
    atas_nama: string;
  };
  keterangan?: string;
}

export interface CatatPenyerahanParams {
  santriId: string;
  nominal: number;
  keterangan: string;
  fotoPenyerahanPath: string;
}

export class KeuanganService {
  private client = createSupabaseBrowserClient();

  // --------------------------------------------------------------------------
  // TAGIHAN PEMBAYARAN
  // --------------------------------------------------------------------------
  async getTagihanBySantri(santriId?: string): Promise<Tagihan[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("tagihan")
      .select("*, jenis_pembayaran:jenis_pembayaran_id(*), santri:santri_id(*)")
      .order("jatuh_tempo", { ascending: true });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat tagihan: ${error.message}`);
    return (data as Tagihan[]) ?? [];
  }

  async penyesuaianTagihan(
    tagihanId: string,
    nominalPenyesuaian: number,
    alasan: string,
    batalkan = false
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const { error } = await this.client.rpc("rpc_penyesuaian_tagihan", {
      p_tagihan_id: tagihanId,
      p_nominal_penyesuaian: nominalPenyesuaian,
      p_alasan: alasan,
      p_batalkan: batalkan,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Penyesuaian tagihan berhasil disimpan." };
  }

  // --------------------------------------------------------------------------
  // KERANJANG PEMBAYARAN MULTI-TAGIHAN
  // --------------------------------------------------------------------------
  async getKeranjang(santriId?: string): Promise<KeranjangItem[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("keranjang_pembayaran")
      .select("*, tagihan:tagihan_id(*, jenis_pembayaran:jenis_pembayaran_id(*))")
      .order("created_at", { ascending: true });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat keranjang: ${error.message}`);
    return (data as KeranjangItem[]) ?? [];
  }

  async tambahKeKeranjang(
    santriId: string,
    tagihanId: string,
    nominalBayar: number
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const {
      data: { user },
    } = await this.client.auth.getUser();

    const { error } = await this.client.from("keranjang_pembayaran").upsert(
      {
        user_id: user?.id,
        santri_id: santriId,
        tagihan_id: tagihanId,
        nominal_bayar: nominalBayar,
      },
      { onConflict: "user_id,santri_id,tagihan_id" }
    );
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Tagihan dimasukkan ke dalam keranjang." };
  }

  async hapusDariKeranjang(itemId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const { error } = await this.client
      .from("keranjang_pembayaran")
      .delete()
      .eq("id", itemId);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Item berhasil dihapus dari keranjang." };
  }

  async kosongkanKeranjang(santriId?: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    let query = this.client.from("keranjang_pembayaran").delete();
    if (santriId) {
      query = query.eq("santri_id", santriId);
    }
    await query;
  }

  // --------------------------------------------------------------------------
  // ATOMIC CHECKOUT & VERIFIKASI PEMBAYARAN
  // --------------------------------------------------------------------------
  async checkoutPembayaran(params: CheckoutParams): Promise<{
    ok: boolean;
    transaksiId?: string;
    message: string;
  }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const { data, error } = await this.client.rpc("rpc_checkout_pembayaran", {
      p_tanggal_transfer: params.tanggalTransfer ?? null,
      p_nama_pengirim: params.namaPengirim ?? null,
      p_bank_pengirim: params.bankPengirim ?? null,
      p_bukti_transfer_path: params.buktiTransferPath ?? null,
    });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      transaksiId: data as string,
      message: "Pengajuan checkout pembayaran berhasil dibuat.",
    };
  }

  async unggahBuktiTransferSusulan(
    transaksiId: string,
    params: {
      tanggalTransfer: string;
      namaPengirim: string;
      bankPengirim: string;
      buktiTransferPath: string;
    }
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }
    const { error } = await this.client.rpc(
      "rpc_unggah_bukti_transfer_pembayaran",
      {
        p_transaksi_id: transaksiId,
        p_tanggal_transfer: params.tanggalTransfer,
        p_nama_pengirim: params.namaPengirim,
        p_bank_pengirim: params.bankPengirim,
        p_bukti_transfer_path: params.buktiTransferPath,
      }
    );
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: "Bukti transfer susulan berhasil diunggah dan diajukan ke bendahara.",
    };
  }

  async verifikasiPembayaran(
    transaksiId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan?: string
  ): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const { error } = await this.client.rpc("rpc_verifikasi_pembayaran", {
      p_transaksi_id: transaksiId,
      p_keputusan: keputusan,
      p_catatan: catatan ?? null,
    });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message:
        keputusan === "DISETUJUI"
          ? "Pembayaran berhasil disetujui & alokasi tagihan diperbarui."
          : "Pembayaran telah ditolak sesuai catatan.",
    };
  }

  async getRiwayatTransaksi(santriId?: string): Promise<TransaksiPembayaran[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("transaksi_pembayaran")
      .select("*, santri:santri_id(*), alokasi:alokasi_pembayaran(*, tagihan:tagihan_id(*))")
      .order("created_at", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat riwayat transaksi: ${error.message}`);
    return (data as TransaksiPembayaran[]) ?? [];
  }

  // --------------------------------------------------------------------------
  // MODUL UANG SAKU (LEDGER IMMUTABLE)
  // --------------------------------------------------------------------------
  async getSaldoUangSaku(santriId: string): Promise<SaldoUangSaku | null> {
    if (!isSupabaseConfigured()) return null;
    const { data } = await this.client
      .from("saldo_uang_saku")
      .select("*")
      .eq("santri_id", santriId)
      .maybeSingle();
    return (data as SaldoUangSaku) ?? null;
  }

  async getMutasiUangSaku(santriId: string, limit = 50): Promise<MutasiUangSaku[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await this.client
      .from("mutasi_uang_saku")
      .select("*, petugas:petugas_id(*)")
      .eq("santri_id", santriId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Gagal memuat mutasi uang saku: ${error.message}`);
    return (data as MutasiUangSaku[]) ?? [];
  }

  async getPengajuanTopup(santriId?: string, status?: StatusTransaksi): Promise<PengajuanUangSaku[]> {
    if (!isSupabaseConfigured()) return [];
    let query = this.client
      .from("pengajuan_uang_saku")
      .select("*, santri:santri_id(*), wali:wali_user_id(*)")
      .order("created_at", { ascending: false });

    if (santriId) {
      query = query.eq("santri_id", santriId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Gagal memuat pengajuan top-up: ${error.message}`);
    return (data as PengajuanUangSaku[]) ?? [];
  }

  async submitTopupUangSaku(params: SubmitTopupParams): Promise<{
    ok: boolean;
    pengajuanId?: string;
    message: string;
  }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const {
      data: { user },
    } = await this.client.auth.getUser();

    const nomorPengajuan = `TOP-${Date.now().toString().slice(-6)}-${Math.floor(
      100 + Math.random() * 900
    )}`;

    const { data, error } = await this.client
      .from("pengajuan_uang_saku")
      .insert({
        nomor_pengajuan: nomorPengajuan,
        santri_id: params.santriId,
        wali_user_id: user?.id,
        nominal: params.nominal,
        rekening_tujuan_snapshot: params.rekeningSnapshot,
        nama_pengirim: params.namaPengirim,
        bank_pengirim: params.bankPengirim ?? null,
        bukti_transfer_path: params.buktiTransferPath,
        keterangan: params.keterangan ?? "Top-up uang saku via portal wali",
        status: "MENUNGGU_VERIFIKASI",
      })
      .select()
      .single();

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      pengajuanId: data.id,
      message: "Pengajuan top-up berhasil dikirim dan menunggu verifikasi bendahara.",
    };
  }

  async verifikasiTopupUangSaku(
    pengajuanId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan?: string
  ): Promise<{ ok: boolean; mutasiId?: string; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const { data, error } = await this.client.rpc("rpc_verifikasi_topup_uang_saku", {
      p_pengajuan_id: pengajuanId,
      p_keputusan: keputusan,
      p_catatan: catatan ?? null,
    });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      mutasiId: data as string,
      message:
        keputusan === "DISETUJUI"
          ? "Top-up berhasil disetujui dan saldo santri telah ditambahkan ke ledger."
          : "Pengajuan top-up telah ditolak.",
    };
  }

  async catatPenyerahanUangSaku(params: CatatPenyerahanParams): Promise<{
    ok: boolean;
    mutasiId?: string;
    message: string;
  }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const { data, error } = await this.client.rpc("rpc_catat_penyerahan_uang_saku", {
      p_santri_id: params.santriId,
      p_nominal: params.nominal,
      p_keterangan: params.keterangan,
      p_foto_penyerahan_path: params.fotoPenyerahanPath,
    });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      mutasiId: data as string,
      message: "Penyerahan uang saku tercatat secara atomik ke ledger.",
    };
  }

  async koreksiLedgerUangSaku(
    referensiMutasiId: string,
    jenisPenyesuaian: "PENYESUAIAN_TAMBAH" | "PENYESUAIAN_KURANG",
    nominal: number,
    alasanKoreksi: string
  ): Promise<{ ok: boolean; mutasiId?: string; message: string }> {
    if (!isSupabaseConfigured()) {
      return { ok: false, message: "Koneksi Supabase belum aktif." };
    }

    const { data, error } = await this.client.rpc("rpc_koreksi_ledger_uang_saku", {
      p_referensi_mutasi_id: referensiMutasiId,
      p_jenis_penyesuaian: jenisPenyesuaian,
      p_nominal: nominal,
      p_alasan_koreksi: alasanKoreksi,
    });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      mutasiId: data as string,
      message: "Jurnal koreksi ledger uang saku berhasil ditambahkan secara permanen.",
    };
  }
}

export const keuanganService = new KeuanganService();

