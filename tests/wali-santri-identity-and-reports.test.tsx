import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { SipetaProvider } from "@/lib/store/sipeta-context";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { LaporanPortal } from "@/modules/laporan/laporan-portal";
import { packWaliAlamatWithFamilyMetadata, unpackWaliSantriRecord } from "@/lib/utils/family-metadata";
import type { IdentitasKeluargaSantri } from "@/types/database";

describe("Portal Orang Tua & Pusat Laporan Pengasuh Test Suite", () => {
  it("1. Pengemasan dan penguraian identitas keluarga via packWaliAlamatWithFamilyMetadata berjalan konsisten", () => {
    const rawAlamat = "Jl. Pesantren No. 12, Plered, Cirebon";
    const meta: IdentitasKeluargaSantri = {
      penanggung_jawab: "Ibu",
      ayah: {
        nama_lengkap: "H. Ahmad Fauzi",
        no_telepon: "081234567890",
        pekerjaan: "Wiraswasta",
      },
      ibu: {
        nama_lengkap: "Hj. Siti Aminah",
        no_telepon: "081298765432",
        pekerjaan: "Guru Madrasah",
      },
      wali: {
        nama_lengkap: "Drs. H. Maimun",
        hubungan: "Paman",
        no_telepon: "081345678901",
      },
    };

    const packed = packWaliAlamatWithFamilyMetadata(rawAlamat, meta);
    expect(packed).toContain(rawAlamat);
    expect(packed).toContain("||SIPETA_KELUARGA||");

    const unpacked = unpackWaliSantriRecord({
      id: "w-01",
      user_id: "u-01",
      santri_id: "s-01",
      nama_lengkap: "Hj. Siti Aminah",
      hubungan: "Ibu",
      no_telepon: "081298765432",
      alamat: packed,
    });

    expect(unpacked.penanggung_jawab).toBe("Ibu");
    expect(unpacked.nama_ayah).toBe("H. Ahmad Fauzi");
    expect(unpacked.nama_ibu).toBe("Hj. Siti Aminah");
    expect(unpacked.nama_wali).toBe("Drs. H. Maimun");
    expect(unpacked.alamat).toBe(rawAlamat);
  });

  it("2. WaliPortal merender tab profil_santri lengkap dengan rincian penanggung jawab dan tombol edit", () => {
    const html = renderToString(
      <SipetaProvider initialAuthMode="demo">
        <WaliPortal activeTab="profil_santri" />
      </SipetaProvider>
    );

    expect(html).toContain("Data Diri Santri");
    expect(html).toContain("Informasi Keluarga");
    expect(html).toContain("Penanggung Jawab");
    expect(html).toContain("Ubah Identitas Santri &amp; Keluarga");
  });

  it("3. LaporanPortal merender 6 kategori laporan pengasuh dan kop surat resmi A4 Portrait", () => {
    const html = renderToString(
      <SipetaProvider initialAuthMode="demo">
        <LaporanPortal />
      </SipetaProvider>
    );

    // Memverifikasi 6 kategori
    expect(html).toContain("1. Pembayaran");
    expect(html).toContain("2. Uang Saku");
    expect(html).toContain("3. Mengaji");
    expect(html).toContain("4. Tahfidz");
    expect(html).toContain("5. Kedisiplinan");
    expect(html).toContain("6. Prestasi");

    // Memverifikasi kop resmi cetak
    expect(html).toContain("YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR");
    // Memverifikasi tombol Unduh PDF langsung
    expect(html).toContain("Unduh PDF");
  });
});
