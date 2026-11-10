// ============================================================================
// SIPETA - Strict TypeScript Domain & Database Types
// Sesuai PRD Versi 1.0 (Pondok Pesantren Modern Abu Manshur)
// ============================================================================

export type UserRole =
  | "superadmin"
  | "admin"
  | "bendahara"
  | "pengelola"
  | "wali"
  | "tu"
  | "asatidz";

export type StatusSantri =
  | "AKTIF"
  | "CUTI"
  | "LULUS"
  | "PINDAH"
  | "TIDAK_AKTIF";

export type JenisKelamin = "L" | "P";

export type KebijakanCicilan =
  | "TIDAK_BOLEH"
  | "MINIMAL_NOMINAL"
  | "BEBAS";

export type StatusTagihan =
  | "BELUM_BAYAR"
  | "DIBAYAR_SEBAGIAN"
  | "LUNAS"
  | "DIBATALKAN";

export type StatusTransaksi =
  | "MENUNGGU_TRANSFER"
  | "MENUNGGU_VERIFIKASI"
  | "DISETUJUI"
  | "DITOLAK"
  | "KEDALUWARSA"
  | "DIBATALKAN";

export type JenisMutasiSaku =
  | "MASUK"
  | "KELUAR"
  | "PENYESUAIAN_TAMBAH"
  | "PENYESUAIAN_KURANG";

export type JenisSetoranTahfidz = "HAFALAN_BARU" | "MUROJAAH";

export type TingkatPrestasi =
  | "INTERNAL"
  | "KECAMATAN"
  | "KABUPATEN"
  | "PROVINSI"
  | "NASIONAL"
  | "INTERNASIONAL";

export type StatusTindakLanjut =
  | "TERCATAT"
  | "DALAM_PEMBINAAN"
  | "SELESAI";

export interface UserProfile {
  id: string;
  nama_lengkap: string;
  email: string;
  username?: string;
  no_telepon: string;
  role: UserRole;
  is_active: boolean;
  santri_id?: string; // Khusus role 'wali' (Relasi 1:1)
  must_change_password?: boolean; // Khusus kewajiban ganti password login pertama kali
  created_at: string;
}

export interface RekeningPesantren {
  id: string;
  nama_bank: string;
  kode_bank: string;
  nomor_rekening: string;
  atas_nama: string;
  catatan_instruksi: string;
  is_active: boolean;
  updated_at: string;
}

export interface TahunAjaran {
  id: string;
  nama: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  is_active: boolean;
}

export interface ProfilPesantren {
  id: string;
  nama_resmi: string;
  nspp: string;
  npsn: string;
  akreditasi: string;
  sk_pendirian: string;
  alamat: string;
  kelurahan: string;
  kecamatan: string;
  kabupaten_kota: string;
  provinsi: string;
  kode_pos: string;
  no_telepon: string;
  email: string;
  website: string;
  nama_pengasuh: string;
  tahun_pelajaran_aktif: string;
  semester_aktif: "Ganjil" | "Genap";
  informasi_umum: string;
  updated_at: string;
  updated_by?: string;
}

export interface Kelas {
  id: string;
  kode_kelas: string;
  nama_kelas: string;
  tingkat: number;
  wali_kelas: string;
  kapasitas: number;
  is_active: boolean;
}

export interface Kamar {
  id: string;
  kode_kamar: string;
  nama_kamar: string;
  gedung_asrama: string;
  jenis_asrama: JenisKelamin;
  musyrif: string;
  kapasitas: number;
  is_active: boolean;
}

export interface Santri {
  id: string;
  nis: string;
  nama_lengkap: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  jenis_kelamin: JenisKelamin;
  alamat: string;
  tahun_masuk: number;
  tahun_ajaran_id: string;
  kelas_id: string;
  kamar_id: string;
  status: StatusSantri;
  foto_profil_url?: string;
  created_at: string;
}

