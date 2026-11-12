/**
 * Utilitas kompresi gambar di sisi klien (Client-side Image Compression)
 * Mencegah error HTTP 413 "Request Entity Too Large" saat wali santri mengunggah
 * foto bukti transfer langsung dari kamera smartphone resolusi tinggi.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 s.d. 1.0
}

export async function compressImageClientSide(
  file: File,
  options: CompressionOptions = {}
): Promise<{ dataUrl: string; sizeBytes: number; originalBytes: number }> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.82 } = options;

  // Jika bukan gambar (misal file PDF), kembalikan langsung sebagai dataURL standar
  if (!file.type.startsWith("image/")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve({
          dataUrl: result,
          sizeBytes: file.size,
          originalBytes: file.size,
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback jika canvas context gagal
          const fallbackUrl = typeof e.target?.result === "string" ? e.target.result : "";
          resolve({
            dataUrl: fallbackUrl,
            sizeBytes: file.size,
            originalBytes: file.size,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Kompresi ke format JPEG
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

        // Hitung estimasi ukuran bytes dari base64
        const base64Length = compressedDataUrl.length - (compressedDataUrl.indexOf(",") + 1);
        const approxBytes = Math.round((base64Length * 3) / 4);

        resolve({
          dataUrl: compressedDataUrl,
          sizeBytes: approxBytes,
          originalBytes: file.size,
        });
      };

      img.onerror = () => {
        // Fallback jika decode gambar gagal
        const rawUrl = typeof e.target?.result === "string" ? e.target.result : "";
        resolve({
          dataUrl: rawUrl,
          sizeBytes: file.size,
          originalBytes: file.size,
        });
      };

      img.src = typeof e.target?.result === "string" ? e.target.result : "";
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

