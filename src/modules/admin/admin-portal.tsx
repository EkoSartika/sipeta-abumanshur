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
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
  formatTanggal,
  formatWaktuLengkap,
  getStatusSantriBadge,
  getStatusTagihanBadge,
  getStatusTransaksiBadge,
} from "@/lib/utils/format";
import type {
  Santri,
  StatusSantri,
  Tagihan,
  TransaksiPembayaran,
} from "@/types/database";

export type AdminTab =
  | "dashboard"
  | "santri_asrama"
  | "keuangan"
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

  // Filter Santri di Pengawasan Santri & Asrama
  const [santriSearch, setSantriSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("all");
  const [filterKamar, setFilterKamar] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Filter Audit Log
  const [auditFilterAktivitas, setAuditFilterAktivitas] = useState("all");
  const [auditFilterRole, setAuditFilterRole] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");

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

  return (
    <div className="space-y-6">
      {/* Header Banner Portal Pengasuh Pondok */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200 border border-emerald-400/30">
                Pimpinan &amp; Pengasuh
              </span>
              <span className="text-xs text-emerald-200">• Mandat Pengawasan Menyeluruh</span>
            </div>
            <h2 className="text-xl font-extrabold mt-1 tracking-tight">
              Portal Pengasuh Pondok (Executive Dashboard)
            </h2>
            <p className="mt-0.5 text-xs text-emerald-100/90 leading-relaxed">
              Pemantauan terpadu seluruh santri, kelas, asrama, keuangan SPP, uang saku, capaian tahfidz,
              pembinaan kedisiplinan, pengumuman, dan jejak aktivitas staf pondok pesantren.
            </p>
          </div>
          <div className="hidden sm:flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 p-1.5 backdrop-blur border border-white/20 shadow-inner">
            <img
              src="/images/logo-abu-manshur.png"
              alt="Logo PP Modern Abu Manshur"
              className="h-full w-full object-contain drop-shadow"
            />
          </div>
        </div>
      </div>

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
                onClick={() => setActiveTab("kepesantrenan")}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 transition min-h-[44px] cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-amber-700 shrink-0" />
                <div>
                  <span className="block text-xs font-bold text-slate-900">Tahfidz &amp; Kedisiplinan</span>
                  <span className="text-[11px] text-slate-400">Mutaba&apos;ah &amp; prestasi</span>
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
          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-xs text-blue-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <Info className="h-4 w-4 text-blue-700" />
              Mode Pengawasan Keuangan (Read-Only)
            </span>
            <p className="text-slate-600">
              Pengasuh Pondok memiliki akses pemantauan penuh terhadap tagihan, setoran, dan mutasi uang saku santri tanpa kewenangan mutasi ledger demi kepatuhan audit.
            </p>
          </div>

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
          TAB 3: PENGAWASAN KEPESANTRENAN & TAHFIDZ
         ===================================================================== */}
      {activeTab === "kepesantrenan" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Setoran Tahfidz Terbaru */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-slate-900">Setoran Tahfidz Al-Qur&apos;an Terbaru</h3>
                <Sparkles className="h-4 w-4 text-amber-600" />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
                {tahfidzList.slice(0, 15).map((th) => {
                  const s = santriList.find((x) => x.id === th.santri_id);
                  return (
                    <div key={th.id} className="pt-2 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900">{s?.nama_lengkap || "Santri"}</strong>
                        <span className="block text-slate-500">
                          Surah {th.nama_surah} (Juz {th.juz}) • {th.jenis_setoran}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-700">{th.kualitas_hafalan}</span>
                        <span className="block text-[10px] text-slate-400">
                          {formatTanggal(th.tanggal_setoran)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Catatan Kedisiplinan & Pembinaan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-slate-900">Catatan Kedisiplinan &amp; Pembinaan</h3>
                <ShieldAlert className="h-4 w-4 text-rose-600" />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto divide-y divide-slate-100">
                {kedisiplinanList.slice(0, 15).map((kd) => {
                  const s = santriList.find((x) => x.id === kd.santri_id);
                  return (
                    <div key={kd.id} className="pt-2 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-slate-900">{s?.nama_lengkap || "Santri"}</strong>
                        <p className="text-slate-600 mt-0.5">{kd.deskripsi}</p>
                        <span className="text-[10px] text-slate-400">Tindak Lanjut: {kd.tindak_lanjut}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            kd.status_tindak_lanjut === "SELESAI"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {kd.status_tindak_lanjut}
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
          TAB 4: PENGUMUMAN & AGENDA PONDOK
         ===================================================================== */}
      {activeTab === "pengumuman" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Pengumuman &amp; Agenda Pondok Pesantren</h3>
            <p className="text-xs text-slate-500">
              Seluruh warta dan informasi resmi yang dirilis ke santri, wali santri, dan asatidz.
            </p>
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
    </div>
  );
}
