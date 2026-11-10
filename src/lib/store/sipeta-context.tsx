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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  AuditLogItem,
  CatatanKedisiplinan,
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
import { isSupabaseConfigured } from "@/lib/supabase/client";
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
}

interface SipetaContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  authMode: "supabase" | "demo" | "unauthenticated";
  authLoading: boolean;
  users: UserProfile[];
  rekeningResmi: RekeningPesantren;
  tahunAjaranList: TahunAjaran[];
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

  // Admin Actions
  createSantriWithWali: (payload: {
    nis: string;
    nama_lengkap: string;
    tempat_lahir: string;
    tanggal_lahir: string;
    jenis_kelamin: "L" | "P";
    alamat: string;
    tahun_masuk: number;
    kelas_id: string;
    kamar_id: string;
    nama_wali: string;
    hubungan_wali: "Ayah" | "Ibu" | "Wali";
    telepon_wali: string;
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
  createKelas: (payload: Omit<Kelas, "id" | "is_active">) => ActionResponse;
  updateKelas: (id: string, payload: Partial<Kelas>) => ActionResponse;
  deleteKelas: (id: string) => ActionResponse;
  createKamar: (payload: Omit<Kamar, "id" | "is_active">) => ActionResponse;
  updateKamar: (id: string, payload: Partial<Kamar>) => ActionResponse;
  deleteKamar: (id: string) => ActionResponse;
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

  // Orang Tua / Wali Actions
  addOrUpdateKeranjang: (tagihanId: string, nominalBayar: number) => ActionResponse;
  removeFromKeranjang: (tagihanId: string) => void;
  clearKeranjang: () => void;
  submitCheckoutPembayaran: (payload: {
    tanggal_transfer: string;
    nama_pengirim: string;
    bank_pengirim: string;
    bukti_transfer_url: string;
  }) => ActionResponse;
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
  }) => ActionResponse;
  markNotifikasiRead: (notifikasiId: string) => void;
  markAllNotifikasiRead: () => void;

  // Bendahara Actions (Eksklusif Verifikasi & Uang Keluar)
  verifyTransaksiPembayaran: (
    transaksiId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan: string
  ) => ActionResponse;
  verifyTopupUangSaku: (
    pengajuanId: string,
    keputusan: "DISETUJUI" | "DITOLAK",
    catatan: string
  ) => ActionResponse;
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
  recordSetoranTahfidz: (
    payload: Omit<SetoranTahfidz, "id" | "jumlah_ayat" | "petugas_nama" | "created_at">
  ) => ActionResponse;
  recordPrestasiSantri: (
    payload: Omit<PrestasiSantri, "id" | "petugas_nama" | "created_at">
  ) => ActionResponse;
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

