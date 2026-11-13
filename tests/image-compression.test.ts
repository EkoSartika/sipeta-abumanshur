import { describe, it, expect } from "vitest";
import { formatFileSize, validateReceiptFile } from "@/lib/utils/image-compression";

describe("SIPETA: Client-Side Image Compression & Validation Utility", () => {
  it("1. formatFileSize memformat byte menjadi teks yang akurat dan mudah dipahami", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(95 * 1024)).toBe("95.0 KB");
    expect(formatFileSize(250 * 1024)).toBe("250.0 KB");
    expect(formatFileSize(3.2 * 1024 * 1024)).toBe("3.2 MB");
  });

  it("2. validateReceiptFile menolak file non-gambar atau format berbahaya", () => {
    // File pdf/exe/dll
    const mockExe = { type: "application/x-msdownload", size: 50000, name: "virus.exe" } as File;
    const resExe = validateReceiptFile(mockExe);
    expect(resExe.valid).toBe(false);
    expect(resExe.error).toContain("Format file tidak didukung");

    const mockPdf = { type: "application/pdf", size: 50000, name: "laporan.pdf" } as File;
    const resPdf = validateReceiptFile(mockPdf);
    expect(resPdf.valid).toBe(false);
  });

  it("3. validateReceiptFile menerima format JPEG, PNG, dan WebP yang valid", () => {
    const mockJpg = { type: "image/jpeg", size: 1.5 * 1024 * 1024, name: "struk.jpg" } as File;
    expect(validateReceiptFile(mockJpg).valid).toBe(true);

    const mockPng = { type: "image/png", size: 2.1 * 1024 * 1024, name: "bukti.png" } as File;
    expect(validateReceiptFile(mockPng).valid).toBe(true);

    const mockWebp = { type: "image/webp", size: 85 * 1024, name: "bukti.webp" } as File;
    expect(validateReceiptFile(mockWebp).valid).toBe(true);
  });

  it("4. validateReceiptFile menolak file raksasa di atas batas maksimum (misal > 15 MB)", () => {
    const hugeFile = { type: "image/jpeg", size: 20 * 1024 * 1024, name: "huge.jpg" } as File;
    const res = validateReceiptFile(hugeFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Ukuran file terlalu besar");
  });

  it("5. Logika downscale mempertahankan rasio aspek gambar vertikal (struk ATM/mobile banking)", () => {
    // Rasio foto struk vertikal: 1080 x 2400 (aspect ratio 1 : 2.22)
    const originalWidth = 1080;
    const originalHeight = 2400;
    const maxWidth = 1280;
    const maxHeight = 1280;

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    // targetHeight harus dipangkas ke 1280, dan targetWidth proporsional (576)
    expect(targetHeight).toBe(1280);
    expect(targetWidth).toBe(576);
    expect(targetWidth / targetHeight).toBeCloseTo(originalWidth / originalHeight, 2);
  });

  it("6. Logika downscale mempertahankan rasio aspek gambar horizontal", () => {
    // Rasio foto bukti horizontal: 4000 x 3000 (aspect ratio 4:3)
    const originalWidth = 4000;
    const originalHeight = 3000;
    const maxWidth = 1280;
    const maxHeight = 1280;

    let targetWidth = originalWidth;
    let targetHeight = originalHeight;

    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
      targetWidth = Math.round(targetWidth * ratio);
      targetHeight = Math.round(targetHeight * ratio);
    }

    expect(targetWidth).toBe(1280);
    expect(targetHeight).toBe(960);
    expect(targetWidth / targetHeight).toBeCloseTo(originalWidth / originalHeight, 2);
  });
});
