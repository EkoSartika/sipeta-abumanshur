import { describe, it, expect } from "vitest";

describe("SIPETA: Role-based Guard & Validasi Rekening Pesantren", () => {
  // Simulasi aturan otorisasi rekening
  function authorizeRekeningAction(role: string, action: string): { ok: boolean; message: string } {
    if (role !== "superadmin" && role !== "admin") {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang mengelola rekening resmi pesantren.",
      };
    }
    return { ok: true, message: `Aksi ${action} diizinkan.` };
  }

  function validateDeleteRekening(
    rekeningNomor: string,
    existingTransactions: Array<{ nomor_rekening: string }>
  ): { ok: boolean; message: string } {
    const hasHistory = existingTransactions.some((t) => t.nomor_rekening === rekeningNomor);
    if (hasHistory) {
      return {
        ok: false,
        message: "Rekening tidak dapat dihapus karena sudah memiliki riwayat transaksi pembayaran. Silakan nonaktifkan rekening.",
      };
    }
    return { ok: true, message: "Rekening berhasil dihapus." };
  }

  it("1. Pengasuh (role admin) dan Superadmin diizinkan mengelola rekening", () => {
    expect(authorizeRekeningAction("admin", "CREATE_REKENING").ok).toBe(true);
    expect(authorizeRekeningAction("superadmin", "UPDATE_REKENING").ok).toBe(true);
    expect(authorizeRekeningAction("admin", "SET_UTAMA").ok).toBe(true);
  });

  it("2. TU dan Wali Santri DITOLAK saat mencoba mengelola rekening", () => {
    const tuRes = authorizeRekeningAction("tu", "CREATE_REKENING");
    expect(tuRes.ok).toBe(false);
    expect(tuRes.message).toContain("Hanya Pengasuh (Admin) dan Superadmin");

    const waliRes = authorizeRekeningAction("wali", "UPDATE_REKENING");
    expect(waliRes.ok).toBe(false);
    expect(waliRes.message).toContain("Hanya Pengasuh (Admin) dan Superadmin");

    const asatidzRes = authorizeRekeningAction("asatidz", "DELETE_REKENING");
    expect(asatidzRes.ok).toBe(false);
  });

  it("3. Penghapusan rekening DITOLAK jika sudah memiliki riwayat transaksi pembayaran", () => {
    const transactions = [
      { nomor_rekening: "7198823456" },
      { nomor_rekening: "7141234567" },
    ];

    const delUsed = validateDeleteRekening("7198823456", transactions);
    expect(delUsed.ok).toBe(false);
    expect(delUsed.message).toContain("tidak dapat dihapus karena sudah memiliki riwayat transaksi");

    const delUnused = validateDeleteRekening("9999888877", transactions);
    expect(delUnused.ok).toBe(true);
  });
});

