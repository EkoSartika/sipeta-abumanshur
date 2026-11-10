// ============================================================================
// SIPETA - Utilitas Identitas Keluarga Santri (Ayah, Ibu, Wali, & Penanggung Jawab Akun)
// Mengemas dan menguraikan metadata identitas keluarga secara aman tanpa memerlukan
// migrasi skema blokir pada public.wali_santri di Supabase Cloud.
// ============================================================================

import type { IdentitasKeluargaSantri, WaliSantri } from "@/types/database";

const FAMILY_META_MARKER = " ||SIPETA_KELUARGA||";

export function packWaliAlamatWithFamilyMetadata(
  cleanAlamat: string,
  metadata: IdentitasKeluargaSantri
): string {
  const baseAlamat = (cleanAlamat || "-").split(FAMILY_META_MARKER)[0]!.trim() || "-";
  try {
    return `${baseAlamat}${FAMILY_META_MARKER}${JSON.stringify(metadata)}`;
  } catch {
    return baseAlamat;
  }
}

export function unpackWaliSantriRecord(raw: Record<string, any>): WaliSantri {
  const rawAlamat = typeof raw.alamat === "string" ? raw.alamat : "-";
  const markerIdx = rawAlamat.indexOf(FAMILY_META_MARKER);

  const cleanAlamat =
    markerIdx >= 0 ? rawAlamat.slice(0, markerIdx).trim() || "-" : rawAlamat.trim() || "-";

  const hubunganDb: "Ayah" | "Ibu" | "Wali" =
    raw.hubungan === "Ibu" || raw.hubungan === "Wali" ? raw.hubungan : "Ayah";

  let parsedMeta: Partial<IdentitasKeluargaSantri> | null = null;
  if (markerIdx >= 0) {
    const jsonPart = rawAlamat.slice(markerIdx + FAMILY_META_MARKER.length).trim();
    try {
      parsedMeta = JSON.parse(jsonPart);
    } catch {
      parsedMeta = null;
    }
  }

  const penanggungJawab: "Ayah" | "Ibu" | "Wali" =
    parsedMeta?.penanggung_jawab === "Ayah" ||
    parsedMeta?.penanggung_jawab === "Ibu" ||
    parsedMeta?.penanggung_jawab === "Wali"
      ? parsedMeta.penanggung_jawab
      : raw.penanggung_jawab || hubunganDb;

  const namaAyah =
    parsedMeta?.ayah?.nama_lengkap?.trim() ||
    raw.nama_ayah ||
    (hubunganDb === "Ayah" ? raw.nama_lengkap : undefined);
  const noHpAyah =
    parsedMeta?.ayah?.no_telepon?.trim() ||
    raw.no_hp_ayah ||
    (hubunganDb === "Ayah" ? raw.no_telepon : undefined);
  const pekerjaanAyah = parsedMeta?.ayah?.pekerjaan?.trim() || raw.pekerjaan_ayah || undefined;

  const namaIbu =
    parsedMeta?.ibu?.nama_lengkap?.trim() ||
    raw.nama_ibu ||
    (hubunganDb === "Ibu" ? raw.nama_lengkap : undefined);
  const noHpIbu =
    parsedMeta?.ibu?.no_telepon?.trim() ||
    raw.no_hp_ibu ||
    (hubunganDb === "Ibu" ? raw.no_telepon : undefined);
  const pekerjaanIbu = parsedMeta?.ibu?.pekerjaan?.trim() || raw.pekerjaan_ibu || undefined;

  const namaWali =
    parsedMeta?.wali?.nama_lengkap?.trim() ||
    raw.nama_wali ||
    (hubunganDb === "Wali" ? raw.nama_lengkap : undefined);
  const hubunganWaliDetail =
    parsedMeta?.wali?.hubungan?.trim() ||
    raw.hubungan_wali_detail ||
    (hubunganDb === "Wali" ? "Wali" : undefined);
  const noHpWali =
    parsedMeta?.wali?.no_telepon?.trim() ||
    raw.no_hp_wali ||
    (hubunganDb === "Wali" ? raw.no_telepon : undefined);

  return {
    id: String(raw.id || ""),
    user_id: String(raw.user_id || ""),
    santri_id: String(raw.santri_id || ""),
    nama_lengkap: String(raw.nama_lengkap || ""),
    hubungan: penanggungJawab,
    no_telepon: String(raw.no_telepon || "-"),
    email: String(raw.email || "-"),
    alamat: cleanAlamat,
    penanggung_jawab: penanggungJawab,
    nama_ayah: namaAyah,
    no_hp_ayah: noHpAyah,
    pekerjaan_ayah: pekerjaanAyah,
    nama_ibu: namaIbu,
    no_hp_ibu: noHpIbu,
    pekerjaan_ibu: pekerjaanIbu,
    nama_wali: namaWali,
    hubungan_wali_detail: hubunganWaliDetail,
    no_hp_wali: noHpWali,
  };
}

export function isDataWaliLengkap(wali?: {
  nama_lengkap?: string;
  hubungan?: string;
  no_telepon?: string;
} | null): boolean {
  if (!wali) return false;
  return (
    Boolean(wali.nama_lengkap && wali.nama_lengkap.trim().length >= 3) &&
    Boolean(wali.hubungan && wali.hubungan.trim().length >= 2) &&
    Boolean(wali.no_telepon && wali.no_telepon.trim().length >= 6)
  );
}

