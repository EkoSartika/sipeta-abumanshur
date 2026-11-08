// ============================================================================
// SIPETA - Schema Validation (Zod) & Core Financial/Security Business Rules
// Sesuai Bab 5, 6, 15, dan 16 PRD
// ============================================================================

import { z } from "zod";
import type {
  KebijakanCicilan,
  MutasiUangSaku,
  SaldoUangSaku,
  Tagihan,
  UserProfile,
  UserRole,
} from "@/types/database";

// 1. Validasi Kebijakan Cicilan pada Tagihan (Bab 5.2 & 5.4 PRD)
export interface InstallmentValidationResult {
  valid: boolean;
  error?: string;
}

export function validateNominalCicilan(
  tagihan: Pick<
    Tagihan,
    | "judul_tagihan"
    | "sisa_tagihan"
    | "status"
    | "kebijakan_cicilan_snapshot"
    | "minimal_cicilan_snapshot"
  >,
  nominalBayar: number
): InstallmentValidationResult {
  if (!Number.isFinite(nominalBayar) || nominalBayar <= 0) {
    return {
      valid: false,
      error: "Nominal pembayaran harus lebih besar dari Rp 0.",
    };
  }

  if (tagihan.status === "LUNAS" || tagihan.status === "DIBATALKAN" || tagihan.sisa_tagihan <= 0) {
    return {
      valid: false,
      error: `Tagihan "${tagihan.judul_tagihan}" sudah lunas atau dibatalkan.`,
    };
  }

  if (nominalBayar > tagihan.sisa_tagihan) {
    return {
      valid: false,
      error: `Nominal pembayaran untuk "${tagihan.judul_tagihan}" tidak boleh melebihi sisa kewajiban (Rp ${tagihan.sisa_tagihan.toLocaleString("id-ID")}).`,
    };
  }

  const kebijakan: KebijakanCicilan = tagihan.kebijakan_cicilan_snapshot;

  if (kebijakan === "TIDAK_BOLEH" && nominalBayar !== tagihan.sisa_tagihan) {
    return {
      valid: false,
      error: `Tagihan "${tagihan.judul_tagihan}" tidak dapat dicicil dan wajib dibayar penuh sebesar Rp ${tagihan.sisa_tagihan.toLocaleString("id-ID")}.`,
    };
  }

  if (kebijakan === "MINIMAL_NOMINAL") {
    const minCicilan = tagihan.minimal_cicilan_snapshot ?? 0;
    // Jika sisa tagihan lebih kecil dari minimal cicilan, maka santri membayar penuh sisa tagihan tersebut
    const batasMinimalEfektif = Math.min(minCicilan, tagihan.sisa_tagihan);
    if (nominalBayar < batasMinimalEfektif) {
      return {
        valid: false,
        error: `Nominal cicilan untuk "${tagihan.judul_tagihan}" minimal sebesar Rp ${batasMinimalEfektif.toLocaleString("id-ID")}.`,
      };
    }
  }

  return { valid: true };
}

// 2. Kalkulasi Ledger Uang Saku (Bab 6.4 PRD: Saldo = Masuk - Keluar + Penyesuaian)
export function calculatePocketMoneyLedger(
  santriId: string,
  mutasiList: MutasiUangSaku[]
): SaldoUangSaku {
  const santriMutasi = mutasiList.filter((m) => m.santri_id === santriId);

  let totalMasuk = 0;
  let totalKeluar = 0;
  let totalPenyesuaian = 0;

  for (const m of santriMutasi) {
    if (m.jenis_mutasi === "MASUK") {
      totalMasuk += m.nominal;
    } else if (m.jenis_mutasi === "KELUAR") {
      totalKeluar += m.nominal;
    } else if (m.jenis_mutasi === "PENYESUAIAN_TAMBAH") {
      totalPenyesuaian += m.nominal;
    } else if (m.jenis_mutasi === "PENYESUAIAN_KURANG") {
      totalPenyesuaian -= m.nominal;
    }
  }

  const saldoSaatIni = totalMasuk - totalKeluar + totalPenyesuaian;

  return {
    santri_id: santriId,
    saldo_saat_ini: saldoSaatIni,
    total_masuk: totalMasuk,
    total_keluar: totalKeluar,
    total_penyesuaian: totalPenyesuaian,
    updated_at: new Date().toISOString(),
  };
}

