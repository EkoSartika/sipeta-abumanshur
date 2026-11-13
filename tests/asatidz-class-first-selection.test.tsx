import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AsatidzPortal } from "@/modules/asatidz/asatidz-portal";
import { SipetaProvider } from "@/lib/store/sipeta-context";

describe("Asatidz Portal - Class-First Student Selection Suite", () => {
  it("merender modul Mengaji dengan pilihan Kelas sebelum Nama Santri", () => {
    const html = renderToString(
      <SipetaProvider>
        <AsatidzPortal activeTab="mengaji" />
      </SipetaProvider>
    );

    // Memastikan label dan elemen form ada
    expect(html).toContain("Formulir Evaluasi Mengaji");
    expect(html).toContain("select-kelas-mengaji");
    expect(html).toContain("select-santri-mengaji");
    expect(html).toContain("Pilih kelas terlebih dahulu");
  });

  it("merender modul Tahfidz dengan pilihan Kelas sebelum Nama Santri", () => {
    const html = renderToString(
      <SipetaProvider>
        <AsatidzPortal activeTab="tahfidz" />
      </SipetaProvider>
    );

    expect(html).toContain("Catat Setoran Tahfidz Baru");
    expect(html).toContain("select-kelas-tahfidz");
    expect(html).toContain("select-santri-tahfidz");
    expect(html).toContain("Pilih kelas terlebih dahulu");
  });

  it("merender modul Prestasi dengan pilihan Kelas sebelum Nama Santri", () => {
    const html = renderToString(
      <SipetaProvider>
        <AsatidzPortal activeTab="prestasi" />
      </SipetaProvider>
    );

    expect(html).toContain("Catat Prestasi Santri");
    expect(html).toContain("select-kelas-prestasi");
    expect(html).toContain("select-santri-prestasi");
    expect(html).toContain("Pilih kelas terlebih dahulu");
  });

  it("merender modul Kedisiplinan dengan pilihan Kelas sebelum Nama Santri", () => {
    const html = renderToString(
      <SipetaProvider>
        <AsatidzPortal activeTab="kedisiplinan" />
      </SipetaProvider>
    );

    expect(html).toContain("Catat Pelanggaran &amp; Pembinaan Baru");
    expect(html).toContain("select-kelas-disiplin");
    expect(html).toContain("select-santri-disiplin");
    expect(html).toContain("Pilih kelas terlebih dahulu");
  });
});

