/**
 * Utilitas Kompresi & Validasi Gambar Bukti Transfer Klien (Client-Side Compression)
 * Sesuai Standar Keamanan & Efisiensi SIPETA:
 * - Target ukuran <= 100 KB dengan batas aman maksimal 200 KB jika teks detail membutuhkan ketajaman tinggi.
 * - Format adaptif WebP (dengan fallback JPEG).
 * - Pemeliharaan rasio proporsional gambar dan batas resolusi aman (max 1280px - 1440px).
 * - Kompresi bertahap (multi-pass adaptive quality) tanpa degradasi teks berlebih.
 * - Penanganan orientasi kamera (EXIF / modern canvas).
 * - Validasi MIME dan integritas file.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // Nilai awal kualitas 0.1 s.d. 1.0 (opsional)
  targetSizeKb?: number;
  maxSafeSizeKb?: number;
  preferWebP?: boolean;
}

export interface CompressionResult {
  dataUrl: string;
  sizeBytes: number;
  originalBytes: number;
  mimeType: string;
  width: number;
  height: number;
  compressionRatio: number; // Persentase penghematan (misal: 85%)
}

/**
 * Cek apakah browser mendukung canvas toDataURL WebP
 */
function isWebPSupported(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

/**
 * Kompresi gambar adaptif di browser sebelum upload ke Supabase Storage
 */
export async function compressImageClientSide(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    targetSizeKb = 100,
    maxSafeSizeKb = 250,
    preferWebP = true,
  } = options;

  // Jika file adalah PDF atau dokumen non-gambar, jangan lakukan manipulasi canvas
  if (!file.type.startsWith("image/") && file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        resolve({
          dataUrl: result,
          sizeBytes: file.size,
          originalBytes: file.size,
          mimeType: file.type,
          width: 0,
          height: 0,
          compressionRatio: 0,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Validasi tipe MIME gambar yang didukung
  const allowedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  const isAllowed = allowedMime.some((m) => {
    const sub = m.split("/")[1];
    return sub ? file.type.toLowerCase().includes(sub) : false;
  });
  if (!file.type.startsWith("image/") && !isAllowed) {
    throw new Error("Format berkas tidak didukung. Harap unggah foto bukti transfer bertipe JPG, PNG, atau WebP.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca berkas gambar."));
    reader.onload = async (e) => {
      const rawDataUrl = typeof e.target?.result === "string" ? e.target.result : "";
      if (!rawDataUrl) {
        return reject(new Error("Berkas kosong atau tidak dapat diolah."));
      }

      try {
        let sourceImage: ImageBitmap | HTMLImageElement;
        let originalWidth = 0;
        let originalHeight = 0;

        // Gunakan createImageBitmap jika tersedia untuk auto-orientasi EXIF kamera ponsel
        if (typeof window !== "undefined" && "createImageBitmap" in window) {
          try {
            sourceImage = await createImageBitmap(file, { imageOrientation: "from-image" });
            originalWidth = sourceImage.width;
            originalHeight = sourceImage.height;
          } catch {
            // Fallback ke elemen HTMLImageElement jika createImageBitmap gagal
            sourceImage = await loadImageElement(rawDataUrl);
            originalWidth = sourceImage.width;
            originalHeight = sourceImage.height;
          }
        } else {
          sourceImage = await loadImageElement(rawDataUrl);
          originalWidth = sourceImage.width;
          originalHeight = sourceImage.height;
        }

        if (originalWidth === 0 || originalHeight === 0) {
          throw new Error("Dimensi gambar tidak valid.");
        }

        // 1. Hitung dimensi proporsional baru
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;

        if (targetWidth > maxWidth || targetHeight > maxHeight) {
          if (targetWidth / maxWidth > targetHeight / maxHeight) {
            targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
            targetWidth = maxWidth;
          } else {
            targetWidth = Math.round((targetWidth * maxHeight) / targetHeight);
            targetHeight = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) {
          // Fallback tanpa canvas
          return resolve({
            dataUrl: rawDataUrl,
            sizeBytes: file.size,
            originalBytes: file.size,
            mimeType: file.type || "image/jpeg",
            width: originalWidth,
            height: originalHeight,
            compressionRatio: 0,
          });
        }

        // Background putih untuk menjaga gambar transparan/PNG tidak menjadi hitam saat dikonversi ke JPEG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

        // Tutup bitmap jika digunakan untuk membebaskan memory GPU
        if ("close" in sourceImage && typeof sourceImage.close === "function") {
          sourceImage.close();
        }

        // 2. Tentukan format output (Prioritaskan WebP jika didukung)
        const canUseWebP = preferWebP && isWebPSupported();
        const outputMime = canUseWebP ? "image/webp" : "image/jpeg";

        // 3. Multi-Pass Adaptive Quality Compression
        // Mulai dari kualitas tinggi (0.82) agar teks bukti transfer tetap tajam
        const qualitySteps = [0.85, 0.75, 0.65, 0.55];
        let bestDataUrl = "";
        let bestSizeBytes = Infinity;

        for (const q of qualitySteps) {
          const candidateUrl = canvas.toDataURL(outputMime, q);
          const base64Content = candidateUrl.split(",")[1] || "";
          const approxBytes = Math.round((base64Content.length * 3) / 4);

          bestDataUrl = candidateUrl;
          bestSizeBytes = approxBytes;

          // Jika ukuran sudah di bawah target (misal 100 KB), hentikan iterasi untuk menjaga ketajaman
          if (approxBytes <= targetSizeKb * 1024) {
            break;
          }
        }

        // Jika setelah kualitas 0.55 ukuran masih di atas target tapi di bawah maxSafeSizeKb (misal 250 KB),
        // pertahankan hasil tersebut agar tulisan struk perbankan tidak blur.
        // Jika masih > maxSafeSizeKb (misal foto sangat kompleks), lakukan downscale dimensi sekunder 1x
        if (bestSizeBytes > maxSafeSizeKb * 1024 && targetWidth > 800) {
          const secondCanvas = document.createElement("canvas");
          const scale = 0.8;
          secondCanvas.width = Math.round(targetWidth * scale);
          secondCanvas.height = Math.round(targetHeight * scale);
          const sCtx = secondCanvas.getContext("2d");
          if (sCtx) {
            sCtx.fillStyle = "#FFFFFF";
            sCtx.fillRect(0, 0, secondCanvas.width, secondCanvas.height);
            sCtx.drawImage(canvas, 0, 0, secondCanvas.width, secondCanvas.height);
            const secondaryUrl = secondCanvas.toDataURL(outputMime, 0.72);
            const sBase64 = secondaryUrl.split(",")[1] || "";
            const sBytes = Math.round((sBase64.length * 3) / 4);
            if (sBytes < bestSizeBytes) {
              bestDataUrl = secondaryUrl;
              bestSizeBytes = sBytes;
              targetWidth = secondCanvas.width;
              targetHeight = secondCanvas.height;
            }
          }
        }

        const savedBytes = Math.max(0, file.size - bestSizeBytes);
        const ratio = file.size > 0 ? Math.round((savedBytes / file.size) * 100) : 0;

        resolve({
          dataUrl: bestDataUrl,
          sizeBytes: bestSizeBytes,
          originalBytes: file.size,
          mimeType: outputMime,
          width: targetWidth,
          height: targetHeight,
          compressionRatio: ratio,
        });
      } catch (err: any) {
        // Fallback aman jika terjadi kesalahan canvas
        console.warn("Kompresi canvas gagal, menggunakan berkas asli:", err?.message);
        resolve({
          dataUrl: rawDataUrl,
          sizeBytes: file.size,
          originalBytes: file.size,
          mimeType: file.type || "image/jpeg",
          width: 0,
          height: 0,
          compressionRatio: 0,
        });
      }
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal mengurai gambar."));
    img.src = src;
  });
}

/**
 * Format ukuran byte menjadi representasi manusia (B, KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validasi MIME dan batas ukuran berkas bukti transfer / foto penyerahan
 */
export function validateReceiptFile(
  file: File,
  maxSizeBytes = 15 * 1024 * 1024
): { valid: boolean; error?: string } {
  if (!file) return { valid: false, error: "Berkas tidak ditemukan." };
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (!allowed.includes(file.type)) {
    return {
      valid: false,
      error: `Format file tidak didukung (${file.type || "tidak dikenal"}). Harap unggah foto berekstensi JPEG, PNG, atau WebP.`,
    };
  }
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `Ukuran file terlalu besar (${formatFileSize(file.size)}). Maksimal berkas yang diizinkan adalah ${formatFileSize(maxSizeBytes)}.`,
    };
  }
  return { valid: true };
}
