import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "fs";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { MediaPreviewModal } from "@/components/ui/media-modal";
import { SipetaProvider } from "@/lib/store/sipeta-context";

describe("Final Visual & Functional UI/UX Review Test Suite (Commit 949b19c)", () => {
  it("1. Halaman gabungan 'Tagihan & Pembayaran' merender seluruh 7 komponen penting", () => {
    const html = renderToString(
      <SipetaProvider>
        <WaliPortal activeTab="pembayaran" />
      </SipetaProvider>
    );

    // 1. Tagihan Santri & Kebijakan Cicilan
    expect(html).toContain("Daftar Kewajiban &amp; Tagihan Santri");
    expect(html).toContain("Sisa:");

    // 2. Rekening Resmi BSI Pesantren
    expect(html).toContain("Rekening Resmi Pesantren");

    // 3. Keranjang Pembayaran
    expect(html).toContain("Keranjang Pembayaran");
    expect(html).toContain("Belum ada tagihan di keranjang");

    // 4. Form Transfer & Riwayat Pembayaran & Status Verifikasi
    expect(html).toContain("Riwayat Transaksi &amp; Status Verifikasi Pembayaran");
  });

  it("2. Backward compatibility: tab lama 'informasi_tagihan' ternormalisasi ke 'Tagihan & Pembayaran'", () => {
    const html = renderToString(
      <SipetaProvider>
        <WaliPortal activeTab="informasi_tagihan" />
      </SipetaProvider>
    );

    expect(html).toContain("Daftar Kewajiban &amp; Tagihan Santri");
    expect(html).toContain("Keranjang Pembayaran");
    expect(html).toContain("Riwayat Transaksi &amp; Status Verifikasi Pembayaran");
  });

  it("3. Backward compatibility: tab lama 'riwayat_pembayaran' ternormalisasi ke 'Tagihan & Pembayaran'", () => {
    const html = renderToString(
      <SipetaProvider>
        <WaliPortal activeTab="riwayat_pembayaran" />
      </SipetaProvider>
    );

    expect(html).toContain("Daftar Kewajiban &amp; Tagihan Santri");
    expect(html).toContain("Keranjang Pembayaran");
    expect(html).toContain("Riwayat Transaksi &amp; Status Verifikasi Pembayaran");
  });

  it("4. Halaman gabungan 'Uang Saku Santri' merender seluruh komponen saldo, limit, dan riwayat mutasi", () => {
    const html = renderToString(
      <SipetaProvider>
        <WaliPortal activeTab="uang_saku" />
      </SipetaProvider>
    );

    // 1. Kartu Saldo Utama (Ledger)
    expect(html).toContain("Saldo Saat Ini");
    expect(html).toContain("Total Uang Masuk");
    expect(html).toContain("Total Uang Keluar");

    // 2. Riwayat Mutasi Uang Saku
    expect(html).toContain("Riwayat Mutasi Uang Masuk &amp; Keluar");

    // 3. Form Top-up & Rekening BSI
    expect(html).toContain("Ajukan Transfer Uang Saku Baru");
    expect(html).toContain("Kirim Pengajuan Uang Saku");
    expect(html).toContain("Bank Syariah Indonesia (BSI)");
    expect(html).toContain("7198823456");

    // 4. Status Pengajuan Top-up
    expect(html).toContain("Status Pengajuan Pengisian (Top-Up) Uang Saku");
  });

  it("5. Backward compatibility: tab lama 'riwayat_mutasi' ternormalisasi ke 'Uang Saku Santri'", () => {
    const html = renderToString(
      <SipetaProvider>
        <WaliPortal activeTab="riwayat_mutasi" />
      </SipetaProvider>
    );

    expect(html).toContain("Saldo Saat Ini");
    expect(html).toContain("Riwayat Mutasi Uang Masuk &amp; Keluar");
    expect(html).toContain("Ajukan Transfer Uang Saku Baru");
  });

  it("6. MediaPreviewModal merender foto bukti transfer dan dokumentasi penyerahan fisik dengan benar", () => {
    const html = renderToString(
      <MediaPreviewModal
        isOpen={true}
        onClose={() => {}}
        title="Dokumentasi Penyerahan Uang Saku (TRX-001)"
        subtitle="Petugas: Ustadz Ahmad • Nominal: Rp 50.000"
        imageUrl="/images/bukti-transfer-sample.jpg"
      />
    );

    expect(html).toContain("Dokumentasi Penyerahan Uang Saku (TRX-001)");
    expect(html).toContain("Petugas: Ustadz Ahmad • Nominal: Rp 50.000");
    expect(html).toContain('src="/images/bukti-transfer-sample.jpg"');
    expect(html).toContain("Signed URL Private Storage Terverifikasi");
  });

  it("7. Tidak ada kalimat pengantar/deskripsi redundan yang tersisa di kode sumber", () => {
    const pageCode = fs.readFileSync("src/app/page.tsx", "utf8");
    const superadminCode = fs.readFileSync("src/modules/superadmin/superadmin-portal.tsx", "utf8");
    const adminCode = fs.readFileSync("src/modules/admin/admin-portal.tsx", "utf8");
    const tuCode = fs.readFileSync("src/modules/tu/tu-portal.tsx", "utf8");
    const masterTaCode = fs.readFileSync("src/components/master/master-tahun-ajaran-view.tsx", "utf8");

    // Beranda Publik
    expect(pageCode).not.toContain("GERBANG PELAYANAN RESMI");
    expect(pageCode).not.toContain("Cicilan & 1 Rekening BSI");
    expect(pageCode).not.toContain("Wajib Foto Penyerahan");
    expect(pageCode).not.toContain("Silakan pilih pintu masuk");

    // Superadmin
    expect(superadminCode).not.toContain("Atur seluruh akun petugas internal");
    expect(superadminCode).not.toContain("Konfigurasi rekening BSI resmi");

    // Admin
    expect(adminCode).not.toContain("Pengawasan Kepesantrenan — Laporan Tahfidz");
    expect(adminCode).not.toContain("Pengawasan Kepesantrenan — Laporan Kedisiplinan");

    // TU
    expect(tuCode).not.toContain("Daftarkan santri baru lengkap dengan akun wali mandiri");
    expect(tuCode).not.toContain("Tata Usaha — Pengaturan Profil Pesantren");
    expect(tuCode).not.toContain("Akun wali santri akan dibuat secara otomatis");

    // Master Tahun Ajaran
    expect(masterTaCode).not.toContain("Ketentuan Otoritas:");
  });
});
