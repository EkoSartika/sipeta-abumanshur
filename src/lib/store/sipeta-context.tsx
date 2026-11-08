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

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type {
  AuditLogItem,
  CatatanKedisiplinan,
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

export interface ActionResponse {
  ok: boolean;
  message: string;
}

interface SipetaContextValue {
  currentUser: UserProfile;
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

  // Status Koneksi Backend
  connectionStatus: "checking" | "connected" | "demo";
  isLiveSupabase: boolean;
  dataSource: "supabase" | "demo";
  healthStatus: DatabaseHealthStatus | null;
  refreshFromSupabase: () => Promise<void>;
  loginWithSupabase: (email: string, kataSandi: string) => Promise<ActionResponse>;
  logoutSupabase: () => Promise<void>;

  // Helpers
  switchActiveUser: (userId: string) => void;
  getSaldoSantri: (santriId: string) => SaldoUangSaku;
  resetDemoData: () => void;

  // Superadmin Actions
  createUserAccount: (payload: {
    nama_lengkap: string;
    email: string;
    no_telepon: string;
    role: UserProfile["role"];
    santri_id?: string;
  }) => ActionResponse;
  toggleUserActive: (userId: string) => ActionResponse;
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
    email_wali: string;
  }) => ActionResponse;
  moveSantriPlacement: (payload: {
    santri_id: string;
    kelas_baru_id: string;
    kamar_baru_id: string;
    keterangan: string;
  }) => ActionResponse;
  updateStatusSantri: (santriId: string, statusBaru: StatusSantri) => ActionResponse;
  createKelas: (payload: Omit<Kelas, "id" | "is_active">) => ActionResponse;
  createKamar: (payload: Omit<Kamar, "id" | "is_active">) => ActionResponse;
  createJenisPembayaran: (payload: Omit<JenisPembayaran, "id" | "is_active">) => ActionResponse;
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
  }) => ActionResponse;

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
}

const SipetaContext = createContext<SipetaContextValue | null>(null);

const STORAGE_KEY = "sipeta_abu_manshur_state_v1";

