"use client";

// ============================================================================
// SIPETA - Central Application Service & State Context
// Menjalankan seluruh aturan bisnis PRD secara atomik:
// - Otorisasi 5 Role (Superadmin, Admin, Bendahara, Pengelola, Orang Tua/Wali)
// - Relasi 1:1 Akun Wali <-> Santri & Proteksi Lintas Santri
// - Keranjang Cicilan & Snapshot Kebijakan Cicilan
// - Verifikasi Transaksi Atomik (Eksklusif Bendahara)
// - Ledger Uang Saku Immutable & Wajib Foto Penyerahan
// - Jejak Audit (Audit Log) & Notifikasi Real-Time
// ============================================================================

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { safeFetchJson } from "@/lib/utils/http";
import type {
  AuditLogItem,
  CatatanKedisiplinan,
  DokumenUnduhan,
  ImportBatchReport,
  ImportSantriRow,
  JenisPembayaran,
  Kamar,
  KebijakanCicilan,
  Kelas,
  KeranjangItem,
  MasterKategoriPelanggaran,
  MutasiUangSaku,
  NotifikasiItem,
  PengajuanUangSaku,
  Pengumuman,
  PerkembanganMengaji,
  PrestasiSantri,
  ProfilPesantren,
  RekeningPesantren,
  RiwayatPenempatanSantri,
  RiwayatPenyesuaianTagihan,
  SaldoUangSaku,
  Santri,
  SetoranTahfidz,
  StatusSantri,
  StatusTagihan,
  StatusTindakLanjut,
  Tagihan,
  TahunAjaran,
  TingkatPrestasi,
  TransaksiPembayaran,
  UserProfile,
  UserRole,
  WaliSantri,
} from "@/types/database";
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_DOKUMEN_UNDUHAN,
  INITIAL_JENIS_PEMBAYARAN,
  INITIAL_KAMAR,
  INITIAL_KEDISIPLINAN,
  INITIAL_KELAS,
  INITIAL_MASTER_PELANGGARAN,
  INITIAL_MUTASI_UANG_SAKU,
  INITIAL_NOTIFIKASI,
  INITIAL_PENGAJUAN_UANG_SAKU,
  INITIAL_PENGUMUMAN,
  INITIAL_PERKEMBANGAN_MENGAJI,
  INITIAL_PRESTASI,
  INITIAL_PROFIL_PESANTREN,
  INITIAL_REKENING,
  INITIAL_RIWAYAT_PENEMPATAN,
  INITIAL_SANTRI,
  INITIAL_SETORAN_TAHFIDZ,
  INITIAL_TAGIHAN,
  INITIAL_TAHUN_AJARAN,
  INITIAL_TRANSAKSI_PEMBAYARAN,
  INITIAL_USERS,
  INITIAL_WALI_SANTRI,
} from "@/lib/store/initial-data";
import {
  calculatePocketMoneyLedger,
  canRoleApproveFinancialTransaction,
  koreksiLedgerSakuSchema,
  pengajuanTopupSakuSchema,
  penyerahanUangSakuSchema,
  validateNominalCicilan,
} from "@/lib/validations/schemas";
import {
  checkSupabaseHealth,
  type DatabaseHealthStatus,
  authService,
  administrasiService,
  keuanganService,
  kepesantrenanService,
  notifikasiService,
} from "@/lib/services";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  isValidUsername,
  normalizeUsername,
  usernameToInternalEmail,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import { getRoleLabel } from "@/lib/utils/format";

export interface ActionResponse {
  ok: boolean;
  message: string;
  is_idempotent_replay?: boolean;
}

interface SipetaContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  authMode: "supabase" | "demo" | "unauthenticated";
  authLoading: boolean;
  users: UserProfile[];
  rekeningResmi: RekeningPesantren | null;
  rekeningList: RekeningPesantren[];
  profilPesantren: ProfilPesantren;
  tahunAjaranList: TahunAjaran[];
  tahunAjaranAktif: TahunAjaran | undefined;
  kelasList: Kelas[];
  kamarList: Kamar[];
  santriList: Santri[];
  waliList: WaliSantri[];
  riwayatPenempatan: RiwayatPenempatanSantri[];
  jenisPembayaranList: JenisPembayaran[];
  tagihanList: Tagihan[];
  riwayatPenyesuaianTagihan: RiwayatPenyesuaianTagihan[];
  keranjang: KeranjangItem[];
  transaksiPembayaranList: TransaksiPembayaran[];
  pengajuanUangSakuList: PengajuanUangSaku[];
  mutasiUangSakuList: MutasiUangSaku[];
  mengajiList: PerkembanganMengaji[];
  tahfidzList: SetoranTahfidz[];
  prestasiList: PrestasiSantri[];
  masterPelanggaranList: MasterKategoriPelanggaran[];
  kedisiplinanList: CatatanKedisiplinan[];
  pengumumanList: Pengumuman[];
  dokumenList: DokumenUnduhan[];
  notifikasiList: NotifikasiItem[];
  auditLogs: AuditLogItem[];

  // Status Koneksi Backend & Autentikasi
  connectionStatus: "checking" | "connected" | "demo";
  isLiveSupabase: boolean;
  dataSource: "supabase" | "demo";
  healthStatus: DatabaseHealthStatus | null;
  refreshFromSupabase: () => Promise<void>;
  loginWithSupabase: (
    email: string,
    kataSandi: string,
    expectedRole?: UserRole
  ) => Promise<ActionResponse>;
  logout: () => Promise<ActionResponse>;
  logoutSupabase: () => Promise<ActionResponse>;
  enterDemoMode: (demoRole?: UserRole) => void;
  exitDemoMode: () => void;

  // Helpers
  switchActiveUser: (userId: string) => void;
  getSaldoSantri: (santriId: string) => SaldoUangSaku;
  resetDemoData: () => void;
  changePassword: (newPassword: string) => Promise<ActionResponse>;
  updateMyProfile: (payload: {
    nama_lengkap: string;
    no_telepon?: string;
    old_password?: string;
    new_password?: string;
  }) => Promise<ActionResponse>;

  // Superadmin Actions
  createUserAccount: (payload: {
    nama_lengkap: string;
    username?: string;
    email?: string;
    password?: string;
    no_telepon?: string;
    role: UserProfile["role"];
    santri_id?: string;
  }) => Promise<ActionResponse>;
  manageUserAccount: (
    userId: string,
    payload: {
      nama_lengkap?: string;
      username?: string;
      new_password?: string;
      no_telepon?: string;
      role?: UserRole;
      is_active?: boolean;
      must_change_password?: boolean;
    }
  ) => Promise<ActionResponse>;
  toggleUserActive: (userId: string) => Promise<ActionResponse>;
  resetUserPassword: (userId: string, newPassword: string, mustChangePassword?: boolean) => Promise<ActionResponse>;
  updateUserProfile: (
    userId: string,
    data: { nama_lengkap: string; no_telepon?: string; role?: UserRole }
  ) => Promise<ActionResponse>;
  deleteUserAccount: (userId: string) => Promise<ActionResponse>;
  deleteUserAccountBatch: (userIds: string[]) => Promise<{
    ok: boolean;
    message: string;
    results?: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }>;
    summary?: { total: number; deleted: number; deactivated: number; skipped: number; failed: number };
  }>;
  updateRekeningResmi: (payload: Omit<RekeningPesantren, "id" | "is_active" | "updated_at">) => ActionResponse;
  createRekening: (payload: {
    nama_bank: string;
    kode_bank?: string;
    nomor_rekening: string;
    atas_nama: string;
    catatan_instruksi?: string;
    is_active?: boolean;
  }) => Promise<ActionResponse>;
  updateRekening: (id: string, payload: Partial<RekeningPesantren>) => Promise<ActionResponse>;
  setUtamaRekening: (id: string, alasan?: string) => Promise<ActionResponse>;
  activateRekening: (id: string, alasan?: string) => Promise<ActionResponse>;
  deactivateRekening: (id: string, alasan?: string) => Promise<ActionResponse>;
  toggleActiveRekening: (id: string, isActive?: boolean, alasan?: string) => Promise<ActionResponse>;
  refreshRekeningOnly: () => Promise<RekeningPesantren[]>;
  deleteRekening: (id: string) => Promise<ActionResponse>;
  updateProfilPesantren: (payload: Partial<ProfilPesantren>, activeTahunAjaranId?: string) => Promise<ActionResponse>;
  setActiveTahunAjaran: (tahunAjaranId: string) => Promise<ActionResponse>;
  setActiveSemester: (semester: "Ganjil" | "Genap") => Promise<ActionResponse>;
  createTahunAjaran: (payload: {
    nama: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
  }) => Promise<ActionResponse>;
  deleteTahunAjaran: (tahunAjaranId: string) => Promise<ActionResponse>;

  // Admin Actions
  createSantriWithWali: (payload: {
    nis: string;
    nama_lengkap: string;
    tempat_lahir: string;
    tanggal_lahir: string;
    jenis_kelamin: "L" | "P";
    alamat: string;
    tahun_masuk: number;
    tahun_ajaran_id?: string;
    kelas_id: string;
    kamar_id: string;
    nama_ayah?: string;
    no_hp_ayah?: string;
    pekerjaan_ayah?: string;
    nama_ibu?: string;
    no_hp_ibu?: string;
    pekerjaan_ibu?: string;
    nama_wali_opsional?: string;
    hubungan_wali_detail?: string;
    no_hp_wali_opsional?: string;
    penanggung_jawab?: "Ayah" | "Ibu" | "Wali";
    nama_wali?: string;
    hubungan_wali?: "Ayah" | "Ibu" | "Wali";
    telepon_wali?: string;
    username_wali?: string;
    password_wali?: string;
    email_kontak_wali?: string;
    email_wali?: string;
  }) => Promise<ActionResponse> | ActionResponse;
  importSantriBatch: (rows: ImportSantriRow[]) => Promise<{
    ok: boolean;
    message: string;
    report?: ImportBatchReport;
  }>;
  deleteSantriBatch: (santriIds: string[]) => Promise<ActionResponse>;
  moveSantriPlacement: (payload: {
    santri_id: string;
    kelas_baru_id: string;
    kamar_baru_id: string;
    keterangan: string;
  }) => ActionResponse;
  updateStatusSantri: (santriId: string, statusBaru: StatusSantri) => ActionResponse;
  createKelas: (payload: Omit<Kelas, "id" | "is_active">) => Promise<ActionResponse>;
  updateKelas: (id: string, payload: Partial<Kelas>) => Promise<ActionResponse>;
  deleteKelas: (id: string) => Promise<ActionResponse>;
  createKamar: (payload: Omit<Kamar, "id" | "is_active">) => Promise<ActionResponse>;
  updateKamar: (id: string, payload: Partial<Kamar>) => Promise<ActionResponse>;
  deleteKamar: (id: string) => Promise<ActionResponse>;
  createJenisPembayaran: (payload: Omit<JenisPembayaran, "id" | "is_active">) => ActionResponse;
  createPengajuanPembiayaan: (payload: {
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
  }) => ActionResponse;
  updateJenisPembayaran: (id: string, payload: Partial<JenisPembayaran>) => ActionResponse;
  deleteJenisPembayaran: (id: string) => ActionResponse;
  approveJenisPembayaran: (id: string, catatan?: string) => ActionResponse;
  rejectJenisPembayaran: (id: string, catatan: string) => ActionResponse;
  generateTagihan: (payload: {
    jenis_pembayaran_id: string;
    periode_label: string;
    tanggal_jatuh_tempo: string;
    target_mode: "SEMUA" | "KELAS" | "KAMAR" | "SANTRI";
    target_id?: string;
  }) => ActionResponse;
  adjustTagihan: (payload: {
    tagihan_id: string;
    nominal_penyesuaian: number;
    alasan_penyesuaian: string;
    pembatalan?: boolean;
  }) => ActionResponse;
  createPengumuman: (payload: {
    judul: string;
    kategori: Pengumuman["kategori"];
    isi: string;
    is_penting: boolean;
    is_published?: boolean;
    masa_berlaku?: string;
    sasaran?: "SEMUA" | "KELAS" | "SANTRI";
    target_id?: string;
    status_publikasi?: "DRAF" | "PUBLIKASI";
  }) => ActionResponse;
  updatePengumuman: (id: string, payload: Partial<Pengumuman>) => ActionResponse;
  deletePengumuman: (id: string) => ActionResponse;

  // Manajemen Dokumen & Unduhan (TU & Pengasuh)
  createDokumen: (payload: {
    judul: string;
    deskripsi: string;
    kategori: DokumenUnduhan["kategori"];
    file_name: string;
    file_size_formatted: string;
    file_type: DokumenUnduhan["file_type"];
    file_url?: string;
  }) => ActionResponse;
  deleteDokumen: (id: string) => ActionResponse;

  // Orang Tua / Wali Actions
  addOrUpdateKeranjang: (tagihanId: string, nominalBayar: number) => ActionResponse;
  removeFromKeranjang: (tagihanId: string) => void;
  clearKeranjang: () => void;
  submitCheckoutPembayaran: (payload: {
    tanggal_transfer: string;
    nama_pengirim: string;
    bank_pengirim: string;
    bukti_transfer_url: string;
    idempotency_key?: string;
  }) => Promise<ActionResponse>;
  uploadBuktiTransferPembayaran: (payload: {
    transaksi_id: string;
    tanggal_transfer: string;
    nama_pengirim: string;
    bank_pengirim: string;
    bukti_transfer_url: string;
  }) => ActionResponse;
  submitTopupUangSaku: (payload: {
    nominal: number;
    tanggal_transfer: string;
    nama_pengirim: string;
    bank_pengirim: string;
    bukti_transfer_url: string;
    keterangan?: string;
  }) => Promise<ActionResponse>;
  markNotifikasiRead: (notifikasiId: string) => void;
  markAllNotifikasiRead: () => void;

  // Bendahara Actions (Eksklusif Verifikasi & Uang Keluar)
  refreshAntreanBendaharaOnly: (force?: boolean) => Promise<void>;
  isAntreanLoading: boolean;
  verifyTransaksiPembayaran: (
    transaksiId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan: string
  ) => Promise<ActionResponse>;
  verifyTopupUangSaku: (
    pengajuanId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan: string
  ) => Promise<ActionResponse>;
  recordPenyerahanUangSaku: (payload: {
    santri_id: string;
    nominal: number;
    keterangan: string;
    foto_penyerahan_url: string;
  }) => ActionResponse;
  recordKoreksiLedgerSaku: (payload: {
    referensi_mutasi_id: string;
    jenis_mutasi: "PENYESUAIAN_TAMBAH" | "PENYESUAIAN_KURANG";
    nominal: number;
    alasan_koreksi: string;
  }) => ActionResponse;

  // Pengelola Kepesantrenan Actions
  recordPerkembanganMengaji: (
    payload: Omit<PerkembanganMengaji, "id" | "petugas_nama" | "created_at">
  ) => ActionResponse;
  updatePenilaianMengaji: (id: string, payload: Partial<PerkembanganMengaji>) => Promise<ActionResponse>;
  deletePenilaianMengaji: (id: string) => Promise<ActionResponse>;
  recordSetoranTahfidz: (
    payload: Omit<SetoranTahfidz, "id" | "jumlah_ayat" | "petugas_nama" | "created_at">
  ) => ActionResponse;
  updateSetoranTahfidz: (id: string, payload: Partial<SetoranTahfidz>) => Promise<ActionResponse>;
  deleteSetoranTahfidz: (id: string) => Promise<ActionResponse>;
  recordPrestasiSantri: (
    payload: Omit<PrestasiSantri, "id" | "petugas_nama" | "created_at">
  ) => ActionResponse;
  updatePrestasiSantri: (id: string, payload: Partial<PrestasiSantri>) => Promise<ActionResponse>;
  deletePrestasiSantri: (id: string) => Promise<ActionResponse>;
  recordCatatanKedisiplinan: (payload: {
    santri_id: string;
    tanggal_kejadian: string;
    waktu_kejadian: string;
    kategori_id: string;
    deskripsi: string;
    tindak_lanjut: string;
    catatan_pembinaan: string;
    status_tindak_lanjut: StatusTindakLanjut;
  }) => ActionResponse;
  updateTindakLanjutKedisiplinan: (payload: {
    catatan_id: string;
    tindak_lanjut_baru: string;
    catatan_pembinaan_baru: string;
    status_baru: StatusTindakLanjut;
    alasan_perubahan: string;
  }) => ActionResponse;
  updateCatatanKedisiplinan: (id: string, payload: Partial<CatatanKedisiplinan>) => ActionResponse;
  deleteCatatanKedisiplinan: (id: string) => ActionResponse;
  createMasterKategoriPelanggaran: (payload: {
    kode_kategori: string;
    nama_kategori: string;
    tingkat_pelanggaran: "RINGAN" | "SEDANG" | "BERAT";
    poin_pembinaan: number;
    standar_tindak_lanjut: string;
    is_active?: boolean;
  }) => Promise<ActionResponse>;
  updateMasterKategoriPelanggaran: (
    id: string,
    payload: Partial<MasterKategoriPelanggaran>
  ) => Promise<ActionResponse>;
  deleteMasterKategoriPelanggaranBatch: (ids: string[]) => Promise<ActionResponse>;
}

const SipetaContext = createContext<SipetaContextValue | null>(null);

const STORAGE_KEY = "sipeta_abu_manshur_state_v1";