export interface IdentitasAyah {
  nama_lengkap: string;
  no_telepon?: string;
  pekerjaan?: string;
}

export interface IdentitasIbu {
  nama_lengkap: string;
  no_telepon?: string;
  pekerjaan?: string;
}

export interface IdentitasWaliOpsional {
  nama_lengkap: string;
  hubungan: string;
  no_telepon: string;
}

export interface IdentitasKeluargaSantri {
  penanggung_jawab: "Ayah" | "Ibu" | "Wali";
  santri_id?: string;
  santri_nis?: string;
  santri_nama?: string;
  ayah: IdentitasAyah;
  ibu: IdentitasIbu;
  wali?: IdentitasWaliOpsional | null;
}

export interface WaliSantri {
  id: string;
  user_id: string;
  santri_id: string; // 1:1 Unique Constraint
  nama_lengkap: string; // Nama Penanggung Jawab Akun
  hubungan: "Ayah" | "Ibu" | "Wali"; // Penanggung Jawab Akun
  no_telepon: string;
  email: string;
  alamat: string;
  penanggung_jawab?: "Ayah" | "Ibu" | "Wali";
  nama_ayah?: string;
  no_hp_ayah?: string;
  pekerjaan_ayah?: string;
  nama_ibu?: string;
  no_hp_ibu?: string;
  pekerjaan_ibu?: string;
  nama_wali?: string;
  hubungan_wali_detail?: string;
  no_hp_wali?: string;
}

export interface RiwayatPenempatanSantri {
  id: string;
  santri_id: string;
  kelas_lama_id: string | null;
  kelas_baru_id: string;
  kamar_lama_id: string | null;
  kamar_baru_id: string;
  tanggal_efektif: string;
  keterangan: string;
  petugas_nama: string;
  created_at: string;
}

export type StatusPersetujuanPembiayaan =
  | "MENUNGGU_PERSETUJUAN"
  | "DISETUJUI"
  | "DITOLAK";

export type KelancaranMengajiGrade =
  | "Sangat Lancar (A)"
  | "Lancar (B)"
  | "Cukup Lancar (C)"
  | "Perlu Bimbingan (D)";

export type MakharijMengajiGrade =
  | "Fasih & Tepat (A)"
  | "Baik (B)"
  | "Cukup (C)"
  | "Perlu Bimbingan (D)";

export type TajwidMengajiGrade =
  | "Sangat Baik (A)"
  | "Baik (B)"
  | "Cukup (C)"
  | "Perlu Bimbingan (D)";

export interface JenisPembayaran {
  id: string;
  kode_pembayaran: string;
  nama_pembayaran: string;
  deskripsi: string;
  nominal: number;
  kategori: string;
  tahun_ajaran_id: string;
  periode_pembayaran: "Bulanan" | "Semester" | "Tahunan" | "Sekali Bayar";
  tanggal_mulai: string;
  tanggal_jatuh_tempo: string;
  sasaran_santri: "SEMUA" | "KELAS_TERTENTU" | "KAMAR_TERTENTU" | "INDIVIDU";
  sasaran_target_id?: string;
  kebijakan_cicilan: KebijakanCicilan;
  minimal_nominal_cicilan: number | null;
  is_active: boolean;
  status_persetujuan?: StatusPersetujuanPembiayaan;
  catatan_persetujuan?: string;
  disetujui_oleh_nama?: string;
  disetujui_at?: string;
  created_by?: string;
  created_at?: string;
}

export interface Tagihan {
  id: string;
  nomor_tagihan: string;
  santri_id: string;
  jenis_pembayaran_id: string;
  judul_tagihan: string;
  kategori: string;
  periode_label: string;
  nominal_awal: number;
  nominal_penyesuaian: number;
  nominal_tagihan: number;
  total_terbayar: number;
  sisa_tagihan: number;
  kebijakan_cicilan_snapshot: KebijakanCicilan;
  minimal_cicilan_snapshot: number | null;
  tanggal_mulai: string;
  tanggal_jatuh_tempo: string;
  status: StatusTagihan;
  is_active: boolean;
  created_at: string;
}

