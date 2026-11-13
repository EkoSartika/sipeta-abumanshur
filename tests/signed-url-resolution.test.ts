import { describe, it, expect } from "vitest";

describe("SIPETA: Media Preview Modal & Signed URL Path Resolver", () => {
  it("1. Mendeteksi storage path relatif dan bukan data URI atau HTTP URL", () => {
    const rawStoragePath = "f1c3de49-88c4-4079-8764-37b74723b662/1794535990161-bukti-bayar.jpg";
    const dataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...";
    const httpUrl = "https://jvhzrhfzkjqzlhsvvbgy.supabase.co/storage/v1/object/sign/bukti-pembayaran/file.jpg?token=xyz";

    const isStoragePath = (url: string) => !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:");

    expect(isStoragePath(rawStoragePath)).toBe(true);
    expect(isStoragePath(dataUri)).toBe(false);
    expect(isStoragePath(httpUrl)).toBe(false);
  });

  it("2. Pemilihan bucket yang tepat berdasarkan jenis media", () => {
    const getBucketForType = (type: "pembayaran" | "uang_saku" | "penyerahan") => {
      switch (type) {
        case "pembayaran":
          return "bukti-pembayaran";
        case "uang_saku":
          return "bukti-uang-saku";
        case "penyerahan":
          return "foto-penyerahan-saku";
      }
    };

    expect(getBucketForType("pembayaran")).toBe("bukti-pembayaran");
    expect(getBucketForType("uang_saku")).toBe("bukti-uang-saku");
    expect(getBucketForType("penyerahan")).toBe("foto-penyerahan-saku");
  });

  it("3. In-memory cache key format mencegah collision antar-bucket", () => {
    const makeCacheKey = (bucket: string, path: string) => `${bucket}:${path}`;

    const key1 = makeCacheKey("bukti-pembayaran", "santri-1/bukti.jpg");
    const key2 = makeCacheKey("bukti-uang-saku", "santri-1/bukti.jpg");

    expect(key1).not.toBe(key2);
    expect(key1).toBe("bukti-pembayaran:santri-1/bukti.jpg");
    expect(key2).toBe("bukti-uang-saku:santri-1/bukti.jpg");
  });
});