export function SipetaProvider({
  children,
  initialUser,
  initialAuthMode,
  initialTahunAjaranList,
}: {
  children: React.ReactNode;
  initialUser?: UserProfile | null;
  initialAuthMode?: "supabase" | "demo" | "unauthenticated";
  initialTahunAjaranList?: TahunAjaran[];
}) {
  const useDemoInitialData = !isSupabaseConfigured() && initialAuthMode !== "supabase";
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialUser ?? null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(initialUser));
  const [authMode, setAuthMode] = useState<"supabase" | "demo" | "unauthenticated">(
    initialAuthMode ?? (initialUser ? "demo" : "unauthenticated")
  );
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [users, setUsers] = useState<UserProfile[]>(
    useDemoInitialData ? INITIAL_USERS : initialUser ? [initialUser] : []
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(initialUser?.id ?? null);
  const [rekeningResmi, setRekeningResmi] = useState<RekeningPesantren | null>(
    useDemoInitialData ? INITIAL_REKENING : null
  );
  const [rekeningList, setRekeningList] = useState<RekeningPesantren[]>(
    useDemoInitialData ? [INITIAL_REKENING] : []
  );
  const [profilPesantren, setProfilPesantren] = useState<ProfilPesantren>(INITIAL_PROFIL_PESANTREN);
  const [tahunAjaranList, setTahunAjaranList] = useState<TahunAjaran[]>(
    initialTahunAjaranList ?? (useDemoInitialData ? INITIAL_TAHUN_AJARAN : [])
  );
  const tahunAjaranAktif = useMemo(
    () => tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0],
    [tahunAjaranList]
  );
  const [kelasList, setKelasList] = useState<Kelas[]>(useDemoInitialData ? INITIAL_KELAS : []);
  const [kamarList, setKamarList] = useState<Kamar[]>(useDemoInitialData ? INITIAL_KAMAR : []);
  const kelasListRef = useRef<Kelas[]>(useDemoInitialData ? INITIAL_KELAS : []);
  const kamarListRef = useRef<Kamar[]>(useDemoInitialData ? INITIAL_KAMAR : []);
  kelasListRef.current = kelasList;
  kamarListRef.current = kamarList;
  const [santriList, setSantriList] = useState<Santri[]>(useDemoInitialData ? INITIAL_SANTRI : []);
  const [waliList, setWaliList] = useState<WaliSantri[]>(useDemoInitialData ? INITIAL_WALI_SANTRI : []);
  const [riwayatPenempatan, setRiwayatPenempatan] = useState<RiwayatPenempatanSantri[]>(
    useDemoInitialData ? INITIAL_RIWAYAT_PENEMPATAN : []
  );
  const [jenisPembayaranList, setJenisPembayaranList] = useState<JenisPembayaran[]>(
    useDemoInitialData ? INITIAL_JENIS_PEMBAYARAN : []
  );
  const [tagihanList, setTagihanList] = useState<Tagihan[]>(useDemoInitialData ? INITIAL_TAGIHAN : []);
  const [riwayatPenyesuaianTagihan, setRiwayatPenyesuaianTagihan] = useState<
    RiwayatPenyesuaianTagihan[]
  >([]);
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [transaksiPembayaranList, setTransaksiPembayaranList] = useState<TransaksiPembayaran[]>(
    useDemoInitialData ? INITIAL_TRANSAKSI_PEMBAYARAN : []
  );
  const [pengajuanUangSakuList, setPengajuanUangSakuList] = useState<PengajuanUangSaku[]>(
    useDemoInitialData ? INITIAL_PENGAJUAN_UANG_SAKU : []
  );
  const [mutasiUangSakuList, setMutasiUangSakuList] = useState<MutasiUangSaku[]>(
    useDemoInitialData ? INITIAL_MUTASI_UANG_SAKU : []
  );
  const [mengajiList, setMengajiList] = useState<PerkembanganMengaji[]>(
    useDemoInitialData ? INITIAL_PERKEMBANGAN_MENGAJI : []
  );
  const [tahfidzList, setTahfidzList] = useState<SetoranTahfidz[]>(
    useDemoInitialData ? INITIAL_SETORAN_TAHFIDZ : []
  );
  const [prestasiList, setPrestasiList] = useState<PrestasiSantri[]>(
    useDemoInitialData ? INITIAL_PRESTASI : []
  );
  const [masterPelanggaranList, setMasterPelanggaranList] = useState<MasterKategoriPelanggaran[]>(
    useDemoInitialData ? INITIAL_MASTER_PELANGGARAN : []
  );
  const [kedisiplinanList, setKedisiplinanList] = useState<CatatanKedisiplinan[]>(
    useDemoInitialData ? INITIAL_KEDISIPLINAN : []
  );
  const [pengumumanList, setPengumumanList] = useState<Pengumuman[]>(
    useDemoInitialData ? INITIAL_PENGUMUMAN : []
  );
  const [dokumenList, setDokumenList] = useState<DokumenUnduhan[]>(
    INITIAL_DOKUMEN_UNDUHAN
  );
  const [notifikasiList, setNotifikasiList] = useState<NotifikasiItem[]>(
    useDemoInitialData ? INITIAL_NOTIFIKASI : []
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(
    useDemoInitialData ? INITIAL_AUDIT_LOGS : []
  );
  const [hydrated, setHydrated] = useState(false);

  // Status Koneksi Backend Aktual & Mode Data
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "demo">("checking");
  const [isLiveSupabase, setIsLiveSupabase] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<"supabase" | "demo">("demo");
  const [healthStatus, setHealthStatus] = useState<DatabaseHealthStatus | null>(null);

  // Penggabungan (coalescing) & throttling refresh: jika refresh sedang berjalan,
  // request berikutnya disatukan agar tidak menumpuk 23+ kueri berulang kali.
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef<Promise<void> | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  // Session generation epoch: memastikan hasil in-flight fetch dari sesi/role sebelumnya
  // otomatis dibuang dan tidak dapat mencemari state sesi pengguna yang baru login/berganti.
  const sessionEpochRef = useRef<number>(0);

  // Kueri mandiri rekening pesantren: Terisolasi murni untuk memuat rekening seketika (<50ms)
  // tanpa menunggu 23 kueri lain selesai dan tanpa me-refresh seluruh aplikasi.
  const refreshRekeningOnly = useCallback(async (): Promise<RekeningPesantren[]> => {
    if (!isSupabaseConfigured() && authMode !== "supabase") {
      return rekeningList;
    }
    const currentEpoch = sessionEpochRef.current;
    try {
      const list = await administrasiService.getRekeningList(true);
      if (sessionEpochRef.current !== currentEpoch) return list;
      if (Array.isArray(list)) {
        setRekeningList(list);
        const active = list.find((r) => r.is_active) ?? null;
        setRekeningResmi(active);
      }
      return list;
    } catch (e) {
      console.warn("Gagal memuat ulang rekening pesantren:", e);
      return rekeningList;
    }
  }, [authMode, rekeningList]);

  // State & kontrol antrean Bendahara terisolasi (membedakan status loading vs antrean kosong 0)
  const [isAntreanLoading, setIsAntreanLoading] = useState<boolean>(false);
  const inFlightAntreanRef = useRef<Promise<void> | null>(null);
  const lastAntreanRefreshTimeRef = useRef<number>(0);

  // Kueri mandiri antrean verifikasi Bendahara: Terisolasi murni untuk memuat antrean pembayaran & top-up
  // seketika tanpa menunggu 23 kueri lain selesai dan tanpa me-refresh seluruh aplikasi.
  const refreshAntreanBendaharaOnly = useCallback(async (force = false): Promise<void> => {
    if (!isSupabaseConfigured() && authMode !== "supabase") {
      return;
    }
    const now = Date.now();
    // Request coalescing: jika ada request in-flight dan belum lewat 1.5 detik, gabungkan
    if (!force && now - lastAntreanRefreshTimeRef.current < 1500 && inFlightAntreanRef.current) {
      return inFlightAntreanRef.current;
    }

    const currentEpoch = sessionEpochRef.current;
    setIsAntreanLoading(true);
    lastAntreanRefreshTimeRef.current = now;

    const fetchPromise = safeFetchJson<{
      ok: boolean;
      transaksiPembayaranList?: TransaksiPembayaran[];
      pengajuanUangSakuList?: PengajuanUangSaku[];
    }>("/api/keuangan/transaksi")
      .then((res) => {
        if (sessionEpochRef.current !== currentEpoch) return;
        if (res.ok && res.data?.ok) {
          if (Array.isArray(res.data.transaksiPembayaranList)) {
            setTransaksiPembayaranList(res.data.transaksiPembayaranList);
          }
          if (Array.isArray(res.data.pengajuanUangSakuList)) {
            setPengajuanUangSakuList(res.data.pengajuanUangSakuList);
          }
        }
      })
      .catch((e) => {
        console.warn("Gagal memuat antrean Bendahara:", e);
      })
      .finally(() => {
        if (sessionEpochRef.current === currentEpoch) {
          setIsAntreanLoading(false);
        }
        inFlightAntreanRef.current = null;
      });

    inFlightAntreanRef.current = fetchPromise;
    return fetchPromise;
  }, [authMode]);

  // Sinkronisasi data real-time dari Supabase secara progresif & non-blocking
  const runRefreshFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const currentEpoch = sessionEpochRef.current;
    try {
      // 1. Jalankan kueri inti yang cepat terlebih dahulu dan perbarui state seketika
      // agar tampilan rekening, tahun ajaran, dan kelas langsung siap dalam waktu <100ms.
      const rekeningPromise = administrasiService.getRekeningList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) {
          setRekeningList(list);
          const active = list.find((r) => r.is_active) ?? null;
          setRekeningResmi(active);
        }
        return list;
      }).catch(() => []);

      const kelasPromise = administrasiService.getKelasList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) {
          kelasListRef.current = list;
          setKelasList(list);
        }
        return list;
      }).catch(() => []);

      const kamarPromise = administrasiService.getKamarList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) {
          kamarListRef.current = list;
          setKamarList(list);
        }
        return list;
      }).catch(() => []);

      const tahunAjaranPromise = administrasiService.getTahunAjaranList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) {
          setTahunAjaranList(list);
          const active = list.find((t) => t.is_active);
          if (active) {
            setProfilPesantren((prev) => ({
              ...prev,
              tahun_pelajaran_aktif: active.nama,
            }));
          }
        }
        return list;
      }).catch(() => []);

      const profilPromise = administrasiService.getProfilPesantren().then((prof) => {
        if (sessionEpochRef.current !== currentEpoch) return prof;
        if (prof) setProfilPesantren((prev) => ({ ...prev, ...prof }));
        return prof;
      }).catch(() => null);

      const pengumumanPromise = administrasiService.getPengumumanList(true).then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setPengumumanList(list);
        return list;
      }).catch(() => []);

      const notifikasiPromise = notifikasiService.getNotifikasi().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setNotifikasiList(list);
        return list;
      }).catch(() => []);

      // 2. Kueri data transaksi & tagihan secara progresif
      const transaksiPromise = safeFetchJson("/api/keuangan/transaksi").then((d) => {
        if (sessionEpochRef.current !== currentEpoch) return d;
        if (d.ok && d.data?.ok) {
          if (Array.isArray(d.data.transaksiPembayaranList)) {
            setTransaksiPembayaranList(d.data.transaksiPembayaranList);
          }
          if (Array.isArray(d.data.pengajuanUangSakuList)) {
            setPengajuanUangSakuList(d.data.pengajuanUangSakuList);
          }
        }
        return d;
      }).catch(() => null);

      const tagihanPromise = keuanganService.getTagihanBySantri().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setTagihanList(list);
        return list;
      }).catch(() => []);

      const mutasiSakuPromise = keuanganService.getMutasiUangSaku().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setMutasiUangSakuList(list);
        return list;
      }).catch(() => []);

      // 3. Kueri kepesantrenan (mengaji, tahfidz, prestasi, kedisiplinan)
      const mengajiPromise = kepesantrenanService.getPerkembanganMengaji().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setMengajiList(list);
        return list;
      }).catch(() => []);

      const tahfidzPromise = kepesantrenanService.getSetoranTahfidz().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setTahfidzList(list);
        return list;
      }).catch(() => []);

      const prestasiPromise = kepesantrenanService.getPrestasiSantri().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setPrestasiList(list);
        return list;
      }).catch(() => []);

      const kedisiplinanPromise = kepesantrenanService.getCatatanKedisiplinan().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setKedisiplinanList(list);
        return list;
      }).catch(() => []);

      const kategoriPelanggaranPromise = kepesantrenanService.getMasterKategoriPelanggaran(true).then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setMasterPelanggaranList(list);
        return list;
      }).catch(() => []);

      // 4. Kueri santri, wali, akun staf, riwayat penempatan, dan audit
      const santriPromise = administrasiService.getSantriList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setSantriList(list);
        return list;
      }).catch(() => []);

      const waliPromise = administrasiService.getWaliList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setWaliList(list);
        return list;
      }).catch(() => []);

      const jenisPromise = administrasiService.getJenisPembayaranList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setJenisPembayaranList(list);
        return list;
      }).catch(() => []);

      const riwayatPenempatanPromise = administrasiService.getRiwayatPenempatanList().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setRiwayatPenempatan(list);
        return list;
      }).catch(() => []);

      const usersPromise = authService.getAllProfiles().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) {
          const cleanUsers = list.filter((u) => u && !u.id.startsWith("usr-"));
          if (cleanUsers.length > 0) setUsers(cleanUsers);
        }
        return list;
      }).catch(() => []);

      const auditLogsPromise = administrasiService.getAuditLogs().then((list) => {
        if (sessionEpochRef.current !== currentEpoch) return list;
        if (Array.isArray(list)) setAuditLogs(list);
        return list;
      }).catch(() => []);

      // Tunggu seluruh promise selesai di latar belakang agar refreshInFlightRef dapat diselesaikan
      await Promise.allSettled([
        rekeningPromise,
        kelasPromise,
        kamarPromise,
        tahunAjaranPromise,
        profilPromise,
        pengumumanPromise,
        notifikasiPromise,
        transaksiPromise,
        tagihanPromise,
        mutasiSakuPromise,
        mengajiPromise,
        tahfidzPromise,
        prestasiPromise,
        kedisiplinanPromise,
        kategoriPelanggaranPromise,
        santriPromise,
        waliPromise,
        jenisPromise,
        riwayatPenempatanPromise,
        usersPromise,
        auditLogsPromise,
      ]);
    } catch (e) {
      console.warn("Sinkronisasi Supabase ditunda/offline:", e);
    }
  }, []);

  const refreshFromSupabase = useCallback((force = false): Promise<void> => {
    const now = Date.now();
    // Hindari pemanggilan ganda dalam window 1.2 detik jika sudah ada request in-flight
    if (!force && now - lastRefreshTimeRef.current < 1200 && refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    if (!refreshInFlightRef.current) {
      lastRefreshTimeRef.current = now;
      refreshInFlightRef.current = runRefreshFromSupabase().finally(() => {
        refreshInFlightRef.current = null;
      });
      return refreshInFlightRef.current;
    }

    // Refresh sedang berjalan: jadwalkan satu putaran lanjutan saja
    if (!refreshQueuedRef.current) {
      refreshQueuedRef.current = refreshInFlightRef.current.then(() => {
        refreshQueuedRef.current = null;
        return runRefreshFromSupabase();
      });
    }
    return refreshQueuedRef.current;
  }, [runRefreshFromSupabase]);

  // Inisialisasi Backend Health Check & Sesi Autentikasi
  useEffect(() => {
    let isMounted = true;
    let authResolved = false;

    // Safety resolver: membebaskan tampilan dari splash screen
    const resolveAuth = () => {
      if (!authResolved) {
        authResolved = true;
        setAuthLoading(false);
      }
    };

    // Safety circuit-breaker: maksimal 3.5 detik
    // CATATAN ARSITEKTUR SIPETA:
    // Circuit breaker HANYA membebaskan tampilan dari splash screen (setAuthLoading(false))
    // agar pengguna tidak terblokir visual jika jaringan lambat/cold-start.
    // Circuit breaker SAMA SEKALI TIDAK memalsukan status pengguna menjadi unauthenticated!
    const safetyTimer = setTimeout(() => {
      resolveAuth();
    }, 3500);

    async function initBackend() {
      try {
        if (!isSupabaseConfigured()) {
          if (isMounted) {
            setHealthStatus({
              isConfigured: false,
              isConnected: false,
              connectionState: "NOT_CONFIGURED",
              mode: "demo_local",
              message: "Supabase environment variables belum dikonfigurasi.",
              checkedAt: new Date().toISOString(),
            });
            setConnectionStatus("demo");
            setDataSource("demo");
            setIsLiveSupabase(false);
            setCurrentUser(null);
            setCurrentUserId(null);
            setIsAuthenticated(false);
            setAuthMode("unauthenticated");
          }
          resolveAuth();
          return;
        }

        // 1. Jalankan pemeriksaan health status dan sesi autentikasi secara paralel
        // agar splash screen tidak terblokir menunggu /api/health terlebih dahulu.
        Promise.race([
          checkSupabaseHealth(),
          new Promise<DatabaseHealthStatus>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  isConfigured: true,
                  isConnected: false,
                  connectionState: "CONNECTION_FAILED",
                  mode: "demo_local",
                  message: "Pemeriksaan koneksi Supabase melebihi batas waktu (timeout).",
                  checkedAt: new Date().toISOString(),
                }),
              3000
            )
          ),
        ])
          .then((health) => {
            if (!isMounted) return;
            setHealthStatus(health);
            if (health.isConnected) {
              setConnectionStatus("connected");
              setIsLiveSupabase(true);
              setDataSource("supabase");
            } else {
              setConnectionStatus("demo");
              setIsLiveSupabase(false);
              setDataSource("demo");
            }
          })
          .catch(() => {});

        // 2. Cek status sesi autentikasi secara presisi:
        // Membedakan 3 kondisi:
        // A. Sesi valid ('authenticated')
        // B. Tidak ada sesi ('unauthenticated')
        // C. Jaringan gagal / Supabase timeout ('network_error')
        const sessionResult = await authService.checkSession();
        if (!isMounted) {
          resolveAuth();
          return;
        }

        if (sessionResult.status === "authenticated") {
          // KONDISI 1: SESI VALID
          setUsers([sessionResult.user]);
          setCurrentUser(sessionResult.user);
          setCurrentUserId(sessionResult.user.id);
          setIsAuthenticated(true);
          setAuthMode("supabase");
          setConnectionStatus("connected");
          setIsLiveSupabase(true);
          setDataSource("supabase");

          // Hilangkan splash screen seketika
          resolveAuth();

          // Sinkronisasi data detail berjalan di latar belakang secara asinkron
          // CATATAN: refreshFromSupabase TIDAK MENIMPA state autentikasi ataupun melakukan redirect
          refreshFromSupabase().catch((err) => {
            console.warn("Sinkronisasi latar belakang tertunda:", err);
          });
        } else if (sessionResult.status === "unauthenticated") {
          // KONDISI 2: TIDAK ADA SESI
          setCurrentUser(null);
          setCurrentUserId(null);
          setIsAuthenticated(false);
          setAuthMode("unauthenticated");

          // Hilangkan splash screen seketika
          resolveAuth();

          // Ambil data publik (profil pesantren, tahun pelajaran, pengumuman) secara asinkron di latar belakang
          Promise.all([
            administrasiService.getPengumumanList(false),
            administrasiService.getProfilPesantren(),
            administrasiService.getTahunAjaranList(),
          ])
            .then(([pubAnnouncements, pubProfil, pubTa]) => {
              if (isMounted) {
                if (Array.isArray(pubAnnouncements)) {
                  setPengumumanList(pubAnnouncements);
                }
                const activePubTa = Array.isArray(pubTa) ? pubTa.find((t) => t.is_active) : undefined;
                if (Array.isArray(pubTa)) {
                  setTahunAjaranList(pubTa);
                }
                if (pubProfil) {
                  setProfilPesantren((prev) => ({
                    ...prev,
                    ...pubProfil,
                    tahun_pelajaran_aktif: activePubTa?.nama || pubProfil.tahun_pelajaran_aktif,
                  }));
                } else if (activePubTa) {
                  setProfilPesantren((prev) => ({
                    ...prev,
                    tahun_pelajaran_aktif: activePubTa.nama,
                  }));
                }
              }
            })
            .catch(() => {
              // Abaikan jika gagal memuat data publik di background
            });
        } else if (sessionResult.status === "network_error") {
          // KONDISI 3: SUPABASE TIMEOUT / JARINGAN GAGAL
          // PENTING: Jangan memalsukan status pengguna menjadi unauthenticated!
          // Jangan menghapus currentUser jika sebelumnya sudah tersimpan atau sedang diproses.
          setHealthStatus((prev) => ({
            isConfigured: true,
            isConnected: false,
            connectionState: "CONNECTION_FAILED",
            mode: "demo_local",
            message: "Jaringan lambat atau gagal menghubungi server autentikasi: " + sessionResult.error,
            checkedAt: new Date().toISOString(),
            ...(prev ?? {}),
          }));

          // Bebaskan splash screen agar pengguna tidak stuck
          resolveAuth();
        }
      } catch (err) {
        if (isMounted) {
          // Jangan memalsukan status pengguna jika terjadi exception jaringan tak terduga
          setHealthStatus({
            isConfigured: true,
            isConnected: false,
            connectionState: "CONNECTION_FAILED",
            mode: "demo_local",
            message: "Gagal menghubungkan ke Supabase.",
            error: err instanceof Error ? err.message : String(err),
            checkedAt: new Date().toISOString(),
          });
        }
        resolveAuth();
      } finally {
        resolveAuth();
      }
    }
    initBackend();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [refreshFromSupabase]);

  // Real-time synchronization untuk Profil Pesantren & Tahun Pelajaran ke seluruh role & perangkat
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    try {
      const client = createSupabaseBrowserClient();
      const channel = client
        .channel("sipeta-profil-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profil_pesantren" },
          (payload: { new?: unknown }) => {
            if (payload.new && typeof payload.new === "object") {
              setProfilPesantren((prev) => ({
                ...prev,
                ...(payload.new as ProfilPesantren),
              }));
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tahun_ajaran" },
          async () => {
            try {
              const list = await administrasiService.getTahunAjaranList();
              if (Array.isArray(list)) {
                setTahunAjaranList(list);
                const activeTA = list.find((t) => t.is_active);
                if (activeTA) {
                  setProfilPesantren((prev) => ({
                    ...prev,
                    tahun_pelajaran_aktif: activeTA.nama,
                  }));
                }
              }
            } catch { }
          }
        )
        .subscribe();

      return () => {
        try {
          client.removeChannel(channel);
        } catch { }
      };
    } catch { }
  }, []);

  const loginWithSupabase = async (
    email: string,
    kataSandi: string,
    expectedRole?: UserRole
  ): Promise<ActionResponse> => {
    const res = await authService.login(email, kataSandi, expectedRole);
    if (res.ok && res.user) {
      if (!res.user.is_active) {
        return {
          ok: false,
          message: "Akun Anda telah dinonaktifkan. Hubungi Administrator untuk informasi lebih lanjut.",
        };
      }
      // Tingkatkan epoch sesi dan bersihkan cache agar data role sebelumnya tidak tertinggal
      sessionEpochRef.current++;
      lastRefreshTimeRef.current = 0;
      refreshInFlightRef.current = null;
      refreshQueuedRef.current = null;
      administrasiService.clearCache();

      // Reset data operasional role sebelum memuat data baru milik pengguna saat ini
      setSantriList([]);
      setWaliList([]);
      setTagihanList([]);
      setTransaksiPembayaranList([]);
      setPengajuanUangSakuList([]);
      setMutasiUangSakuList([]);
      setMengajiList([]);
      setTahfidzList([]);
      setPrestasiList([]);
      setKedisiplinanList([]);
      setAuditLogs([]);
      setKeranjang([]);
      setRiwayatPenempatan([]);

      setUsers([res.user]);
      setCurrentUser(res.user);
      setCurrentUserId(res.user.id);
      setIsAuthenticated(true);
      setAuthMode("supabase");
      // Login sudah tervalidasi server (auth + profil + role). Pemuatan data portal berjalan
      // di latar belakang secara progresif agar pengguna langsung masuk dashboard.
      refreshFromSupabase(true).catch((err) => {
        console.warn("Sinkronisasi data pasca-login tertunda:", err);
      });
      return { ok: true, message: res.message };
    }
    return { ok: false, message: res.message };
  };

  const logout = async (): Promise<ActionResponse> => {
    const wasSupabase = authMode === "supabase";
    // 1. Batalkan seluruh in-flight request dari sesi ini melalui epoch invalidation
    sessionEpochRef.current++;
    lastRefreshTimeRef.current = 0;
    refreshInFlightRef.current = null;
    refreshQueuedRef.current = null;
    administrasiService.clearCache();

    // 2. Bersihkan seluruh state data operasional & pengguna seketika
    setSantriList([]);
    setWaliList([]);
    setTagihanList([]);
    setTransaksiPembayaranList([]);
    setPengajuanUangSakuList([]);
    setMutasiUangSakuList([]);
    setMengajiList([]);
    setTahfidzList([]);
    setPrestasiList([]);
    setKedisiplinanList([]);
    setAuditLogs([]);
    setKeranjang([]);
    setRiwayatPenempatan([]);
    setUsers([]);
    setCurrentUser(null);
    setCurrentUserId(null);
    setIsAuthenticated(false);
    setAuthMode("unauthenticated");

    try {
      window.localStorage.removeItem(STORAGE_KEY);
      if (typeof window !== "undefined" && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase") || k.startsWith("sipeta"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      }
    } catch {
      // Ignore storage errors
    }

    // 3. Bersihkan cookies browser seketika agar request navigasi & middleware berikutnya tidak membawa token usang
    if (typeof document !== "undefined") {
      try {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name.startsWith("sb-") || name.includes("supabase") || name.startsWith("sipeta")) {
            document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            const hostname = window.location.hostname;
            document.cookie = `${name}=; path=/; domain=${hostname}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
          }
        }
      } catch {
        // Ignore cookie errors
      }
    }

    if (wasSupabase) {
      // Jalankan pencabutan sesi server tanpa menahan UI lebih dari 200ms
      try {
        void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        await Promise.race([
          authService.logout(),
          new Promise((resolve) => setTimeout(resolve, 200)),
        ]);
      } catch (err) {
        console.warn("Logout error:", err);
      }
    }
    return { ok: true, message: "Berhasil keluar dari sesi." };
  };

  const logoutSupabase = logout;

  const enterDemoMode = (demoRole?: UserRole) => {
    const targetRole = demoRole ?? "wali";
    if (santriList.length === 0) {
      setUsers(INITIAL_USERS);
      setRekeningResmi(INITIAL_REKENING);
      setTahunAjaranList(INITIAL_TAHUN_AJARAN);
      setKelasList(INITIAL_KELAS);
      setKamarList(INITIAL_KAMAR);
      kelasListRef.current = INITIAL_KELAS;
      kamarListRef.current = INITIAL_KAMAR;
      setSantriList(INITIAL_SANTRI);
      setWaliList(INITIAL_WALI_SANTRI);
      setRiwayatPenempatan(INITIAL_RIWAYAT_PENEMPATAN);
      setJenisPembayaranList(INITIAL_JENIS_PEMBAYARAN);
      setTagihanList(INITIAL_TAGIHAN);
      setTransaksiPembayaranList(INITIAL_TRANSAKSI_PEMBAYARAN);
      setPengajuanUangSakuList(INITIAL_PENGAJUAN_UANG_SAKU);
      setMutasiUangSakuList(INITIAL_MUTASI_UANG_SAKU);
      setMengajiList(INITIAL_PERKEMBANGAN_MENGAJI);
      setTahfidzList(INITIAL_SETORAN_TAHFIDZ);
      setPrestasiList(INITIAL_PRESTASI);
      setMasterPelanggaranList(INITIAL_MASTER_PELANGGARAN);
      setKedisiplinanList(INITIAL_KEDISIPLINAN);
      setPengumumanList(INITIAL_PENGUMUMAN);
      setNotifikasiList(INITIAL_NOTIFIKASI);
      setAuditLogs(INITIAL_AUDIT_LOGS);
    }
    const sourceUsers = users.length > 0 ? users : INITIAL_USERS;
    const demoUser = sourceUsers.find((u) => u.role === targetRole) ?? INITIAL_USERS[4]!;
    setCurrentUser(demoUser);
    setCurrentUserId(demoUser.id);
    setIsAuthenticated(true);
    setAuthMode("demo");
  };

  const exitDemoMode = () => {
    setCurrentUser(null);
    setCurrentUserId(null);
    setIsAuthenticated(false);
    setAuthMode("unauthenticated");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { }
  };

  // Hydrate data operasional dari localStorage saat client mount (HANYA saat offline/demo tanpa Supabase)
  useEffect(() => {
    try {
      if (isSupabaseConfigured()) {
        // Pada mode Supabase aktif, bersihkan cache data lama agar tidak merusak Single Source of Truth produksi
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem("sipeta_profil_pesantren");
        }
      } else {
        if (typeof window !== "undefined" && window.localStorage) {
          const savedProfil = window.localStorage.getItem("sipeta_profil_pesantren");
          if (savedProfil) {
            try {
              const parsedProfil = JSON.parse(savedProfil);
              if (parsedProfil && typeof parsedProfil === "object") {
                setProfilPesantren((prev) => ({ ...prev, ...parsedProfil }));
              }
            } catch { }
          }
        }
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.users)) setUsers(parsed.users);
          if (parsed.rekeningResmi && typeof parsed.rekeningResmi === "object") {
            setRekeningResmi((prev) => ({ ...prev, ...parsed.rekeningResmi }));
          }
          if (Array.isArray(parsed.kelasList)) setKelasList(parsed.kelasList);
          if (Array.isArray(parsed.kamarList)) setKamarList(parsed.kamarList);
          if (Array.isArray(parsed.santriList)) setSantriList(parsed.santriList);
          if (Array.isArray(parsed.waliList)) setWaliList(parsed.waliList);
          if (Array.isArray(parsed.riwayatPenempatan)) setRiwayatPenempatan(parsed.riwayatPenempatan);
          if (Array.isArray(parsed.jenisPembayaranList)) setJenisPembayaranList(parsed.jenisPembayaranList);
          if (Array.isArray(parsed.tagihanList)) setTagihanList(parsed.tagihanList);
          if (Array.isArray(parsed.riwayatPenyesuaianTagihan))
            setRiwayatPenyesuaianTagihan(parsed.riwayatPenyesuaianTagihan);
          if (Array.isArray(parsed.keranjang)) setKeranjang(parsed.keranjang);
          if (Array.isArray(parsed.transaksiPembayaranList))
            setTransaksiPembayaranList(parsed.transaksiPembayaranList);
          if (Array.isArray(parsed.pengajuanUangSakuList)) setPengajuanUangSakuList(parsed.pengajuanUangSakuList);
          if (Array.isArray(parsed.mutasiUangSakuList)) setMutasiUangSakuList(parsed.mutasiUangSakuList);
          if (Array.isArray(parsed.mengajiList)) setMengajiList(parsed.mengajiList);
          if (Array.isArray(parsed.tahfidzList)) setTahfidzList(parsed.tahfidzList);
          if (Array.isArray(parsed.prestasiList)) setPrestasiList(parsed.prestasiList);
          if (Array.isArray(parsed.kedisiplinanList)) setKedisiplinanList(parsed.kedisiplinanList);
          if (Array.isArray(parsed.pengumumanList)) setPengumumanList(parsed.pengumumanList);
          if (Array.isArray(parsed.notifikasiList)) setNotifikasiList(parsed.notifikasiList);
          if (Array.isArray(parsed.auditLogs)) setAuditLogs(parsed.auditLogs);
        }
      }
    } catch {
      // Gunakan initial state jika gagal membaca localStorage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    // Hanya simpan data jika hydrated dan mode demo aktif (tidak menyimpan data saat di Supabase atau unauthenticated)
    if (!hydrated || authMode !== "demo" || dataSource === "supabase") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          users,
          rekeningResmi,
          kelasList,
          kamarList,
          santriList,
          waliList,
          riwayatPenempatan,
          jenisPembayaranList,
          tagihanList,
          riwayatPenyesuaianTagihan,
          keranjang,
          transaksiPembayaranList,
          pengajuanUangSakuList,
          mutasiUangSakuList,
          mengajiList,
          tahfidzList,
          prestasiList,
          kedisiplinanList,
          pengumumanList,
          notifikasiList,
          auditLogs,
        })
      );
    } catch {
      // Ignore quota errors
    }
  }, [
    hydrated,
    authMode,
    dataSource,
    users,
    rekeningResmi,
    kelasList,
    kamarList,
    santriList,
    waliList,
    riwayatPenempatan,
    jenisPembayaranList,
    tagihanList,
    riwayatPenyesuaianTagihan,
    keranjang,
    transaksiPembayaranList,
    pengajuanUangSakuList,
    mutasiUangSakuList,
    mengajiList,
    tahfidzList,
    prestasiList,
    kedisiplinanList,
    pengumumanList,
    notifikasiList,
    auditLogs,
  ]);

  const appendAuditLog = (
    aktivitas: string,
    jenis_objek: string,
    objek_id: string,
    data_sesudah?: Record<string, unknown>,
    alasan_perubahan?: string,
    data_sebelum?: Record<string, unknown>
  ) => {
    if (!currentUser) return;
    const newLog: AuditLogItem = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: currentUser.id,
      user_nama: currentUser.nama_lengkap,
      user_role: currentUser.role,
      aktivitas,
      jenis_objek,
      objek_id,
      data_sebelum,
      data_sesudah,
      alasan_perubahan,
      waktu: new Date().toISOString(),
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const notifyWaliOfSantri = (
    santriId: string,
    jenis_notifikasi: string,
    judul: string,
    pesan: string,
    tautan: string
  ) => {
    const wali = waliList.find((w) => w.santri_id === santriId);
    if (!wali) return;
    const item: NotifikasiItem = {
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: wali.user_id,
      santri_id: santriId,
      jenis_notifikasi,
      judul,
      pesan,
      tautan,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setNotifikasiList((prev) => [item, ...prev]);
  };

  const switchActiveUser = (userId: string) => {
    if (authMode === "supabase") {
      console.warn("Penggantian role langsung dinonaktifkan pada sesi Supabase Auth.");
      return;
    }
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    setCurrentUserId(target.id);
    setCurrentUser(target);
    setIsAuthenticated(true);
    setAuthMode("demo");
    setKeranjang([]);
  };

  const resetDemoData = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { }
    setUsers(INITIAL_USERS);
    setRekeningResmi(INITIAL_REKENING);
    setKelasList(INITIAL_KELAS);
    setKamarList(INITIAL_KAMAR);
    setSantriList(INITIAL_SANTRI);
    setWaliList(INITIAL_WALI_SANTRI);
    setRiwayatPenempatan(INITIAL_RIWAYAT_PENEMPATAN);
    setJenisPembayaranList(INITIAL_JENIS_PEMBAYARAN);
    setTagihanList(INITIAL_TAGIHAN);
    setRiwayatPenyesuaianTagihan([]);
    setKeranjang([]);
    setTransaksiPembayaranList(INITIAL_TRANSAKSI_PEMBAYARAN);
    setPengajuanUangSakuList(INITIAL_PENGAJUAN_UANG_SAKU);
    setMutasiUangSakuList(INITIAL_MUTASI_UANG_SAKU);
    setMengajiList(INITIAL_PERKEMBANGAN_MENGAJI);
    setTahfidzList(INITIAL_SETORAN_TAHFIDZ);
    setPrestasiList(INITIAL_PRESTASI);
    setKedisiplinanList(INITIAL_KEDISIPLINAN);
    setPengumumanList(INITIAL_PENGUMUMAN);
    setNotifikasiList(INITIAL_NOTIFIKASI);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    if (authMode === "demo") {
      const defaultDemo = INITIAL_USERS[4]!;
      setCurrentUser(defaultDemo);
      setCurrentUserId(defaultDemo.id);
    }
  };

  const getSaldoSantri = (santriId: string): SaldoUangSaku => {
    return calculatePocketMoneyLedger(santriId, mutasiUangSakuList);
  };

  // ============================================================================
  // SUPERADMIN ACTIONS
  // ============================================================================

  const createUserAccount: SipetaContextValue["createUserAccount"] = async (payload) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang dapat membuat akun pengguna." };
    }

    const cleanNama = (payload.nama_lengkap ?? "").trim();
    if (!cleanNama || cleanNama.length < 3) {
      return { ok: false, message: "Nama lengkap minimal 3 karakter." };
    }

    const rawUser = payload.username ?? "";
    const cleanUser = normalizeUsername(rawUser);
    if (!isValidUsername(cleanUser)) {
      return { ok: false, message: "Username harus 3-30 karakter alfanumerik (huruf kecil, angka, titik, strip, garis bawah)." };
    }

    const finalEmail = payload.email
      ? payload.email.trim().toLowerCase()
      : (cleanUser ? usernameToInternalEmail(cleanUser) : "");

    // Validasi lokal untuk mode demo atau pre-check yang aman dari undefined
    if (cleanUser && users.some((u) => u.username && u.username.toLowerCase() === cleanUser.toLowerCase())) {
      return { ok: false, message: `Username '${cleanUser}' sudah digunakan oleh akun lain.` };
    }
    if (finalEmail && users.some((u) => u.email && u.email.toLowerCase() === finalEmail.toLowerCase())) {
      return { ok: false, message: "Email / Username sudah digunakan oleh akun lain." };
    }

    if (payload.role === "wali" && payload.santri_id) {
      if (users.some((u) => u.role === "wali" && u.santri_id === payload.santri_id)) {
        return {
          ok: false,
          message:
            "Santri tersebut sudah memiliki akun Orang Tua/Wali aktif. Sesuai kebijakan pesantren: 1 Akun Orang Tua untuk 1 Santri.",
        };
      }
    }

    // Jika sedang dalam mode Supabase terhubung
    if (authMode === "supabase") {
      const res = await authService.createUserAccount({
        nama_lengkap: cleanNama,
        username: cleanUser,
        password: payload.password ?? "AbuManshur@123",
        no_telepon: (payload.no_telepon ?? "").trim() || "-",
        role: payload.role,
        santri_id: payload.santri_id,
      });

      if (res.ok) {
        if (res.user) {
          const userObj: UserProfile = {
            id: res.user.id,
            nama_lengkap: res.user.nama_lengkap || cleanNama,
            username: res.user.username || cleanUser,
            email: res.user.email || finalEmail,
            no_telepon: res.user.no_telepon || (payload.no_telepon ?? "").trim() || "-",
            role: (res.user.role as UserRole) || payload.role,
            is_active: res.user.is_active ?? true,
            santri_id: res.user.santri_id || payload.santri_id,
            must_change_password: res.user.must_change_password ?? false,
            created_at: res.user.created_at || new Date().toISOString(),
          };
          setUsers((prev) => {
            const filtered = prev.filter((u) => u.id !== userObj.id && u.username !== userObj.username);
            return [...filtered, userObj];
          });
        }
        // Sinkronisasi daftar akun dan log audit di latar belakang (state akun sudah diperbarui di atas)
        void refreshFromSupabase().catch(() => {});
      }
      return { ok: res.ok, message: res.message };
    }

    // Mode Demo / Standalone
    const newUser: UserProfile = {
      id: `usr-${Date.now()}`,
      nama_lengkap: cleanNama,
      username: cleanUser,
      email: finalEmail,
      no_telepon: (payload.no_telepon ?? "").trim() || "-",
      role: payload.role,
      is_active: true,
      santri_id: payload.role === "wali" ? payload.santri_id : undefined,
      created_at: new Date().toISOString(),
    };

    setUsers((prev) => [...prev, newUser]);
    appendAuditLog("BUAT_AKUN_PENGGUNA", "profiles", newUser.id, {
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      santri_id: newUser.santri_id,
    });

    return {
      ok: true,
      message: `Akun ${newUser.nama_lengkap} (${newUser.role}) dengan username '${newUser.username ?? newUser.email}' berhasil dibuat.`,
    };
  };

  const toggleUserActive: SipetaContextValue["toggleUserActive"] = async (userId) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang dapat mengubah status akun." };
    }
    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "Akun tidak ditemukan." };
    if (target.id === currentUser.id) {
      return { ok: false, message: "Tidak dapat menonaktifkan akun Superadmin yang sedang aktif." };
    }

    const nextActive = !target.is_active;

    if (authMode === "supabase") {
      const res = await authService.toggleUserActive(userId, nextActive);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: nextActive } : u))
        );
      }
      return res;
    }

    // Demo Mode
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_active: nextActive } : u))
    );
    appendAuditLog(
      nextActive ? "AKTIFKAN_AKUN" : "NONAKTIFKAN_AKUN",
      "profiles",
      userId,
      { is_active: nextActive },
      undefined,
      { is_active: target.is_active }
    );
    return {
      ok: true,
      message: `Akun ${target.nama_lengkap} berhasil ${nextActive ? "diaktifkan" : "dinonaktifkan"}.`,
    };
  };

  const resetUserPassword: SipetaContextValue["resetUserPassword"] = async (
    userId,
    newPassword,
    mustChangePassword = true
  ) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang berwenang mengatur ulang kata sandi." };
    }
    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      return { ok: false, message: pwdCheck.message ?? "Kata sandi tidak memenuhi kriteria keamanan." };
    }

    if (authMode === "supabase") {
      const res = await authService.resetUserPassword(userId, newPassword, mustChangePassword);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, must_change_password: mustChangePassword } : u))
        );
      }
      return res;
    }

    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "Pengguna tidak ditemukan." };

    appendAuditLog("RESET_USER_PASSWORD", "profiles", userId, {
      target_user: target.username ?? target.email,
    });
    return {
      ok: true,
      message: `Kata sandi akun ${target.nama_lengkap} (${target.username ?? target.email}) berhasil diatur ulang.`,
    };
  };

  const manageUserAccount: SipetaContextValue["manageUserAccount"] = async (userId, payload) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang berwenang mengelola akun pengguna." };
    }
    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "Akun pengguna tidak ditemukan." };

    if (payload.new_password && payload.new_password.trim() !== "") {
      const pwdCheck = validatePasswordStrength(payload.new_password);
      if (!pwdCheck.valid) {
        return { ok: false, message: pwdCheck.message || "Kata sandi tidak valid." };
      }
    }

    if (payload.username && payload.username.trim() !== "") {
      const cleanUser = normalizeUsername(payload.username);
      if (!isValidUsername(cleanUser)) {
        return {
          ok: false,
          message:
            "Username hanya boleh berisi huruf kecil, angka, titik, strip, garis bawah (3-30 karakter).",
        };
      }
      const isDuplicate = users.some(
        (u) => u.id !== userId && u.username && u.username.toLowerCase() === cleanUser.toLowerCase()
      );
      if (isDuplicate) {
        return { ok: false, message: `Username '${cleanUser}' sudah digunakan oleh akun lain.` };
      }
    }

    if (authMode === "supabase") {
      const res = await authService.manageUserAccount(userId, payload);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id !== userId) return u;
            const updated = { ...u };
            if (payload.nama_lengkap) updated.nama_lengkap = payload.nama_lengkap;
            if (payload.username) {
              updated.username = normalizeUsername(payload.username);
              if (u.role !== "superadmin") {
                updated.email = usernameToInternalEmail(updated.username);
              }
            }
            if (payload.no_telepon !== undefined) updated.no_telepon = payload.no_telepon;
            if (payload.role) updated.role = payload.role;
            if (payload.is_active !== undefined) updated.is_active = payload.is_active;
            if (payload.must_change_password !== undefined) updated.must_change_password = payload.must_change_password;
            return updated;
          })
        );

        if (currentUser && currentUser.id === userId) {
          setCurrentUser((prev) =>
            prev
              ? {
                ...prev,
                nama_lengkap: payload.nama_lengkap ?? prev.nama_lengkap,
                no_telepon: payload.no_telepon !== undefined ? payload.no_telepon : prev.no_telepon,
                role: payload.role ?? prev.role,
                is_active: payload.is_active !== undefined ? payload.is_active : prev.is_active,
              }
              : null
          );
        }

        // Segarkan data lengkap dari Supabase di latar belakang
        void refreshFromSupabase().catch(() => {});
      }
      return res;
    }

    // Mode Demo
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u;
        const updated = { ...u };
        if (payload.nama_lengkap) updated.nama_lengkap = payload.nama_lengkap;
        if (payload.username) {
          updated.username = normalizeUsername(payload.username);
          if (u.role !== "superadmin") {
            updated.email = usernameToInternalEmail(updated.username);
          }
        }
        if (payload.no_telepon !== undefined) updated.no_telepon = payload.no_telepon;
        if (payload.role) updated.role = payload.role;
        if (payload.is_active !== undefined) updated.is_active = payload.is_active;
        if (payload.must_change_password !== undefined) updated.must_change_password = payload.must_change_password;
        return updated;
      })
    );

    if (currentUser && currentUser.id === userId) {
      setCurrentUser((prev) =>
        prev
          ? {
            ...prev,
            nama_lengkap: payload.nama_lengkap ?? prev.nama_lengkap,
            no_telepon: payload.no_telepon !== undefined ? payload.no_telepon : prev.no_telepon,
            role: payload.role ?? prev.role,
            is_active: payload.is_active !== undefined ? payload.is_active : prev.is_active,
          }
          : null
      );
    }

    appendAuditLog(
      "MANAGE_USER_ACCOUNT",
      "profiles",
      userId,
      {
        nama_lengkap: payload.nama_lengkap ?? target.nama_lengkap,
        username: payload.username ?? target.username,
        role: payload.role ?? target.role,
        is_active: payload.is_active ?? target.is_active,
        password_diubah: !!payload.new_password,
      },
      "Pembaruan informasi akun oleh Superadmin",
      {
        nama_lengkap: target.nama_lengkap,
        username: target.username,
        role: target.role,
        is_active: target.is_active,
      }
    );

    return { ok: true, message: "Informasi akun berhasil diperbarui." };
  };

  const updateUserProfile: SipetaContextValue["updateUserProfile"] = async (userId, data) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang berwenang memperbarui profil akun." };
    }
    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "Akun tidak ditemukan." };

    if (authMode === "supabase") {
      const res = await authService.updateUserProfile(userId, data);
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...data } : u))
        );
      }
      return res;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...data } : u))
    );
    appendAuditLog("UPDATE_USER_PROFILE", "profiles", userId, data, undefined, {
      nama_lengkap: target.nama_lengkap,
      role: target.role,
    });
    return { ok: true, message: `Profil ${target.nama_lengkap} berhasil diperbarui.` };
  };

  const deleteUserAccount: SipetaContextValue["deleteUserAccount"] = async (userId) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang berwenang menghapus akun pengguna." };
    }

    if (currentUser.id === userId || (currentUser.username && currentUser.username === userId)) {
      return { ok: false, message: "Keamanan: Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif." };
    }

    const target = users.find((u) => u.id === userId || u.username === userId);

    if (target?.role === "superadmin") {
      const superadminCount = users.filter((u) => u.role === "superadmin").length;
      if (superadminCount <= 1) {
        return { ok: false, message: "Akun Superadmin terakhir tidak boleh dihapus demi keamanan sistem." };
      }
    }

    if (authMode === "supabase") {
      const res = await authService.deleteUserAccount(userId);
      if (res.ok) {
        if (res.actionTaken === "DEACTIVATED") {
          setUsers((prev) => prev.map((u) => (u.id === userId || u.id === target?.id ? { ...u, is_active: false } : u)));
        } else {
          setUsers((prev) => prev.filter((u) => u.id !== userId && u.id !== target?.id && u.username !== userId));
        }
        void refreshFromSupabase().catch(() => {});
      }
      return res;
    }

    if (!target) {
      return { ok: false, message: "Akun pengguna tidak ditemukan." };
    }

    // Mode Demo: periksa relasi pembayaran atau transaksi
    const hasHistory =
      transaksiPembayaranList.some(
        (t) =>
          t.wali_user_id === userId ||
          (t.verified_by_nama && target?.nama_lengkap && t.verified_by_nama.toLowerCase().includes(target.nama_lengkap.toLowerCase()))
      ) ||
      mutasiUangSakuList.some((m) => m.petugas_nama && target?.nama_lengkap && m.petugas_nama.toLowerCase().includes(target.nama_lengkap.toLowerCase()));

    if (hasHistory) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_active: false } : u)));
      appendAuditLog("DEACTIVATE_USER_SAFE", "profiles", userId, { is_active: false }, "Penonaktifan akun dengan riwayat transaksi");
      return {
        ok: true,
        message: `Akun ${target.nama_lengkap} memiliki riwayat transaksi/aktivitas penting. Akun dinonaktifkan secara aman (soft delete) untuk menjaga integritas data.`,
      };
    }

    setUsers((prev) => prev.filter((u) => u.id !== userId));
    if (target.role === "wali") {
      setWaliList((prev) => prev.filter((w) => w.user_id !== userId));
    }

    appendAuditLog("DELETE_USER_PERMANENT", "profiles", userId, undefined, `Penghapusan akun resmi oleh Superadmin (${target.nama_lengkap})`, {
      nama_lengkap: target.nama_lengkap,
      username: target.username,
      email: target.email,
      role: target.role,
    });

    return { ok: true, message: `Akun ${target.nama_lengkap} berhasil dihapus dari sistem.` };
  };

  const deleteUserAccountBatch: SipetaContextValue["deleteUserAccountBatch"] = async (userIds) => {
    if (!currentUser || currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang berwenang menghapus akun pengguna." };
    }
    if (!userIds || userIds.length === 0) {
      return { ok: false, message: "Pilih setidaknya satu akun untuk dihapus." };
    }

    if (authMode === "supabase") {
      const res = await authService.deleteUserAccountBatch(userIds);
      if (res.ok && res.results) {
        const deletedIds = res.results.filter((r) => r.status === "DELETED").map((r) => r.id);
        const deactivatedIds = res.results.filter((r) => r.status === "DEACTIVATED").map((r) => r.id);
        setUsers((prev) =>
          prev
            .filter((u) => !deletedIds.includes(u.id) && !userIds.includes(u.id) && !(u.username && userIds.includes(u.username)))
            .map((u) => (deactivatedIds.includes(u.id) || (u.username && userIds.includes(u.username) && deactivatedIds.length > 0) ? { ...u, is_active: false } : u))
        );
        void refreshFromSupabase().catch(() => {});
      }
      return res;
    }

    // Mode Demo Batch Execution
    const results: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }> = [];
    let deleted = 0;
    let deactivated = 0;
    let skipped = 0;

    for (const uid of userIds) {
      const u = users.find((x) => x.id === uid);
      if (!u) continue;
      if (uid === currentUser.id) {
        skipped++;
        results.push({ id: uid, nama_lengkap: u.nama_lengkap, status: "SKIPPED", message: "Tidak dapat menghapus akun sendiri saat sedang aktif." });
        continue;
      }
      if (u.role === "superadmin" && (u.email === "sipetaabumanshur@gmail.com" || u.username === "superadmin")) {
        skipped++;
        results.push({ id: uid, nama_lengkap: u.nama_lengkap, status: "SKIPPED", message: "Akun Superadmin utama pesantren dilindungi sistem." });
        continue;
      }

      const hasHistory =
        transaksiPembayaranList.some((t) => t.wali_user_id === uid) ||
        mutasiUangSakuList.some((m) => m.petugas_nama && u.nama_lengkap && m.petugas_nama.toLowerCase().includes(u.nama_lengkap.toLowerCase()));

      if (hasHistory) {
        deactivated++;
        setUsers((prev) => prev.map((x) => (x.id === uid ? { ...x, is_active: false } : x)));
        results.push({ id: uid, nama_lengkap: u.nama_lengkap, status: "DEACTIVATED", actionTaken: "DEACTIVATED", message: "Dinonaktifkan aman karena memiliki riwayat penting." });
      } else {
        deleted++;
        setUsers((prev) => prev.filter((x) => x.id !== uid));
        results.push({ id: uid, nama_lengkap: u.nama_lengkap, status: "DELETED", actionTaken: "DELETED", message: "Berhasil dihapus permanen dari sistem." });
      }
    }

    return {
      ok: true,
      message: `Proses penghapusan massal selesai: ${deleted} dihapus, ${deactivated} dinonaktifkan, ${skipped} dilewati.`,
      results,
      summary: { total: userIds.length, deleted, deactivated, skipped, failed: 0 },
    };
  };

  const updateRekeningResmi: SipetaContextValue["updateRekeningResmi"] = (payload) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Admin Administrasi dan Superadmin yang berwenang memperbarui rekening resmi pesantren.",
      };
    }

    const cleanNoRek = payload.nomor_rekening.trim();
    if (cleanNoRek.length < 8) {
      return { ok: false, message: "Nomor rekening tidak valid. Minimal 8 digit/karakter." };
    }

    const baseRek = rekeningResmi ?? INITIAL_REKENING;
    const oldRek = { ...baseRek };
    const updated: RekeningPesantren = {
      ...baseRek,
      ...payload,
      nomor_rekening: cleanNoRek,
      updated_at: new Date().toISOString(),
    };
    setRekeningResmi(updated);
    if (authMode === "supabase" || isSupabaseConfigured()) {
      administrasiService
        .updateRekeningResmi({
          nama_bank: updated.nama_bank,
          kode_bank: updated.kode_bank,
          nomor_rekening: updated.nomor_rekening,
          atas_nama: updated.atas_nama,
          catatan_instruksi: updated.catatan_instruksi,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }
    appendAuditLog(
      "UPDATE_REKENING_RESMI",
      "rekening_pesantren",
      rekeningResmi?.id || "rek-01",
      { ...updated },
      `Pembaruan konfigurasi rekening resmi pesantren oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`,
      { ...oldRek }
    );
    return { ok: true, message: "Rekening resmi pesantren berhasil diperbarui." };
  };

  const createRekening: SipetaContextValue["createRekening"] = async (payload) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang menambah rekening resmi pesantren.",
      };
    }
    const cleanNoRek = payload.nomor_rekening.trim();
    if (cleanNoRek.length < 5) {
      return { ok: false, message: "Nomor rekening tidak valid. Minimal 5 digit." };
    }
    if (!payload.nama_bank.trim() || !payload.atas_nama.trim()) {
      return { ok: false, message: "Nama bank dan atas nama wajib diisi." };
    }

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const res = await administrasiService.createRekening({
        nama_bank: payload.nama_bank.trim(),
        kode_bank: payload.kode_bank?.trim() || "451",
        nomor_rekening: cleanNoRek,
        atas_nama: payload.atas_nama.trim(),
        catatan_instruksi: payload.catatan_instruksi?.trim() || "",
      });

      if (!res.ok) {
        return { ok: false, message: res.message };
      }

      if (res.data) {
        setRekeningList((prev) => [res.data!, ...prev.filter((r) => r.id !== res.data!.id)]);
      }
      await refreshRekeningOnly();

      appendAuditLog(
        "CREATE_REKENING_RESMI",
        "rekening_pesantren",
        res.data?.id || `rek-${Date.now()}`,
        { ...payload, nomor_rekening: cleanNoRek },
        `Penambahan rekening informasi pesantren baru (${payload.nama_bank} - ${cleanNoRek}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`
      );

      return { ok: true, message: res.message || "Rekening informasi pesantren berhasil ditambahkan." };
    }

    const newId = `rek-${Date.now()}`;
    const newRek: RekeningPesantren = {
      id: newId,
      nama_bank: payload.nama_bank.trim(),
      kode_bank: payload.kode_bank?.trim() || "451",
      nomor_rekening: cleanNoRek,
      atas_nama: payload.atas_nama.trim(),
      catatan_instruksi: payload.catatan_instruksi?.trim() || "",
      is_active: false,
      is_utama: false,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    setRekeningList((prev) => [newRek, ...prev]);

    return { ok: true, message: "Rekening informasi pesantren berhasil ditambahkan (Demo Standalone)." };
  };

  const updateRekening: SipetaContextValue["updateRekening"] = async (id, payload) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang mengedit rekening resmi pesantren.",
      };
    }

    const existing = rekeningList.find((r) => r.id === id);
    if (!existing) {
      return { ok: false, message: "Rekening tidak ditemukan." };
    }

    if (payload.nomor_rekening && payload.nomor_rekening.trim().length < 5) {
      return { ok: false, message: "Nomor rekening tidak valid. Minimal 5 digit." };
    }

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const res = await administrasiService.updateRekeningById(id, payload);
      if (!res.ok) return { ok: false, message: res.message };

      const confirmedUpdated: RekeningPesantren = res.data
        ? { ...existing, ...res.data }
        : { ...existing, ...payload, updated_at: new Date().toISOString() };
      setRekeningList((prev) => prev.map((r) => (r.id === id ? confirmedUpdated : r)));
      if (confirmedUpdated.is_active) {
        setRekeningResmi(confirmedUpdated);
      }
      await refreshRekeningOnly();

      appendAuditLog(
        "UPDATE_REKENING_RESMI",
        "rekening_pesantren",
        id,
        { ...payload },
        `Pembaruan data rekening (${existing.nama_bank} - ${existing.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`,
        { ...existing }
      );

      return { ok: true, message: res.message || "Rekening berhasil diperbarui." };
    }

    const updated: RekeningPesantren = {
      ...existing,
      ...payload,
      updated_at: new Date().toISOString(),
    };

    setRekeningList((prev) => prev.map((r) => (r.id === id ? updated : r)));
    if (updated.is_active) {
      setRekeningResmi(updated);
    }

    return { ok: true, message: "Rekening berhasil diperbarui (Demo Standalone)." };
  };

  const activateRekening: SipetaContextValue["activateRekening"] = async (id, alasan) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang mengaktifkan rekening resmi pesantren.",
      };
    }

    const target = rekeningList.find((r) => r.id === id);
    if (!target) return { ok: false, message: "Rekening target tidak ditemukan." };

    const previousActive = rekeningList.find((r) => r.is_active && r.id !== id);
    const isGanti = !!previousActive;
    const aktivitas = isGanti ? "GANTI_REKENING_UTAMA" : "AKTIFKAN_REKENING_PESANTREN";

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const res = await administrasiService.activateRekening(id, alasan);
      if (!res.ok) {
        return { ok: false, message: res.message || "Gagal mengaktifkan rekening utama." };
      }

      await refreshRekeningOnly();

      appendAuditLog(
        aktivitas,
        "rekening_pesantren",
        id,
        {
          tipe_aksi: isGanti ? "PERGANTIAN_REKENING_UTAMA" : "AKTIVASI_REKENING_PERDANA",
          rekening_lama: previousActive ? { ...previousActive, is_active: false } : null,
          rekening_baru: { ...target, is_active: true },
        },
        alasan ||
          (isGanti
            ? `Pergantian rekening utama dari ${previousActive?.nama_bank} (${previousActive?.nomor_rekening}) ke ${target.nama_bank} (${target.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`
            : `Pengaktifan rekening utama (${target.nama_bank} - ${target.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`),
        {
          tipe_aksi: isGanti ? "PERGANTIAN_REKENING_UTAMA" : "AKTIVASI_REKENING_PERDANA",
          rekening_lama: previousActive ? { ...previousActive, is_active: true } : null,
          rekening_baru: { ...target, is_active: false },
        }
      );

      return { ok: true, message: res.message || "Rekening berhasil diaktifkan sebagai rekening utama." };
    }

    // Demo Standalone Mode
    setRekeningList((prev) =>
      prev.map((r) => ({
        ...r,
        is_active: r.id === id,
      }))
    );
    setRekeningResmi({ ...target, is_active: true });

    appendAuditLog(
      aktivitas,
      "rekening_pesantren",
      id,
      {
        tipe_aksi: isGanti ? "PERGANTIAN_REKENING_UTAMA" : "AKTIVASI_REKENING_PERDANA",
        rekening_lama: previousActive ? { ...previousActive, is_active: false } : null,
        rekening_baru: { ...target, is_active: true },
      },
      alasan ||
        (isGanti
          ? `[Demo] Pergantian rekening utama dari ${previousActive?.nama_bank} (${previousActive?.nomor_rekening}) ke ${target.nama_bank} (${target.nomor_rekening})`
          : `[Demo] Pengaktifan rekening utama (${target.nama_bank} - ${target.nomor_rekening})`),
      {
        tipe_aksi: isGanti ? "PERGANTIAN_REKENING_UTAMA" : "AKTIVASI_REKENING_PERDANA",
        rekening_lama: previousActive ? { ...previousActive, is_active: true } : null,
        rekening_baru: { ...target, is_active: false },
      }
    );

    return { ok: true, message: "Rekening berhasil diaktifkan sebagai rekening utama (Demo Standalone)." };
  };

  const deactivateRekening: SipetaContextValue["deactivateRekening"] = async (id, alasan) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang menonaktifkan rekening resmi pesantren.",
      };
    }

    const target = rekeningList.find((r) => r.id === id);
    if (!target) return { ok: false, message: "Rekening tidak ditemukan." };

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const res = await administrasiService.deactivateRekening(id, alasan);
      if (!res.ok) {
        return { ok: false, message: res.message || "Gagal menonaktifkan rekening." };
      }

      await refreshRekeningOnly();

      appendAuditLog(
        "NONAKTIFKAN_REKENING_PESANTREN",
        "rekening_pesantren",
        id,
        { is_active: false },
        alasan || `Penonaktifan rekening (${target.nama_bank} - ${target.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`,
        { ...target }
      );

      return { ok: true, message: res.message || "Rekening berhasil dinonaktifkan." };
    }

    // Demo Standalone Mode
    setRekeningList((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: false } : r))
    );
    if (rekeningResmi?.id === id) {
      setRekeningResmi(null);
    }

    appendAuditLog(
      "NONAKTIFKAN_REKENING_PESANTREN",
      "rekening_pesantren",
      id,
      { is_active: false },
      alasan || `[Demo] Penonaktifan rekening (${target.nama_bank} - ${target.nomor_rekening})`,
      { ...target }
    );

    return { ok: true, message: "Rekening berhasil dinonaktifkan (Demo Standalone)." };
  };

  const setUtamaRekening: SipetaContextValue["setUtamaRekening"] = async (id, alasan) => {
    return activateRekening(id, alasan);
  };

  const toggleActiveRekening: SipetaContextValue["toggleActiveRekening"] = async (id, isActive, alasan) => {
    const target = rekeningList.find((r) => r.id === id);
    const shouldDeactivate = isActive !== undefined ? !isActive : target?.is_active;
    if (shouldDeactivate) {
      return deactivateRekening(id, alasan);
    } else {
      return activateRekening(id, alasan);
    }
  };

  const deleteRekening: SipetaContextValue["deleteRekening"] = async (id) => {
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Hanya Pengasuh (Admin) dan Superadmin yang berwenang menghapus rekening.",
      };
    }

    const target = rekeningList.find((r) => r.id === id);
    if (!target) return { ok: false, message: "Rekening tidak ditemukan." };

    const hasTransactions = transaksiPembayaranList.some(
      (t) =>
        t.rekening_tujuan_snapshot?.nomor_rekening === target.nomor_rekening ||
        (t as any).rekening_id === id
    );

    if (hasTransactions) {
      return {
        ok: false,
        message: `Rekening ${target.nama_bank} (${target.nomor_rekening}) tidak dapat dihapus karena sudah memiliki riwayat transaksi pembayaran. Silakan gunakan opsi nonaktifkan rekening.`,
      };
    }

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const res = await administrasiService.deleteRekeningById(id);
      if (!res.ok) return { ok: false, message: res.message };

      setRekeningList((prev) => prev.filter((r) => r.id !== id));
      if (rekeningResmi?.id === id) {
        const remaining = rekeningList.filter((r) => r.id !== id);
        setRekeningResmi(remaining.find((r) => r.is_active) ?? null);
      }
      await refreshRekeningOnly();

      appendAuditLog(
        "DELETE_REKENING_RESMI",
        "rekening_pesantren",
        id,
        { id, nama_bank: target.nama_bank, nomor_rekening: target.nomor_rekening },
        `Penghapusan rekening (${target.nama_bank} - ${target.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`
      );

      return { ok: true, message: res.message || "Rekening berhasil dihapus." };
    }

    setRekeningList((prev) => prev.filter((r) => r.id !== id));
    if (rekeningResmi?.id === id) {
      const remaining = rekeningList.filter((r) => r.id !== id);
      setRekeningResmi(remaining.find((r) => r.is_active) ?? null);
    }

    appendAuditLog(
      "DELETE_REKENING_RESMI",
      "rekening_pesantren",
      id,
      { id, nama_bank: target.nama_bank, nomor_rekening: target.nomor_rekening },
      `Penghapusan rekening (${target.nama_bank} - ${target.nomor_rekening}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`
    );

    return { ok: true, message: "Rekening berhasil dihapus." };
  };

  const setActiveTahunAjaran: SipetaContextValue["setActiveTahunAjaran"] = async (id: string) => {
    if (
      !currentUser ||
      (currentUser.role !== "superadmin" && currentUser.role !== "admin" && currentUser.role !== "tu")
    ) {
      return {
        ok: false,
        message:
          "Akses ditolak: Hanya Superadmin, Pengasuh (Admin), atau Tata Usaha yang berwenang mengubah tahun pelajaran aktif.",
      };
    }

    const cleanId = id?.trim();
    if (!cleanId) {
      return { ok: false, message: "ID Tahun Pelajaran wajib dipilih." };
    }

    const targetTa = tahunAjaranList.find((t) => t.id === cleanId);

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const taRes = await administrasiService.setActiveTahunAjaran(cleanId);
      if (!taRes.ok) {
        return { ok: false, message: taRes.message };
      }

      setTahunAjaranList((prev) =>
        prev.map((t) => ({
          ...t,
          is_active: t.id === cleanId,
        }))
      );
      if (targetTa) {
        setProfilPesantren((prev) => ({
          ...prev,
          tahun_pelajaran_aktif: targetTa.nama,
          updated_at: new Date().toISOString(),
          updated_by: currentUser.id,
        }));
      }

      void refreshFromSupabase().catch(() => {});
      return {
        ok: true,
        message:
          taRes.message ||
          `Tahun pelajaran ${targetTa?.nama || ""} berhasil diaktifkan dan disinkronkan di seluruh sistem.`,
      };
    }

    // Mode Demo / Standalone
    if (!targetTa) {
      return { ok: false, message: "Tahun pelajaran tidak ditemukan." };
    }

    setTahunAjaranList((prev) =>
      prev.map((t) => ({
        ...t,
        is_active: t.id === cleanId,
      }))
    );
    setProfilPesantren((prev) => ({
      ...prev,
      tahun_pelajaran_aktif: targetTa.nama,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id,
    }));

    appendAuditLog(
      "SET_ACTIVE_TAHUN_AJARAN",
      "tahun_ajaran",
      cleanId,
      { tahun_pelajaran_aktif: targetTa.nama, is_active: true },
      `Aktivasi Tahun Pelajaran ${targetTa.nama} oleh ${currentUser.nama_lengkap}`
    );

    return {
      ok: true,
      message: `Tahun pelajaran ${targetTa.nama} berhasil diaktifkan.`,
    };
  };

  const updateProfilPesantren: SipetaContextValue["updateProfilPesantren"] = async (payload, activeTahunAjaranId) => {
    if (!currentUser || (currentUser.role !== "tu" && currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return {
        ok: false,
        message: "Hanya Tata Usaha (TU), Pengasuh, atau Superadmin yang berwenang memperbarui profil pesantren.",
      };
    }

    if (payload.nama_resmi !== undefined && !payload.nama_resmi.trim()) {
      return { ok: false, message: "Nama resmi pesantren tidak boleh kosong." };
    }
    if (payload.alamat !== undefined && !payload.alamat.trim()) {
      return { ok: false, message: "Alamat pesantren tidak boleh kosong." };
    }

    // Jika pemanggil meminta pergantian Tahun Pelajaran Aktif, jalankan via setActiveTahunAjaran (RPC atomik) terlebih dahulu
    if (activeTahunAjaranId) {
      const taRes = await setActiveTahunAjaran(activeTahunAjaranId);
      if (!taRes.ok) {
        return taRes;
      }
      if (Object.keys(payload).length === 0) {
        return taRes;
      }
    }

    // Pergantian semester & tahun pelajaran aktif HANYA boleh melalui RPC resmi (setActiveSemester / setActiveTahunAjaran).
    const effectivePayload = { ...payload };
    if (effectivePayload.semester_aktif !== undefined) {
      delete effectivePayload.semester_aktif;
    }
    if (effectivePayload.tahun_pelajaran_aktif !== undefined) {
      delete effectivePayload.tahun_pelajaran_aktif;
    }

    const updatedProfil: ProfilPesantren = {
      ...profilPesantren,
      ...effectivePayload,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id,
    };

    if (authMode === "supabase" || isSupabaseConfigured()) {
      const dbRes = await administrasiService.updateProfilPesantren(effectivePayload);
      if (!dbRes.ok) {
        return { ok: false, message: dbRes.message };
      }
      setProfilPesantren(updatedProfil);
      void refreshFromSupabase().catch(() => {});
    } else {
      setProfilPesantren(updatedProfil);
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("sipeta_profil_pesantren", JSON.stringify(updatedProfil));
        }
      } catch { }
    }

    appendAuditLog(
      "UPDATE_PROFIL_PESANTREN",
      "profil_pesantren",
      updatedProfil.id,
      { ...updatedProfil },
      `Pembaruan profil pesantren (${updatedProfil.tahun_pelajaran_aktif} - ${updatedProfil.semester_aktif}) oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`,
      { ...profilPesantren }
    );

    return { ok: true, message: "Profil pesantren berhasil diperbarui." };
  };

  const setActiveSemester: SipetaContextValue["setActiveSemester"] = async (semester) => {
    // 1. Validasi Hak Akses Role: HANYA Pengasuh (Admin) dan Superadmin
    if (!currentUser || (currentUser.role !== "superadmin" && currentUser.role !== "admin")) {
      return {
        ok: false,
        message: "Akses ditolak: Hanya Pengasuh (Admin) atau Superadmin yang berwenang mengubah semester akademik aktif.",
      };
    }

    // 2. Validasi Nilai Input
    if (semester !== "Ganjil" && semester !== "Genap") {
      return {
        ok: false,
        message: "Semester tidak valid: Nilai yang diizinkan hanya 'Ganjil' atau 'Genap'.",
      };
    }

    // 3. Jika semester sama persis, tidak perlu mutasi
    const prevSemester = profilPesantren.semester_aktif;
    if (prevSemester === semester) {
      return {
        ok: true,
        message: `Semester aktif sudah berada pada status Semester ${semester}.`,
      };
    }

    // 4. Eksekusi RPC rpc_set_active_semester (TIDAK ADA PERUBAHAN OPTIMISTIS & TIDAK ADA FALLBACK UPDATE)
    const dbRes = await administrasiService.setActiveSemester(semester);
    if (!dbRes.ok) {
      // JIKA RPC GAGAL ATAU MIGRATION 016 BELUM DITERAPKAN:
      // - Batalkan perubahan
      // - Jangan ubah state semester
      // - Jangan catat audit log
      // - Jangan simpan ke localStorage
      console.warn("Gagal mengubah semester aktif via RPC:", dbRes.message);
      return {
        ok: false,
        message: dbRes.message,
      };
    }

    // 5. RPC BENAR-BENAR BERHASIL: Perbarui state context & localStorage
    const updatedProfil: ProfilPesantren = {
      ...profilPesantren,
      semester_aktif: semester,
      updated_at: new Date().toISOString(),
      updated_by: currentUser.id,
    };

    setProfilPesantren(updatedProfil);

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("sipeta_profil_pesantren", JSON.stringify(updatedProfil));
      }
    } catch { }

    // 6. Catat audit log HANYA setelah RPC benar-benar berhasil
    appendAuditLog(
      "SET_ACTIVE_SEMESTER",
      "profil_pesantren",
      updatedProfil.id,
      {
        semester_aktif: semester,
        tahun_pelajaran_aktif: updatedProfil.tahun_pelajaran_aktif,
      },
      `Pergantian semester aktif resmi (${prevSemester} -> ${semester}) pada Tahun Pelajaran ${updatedProfil.tahun_pelajaran_aktif} oleh ${currentUser.nama_lengkap} (${getRoleLabel(currentUser.role)})`,
      {
        semester_aktif: prevSemester,
        tahun_pelajaran_aktif: profilPesantren.tahun_pelajaran_aktif,
      }
    );

    // 7. Refresh data dari Supabase Cloud di latar belakang
    if (isSupabaseConfigured()) {
      void refreshFromSupabase().catch((err) => {
        console.warn("Sinkronisasi pasca-perubahan semester:", err);
      });
    }

    return {
      ok: true,
      message: dbRes.message || `Semester aktif berhasil diubah menjadi Semester ${semester} untuk Tahun Pelajaran ${updatedProfil.tahun_pelajaran_aktif}.`,
    };
  };

  const createTahunAjaran: SipetaContextValue["createTahunAjaran"] = async (payload) => {
    if (currentUser && currentUser.role !== "superadmin" && currentUser.role !== "admin") {
      return { ok: false, message: "Akses ditolak: Hanya Admin dan Superadmin yang berwenang menambahkan master tahun pelajaran." };
    }

    const cleanNama = payload.nama.trim();
    if (!cleanNama) {
      return { ok: false, message: "Nama tahun pelajaran wajib diisi." };
    }
    if (!payload.tanggal_mulai || !payload.tanggal_selesai) {
      return { ok: false, message: "Tanggal mulai dan tanggal selesai wajib diisi berdasarkan kalender resmi pesantren." };
    }
    if (new Date(payload.tanggal_selesai) <= new Date(payload.tanggal_mulai)) {
      return { ok: false, message: "Tanggal selesai harus lebih besar daripada tanggal mulai." };
    }

    if (tahunAjaranList.some((t) => t.nama.toLowerCase() === cleanNama.toLowerCase())) {
      return { ok: false, message: `Tahun pelajaran "${cleanNama}" sudah terdaftar.` };
    }

    if (isSupabaseConfigured()) {
      const res = await administrasiService.createTahunAjaran({
        nama: cleanNama,
        tanggal_mulai: payload.tanggal_mulai,
        tanggal_selesai: payload.tanggal_selesai,
      });
      if (res.ok) {
        if (res.data) {
          setTahunAjaranList((prev) => [res.data!, ...prev.filter((t) => t.id !== res.data!.id)]);
        }
        void refreshFromSupabase().catch(() => {});
        return { ok: true, message: res.message };
      }
      return { ok: false, message: res.message };
    }

    const newId = `ta-${cleanNama.replace("/", "-")}-${Date.now()}`;
    const newTa: TahunAjaran = {
      id: newId,
      nama: cleanNama,
      tanggal_mulai: payload.tanggal_mulai,
      tanggal_selesai: payload.tanggal_selesai,
      is_active: false,
    };
    setTahunAjaranList((prev) => [newTa, ...prev]);
    return { ok: true, message: `Tahun pelajaran ${cleanNama} berhasil ditambahkan.` };
  };

  const deleteTahunAjaran: SipetaContextValue["deleteTahunAjaran"] = async (id) => {
    if (currentUser && currentUser.role !== "superadmin") {
      return { ok: false, message: "Akses ditolak: Hanya Superadmin yang berwenang menghapus master tahun pelajaran." };
    }

    const target = tahunAjaranList.find((t) => t.id === id);
    if (target?.is_active) {
      return { ok: false, message: "Akses ditolak: Tidak dapat menghapus tahun pelajaran yang sedang aktif." };
    }

    if (isSupabaseConfigured()) {
      const res = await administrasiService.deleteTahunAjaran(id);
      if (res.ok) {
        setTahunAjaranList((prev) => prev.filter((t) => t.id !== id));
        void refreshFromSupabase().catch(() => {});
        return { ok: true, message: res.message };
      }
      return { ok: false, message: res.message };
    }

    setTahunAjaranList((prev) => prev.filter((t) => t.id !== id));
    return { ok: true, message: "Tahun pelajaran berhasil dihapus." };
  };

  const changePassword: SipetaContextValue["changePassword"] = async (newPassword) => {
    if (!currentUser) {
      return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };
    }

    if (currentUser.username && newPassword.trim() === currentUser.username.trim()) {
      return {
        ok: false,
        message: "Kata sandi baru tidak boleh sama dengan NIS Anda. Gunakan kata sandi pribadi yang unik.",
      };
    }

    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      return {
        ok: false,
        message: pwdCheck.message || "Kata sandi baru tidak memenuhi syarat keamanan (minimal 8 karakter alfanumerik).",
      };
    }

    if (authMode === "supabase") {
      const res = await authService.changePassword(newPassword);
      if (res.ok) {
        setCurrentUser((prev) => (prev ? { ...prev, must_change_password: false } : null));
        setUsers((prev) =>
          prev.map((u) => (u.id === currentUser.id ? { ...u, must_change_password: false } : u))
        );
      }
      return res;
    }

    // Demo Mode
    setCurrentUser((prev) => (prev ? { ...prev, must_change_password: false } : null));
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, must_change_password: false } : u))
    );
    appendAuditLog(
      "GANTI_PASSWORD_PERTAMA_KALI",
      "profiles",
      currentUser.id,
      { must_change_password: false },
      "Wali santri berhasil mengganti kata sandi awal berbasis NIS"
    );

    return { ok: true, message: "Kata sandi Anda berhasil diperbarui. Selamat datang di portal SIPETA!" };
  };

  const updateMyProfile: SipetaContextValue["updateMyProfile"] = async (payload) => {
    if (!currentUser) {
      return { ok: false, message: "Sesi tidak valid. Silakan login kembali." };
    }

    if (payload.nama_lengkap.trim().length < 2) {
      return { ok: false, message: "Nama lengkap minimal 2 karakter." };
    }

    if (payload.new_password && payload.new_password.trim() !== "") {
      if (!payload.old_password || payload.old_password.trim() === "") {
        return { ok: false, message: "Kata sandi lama wajib diisi untuk mengubah kata sandi." };
      }
      const pwdCheck = validatePasswordStrength(payload.new_password);
      if (!pwdCheck.valid) {
        return {
          ok: false,
          message: pwdCheck.message || "Kata sandi baru tidak memenuhi syarat keamanan.",
        };
      }
      if (
        currentUser.username &&
        payload.new_password.trim().toLowerCase() === currentUser.username.trim().toLowerCase()
      ) {
        return {
          ok: false,
          message: "Kata sandi baru tidak boleh sama dengan username/NIS Anda.",
        };
      }
    }

    if (authMode === "supabase") {
      const res = await authService.updateMyProfile(payload);
      if (res.ok) {
        const cleanNama = payload.nama_lengkap.trim();
        const cleanTelepon = payload.no_telepon ? payload.no_telepon.trim() : currentUser.no_telepon;
        setCurrentUser((prev) => (prev ? { ...prev, nama_lengkap: cleanNama, no_telepon: cleanTelepon } : null));
        setUsers((prev) =>
          prev.map((u) => (u.id === currentUser.id ? { ...u, nama_lengkap: cleanNama, no_telepon: cleanTelepon } : u))
        );
        appendAuditLog(
          "UPDATE_PROFIL_MANDIRI",
          "profiles",
          currentUser.id,
          { nama_lengkap: cleanNama, no_telepon: cleanTelepon },
          `Pengguna ${cleanNama} memperbarui data Profil Saya${payload.new_password ? " beserta kata sandi" : ""}`
        );
      }
      return res;
    }

    // Demo Mode
    const cleanNama = payload.nama_lengkap.trim();
    const cleanTelepon = payload.no_telepon ? payload.no_telepon.trim() : currentUser.no_telepon;
    setCurrentUser((prev) => (prev ? { ...prev, nama_lengkap: cleanNama, no_telepon: cleanTelepon } : null));
    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? { ...u, nama_lengkap: cleanNama, no_telepon: cleanTelepon } : u))
    );
    appendAuditLog(
      "UPDATE_PROFIL_MANDIRI",
      "profiles",
      currentUser.id,
      { nama_lengkap: cleanNama, no_telepon: cleanTelepon },
      `Pengguna ${cleanNama} memperbarui profil (Mode Demo)`
    );

    return {
      ok: true,
      message: payload.new_password
        ? "Profil dan kata sandi Anda berhasil diperbarui (Mode Demo)."
        : "Profil Anda berhasil diperbarui (Mode Demo).",
    };
  };

  // ============================================================================
  // ADMIN ACTIONS
  // ============================================================================

  const createSantriWithWali: SipetaContextValue["createSantriWithWali"] = async (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang dapat mendaftarkan santri." };
    }
    const cleanNis = payload.nis.trim();
    if (santriList.some((s) => s.nis === cleanNis)) {
      return { ok: false, message: `NIS ${cleanNis} sudah terdaftar. NIS harus unik.` };
    }

    // Validasi Identitas Keluarga (Ayah, Ibu, Wali Opsional, & Penanggung Jawab Akun)
    const hasStructuredFamily =
      payload.nama_ayah !== undefined ||
      payload.nama_ibu !== undefined ||
      payload.penanggung_jawab !== undefined;

    const cleanNamaAyah = (payload.nama_ayah ?? "").trim();
    const cleanNoHpAyah = (payload.no_hp_ayah ?? "").trim();
    const cleanPekerjaanAyah = (payload.pekerjaan_ayah ?? "").trim();

    const cleanNamaIbu = (payload.nama_ibu ?? "").trim();
    const cleanNoHpIbu = (payload.no_hp_ibu ?? "").trim();
    const cleanPekerjaanIbu = (payload.pekerjaan_ibu ?? "").trim();

    const cleanNamaWaliOps = (payload.nama_wali_opsional ?? "").trim();
    const cleanHubunganWaliOps = (payload.hubungan_wali_detail ?? "").trim();
    const cleanNoHpWaliOps = (payload.no_hp_wali_opsional ?? "").trim();

    if (hasStructuredFamily) {
      if (cleanNamaAyah.length < 3) {
        return { ok: false, message: "Nama lengkap ayah wajib diisi (minimal 3 karakter)." };
      }
      if (cleanNamaIbu.length < 3) {
        return { ok: false, message: "Nama lengkap ibu wajib diisi (minimal 3 karakter)." };
      }

      const anyWaliFilled = Boolean(cleanNamaWaliOps || cleanHubunganWaliOps || cleanNoHpWaliOps);
      const waliComplete =
        cleanNamaWaliOps.length >= 3 &&
        cleanHubunganWaliOps.length >= 2 &&
        cleanNoHpWaliOps.length >= 6;

      if (anyWaliFilled && !waliComplete) {
        return {
          ok: false,
          message:
            "Data Wali belum lengkap: harap isi Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali secara lengkap, atau kosongkan seluruh bagian Data Wali jika wali tidak ada.",
        };
      }

      if (payload.penanggung_jawab === "Wali" && !waliComplete) {
        return {
          ok: false,
          message:
            "Pilihan Penanggung Jawab Akun 'Wali' hanya valid jika Data Wali (Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali) diisi lengkap.",
        };
      }
    } else if (!payload.nama_wali || payload.nama_wali.trim().length < 3) {
      return { ok: false, message: "Identitas orang tua (Data Ayah dan Data Ibu) wajib diisi." };
    }

    const penanggungJawab: "Ayah" | "Ibu" | "Wali" = hasStructuredFamily
      ? payload.penanggung_jawab || "Ayah"
      : payload.hubungan_wali || "Ayah";

    const finalNamaAyah = hasStructuredFamily
      ? cleanNamaAyah
      : penanggungJawab === "Ayah"
      ? (payload.nama_wali ?? "").trim()
      : "-";
    const finalNamaIbu = hasStructuredFamily
      ? cleanNamaIbu
      : penanggungJawab === "Ibu"
      ? (payload.nama_wali ?? "").trim()
      : "-";
    const finalNamaWali = hasStructuredFamily
      ? cleanNamaWaliOps
      : penanggungJawab === "Wali"
      ? (payload.nama_wali ?? "").trim()
      : "";

    const namaPenanggungJawab =
      penanggungJawab === "Ayah"
        ? finalNamaAyah
        : penanggungJawab === "Ibu"
        ? finalNamaIbu
        : finalNamaWali || (payload.nama_wali ?? "").trim() || finalNamaAyah;

    const teleponPenanggungJawab =
      penanggungJawab === "Ayah"
        ? cleanNoHpAyah || cleanNoHpIbu || cleanNoHpWaliOps || (payload.telepon_wali ?? "").trim() || "-"
        : penanggungJawab === "Ibu"
        ? cleanNoHpIbu || cleanNoHpAyah || cleanNoHpWaliOps || (payload.telepon_wali ?? "").trim() || "-"
        : cleanNoHpWaliOps || (payload.telepon_wali ?? "").trim() || cleanNoHpAyah || cleanNoHpIbu || "-";

    // Kebijakan Login Wali: Username = NIS, Password Awal = NIS
    const rawUsernameWali = payload.username_wali ? normalizeUsername(payload.username_wali) : cleanNis;
    const initialPassword = payload.password_wali || cleanNis;

    if (!isValidUsername(rawUsernameWali)) {
      return {
        ok: false,
        message: "Username wali hanya boleh berisi 3-30 karakter (huruf kecil, angka, titik, strip, garis bawah).",
      };
    }

    if (users.some((u) => u.username && u.username.toLowerCase() === rawUsernameWali.toLowerCase())) {
      return { ok: false, message: `Username wali '@${rawUsernameWali}' sudah digunakan. Pilih username lain.` };
    }

    const syntheticWaliEmail = usernameToInternalEmail(rawUsernameWali);
    const emailKontak = payload.email_kontak_wali?.trim() || payload.email_wali?.trim() || "-";

    // Resolusi ID Tahun Pelajaran Aktif (Jangan pernah menggunakan label "2026/2027" atau hardcode "ta-2026-2027" sebagai UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const activeTaRecord = tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0];

    let resolvedTahunAjaranId = activeTaRecord?.id || "";
    if (payload.tahun_ajaran_id && payload.tahun_ajaran_id.trim()) {
      const candidate = payload.tahun_ajaran_id.trim();
      // Tolak penggunaan label tahun pelajaran (mis. "2026/2027") secara langsung sebagai UUID
      if (/^\d{4}\/\d{4}$/.test(candidate)) {
        const matchedByName = tahunAjaranList.find((t) => t.nama.trim() === candidate);
        if (!matchedByName) {
          return {
            ok: false,
            message: `Label tahun pelajaran '${candidate}' tidak boleh digunakan sebagai UUID tahun_ajaran_id.`,
          };
        }
        resolvedTahunAjaranId = matchedByName.id;
      } else {
        resolvedTahunAjaranId = candidate;
      }
    }

    // Pastikan kelas_id dan kamar_id mengacu pada daftar aktif yang valid
    const effectiveKelasId =
      kelasListRef.current.some((k) => k.id === payload.kelas_id)
        ? payload.kelas_id
        : (payload.kelas_id && !payload.kelas_id.startsWith("kls-") ? payload.kelas_id : kelasListRef.current[0]?.id || "");
    const effectiveKamarId =
      kamarListRef.current.some((km) => km.id === payload.kamar_id)
        ? payload.kamar_id
        : (payload.kamar_id && !payload.kamar_id.startsWith("kmr-") ? payload.kamar_id : kamarListRef.current[0]?.id || "");

    if (!effectiveKelasId || !effectiveKamarId) {
      return {
        ok: false,
        message: "Registrasi dihentikan: Kelas awal dan Kamar Asrama wajib dipilih dari master data yang aktif.",
      };
    }

    // Jika Supabase live mode, gunakan endpoint transaksi server atomik dengan rollback otomatis
    if (authMode === "supabase") {
      const supabaseTaUuid = uuidRegex.test(resolvedTahunAjaranId)
        ? resolvedTahunAjaranId
        : tahunAjaranList.find((t) => t.is_active && uuidRegex.test(t.id))?.id ||
        tahunAjaranList.find((t) => uuidRegex.test(t.id))?.id;

      try {
        const res = await fetch("/api/admin-santri", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nis: cleanNis,
            nama_lengkap: payload.nama_lengkap,
            tempat_lahir: payload.tempat_lahir,
            tanggal_lahir: payload.tanggal_lahir,
            jenis_kelamin: payload.jenis_kelamin,
            alamat: payload.alamat,
            tahun_masuk: payload.tahun_masuk,
            tahun_ajaran_id: supabaseTaUuid,
            kelas_id: effectiveKelasId,
            kamar_id: effectiveKamarId,
            ayah: {
              nama_lengkap: finalNamaAyah,
              no_telepon: cleanNoHpAyah,
              pekerjaan: cleanPekerjaanAyah,
            },
            ibu: {
              nama_lengkap: finalNamaIbu,
              no_telepon: cleanNoHpIbu,
              pekerjaan: cleanPekerjaanIbu,
            },
            data_wali: finalNamaWali
              ? {
                  nama_lengkap: finalNamaWali,
                  hubungan: cleanHubunganWaliOps || "Wali",
                  no_telepon: cleanNoHpWaliOps,
                }
              : null,
            penanggung_jawab: penanggungJawab,
            wali: {
              nama_lengkap: namaPenanggungJawab,
              hubungan: penanggungJawab,
              no_telepon: teleponPenanggungJawab,
              username_wali: rawUsernameWali,
              password_wali: initialPassword,
              email_kontak: emailKontak !== "-" ? emailKontak : undefined,
            },
          }),
        });

        const data = await res.json();
        if (data.ok) {
          await refreshFromSupabase();
          return { ok: true, message: data.message };
        }
        return { ok: false, message: data.message ?? "Gagal menyimpan santri dan akun wali." };
      } catch (e: any) {
        return { ok: false, message: e.message ?? "Terjadi kesalahan jaringan." };
      }
    }

    if (!resolvedTahunAjaranId) {
      return {
        ok: false,
        message: "Registrasi dihentikan: Tahun Pelajaran aktif tidak ditemukan. Silakan atur Tahun Pelajaran aktif terlebih dahulu.",
      };
    }

    // Mode Demo Standalone
    const newSantriId = `snt-${Date.now()}`;
    const newWaliUserId = `usr-wali-${Date.now()}`;

    const newSantri: Santri = {
      id: newSantriId,
      nis: cleanNis,
      nama_lengkap: payload.nama_lengkap.trim(),
      tempat_lahir: payload.tempat_lahir.trim(),
      tanggal_lahir: payload.tanggal_lahir,
      jenis_kelamin: payload.jenis_kelamin,
      alamat: payload.alamat.trim(),
      tahun_masuk: payload.tahun_masuk,
      tahun_ajaran_id: resolvedTahunAjaranId,
      kelas_id: effectiveKelasId,
      kamar_id: effectiveKamarId,
      status: "AKTIF",
      created_at: new Date().toISOString(),
    };

    const newWaliUser: UserProfile = {
      id: newWaliUserId,
      nama_lengkap: namaPenanggungJawab,
      username: rawUsernameWali,
      email: syntheticWaliEmail,
      no_telepon: teleponPenanggungJawab,
      role: "wali",
      is_active: true,
      santri_id: newSantriId,
      must_change_password: true,
      created_at: new Date().toISOString(),
    };

    const newWaliRecord: WaliSantri = {
      id: `wali-${Date.now()}`,
      user_id: newWaliUserId,
      santri_id: newSantriId,
      nama_lengkap: namaPenanggungJawab,
      hubungan: penanggungJawab,
      no_telepon: teleponPenanggungJawab,
      email: emailKontak,
      alamat: payload.alamat.trim(),
      penanggung_jawab: penanggungJawab,
      nama_ayah: finalNamaAyah,
      no_hp_ayah: cleanNoHpAyah || (penanggungJawab === "Ayah" ? teleponPenanggungJawab : "-"),
      pekerjaan_ayah: cleanPekerjaanAyah || "-",
      nama_ibu: finalNamaIbu,
      no_hp_ibu: cleanNoHpIbu || (penanggungJawab === "Ibu" ? teleponPenanggungJawab : "-"),
      pekerjaan_ibu: cleanPekerjaanIbu || "-",
      nama_wali: finalNamaWali || undefined,
      hubungan_wali_detail: finalNamaWali ? cleanHubunganWaliOps || "Wali" : undefined,
      no_hp_wali: finalNamaWali ? cleanNoHpWaliOps || teleponPenanggungJawab : undefined,
    };

    setSantriList((prev) => [...prev, newSantri]);
    setWaliList((prev) => [...prev, newWaliRecord]);
    setUsers((prev) => [...prev, newWaliUser]);

    appendAuditLog(
      "REGISTRASI_SANTRI_DAN_WALI",
      "santri",
      newSantriId,
      { santri: newSantri, wali: newWaliRecord },
      `Registrasi santri baru ${newSantri.nama_lengkap} (NIS: ${newSantri.nis}) & akun wali '${namaPenanggungJawab}' (${penanggungJawab}, @${rawUsernameWali})`
    );

    return {
      ok: true,
      message: `Santri ${newSantri.nama_lengkap} (NIS: ${newSantri.nis}) dan akun wali '${namaPenanggungJawab}' (${penanggungJawab}, @${rawUsernameWali}) berhasil didaftarkan.`,
    };
  };

  const importSantriBatch: SipetaContextValue["importSantriBatch"] = async (rows) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang melakukan import data santri." };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const activeTaRecord = tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0];

    if (authMode === "supabase") {
      const supabaseTaUuid =
        (activeTaRecord?.id && uuidRegex.test(activeTaRecord.id) ? activeTaRecord.id : undefined) ||
        tahunAjaranList.find((t) => t.is_active && uuidRegex.test(t.id))?.id ||
        tahunAjaranList.find((t) => uuidRegex.test(t.id))?.id;

      const res = await administrasiService.importSantriBatch(rows, supabaseTaUuid);
      if (res.ok) {
        await refreshFromSupabase();
      }
      return res;
    }

    if (!activeTaRecord?.id) {
      return {
        ok: false,
        message: "Proses import dihentikan: Tahun Pelajaran aktif belum ditemukan.",
      };
    }

    // Demo Mode Batch Processing
    const results: any[] = [];
    let successCount = 0;
    let failedCount = 0;
    let waliCreatedCount = 0;

    const newSantriToAdd: Santri[] = [];
    const newWaliToAdd: WaliSantri[] = [];
    const newUsersToAdd: UserProfile[] = [];

    for (const r of rows) {
      const cleanNis = r.nis.trim();
      const cleanNama = r.nama_lengkap.trim();

      const matchedKelas = kelasListRef.current.find(
        (k) =>
          k.kode_kelas.toUpperCase() === r.kode_kelas.toUpperCase().trim() ||
          k.nama_kelas.toLowerCase().includes(r.kelas.toLowerCase().trim())
      );

      const matchedKamar = kamarListRef.current.find(
        (km) =>
          km.nama_kamar.toLowerCase().includes(r.kamar.toLowerCase().trim()) ||
          km.kode_kamar.toLowerCase() === r.kamar.toLowerCase().trim()
      );

      if (!matchedKelas) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `Kelas '${r.kode_kelas || r.kelas}' tidak ditemukan di database.`,
        });
        failedCount++;
        continue;
      }

      if (!matchedKamar) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `Kamar '${r.kamar}' tidak ditemukan di database.`,
        });
        failedCount++;
        continue;
      }

      if (
        santriList.some((s) => s.nis === cleanNis) ||
        newSantriToAdd.some((s) => s.nis === cleanNis)
      ) {
        results.push({
          row_number: r.row_number,
          nis: cleanNis,
          nama_lengkap: cleanNama,
          status: "FAILED",
          reason: `NIS '${cleanNis}' sudah terdaftar dalam sistem.`,
        });
        failedCount++;
        continue;
      }

      const sntId = `snt-${cleanNis}`;
      const waliUserId = `usr-wali-${cleanNis}`;

      newSantriToAdd.push({
        id: sntId,
        nis: cleanNis,
        nama_lengkap: cleanNama,
        tempat_lahir: r.tempat_lahir,
        tanggal_lahir: r.tanggal_lahir,
        jenis_kelamin: r.jenis_kelamin,
        alamat: r.alamat,
        tahun_masuk: 2026,
        tahun_ajaran_id: activeTaRecord.id,
        kelas_id: matchedKelas.id,
        kamar_id: matchedKamar.id,
        status: "AKTIF",
        created_at: new Date().toISOString(),
      });

      newWaliToAdd.push({
        id: `wali-${cleanNis}`,
        user_id: waliUserId,
        santri_id: sntId,
        nama_lengkap: r.nama_wali,
        hubungan: r.hubungan_wali,
        no_telepon: r.no_telepon_wali,
        email: r.email_kontak || usernameToInternalEmail(cleanNis),
        alamat: r.alamat,
      });

      newUsersToAdd.push({
        id: waliUserId,
        nama_lengkap: `${r.nama_wali} (Wali ${cleanNama})`,
        username: cleanNis,
        email: usernameToInternalEmail(cleanNis),
        no_telepon: r.no_telepon_wali,
        role: "wali",
        is_active: true,
        santri_id: sntId,
        must_change_password: true,
        created_at: new Date().toISOString(),
      });

      results.push({
        row_number: r.row_number,
        nis: cleanNis,
        nama_lengkap: cleanNama,
        status: "SUCCESS",
        santri_id: sntId,
        wali_username: cleanNis,
      });

      successCount++;
      waliCreatedCount++;
    }

    setSantriList((prev) => [...prev, ...newSantriToAdd]);
    setWaliList((prev) => [...prev, ...newWaliToAdd]);
    setUsers((prev) => [...prev, ...newUsersToAdd]);

    appendAuditLog(
      "IMPORT_SANTRI_EXCEL",
      "santri",
      `batch-${Date.now()}`,
      { total: rows.length, success: successCount, failed: failedCount },
      `Import massal santri & akun wali via Excel (Mode Demo). Berhasil: ${successCount}, Gagal: ${failedCount}`
    );

    const report: ImportBatchReport = {
      total_processed: rows.length,
      success_count: successCount,
      failed_count: failedCount,
      wali_account_created_count: waliCreatedCount,
      results,
      imported_at: new Date().toISOString(),
    };

    return {
      ok: true,
      message: `Proses import selesai: ${successCount} data santri berhasil dibuat, ${failedCount} gagal.`,
      report,
    };
  };

  const deleteSantriBatch: SipetaContextValue["deleteSantriBatch"] = async (santriIds) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus data santri." };
    }
    if (!santriIds || santriIds.length === 0) {
      return { ok: false, message: "Pilih setidaknya 1 santri untuk dihapus." };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.deleteSantriBatch(santriIds);
      if (res.ok) {
        // Perbarui state santri & wali seketika setelah server mengonfirmasi penghapusan,
        // lalu sinkronkan data lengkap di latar belakang.
        setSantriList((prev) =>
          prev.filter((s) => !santriIds.includes(s.id))
        );
        setWaliList((prev) =>
          prev.filter((w) => !santriIds.includes(w.santri_id))
        );
        void refreshFromSupabase().catch(() => {});
      }
      return res;
    }

    // Demo Mode
    let hardDeleted = 0;
    let softDeactivated = 0;

    const idsToHardDelete: string[] = [];
    const idsToSoftDeactivate: string[] = [];

    for (const sId of santriIds) {
      const s = santriList.find((item) => item.id === sId);
      if (!s) continue;

      // Periksa riwayat keuangan / akademik
      const hasHistory =
        tagihanList.some((t) => t.santri_id === sId) ||
        transaksiPembayaranList.some((p) => p.santri_id === sId) ||
        mutasiUangSakuList.some((m) => m.santri_id === sId) ||
        tahfidzList.some((th) => th.santri_id === sId) ||
        prestasiList.some((pr) => pr.santri_id === sId) ||
        kedisiplinanList.some((kd) => kd.santri_id === sId);

      if (hasHistory) {
        idsToSoftDeactivate.push(sId);
        softDeactivated++;
        appendAuditLog(
          "SOFT_DELETE_SANTRI",
          "santri",
          sId,
          { status: "TIDAK_AKTIF" },
          `Santri ${s.nama_lengkap} memiliki riwayat transaksi/akademik aktif, dinonaktifkan secara aman`,
          { status: s.status }
        );
      } else {
        idsToHardDelete.push(sId);
        hardDeleted++;
        appendAuditLog(
          "HARD_DELETE_SANTRI",
          "santri",
          sId,
          undefined,
          `Santri ${s.nama_lengkap} tanpa riwayat transaksi dihapus permanen`,
          { nis: s.nis, nama_lengkap: s.nama_lengkap }
        );
      }
    }

    // Terapkan ke state
    if (idsToSoftDeactivate.length > 0) {
      setSantriList((prev) =>
        prev.map((s) => (idsToSoftDeactivate.includes(s.id) ? { ...s, status: "TIDAK_AKTIF" as StatusSantri } : s))
      );
      // Nonaktifkan akun wali terkait jika ada
      const waliUsersToDeactivate = waliList
        .filter((w) => idsToSoftDeactivate.includes(w.santri_id))
        .map((w) => w.user_id);
      if (waliUsersToDeactivate.length > 0) {
        setUsers((prev) =>
          prev.map((u) => (waliUsersToDeactivate.includes(u.id) ? { ...u, is_active: false } : u))
        );
      }
    }

    if (idsToHardDelete.length > 0) {
      setSantriList((prev) => prev.filter((s) => !idsToHardDelete.includes(s.id)));
      const waliUserIdsToDelete = waliList
        .filter((w) => idsToHardDelete.includes(w.santri_id))
        .map((w) => w.user_id);
      setWaliList((prev) => prev.filter((w) => !idsToHardDelete.includes(w.santri_id)));
      if (waliUserIdsToDelete.length > 0) {
        setUsers((prev) => prev.filter((u) => !waliUserIdsToDelete.includes(u.id)));
      }
      setRiwayatPenempatan((prev) => prev.filter((r) => !idsToHardDelete.includes(r.santri_id)));
    }

    const total = hardDeleted + softDeactivated;
    let message = "";
    if (hardDeleted > 0 && softDeactivated > 0) {
      message = `${total} data santri berhasil diproses (${hardDeleted} dihapus permanen, ${softDeactivated} dinonaktifkan aman karena memiliki riwayat).`;
    } else if (softDeactivated > 0) {
      message = `${softDeactivated} data santri dinonaktifkan secara aman (soft delete) untuk melindungi integritas transaksi & nilai.`;
    } else {
      message = `${hardDeleted} data santri berhasil dihapus dari sistem.`;
    }

    return { ok: true, message };
  };

  const moveSantriPlacement: SipetaContextValue["moveSantriPlacement"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Tidak memiliki akses memindahkan kelas/kamar santri." };
    }
    const target = santriList.find((s) => s.id === payload.santri_id);
    if (!target) return { ok: false, message: "Santri tidak ditemukan." };

    if (
      target.kelas_id === payload.kelas_baru_id &&
      target.kamar_id === payload.kamar_baru_id
    ) {
      return { ok: false, message: "Kelas atau kamar tujuan sama dengan penempatan saat ini." };
    }

    const riwayatBaru: RiwayatPenempatanSantri = {
      id: `rwp-${Date.now()}`,
      santri_id: target.id,
      kelas_lama_id: target.kelas_id,
      kelas_baru_id: payload.kelas_baru_id,
      kamar_lama_id: target.kamar_id,
      kamar_baru_id: payload.kamar_baru_id,
      tanggal_efektif: new Date().toISOString().slice(0, 10),
      keterangan: payload.keterangan.trim() || "Pemindahan penempatan kelas/kamar",
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setSantriList((prev) =>
      prev.map((s) =>
        s.id === target.id
          ? { ...s, kelas_id: payload.kelas_baru_id, kamar_id: payload.kamar_baru_id }
          : s
      )
    );
    setRiwayatPenempatan((prev) => [riwayatBaru, ...prev]);

    appendAuditLog(
      "PINDAH_KELAS_KAMAR_SANTRI",
      "santri",
      target.id,
      { kelas_baru_id: payload.kelas_baru_id, kamar_baru_id: payload.kamar_baru_id },
      payload.keterangan,
      { kelas_lama_id: target.kelas_id, kamar_lama_id: target.kamar_id }
    );

    if (isSupabaseConfigured() || authMode === "supabase") {
      administrasiService
        .moveSantriPlacement(
          payload.santri_id,
          payload.kelas_baru_id,
          payload.kamar_baru_id,
          payload.keterangan
        )
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Penempatan ${target.nama_lengkap} berhasil diperbarui dan dicatat ke riwayat.`,
    };
  };

  const updateStatusSantri: SipetaContextValue["updateStatusSantri"] = (santriId, statusBaru) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Tidak memiliki hak akses." };
    }
    const target = santriList.find((s) => s.id === santriId);
    if (!target) return { ok: false, message: "Santri tidak ditemukan." };

    setSantriList((prev) =>
      prev.map((s) => (s.id === santriId ? { ...s, status: statusBaru } : s))
    );
    appendAuditLog(
      "UBAH_STATUS_SANTRI",
      "santri",
      santriId,
      { status: statusBaru },
      undefined,
      { status: target.status }
    );

    if (isSupabaseConfigured() || authMode === "supabase") {
      administrasiService
        .updateStatusSantri(santriId, statusBaru)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }
    return {
      ok: true,
      message: `Status santri ${target.nama_lengkap} diubah menjadi ${statusBaru}.`,
    };
  };

  const createKelas: SipetaContextValue["createKelas"] = async (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menambah kelas." };
    }
    const cleanKode = payload.kode_kelas.trim().toUpperCase();
    const cleanNama = payload.nama_kelas.trim();

    if (!cleanKode || !cleanNama) {
      return { ok: false, message: "Kode kelas dan nama kelas wajib diisi." };
    }
    if (kelasListRef.current.some((k) => k.kode_kelas.toUpperCase() === cleanKode)) {
      return { ok: false, message: `Kode kelas '${cleanKode}' sudah digunakan.` };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.createKelas({
        ...payload,
        kode_kelas: cleanKode,
        nama_kelas: cleanNama,
      });
      if (res.ok && res.data) {
        const nextList = [...kelasListRef.current.filter((k) => k.id !== res.data!.id), res.data!];
        kelasListRef.current = nextList;
        setKelasList(nextList);
        appendAuditLog("TAMBAH_MASTER_KELAS", "kelas", res.data.id, { ...res.data });
        return { ok: true, message: `Kelas ${res.data.nama_kelas} berhasil ditambahkan.` };
      }
      if (!res.ok) {
        return { ok: false, message: res.message || "Gagal menyimpan kelas ke Supabase." };
      }
    }

    const item: Kelas = {
      ...payload,
      id: `kls-${Date.now()}`,
      kode_kelas: cleanKode,
      nama_kelas: cleanNama,
      is_active: true,
    };
    const nextList = [...kelasListRef.current, item];
    kelasListRef.current = nextList;
    setKelasList(nextList);
    appendAuditLog("TAMBAH_MASTER_KELAS", "kelas", item.id, { ...item });
    return { ok: true, message: `Kelas ${item.nama_kelas} berhasil ditambahkan.` };
  };

  const updateKelas: SipetaContextValue["updateKelas"] = async (id, payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang memperbarui kelas." };
    }
    const target = kelasListRef.current.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kelas tidak ditemukan." };

    const updatePayload = { ...payload };
    if (updatePayload.kode_kelas) {
      const cleanKode = updatePayload.kode_kelas.trim().toUpperCase();
      if (kelasListRef.current.some((k) => k.id !== id && k.kode_kelas.toUpperCase() === cleanKode)) {
        return { ok: false, message: `Kode kelas '${cleanKode}' sudah digunakan oleh kelas lain.` };
      }
      updatePayload.kode_kelas = cleanKode;
    }
    if (updatePayload.nama_kelas) {
      updatePayload.nama_kelas = updatePayload.nama_kelas.trim();
    }

    if (authMode === "supabase") {
      const res = await administrasiService.updateKelas(id, updatePayload);
      if (!res.ok) return { ok: false, message: res.message || "Gagal memperbarui kelas di Supabase." };
    }

    const nextList = kelasListRef.current.map((k) => (k.id === id ? { ...k, ...updatePayload } : k));
    kelasListRef.current = nextList;
    setKelasList(nextList);
    appendAuditLog("UPDATE_MASTER_KELAS", "kelas", id, updatePayload, undefined, { ...target });
    return { ok: true, message: `Data kelas '${updatePayload.nama_kelas || target.nama_kelas}' berhasil diperbarui.` };
  };

  const deleteKelas: SipetaContextValue["deleteKelas"] = async (id) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus kelas." };
    }
    const target = kelasListRef.current.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kelas tidak ditemukan." };

    const activeCount = santriList.filter((s) => s.kelas_id === id && s.status === "AKTIF").length;
    if (activeCount > 0) {
      return {
        ok: false,
        message: `Kelas '${target.nama_kelas}' masih memiliki ${activeCount} santri aktif. Pindahkan santri ke kelas lain terlebih dahulu sebelum menghapus kelas ini.`,
      };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.deleteKelas(id);
      if (!res.ok) return { ok: false, message: res.message || "Gagal menghapus kelas dari Supabase." };
      void refreshFromSupabase().catch(() => {});
    }

    const nextList = kelasListRef.current.filter((k) => k.id !== id);
    kelasListRef.current = nextList;
    setKelasList(nextList);
    appendAuditLog("DELETE_MASTER_KELAS", "kelas", id, undefined, `Penghapusan master kelas '${target.nama_kelas}'`, { ...target });
    return { ok: true, message: `Kelas '${target.nama_kelas}' berhasil dihapus.` };
  };

  const createKamar: SipetaContextValue["createKamar"] = async (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menambah kamar." };
    }
    const cleanKode = payload.kode_kamar.trim().toUpperCase();
    const cleanNama = payload.nama_kamar.trim();
    const cleanGedung = payload.gedung_asrama.trim();

    if (!cleanKode || !cleanNama || !cleanGedung) {
      return { ok: false, message: "Kode kamar, nama kamar, dan gedung asrama wajib diisi." };
    }
    if (payload.jenis_asrama !== "L" && payload.jenis_asrama !== "P") {
      return { ok: false, message: "Jenis asrama wajib dipilih antara Putra (L) atau Putri (P)." };
    }
    if (kamarListRef.current.some((k) => k.kode_kamar.toUpperCase() === cleanKode)) {
      return { ok: false, message: `Kode kamar '${cleanKode}' sudah digunakan.` };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.createKamar({
        ...payload,
        kode_kamar: cleanKode,
        nama_kamar: cleanNama,
        gedung_asrama: cleanGedung,
      });
      if (res.ok && res.data) {
        const nextList = [...kamarListRef.current.filter((k) => k.id !== res.data!.id), res.data!];
        kamarListRef.current = nextList;
        setKamarList(nextList);
        appendAuditLog("TAMBAH_MASTER_KAMAR", "kamar", res.data.id, { ...res.data });
        return { ok: true, message: `Kamar ${res.data.nama_kamar} berhasil ditambahkan.` };
      }
      if (!res.ok) {
        return { ok: false, message: res.message || "Gagal menyimpan kamar ke Supabase." };
      }
    }

    const item: Kamar = {
      ...payload,
      id: `kmr-${Date.now()}`,
      kode_kamar: cleanKode,
      nama_kamar: cleanNama,
      gedung_asrama: cleanGedung,
      is_active: true,
    };
    const nextList = [...kamarListRef.current, item];
    kamarListRef.current = nextList;
    setKamarList(nextList);
    appendAuditLog("TAMBAH_MASTER_KAMAR", "kamar", item.id, { ...item });
    return { ok: true, message: `Kamar ${item.nama_kamar} berhasil ditambahkan.` };
  };

  const updateKamar: SipetaContextValue["updateKamar"] = async (id, payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang memperbarui kamar." };
    }
    const target = kamarListRef.current.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kamar asrama tidak ditemukan." };

    const updatePayload = { ...payload };
    if (updatePayload.kode_kamar) {
      const cleanKode = updatePayload.kode_kamar.trim().toUpperCase();
      if (kamarListRef.current.some((k) => k.id !== id && k.kode_kamar.toUpperCase() === cleanKode)) {
        return { ok: false, message: `Kode kamar '${cleanKode}' sudah digunakan oleh kamar lain.` };
      }
      updatePayload.kode_kamar = cleanKode;
    }
    if (updatePayload.nama_kamar) {
      updatePayload.nama_kamar = updatePayload.nama_kamar.trim();
    }
    if (updatePayload.gedung_asrama) {
      updatePayload.gedung_asrama = updatePayload.gedung_asrama.trim();
    }

    if (authMode === "supabase") {
      const res = await administrasiService.updateKamar(id, updatePayload);
      if (!res.ok) return { ok: false, message: res.message || "Gagal memperbarui kamar di Supabase." };
    }

    const nextList = kamarListRef.current.map((k) => (k.id === id ? { ...k, ...updatePayload } : k));
    kamarListRef.current = nextList;
    setKamarList(nextList);
    appendAuditLog("UPDATE_MASTER_KAMAR", "kamar", id, updatePayload, undefined, { ...target });
    return { ok: true, message: `Data kamar '${updatePayload.nama_kamar || target.nama_kamar}' berhasil diperbarui.` };
  };

  const deleteKamar: SipetaContextValue["deleteKamar"] = async (id) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus kamar." };
    }
    const target = kamarListRef.current.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kamar asrama tidak ditemukan." };

    const activeCount = santriList.filter((s) => s.kamar_id === id && s.status === "AKTIF").length;
    if (activeCount > 0) {
      return {
        ok: false,
        message: `Kamar '${target.nama_kamar}' masih ditempati oleh ${activeCount} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kamar ini.`,
      };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.deleteKamar(id);
      if (!res.ok) return { ok: false, message: res.message || "Gagal menghapus kamar dari Supabase." };
      void refreshFromSupabase().catch(() => {});
    }

    const nextList = kamarListRef.current.filter((k) => k.id !== id);
    kamarListRef.current = nextList;
    setKamarList(nextList);
    appendAuditLog("DELETE_MASTER_KAMAR", "kamar", id, undefined, `Penghapusan master kamar asrama '${target.nama_kamar}'`, { ...target });
    return { ok: true, message: `Kamar '${target.nama_kamar}' berhasil dihapus.` };
  };

  const createPengajuanPembiayaan: SipetaContextValue["createPengajuanPembiayaan"] = (payload) => {
    if (!currentUser || (currentUser.role !== "tu" && currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Tata Usaha (TU) dan Pengasuh/Admin yang dapat mengajukan pembiayaan santri." };
    }
    if (payload.nominal <= 0) {
      return { ok: false, message: "Nominal pembiayaan harus lebih dari Rp 0." };
    }
    if (
      payload.kebijakan_cicilan === "MINIMAL_NOMINAL" &&
      (!payload.minimal_nominal_cicilan ||
        payload.minimal_nominal_cicilan <= 0 ||
        payload.minimal_nominal_cicilan > payload.nominal)
    ) {
      return {
        ok: false,
        message:
          "Untuk opsi Bisa Dicicil (Minimal Nominal), batas minimal cicilan wajib diisi (> 0 dan <= nominal tagihan).",
      };
    }

    // Alur Persetujuan PRD:
    // Jika TU yang membuat -> Status awal: MENUNGGU_PERSETUJUAN, is_active: false
    // Jika Admin/Superadmin yang membuat -> Langsung DISETUJUI, is_active: true
    const isDirectAdmin = currentUser.role === "admin" || currentUser.role === "superadmin";
    const statusPersetujuan: "MENUNGGU_PERSETUJUAN" | "DISETUJUI" = isDirectAdmin
      ? "DISETUJUI"
      : "MENUNGGU_PERSETUJUAN";
    const isActive = isDirectAdmin;

    const newId = `jp-${Date.now()}`;
    const cleanKode = `BYR-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newJenis: JenisPembayaran = {
      ...payload,
      id: newId,
      kode_pembayaran: cleanKode,
      is_active: isActive,
      status_persetujuan: statusPersetujuan,
      created_by: currentUser.id,
      created_at: new Date().toISOString(),
      disetujui_oleh_nama: isDirectAdmin ? currentUser.nama_lengkap : undefined,
      disetujui_at: isDirectAdmin ? new Date().toISOString() : undefined,
      catatan_persetujuan: isDirectAdmin ? "Dibuat langsung oleh Pengasuh/Admin." : undefined,
    };

    setJenisPembayaranList((prev) => [newJenis, ...prev]);

    // Jika Admin/Pengasuh langsung membuat, terbitkan tagihan aktif secara otomatis
    let targetSantri = santriList.filter((s) => s.status === "AKTIF");
    if (newJenis.sasaran_santri === "KELAS_TERTENTU" && newJenis.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.kelas_id === newJenis.sasaran_target_id);
    } else if (newJenis.sasaran_santri === "KAMAR_TERTENTU" && newJenis.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.kamar_id === newJenis.sasaran_target_id);
    } else if (newJenis.sasaran_santri === "INDIVIDU" && newJenis.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.id === newJenis.sasaran_target_id);
    }

    if (isDirectAdmin && targetSantri.length > 0) {
      const newBills: Tagihan[] = targetSantri.map((s, idx) => ({
        id: `tgh-${Date.now()}-${idx}`,
        nomor_tagihan: `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(100 + Math.random() * 900)}-${idx + 1}`,
        santri_id: s.id,
        jenis_pembayaran_id: newJenis.id,
        judul_tagihan: newJenis.nama_pembayaran,
        kategori: newJenis.kategori,
        periode_label: newJenis.periode_pembayaran,
        nominal_awal: newJenis.nominal,
        nominal_penyesuaian: 0,
        nominal_tagihan: newJenis.nominal,
        total_terbayar: 0,
        sisa_tagihan: newJenis.nominal,
        kebijakan_cicilan_snapshot: newJenis.kebijakan_cicilan,
        minimal_cicilan_snapshot: newJenis.minimal_nominal_cicilan,
        tanggal_mulai: newJenis.tanggal_mulai,
        tanggal_jatuh_tempo: newJenis.tanggal_jatuh_tempo,
        status: "BELUM_BAYAR",
        is_active: true,
        created_at: new Date().toISOString(),
      }));
      setTagihanList((prev) => [...newBills, ...prev]);
    }

    appendAuditLog("PENGAJUAN_PEMBIAYAAN", "jenis_pembayaran", newJenis.id, {
      nama: newJenis.nama_pembayaran,
      nominal: newJenis.nominal,
      status: newJenis.status_persetujuan,
      diajukan_oleh: currentUser.nama_lengkap,
    });

    if (authMode === "supabase") {
      administrasiService
        .createJenisPembayaran({
          kode_pembayaran: newJenis.kode_pembayaran,
          nama_pembayaran: newJenis.nama_pembayaran,
          deskripsi: newJenis.deskripsi,
          nominal: newJenis.nominal,
          kategori: newJenis.kategori,
          tahun_ajaran_id: newJenis.tahun_ajaran_id,
          periode_pembayaran: newJenis.periode_pembayaran,
          tanggal_mulai: newJenis.tanggal_mulai,
          tanggal_jatuh_tempo: newJenis.tanggal_jatuh_tempo,
          sasaran_santri: newJenis.sasaran_santri,
          sasaran_target_id: newJenis.sasaran_target_id,
          kebijakan_cicilan: newJenis.kebijakan_cicilan,
          minimal_nominal_cicilan: newJenis.minimal_nominal_cicilan,
          status_persetujuan: newJenis.status_persetujuan,
          created_by: currentUser.id,
        })
        .then(async (res) => {
          if (res.ok && res.data && isDirectAdmin && targetSantri.length > 0) {
            await administrasiService.generateTagihan({
              jenis_pembayaran_id: res.data.id,
              periode_label: newJenis.periode_pembayaran,
              tanggal_jatuh_tempo: newJenis.tanggal_jatuh_tempo,
              target_santri_ids: targetSantri.map((s) => s.id),
            });
          }
          if (res.ok) {
            await refreshFromSupabase();
          }
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: isDirectAdmin
        ? `Pembiayaan "${newJenis.nama_pembayaran}" langsung disetujui & tagihan santri aktif diterbitkan.`
        : `Pengajuan pembiayaan "${newJenis.nama_pembayaran}" berhasil dikirim. Menunggu persetujuan Pengasuh/Admin.`,
    };
  };

  const createJenisPembayaran: SipetaContextValue["createJenisPembayaran"] = (payload) => {
    return createPengajuanPembiayaan({
      ...payload,
      sasaran_santri: payload.sasaran_santri || "SEMUA",
    });
  };

  const updateJenisPembayaran: SipetaContextValue["updateJenisPembayaran"] = (id, payload) => {
    if (!currentUser || (currentUser.role !== "tu" && currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Akses ditolak." };
    }

    const existing = jenisPembayaranList.find((j) => j.id === id);
    if (!existing) return { ok: false, message: "Data pembiayaan tidak ditemukan." };

    // TU dilarang mengedit pembiayaan yang telah disetujui
    if (currentUser.role === "tu" && existing.status_persetujuan === "DISETUJUI") {
      return {
        ok: false,
        message: "Pembiayaan yang telah disetujui Pengasuh/Admin tidak dapat diedit oleh TU. Hubungi Pengasuh untuk penyesuaian.",
      };
    }

    // TU dilarang mengubah status_persetujuan atau is_active secara sepihak
    const cleanPayload = { ...payload };
    if (currentUser.role === "tu") {
      delete cleanPayload.status_persetujuan;
      delete cleanPayload.is_active;
      delete cleanPayload.disetujui_oleh_nama;
      delete cleanPayload.disetujui_at;
    }

    setJenisPembayaranList((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...cleanPayload } : item))
    );

    appendAuditLog("UPDATE_PEMBIAYAAN", "jenis_pembayaran", id, {
      id,
      nama: existing.nama_pembayaran,
      diubah_oleh: currentUser.nama_lengkap,
    });

    if (authMode === "supabase") {
      administrasiService
        .updateJenisPembayaran(id, cleanPayload)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: `Data pembiayaan "${existing.nama_pembayaran}" berhasil diperbarui.` };
  };

  const deleteJenisPembayaran: SipetaContextValue["deleteJenisPembayaran"] = (id) => {
    if (!currentUser || (currentUser.role !== "tu" && currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Akses ditolak." };
    }

    const existing = jenisPembayaranList.find((j) => j.id === id);
    if (!existing) return { ok: false, message: "Data pembiayaan tidak ditemukan." };

    // Validasi aturan: Pembiayaan yang sudah disetujui DILARANG dihapus oleh TU
    if (existing.status_persetujuan === "DISETUJUI" || existing.is_active) {
      return {
        ok: false,
        message: "Pembiayaan yang telah disetujui Pengasuh/Admin tidak boleh dihapus demi integritas data keuangan dan tagihan santri.",
      };
    }

    setJenisPembayaranList((prev) => prev.filter((j) => j.id !== id));
    appendAuditLog("HAPUS_PEMBIAYAAN_DRAF", "jenis_pembayaran", id, {
      nama: existing.nama_pembayaran,
      status: existing.status_persetujuan,
      dihapus_oleh: currentUser.nama_lengkap,
    });

    if (authMode === "supabase") {
      administrasiService
        .deleteJenisPembayaran(id)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: `Pengajuan pembiayaan "${existing.nama_pembayaran}" berhasil dihapus.` };
  };

  const approveJenisPembayaran: SipetaContextValue["approveJenisPembayaran"] = (id, catatan) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Pengasuh/Admin yang berwenang menyetujui pengajuan pembiayaan." };
    }

    const target = jenisPembayaranList.find((j) => j.id === id);
    if (!target) return { ok: false, message: "Data pembiayaan tidak ditemukan." };

    if (target.status_persetujuan === "DISETUJUI") {
      return { ok: false, message: "Pembiayaan ini sudah disetujui sebelumnya." };
    }

    const approvedAt = new Date().toISOString();
    const approvedCatatan = catatan || "Disetujui oleh Pengasuh/Admin.";

    // Format periode_label yang deskriptif dan konsisten (misal: "November 2026")
    const namaBulanIndo = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    let computedPeriode: string = target.periode_pembayaran;
    if (target.tanggal_mulai) {
      const tDate = new Date(target.tanggal_mulai);
      if (!isNaN(tDate.getTime())) {
        const m = tDate.getMonth();
        if (m >= 0 && m < 12) {
          computedPeriode = `${namaBulanIndo[m]} ${tDate.getFullYear()}`;
        }
      }
    }

    setJenisPembayaranList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            status_persetujuan: "DISETUJUI",
            is_active: true,
            catatan_persetujuan: approvedCatatan,
            disetujui_oleh_nama: currentUser.nama_lengkap,
            disetujui_at: approvedAt,
          }
          : item
      )
    );

    // Otomatis terbitkan tagihan aktif untuk santri target sesuai sasaran
    let targetSantri = santriList.filter((s) => s.status === "AKTIF");
    if (target.sasaran_santri === "KELAS_TERTENTU" && target.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.kelas_id === target.sasaran_target_id);
    } else if (target.sasaran_santri === "KAMAR_TERTENTU" && target.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.kamar_id === target.sasaran_target_id);
    } else if (target.sasaran_santri === "INDIVIDU" && target.sasaran_target_id) {
      targetSantri = targetSantri.filter((s) => s.id === target.sasaran_target_id);
    }

    if (targetSantri.length > 0) {
      const newBills: Tagihan[] = targetSantri.map((s, idx) => ({
        id: `tgh-${Date.now()}-${idx}`,
        nomor_tagihan: `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(100 + Math.random() * 900)}-${idx + 1}`,
        santri_id: s.id,
        jenis_pembayaran_id: target.id,
        judul_tagihan: `${target.nama_pembayaran} (${computedPeriode})`,
        kategori: target.kategori,
        periode_label: computedPeriode,
        nominal_awal: target.nominal,
        nominal_penyesuaian: 0,
        nominal_tagihan: target.nominal,
        total_terbayar: 0,
        sisa_tagihan: target.nominal,
        kebijakan_cicilan_snapshot: target.kebijakan_cicilan,
        minimal_cicilan_snapshot: target.minimal_nominal_cicilan,
        tanggal_mulai: target.tanggal_mulai,
        tanggal_jatuh_tempo: target.tanggal_jatuh_tempo,
        status: "BELUM_BAYAR",
        is_active: true,
        created_at: new Date().toISOString(),
      }));

      setTagihanList((prev) => [...newBills, ...prev]);

      for (const bill of newBills) {
        notifyWaliOfSantri(
          bill.santri_id,
          "TAGIHAN_BARU",
          `Tagihan Baru: ${bill.judul_tagihan}`,
          `Tagihan resmi sebesar Rp ${bill.nominal_tagihan.toLocaleString("id-ID")} telah diterbitkan dengan batas jatuh tempo ${bill.tanggal_jatuh_tempo}.`,
          "/wali/informasi-tagihan"
        );
      }
    }

    appendAuditLog("SETUJUI_PEMBIAYAAN", "jenis_pembayaran", id, {
      nama: target.nama_pembayaran,
      disetujui_oleh: currentUser.nama_lengkap,
      tagihan_diterbitkan: targetSantri.length,
      periode_label: computedPeriode,
    });

    if (authMode === "supabase") {
      administrasiService
        .approveJenisPembayaran(id, {
          catatan: approvedCatatan,
          approved_by: currentUser.id,
          approved_by_name: currentUser.nama_lengkap,
          periode_label: computedPeriode,
        })
        .then(async (res) => {
          // Hanya panggil generateTagihan manual jika RPC belum menerbitkan tagihan secara atomik
          if (res.ok && res.tagihan_diterbitkan === undefined && targetSantri.length > 0) {
            await administrasiService.generateTagihan({
              jenis_pembayaran_id: target.id,
              periode_label: computedPeriode,
              tanggal_jatuh_tempo: target.tanggal_jatuh_tempo,
              target_santri_ids: targetSantri.map((s) => s.id),
            });
          }
          if (res.ok) {
            await refreshFromSupabase();
          }
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Pembiayaan "${target.nama_pembayaran}" berhasil disetujui. ${targetSantri.length} tagihan aktif telah diterbitkan untuk wali santri.`,
    };
  };

  const rejectJenisPembayaran: SipetaContextValue["rejectJenisPembayaran"] = (id, catatan) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Pengasuh/Admin yang berwenang menolak pengajuan pembiayaan." };
    }
    if (!catatan || !catatan.trim()) {
      return { ok: false, message: "Catatan alasan penolakan wajib diisi untuk evaluasi TU." };
    }

    const target = jenisPembayaranList.find((j) => j.id === id);
    if (!target) return { ok: false, message: "Data pembiayaan tidak ditemukan." };

    setJenisPembayaranList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            status_persetujuan: "DITOLAK",
            is_active: false,
            catatan_persetujuan: catatan.trim(),
            disetujui_oleh_nama: currentUser.nama_lengkap,
            disetujui_at: new Date().toISOString(),
          }
          : item
      )
    );

    appendAuditLog("TOLAK_PEMBIAYAAN", "jenis_pembayaran", id, {
      nama: target.nama_pembayaran,
      ditolak_oleh: currentUser.nama_lengkap,
      alasan: catatan.trim(),
    });

    if (authMode === "supabase") {
      administrasiService
        .rejectJenisPembayaran(id, {
          catatan: catatan.trim(),
          rejected_by: currentUser.id,
          rejected_by_name: currentUser.nama_lengkap,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Pengajuan pembiayaan "${target.nama_pembayaran}" telah ditolak dengan catatan evaluasi.`,
    };
  };

  const generateTagihan: SipetaContextValue["generateTagihan"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Admin yang dapat menerbitkan tagihan santri." };
    }
    const jenis = jenisPembayaranList.find((j) => j.id === payload.jenis_pembayaran_id);
    if (!jenis) return { ok: false, message: "Jenis pembayaran tidak ditemukan." };

    let targetSantri = santriList.filter((s) => s.status === "AKTIF");
    if (payload.target_mode === "KELAS" && payload.target_id) {
      targetSantri = targetSantri.filter((s) => s.kelas_id === payload.target_id);
    } else if (payload.target_mode === "KAMAR" && payload.target_id) {
      targetSantri = targetSantri.filter((s) => s.kamar_id === payload.target_id);
    } else if (payload.target_mode === "SANTRI" && payload.target_id) {
      targetSantri = targetSantri.filter((s) => s.id === payload.target_id);
    }

    if (targetSantri.length === 0) {
      return { ok: false, message: "Tidak ada santri aktif pada sasaran yang dipilih." };
    }

    const newBills: Tagihan[] = targetSantri.map((s, idx) => {
      // Bab 5.2 PRD: Kebijakan cicilan disalin (snapshot) ke tagihan saat tagihan dibuat
      const kebijakanSnapshot: KebijakanCicilan = jenis.kebijakan_cicilan;
      const minSnapshot: number | null = jenis.minimal_nominal_cicilan;
      return {
        id: `tgh-${Date.now()}-${idx}`,
        nomor_tagihan: `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.floor(
          100 + Math.random() * 900
        )}`,
        santri_id: s.id,
        jenis_pembayaran_id: jenis.id,
        judul_tagihan: `${jenis.nama_pembayaran}`,
        kategori: jenis.kategori,
        periode_label: payload.periode_label,
        nominal_awal: jenis.nominal,
        nominal_penyesuaian: 0,
        nominal_tagihan: jenis.nominal,
        total_terbayar: 0,
        sisa_tagihan: jenis.nominal,
        kebijakan_cicilan_snapshot: kebijakanSnapshot,
        minimal_cicilan_snapshot: minSnapshot,
        tanggal_mulai: new Date().toISOString().slice(0, 10),
        tanggal_jatuh_tempo: payload.tanggal_jatuh_tempo,
        status: "BELUM_BAYAR",
        is_active: true,
        created_at: new Date().toISOString(),
      };
    });

    setTagihanList((prev) => [...newBills, ...prev]);

    for (const bill of newBills) {
      notifyWaliOfSantri(
        bill.santri_id,
        "TAGIHAN_BARU",
        `Tagihan Baru: ${bill.judul_tagihan}`,
        `Tagihan ${bill.judul_tagihan} (${bill.periode_label}) sebesar Rp ${bill.nominal_tagihan.toLocaleString(
          "id-ID"
        )} telah diterbitkan.`,
        "/wali/pembayaran"
      );
    }

    appendAuditLog("GENERATE_TAGIHAN_SANTRI", "tagihan", jenis.id, {
      jenis_pembayaran: jenis.nama_pembayaran,
      jumlah_santri: newBills.length,
      kebijakan_cicilan_snapshot: jenis.kebijakan_cicilan,
    });

    if (authMode === "supabase") {
      administrasiService
        .generateTagihan({
          jenis_pembayaran_id: jenis.id,
          periode_label: payload.periode_label,
          tanggal_jatuh_tempo: payload.tanggal_jatuh_tempo,
          target_santri_ids: targetSantri.map((s) => s.id),
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Berhasil menerbitkan ${newBills.length} tagihan "${jenis.nama_pembayaran}" (Kebijakan cicilan disalin ke setiap tagihan).`,
    };
  };

  const adjustTagihan: SipetaContextValue["adjustTagihan"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return {
        ok: false,
        message: "Hanya Admin atau Superadmin yang berwenang melakukan penyesuaian tagihan.",
      };
    }
    const tagihan = tagihanList.find((t) => t.id === payload.tagihan_id);
    if (!tagihan) return { ok: false, message: "Tagihan tidak ditemukan." };
    if (!payload.alasan_penyesuaian || payload.alasan_penyesuaian.trim().length < 5) {
      return {
        ok: false,
        message: "Alasan penyesuaian/pembatalan tagihan wajib diisi minimal 5 karakter untuk audit log.",
      };
    }

    if (payload.pembatalan) {
      if (tagihan.total_terbayar > 0) {
        return {
          ok: false,
          message:
            "Tagihan yang sudah menerima pembayaran tidak dapat dibatalkan sembarangan. Gunakan mekanisme penyesuaian nominal.",
        };
      }
      const logItem: RiwayatPenyesuaianTagihan = {
        id: `adj-${Date.now()}`,
        tagihan_id: tagihan.id,
        nominal_sebelum: tagihan.nominal_tagihan,
        nominal_sesudah: tagihan.nominal_tagihan,
        status_sebelum: tagihan.status,
        status_sesudah: "DIBATALKAN",
        alasan_penyesuaian: payload.alasan_penyesuaian.trim(),
        petugas_nama: currentUser.nama_lengkap,
        created_at: new Date().toISOString(),
      };
      setTagihanList((prev) =>
        prev.map((t) =>
          t.id === tagihan.id ? { ...t, status: "DIBATALKAN", is_active: false } : t
        )
      );
      setRiwayatPenyesuaianTagihan((prev) => [logItem, ...prev]);
      appendAuditLog(
        "PEMBATALAN_TAGIHAN",
        "tagihan",
        tagihan.id,
        { status: "DIBATALKAN" },
        payload.alasan_penyesuaian,
        { status: tagihan.status }
      );
      if (authMode === "supabase") {
        keuanganService
          .penyesuaianTagihan(tagihan.id, 0, payload.alasan_penyesuaian.trim(), true)
          .then((res) => {
            if (res.ok) refreshFromSupabase();
          })
          .catch(console.error);
      }
      return { ok: true, message: `Tagihan ${tagihan.nomor_tagihan} berhasil dibatalkan.` };
    }

    const nominalBaru = tagihan.nominal_awal + payload.nominal_penyesuaian;
    if (nominalBaru < tagihan.total_terbayar) {
      return {
        ok: false,
        message: `Nominal tagihan baru (${nominalBaru}) tidak boleh lebih kecil dari total yang sudah dibayar (${tagihan.total_terbayar}).`,
      };
    }

    const sisaBaru = nominalBaru - tagihan.total_terbayar;
    const statusBaru: StatusTagihan =
      sisaBaru === 0 ? "LUNAS" : tagihan.total_terbayar > 0 ? "DIBAYAR_SEBAGIAN" : "BELUM_BAYAR";

    const logItem: RiwayatPenyesuaianTagihan = {
      id: `adj-${Date.now()}`,
      tagihan_id: tagihan.id,
      nominal_sebelum: tagihan.nominal_tagihan,
      nominal_sesudah: nominalBaru,
      status_sebelum: tagihan.status,
      status_sesudah: statusBaru,
      alasan_penyesuaian: payload.alasan_penyesuaian.trim(),
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setTagihanList((prev) =>
      prev.map((t) =>
        t.id === tagihan.id
          ? {
            ...t,
            nominal_penyesuaian: payload.nominal_penyesuaian,
            nominal_tagihan: nominalBaru,
            sisa_tagihan: sisaBaru,
            status: statusBaru,
          }
          : t
      )
    );
    setRiwayatPenyesuaianTagihan((prev) => [logItem, ...prev]);
    appendAuditLog(
      "PENYESUAIAN_TAGIHAN",
      "tagihan",
      tagihan.id,
      { nominal: nominalBaru, status: statusBaru },
      payload.alasan_penyesuaian,
      { nominal: tagihan.nominal_tagihan, status: tagihan.status }
    );
    if (authMode === "supabase") {
      keuanganService
        .penyesuaianTagihan(tagihan.id, payload.nominal_penyesuaian, payload.alasan_penyesuaian.trim(), false)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }
    return {
      ok: true,
      message: `Tagihan ${tagihan.nomor_tagihan} berhasil disesuaikan. Nominal sekarang: Rp ${nominalBaru.toLocaleString(
        "id-ID"
      )}.`,
    };
  };

  const createPengumuman: SipetaContextValue["createPengumuman"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU) dan Pengasuh/Admin yang dapat membuat pengumuman." };
    }
    const isPub = payload.status_publikasi !== "DRAF" && (payload.is_published ?? true);
    const item: Pengumuman = {
      id: `pgm-${Date.now()}`,
      judul: payload.judul.trim(),
      kategori: payload.kategori,
      isi: payload.isi.trim(),
      is_penting: payload.is_penting,
      is_published: isPub,
      tanggal_publikasi: new Date().toISOString(),
      created_by_nama: currentUser.nama_lengkap,
      masa_berlaku: payload.masa_berlaku,
      sasaran: payload.sasaran ?? "SEMUA",
      target_id: payload.target_id,
      status_publikasi: payload.status_publikasi ?? (isPub ? "PUBLIKASI" : "DRAF"),
    };
    setPengumumanList((prev) => [item, ...prev]);
    appendAuditLog("BUAT_PENGUMUMAN", "pengumuman", item.id, { judul: item.judul, status: item.status_publikasi });

    if (authMode === "supabase") {
      administrasiService
        .createPengumuman({
          judul: item.judul,
          kategori: item.kategori,
          isi: item.isi,
          is_penting: item.is_penting,
          is_published: item.is_published,
          created_by: currentUser.id,
          created_by_nama: currentUser.nama_lengkap,
          masa_berlaku: item.masa_berlaku,
          sasaran: item.sasaran,
          target_id: item.target_id,
          status_publikasi: item.status_publikasi,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: isPub ? "Pengumuman pesantren berhasil dipublikasikan." : "Pengumuman berhasil disimpan sebagai draf." };
  };

  const updatePengumuman: SipetaContextValue["updatePengumuman"] = (id, payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Akses ditolak." };
    }

    const target = pengumumanList.find((p) => p.id === id);
    if (!target) return { ok: false, message: "Pengumuman tidak ditemukan." };

    const isPub = payload.status_publikasi ? payload.status_publikasi !== "DRAF" : payload.is_published ?? target.is_published;

    setPengumumanList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            ...payload,
            is_published: isPub,
            status_publikasi: payload.status_publikasi ?? (isPub ? "PUBLIKASI" : "DRAF"),
          }
          : item
      )
    );

    appendAuditLog("UPDATE_PENGUMUMAN", "pengumuman", id, { judul: target.judul });

    if (authMode === "supabase") {
      administrasiService
        .updatePengumuman(id, {
          ...payload,
          is_published: isPub,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Pengumuman berhasil diperbarui." };
  };

  const deletePengumuman: SipetaContextValue["deletePengumuman"] = (id) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Akses ditolak." };
    }

    const target = pengumumanList.find((p) => p.id === id);
    if (!target) return { ok: false, message: "Pengumuman tidak ditemukan." };

    setPengumumanList((prev) => prev.filter((p) => p.id !== id));
    appendAuditLog("HAPUS_PENGUMUMAN", "pengumuman", id, { judul: target.judul });

    if (authMode === "supabase") {
      administrasiService
        .deletePengumuman(id)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Pengumuman berhasil dihapus." };
  };

  // ============================================================================
  // MANAJEMEN DOKUMEN & UNDUHAN (TU & PENGASUH)
  // ============================================================================

  const createDokumen: SipetaContextValue["createDokumen"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "admin" &&
        currentUser.role !== "superadmin" &&
        currentUser.role !== "tu")
    ) {
      return { ok: false, message: "Hanya Tata Usaha (TU) dan Pengasuh/Admin yang berhak mengunggah dokumen." };
    }

    if (!payload.judul.trim() || !payload.file_name.trim()) {
      return { ok: false, message: "Judul dokumen dan nama berkas wajib diisi." };
    }

    const newDok: DokumenUnduhan = {
      id: `dok-${Date.now()}`,
      judul: payload.judul.trim(),
      deskripsi: payload.deskripsi.trim(),
      kategori: payload.kategori,
      file_name: payload.file_name.trim(),
      file_size_formatted: payload.file_size_formatted || "1.0 MB",
      file_type: payload.file_type || "PDF",
      file_url: payload.file_url || "#",
      tanggal_unggah: new Date().toISOString().slice(0, 10),
      diunggah_oleh_nama: currentUser.nama_lengkap,
      is_published: true,
    };

    setDokumenList((prev) => [newDok, ...prev]);
    appendAuditLog("UNGGAH_DOKUMEN", "dokumen_unduhan", newDok.id, {
      judul: newDok.judul,
      kategori: newDok.kategori,
      file_name: newDok.file_name,
    });

    return { ok: true, message: `Dokumen "${newDok.judul}" berhasil diunggah ke perpustakaan dokumen.` };
  };

  const deleteDokumen: SipetaContextValue["deleteDokumen"] = (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "admin" &&
        currentUser.role !== "superadmin" &&
        currentUser.role !== "tu")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }

    const target = dokumenList.find((d) => d.id === id);
    if (!target) return { ok: false, message: "Dokumen tidak ditemukan." };

    setDokumenList((prev) => prev.filter((d) => d.id !== id));
    appendAuditLog("HAPUS_DOKUMEN", "dokumen_unduhan", id, { judul: target.judul });

    return { ok: true, message: `Dokumen "${target.judul}" berhasil dihapus dari perpustakaan.` };
  };

  // ============================================================================
  // ORANG TUA / WALI ACTIONS (KERANJANG CICILAN, CHECKOUT, & TOP-UP SAKU)
  // ============================================================================

  const addOrUpdateKeranjang: SipetaContextValue["addOrUpdateKeranjang"] = (
    tagihanId,
    nominalBayar
  ) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    const tagihan = tagihanList.find((t) => t.id === tagihanId);
    if (!tagihan) return { ok: false, message: "Tagihan tidak ditemukan." };

    if (currentUser.role === "wali" && tagihan.santri_id !== currentUser.santri_id) {
      return {
        ok: false,
        message: "PROTEKSI AKSES: Anda hanya dapat membayar tagihan santri yang terhubung.",
      };
    }

    const validation = validateNominalCicilan(tagihan, nominalBayar);
    if (!validation.valid) {
      return { ok: false, message: validation.error ?? "Nominal tidak sesuai aturan cicilan." };
    }

    setKeranjang((prev) => {
      const exists = prev.some((i) => i.tagihan_id === tagihanId);
      if (exists) {
        return prev.map((i) =>
          i.tagihan_id === tagihanId ? { ...i, nominal_bayar: nominalBayar } : i
        );
      }
      return [...prev, { tagihan_id: tagihanId, nominal_bayar: nominalBayar }];
    });

    return {
      ok: true,
      message: `"${tagihan.judul_tagihan}" dimasukkan ke keranjang pembayaran.`,
    };
  };

  const removeFromKeranjang = (tagihanId: string) => {
    setKeranjang((prev) => prev.filter((i) => i.tagihan_id !== tagihanId));
  };

  const clearKeranjang = () => setKeranjang([]);

  const submitCheckoutPembayaran: SipetaContextValue["submitCheckoutPembayaran"] = async (payload) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    if (!rekeningResmi || !rekeningResmi.is_active) {
      return {
        ok: false,
        message: "Rekening resmi pesantren belum dikonfigurasi atau tidak aktif. Pembayaran belum dapat diproses.",
      };
    }
    if (keranjang.length === 0) {
      return { ok: false, message: "Keranjang pembayaran masih kosong." };
    }
    const activeSantriId = currentUser.santri_id ?? "";
    if (!activeSantriId) {
      return { ok: false, message: "Akun Anda belum terhubung dengan data santri." };
    }

    if (authMode !== "supabase") {
      // Mode demo: simulasi lokal
      const nomorTrx = `TRX-BYR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-DEMO`;
      return { ok: true, message: `[Demo] Pengajuan pembayaran ${nomorTrx} dikirim (Mode Standalone).` };
    }

    try {
      const items = keranjang.map((item) => ({
        tagihan_id: item.tagihan_id,
        nominal_bayar: item.nominal_bayar,
      }));

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (payload.idempotency_key) {
        headers["Idempotency-Key"] = payload.idempotency_key;
      }

      const httpRes = await safeFetchJson<{
        ok: boolean;
        message: string;
        nomor_transaksi?: string;
        is_idempotent_replay?: boolean;
      }>("/api/keuangan/transaksi", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "CHECKOUT_PEMBAYARAN",
          santri_id: activeSantriId,
          items,
          tanggal_transfer: payload.tanggal_transfer,
          nama_pengirim: payload.nama_pengirim,
          bank_pengirim: payload.bank_pengirim,
          bukti_transfer: payload.bukti_transfer_url,
          bukti_transfer_url: payload.bukti_transfer_url,
          idempotency_key: payload.idempotency_key,
        }),
      });

      if (!httpRes.ok || !httpRes.data?.ok) {
        return {
          ok: false,
          message: httpRes.data?.message || httpRes.message || "Gagal menyimpan transaksi ke server.",
        };
      }

      const data = httpRes.data;

      // Refresh instan antrean bendahara secara terisolasi (<150ms)
      await refreshAntreanBendaharaOnly(true);
      refreshFromSupabase().catch(() => {});
      setKeranjang([]);
      return {
        ok: true,
        message: data.message || `Pengajuan pembayaran ${data.nomor_transaksi} berhasil disimpan permanen.`,
        is_idempotent_replay: data.is_idempotent_replay === true,
      };
    } catch (err: any) {
      return { ok: false, message: `Kesalahan jaringan: ${err?.message || "Tidak dapat menghubungi server."}` };
    }
  };

  const uploadBuktiTransferPembayaran: SipetaContextValue["uploadBuktiTransferPembayaran"] = (
    payload
  ) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    const trx = transaksiPembayaranList.find((t) => t.id === payload.transaksi_id);
    if (!trx) return { ok: false, message: "Transaksi pembayaran tidak ditemukan." };
    if (currentUser.role === "wali" && trx.wali_user_id !== currentUser.id) {
      return {
        ok: false,
        message: "Anda hanya dapat mengunggah bukti untuk transaksi milik akun Anda.",
      };
    }
    if (trx.status !== "MENUNGGU_TRANSFER" && trx.status !== "MENUNGGU_VERIFIKASI") {
      return {
        ok: false,
        message: `Bukti transfer tidak dapat diunggah untuk transaksi dengan status ${trx.status}.`,
      };
    }

    setTransaksiPembayaranList((prev) =>
      prev.map((t) =>
        t.id === payload.transaksi_id
          ? {
            ...t,
            tanggal_transfer: payload.tanggal_transfer,
            nama_pengirim: payload.nama_pengirim.trim(),
            bank_pengirim: payload.bank_pengirim.trim(),
            bukti_transfer_url: payload.bukti_transfer_url,
            status: "MENUNGGU_VERIFIKASI",
          }
          : t
      )
    );

    appendAuditLog("UNGGAH_BUKTI_TRANSFER", "transaksi_pembayaran", trx.id, {
      status: "MENUNGGU_VERIFIKASI",
      bukti_transfer_url: payload.bukti_transfer_url,
    });

    if (authMode === "supabase") {
      keuanganService
        .unggahBuktiTransferSusulan(payload.transaksi_id, {
          tanggalTransfer: payload.tanggal_transfer,
          namaPengirim: payload.nama_pengirim.trim(),
          bankPengirim: payload.bank_pengirim.trim(),
          buktiTransferPath: payload.bukti_transfer_url,
        })
        .then((res) => {
          if (res.ok) {
            refreshAntreanBendaharaOnly(true);
            refreshFromSupabase();
          }
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Bukti transfer untuk transaksi ${trx.nomor_transaksi} berhasil dikirim dan siap diverifikasi Bendahara.`,
    };
  };

  const submitTopupUangSaku: SipetaContextValue["submitTopupUangSaku"] = async (payload) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    if (!rekeningResmi || !rekeningResmi.is_active) {
      return {
        ok: false,
        message: "Rekening resmi pesantren belum dikonfigurasi atau tidak aktif. Top up uang saku belum dapat diproses.",
      };
    }
    if (!payload.nominal || payload.nominal <= 0) {
      return { ok: false, message: "Nominal top-up harus lebih dari 0." };
    }
    if (!payload.nama_pengirim?.trim()) {
      return { ok: false, message: "Nama pengirim wajib diisi." };
    }

    const activeSantriId = currentUser.santri_id ?? "";
    if (!activeSantriId) {
      return { ok: false, message: "Akun Anda belum terhubung dengan data santri resmi." };
    }

    // Mode Demo: simulasi lokal tanpa Supabase
    if (authMode !== "supabase") {
      const nomorPengajuan = `TOPUP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-DEMO`;
      return {
        ok: true,
        message: `[Demo] Pengajuan top-up ${nomorPengajuan} Rp ${payload.nominal.toLocaleString("id-ID")} dikirim (Mode Standalone).`,
      };
    }

    try {
      const httpRes = await safeFetchJson<{
        ok: boolean;
        message: string;
        nomor_pengajuan?: string;
      }>("/api/keuangan/transaksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_TOPUP",
          santri_id: activeSantriId,
          nominal: payload.nominal,
          tanggal_transfer: payload.tanggal_transfer,
          nama_pengirim: payload.nama_pengirim,
          bank_pengirim: payload.bank_pengirim,
          bukti_transfer: payload.bukti_transfer_url,
          bukti_transfer_url: payload.bukti_transfer_url,
          keterangan: payload.keterangan,
        }),
      });

      if (!httpRes.ok || !httpRes.data?.ok) {
        return {
          ok: false,
          message: httpRes.data?.message || httpRes.message || "Gagal menyimpan pengajuan top-up ke server.",
        };
      }

      const data = httpRes.data;

      // Refresh instan antrean bendahara secara terisolasi (<150ms)
      await refreshAntreanBendaharaOnly(true);
      refreshFromSupabase().catch(() => {});
      return {
        ok: true,
        message: data.message || `Pengajuan top-up ${data.nomor_pengajuan} berhasil disimpan permanen dan menunggu verifikasi Bendahara.`,
      };
    } catch (err: any) {
      return { ok: false, message: `Kesalahan jaringan: ${err?.message || "Tidak dapat menghubungi server."}` };
    }
  };

  const markNotifikasiRead = (notifikasiId: string) => {
    setNotifikasiList((prev) =>
      prev.map((n) => (n.id === notifikasiId ? { ...n, is_read: true } : n))
    );
    if (authMode === "supabase") {
      notifikasiService.markAsRead(notifikasiId).catch(console.error);
    }
  };

  const markAllNotifikasiRead = () => {
    if (!currentUser) return;
    setNotifikasiList((prev) =>
      prev.map((n) => (n.user_id === currentUser.id ? { ...n, is_read: true } : n))
    );
    if (authMode === "supabase") {
      notifikasiService.markAllAsRead().catch(console.error);
    }
  };

  // ============================================================================
  // BENDAHARA ACTIONS (VERIFIKASI ATOMIK & UANG KELUAR WAJIB FOTO)
  // ============================================================================

  const verifyTransaksiPembayaran: SipetaContextValue["verifyTransaksiPembayaran"] = async (
    transaksiId,
    keputusan,
    catatan
  ) => {
    if (!currentUser || !canRoleApproveFinancialTransaction(currentUser.role)) {
      return {
        ok: false,
        message: "OTORISASI DITOLAK: Sesuai kebijakan pesantren, hanya Bendahara yang berwenang menyetujui atau menolak transaksi pembayaran.",
      };
    }

    if (keputusan === "DITOLAK" && catatan.trim().length < 4) {
      return { ok: false, message: "Catatan alasan penolakan wajib diisi." };
    }

    // Mode Demo: lakukan perubahan state lokal saja
    if (authMode !== "supabase") {
      const trx = transaksiPembayaranList.find((t) => t.id === transaksiId);
      if (!trx) return { ok: false, message: "Transaksi tidak ditemukan." };
      if (trx.status !== "MENUNGGU_VERIFIKASI") {
        return { ok: false, message: `Transaksi ${trx.nomor_transaksi} sudah diproses (${trx.status}).` };
      }
      if (keputusan === "DISETUJUI") {
        for (const alk of trx.alokasi) {
          const bill = tagihanList.find((b) => b.id === alk.tagihan_id);
          if (!bill || bill.sisa_tagihan < alk.nominal_alokasi) {
            return { ok: false, message: `Alokasi pada "${alk.judul_tagihan}" melebihi sisa kewajiban.` };
          }
        }
        setTagihanList((prev) =>
          prev.map((bill) => {
            const alk = trx.alokasi.find((a) => a.tagihan_id === bill.id);
            if (!alk) return bill;
            const totalTerbayarBaru = bill.total_terbayar + alk.nominal_alokasi;
            const sisaBaru = bill.nominal_tagihan - totalTerbayarBaru;
            return { ...bill, total_terbayar: totalTerbayarBaru, sisa_tagihan: Math.max(0, sisaBaru), status: (sisaBaru <= 0 ? "LUNAS" : "DIBAYAR_SEBAGIAN") as StatusTagihan };
          })
        );
      }
      setTransaksiPembayaranList((prev) =>
        prev.map((t) => t.id === transaksiId ? { ...t, status: keputusan, catatan_verifikasi: catatan } : t)
      );
      return { ok: true, message: `Transaksi ${trx.nomor_transaksi} berhasil ${keputusan === "DISETUJUI" ? "disetujui" : "ditolak"}.` };
    }

    try {
      const httpRes = await safeFetchJson<{ ok: boolean; message: string }>("/api/keuangan/transaksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "VERIFIKASI_PEMBAYARAN",
          transaksi_id: transaksiId,
          keputusan,
          catatan,
        }),
      });

      if (!httpRes.ok || !httpRes.data?.ok) {
        return {
          ok: false,
          message: httpRes.data?.message || httpRes.message || "Gagal memverifikasi transaksi.",
        };
      }

      const data = httpRes.data;

      await refreshFromSupabase();
      return {
        ok: true,
        message: data.message || `Transaksi berhasil ${keputusan === "DISETUJUI" ? "disetujui dan tagihan diperbarui" : "ditolak"}.`,
      };
    } catch (err: any) {
      return { ok: false, message: `Kesalahan jaringan: ${err?.message || "Tidak dapat menghubungi server."}` };
    }
  };

  const verifyTopupUangSaku: SipetaContextValue["verifyTopupUangSaku"] = async (
    pengajuanId,
    keputusan,
    catatan
  ) => {
    if (!currentUser || !canRoleApproveFinancialTransaction(currentUser.role)) {
      return {
        ok: false,
        message: "OTORISASI DITOLAK: Hanya Bendahara yang berwenang memverifikasi uang saku.",
      };
    }

    if (keputusan === "DITOLAK" && catatan.trim().length < 4) {
      return { ok: false, message: "Alasan penolakan wajib diisi." };
    }

    // Mode Demo: lakukan perubahan state lokal saja
    if (authMode !== "supabase") {
      const pengajuan = pengajuanUangSakuList.find((p) => p.id === pengajuanId);
      if (!pengajuan) return { ok: false, message: "Pengajuan uang saku tidak ditemukan." };
      if (pengajuan.status !== "MENUNGGU_VERIFIKASI") {
        return { ok: false, message: "Pengajuan ini sudah diverifikasi sebelumnya." };
      }
      if (keputusan === "DISETUJUI") {
        const currentLedger = getSaldoSantri(pengajuan.santri_id);
        const saldoSebelum = currentLedger.saldo_saat_ini;
        const saldoSesudah = saldoSebelum + pengajuan.nominal;
        const nomorMutasi = `SAK-IN-${Date.now()}`;
        const mutasiMasuk: MutasiUangSaku = { id: `mut-${Date.now()}`, nomor_transaksi: nomorMutasi, santri_id: pengajuan.santri_id, jenis_mutasi: "MASUK", nominal: pengajuan.nominal, saldo_sebelum: saldoSebelum, saldo_sesudah: saldoSesudah, keterangan: `${pengajuan.keterangan} (${pengajuan.nomor_pengajuan})`, pengajuan_id: pengajuan.id, petugas_nama: currentUser.nama_lengkap, created_at: new Date().toISOString() };
        setMutasiUangSakuList((prev) => [mutasiMasuk, ...prev]);
      }
      setPengajuanUangSakuList((prev) => prev.map((p) => p.id === pengajuanId ? { ...p, status: keputusan, catatan_verifikasi: catatan } : p));
      return { ok: true, message: keputusan === "DISETUJUI" ? `Top-up disetujui dan saldo santri bertambah.` : `Pengajuan top-up ditolak.` };
    }

    try {
      const httpRes = await safeFetchJson<{ ok: boolean; message: string }>("/api/keuangan/transaksi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "VERIFIKASI_TOPUP",
          pengajuan_id: pengajuanId,
          keputusan,
          catatan,
        }),
      });

      if (!httpRes.ok || !httpRes.data?.ok) {
        return {
          ok: false,
          message: httpRes.data?.message || httpRes.message || "Gagal memverifikasi pengajuan top-up.",
        };
      }

      const data = httpRes.data;

      await refreshFromSupabase();
      return {
        ok: true,
        message: data.message || `Pengajuan top-up berhasil ${keputusan === "DISETUJUI" ? "disetujui dan saldo santri ditambahkan" : "ditolak"}.`,
      };
    } catch (err: any) {
      return { ok: false, message: `Kesalahan jaringan: ${err?.message || "Tidak dapat menghubungi server."}` };
    }
  };

  const recordPenyerahanUangSaku: SipetaContextValue["recordPenyerahanUangSaku"] = (payload) => {
    if (!currentUser || !canRoleApproveFinancialTransaction(currentUser.role)) {
      return {
        ok: false,
        message: "OTORISASI DITOLAK: Hanya Bendahara yang berwenang mencatat pengeluaran uang saku.",
      };
    }

    const parsed = penyerahanUangSakuSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Foto penyerahan uang saku wajib diunggah sebelum transaksi disahkan.",
      };
    }

    const currentLedger = getSaldoSantri(payload.santri_id);
    if (currentLedger.saldo_saat_ini < payload.nominal) {
      return {
        ok: false,
        message: `Saldo santri tidak mencukupi. Saldo saat ini: Rp ${currentLedger.saldo_saat_ini.toLocaleString(
          "id-ID"
        )}, nominal penarikan: Rp ${payload.nominal.toLocaleString("id-ID")}.`,
      };
    }

    const saldoSebelum = currentLedger.saldo_saat_ini;
    const saldoSesudah = saldoSebelum - payload.nominal;
    const nomorMutasi = `SAK-OUT-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const mutasiKeluar: MutasiUangSaku = {
      id: `mut-${Date.now()}`,
      nomor_transaksi: nomorMutasi,
      santri_id: payload.santri_id,
      jenis_mutasi: "KELUAR",
      nominal: payload.nominal,
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      keterangan: payload.keterangan.trim(),
      foto_penyerahan_url: payload.foto_penyerahan_url,
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setMutasiUangSakuList((prev) => [mutasiKeluar, ...prev]);

    notifyWaliOfSantri(
      payload.santri_id,
      "SAKU_DISERAHKAN",
      "Uang Saku Diserahkan kepada Santri",
      `Penyerahan uang saku sebesar Rp ${payload.nominal.toLocaleString("id-ID")} (${payload.keterangan
      }) telah dicatat lengkap dengan foto penyerahan.`,
      "/wali/uang-saku"
    );

    appendAuditLog("PENYERAHAN_UANG_SAKU", "mutasi_uang_saku", mutasiKeluar.id, {
      nomor_transaksi: nomorMutasi,
      nominal: payload.nominal,
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      foto_penyerahan_terlampir: true,
    });

    if (authMode === "supabase") {
      keuanganService
        .catatPenyerahanUangSaku({
          santriId: payload.santri_id,
          nominal: payload.nominal,
          keterangan: payload.keterangan.trim(),
          fotoPenyerahanPath: payload.foto_penyerahan_url,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Penyerahan uang saku ${nomorMutasi} sebesar Rp ${payload.nominal.toLocaleString(
        "id-ID"
      )} beserta bukti foto berhasil disahkan.`,
    };
  };

  const recordKoreksiLedgerSaku: SipetaContextValue["recordKoreksiLedgerSaku"] = (payload) => {
    if (!currentUser || (currentUser.role !== "bendahara" && currentUser.role !== "superadmin")) {
      return {
        ok: false,
        message: "Hanya Bendahara atau Superadmin yang dapat membuat transaksi koreksi/pembalik.",
      };
    }

    const parsed = koreksiLedgerSakuSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Data koreksi tidak valid.",
      };
    }

    const refMutasi = mutasiUangSakuList.find((m) => m.id === payload.referensi_mutasi_id);
    if (!refMutasi) {
      return { ok: false, message: "Transaksi referensi yang akan dikoreksi tidak ditemukan." };
    }

    const currentLedger = getSaldoSantri(refMutasi.santri_id);
    if (
      payload.jenis_mutasi === "PENYESUAIAN_KURANG" &&
      currentLedger.saldo_saat_ini < payload.nominal
    ) {
      return {
        ok: false,
        message: "Saldo santri tidak mencukupi untuk penyesuaian pengurangan.",
      };
    }

    const saldoSebelum = currentLedger.saldo_saat_ini;
    const saldoSesudah =
      payload.jenis_mutasi === "PENYESUAIAN_TAMBAH"
        ? saldoSebelum + payload.nominal
        : saldoSebelum - payload.nominal;

    const nomorMutasi = `SAK-ADJ-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const mutasiAdj: MutasiUangSaku = {
      id: `mut-${Date.now()}`,
      nomor_transaksi: nomorMutasi,
      santri_id: refMutasi.santri_id,
      jenis_mutasi: payload.jenis_mutasi,
      nominal: payload.nominal,
      saldo_sebelum: saldoSebelum,
      saldo_sesudah: saldoSesudah,
      keterangan: `Jurnal Koreksi atas ${refMutasi.nomor_transaksi}`,
      referensi_mutasi_id: refMutasi.id,
      alasan_koreksi: payload.alasan_koreksi.trim(),
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setMutasiUangSakuList((prev) => [mutasiAdj, ...prev]);
    appendAuditLog(
      "KOREKSI_LEDGER_UANG_SAKU",
      "mutasi_uang_saku",
      mutasiAdj.id,
      {
        referensi_transaksi: refMutasi.nomor_transaksi,
        jenis_mutasi: payload.jenis_mutasi,
        nominal: payload.nominal,
        saldo_sesudah: saldoSesudah,
      },
      payload.alasan_koreksi
    );

    if (authMode === "supabase") {
      keuanganService
        .koreksiLedgerUangSaku(
          payload.referensi_mutasi_id,
          payload.jenis_mutasi,
          payload.nominal,
          payload.alasan_koreksi.trim()
        )
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message: `Jurnal penyesuaian ${nomorMutasi} berhasil dicatat tanpa mengubah/menghapus histori asli.`,
    };
  };

  // ============================================================================
  // PENGELOLA KEPESANTRENAN ACTIONS
  // ============================================================================

  const recordPerkembanganMengaji: SipetaContextValue["recordPerkembanganMengaji"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya Asatidz, Bendahara, atau Admin yang berwenang mencatat perkembangan mengaji." };
    }
    const item: PerkembanganMengaji = {
      ...payload,
      id: `ngj-${Date.now()}`,
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };
    setMengajiList((prev) => [item, ...prev]);

    notifyWaliOfSantri(
      payload.santri_id,
      "MENGAJI_UPDATE",
      `Perkembangan Mengaji: ${payload.tingkat_jilid}`,
      `Evaluasi mengaji terbaru (${payload.materi_terakhir}) telah dicatat oleh ${payload.pembimbing_name}.`,
      "/wali/kepesantrenan"
    );
    appendAuditLog("CATAT_PERKEMBANGAN_MENGAJI", "perkembangan_mengaji", item.id, {
      santri_id: item.santri_id,
      materi_terakhir: item.materi_terakhir,
    });

    if (authMode === "supabase") {
      kepesantrenanService
        .catatPerkembanganMengaji({
          santri_id: payload.santri_id,
          tanggal_penilaian: payload.tanggal_penilaian,
          pembimbing_name: payload.pembimbing_name,
          metode_pembelajaran: payload.metode_pembelajaran,
          tingkat_jilid: payload.tingkat_jilid,
          materi_terakhir: payload.materi_terakhir,
          kelancaran_bacaan: payload.kelancaran_bacaan,
          makharijul_huruf: payload.makharijul_huruf,
          tajwid: payload.tajwid,
          catatan_perkembangan: payload.catatan_perkembangan,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Catatan perkembangan mengaji berhasil disimpan." };
  };

  const updatePenilaianMengaji: SipetaContextValue["updatePenilaianMengaji"] = async (id, payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.updatePenilaianMengaji(id, payload);
      if (!res.ok) return { ok: false, message: res.message };
      setMengajiList((prev) => prev.map((m) => (m.id === id ? { ...m, ...payload } : m)));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Evaluasi mengaji berhasil diperbarui." };
    }
    setMengajiList((prev) => prev.map((m) => (m.id === id ? { ...m, ...payload } : m)));
    return { ok: true, message: "Evaluasi mengaji berhasil diperbarui." };
  };

  const deletePenilaianMengaji: SipetaContextValue["deletePenilaianMengaji"] = async (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.deletePenilaianMengaji(id);
      if (!res.ok) return { ok: false, message: res.message };
      setMengajiList((prev) => prev.filter((m) => m.id !== id));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Catatan evaluasi mengaji berhasil dihapus." };
    }
    setMengajiList((prev) => prev.filter((m) => m.id !== id));
    return { ok: true, message: "Catatan evaluasi mengaji berhasil dihapus." };
  };

  const updateSetoranTahfidz: SipetaContextValue["updateSetoranTahfidz"] = async (id, payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.updateSetoranTahfidz(id, payload);
      if (!res.ok) return { ok: false, message: res.message };
      setTahfidzList((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Setoran tahfidz berhasil diperbarui." };
    }
    setTahfidzList((prev) => prev.map((t) => (t.id === id ? { ...t, ...payload } : t)));
    return { ok: true, message: "Setoran tahfidz berhasil diperbarui." };
  };

  const deleteSetoranTahfidz: SipetaContextValue["deleteSetoranTahfidz"] = async (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.deleteSetoranTahfidz(id);
      if (!res.ok) return { ok: false, message: res.message };
      setTahfidzList((prev) => prev.filter((t) => t.id !== id));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Setoran tahfidz berhasil dihapus." };
    }
    setTahfidzList((prev) => prev.filter((t) => t.id !== id));
    return { ok: true, message: "Setoran tahfidz berhasil dihapus." };
  };

  const updatePrestasiSantri: SipetaContextValue["updatePrestasiSantri"] = async (id, payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.updatePrestasiSantri(id, payload);
      if (!res.ok) return { ok: false, message: res.message };
      setPrestasiList((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Data prestasi santri berhasil diperbarui." };
    }
    setPrestasiList((prev) => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
    return { ok: true, message: "Data prestasi santri berhasil diperbarui." };
  };

  const deletePrestasiSantri: SipetaContextValue["deletePrestasiSantri"] = async (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    if (authMode === "supabase") {
      const res = await kepesantrenanService.deletePrestasiSantri(id);
      if (!res.ok) return { ok: false, message: res.message };
      setPrestasiList((prev) => prev.filter((p) => p.id !== id));
      void refreshFromSupabase().catch(() => {});
      return { ok: true, message: "Data prestasi santri berhasil dihapus." };
    }
    setPrestasiList((prev) => prev.filter((p) => p.id !== id));
    return { ok: true, message: "Data prestasi santri berhasil dihapus." };
  };

  const recordSetoranTahfidz: SipetaContextValue["recordSetoranTahfidz"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya Asatidz, Bendahara, atau Admin yang berwenang mencatat tahfidz." };
    }
    if (payload.ayat_akhir < payload.ayat_awal) {
      return { ok: false, message: "Ayat akhir tidak boleh lebih kecil dari ayat awal." };
    }
    const jumlahAyat = payload.ayat_akhir - payload.ayat_awal + 1;
    const item: SetoranTahfidz = {
      ...payload,
      id: `thf-${Date.now()}`,
      jumlah_ayat: jumlahAyat,
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };
    setTahfidzList((prev) => [item, ...prev]);

    notifyWaliOfSantri(
      payload.santri_id,
      "TAHFIDZ_UPDATE",
      `Setoran Tahfidz: ${payload.nama_surah} (${jumlahAyat} Ayat)`,
      `Setoran ${payload.jenis_setoran === "HAFALAN_BARU" ? "Hafalan Baru" : "Murojaah"} ${payload.nama_surah
      } ayat ${payload.ayat_awal}-${payload.ayat_akhir} tercatat dengan predikat ${payload.kualitas_hafalan
      }.`,
      "/wali/kepesantrenan"
    );
    appendAuditLog("CATAT_SETORAN_TAHFIDZ", "setoran_tahfidz", item.id, {
      santri_id: item.santri_id,
      surah: item.nama_surah,
      jumlah_ayat: jumlahAyat,
    });

    if (authMode === "supabase") {
      kepesantrenanService
        .catatSetoranTahfidz({
          santri_id: payload.santri_id,
          tanggal_setoran: payload.tanggal_setoran,
          pembimbing_name: payload.pembimbing_name,
          nama_surah: payload.nama_surah,
          juz: payload.juz,
          ayat_awal: payload.ayat_awal,
          ayat_akhir: payload.ayat_akhir,
          jenis_setoran: payload.jenis_setoran,
          kualitas_hafalan: payload.kualitas_hafalan,
          catatan_pembimbing: payload.catatan_pembimbing,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Setoran tahfidz santri berhasil disimpan." };
  };

  const recordPrestasiSantri: SipetaContextValue["recordPrestasiSantri"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya Asatidz, Bendahara, atau Admin yang berwenang mencatat prestasi." };
    }
    const item: PrestasiSantri = {
      ...payload,
      id: `prs-${Date.now()}`,
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };
    setPrestasiList((prev) => [item, ...prev]);

    notifyWaliOfSantri(
      payload.santri_id,
      "PRESTASI_BARU",
      `Prestasi Baru: ${payload.peringkat} - ${payload.nama_kegiatan}`,
      `Alhamdulillah, ananda meraih ${payload.peringkat} pada ${payload.nama_kegiatan} tingkat ${payload.tingkat_prestasi}.`,
      "/wali/kepesantrenan"
    );
    appendAuditLog("CATAT_PRESTASI_SANTRI", "prestasi_santri", item.id, {
      santri_id: item.santri_id,
      nama_kegiatan: item.nama_kegiatan,
      peringkat: item.peringkat,
    });

    if (authMode === "supabase") {
      kepesantrenanService
        .catatPrestasiSantri({
          santri_id: payload.santri_id,
          tanggal_prestasi: payload.tanggal_prestasi,
          nama_kegiatan: payload.nama_kegiatan,
          kategori: payload.kategori,
          tingkat_prestasi: payload.tingkat_prestasi,
          peringkat: payload.peringkat,
          deskripsi: payload.deskripsi,
          dokumentasi_path: payload.dokumentasi_url,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Data prestasi santri berhasil disimpan." };
  };

  const recordCatatanKedisiplinan: SipetaContextValue["recordCatatanKedisiplinan"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return {
        ok: false,
        message: "Hanya Tata Usaha, Asatidz, Bendahara, atau Admin yang dapat mencatat kedisiplinan.",
      };
    }
    const kategori = masterPelanggaranList.find((k) => k.id === payload.kategori_id);
    if (!kategori) return { ok: false, message: "Kategori pelanggaran tidak ditemukan." };

    const item: CatatanKedisiplinan = {
      id: `dis-${Date.now()}`,
      santri_id: payload.santri_id,
      tanggal_kejadian: payload.tanggal_kejadian,
      waktu_kejadian: payload.waktu_kejadian,
      kategori_id: kategori.id,
      nama_kategori: kategori.nama_kategori,
      tingkat_pelanggaran: kategori.tingkat_pelanggaran,
      deskripsi: payload.deskripsi.trim(),
      tindak_lanjut: payload.tindak_lanjut.trim(),
      catatan_pembinaan: payload.catatan_pembinaan.trim(),
      status_tindak_lanjut: payload.status_tindak_lanjut,
      petugas_nama: currentUser.nama_lengkap,
      riwayat_perubahan: [],
      created_at: new Date().toISOString(),
    };

    setKedisiplinanList((prev) => [item, ...prev]);

    notifyWaliOfSantri(
      payload.santri_id,
      "KEDISIPLINAN_BARU",
      `Catatan Pembinaan & Kedisiplinan: ${kategori.nama_kategori}`,
      `Terdapat catatan pembinaan kedisiplinan baru beserta tindak lanjut pembinaan santri.`,
      "/wali/kepesantrenan"
    );
    appendAuditLog("CATAT_KEDISIPLINAN_SANTRI", "catatan_kedisiplinan", item.id, {
      santri_id: item.santri_id,
      kategori: item.nama_kategori,
      status: item.status_tindak_lanjut,
    });

    if (authMode === "supabase") {
      kepesantrenanService
        .catatKedisiplinan({
          santri_id: payload.santri_id,
          tanggal_kejadian: payload.tanggal_kejadian,
          waktu_kejadian: payload.waktu_kejadian,
          kategori_id: payload.kategori_id,
          deskripsi: payload.deskripsi,
          tindak_lanjut: payload.tindak_lanjut,
          catatan_pembinaan: payload.catatan_pembinaan,
          status_tindak_lanjut: payload.status_tindak_lanjut,
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Catatan kedisiplinan & pembinaan berhasil disimpan." };
  };

  const updateCatatanKedisiplinan: SipetaContextValue["updateCatatanKedisiplinan"] = (id, payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    const target = kedisiplinanList.find((c) => c.id === id);
    if (!target) return { ok: false, message: "Catatan kedisiplinan tidak ditemukan." };

    setKedisiplinanList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...payload } : c))
    );

    appendAuditLog("UPDATE_KEDISIPLINAN_SANTRI", "catatan_kedisiplinan", id, payload);

    if (authMode === "supabase") {
      kepesantrenanService
        .updateCatatanKedisiplinan(id, payload)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Catatan kedisiplinan berhasil diperbarui." };
  };

  const deleteCatatanKedisiplinan: SipetaContextValue["deleteCatatanKedisiplinan"] = (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Akses ditolak." };
    }
    const target = kedisiplinanList.find((c) => c.id === id);
    if (!target) return { ok: false, message: "Catatan kedisiplinan tidak ditemukan." };

    setKedisiplinanList((prev) => prev.filter((c) => c.id !== id));

    appendAuditLog("HAPUS_KEDISIPLINAN_SANTRI", "catatan_kedisiplinan", id, {
      santri_id: target.santri_id,
      kategori: target.nama_kategori,
    });

    if (authMode === "supabase") {
      kepesantrenanService
        .deleteCatatanKedisiplinan(id)
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return { ok: true, message: "Catatan kedisiplinan berhasil dihapus secara aman." };
  };

  const updateTindakLanjutKedisiplinan: SipetaContextValue["updateTindakLanjutKedisiplinan"] = (
    payload
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya Asatidz, Bendahara, TU, atau Admin yang dapat memperbarui pembinaan." };
    }
    const target = kedisiplinanList.find((c) => c.id === payload.catatan_id);
    if (!target) return { ok: false, message: "Catatan kedisiplinan tidak ditemukan." };

    // Bab 10 PRD: Riwayat catatan sebelumnya tetap tersedia ketika diperbarui
    const riwayatItem = {
      id: `rwd-${Date.now()}`,
      catatan_kedisiplinan_id: target.id,
      tindak_lanjut_sebelum: target.tindak_lanjut,
      catatan_pembinaan_sebelum: target.catatan_pembinaan,
      status_sebelum: target.status_tindak_lanjut,
      status_sesudah: payload.status_baru,
      alasan_perubahan: payload.alasan_perubahan.trim() || "Pembaruan status pembinaan",
      diubah_oleh_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setKedisiplinanList((prev) =>
      prev.map((c) =>
        c.id === target.id
          ? {
            ...c,
            tindak_lanjut: payload.tindak_lanjut_baru.trim(),
            catatan_pembinaan: payload.catatan_pembinaan_baru.trim(),
            status_tindak_lanjut: payload.status_baru,
            riwayat_perubahan: [riwayatItem, ...c.riwayat_perubahan],
          }
          : c
      )
    );

    appendAuditLog(
      "UPDATE_TINDAK_LANJUT_KEDISIPLINAN",
      "catatan_kedisiplinan",
      target.id,
      { status_sesudah: payload.status_baru },
      payload.alasan_perubahan,
      { status_sebelum: target.status_tindak_lanjut }
    );

    if (authMode === "supabase") {
      kepesantrenanService
        .updateTindakLanjutKedisiplinan(target.id, {
          status_tindak_lanjut: payload.status_baru,
          tindak_lanjut: payload.tindak_lanjut_baru.trim(),
          catatan_pembinaan: payload.catatan_pembinaan_baru.trim(),
          alasan_perubahan: payload.alasan_perubahan.trim() || "Pembaruan status pembinaan",
        })
        .then((res) => {
          if (res.ok) refreshFromSupabase();
        })
        .catch(console.error);
    }

    return {
      ok: true,
      message:
        "Status tindak lanjut berhasil diperbarui dan catatan sebelumnya tetap tersimpan di riwayat perubahan.",
    };
  };

  const createMasterKategoriPelanggaran: SipetaContextValue["createMasterKategoriPelanggaran"] = async (
    payload
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Asatidz, Bendahara, atau Superadmin yang berwenang menambah kategori pelanggaran." };
    }

    if (authMode === "supabase") {
      const res = await kepesantrenanService.createMasterKategoriPelanggaran(payload);
      if (res.ok && res.data) {
        setMasterPelanggaranList((prev) => [...prev, res.data!]);
        appendAuditLog("TAMBAH_MASTER_KATEGORI_PELANGGARAN", "master_kategori_pelanggaran", res.data.id, {
          kode_kategori: payload.kode_kategori,
          nama_kategori: payload.nama_kategori,
          tingkat_pelanggaran: payload.tingkat_pelanggaran,
        });
        return { ok: true, message: "Kategori pelanggaran berhasil ditambahkan ke database." };
      }
      if (!res.ok) {
        return { ok: false, message: res.message };
      }
    }

    // Demo / Standalone fallback
    const newItem: MasterKategoriPelanggaran = {
      id: `kat-${Date.now()}`,
      kode_kategori: payload.kode_kategori.trim().toUpperCase(),
      nama_kategori: payload.nama_kategori.trim(),
      tingkat_pelanggaran: payload.tingkat_pelanggaran,
      poin_pembinaan: payload.poin_pembinaan,
      standar_tindak_lanjut: payload.standar_tindak_lanjut.trim(),
      is_active: payload.is_active !== false,
      created_at: new Date().toISOString(),
    };
    setMasterPelanggaranList((prev) => [...prev, newItem]);
    appendAuditLog("TAMBAH_MASTER_KATEGORI_PELANGGARAN", "master_kategori_pelanggaran", newItem.id, {
      kode_kategori: newItem.kode_kategori,
      nama_kategori: newItem.nama_kategori,
    });
    return { ok: true, message: "Kategori pelanggaran baru berhasil ditambahkan." };
  };

  const updateMasterKategoriPelanggaran: SipetaContextValue["updateMasterKategoriPelanggaran"] = async (
    id,
    payload
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Asatidz, Bendahara, atau Superadmin yang berwenang mengubah kategori pelanggaran." };
    }

    if (authMode === "supabase") {
      const res = await kepesantrenanService.updateMasterKategoriPelanggaran(id, payload);
      if (!res.ok) return { ok: false, message: res.message };
    }

    setMasterPelanggaranList((prev) =>
      prev.map((k) => (k.id === id ? { ...k, ...payload } : k))
    );
    appendAuditLog("UBAH_MASTER_KATEGORI_PELANGGARAN", "master_kategori_pelanggaran", id, payload);
    return { ok: true, message: "Kategori pelanggaran berhasil diperbarui." };
  };

  const deleteMasterKategoriPelanggaranBatch: SipetaContextValue["deleteMasterKategoriPelanggaranBatch"] = async (
    ids
  ) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "bendahara" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Asatidz, Bendahara, atau Superadmin yang berwenang menghapus kategori pelanggaran." };
    }
    if (!ids || ids.length === 0) {
      return { ok: false, message: "Pilih setidaknya satu kategori pelanggaran untuk dihapus." };
    }

    if (authMode === "supabase") {
      const res = await kepesantrenanService.deleteMasterKategoriPelanggaranBatch(ids);
      // Refresh list dari server untuk memastikan sinkronisasi akurat
      const refreshed = await kepesantrenanService.getMasterKategoriPelanggaran(true);
      setMasterPelanggaranList(refreshed);
      return {
        ok: res.ok,
        message: `${res.message} (Dihapus: ${res.summary.deleted}, Dinonaktifkan: ${res.summary.deactivated}, Gagal: ${res.summary.failed})`,
      };
    }

    // Demo Mode logic: periksa penggunaan di kedisiplinanList
    let delCount = 0;
    let deactCount = 0;
    const usedKategoriIds = new Set(kedisiplinanList.map((c) => c.kategori_id));

    setMasterPelanggaranList((prev) => {
      const remaining: MasterKategoriPelanggaran[] = [];
      for (const k of prev) {
        if (!ids.includes(k.id)) {
          remaining.push(k);
        } else {
          if (usedKategoriIds.has(k.id)) {
            // Soft deactivate
            remaining.push({ ...k, is_active: false });
            deactCount++;
          } else {
            // Clean hard delete
            delCount++;
          }
        }
      }
      return remaining;
    });

    appendAuditLog("HAPUS_MASTER_KATEGORI_PELANGGARAN_BATCH", "master_kategori_pelanggaran", ids.join(","), {
      total: ids.length,
      deleted: delCount,
      deactivated: deactCount,
    });

    return {
      ok: true,
      message: `Proses selesai: ${delCount} kategori dihapus bersih, ${deactCount} dinonaktifkan secara aman karena memiliki riwayat pembinaan santri.`,
    };
  };

  return (
    <SipetaContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        authMode,
        authLoading,
        users,
        rekeningResmi,
        rekeningList,
        profilPesantren,
        tahunAjaranList,
        tahunAjaranAktif,
        kelasList,
        kamarList,
        santriList,
        waliList,
        riwayatPenempatan,
        jenisPembayaranList,
        tagihanList,
        riwayatPenyesuaianTagihan,
        keranjang,
        transaksiPembayaranList,
        pengajuanUangSakuList,
        mutasiUangSakuList,
        mengajiList,
        tahfidzList,
        prestasiList,
        masterPelanggaranList,
        kedisiplinanList,
        pengumumanList,
        dokumenList,
        notifikasiList,
        auditLogs,
        // Status Koneksi Backend
        connectionStatus,
        isLiveSupabase,
        dataSource,
        healthStatus,
        refreshFromSupabase,
        loginWithSupabase,
        logout,
        logoutSupabase,
        enterDemoMode,
        exitDemoMode,

        switchActiveUser,
        getSaldoSantri,
        resetDemoData,
        changePassword,
        updateMyProfile,
        createUserAccount,
        manageUserAccount,
        toggleUserActive,
        resetUserPassword,
        updateUserProfile,
        deleteUserAccount,
        deleteUserAccountBatch,
        updateRekeningResmi,
        createRekening,
        updateRekening,
        setUtamaRekening,
        activateRekening,
        deactivateRekening,
        toggleActiveRekening,
        refreshRekeningOnly,
        deleteRekening,
        updateProfilPesantren,
        setActiveTahunAjaran,
        setActiveSemester,
        createTahunAjaran,
        deleteTahunAjaran,
        createSantriWithWali,
        importSantriBatch,
        deleteSantriBatch,
        moveSantriPlacement,
        updateStatusSantri,
        createKelas,
        updateKelas,
        deleteKelas,
        createKamar,
        updateKamar,
        deleteKamar,
        createJenisPembayaran,
        createPengajuanPembiayaan,
        updateJenisPembayaran,
        deleteJenisPembayaran,
        approveJenisPembayaran,
        rejectJenisPembayaran,
        generateTagihan,
        adjustTagihan,
        createPengumuman,
        updatePengumuman,
        deletePengumuman,
        createDokumen,
        deleteDokumen,
        addOrUpdateKeranjang,
        removeFromKeranjang,
        clearKeranjang,
        submitCheckoutPembayaran,
        uploadBuktiTransferPembayaran,
        submitTopupUangSaku,
        refreshAntreanBendaharaOnly,
        isAntreanLoading,
        markNotifikasiRead,
        markAllNotifikasiRead,
        verifyTransaksiPembayaran,
        verifyTopupUangSaku,
        recordPenyerahanUangSaku,
        recordKoreksiLedgerSaku,
        recordPerkembanganMengaji,
        updatePenilaianMengaji,
        deletePenilaianMengaji,
        recordSetoranTahfidz,
        updateSetoranTahfidz,
        deleteSetoranTahfidz,
        recordPrestasiSantri,
        updatePrestasiSantri,
        deletePrestasiSantri,
        recordCatatanKedisiplinan,
        updateCatatanKedisiplinan,
        deleteCatatanKedisiplinan,
        updateTindakLanjutKedisiplinan,
        createMasterKategoriPelanggaran,
        updateMasterKategoriPelanggaran,
        deleteMasterKategoriPelanggaranBatch,
      }}
    >
      {children}
    </SipetaContext.Provider>
  );
}

export function useSipeta(): SipetaContextValue {
  const ctx = useContext(SipetaContext);
  if (!ctx) {
    throw new Error("useSipeta harus digunakan di dalam SipetaProvider.");
  }
  return ctx;
}