// 3. Schema Validasi Pencatatan Uang Keluar (Bab 2 & Bab 6.3 PRD: Foto Penyerahan Wajib)
export const penyerahanUangSakuSchema = z.object({
  santri_id: z.string().min(1, "Santri wajib dipilih."),
  nominal: z
    .number({ invalid_type_error: "Nominal harus berupa angka." })
    .positive("Nominal penyerahan uang saku harus lebih dari Rp 0."),
  keterangan: z
    .string()
    .trim()
    .min(4, "Keterangan penyerahan wajib diisi (minimal 4 karakter)."),
  foto_penyerahan_url: z
    .string()
    .trim()
    .min(5, "Foto bukti penyerahan uang saku WAJIB diunggah sebelum transaksi dapat disahkan."),
});

// 4. Schema Validasi Pengajuan Top-Up Uang Saku oleh Orang Tua (Bab 6.2 PRD)
export const pengajuanTopupSakuSchema = z.object({
  santri_id: z.string().min(1, "Santri wajib dipilih."),
  nominal: z
    .number()
    .min(10000, "Nominal pengisian uang saku minimal Rp 10.000."),
  tanggal_transfer: z.string().min(1, "Tanggal transfer wajib diisi."),
  nama_pengirim: z.string().trim().min(2, "Nama pengirim rekening wajib diisi."),
  bank_pengirim: z.string().trim().min(2, "Bank pengirim wajib diisi."),
  bukti_transfer_url: z.string().trim().min(5, "Bukti transfer wajib diunggah."),
  keterangan: z.string().trim().optional(),
});

// 5. Schema Validasi Koreksi / Penyesuaian Ledger Uang Saku (Bab 6.4 PRD)
export const koreksiLedgerSakuSchema = z.object({
  referensi_mutasi_id: z.string().min(1, "Transaksi referensi yang dikoreksi wajib dipilih."),
  jenis_mutasi: z.enum(["PENYESUAIAN_TAMBAH", "PENYESUAIAN_KURANG"]),
  nominal: z.number().positive("Nominal penyesuaian harus lebih dari Rp 0."),
  alasan_koreksi: z
    .string()
    .trim()
    .min(5, "Alasan koreksi wajib dicantumkan secara jelas untuk jejak audit."),
});

// 6. Schema Validasi Pengajuan Pembayaran Tagihan (Bab 5.5 PRD)
export const checkoutPembayaranSchema = z.object({
  santri_id: z.string().min(1, "Santri tidak valid."),
  tanggal_transfer: z.string().min(1, "Tanggal transfer wajib diisi."),
  nama_pengirim: z.string().trim().min(2, "Nama pengirim wajib diisi."),
  bank_pengirim: z.string().trim().min(2, "Nama bank pengirim wajib diisi."),
  bukti_transfer_url: z.string().trim().min(5, "Bukti transfer wajib diunggah."),
  items: z
    .array(
      z.object({
        tagihan_id: z.string().min(1),
        nominal_bayar: z.number().positive(),
      })
    )
    .min(1, "Pilih minimal satu tagihan di keranjang pembayaran."),
});

// 7. Schema Validasi Penyesuaian Tagihan (Bab 5.3 PRD)
export const penyesuaianTagihanSchema = z.object({
  tagihan_id: z.string().min(1, "Tagihan wajib dipilih."),
  nominal_penyesuaian: z.number().min(0, "Nominal penyesuaian minimal Rp 0."),
  alasan_penyesuaian: z
    .string()
    .trim()
    .min(5, "Alasan penyesuaian wajib diisi secara jelas (minimal 5 karakter)."),
});

// 7. Proteksi Akses Lintas Santri & Otorisasi Role (Bab 3 & Bab 15 PRD)
export function canUserAccessSantri(user: UserProfile, targetSantriId: string): boolean {
  if (!user.is_active) return false;
  if (
    user.role === "superadmin" ||
    user.role === "admin" ||
    user.role === "bendahara" ||
    user.role === "pengelola"
  ) {
    return true;
  }
  if (user.role === "wali") {
    return Boolean(user.santri_id && user.santri_id === targetSantriId);
  }
  return false;
}

export function canRoleApproveFinancialTransaction(role: UserRole): boolean {
  // Bab 2 & Bab 3.3 PRD: Bendahara menjadi satu-satunya role operasional yang berwenang mengesahkan transaksi keuangan
  return role === "bendahara";
}

export function canRoleViewFinancialDetails(role: UserRole): boolean {
  // Bab 3.4 PRD: Pengelola Kepesantrenan tidak memiliki akses terhadap rincian transaksi keuangan
  return role !== "pengelola";
}