export function SipetaProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string>("usr-wali-01");
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
  const [masterPelanggaranList] = useState<MasterKategoriPelanggaran[]>(
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
  const refreshFromSupabase = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const [
        rekening,
        kelas,
        kamar,
        santri,
        wali,
        jenis,
        tagihan,
        transaksi,
        topup,
        mengaji,
        tahfidz,
        prestasi,
        kedisiplinan,
        pengumuman,
        notifikasi,
      ] = await Promise.all([
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
        administrasiService.getPengumumanList(),
        notifikasiService.getNotifikasi(),
      ]);

      if (rekening) setRekeningResmi(rekening);
      if (kelas.length) setKelasList(kelas);
      if (kamar.length) setKamarList(kamar);
      if (santri.length) setSantriList(santri);
      if (wali.length) setWaliList(wali);
      if (jenis.length) setJenisPembayaranList(jenis);
      if (tagihan.length) setTagihanList(tagihan);
      if (transaksi.length) setTransaksiPembayaranList(transaksi);
      if (topup.length) setPengajuanUangSakuList(topup);
      if (mengaji.length) setMengajiList(mengaji);
      if (tahfidz.length) setTahfidzList(tahfidz);
      if (prestasi.length) setPrestasiList(prestasi);
      if (kedisiplinan.length) setKedisiplinanList(kedisiplinan);
      if (pengumuman.length) setPengumumanList(pengumuman);
      if (notifikasi.length) setNotifikasiList(notifikasi);
    } catch (e) {
      console.warn("Sinkronisasi Supabase ditunda/offline:", e);
    }
  };

  // Inisialisasi Backend Health Check
  useEffect(() => {
    let isMounted = true;
    async function initBackend() {
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
        }
        return;
      }
      try {
        const health = await checkSupabaseHealth();
        if (!isMounted) return;
        setHealthStatus(health);
        if (health.isConnected) {
          setConnectionStatus("connected");
          setIsLiveSupabase(true);
          setDataSource("supabase");
          await refreshFromSupabase();
          const profile = await authService.getCurrentProfile();
          if (profile && isMounted) {
            setUsers((prev) => [profile, ...prev.filter((p) => p.id !== profile.id)]);
            setCurrentUserId(profile.id);
          }
        } else {
          setConnectionStatus("demo");
          setIsLiveSupabase(false);
          setDataSource("demo");
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
    kataSandi: string
  ): Promise<ActionResponse> => {
    const res = await authService.login(email, kataSandi);
    if (res.ok && res.user) {
      setUsers((prev) => [res.user!, ...prev.filter((p) => p.id !== res.user!.id)]);
      setCurrentUserId(res.user.id);
      await refreshFromSupabase();
      return { ok: true, message: res.message };
    }
    return { ok: false, message: res.message };
  };

  const logoutSupabase = async () => {
    await authService.logout();
    setCurrentUserId(INITIAL_USERS[4]?.id ?? "usr-wali-01");
  };

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.users) setUsers(parsed.users);
        if (parsed.currentUserId) setCurrentUserId(parsed.currentUserId);
        if (parsed.rekeningResmi) setRekeningResmi(parsed.rekeningResmi);
        if (parsed.kelasList) setKelasList(parsed.kelasList);
        if (parsed.kamarList) setKamarList(parsed.kamarList);
        if (parsed.santriList) setSantriList(parsed.santriList);
        if (parsed.waliList) setWaliList(parsed.waliList);
        if (parsed.riwayatPenempatan) setRiwayatPenempatan(parsed.riwayatPenempatan);
        if (parsed.jenisPembayaranList) setJenisPembayaranList(parsed.jenisPembayaranList);
        if (parsed.tagihanList) setTagihanList(parsed.tagihanList);
        if (parsed.riwayatPenyesuaianTagihan)
          setRiwayatPenyesuaianTagihan(parsed.riwayatPenyesuaianTagihan);
        if (parsed.keranjang) setKeranjang(parsed.keranjang);
        if (parsed.transaksiPembayaranList)
          setTransaksiPembayaranList(parsed.transaksiPembayaranList);
        if (parsed.pengajuanUangSakuList) setPengajuanUangSakuList(parsed.pengajuanUangSakuList);
        if (parsed.mutasiUangSakuList) setMutasiUangSakuList(parsed.mutasiUangSakuList);
        if (parsed.mengajiList) setMengajiList(parsed.mengajiList);
        if (parsed.tahfidzList) setTahfidzList(parsed.tahfidzList);
        if (parsed.prestasiList) setPrestasiList(parsed.prestasiList);
        if (parsed.kedisiplinanList) setKedisiplinanList(parsed.kedisiplinanList);
        if (parsed.pengumumanList) setPengumumanList(parsed.pengumumanList);
        if (parsed.notifikasiList) setNotifikasiList(parsed.notifikasiList);
        if (parsed.auditLogs) setAuditLogs(parsed.auditLogs);
      }
    } catch {
      // Gunakan initial state jika gagal membaca localStorage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    // Jangan menimpa data operasional atau menyimpan ke localStorage jika Supabase aktif
    if (!hydrated || dataSource === "supabase") return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          users,
          currentUserId,
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
    users,
    currentUserId,
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

  const currentUser: UserProfile = useMemo(() => {
    return users.find((u) => u.id === currentUserId) ?? users[0]!;
  }, [users, currentUserId]);

  const appendAuditLog = (
    aktivitas: string,
    jenis_objek: string,
    objek_id: string,
    data_sesudah?: Record<string, unknown>,
    alasan_perubahan?: string,
    data_sebelum?: Record<string, unknown>
  ) => {
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
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    setCurrentUserId(target.id);
    setKeranjang([]);
  };

  const resetDemoData = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUsers(INITIAL_USERS);
    setCurrentUserId("usr-wali-01");
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
  };

  const getSaldoSantri = (santriId: string): SaldoUangSaku => {
    return calculatePocketMoneyLedger(santriId, mutasiUangSakuList);
  };

  // ============================================================================
  // SUPERADMIN ACTIONS
  // ============================================================================

  const createUserAccount: SipetaContextValue["createUserAccount"] = (payload) => {
    if (currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang dapat membuat akun pengguna." };
    }
    if (users.some((u) => u.email.toLowerCase() === payload.email.toLowerCase())) {
      return { ok: false, message: "Email sudah digunakan oleh akun lain." };
    }
    if (payload.role === "wali") {
      if (!payload.santri_id) {
        return {
          ok: false,
          message: "Akun Orang Tua/Wali wajib dihubungkan dengan 1 santri (Relasi 1:1).",
        };
      }
      if (users.some((u) => u.role === "wali" && u.santri_id === payload.santri_id)) {
        return {
          ok: false,
          message:
            "Santri tersebut sudah memiliki akun Orang Tua/Wali aktif. Sesuai kebijakan pesantren: 1 Akun Orang Tua untuk 1 Santri.",
        };
      }
    }

    const newUser: UserProfile = {
      id: `usr-${Date.now()}`,
      nama_lengkap: payload.nama_lengkap,
      email: payload.email,
      no_telepon: payload.no_telepon,
      role: payload.role,
      is_active: true,
      santri_id: payload.role === "wali" ? payload.santri_id : undefined,
      created_at: new Date().toISOString(),
    };

    setUsers((prev) => [...prev, newUser]);
    appendAuditLog("BUAT_AKUN_PENGGUNA", "profiles", newUser.id, {
      email: newUser.email,
      role: newUser.role,
      santri_id: newUser.santri_id,
    });

    return { ok: true, message: `Akun ${newUser.nama_lengkap} (${newUser.role}) berhasil dibuat.` };
  };

  const toggleUserActive: SipetaContextValue["toggleUserActive"] = (userId) => {
    if (currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang dapat mengubah status akun." };
    }
    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, message: "Akun tidak ditemukan." };
    if (target.id === currentUser.id) {
      return { ok: false, message: "Tidak dapat menonaktifkan akun Superadmin yang sedang aktif." };
    }

    const nextActive = !target.is_active;
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

  const updateRekeningResmi: SipetaContextValue["updateRekeningResmi"] = (payload) => {
    if (currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Superadmin yang dapat mengelola rekening resmi pesantren." };
    }
    const oldRek = { ...rekeningResmi };
    const updated: RekeningPesantren = {
      ...rekeningResmi,
      ...payload,
      updated_at: new Date().toISOString(),
    };
    setRekeningResmi(updated);
    appendAuditLog(
      "UPDATE_REKENING_RESMI",
      "rekening_pesantren",
      rekeningResmi.id,
      { ...updated },
      "Pembaruan konfigurasi rekening resmi pesantren oleh Superadmin",
      { ...oldRek }
    );
    return { ok: true, message: "Rekening resmi pesantren berhasil diperbarui." };
  };

  // ============================================================================
  // ADMIN ACTIONS
  // ============================================================================

  const createSantriWithWali: SipetaContextValue["createSantriWithWali"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Admin atau Superadmin yang dapat mendaftarkan santri." };
    }
    if (santriList.some((s) => s.nis === payload.nis.trim())) {
      return { ok: false, message: `NIS ${payload.nis} sudah terdaftar. NIS harus unik.` };
    }

    const newSantriId = `snt-${Date.now()}`;
    const newWaliUserId = `usr-wali-${Date.now()}`;

    const newSantri: Santri = {
      id: newSantriId,
      nis: payload.nis.trim(),
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
      email: payload.email_wali.trim(),
      no_telepon: payload.telepon_wali.trim(),
      role: "wali",
      is_active: true,
      santri_id: newSantriId,
      created_at: new Date().toISOString(),
    };

    const newWaliRecord: WaliSantri = {
      id: `wali-${Date.now()}`,
      user_id: newWaliUserId,
      santri_id: newSantriId,
      nama_lengkap: payload.nama_wali.trim(),
      hubungan: payload.hubungan_wali,
      no_telepon: payload.telepon_wali.trim(),
      email: payload.email_wali.trim(),
      alamat: payload.alamat.trim(),
    };

    const penempatanAwal: RiwayatPenempatanSantri = {
      id: `rwp-${Date.now()}`,
      santri_id: newSantriId,
      kelas_lama_id: null,
      kelas_baru_id: payload.kelas_id,
      kamar_lama_id: null,
      kamar_baru_id: payload.kamar_id,
      tanggal_efektif: new Date().toISOString().slice(0, 10),
      keterangan: "Penempatan awal pendaftaran santri baru",
      petugas_nama: currentUser.nama_lengkap,
      created_at: new Date().toISOString(),
    };

    setSantriList((prev) => [newSantri, ...prev]);
    setUsers((prev) => [...prev, newWaliUser]);
    setWaliList((prev) => [newWaliRecord, ...prev]);
    setRiwayatPenempatan((prev) => [penempatanAwal, ...prev]);

    appendAuditLog("REGISTRASI_SANTRI_DAN_WALI", "santri", newSantriId, {
      nis: newSantri.nis,
      nama_santri: newSantri.nama_lengkap,
      wali_email: newWaliRecord.email,
    });

    return {
      ok: true,
      message: `Data santri ${newSantri.nama_lengkap} (NIS: ${newSantri.nis}) beserta akun Orang Tua/Wali 1:1 berhasil dibuat.`,
    };
  };

  const moveSantriPlacement: SipetaContextValue["moveSantriPlacement"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
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

    return {
      ok: true,
      message: `Penempatan ${target.nama_lengkap} berhasil diperbarui dan dicatat ke riwayat.`,
    };
  };

  const updateStatusSantri: SipetaContextValue["updateStatusSantri"] = (santriId, statusBaru) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
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
    return {
      ok: true,
      message: `Status santri ${target.nama_lengkap} diubah menjadi ${statusBaru}.`,
    };
  };

  const createKelas: SipetaContextValue["createKelas"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Tidak memiliki hak akses." };
    }
    const item: Kelas = { ...payload, id: `kls-${Date.now()}`, is_active: true };
    setKelasList((prev) => [...prev, item]);
    appendAuditLog("TAMBAH_MASTER_KELAS", "kelas", item.id, { ...item });
    return { ok: true, message: `Kelas ${item.nama_kelas} berhasil ditambahkan.` };
  };

  const createKamar: SipetaContextValue["createKamar"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Tidak memiliki hak akses." };
    }
    const item: Kamar = { ...payload, id: `kmr-${Date.now()}`, is_active: true };
    setKamarList((prev) => [...prev, item]);
    appendAuditLog("TAMBAH_MASTER_KAMAR", "kamar", item.id, { ...item });
    return { ok: true, message: `Kamar ${item.nama_kamar} berhasil ditambahkan.` };
  };

  const createJenisPembayaran: SipetaContextValue["createJenisPembayaran"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Admin yang dapat mengelola jenis pembayaran." };
    }
    if (payload.nominal <= 0) {
      return { ok: false, message: "Nominal pembayaran harus lebih dari Rp 0." };
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
          "Untuk kebijakan Cicilan Minimal Nominal, batas minimal cicilan wajib diisi (> 0 dan <= nominal tagihan).",
      };
    }

    const newJenis: JenisPembayaran = {
      ...payload,
      id: `jp-${Date.now()}`,
      is_active: true,
    };
    setJenisPembayaranList((prev) => [newJenis, ...prev]);
    appendAuditLog("BUAT_JENIS_PEMBAYARAN", "jenis_pembayaran", newJenis.id, {
      kode: newJenis.kode_pembayaran,
      nama: newJenis.nama_pembayaran,
      nominal: newJenis.nominal,
      kebijakan_cicilan: newJenis.kebijakan_cicilan,
    });
    return {
      ok: true,
      message: `Jenis pembayaran "${newJenis.nama_pembayaran}" berhasil ditambahkan.`,
    };
  };

  const generateTagihan: SipetaContextValue["generateTagihan"] = (payload) => {
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
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
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
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
    if (currentUser.role !== "admin" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Tidak memiliki akses membuat pengumuman." };
    }
    const item: Pengumuman = {
      id: `pgm-${Date.now()}`,
      judul: payload.judul.trim(),
      kategori: payload.kategori,
      isi: payload.isi.trim(),
      is_penting: payload.is_penting,
      is_published: true,
      tanggal_publikasi: new Date().toISOString(),
      created_by_nama: currentUser.nama_lengkap,
    };
    setPengumumanList((prev) => [item, ...prev]);
    appendAuditLog("PUBLIKASI_PENGUMUMAN", "pengumuman", item.id, { judul: item.judul });
    return { ok: true, message: "Pengumuman pesantren berhasil dipublikasikan." };
  };

  // ============================================================================
  // ORANG TUA / WALI ACTIONS (KERANJANG CICILAN, CHECKOUT, & TOP-UP SAKU)
  // ============================================================================

  const addOrUpdateKeranjang: SipetaContextValue["addOrUpdateKeranjang"] = (
    tagihanId,
    nominalBayar
  ) => {
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
        nama_bank: rekeningResmi.nama_bank,
        nomor_rekening: rekeningResmi.nomor_rekening,
        atas_nama: rekeningResmi.atas_nama,
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
        nama_bank: rekeningResmi.nama_bank,
        nomor_rekening: rekeningResmi.nomor_rekening,
        atas_nama: rekeningResmi.atas_nama,
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
    if (!canRoleApproveFinancialTransaction(currentUser.role)) {
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
    if (!canRoleApproveFinancialTransaction(currentUser.role)) {
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
    if (!canRoleApproveFinancialTransaction(currentUser.role)) {
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
    if (currentUser.role !== "bendahara" && currentUser.role !== "superadmin") {
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
    if (currentUser.role !== "pengelola" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Pengelola Kepesantrenan yang dapat mencatat mengaji." };
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
    return { ok: true, message: "Catatan perkembangan mengaji berhasil disimpan." };
  };

  const recordSetoranTahfidz: SipetaContextValue["recordSetoranTahfidz"] = (payload) => {
    if (currentUser.role !== "pengelola" && currentUser.role !== "superadmin") {
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
    if (currentUser.role !== "pengelola" && currentUser.role !== "superadmin") {
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
    if (currentUser.role !== "pengelola" && currentUser.role !== "superadmin") {
      return {
        ok: false,
        message: "Hanya Pengelola Kepesantrenan yang dapat mencatat kedisiplinan.",
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
    return { ok: true, message: "Catatan kedisiplinan & pembinaan berhasil disimpan." };
  };

  const updateTindakLanjutKedisiplinan: SipetaContextValue["updateTindakLanjutKedisiplinan"] = (
    payload
  ) => {
    if (currentUser.role !== "pengelola" && currentUser.role !== "superadmin") {
      return { ok: false, message: "Hanya Pengelola Kepesantrenan yang dapat memperbarui pembinaan." };
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

  return (
    <SipetaContext.Provider
      value={{
        currentUser,
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
        logoutSupabase,

        switchActiveUser,
        getSaldoSantri,
        resetDemoData,
        createUserAccount,
        toggleUserActive,
        updateRekeningResmi,
        createSantriWithWali,
        moveSantriPlacement,
        updateStatusSantri,
        createKelas,
        createKamar,
        createJenisPembayaran,
        generateTagihan,
        adjustTagihan,
        createPengumuman,
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
        updateTindakLanjutKedisiplinan,
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

