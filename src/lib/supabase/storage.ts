// ============================================================================
// SIPETA - Validasi Unggahan File Bukti Transfer & Foto Penyerahan (Bab 15.12 PRD)
// ============================================================================

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const ALLOWED_DOCUMENT_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  "application/pdf",
] as const;

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUploadedFile(
  file: { name: string; size: number; type: string },
  mode: "image_only" | "image_or_pdf" = "image_or_pdf"
): FileValidationResult {
  if (file.size <= 0) {
    return { valid: false, error: "File unggahan kosong." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: "Ukuran file melebihi batas maksimum 5 MB.",
    };
  }

  const allowedList: readonly string[] =
    mode === "image_only" ? ALLOWED_IMAGE_MIMES : ALLOWED_DOCUMENT_MIMES;

  if (!allowedList.includes(file.type)) {
    return {
      valid: false,
      error:
        mode === "image_only"
          ? "Format foto wajib JPG, PNG, atau WEBP."
          : "Format bukti transfer wajib JPG, PNG, WEBP, atau PDF.",
    };
  }

  return { valid: true };
}