export interface RiwayatPenyesuaianTagihan {
  id: string;
  tagihan_id: string;
  nominal_sebelum: number;
  nominal_sesudah: number;
  status_sebelum: StatusTagihan;
  status_sesudah: StatusTagihan;
  alasan_penyesuaian: string;
  petugas_nama: string;
  created_at: string;
}

export interface KeranjangItem {
  tagihan_id: string;
  nominal_bayar: number;
}

export interface AlokasiPembayaran {
  id: string;
  transaksi_id: string;
  tagihan_id: string;
  judul_tagihan: string;
  nominal_alokasi: number;
}

export interface TransaksiPembayaran {
  id: string;
  nomor_transaksi: string;
  santri_id: string;
  wali_user_id: string;
  total_nominal: number;
  rekening_tujuan_snapshot: {
    nama_bank: string;
    nomor_rekening: string;
    atas_nama: string;
  };
  tanggal_transfer: string;
  nama_pengirim: string;
  bank_pengirim: string;
  bukti_transfer_url: string;
  status: StatusTransaksi;
  alokasi: AlokasiPembayaran[];
  verified_by_nama?: string;
  verified_at?: string;
  catatan_verifikasi?: string;
  created_at: string;
}

export interface SaldoUangSaku {
  santri_id: string;
  saldo_saat_ini: number;
  total_masuk: number;
  total_keluar: number;
  total_penyesuaian: number;
  updated_at: string;
}

export interface PengajuanUangSaku {
  id: string;
  nomor_pengajuan: string;
  santri_id: string;
  wali_user_id: string;
  nominal: number;
  rekening_tujuan_snapshot: {
    nama_bank: string;
    nomor_rekening: string;
    atas_nama: string;
  };
  tanggal_transfer: string;
  nama_pengirim: string;
  bank_pengirim: string;
  bukti_transfer_url: string;
  keterangan: string;
  status: StatusTransaksi;
  verified_by_nama?: string;
  verified_at?: string;
  catatan_verifikasi?: string;
  created_at: string;
}

export interface MutasiUangSaku {
  id: string;
  nomor_transaksi: string;
  santri_id: string;
  jenis_mutasi: JenisMutasiSaku;
  nominal: number;
  saldo_sebelum: number;
  saldo_sesudah: number;
  keterangan: string;
  pengajuan_id?: string;
  foto_penyerahan_url?: string;
  referensi_mutasi_id?: string;
  alasan_koreksi?: string;
  petugas_nama: string;
  created_at: string;
}

export interface PerkembanganMengaji {
  id: string;
  santri_id: string;
  tanggal_penilaian: string;
  pembimbing_name: string;
  metode_pembelajaran: string;
  tingkat_jilid: string;
  materi_terakhir: string;
  kelancaran_bacaan: string;
  makharijul_huruf: string;
  tajwid: string;
  catatan_perkembangan: string;
  petugas_nama: string;
  created_at: string;
}

export interface SetoranTahfidz {
  id: string;
  santri_id: string;
  tanggal_setoran: string;
  pembimbing_name: string;
  nama_surah: string;
  juz: number;
  ayat_awal: number;
  ayat_akhir: number;
  jumlah_ayat: number;
  jenis_setoran: JenisSetoranTahfidz;
  kualitas_hafalan: string;
  catatan_pembimbing: string;
  petugas_nama: string;
  created_at: string;
}

export interface PrestasiSantri {
  id: string;
  santri_id: string;
  tanggal_prestasi: string;
  nama_kegiatan: string;
  kategori: string;
  tingkat_prestasi: TingkatPrestasi;
  peringkat: string;
  deskripsi: string;
  dokumentasi_url?: string;
  petugas_nama: string;
  created_at: string;
}

