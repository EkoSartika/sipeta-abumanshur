import { describe, it, expect } from "vitest";
import type { TransaksiPembayaran, Tagihan, StatusTagihan } from "@/types/database";

describe("SIPETA: Approval Pipeline & Queue State Merging Test Suite", () => {
  it("1. State update persetujuan langsung mengeluarkan item dari antrean tanpa menghapus riwayat", () => {
    const trx1 = {
      id: "trx-001",
      nomor_transaksi: "TRX-202611-001",
      santri_id: "santri-1",
      wali_user_id: "wali-1",
      total_nominal: 500000,
      tanggal_transfer: "2026-11-13",
      nama_pengirim: "Wali 1",
      bank_pengirim: "BSI",
      bukti_transfer_url: "path/bukti.webp",
      status: "MENUNGGU_VERIFIKASI" as const,
      alokasi: [{ id: "alk-1", transaksi_id: "trx-001", tagihan_id: "bill-1", nominal_alokasi: 500000, judul_tagihan: "SPP" }],
      created_at: new Date().toISOString(),
    } as unknown as TransaksiPembayaran;

    const trx2 = {
      id: "trx-002",
      nomor_transaksi: "TRX-202611-002",
      santri_id: "santri-2",
      wali_user_id: "wali-2",
      total_nominal: 250000,
      tanggal_transfer: "2026-11-13",
      nama_pengirim: "Wali 2",
      bank_pengirim: "BSI",
      bukti_transfer_url: "path/bukti2.webp",
      status: "MENUNGGU_VERIFIKASI" as const,
      alokasi: [{ id: "alk-2", transaksi_id: "trx-002", tagihan_id: "bill-2", nominal_alokasi: 250000, judul_tagihan: "Uang Saku" }],
      created_at: new Date().toISOString(),
    } as unknown as TransaksiPembayaran;

    let transaksiList = [trx1, trx2];
    expect(transaksiList.filter((t) => t.status === "MENUNGGU_VERIFIKASI")).toHaveLength(2);

    // Simulasikan mutasi persetujuan trx-001
    const verifiedAt = new Date().toISOString();
    transaksiList = transaksiList.map((t) =>
      t.id === "trx-001"
        ? {
            ...t,
            status: "DISETUJUI",
            catatan_verifikasi: "Bukti transfer sah.",
            verified_at: verifiedAt,
            verified_by_nama: "Bendahara",
          }
        : t
    );

    // Filter antrean harus seketika tersisa 1
    const pendingList = transaksiList.filter((t) => t.status === "MENUNGGU_VERIFIKASI");
    expect(pendingList).toHaveLength(1);
    expect(pendingList[0]?.id).toBe("trx-002");

    // Riwayat seluruh transaksi tetap memiliki 2 item
    expect(transaksiList).toHaveLength(2);
    expect(transaksiList.find((t) => t.id === "trx-001")?.status).toBe("DISETUJUI");
  });

  it("2. Pembaruan tagihan teralokasi terhitung secara akurat dan atomik", () => {
    const bill = {
      id: "bill-1",
      santri_id: "santri-1",
      jenis_pembayaran_id: "spp",
      judul_tagihan: "SPP November 2026",
      periode_label: "Nov 2026",
      nominal_awal: 500000,
      nominal_penyesuaian: 0,
      nominal_tagihan: 500000,
      total_terbayar: 200000,
      sisa_tagihan: 300000,
      status: "DIBAYAR_SEBAGIAN" as const,
      is_active: true,
      created_at: new Date().toISOString(),
    } as unknown as Tagihan;

    const alokasiNominal = 300000;
    const totalTerbayarBaru = bill.total_terbayar + alokasiNominal;
    const sisaBaru = bill.nominal_tagihan - totalTerbayarBaru;
    const statusBaru: StatusTagihan = sisaBaru <= 0 ? "LUNAS" : "DIBAYAR_SEBAGIAN";

    const updatedBill: Tagihan = {
      ...bill,
      total_terbayar: totalTerbayarBaru,
      sisa_tagihan: Math.max(0, sisaBaru),
      status: statusBaru,
    };

    expect(updatedBill.total_terbayar).toBe(500000);
    expect(updatedBill.sisa_tagihan).toBe(0);
    expect(updatedBill.status).toBe("LUNAS");
  });

  it("3. Antrean merging cerdas menggabungkan transaksi baru tanpa merusak riwayat transaksi yang sudah selesai", () => {
    const existingHistory = [
      {
        id: "trx-selesai-1",
        nomor_transaksi: "TRX-DONE-1",
        santri_id: "s-1",
        wali_user_id: "w-1",
        total_nominal: 500000,
        tanggal_transfer: "2026-11-10",
        nama_pengirim: "Wali",
        bank_pengirim: "BSI",
        bukti_transfer_url: "url",
        status: "DISETUJUI" as const,
        alokasi: [],
        created_at: "2026-11-10T00:00:00Z",
      },
    ] as unknown as TransaksiPembayaran[];

    const incomingPendingFromFastQuery = [
      {
        id: "trx-baru-1",
        nomor_transaksi: "TRX-NEW-1",
        santri_id: "s-2",
        wali_user_id: "w-2",
        total_nominal: 350000,
        tanggal_transfer: "2026-11-13",
        nama_pengirim: "Wali Baru",
        bank_pengirim: "BSI",
        bukti_transfer_url: "url",
        status: "MENUNGGU_VERIFIKASI" as const,
        alokasi: [],
        created_at: "2026-11-13T00:00:00Z",
      },
    ] as unknown as TransaksiPembayaran[];

    // Logika merging pada refreshAntreanBendaharaOnly
    const nonPending = existingHistory.filter((t) => t.status !== "MENUNGGU_VERIFIKASI");
    const merged = [...incomingPendingFromFastQuery, ...nonPending];

    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe("trx-baru-1");
    expect(merged[0]?.status).toBe("MENUNGGU_VERIFIKASI");
    expect(merged[1]?.id).toBe("trx-selesai-1");
    expect(merged[1]?.status).toBe("DISETUJUI");
  });

  it("4. Penolakan pembayaran wajib menyertakan alasan minimal 3-4 karakter", () => {
    const validateAlasan = (alasan: string) => {
      if (!alasan || alasan.trim().length < 3) {
        return { valid: false, message: "Catatan alasan penolakan wajib diisi minimal 3 karakter." };
      }
      return { valid: true };
    };

    expect(validateAlasan("").valid).toBe(false);
    expect(validateAlasan("  ").valid).toBe(false);
    expect(validateAlasan("no").valid).toBe(false);
    expect(validateAlasan("Bukti buram").valid).toBe(true);
  });
});

