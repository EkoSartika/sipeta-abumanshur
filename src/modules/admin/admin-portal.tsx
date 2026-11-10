"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Info,
  Landmark,
  Megaphone,
  Receipt,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { MasterTahunAjaranView } from "@/components/master/master-tahun-ajaran-view";
import {
  formatRupiah,
  formatTanggal,
  formatWaktuLengkap,
  getStatusSantriBadge,
  getStatusTagihanBadge,
  getStatusTransaksiBadge,
} from "@/lib/utils/format";
import type {
  JenisPembayaran,
  Santri,
  StatusSantri,
  Tagihan,
  TransaksiPembayaran,
} from "@/types/database";

export type AdminTab =
  | "dashboard"
  | "santri_asrama"
  | "keuangan"
  | "tahun_ajaran"
  | "laporan_tahfidz"
  | "laporan_kedisiplinan"
  | "kepesantrenan"
  | "pengumuman"
  | "audit_log";

export interface AdminPortalProps {
  activeTab?: AdminTab | string;
  onTabChange?: (tab: string) => void;
}

export function AdminPortal({
  activeTab: controlledTab,
  onTabChange,
}: AdminPortalProps = {}) {
  const {
    currentUser,
    santriList,
    waliList,
    kelasList,
    kamarList,
    riwayatPenempatan,
    jenisPembayaranList,
    tagihanList,
    transaksiPembayaranList,
    mutasiUangSakuList,
    mengajiList,
    tahfidzList,
    prestasiList,
    kedisiplinanList,
    pengumumanList,
    rekeningResmi,
    auditLogs,
    profilPesantren,
    approveJenisPembayaran,
    rejectJenisPembayaran,
  } = useSipeta();

  const [internalTab, setInternalTab] = useState<AdminTab>("dashboard");
  const activeTab = (controlledTab as AdminTab) || internalTab;
  const setActiveTab = (tab: AdminTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // State Persetujuan Pengajuan Pembiayaan Santri (Alur Pengasuh/Admin PRD)
  const [pembiayaanApprovalTab, setPembiayaanApprovalTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetItem, setRejectTargetItem] = useState<JenisPembayaran | null>(null);
  const [rejectCatatan, setRejectCatatan] = useState("");
  const [approvalFeedback, setApprovalFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Filter Santri di Pengawasan Santri & Asrama
  const [santriSearch, setSantriSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("all");
  const [filterKamar, setFilterKamar] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Filter Laporan Tahfidz
  const [tahfidzSearch, setTahfidzSearch] = useState("");
  const [tahfidzFilterKelas, setTahfidzFilterKelas] = useState("all");
  const [tahfidzFilterKualitas, setTahfidzFilterKualitas] = useState("all");
  const [tahfidzFilterJuz, setTahfidzFilterJuz] = useState("all");

  // Filter Laporan Kedisiplinan
  const [kedisiplinanSearch, setKedisiplinanSearch] = useState("");
  const [kedisiplinanFilterKelas, setKedisiplinanFilterKelas] = useState("all");
  const [kedisiplinanFilterTingkat, setKedisiplinanFilterTingkat] = useState("all");
  const [kedisiplinanFilterStatus, setKedisiplinanFilterStatus] = useState("all");

  // Filter Audit Log
  const [auditFilterAktivitas, setAuditFilterAktivitas] = useState("all");
  const [auditFilterRole, setAuditFilterRole] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");

  const filteredTahfidz = useMemo(() => {
    return tahfidzList.filter((th) => {
      const s = santriList.find((x) => x.id === th.santri_id);
      if (tahfidzSearch) {
        const query = tahfidzSearch.toLowerCase();
        const matchName = (s?.nama_lengkap || "").toLowerCase().includes(query);
        const matchNis = (s?.nis || "").includes(query);
        const matchSurah = (th.nama_surah || "").toLowerCase().includes(query);
        if (!matchName && !matchNis && !matchSurah) return false;
      }
      if (tahfidzFilterKelas !== "all" && s?.kelas_id !== tahfidzFilterKelas) return false;
      if (tahfidzFilterKualitas !== "all" && th.kualitas_hafalan !== tahfidzFilterKualitas) return false;
      if (tahfidzFilterJuz !== "all" && String(th.juz) !== tahfidzFilterJuz) return false;
      return true;
    });
  }, [tahfidzList, santriList, tahfidzSearch, tahfidzFilterKelas, tahfidzFilterKualitas, tahfidzFilterJuz]);

  const filteredKedisiplinan = useMemo(() => {
    return kedisiplinanList.filter((kd) => {
      const s = santriList.find((x) => x.id === kd.santri_id);
      if (kedisiplinanSearch) {
        const query = kedisiplinanSearch.toLowerCase();
        const matchName = (s?.nama_lengkap || "").toLowerCase().includes(query);
        const matchNis = (s?.nis || "").includes(query);
        const matchKat = (kd.nama_kategori || "").toLowerCase().includes(query);
        const matchDesc = (kd.deskripsi || "").toLowerCase().includes(query);
        if (!matchName && !matchNis && !matchKat && !matchDesc) return false;
      }
      if (kedisiplinanFilterKelas !== "all" && s?.kelas_id !== kedisiplinanFilterKelas) return false;
      if (kedisiplinanFilterTingkat !== "all" && kd.tingkat_pelanggaran !== kedisiplinanFilterTingkat) return false;
      if (kedisiplinanFilterStatus !== "all" && kd.status_tindak_lanjut !== kedisiplinanFilterStatus) return false;
      return true;
    });
  }, [kedisiplinanList, santriList, kedisiplinanSearch, kedisiplinanFilterKelas, kedisiplinanFilterTingkat, kedisiplinanFilterStatus]);

  // Perhitungan Metrik Pengawasan Eksekutif
  const metrics = useMemo(() => {
    const totalSantri = santriList.length;
    const santriAktif = santriList.filter((s) => s.status === "AKTIF").length;
    const santriCuti = santriList.filter((s) => s.status === "CUTI").length;
    const santriLulus = santriList.filter((s) => s.status === "LULUS").length;
    const santriPindah = santriList.filter((s) => s.status === "PINDAH").length;

    // Keuangan
    const totalTagihanNominal = tagihanList.reduce((acc, t) => acc + (t.nominal_tagihan || 0), 0);
    const totalTerbayarNominal = tagihanList.reduce((acc, t) => acc + (t.total_terbayar || 0), 0);
    const tagihanLunas = tagihanList.filter((t) => t.status === "LUNAS").length;
    const tagihanBelumLunas = tagihanList.filter((t) => t.status !== "LUNAS").length;
    const transaksiMenungguVerif = transaksiPembayaranList.filter(
      (t) => t.status === "MENUNGGU_VERIFIKASI"
    ).length;

    // Asrama
    const totalKapasitasKamar = kamarList.reduce((acc, km) => acc + (km.kapasitas || 0), 0);
    const tingkatKeterisian = totalKapasitasKamar > 0 ? (santriAktif / totalKapasitasKamar) * 100 : 0;

    // Kepesantrenan
    const totalPenilaianMengaji = mengajiList.length;
    const totalSetoranTahfidz = tahfidzList.length;
    const totalPrestasi = prestasiList.length;
    const santriDalamPembinaan = kedisiplinanList.filter(
      (k) => k.status_tindak_lanjut === "DALAM_PEMBINAAN"
    ).length;

    return {
      totalSantri,
      santriAktif,
      santriCuti,
      santriLulus,
      santriPindah,
      totalTagihanNominal,
      totalTerbayarNominal,
      tagihanLunas,
      tagihanBelumLunas,
      transaksiMenungguVerif,
      totalKapasitasKamar,
      tingkatKeterisian,
      totalPenilaianMengaji,
      totalSetoranTahfidz,
      totalPrestasi,
      santriDalamPembinaan,
    };
  }, [
    santriList,
    tagihanList,
    transaksiPembayaranList,
    kamarList,
    mengajiList,
    tahfidzList,
    prestasiList,
    kedisiplinanList,
  ]);

  // Santri yang difilter
  const filteredSantri = useMemo(() => {
    return santriList.filter((s) => {
      if (!s) return false;
      const q = (santriSearch || "").toLowerCase().trim();
      const nama = (s.nama_lengkap || "").toLowerCase();
      const nis = s.nis || "";
      const matchQuery = !q || nama.includes(q) || nis.includes(santriSearch);
      const matchKelas = filterKelas === "all" || s.kelas_id === filterKelas;
      const matchKamar = filterKamar === "all" || s.kamar_id === filterKamar;
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      return matchQuery && matchKelas && matchKamar && matchStatus;
    });
  }, [santriList, santriSearch, filterKelas, filterKamar, filterStatus]);

  // Audit logs yang difilter
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (!log) return false;
      const matchAktivitas = auditFilterAktivitas === "all" || log.aktivitas === auditFilterAktivitas;
      const matchRole = auditFilterRole === "all" || log.user_role === auditFilterRole;
      const q = (auditSearch || "").toLowerCase().trim();
      const matchSearch =
        !q ||
        (log.aktivitas && log.aktivitas.toLowerCase().includes(q)) ||
        (log.alasan_perubahan && log.alasan_perubahan.toLowerCase().includes(q)) ||
        (log.objek_id && log.objek_id.toLowerCase().includes(q));
      return matchAktivitas && matchRole && matchSearch;
    });
  }, [auditLogs, auditFilterAktivitas, auditFilterRole, auditSearch]);

  // Pengelompokan Usulan Pembiayaan dari Tata Usaha (TU)
  const pendingFees = useMemo(
    () => jenisPembayaranList.filter((j) => j.status_persetujuan === "MENUNGGU_PERSETUJUAN"),
    [jenisPembayaranList]
  );
  const approvedFees = useMemo(
    () => jenisPembayaranList.filter((j) => j.status_persetujuan === "DISETUJUI"),
    [jenisPembayaranList]
  );
  const rejectedFees = useMemo(
    () => jenisPembayaranList.filter((j) => j.status_persetujuan === "DITOLAK"),
    [jenisPembayaranList]
  );

  const getSasaranLabel = (jp: JenisPembayaran) => {
    if (jp.sasaran_santri === "SEMUA") return "Seluruh Santri Aktif";
    if (jp.sasaran_santri === "KELAS_TERTENTU") {
      const k = kelasList.find((x) => x.id === jp.sasaran_target_id);
      return `Kelas: ${k?.nama_kelas || "Kelas Tertentu"}`;
    }
    if (jp.sasaran_santri === "INDIVIDU") {
      const s = santriList.find((x) => x.id === jp.sasaran_target_id);
      return `Santri: ${s?.nama_lengkap || "Santri Tertentu"}`;
    }
    return jp.sasaran_santri || "Semua Santri";
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          TAB 0: DASHBOARD PENGAWASAN EKSEKUTIF
         ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* 4 Kuadran Metrik Pengawasan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Kuadran 1: Santri & Asrama */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Kependudukan Santri
                </span>
                <Users className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <span className="text-3xl font-black text-slate-900">{metrics.totalSantri}</span>
                <span className="text-xs text-slate-500 ml-1">Total Santri</span>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Santri Aktif:</span>
                  <strong className="text-emerald-700">{metrics.santriAktif}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Cuti / Pindah:</span>
                  <strong className="text-slate-700">{metrics.santriCuti + metrics.santriPindah}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Keterisian Asrama:</span>
                  <strong className="text-indigo-700">{metrics.tingkatKeterisian.toFixed(1)}%</strong>
                </div>
              </div>
            </div>

            {/* Kuadran 2: Keuangan & Pembayaran */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Keuangan &amp; SPP
                </span>
                <Wallet className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <span className="text-2xl font-black text-slate-900">
                  {formatRupiah(metrics.totalTerbayarNominal)}
                </span>
                <span className="block text-[11px] text-slate-400">Total SPP Terbayar</span>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Tagihan Lunas:</span>
                  <strong className="text-emerald-700">{metrics.tagihanLunas} tagihan</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Belum Lunas:</span>
                  <strong className="text-rose-700">{metrics.tagihanBelumLunas} tagihan</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Antrean Verifikasi:</span>
                  <strong className="text-amber-700">{metrics.transaksiMenungguVerif} transaksi</strong>
                </div>
              </div>
            </div>

            {/* Kuadran 3: Kepesantrenan & Tahfidz */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tahfidz &amp; Ibadah
                </span>
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <span className="text-3xl font-black text-slate-900">{metrics.totalSetoranTahfidz}</span>
                <span className="text-xs text-slate-500 ml-1">Setoran Tahfidz</span>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Penilaian Mengaji:</span>
                  <strong className="text-slate-800">{metrics.totalPenilaianMengaji} catatan</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Prestasi:</span>
                  <strong className="text-amber-700">{metrics.totalPrestasi} kejuaraan</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Dalam Pembinaan:</span>
                  <strong className="text-rose-700">{metrics.santriDalamPembinaan} santri</strong>
                </div>
              </div>
            </div>

            {/* Kuadran 4: Administrasi & Audit Staf */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pengawasan Operasional
                </span>
                <ShieldCheck className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <span className="text-3xl font-black text-slate-900">{auditLogs.length}</span>
                <span className="text-xs text-slate-500 ml-1">Jejak Audit</span>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Ruang Kelas Aktif:</span>
                  <strong className="text-slate-800">{kelasList.length} kelas</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Kamar Asrama:</span>
                  <strong className="text-slate-800">{kamarList.length} kamar</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Pengumuman Terbit:</span>
                  <strong className="text-slate-800">{pengumumanList.length} rilis</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Navigasi Cepat Pengasuh */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="font-extrabold text-sm text-slate-900">
              Pusat Pemantauan Lintas Bagian Pesantren
            </h3>
            <p className="text-xs text-slate-500">
              Klik menu pengawasan di bawah untuk memeriksa rincian data tanpa perlu beralih ke akun staf lain.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab("santri_asrama")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <Users className="h-4 w-4 text-emerald-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Data Santri &amp; Kamar</span>
                  <span className="text-[11px] text-slate-400">Seluruh santri &amp; wali</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("keuangan")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <CreditCard className="h-4 w-4 text-blue-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Pengawasan Keuangan</span>
                  <span className="text-[11px] text-slate-400">Tagihan &amp; uang saku</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("laporan_tahfidz")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <Sparkles className="h-4 w-4 text-amber-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Laporan Tahfidz</span>
                  <span className="text-[11px] text-slate-400">Rekap setoran &amp; capaian</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("laporan_kedisiplinan")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <ShieldAlert className="h-4 w-4 text-rose-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Laporan Kedisiplinan</span>
                  <span className="text-[11px] text-slate-400">Pelanggaran &amp; pembinaan</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("audit_log")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <FileText className="h-4 w-4 text-indigo-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Jejak Aktivitas Staf</span>
                  <span className="text-[11px] text-slate-400">Audit trail sistem</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: PENGAWASAN SANTRI & ASRAMA
         ===================================================================== */}
      {activeTab === "santri_asrama" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama santri atau NIS..."
                  value={santriSearch}
                  onChange={(e) => setSantriSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 min-h-[40px] focus:outline-none focus:border-emerald-600"
                />
              </div>
              <select
                value={filterKelas}
                onChange={(e) => setFilterKelas(e.target.value)}
                className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[40px]"
              >
                <option value="all">Semua Kelas</option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kelas}
                  </option>
                ))}
              </select>
              <select
                value={filterKamar}
                onChange={(e) => setFilterKamar(e.target.value)}
                className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[40px]"
              >
                <option value="all">Semua Kamar</option>
                {kamarList.map((km) => (
                  <option key={km.id} value={km.id}>
                    {km.nama_kamar}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                    <th className="py-3 px-4">NIS</th>
                    <th className="py-3 px-4">Nama Santri</th>
                    <th className="py-3 px-4">Kelas</th>
                    <th className="py-3 px-4">Kamar Asrama</th>
                    <th className="py-3 px-4">Orang Tua / Wali</th>
                    <th className="py-3 px-4">Kontak Wali</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSantri.map((s) => {
                    const k = kelasList.find((x) => x.id === s.kelas_id);
                    const km = kamarList.find((x) => x.id === s.kamar_id);
                    const w = waliList.find((x) => x.santri_id === s.id);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.nis}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{s.nama_lengkap}</td>
                        <td className="py-3 px-4 text-slate-700">{k?.nama_kelas || "-"}</td>
                        <td className="py-3 px-4 text-slate-700">{km?.nama_kamar || "-"}</td>
                        <td className="py-3 px-4 font-medium text-slate-800">{w?.nama_lengkap || "-"}</td>
                        <td className="py-3 px-4 text-slate-600 font-mono">{w?.no_telepon || "-"}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              getStatusSantriBadge(s.status).className
                            }`}
                          >
                            {getStatusSantriBadge(s.status).label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: PENGAWASAN KEUANGAN (READ-ONLY)
         ===================================================================== */}
      {activeTab === "keuangan" && (
        <div className="space-y-6">
          {approvalFeedback && (
            <div
              className={`rounded-2xl p-4 text-xs font-semibold flex items-center justify-between border ${
                approvalFeedback.ok
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}
            >
              <span>{approvalFeedback.text}</span>
              <button
                type="button"
                onClick={() => setApprovalFeedback(null)}
                className="text-slate-400 hover:text-slate-600 font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* ALUR PERSETUJUAN PEMBIAYAAN SANTRI (DARI TU) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-emerald-800" />
                  <h3 className="font-extrabold text-base text-slate-900">
                    Persetujuan Pengajuan Pembiayaan Santri
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tinjau usulan tagihan baru yang diajukan oleh Tata Usaha (TU)
                </p>
              </div>

              {/* Subtab Status */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPembiayaanApprovalTab("pending")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                    pembiayaanApprovalTab === "pending"
                      ? "bg-white text-emerald-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>Menunggu</span>
                  {pendingFees.length > 0 && (
                    <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[10px]">
                      {pendingFees.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPembiayaanApprovalTab("approved")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                    pembiayaanApprovalTab === "approved"
                      ? "bg-white text-emerald-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>Disetujui ({approvedFees.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPembiayaanApprovalTab("rejected")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                    pembiayaanApprovalTab === "rejected"
                      ? "bg-white text-emerald-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>Ditolak ({rejectedFees.length})</span>
                </button>
              </div>
            </div>

            {/* TAB PENDING */}
            {pembiayaanApprovalTab === "pending" && (
              <div className="space-y-3">
                {pendingFees.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 italic">
                    Tidak ada pengajuan pembiayaan santri yang menunggu persetujuan.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {pendingFees.map((fee) => (
                      <div
                        key={fee.id}
                        className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                              MENUNGGU PERSETUJUAN
                            </span>
                            <h4 className="font-extrabold text-sm text-slate-900 mt-1">
                              {fee.nama_pembayaran}
                            </h4>
                            <span className="text-[11px] text-slate-500">
                              Kategori: {fee.kategori} • Periode: {fee.periode_pembayaran}
                            </span>
                          </div>
                          <span className="font-extrabold text-base text-emerald-800">
                            {formatRupiah(fee.nominal)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-white/80 p-2.5 rounded-lg border border-amber-100 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Sasaran Santri:</span>
                            <strong className="text-slate-800">{getSasaranLabel(fee)}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Metode Pembayaran:</span>
                            <strong className="text-slate-800">
                              {fee.kebijakan_cicilan === "TIDAK_BOLEH" ? "Harus Dibayar Lunas" : "Bisa Dicicil"}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Tanggal Jatuh Tempo:</span>
                            <strong className="text-slate-800">{formatTanggal(fee.tanggal_jatuh_tempo)}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Kode Referensi:</span>
                            <strong className="text-slate-800 font-mono">{fee.kode_pembayaran}</strong>
                          </div>
                        </div>

                        {fee.deskripsi && (
                          <p className="text-[11px] text-slate-600 bg-white/60 p-2 rounded">
                            {fee.deskripsi}
                          </p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200/60">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectTargetItem(fee);
                              setRejectCatatan("");
                              setRejectModalOpen(true);
                            }}
                            className="rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                          >
                            Tolak dengan Catatan
                          </button>
                          <button
                            type="button"
                            disabled={approvingId === fee.id}
                            onClick={() => {
                              if (approvingId) return;
                              setApprovingId(fee.id);
                              try {
                                const res = approveJenisPembayaran(fee.id);
                                setApprovalFeedback({ ok: res.ok, text: res.message });
                              } finally {
                                setApprovingId(null);
                              }
                            }}
                            className="rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {approvingId === fee.id ? "Memproses..." : "Setujui & Terbitkan Tagihan"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB APPROVED */}
            {pembiayaanApprovalTab === "approved" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Nama Pembiayaan</th>
                      <th className="px-3 py-2.5">Nominal</th>
                      <th className="px-3 py-2.5">Sasaran</th>
                      <th className="px-3 py-2.5">Metode</th>
                      <th className="px-3 py-2.5">Jatuh Tempo</th>
                      <th className="px-3 py-2.5">Disetujui Oleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {approvedFees.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                          Belum ada pembiayaan yang disetujui.
                        </td>
                      </tr>
                    ) : (
                      approvedFees.map((fee) => (
                        <tr key={fee.id} className="hover:bg-slate-50/80">
                          <td className="px-3.5 py-2.5 font-bold text-slate-900">
                            <div>{fee.nama_pembayaran}</div>
                            <span className="text-[10px] text-slate-400 font-mono font-normal">
                              {fee.kode_pembayaran} • {fee.kategori}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-bold text-emerald-800">
                            {formatRupiah(fee.nominal)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{getSasaranLabel(fee)}</td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {fee.kebijakan_cicilan === "TIDAK_BOLEH" ? "Harus Lunas" : "Bisa Dicicil"}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500">
                            {formatTanggal(fee.tanggal_jatuh_tempo)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                              ✓ {fee.disetujui_oleh_nama || "Pengasuh Pondok"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB REJECTED */}
            {pembiayaanApprovalTab === "rejected" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Nama Pembiayaan</th>
                      <th className="px-3 py-2.5">Nominal</th>
                      <th className="px-3 py-2.5">Sasaran</th>
                      <th className="px-3 py-2.5">Catatan Evaluasi Penolakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rejectedFees.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                          Tidak ada pengajuan pembiayaan yang ditolak.
                        </td>
                      </tr>
                    ) : (
                      rejectedFees.map((fee) => (
                        <tr key={fee.id} className="hover:bg-slate-50/80">
                          <td className="px-3.5 py-2.5 font-bold text-slate-900">
                            <div>{fee.nama_pembayaran}</div>
                            <span className="text-[10px] text-slate-400 font-mono font-normal">
                              {fee.kode_pembayaran}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-700">
                            {formatRupiah(fee.nominal)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{getSasaranLabel(fee)}</td>
                          <td className="px-3 py-2.5 text-rose-700 bg-rose-50/50 font-medium">
                            {fee.catatan_persetujuan || "Ditolak tanpa catatan khusus"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Catatan Penolakan Pengajuan Pembiayaan */}
          {rejectModalOpen && rejectTargetItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Tolak Pengajuan Pembiayaan
                    </h3>
                    <p className="text-xs text-slate-500">
                      {rejectTargetItem.nama_pembayaran} ({formatRupiah(rejectTargetItem.nominal)})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Catatan Evaluasi / Alasan Penolakan *
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={rejectCatatan}
                      onChange={(e) => setRejectCatatan(e.target.value)}
                      placeholder="Tuliskan catatan perbaikan atau alasan penolakan untuk Tata Usaha (TU)..."
                      className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:outline-none focus:border-rose-600"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRejectModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={!rejectCatatan.trim()}
                      onClick={() => {
                        const res = rejectJenisPembayaran(rejectTargetItem.id, rejectCatatan.trim());
                        setApprovalFeedback({ ok: res.ok, text: res.message });
                        setRejectModalOpen(false);
                      }}
                      className="rounded-xl bg-rose-700 px-4 py-2 font-bold text-white hover:bg-rose-800 transition disabled:opacity-50 cursor-pointer"
                    >
                      Konfirmasi Tolak Pengajuan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tagihan Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900">Ringkasan Tagihan SPP Santri</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
                {tagihanList.slice(0, 15).map((t) => {
                  const s = santriList.find((x) => x.id === t.santri_id);
                  const jp = jenisPembayaranList.find((x) => x.id === t.jenis_pembayaran_id);
                  return (
                    <div key={t.id} className="pt-2 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900">{s?.nama_lengkap || "Santri"}</strong>
                        <span className="block text-slate-500 font-medium">
                          {jp?.nama_pembayaran || "Tagihan"} • Tempo: {formatTanggal(t.tanggal_jatuh_tempo)}
                        </span>
                      </div>
                      <div className="text-right">
                        <strong className="text-slate-900">{formatRupiah(t.nominal_tagihan)}</strong>
                        <span className="block text-[10px] text-emerald-700 font-bold">
                          Terbayar: {formatRupiah(t.total_terbayar)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transaksi Pembayaran Terbaru */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="font-extrabold text-sm text-slate-900">Riwayat Verifikasi Transaksi Bendahara</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
                {transaksiPembayaranList.slice(0, 15).map((tx) => {
                  return (
                    <div key={tx.id} className="pt-2 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900 font-mono">{tx.nomor_transaksi}</strong>
                        <span className="block text-slate-500">
                          {formatWaktuLengkap(tx.created_at)} • Bank: {tx.bank_pengirim || "BSI"}
                        </span>
                      </div>
                      <div className="text-right">
                        <strong className="text-slate-900">{formatRupiah(tx.total_nominal)}</strong>
                        <span
                          className={`block text-[10px] font-bold rounded-full px-2 py-0.5 mt-0.5 ${
                            getStatusTransaksiBadge(tx.status).className
                          }`}
                        >
                          {getStatusTransaksiBadge(tx.status).label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: LAPORAN TAHFIDZ AL-QUR'AN (PENGASUH PONDOK)
         ===================================================================== */}
      {(activeTab === "laporan_tahfidz" || activeTab === "kepesantrenan") && (
        <div className="space-y-6">
          {/* Header Card Laporan Tahfidz */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Rekapitulasi &amp; Riwayat Setoran Tahfidz Al-Qur&apos;an
                </h3>
              </div>
              <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 self-start sm:self-auto">
                Total Setoran: <strong className="text-amber-900">{tahfidzList.length}</strong>
              </span>
            </div>

            {/* Statistik Laporan Tahfidz */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                  Total Setoran
                </span>
                <p className="text-2xl font-extrabold text-amber-950 mt-1">{tahfidzList.length}</p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Seluruh riwayat tercatat</span>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Kualitas Lancar
                </span>
                <p className="text-2xl font-extrabold text-emerald-950 mt-1">
                  {tahfidzList.filter((th) => th.kualitas_hafalan === "Lancar").length}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Hafalan mutqin &amp; lancar</span>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 block">
                  Kualitas Jayyid
                </span>
                <p className="text-2xl font-extrabold text-blue-950 mt-1">
                  {tahfidzList.filter((th) => th.kualitas_hafalan === "Jayyid").length}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Hafalan baik/cukup</span>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 block">
                  Santri Aktif Setor
                </span>
                <p className="text-2xl font-extrabold text-purple-950 mt-1">
                  {new Set(tahfidzList.map((th) => th.santri_id)).size}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Santri dengan riwayat</span>
              </div>
            </div>

            {/* Filter Laporan Tahfidz */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Cari Santri / Surah</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nama santri, NIS, surah..."
                    value={tahfidzSearch}
                    onChange={(e) => setTahfidzSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Filter Kelas</label>
                <select
                  value={tahfidzFilterKelas}
                  onChange={(e) => setTahfidzFilterKelas(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="all">Semua Kelas</option>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Kualitas Hafalan</label>
                <select
                  value={tahfidzFilterKualitas}
                  onChange={(e) => setTahfidzFilterKualitas(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="all">Semua Kualitas</option>
                  <option value="Lancar">Lancar</option>
                  <option value="Jayyid">Jayyid</option>
                  <option value="Kurang Lancar">Kurang Lancar</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Filter Juz</label>
                <select
                  value={tahfidzFilterJuz}
                  onChange={(e) => setTahfidzFilterJuz(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono"
                >
                  <option value="all">Semua Juz (1-30)</option>
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((juz) => (
                    <option key={juz} value={String(juz)}>
                      Juz {juz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tabel Laporan Tahfidz */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Nama Santri &amp; NIS</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">Surah &amp; Ayat</th>
                    <th className="px-4 py-3 text-center">Juz</th>
                    <th className="px-4 py-3 text-center">Jenis Setoran</th>
                    <th className="px-4 py-3 text-center">Kualitas Hafalan</th>
                    <th className="px-4 py-3">Catatan Pembina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTahfidz.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        Tidak ada riwayat setoran tahfidz yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTahfidz.map((th) => {
                      const s = santriList.find((x) => x.id === th.santri_id);
                      const k = s?.kelas_id ? kelasList.find((x) => x.id === s.kelas_id) : null;
                      return (
                        <tr key={th.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {formatTanggal(th.tanggal_setoran)}
                          </td>
                          <td className="px-4 py-3">
                            <strong className="text-slate-900 block">{s?.nama_lengkap || "Santri"}</strong>
                            <span className="text-[10px] text-slate-500 font-mono">{s?.nis || "-"}</span>
                          </td>
                          <td className="px-4 py-3">{k?.nama_kelas || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-amber-900 block">Surah {th.nama_surah}</span>
                            <span className="text-[10px] text-slate-500">Ayat {th.ayat_awal} - {th.ayat_akhir}</span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-800">
                            {th.juz}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {th.jenis_setoran}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                th.kualitas_hafalan === "Lancar"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : th.kualitas_hafalan === "Jayyid"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {th.kualitas_hafalan}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                            {th.catatan_pembimbing || "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3.5: LAPORAN KEDISIPLINAN SANTRI (PENGASUH PONDOK)
         ===================================================================== */}
      {activeTab === "laporan_kedisiplinan" && (
        <div className="space-y-6">
          {/* Header Card Laporan Kedisiplinan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Rekapitulasi Pelanggaran &amp; Riwayat Pembinaan Santri
                </h3>
              </div>
              <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200 self-start sm:self-auto">
                Total Catatan: <strong className="text-rose-900">{kedisiplinanList.length}</strong>
              </span>
            </div>

            {/* Statistik Laporan Kedisiplinan */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 block">
                  Total Kejadian
                </span>
                <p className="text-2xl font-extrabold text-rose-950 mt-1">{kedisiplinanList.length}</p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Seluruh riwayat pelanggaran</span>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                  Dalam Pembinaan
                </span>
                <p className="text-2xl font-extrabold text-amber-950 mt-1">
                  {kedisiplinanList.filter((k) => k.status_tindak_lanjut === "DALAM_PEMBINAAN").length}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Santri butuh pendampingan</span>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Pembinaan Selesai
                </span>
                <p className="text-2xl font-extrabold text-emerald-950 mt-1">
                  {kedisiplinanList.filter((k) => k.status_tindak_lanjut === "SELESAI").length}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Kasus terselesaikan</span>
              </div>
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 block">
                  Pelanggaran Berat
                </span>
                <p className="text-2xl font-extrabold text-purple-950 mt-1">
                  {kedisiplinanList.filter((k) => k.tingkat_pelanggaran === "BERAT").length}
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">Perlu atensi pimpinan</span>
              </div>
            </div>

            {/* Filter Laporan Kedisiplinan */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Cari Santri / Kategori</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nama santri, NIS, kategori..."
                    value={kedisiplinanSearch}
                    onChange={(e) => setKedisiplinanSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Filter Kelas</label>
                <select
                  value={kedisiplinanFilterKelas}
                  onChange={(e) => setKedisiplinanFilterKelas(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="all">Semua Kelas</option>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Tingkat Pelanggaran</label>
                <select
                  value={kedisiplinanFilterTingkat}
                  onChange={(e) => setKedisiplinanFilterTingkat(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="all">Semua Tingkat</option>
                  <option value="RINGAN">Ringan</option>
                  <option value="SEDANG">Sedang</option>
                  <option value="BERAT">Berat</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Status Tindak Lanjut</label>
                <select
                  value={kedisiplinanFilterStatus}
                  onChange={(e) => setKedisiplinanFilterStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="all">Semua Status</option>
                  <option value="DALAM_PEMBINAAN">Dalam Pembinaan</option>
                  <option value="SELESAI">Selesai</option>
                </select>
              </div>
            </div>

            {/* Tabel Laporan Kedisiplinan */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3">Nama Santri &amp; NIS</th>
                    <th className="px-4 py-3">Kelas</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Deskripsi Kejadian</th>
                    <th className="px-4 py-3 text-center">Tingkat</th>
                    <th className="px-4 py-3">Tindak Lanjut Pembinaan</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredKedisiplinan.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        Tidak ada riwayat catatan kedisiplinan yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredKedisiplinan.map((kd) => {
                      const s = santriList.find((x) => x.id === kd.santri_id);
                      const k = s?.kelas_id ? kelasList.find((x) => x.id === s.kelas_id) : null;
                      return (
                        <tr key={kd.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {formatTanggal(kd.tanggal_kejadian)}
                          </td>
                          <td className="px-4 py-3">
                            <strong className="text-slate-900 block">{s?.nama_lengkap || "Santri"}</strong>
                            <span className="text-[10px] text-slate-500 font-mono">{s?.nis || "-"}</span>
                          </td>
                          <td className="px-4 py-3">{k?.nama_kelas || "-"}</td>
                          <td className="px-4 py-3 font-bold text-purple-950">{kd.nama_kategori}</td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-slate-700">{kd.deskripsi}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                kd.tingkat_pelanggaran === "BERAT"
                                  ? "bg-rose-100 text-rose-800"
                                  : kd.tingkat_pelanggaran === "SEDANG"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {kd.tingkat_pelanggaran}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs">
                            <p>{kd.tindak_lanjut || "-"}</p>
                            {kd.catatan_pembinaan && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">
                                Catatan: {kd.catatan_pembinaan}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                kd.status_tindak_lanjut === "SELESAI"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {kd.status_tindak_lanjut}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PENGUMUMAN & AGENDA PONDOK
         ===================================================================== */}
      {activeTab === "pengumuman" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Pengumuman &amp; Agenda Pondok Pesantren</h3>
          </div>
          <div className="space-y-3">
            {pengumumanList.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-emerald-900 uppercase">Kategori: {p.kategori}</span>
                  <span>{formatTanggal(p.tanggal_publikasi)}</span>
                </div>
                <h4 className="font-extrabold text-sm text-slate-900">{p.judul}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{p.isi}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: JEJAK AUDIT AKTIVITAS STAF (AUDIT LOG)
         ===================================================================== */}
      {activeTab === "audit_log" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[220px] flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari aktivitas atau alasan perubahan..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 min-h-[40px] focus:outline-none focus:border-emerald-600"
                />
              </div>
              <select
                value={auditFilterRole}
                onChange={(e) => setAuditFilterRole(e.target.value)}
                className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 min-h-[40px]"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Pengasuh</option>
                <option value="tu">Tata Usaha</option>
                <option value="bendahara">Bendahara</option>
                <option value="pengelola">Asatidz</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                    <th className="py-3 px-4">Waktu</th>
                    <th className="py-3 px-4">Role &amp; Petugas</th>
                    <th className="py-3 px-4">Aktivitas</th>
                    <th className="py-3 px-4">Objek &amp; Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        Tidak ada log aktivitas yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-500 font-mono whitespace-nowrap">
                          {formatWaktuLengkap(log.waktu)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                            {log.user_role}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{log.aktivitas}</td>
                        <td className="py-3 px-4 text-slate-600">
                          <div>
                            Jenis: <strong>{log.jenis_objek}</strong>
                          </div>
                          {log.alasan_perubahan && (
                            <div className="text-[11px] text-slate-500">{log.alasan_perubahan}</div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB: MASTER DATA TAHUN PELAJARAN
         ===================================================================== */}
      {activeTab === "tahun_ajaran" && <MasterTahunAjaranView />}
    </div>
  );
}