export interface MasterKategoriPelanggaran {
  id: string;
  kode_kategori: string;
  nama_kategori: string;
  tingkat_pelanggaran: "RINGAN" | "SEDANG" | "BERAT";
  poin_pembinaan: number;
  standar_tindak_lanjut: string;
  deskripsi?: string;
  is_active?: boolean;
  created_at?: string;
}

export interface RiwayatPerubahanKedisiplinan {
  id: string;
  catatan_kedisiplinan_id: string;
  tindak_lanjut_sebelum: string;
  catatan_pembinaan_sebelum: string;
  status_sebelum: StatusTindakLanjut;
  status_sesudah: StatusTindakLanjut;
  alasan_perubahan: string;
  diubah_oleh_nama: string;
  created_at: string;
}

export interface CatatanKedisiplinan {
  id: string;
  santri_id: string;
  tanggal_kejadian: string;
  waktu_kejadian: string;
  kategori_id: string;
  nama_kategori: string;
  tingkat_pelanggaran: "RINGAN" | "SEDANG" | "BERAT";
  deskripsi: string;
  tindak_lanjut: string;
  catatan_pembinaan: string;
  status_tindak_lanjut: StatusTindakLanjut;
  dokumentasi_url?: string;
  petugas_nama: string;
  riwayat_perubahan: RiwayatPerubahanKedisiplinan[];
  created_at: string;
}

export interface Pengumuman {
  id: string;
  judul: string;
  kategori: "Umum" | "Akademik" | "Keuangan" | "Kegiatan Pesantren";
  isi: string;
  is_penting: boolean;
  is_published: boolean;
  tanggal_publikasi: string;
  created_by_nama: string;
  masa_berlaku?: string;
  sasaran?: "SEMUA" | "KELAS" | "SANTRI";
  target_id?: string;
  status_publikasi?: "DRAF" | "PUBLIKASI";
}

export interface NotifikasiItem {
  id: string;
  user_id: string;
  santri_id?: string;
  jenis_notifikasi: string;
  judul: string;
  pesan: string;
  tautan: string;
  is_read: boolean;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  user_id: string;
  user_nama: string;
  user_role: UserRole;
  aktivitas: string;
  jenis_objek: string;
  objek_id: string;
  data_sebelum?: Record<string, unknown>;
  data_sesudah?: Record<string, unknown>;
  alasan_perubahan?: string;
  waktu: string;
}

// ============================================================================
// INTERFACES UNTUK FITUR IMPORT EXCEL SANTRI & AKUN WALI
// ============================================================================

export interface ImportSantriRow {
  row_number: number;
  nis: string;
  nama_lengkap: string;
  jenis_kelamin: "L" | "P";
  tempat_lahir: string;
  tanggal_lahir: string; // YYYY-MM-DD
  kelas: string;
  kode_kelas: string;
  kamar: string;
  nama_wali: string;
  hubungan_wali: "Ayah" | "Ibu" | "Wali";
  no_telepon_wali: string;
  email_kontak?: string;
  alamat: string;
}

export interface ImportRowError {
  row_number: number;
  nis?: string;
  nama_lengkap?: string;
  column?: string;
  reason: string;
}

export interface ImportValidationSummary {
  total_rows: number;
  valid_count: number;
  error_count: number;
  duplicate_nis_in_file: string[];
  already_registered_nis: string[];
  kelas_not_found: string[];
  kamar_not_found: string[];
  empty_required_fields: number;
  errors: ImportRowError[];
  valid_rows: ImportSantriRow[];
}

export interface ImportRowResult {
  row_number: number;
  nis: string;
  nama_lengkap: string;
  status: "SUCCESS" | "FAILED";
  reason?: string;
  santri_id?: string;
  wali_username?: string;
}

export interface ImportBatchReport {
  total_processed: number;
  success_count: number;
  failed_count: number;
  wali_account_created_count: number;
  results: ImportRowResult[];
  imported_at: string;
}