export function SipetaProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<"supabase" | "demo" | "unauthenticated">("unauthenticated");
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [rekeningResmi, setRekeningResmi] = useState<RekeningPesantren>(INITIAL_REKENING);
  const [tahunAjaranList] = useState<TahunAjaran[]>(INITIAL_TAHUN_AJARAN);
  const [kelasList, setKelasList] = useState<Kelas[]>(INITIAL_KELAS);
  const [kamarList, setKamarList] = useState<Kamar[]>(INITIAL_KAMAR);
  const [santriList, setSantriList] = useState<Santri[]>(INITIAL_SANTRI);
  const [waliList, setWaliList] = useState<WaliSantri[]>(INITIAL_WALI_SANTRI);
  const [riwayatPenempatan, setRiwayatPenempatan] = useState<RiwayatPenempatanSantri[]>(
    INITIAL_RIWAYAT_PENEMPATAN
  );
  const [jenisPembayaranList, setJenisPembayaranList] = useState<JenisPembayaran[]>(
    INITIAL_JENIS_PEMBAYARAN
  );
  const [tagihanList, setTagihanList] = useState<Tagihan[]>(INITIAL_TAGIHAN);
  const [riwayatPenyesuaianTagihan, setRiwayatPenyesuaianTagihan] = useState<
    RiwayatPenyesuaianTagihan[]
  >([]);
  const [keranjang, setKeranjang] = useState<KeranjangItem[]>([]);
  const [transaksiPembayaranList, setTransaksiPembayaranList] = useState<TransaksiPembayaran[]>(
    INITIAL_TRANSAKSI_PEMBAYARAN
  );
  const [pengajuanUangSakuList, setPengajuanUangSakuList] = useState<PengajuanUangSaku[]>(
    INITIAL_PENGAJUAN_UANG_SAKU
  );
  const [mutasiUangSakuList, setMutasiUangSakuList] = useState<MutasiUangSaku[]>(
    INITIAL_MUTASI_UANG_SAKU
  );
  const [mengajiList, setMengajiList] = useState<PerkembanganMengaji[]>(
    INITIAL_PERKEMBANGAN_MENGAJI
  );
  const [tahfidzList, setTahfidzList] = useState<SetoranTahfidz[]>(INITIAL_SETORAN_TAHFIDZ);
  const [prestasiList, setPrestasiList] = useState<PrestasiSantri[]>(INITIAL_PRESTASI);
  const [masterPelanggaranList, setMasterPelanggaranList] = useState<MasterKategoriPelanggaran[]>(
    INITIAL_MASTER_PELANGGARAN
  );
  const [kedisiplinanList, setKedisiplinanList] =
    useState<CatatanKedisiplinan[]>(INITIAL_KEDISIPLINAN);
  const [pengumumanList, setPengumumanList] = useState<Pengumuman[]>(INITIAL_PENGUMUMAN);
  const [notifikasiList, setNotifikasiList] = useState<NotifikasiItem[]>(INITIAL_NOTIFIKASI);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);
  const [hydrated, setHydrated] = useState(false);

  // Status Koneksi Backend Aktual & Mode Data
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "connected" | "demo">("checking");
  const [isLiveSupabase, setIsLiveSupabase] = useState<boolean>(false);
  const [dataSource, setDataSource] = useState<"supabase" | "demo">("demo");
  const [healthStatus, setHealthStatus] = useState<DatabaseHealthStatus | null>(null);

  // Sinkronisasi data real-time dari Supabase
  const refreshFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const [
        rekeningRes,
        kelasRes,
        kamarRes,
        santriRes,
        waliRes,
        jenisRes,
        tagihanRes,
        transaksiRes,
        topupRes,
        mengajiRes,
        tahfidzRes,
        prestasiRes,
        kedisiplinanRes,
        kategoriPelanggaranRes,
        pengumumanRes,
        notifikasiRes,
        fetchedUsersRes,
      ] = await Promise.allSettled([
        administrasiService.getRekeningResmi(),
        administrasiService.getKelasList(),
        administrasiService.getKamarList(),
        administrasiService.getSantriList(),
        administrasiService.getWaliList(),
        administrasiService.getJenisPembayaranList(),
        keuanganService.getTagihanBySantri(),
        keuanganService.getRiwayatTransaksi(),
        keuanganService.getPengajuanTopup(),
        kepesantrenanService.getPerkembanganMengaji(),
        kepesantrenanService.getSetoranTahfidz(),
        kepesantrenanService.getPrestasiSantri(),
        kepesantrenanService.getCatatanKedisiplinan(),
        kepesantrenanService.getMasterKategoriPelanggaran(true),
        administrasiService.getPengumumanList(),
        notifikasiService.getNotifikasi(),
        authService.getAllProfiles(),
      ]);

      if (rekeningRes.status === "fulfilled" && rekeningRes.value) {
        setRekeningResmi((prev) => ({ ...prev, ...rekeningRes.value }));
      }
      if (kelasRes.status === "fulfilled" && Array.isArray(kelasRes.value)) setKelasList(kelasRes.value);
      if (kamarRes.status === "fulfilled" && Array.isArray(kamarRes.value)) setKamarList(kamarRes.value);
      if (santriRes.status === "fulfilled" && Array.isArray(santriRes.value)) setSantriList(santriRes.value);
      if (waliRes.status === "fulfilled" && Array.isArray(waliRes.value)) setWaliList(waliRes.value);
      if (jenisRes.status === "fulfilled" && Array.isArray(jenisRes.value)) setJenisPembayaranList(jenisRes.value);
      if (tagihanRes.status === "fulfilled" && Array.isArray(tagihanRes.value)) setTagihanList(tagihanRes.value);
      if (transaksiRes.status === "fulfilled" && Array.isArray(transaksiRes.value)) setTransaksiPembayaranList(transaksiRes.value);
      if (topupRes.status === "fulfilled" && Array.isArray(topupRes.value)) setPengajuanUangSakuList(topupRes.value);
      if (mengajiRes.status === "fulfilled" && Array.isArray(mengajiRes.value)) setMengajiList(mengajiRes.value);
      if (tahfidzRes.status === "fulfilled" && Array.isArray(tahfidzRes.value)) setTahfidzList(tahfidzRes.value);
      if (prestasiRes.status === "fulfilled" && Array.isArray(prestasiRes.value)) setPrestasiList(prestasiRes.value);
      if (kedisiplinanRes.status === "fulfilled" && Array.isArray(kedisiplinanRes.value)) setKedisiplinanList(kedisiplinanRes.value);
      if (kategoriPelanggaranRes.status === "fulfilled" && Array.isArray(kategoriPelanggaranRes.value) && kategoriPelanggaranRes.value.length > 0) {
        setMasterPelanggaranList(kategoriPelanggaranRes.value);
      }
      if (pengumumanRes.status === "fulfilled" && Array.isArray(pengumumanRes.value)) setPengumumanList(pengumumanRes.value);
      if (notifikasiRes.status === "fulfilled" && Array.isArray(notifikasiRes.value)) setNotifikasiList(notifikasiRes.value);
      if (fetchedUsersRes.status === "fulfilled" && Array.isArray(fetchedUsersRes.value) && fetchedUsersRes.value.length > 0) {
        setUsers(fetchedUsersRes.value.filter((u) => u && !u.id.startsWith("usr-")));
      }
    } catch (e) {
      console.warn("Sinkronisasi Supabase ditunda/offline:", e);
    }
  }, []);

  // Inisialisasi Backend Health Check & Sesi Autentikasi
  useEffect(() => {
    let isMounted = true;
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
          return;
        }

        const health = await checkSupabaseHealth();
        if (!isMounted) return;
        setHealthStatus(health);

        if (health.isConnected) {
          setConnectionStatus("connected");
          setIsLiveSupabase(true);
          setDataSource("supabase");

          // Cek sesi autentikasi Supabase nyata dari cookies (@supabase/ssr)
          const profile = await authService.getCurrentProfile();
          if (isMounted) {
            if (profile && profile.is_active) {
              setUsers([profile]);
              setCurrentUser(profile);
              setCurrentUserId(profile.id);
              setIsAuthenticated(true);
              setAuthMode("supabase");
              await refreshFromSupabase();
            } else {
              // Belum ada sesi auth Supabase atau akun tidak aktif
              setCurrentUser(null);
              setCurrentUserId(null);
              setIsAuthenticated(false);
              setAuthMode("unauthenticated");
              // Ambil data publik (pengumuman) secara aman tanpa memanggil API terproteksi
              try {
                const pubAnnouncements = await administrasiService.getPengumumanList();
                if (isMounted && Array.isArray(pubAnnouncements) && pubAnnouncements.length > 0) {
                  setPengumumanList(pubAnnouncements);
                }
              } catch {
                // Gunakan default INITIAL_PENGUMUMAN
              }
            }
          }
        } else {
          setConnectionStatus("demo");
          setIsLiveSupabase(false);
          setDataSource("demo");
          if (isMounted) {
            setCurrentUser(null);
            setCurrentUserId(null);
            setIsAuthenticated(false);
            setAuthMode("unauthenticated");
          }
        }
      } catch (err) {
        if (isMounted) {
          setHealthStatus({
            isConfigured: true,
            isConnected: false,
            connectionState: "CONNECTION_FAILED",
            mode: "demo_local",
            message: "Gagal menghubungkan ke Supabase.",
            error: err instanceof Error ? err.message : String(err),
            checkedAt: new Date().toISOString(),
          });
          setConnectionStatus("demo");
          setIsLiveSupabase(false);
          setDataSource("demo");
          setCurrentUser(null);
          setCurrentUserId(null);
          setIsAuthenticated(false);
          setAuthMode("unauthenticated");
        }
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    }
    initBackend();
    return () => {
      isMounted = false;
    };
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
      setUsers((prev) => [res.user!, ...prev.filter((p) => p.id !== res.user!.id && !p.id.startsWith("usr-"))]);
      setCurrentUser(res.user);
      setCurrentUserId(res.user.id);
      setIsAuthenticated(true);
      setAuthMode("supabase");
      await refreshFromSupabase();
      return { ok: true, message: res.message };
    }
    return { ok: false, message: res.message };
  };

  const logout = async (): Promise<ActionResponse> => {
    try {
      if (authMode === "supabase") {
        await authService.logout();
      }
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      setCurrentUser(null);
      setCurrentUserId(null);
      setIsAuthenticated(false);
      setAuthMode("unauthenticated");
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        if (typeof window !== "undefined" && window.localStorage) {
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && (k.startsWith("sb-") || k.includes("supabase"))) {
              window.localStorage.removeItem(k);
            }
          }
        }
      } catch {
        // Ignore storage errors
      }
    }
    return { ok: true, message: "Berhasil keluar dari sesi." };
  };

  const logoutSupabase = logout;

  const enterDemoMode = (demoRole?: UserRole) => {
    const targetRole = demoRole ?? "wali";
    const demoUser = users.find((u) => u.role === targetRole) ?? INITIAL_USERS[4]!;
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
    } catch {}
  };

  // Hydrate data operasional dari localStorage saat client mount (HANYA saat offline/demo tanpa Supabase)
  useEffect(() => {
    try {
      if (isSupabaseConfigured()) {
        // Pada mode Supabase aktif, bersihkan cache data lama agar tidak merusak state produksi
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } else {
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
    } catch {}
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
        // Pastikan daftar akun dan log audit langsung disinkronisasi dari database
        await refreshFromSupabase();
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
        // Segarkan data dari Supabase agar sinkron dengan database
        await refreshFromSupabase();

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
        await refreshFromSupabase();
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
        await refreshFromSupabase();
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

    const oldRek = { ...rekeningResmi };
    const updated: RekeningPesantren = {
      ...rekeningResmi,
      ...payload,
      nomor_rekening: cleanNoRek,
      updated_at: new Date().toISOString(),
    };
    setRekeningResmi(updated);
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

    // Jika Supabase live mode, gunakan endpoint transaksi server atomik dengan rollback otomatis
    if (authMode === "supabase") {
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
            kelas_id: payload.kelas_id,
            kamar_id: payload.kamar_id,
            wali: {
              nama_lengkap: payload.nama_wali,
              hubungan: payload.hubungan_wali,
              no_telepon: payload.telepon_wali,
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
      tahun_ajaran_id: "ta-2026-2027",
      kelas_id: payload.kelas_id,
      kamar_id: payload.kamar_id,
      status: "AKTIF",
      created_at: new Date().toISOString(),
    };

    const newWaliUser: UserProfile = {
      id: newWaliUserId,
      nama_lengkap: `${payload.nama_wali.trim()} (Wali ${payload.nama_lengkap.trim()})`,
      username: rawUsernameWali,
      email: syntheticWaliEmail,
      no_telepon: payload.telepon_wali.trim(),
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
      nama_lengkap: payload.nama_wali.trim(),
      hubungan: payload.hubungan_wali,
      no_telepon: payload.telepon_wali.trim(),
      email: emailKontak,
      alamat: payload.alamat.trim(),
    };

    setSantriList((prev) => [...prev, newSantri]);
    setWaliList((prev) => [...prev, newWaliRecord]);
    setUsers((prev) => [...prev, newWaliUser]);

    appendAuditLog(
      "REGISTRASI_SANTRI_DAN_WALI",
      "santri",
      newSantriId,
      { santri: newSantri, wali: newWaliRecord },
      `Registrasi santri baru ${newSantri.nama_lengkap} (NIS: ${newSantri.nis}) & akun wali @${rawUsernameWali}`
    );

    return {
      ok: true,
      message: `Santri ${newSantri.nama_lengkap} (NIS: ${newSantri.nis}) dan akun wali @${rawUsernameWali} berhasil didaftarkan.`,
    };
  };

  const importSantriBatch: SipetaContextValue["importSantriBatch"] = async (rows) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang melakukan import data santri." };
    }

    if (authMode === "supabase") {
      const res = await administrasiService.importSantriBatch(rows);
      if (res.ok) {
        await refreshFromSupabase();
      }
      return res;
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

      const matchedKelas = kelasList.find(
        (k) =>
          k.kode_kelas.toUpperCase() === r.kode_kelas.toUpperCase().trim() ||
          k.nama_kelas.toLowerCase().includes(r.kelas.toLowerCase().trim())
      );

      const matchedKamar = kamarList.find(
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
        tahun_ajaran_id: "ta-2026-2027",
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
        await refreshFromSupabase();
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

    if (isSupabaseConfigured()) {
      administrasiService
        .moveSantriPlacement(
          payload.santri_id,
          payload.kelas_baru_id,
          payload.kamar_baru_id,
          payload.keterangan
        )
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

    if (isSupabaseConfigured()) {
      administrasiService.updateStatusSantri(santriId, statusBaru).catch(console.error);
    }
    return {
      ok: true,
      message: `Status santri ${target.nama_lengkap} diubah menjadi ${statusBaru}.`,
    };
  };

  const createKelas: SipetaContextValue["createKelas"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Tidak memiliki hak akses." };
    }
    const item: Kelas = { ...payload, id: `kls-${Date.now()}`, is_active: true };
    setKelasList((prev) => [...prev, item]);
    appendAuditLog("TAMBAH_MASTER_KELAS", "kelas", item.id, { ...item });
    return { ok: true, message: `Kelas ${item.nama_kelas} berhasil ditambahkan.` };
  };

  const updateKelas: SipetaContextValue["updateKelas"] = (id, payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang memperbarui kelas." };
    }
    const target = kelasList.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kelas tidak ditemukan." };

    setKelasList((prev) => prev.map((k) => (k.id === id ? { ...k, ...payload } : k)));
    appendAuditLog("UPDATE_MASTER_KELAS", "kelas", id, payload, undefined, { ...target });

    if (authMode === "supabase") {
      administrasiService.updateKelas(id, payload).catch(console.error);
    }
    return { ok: true, message: `Data kelas '${target.nama_kelas}' berhasil diperbarui.` };
  };

  const deleteKelas: SipetaContextValue["deleteKelas"] = (id) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus kelas." };
    }
    const target = kelasList.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kelas tidak ditemukan." };

    const activeCount = santriList.filter((s) => s.kelas_id === id && s.status === "AKTIF").length;
    if (activeCount > 0) {
      return {
        ok: false,
        message: `Kelas '${target.nama_kelas}' masih memiliki ${activeCount} santri aktif. Pindahkan santri ke kelas lain terlebih dahulu sebelum menghapus kelas ini.`,
      };
    }

    setKelasList((prev) => prev.filter((k) => k.id !== id));
    appendAuditLog("DELETE_MASTER_KELAS", "kelas", id, undefined, `Penghapusan master kelas '${target.nama_kelas}'`, { ...target });

    if (authMode === "supabase") {
      administrasiService.deleteKelas(id).catch(console.error);
    }
    return { ok: true, message: `Kelas '${target.nama_kelas}' berhasil dihapus.` };
  };

  const createKamar: SipetaContextValue["createKamar"] = (payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Tidak memiliki hak akses." };
    }
    const item: Kamar = { ...payload, id: `kmr-${Date.now()}`, is_active: true };
    setKamarList((prev) => [...prev, item]);
    appendAuditLog("TAMBAH_MASTER_KAMAR", "kamar", item.id, { ...item });
    return { ok: true, message: `Kamar ${item.nama_kamar} berhasil ditambahkan.` };
  };

  const updateKamar: SipetaContextValue["updateKamar"] = (id, payload) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang memperbarui kamar." };
    }
    const target = kamarList.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kamar asrama tidak ditemukan." };

    setKamarList((prev) => prev.map((k) => (k.id === id ? { ...k, ...payload } : k)));
    appendAuditLog("UPDATE_MASTER_KAMAR", "kamar", id, payload, undefined, { ...target });

    if (authMode === "supabase") {
      administrasiService.updateKamar(id, payload).catch(console.error);
    }
    return { ok: true, message: `Data kamar '${target.nama_kamar}' berhasil diperbarui.` };
  };

  const deleteKamar: SipetaContextValue["deleteKamar"] = (id) => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin" && currentUser.role !== "tu")) {
      return { ok: false, message: "Hanya Tata Usaha (TU), Admin, atau Superadmin yang berwenang menghapus kamar." };
    }
    const target = kamarList.find((k) => k.id === id);
    if (!target) return { ok: false, message: "Kamar asrama tidak ditemukan." };

    const activeCount = santriList.filter((s) => s.kamar_id === id && s.status === "AKTIF").length;
    if (activeCount > 0) {
      return {
        ok: false,
        message: `Kamar '${target.nama_kamar}' masih ditempati oleh ${activeCount} santri aktif. Pindahkan santri terlebih dahulu sebelum menghapus kamar ini.`,
      };
    }

    setKamarList((prev) => prev.filter((k) => k.id !== id));
    appendAuditLog("DELETE_MASTER_KAMAR", "kamar", id, undefined, `Penghapusan master kamar asrama '${target.nama_kamar}'`, { ...target });

    if (authMode === "supabase") {
      administrasiService.deleteKamar(id).catch(console.error);
    }
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
    if (isDirectAdmin) {
      let targetSantri = santriList.filter((s) => s.status === "AKTIF");
      if (newJenis.sasaran_santri === "KELAS_TERTENTU" && newJenis.sasaran_target_id) {
        targetSantri = targetSantri.filter((s) => s.kelas_id === newJenis.sasaran_target_id);
      } else if (newJenis.sasaran_santri === "KAMAR_TERTENTU" && newJenis.sasaran_target_id) {
        targetSantri = targetSantri.filter((s) => s.kamar_id === newJenis.sasaran_target_id);
      } else if (newJenis.sasaran_santri === "INDIVIDU" && newJenis.sasaran_target_id) {
        targetSantri = targetSantri.filter((s) => s.id === newJenis.sasaran_target_id);
      }

      if (targetSantri.length > 0) {
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
    }

    appendAuditLog("PENGAJUAN_PEMBIAYAAN", "jenis_pembayaran", newJenis.id, {
      nama: newJenis.nama_pembayaran,
      nominal: newJenis.nominal,
      status: newJenis.status_persetujuan,
      diajukan_oleh: currentUser.nama_lengkap,
    });

    if (authMode === "supabase") {
      administrasiService.createJenisPembayaran({
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
      }).catch(console.error);
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
      administrasiService.updateJenisPembayaran(id, cleanPayload).catch(console.error);
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
      administrasiService.deleteJenisPembayaran(id).catch(console.error);
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
      administrasiService.approveJenisPembayaran(id, {
        catatan: approvedCatatan,
        approved_by: currentUser.id,
        approved_by_name: currentUser.nama_lengkap,
        periode_label: computedPeriode,
      }).catch(console.error);

      if (targetSantri.length > 0) {
        administrasiService.generateTagihan({
          jenis_pembayaran_id: target.id,
          periode_label: computedPeriode,
          tanggal_jatuh_tempo: target.tanggal_jatuh_tempo,
          target_santri_ids: targetSantri.map((s) => s.id),
        }).catch(console.error);
      }
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
      administrasiService.rejectJenisPembayaran(id, {
        catatan: catatan.trim(),
        rejected_by: currentUser.id,
        rejected_by_name: currentUser.nama_lengkap,
      }).catch(console.error);
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
      administrasiService.createPengumuman({
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
      }).catch(console.error);
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
      administrasiService.updatePengumuman(id, {
        ...payload,
        is_published: isPub,
      }).catch(console.error);
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
      administrasiService.deletePengumuman(id).catch(console.error);
    }

    return { ok: true, message: "Pengumuman berhasil dihapus." };
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

  const submitCheckoutPembayaran: SipetaContextValue["submitCheckoutPembayaran"] = (payload) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    if (keranjang.length === 0) {
      return { ok: false, message: "Keranjang pembayaran masih kosong." };
    }
    const activeSantriId = currentUser.santri_id ?? "snt-001";

    // Validasi ulang seluruh item keranjang di sisi server/service
    let totalNominal = 0;
    const alokasiItems: TransaksiPembayaran["alokasi"] = [];
    const trxId = `trx-${Date.now()}`;

    for (const item of keranjang) {
      const tgh = tagihanList.find((t) => t.id === item.tagihan_id);
      if (!tgh || tgh.santri_id !== activeSantriId) {
        return { ok: false, message: "Data tagihan di keranjang tidak valid." };
      }
      const check = validateNominalCicilan(tgh, item.nominal_bayar);
      if (!check.valid) {
        return { ok: false, message: check.error ?? "Nominal cicilan tidak valid." };
      }
      totalNominal += item.nominal_bayar;
      alokasiItems.push({
        id: `alk-${Date.now()}-${item.tagihan_id}`,
        transaksi_id: trxId,
        tagihan_id: tgh.id,
        judul_tagihan: tgh.judul_tagihan,
        nominal_alokasi: item.nominal_bayar,
      });
    }

    const nomorTrx = `TRX-BYR-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const newTrx: TransaksiPembayaran = {
      id: trxId,
      nomor_transaksi: nomorTrx,
      santri_id: activeSantriId,
      wali_user_id: currentUser.id,
      total_nominal: totalNominal,
      rekening_tujuan_snapshot: {
        nama_bank: rekeningResmi?.nama_bank || "Bank Syariah Indonesia (BSI)",
        nomor_rekening: rekeningResmi?.nomor_rekening || "-",
        atas_nama: rekeningResmi?.atas_nama || "Pesantren Abu Manshur",
      },
      tanggal_transfer: payload.tanggal_transfer,
      nama_pengirim: payload.nama_pengirim.trim(),
      bank_pengirim: payload.bank_pengirim.trim(),
      bukti_transfer_url: payload.bukti_transfer_url,
      status: "MENUNGGU_VERIFIKASI",
      alokasi: alokasiItems,
      created_at: new Date().toISOString(),
    };

    setTransaksiPembayaranList((prev) => [newTrx, ...prev]);
    setKeranjang([]);

    appendAuditLog("AJUKAN_PEMBAYARAN_TAGIHAN", "transaksi_pembayaran", newTrx.id, {
      nomor_transaksi: newTrx.nomor_transaksi,
      total_nominal: newTrx.total_nominal,
      jumlah_tagihan: alokasiItems.length,
    });

    return {
      ok: true,
      message: `Pengajuan pembayaran ${nomorTrx} sebesar Rp ${totalNominal.toLocaleString(
        "id-ID"
      )} berhasil dikirim dan menunggu verifikasi Bendahara.`,
    };
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

    return {
      ok: true,
      message: `Bukti transfer untuk transaksi ${trx.nomor_transaksi} berhasil dikirim dan siap diverifikasi Bendahara.`,
    };
  };

  const submitTopupUangSaku: SipetaContextValue["submitTopupUangSaku"] = (payload) => {
    if (!currentUser) {
      return { ok: false, message: "Akses ditolak: Pengguna belum terautentikasi." };
    }
    const activeSantriId = currentUser.santri_id ?? "snt-001";
    const parsed = pengajuanTopupSakuSchema.safeParse({
      santri_id: activeSantriId,
      ...payload,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Data pengajuan uang saku tidak valid.",
      };
    }

    const nomorPengajuan = `TOPUP-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const newPengajuan: PengajuanUangSaku = {
      id: `psaku-${Date.now()}`,
      nomor_pengajuan: nomorPengajuan,
      santri_id: activeSantriId,
      wali_user_id: currentUser.id,
      nominal: payload.nominal,
      rekening_tujuan_snapshot: {
        nama_bank: rekeningResmi?.nama_bank || "Bank Syariah Indonesia (BSI)",
        nomor_rekening: rekeningResmi?.nomor_rekening || "-",
        atas_nama: rekeningResmi?.atas_nama || "Pesantren Abu Manshur",
      },
      tanggal_transfer: payload.tanggal_transfer,
      nama_pengirim: payload.nama_pengirim.trim(),
      bank_pengirim: payload.bank_pengirim.trim(),
      bukti_transfer_url: payload.bukti_transfer_url,
      keterangan: payload.keterangan?.trim() || "Pengisian uang saku santri",
      status: "MENUNGGU_VERIFIKASI",
      created_at: new Date().toISOString(),
    };

    setPengajuanUangSakuList((prev) => [newPengajuan, ...prev]);
    appendAuditLog("AJUKAN_TOPUP_UANG_SAKU", "pengajuan_uang_saku", newPengajuan.id, {
      nomor_pengajuan: newPengajuan.nomor_pengajuan,
      nominal: newPengajuan.nominal,
    });

    return {
      ok: true,
      message: `Pengajuan uang saku ${nomorPengajuan} berhasil dikirim dan menunggu verifikasi Bendahara.`,
    };
  };

  const markNotifikasiRead = (notifikasiId: string) => {
    setNotifikasiList((prev) =>
      prev.map((n) => (n.id === notifikasiId ? { ...n, is_read: true } : n))
    );
  };

  const markAllNotifikasiRead = () => {
    if (!currentUser) return;
    setNotifikasiList((prev) =>
      prev.map((n) => (n.user_id === currentUser.id ? { ...n, is_read: true } : n))
    );
  };

  // ============================================================================
  // BENDAHARA ACTIONS (VERIFIKASI ATOMIK & UANG KELUAR WAJIB FOTO)
  // ============================================================================

  const verifyTransaksiPembayaran: SipetaContextValue["verifyTransaksiPembayaran"] = (
    transaksiId,
    keputusan,
    catatan
  ) => {
    // Bab 2 & Bab 3.3 PRD: Hanya Bendahara yang berwenang mengesahkan transaksi keuangan
    if (!currentUser || !canRoleApproveFinancialTransaction(currentUser.role)) {
      return {
        ok: false,
        message:
          "OTORISASI DITOLAK: Sesuai kebijakan pesantren, hanya Bendahara yang berwenang menyetujui atau menolak transaksi pembayaran.",
      };
    }

    const trx = transaksiPembayaranList.find((t) => t.id === transaksiId);
    if (!trx) return { ok: false, message: "Transaksi tidak ditemukan." };
    if (trx.status !== "MENUNGGU_VERIFIKASI") {
      return {
        ok: false,
        message: `Transaksi ${trx.nomor_transaksi} sudah diproses sebelumnya (${trx.status}).`,
      };
    }
    if (keputusan === "DITOLAK" && catatan.trim().length < 4) {
      return { ok: false, message: "Catatan alasan penolakan wajib diisi." };
    }

    if (keputusan === "DISETUJUI") {
      // Periksa sisa tagihan sebelum komit atomik
      for (const alk of trx.alokasi) {
        const bill = tagihanList.find((b) => b.id === alk.tagihan_id);
        if (!bill || bill.sisa_tagihan < alk.nominal_alokasi) {
          return {
            ok: false,
            message: `Alokasi pada "${alk.judul_tagihan}" melebihi sisa kewajiban saat ini.`,
          };
        }
      }

      // Perbarui setiap tagihan secara atomik
      setTagihanList((prev) =>
        prev.map((bill) => {
          const alk = trx.alokasi.find((a) => a.tagihan_id === bill.id);
          if (!alk) return bill;
          const totalTerbayarBaru = bill.total_terbayar + alk.nominal_alokasi;
          const sisaBaru = bill.nominal_tagihan - totalTerbayarBaru;
          const statusBaru: StatusTagihan = sisaBaru <= 0 ? "LUNAS" : "DIBAYAR_SEBAGIAN";
          return {
            ...bill,
            total_terbayar: totalTerbayarBaru,
            sisa_tagihan: Math.max(0, sisaBaru),
            status: statusBaru,
          };
        })
      );
    }

    setTransaksiPembayaranList((prev) =>
      prev.map((t) =>
        t.id === transaksiId
          ? {
              ...t,
              status: keputusan,
              verified_by_nama: currentUser.nama_lengkap,
              verified_at: new Date().toISOString(),
              catatan_verifikasi:
                catatan.trim() ||
                (keputusan === "DISETUJUI"
                  ? "Bukti transfer sah dan dana telah diterima."
                  : "Ditolak oleh Bendahara."),
            }
          : t
      )
    );

    notifyWaliOfSantri(
      trx.santri_id,
      keputusan === "DISETUJUI" ? "PEMBAYARAN_DISETUJUI" : "PEMBAYARAN_DITOLAK",
      keputusan === "DISETUJUI"
        ? `Pembayaran Disetujui (${trx.nomor_transaksi})`
        : `Pembayaran Ditolak (${trx.nomor_transaksi})`,
      keputusan === "DISETUJUI"
        ? `Pembayaran sebesar Rp ${trx.total_nominal.toLocaleString(
            "id-ID"
          )} telah diverifikasi dan kewajiban tagihan telah diperbarui.`
        : `Pengajuan pembayaran ${trx.nomor_transaksi} ditolak. Catatan: ${catatan}`,
      "/wali/pembayaran"
    );

    appendAuditLog(
      `VERIFIKASI_PEMBAYARAN_${keputusan}`,
      "transaksi_pembayaran",
      trx.id,
      { status: keputusan, total_nominal: trx.total_nominal },
      catatan,
      { status: trx.status }
    );

    return {
      ok: true,
      message: `Transaksi ${trx.nomor_transaksi} berhasil ${
        keputusan === "DISETUJUI" ? "disetujui dan saldo tagihan diperbarui" : "ditolak"
      }.`,
    };
  };

  const verifyTopupUangSaku: SipetaContextValue["verifyTopupUangSaku"] = (
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

    const pengajuan = pengajuanUangSakuList.find((p) => p.id === pengajuanId);
    if (!pengajuan) return { ok: false, message: "Pengajuan uang saku tidak ditemukan." };
    if (pengajuan.status !== "MENUNGGU_VERIFIKASI") {
      return { ok: false, message: "Pengajuan ini sudah diverifikasi sebelumnya." };
    }
    if (keputusan === "DITOLAK" && catatan.trim().length < 4) {
      return { ok: false, message: "Alasan penolakan wajib diisi." };
    }

    if (keputusan === "DISETUJUI") {
      const currentLedger = getSaldoSantri(pengajuan.santri_id);
      const saldoSebelum = currentLedger.saldo_saat_ini;
      const saldoSesudah = saldoSebelum + pengajuan.nominal;
      const nomorMutasi = `SAK-IN-${new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const mutasiMasuk: MutasiUangSaku = {
        id: `mut-${Date.now()}`,
        nomor_transaksi: nomorMutasi,
        santri_id: pengajuan.santri_id,
        jenis_mutasi: "MASUK",
        nominal: pengajuan.nominal,
        saldo_sebelum: saldoSebelum,
        saldo_sesudah: saldoSesudah,
        keterangan: `${pengajuan.keterangan} (${pengajuan.nomor_pengajuan})`,
        pengajuan_id: pengajuan.id,
        petugas_nama: currentUser.nama_lengkap,
        created_at: new Date().toISOString(),
      };

      setMutasiUangSakuList((prev) => [mutasiMasuk, ...prev]);
    }

    setPengajuanUangSakuList((prev) =>
      prev.map((p) =>
        p.id === pengajuanId
          ? {
              ...p,
              status: keputusan,
              verified_by_nama: currentUser.nama_lengkap,
              verified_at: new Date().toISOString(),
              catatan_verifikasi:
                catatan.trim() ||
                (keputusan === "DISETUJUI" ? "Dana uang saku diterima." : "Ditolak"),
            }
          : p
      )
    );

    notifyWaliOfSantri(
      pengajuan.santri_id,
      keputusan === "DISETUJUI" ? "SAKU_DISETUJUI" : "SAKU_DITOLAK",
      keputusan === "DISETUJUI"
        ? "Pengisian Uang Saku Disetujui"
        : "Pengajuan Uang Saku Ditolak",
      keputusan === "DISETUJUI"
        ? `Uang saku sebesar Rp ${pengajuan.nominal.toLocaleString(
            "id-ID"
          )} telah masuk ke saldo santri.`
        : `Pengajuan uang saku ${pengajuan.nomor_pengajuan} ditolak. Catatan: ${catatan}`,
      "/wali/uang-saku"
    );

    appendAuditLog(
      `VERIFIKASI_TOPUP_SAKU_${keputusan}`,
      "pengajuan_uang_saku",
      pengajuan.id,
      { status: keputusan, nominal: pengajuan.nominal },
      catatan
    );

    return {
      ok: true,
      message:
        keputusan === "DISETUJUI"
          ? `Top-up uang saku Rp ${pengajuan.nominal.toLocaleString(
              "id-ID"
            )} disetujui dan saldo santri telah bertambah.`
          : `Pengajuan top-up uang saku telah ditolak.`,
    };
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
      `Penyerahan uang saku sebesar Rp ${payload.nominal.toLocaleString("id-ID")} (${
        payload.keterangan
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
      kepesantrenanService.catatPerkembanganMengaji({
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
      }).catch(console.error);
    }

    return { ok: true, message: "Catatan perkembangan mengaji berhasil disimpan." };
  };

  const recordSetoranTahfidz: SipetaContextValue["recordSetoranTahfidz"] = (payload) => {
    if (!currentUser || (currentUser.role !== "pengelola" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Pengelola Kepesantrenan yang dapat mencatat tahfidz." };
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
      `Setoran ${payload.jenis_setoran === "HAFALAN_BARU" ? "Hafalan Baru" : "Murojaah"} ${
        payload.nama_surah
      } ayat ${payload.ayat_awal}-${payload.ayat_akhir} tercatat dengan predikat ${
        payload.kualitas_hafalan
      }.`,
      "/wali/kepesantrenan"
    );
    appendAuditLog("CATAT_SETORAN_TAHFIDZ", "setoran_tahfidz", item.id, {
      santri_id: item.santri_id,
      surah: item.nama_surah,
      jumlah_ayat: jumlahAyat,
    });
    return { ok: true, message: "Setoran tahfidz santri berhasil disimpan." };
  };

  const recordPrestasiSantri: SipetaContextValue["recordPrestasiSantri"] = (payload) => {
    if (!currentUser || (currentUser.role !== "pengelola" && currentUser.role !== "superadmin")) {
      return { ok: false, message: "Hanya Pengelola Kepesantrenan yang dapat mencatat prestasi." };
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
    return { ok: true, message: "Data prestasi santri berhasil disimpan." };
  };

  const recordCatatanKedisiplinan: SipetaContextValue["recordCatatanKedisiplinan"] = (payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return {
        ok: false,
        message: "Hanya Tata Usaha, Asatidz, atau Admin yang dapat mencatat kedisiplinan.",
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
      kepesantrenanService.catatKedisiplinan({
        santri_id: payload.santri_id,
        tanggal_kejadian: payload.tanggal_kejadian,
        waktu_kejadian: payload.waktu_kejadian,
        kategori_id: payload.kategori_id,
        deskripsi: payload.deskripsi,
        tindak_lanjut: payload.tindak_lanjut,
        catatan_pembinaan: payload.catatan_pembinaan,
        status_tindak_lanjut: payload.status_tindak_lanjut,
      }).catch(console.error);
    }

    return { ok: true, message: "Catatan kedisiplinan & pembinaan berhasil disimpan." };
  };

  const updateCatatanKedisiplinan: SipetaContextValue["updateCatatanKedisiplinan"] = (id, payload) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
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
      kepesantrenanService.updateCatatanKedisiplinan(id, payload).catch(console.error);
    }

    return { ok: true, message: "Catatan kedisiplinan berhasil diperbarui." };
  };

  const deleteCatatanKedisiplinan: SipetaContextValue["deleteCatatanKedisiplinan"] = (id) => {
    if (
      !currentUser ||
      (currentUser.role !== "pengelola" &&
        currentUser.role !== "asatidz" &&
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
      kepesantrenanService.deleteCatatanKedisiplinan(id).catch(console.error);
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
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya Pengelola/TU yang dapat memperbarui pembinaan." };
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
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Pengelola Kepesantrenan, atau Superadmin yang berwenang menambah kategori pelanggaran." };
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
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Pengelola Kepesantrenan, atau Superadmin yang berwenang mengubah kategori pelanggaran." };
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
        currentUser.role !== "tu" &&
        currentUser.role !== "admin" &&
        currentUser.role !== "superadmin")
    ) {
      return { ok: false, message: "Hanya TU, Pengelola Kepesantrenan, atau Superadmin yang berwenang menghapus kategori pelanggaran." };
    }
    if (!ids || ids.length === 0) {
      return { ok: false, message: "Pilih setidaknya satu kategori pelanggaran untuk dihapus." };
    }

    if (authMode === "supabase") {
      const res = await kepesantrenanService.deleteMasterKategoriPelanggaranBatch(ids);
      // Refresh list dari server untuk memastikan sinkronisasi akurat
      const refreshed = await kepesantrenanService.getMasterKategoriPelanggaran(true);
      if (refreshed.length > 0) {
        setMasterPelanggaranList(refreshed);
      }
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
        tahunAjaranList,
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
        addOrUpdateKeranjang,
        removeFromKeranjang,
        clearKeranjang,
        submitCheckoutPembayaran,
        uploadBuktiTransferPembayaran,
        submitTopupUangSaku,
        markNotifikasiRead,
        markAllNotifikasiRead,
        verifyTransaksiPembayaran,
        verifyTopupUangSaku,
        recordPenyerahanUangSaku,
        recordKoreksiLedgerSaku,
        recordPerkembanganMengaji,
        recordSetoranTahfidz,
        recordPrestasiSantri,
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

