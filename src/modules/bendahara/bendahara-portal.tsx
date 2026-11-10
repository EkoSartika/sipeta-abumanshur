"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CreditCard,
  Eye,
  FileCheck2,
  FileText,
  History,
  Info,
  Landmark,
  RotateCcw,
  ShieldCheck,
  Upload,
  Wallet,
  XCircle,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
  formatTanggal,
  formatWaktuLengkap,
  getStatusTagihanBadge,
  getStatusTransaksiBadge,
} from "@/lib/utils/format";
import { SAMPLE_HANDOVER_PHOTO_1, INITIAL_SANTRI } from "@/lib/store/initial-data";
import { validateUploadedFile } from "@/lib/supabase/storage";
import { MediaPreviewModal } from "@/components/ui/media-modal";
import { AsatidzPortal } from "@/modules/pengelola/pengelola-portal";
import type { Santri } from "@/types/database";

export type BendaharaTab =
  | "dashboard"
  | "verifikasi_pembayaran"
  | "verifikasi_saku"
  | "penyerahan_saku"
  | "keuangan_saldo_santri"
  | "saldo_santri"
  | "ledger_koreksi"
  | "rekening_info"
  | "mengaji"
  | "tahfidz"
  | "prestasi"
  | "kedisiplinan"
  | "master_kategori_pelanggaran";

export interface BendaharaPortalProps {
  activeTab?: BendaharaTab | string;
  onTabChange?: (tab: string) => void;
}

export function BendaharaPortal({
  activeTab: controlledTab,
  onTabChange,
}: BendaharaPortalProps = {}) {
  const {
    santriList,
    kelasList,
    tagihanList,
    transaksiPembayaranList,
    pengajuanUangSakuList,
    mutasiUangSakuList,
    rekeningResmi,
    profilPesantren,
    getSaldoSantri,
    verifyTransaksiPembayaran,
    verifyTopupUangSaku,
    recordPenyerahanUangSaku,
    recordKoreksiLedgerSaku,
  } = useSipeta();

  const [internalTab, setInternalTab] = useState<BendaharaTab>("dashboard");
  const activeTab = ((controlledTab as BendaharaTab) || internalTab);
  const setActiveTab = (tab: BendaharaTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [catatanMap, setCatatanMap] = useState<Record<string, string>>({});

  // State form penyerahan uang saku (Uang Keluar - Wajib Foto)
  const [selectedSantriId, setSelectedSantriId] = useState(santriList[0]?.id ?? "");

  // Sinkronisasi otomatis selectedSantriId saat data santri dimuat dari Supabase
  useEffect(() => {
    if (santriList.length > 0 && (!selectedSantriId || !santriList.some((s) => s.id === selectedSantriId))) {
      const first = santriList[0];
      if (first) setSelectedSantriId(first.id);
    }
  }, [santriList, selectedSantriId]);
  const [nominalKeluar, setNominalKeluar] = useState("50000");
  const [keteranganKeluar, setKeteranganKeluar] = useState(
    "Penyerahan uang saku mingguan santri & kebutuhan alat tulis"
  );
  const [fotoPenyerahanUrl, setFotoPenyerahanUrl] = useState(SAMPLE_HANDOVER_PHOTO_1);
  const [fotoPenyerahanFilename, setFotoPenyerahanFilename] = useState(
    "foto-penyerahan-uang-saku-terverifikasi.jpg"
  );

  // State form jurnal koreksi / penyesuaian ledger
  const [keuanganSubTab, setKeuanganSubTab] = useState<"ringkasan" | "ledger" | "jurnal">(
    controlledTab === "ledger_koreksi" ? "ledger" : "ringkasan"
  );
  const [refMutasiId, setRefMutasiId] = useState(mutasiUangSakuList[0]?.id ?? "mut-001");
  const [jenisKoreksi, setJenisKoreksi] = useState<"PENYESUAIAN_TAMBAH" | "PENYESUAIAN_KURANG">(
    "PENYESUAIAN_TAMBAH"
  );
  const [nominalKoreksi, setNominalKoreksi] = useState("10000");
  const [alasanKoreksi, setAlasanKoreksi] = useState("");

  // Modal Pratinjau Bukti Transfer / Foto Penyerahan
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    subtitle: string;
    url: string | null;
  }>({ open: false, title: "", subtitle: "", url: null });

  const pendingPembayaran = useMemo(
    () => transaksiPembayaranList.filter((t) => t.status === "MENUNGGU_VERIFIKASI"),
    [transaksiPembayaranList]
  );
  const pendingTopupSaku = useMemo(
    () => pengajuanUangSakuList.filter((p) => p.status === "MENUNGGU_VERIFIKASI"),
    [pengajuanUangSakuList]
  );

  const selectedSantri: Santri | null =
    santriList.find((s) => s.id === selectedSantriId) ??
    santriList[0] ?? null;
  const saldoSelectedSantri = selectedSantri ? getSaldoSantri(selectedSantri.id) : { saldo_saat_ini: 0, total_masuk: 0, total_keluar: 0, batas_penarikan_harian: 100000, penarikan_hari_ini: 0 };

  const getSantriName = (id: string) => {
    const s = santriList.find((x) => x.id === id);
    return s ? `${s.nama_lengkap} (${s.nis})` : id;
  };

  const handleUploadFotoPenyerahan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateUploadedFile(file, "image_only");
    if (!check.valid) {
      setFeedback({ ok: false, text: check.error ?? "File foto tidak valid." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : SAMPLE_HANDOVER_PHOTO_1;
      setFotoPenyerahanUrl(dataUrl);
      setFotoPenyerahanFilename(file.name);
      setFeedback({ ok: true, text: `Foto penyerahan "${file.name}" berhasil dilampirkan.` });
    };
    reader.readAsDataURL(file);
  };

  const handlePenyerahanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSantri) {
      setFeedback({ ok: false, text: "Silakan pilih santri terlebih dahulu." });
      return;
    }
    const res = recordPenyerahanUangSaku({
      santri_id: selectedSantri.id,
      nominal: Number(nominalKeluar),
      keterangan: keteranganKeluar,
      foto_penyerahan_url: fotoPenyerahanUrl,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleKoreksiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = recordKoreksiLedgerSaku({
      referensi_mutasi_id: refMutasiId,
      jenis_mutasi: jenisKoreksi,
      nominal: Number(nominalKoreksi),
      alasan_koreksi: alasanKoreksi,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) setAlasanKoreksi("");
  };

  return (
    <div className="space-y-6">
      {/* Quick Indicators Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-400/30">
            Kebendaharaan &amp; Keuangan
          </span>
          <span className="text-xs text-slate-500">
            • Tahun Pelajaran {profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-center">
            <span className="text-xs text-amber-700 mr-1.5 font-medium">Antrean Bayar Tagihan:</span>
            <span className="text-sm font-bold text-amber-800">{pendingPembayaran.length}</span>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 text-center">
            <span className="text-xs text-amber-700 mr-1.5 font-medium">Antrean Top-Up Saku:</span>
            <span className="text-sm font-bold text-amber-800">{pendingTopupSaku.length}</span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 0: DASHBOARD BENDAHARA
         ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Antrean Bayar Tagihan
              </span>
              <p className="mt-1 text-2xl font-extrabold text-amber-950">
                {pendingPembayaran.length}
              </p>
              <span className="text-[11px] text-amber-700">Menunggu verifikasi</span>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                Antrean Top-Up Saku
              </span>
              <p className="mt-1 text-2xl font-extrabold text-blue-950">
                {pendingTopupSaku.length}
              </p>
              <span className="text-[11px] text-blue-700">Menunggu verifikasi</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Penyerahan Hari Ini
              </span>
              <p className="mt-1 text-2xl font-extrabold text-emerald-950">
                {mutasiUangSakuList.filter((m) => m.jenis_mutasi === "KELUAR").length}
              </p>
              <span className="text-[11px] text-emerald-700">Tercatat di ledger</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Rekening Resmi
              </span>
              <p className="mt-1 text-sm font-extrabold text-slate-900 truncate">
                {rekeningResmi?.nama_bank || "Bank BSI"} {rekeningResmi?.nomor_rekening || "-"}
              </p>
              <span className="text-[11px] text-slate-500 truncate block">
                {rekeningResmi?.atas_nama || "-"}
              </span>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("verifikasi_pembayaran")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-800 border border-amber-200 group-hover:bg-amber-700 group-hover:text-white transition shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-amber-900 transition">
                  Verifikasi Pembayaran Tagihan
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Periksa bukti transfer wali, nomor referensi, dan sahkan pelunasan SPP/tagihan santri.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("verifikasi_saku")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800 border border-blue-200 group-hover:bg-blue-700 group-hover:text-white transition shrink-0">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-900 transition">
                  Verifikasi Top-Up Uang Saku
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Konfirmasi permohonan pengisian uang saku dari wali dan tambahkan kredit ke saldo santri.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("penyerahan_saku")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 group-hover:bg-emerald-800 group-hover:text-white transition shrink-0">
                <Camera className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-900 transition">
                  Catat Penyerahan Uang Saku (+Foto Wajib)
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Rekam penyerahan uang saku langsung ke tangan santri dengan bukti foto dokumentasi wajib.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: VERIFIKASI PEMBAYARAN TAGIHAN (BAB 5.6 PRD)
         ===================================================================== */}
      {activeTab === "verifikasi_pembayaran" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Pengajuan Pembayaran Menunggu Verifikasi ({pendingPembayaran.length})
            </h3>

            {pendingPembayaran.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                Seluruh pengajuan pembayaran telah selesai diverifikasi.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {pendingPembayaran.map((trx) => (
                  <div
                    key={trx.id}
                    className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {trx.nomor_transaksi}
                        </span>
                        <span className="ml-2 text-xs font-semibold text-emerald-800">
                          Santri: {getSantriName(trx.santri_id)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewModal({
                            open: true,
                            title: `Bukti Transfer Pembayaran (${trx.nomor_transaksi})`,
                            subtitle: `Pengirim: ${trx.nama_pengirim} (${trx.bank_pengirim}) • Nominal: ${formatRupiah(
                              trx.total_nominal
                            )}`,
                            url: trx.bukti_transfer_url,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Periksa Bukti Transfer
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500">Tanggal Transfer:</span>{" "}
                        <strong>{formatTanggal(trx.tanggal_transfer)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Pengirim Rekening:</span>{" "}
                        <strong>
                          {trx.nama_pengirim} ({trx.bank_pengirim})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Total Transfer:</span>{" "}
                        <strong className="text-emerald-700 text-sm">
                          {formatRupiah(trx.total_nominal)}
                        </strong>
                      </div>
                    </div>

                    <div className="rounded-lg bg-white p-3 border border-slate-200 text-xs space-y-1">
                      <p className="font-bold text-slate-700">Rincian Alokasi Pembayaran:</p>
                      {trx.alokasi.map((alk) => (
                        <div key={alk.id} className="flex justify-between">
                          <span>• {alk.judul_tagihan}</span>
                          <span className="font-bold">{formatRupiah(alk.nominal_alokasi)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        placeholder="Catatan verifikasi / alasan penolakan (wajib jika ditolak)..."
                        value={catatanMap[trx.id] ?? ""}
                        onChange={(e) =>
                          setCatatanMap((prev) => ({ ...prev, [trx.id]: e.target.value }))
                        }
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const res = verifyTransaksiPembayaran(
                              trx.id,
                              "DISETUJUI",
                              catatanMap[trx.id] ?? "Bukti transfer sah dan nominal sesuai."
                            );
                            setFeedback({ ok: res.ok, text: res.message });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Setujui Atomik
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const res = verifyTransaksiPembayaran(
                              trx.id,
                              "DITOLAK",
                              catatanMap[trx.id] ?? ""
                            );
                            setFeedback({ ok: res.ok, text: res.message });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700"
                        >
                          <XCircle className="h-4 w-4" />
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seluruh Riwayat Transaksi Pembayaran */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Seluruh Transaksi Pembayaran Tagihan
            </h3>

            {/* Tampilan Kartu Khusus Mobile (< 768px) */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:hidden">
              {transaksiPembayaranList.map((t) => {
                const badge = getStatusTransaksiBadge(t.status);
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-slate-600">
                          {t.nomor_transaksi}
                        </span>
                        <h4 className="text-sm font-extrabold text-slate-900">
                          {getSantriName(t.santri_id)}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1 text-slate-600">
                      <div>
                        <strong>Pengirim:</strong> {t.nama_pengirim} ({t.bank_pengirim})
                      </div>
                      <div>
                        <strong>Tanggal:</strong> {formatTanggal(t.tanggal_transfer)}
                      </div>
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200">
                        <span className="font-semibold text-slate-700">Total Nominal:</span>
                        <span className="font-extrabold text-sm text-emerald-800">
                          {formatRupiah(t.total_nominal)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewModal({
                            open: true,
                            title: `Bukti Transfer (${t.nomor_transaksi})`,
                            subtitle: getSantriName(t.santri_id),
                            url: t.bukti_transfer_url,
                          })
                        }
                        className="w-full inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 min-h-[44px] touch-manipulation cursor-pointer"
                      >
                        Lihat Bukti Transfer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tampilan Tabel Desktop (>= 768px) */}
            <div className="mt-3 hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 uppercase text-slate-500">
                    <th className="py-2.5 pr-3">No. Transaksi</th>
                    <th className="py-2.5 px-3">Santri</th>
                    <th className="py-2.5 px-3">Pengirim & Tanggal</th>
                    <th className="py-2.5 px-3 text-right">Total Nominal</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 pl-3">Bukti</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transaksiPembayaranList.map((t) => {
                    const badge = getStatusTransaksiBadge(t.status);
                    return (
                      <tr key={t.id}>
                        <td className="py-3 pr-3 font-mono font-bold text-slate-800">
                          {t.nomor_transaksi}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-900">
                          {getSantriName(t.santri_id)}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {t.nama_pengirim} ({t.bank_pengirim}) • {formatTanggal(t.tanggal_transfer)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-emerald-700">
                          {formatRupiah(t.total_nominal)}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 pl-3">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                open: true,
                                title: `Bukti Transfer (${t.nomor_transaksi})`,
                                subtitle: getSantriName(t.santri_id),
                                url: t.bukti_transfer_url,
                              })
                            }
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            Lihat Bukti
                          </button>
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
          TAB 2: VERIFIKASI TOP-UP UANG SAKU (BAB 6.2 PRD)
         ===================================================================== */}
      {activeTab === "verifikasi_saku" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Verifikasi Pengajuan Pengisian (Top-Up) Uang Saku ({pendingTopupSaku.length})
            </h3>
          </div>

          {pendingTopupSaku.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Tidak ada antrean pengajuan uang saku yang menunggu verifikasi.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingTopupSaku.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {p.nomor_pengajuan}
                      </span>
                      <span className="ml-2 text-xs font-semibold text-emerald-800">
                        Santri: {getSantriName(p.santri_id)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewModal({
                          open: true,
                          title: `Bukti Transfer Top-Up Uang Saku (${p.nomor_pengajuan})`,
                          subtitle: `Pengirim: ${p.nama_pengirim} • Nominal: ${formatRupiah(
                            p.nominal
                          )}`,
                          url: p.bukti_transfer_url,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Lihat Bukti Transfer
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-500">Nominal Top-Up:</span>{" "}
                      <strong className="text-emerald-700 text-sm">
                        {formatRupiah(p.nominal)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Pengirim:</span>{" "}
                      <strong>
                        {p.nama_pengirim} ({p.bank_pengirim})
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Keterangan:</span>{" "}
                      <strong>{p.keterangan}</strong>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      placeholder="Catatan verifikasi / alasan penolakan..."
                      value={catatanMap[p.id] ?? ""}
                      onChange={(e) =>
                        setCatatanMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const res = verifyTopupUangSaku(
                            p.id,
                            "DISETUJUI",
                            catatanMap[p.id] ?? "Transfer uang saku diterima."
                          );
                          setFeedback({ ok: res.ok, text: res.message });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Setujui & Tambah Saldo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = verifyTopupUangSaku(p.id, "DITOLAK", catatanMap[p.id] ?? "");
                          setFeedback({ ok: res.ok, text: res.message });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700"
                      >
                        <XCircle className="h-4 w-4" />
                        Tolak
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: PENCATATAN UANG KELUAR / PENYERAHAN UANG SAKU (WAJIB FOTO)
         ===================================================================== */}
      {activeTab === "penyerahan_saku" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Camera className="h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Form Pencatatan Penyerahan Uang Saku Tunai (Uang Keluar)
                </h3>
              </div>
            </div>

            <form onSubmit={handlePenyerahanSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Pilih Santri</label>
                <select
                  value={selectedSantriId}
                  onChange={(e) => setSelectedSantriId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm font-medium"
                >
                  {santriList.map((s) => {
                    const sld = getSaldoSantri(s.id);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.nama_lengkap} (Saldo Tersedia:{" "}
                        {formatRupiah(sld.saldo_saat_ini)})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-800">
                    Saldo Uang Saku {selectedSantri?.nama_lengkap || "-"}:
                  </span>
                  <p className="text-lg font-extrabold text-emerald-950">
                    {formatRupiah(saldoSelectedSantri.saldo_saat_ini)}
                  </p>
                </div>
                <div className="text-right text-xs text-emerald-800">
                  <div>Saldo Sesudah Penarikan:</div>
                  <strong className="text-sm">
                    {formatRupiah(
                      Math.max(0, saldoSelectedSantri.saldo_saat_ini - Number(nominalKeluar || 0))
                    )}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Nominal Penyerahan Uang (Rp)
                </label>
                <input
                  type="number"
                  min={1000}
                  required
                  value={nominalKeluar}
                  onChange={(e) => setNominalKeluar(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Keterangan Penyerahan Uang Saku
                </label>
                <input
                  type="text"
                  required
                  value={keteranganKeluar}
                  onChange={(e) => setKeteranganKeluar(e.target.value)}
                  placeholder="Contoh: Penyerahan uang saku mingguan & pembelian perlengkapan mandi"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Unggah Foto Bukti Penyerahan Uang (WAJIB)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setFotoPenyerahanUrl("");
                      setFotoPenyerahanFilename("Belum ada foto dipilih");
                    }}
                    className="text-[11px] text-rose-600 hover:underline"
                  >
                    Kosongkan (Uji Validasi Wajib Foto)
                  </button>
                </div>
                <label className="mt-1 flex cursor-pointer items-center justify-between rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 p-3 text-xs text-emerald-950">
                  <div className="flex items-center gap-2 truncate">
                    <Camera className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span className="truncate font-semibold">{fotoPenyerahanFilename}</span>
                  </div>
                  <span className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white shrink-0">
                    Ambil / Pilih Foto
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleUploadFotoPenyerahan}
                    className="hidden"
                  />
                </label>
                {!fotoPenyerahanUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFotoPenyerahanUrl(SAMPLE_HANDOVER_PHOTO_1);
                      setFotoPenyerahanFilename("foto-penyerahan-uang-saku-terverifikasi.jpg");
                    }}
                    className="mt-1.5 text-[11px] font-semibold text-emerald-700 underline"
                  >
                    Gunakan Kamera Simulasi Dokumentasi Penyerahan
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-800 transition"
              >
                Sahkan Penyerahan Uang Saku & Potong Saldo
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Pratinjau Dokumentasi Foto Penyerahan
            </h3>
            <p className="text-xs text-slate-500">
              Foto ini akan langsung terlihat pada Dashboard dan Menu Uang Saku Orang Tua/Wali
              santri bersangkutan.
            </p>
            {fotoPenyerahanUrl ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoPenyerahanUrl}
                  alt="Pratinjau Foto Penyerahan"
                  className="w-full rounded-lg object-contain max-h-72"
                />
              </div>
            ) : (
              <div className="mt-4 flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/50 p-6 text-center text-xs text-rose-800">
                <AlertTriangle className="h-8 w-8 text-rose-600 mb-2" />
                <strong>Foto Penyerahan Belum Dilampirkan!</strong>
                <span>
                  Sistem akan menolak penyimpanan transaksi uang keluar apabila foto penyerahan
                  kosong.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB TERPADU: KEUANGAN & SALDO SANTRI (BAB 6 PRD)
          Menyatukan: Ringkasan Saldo, Riwayat Mutasi Ledger, & Jurnal Koreksi
         ===================================================================== */}
      {(activeTab === "keuangan_saldo_santri" ||
        activeTab === "ledger_koreksi" ||
        activeTab === "saldo_santri") && (
        <div className="w-full space-y-6">
          {/* Subtab Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Keuangan &amp; Saldo Santri</h3>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 flex-wrap">
              <button
                type="button"
                onClick={() => setKeuanganSubTab("ringkasan")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition min-h-[38px] ${
                  keuanganSubTab === "ringkasan"
                    ? "bg-white text-emerald-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Wallet className="h-4 w-4" />
                <span>Ringkasan Saldo Santri</span>
              </button>
              <button
                type="button"
                onClick={() => setKeuanganSubTab("ledger")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition min-h-[38px] ${
                  keuanganSubTab === "ledger"
                    ? "bg-white text-emerald-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span>Riwayat Mutasi / Ledger</span>
              </button>
              <button
                type="button"
                onClick={() => setKeuanganSubTab("jurnal")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition min-h-[38px] ${
                  keuanganSubTab === "jurnal"
                    ? "bg-white text-emerald-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <RotateCcw className="h-4 w-4" />
                <span>Jurnal Koreksi</span>
              </button>
            </div>
          </div>

          {/* SUBTAB 1: RINGKASAN SALDO SANTRI */}
          {keuanganSubTab === "ringkasan" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Rekapitulasi Saldo Uang Saku per Santri
                  </h4>
                  <p className="text-xs text-slate-500">
                    Saldo dihitung otomatis dari ledger: Masuk - Keluar + Penyesuaian Sah.
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                    Total Dana Mengendap
                  </span>
                  <span className="text-base font-black text-emerald-950">
                    {formatRupiah(
                      santriList.reduce((acc, s) => acc + getSaldoSantri(s.id).saldo_saat_ini, 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                      <th className="py-3 px-4">Santri &amp; NIS</th>
                      <th className="py-3 px-3 text-right">Total Masuk</th>
                      <th className="py-3 px-3 text-right">Total Keluar</th>
                      <th className="py-3 px-3 text-right">Penyesuaian</th>
                      <th className="py-3 px-4 text-right">Saldo Saat Ini</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {santriList.map((s) => {
                      const ldg = getSaldoSantri(s.id);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            <div>{s.nama_lengkap}</div>
                            <div className="font-mono text-[11px] text-slate-500">NIS: {s.nis}</div>
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                            +{formatRupiah(ldg.total_masuk)}
                          </td>
                          <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                            -{formatRupiah(ldg.total_keluar)}
                          </td>
                          <td className="py-3 px-3 text-right text-purple-700 font-semibold">
                            {ldg.total_penyesuaian >= 0 ? "+" : ""}
                            {formatRupiah(ldg.total_penyesuaian)}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                            {formatRupiah(ldg.saldo_saat_ini)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBTAB 2: RIWAYAT MUTASI */}
          {keuanganSubTab === "ledger" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-900">
                  Riwayat Mutasi Uang Saku
                </h4>
              </div>

              <div className="space-y-2.5">
                {mutasiUangSakuList.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center text-xs hover:border-slate-300 transition"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          {m.nomor_transaksi}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 font-bold text-[10px] ${
                            m.jenis_mutasi === "MASUK"
                              ? "bg-emerald-100 text-emerald-800"
                              : m.jenis_mutasi === "KELUAR"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {m.jenis_mutasi}
                        </span>
                        <span className="font-semibold text-emerald-900">
                          {getSantriName(m.santri_id)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">{m.keterangan}</p>
                      {m.alasan_koreksi && (
                        <p className="text-purple-700 font-medium">
                          Alasan Koreksi: {m.alasan_koreksi}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Petugas: {m.petugas_nama} • {formatWaktuLengkap(m.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`font-black text-sm ${
                          m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                          ? "+"
                          : "-"}
                        {formatRupiah(m.nominal)}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {formatRupiah(m.saldo_sebelum)} → {formatRupiah(m.saldo_sesudah)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUBTAB 3: JURNAL KOREKSI / PENYESUAIAN */}
          {keuanganSubTab === "jurnal" && (
            <div className="max-w-2xl mx-auto rounded-2xl border border-purple-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-purple-100 pb-3">
                <RotateCcw className="h-5 w-5 text-purple-700" />
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Jurnal Penyesuaian &amp; Koreksi Ledger
                  </h4>
                  <p className="text-xs text-slate-500">
                    Koreksi dilakukan melalui jurnal pembalik resmi dengan rekaman audit permanen.
                  </p>
                </div>
              </div>

              <form onSubmit={handleKoreksiSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Transaksi Referensi yang Dikoreksi
                  </label>
                  <select
                    value={refMutasiId}
                    onChange={(e) => setRefMutasiId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium focus:border-purple-600 focus:outline-none min-h-[42px]"
                  >
                    {mutasiUangSakuList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nomor_transaksi} — {getSantriName(m.santri_id)} ({formatRupiah(m.nominal)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Jenis Penyesuaian
                  </label>
                  <select
                    value={jenisKoreksi}
                    onChange={(e) =>
                      setJenisKoreksi(
                        e.target.value as "PENYESUAIAN_TAMBAH" | "PENYESUAIAN_KURANG"
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold focus:border-purple-600 focus:outline-none min-h-[42px]"
                  >
                    <option value="PENYESUAIAN_TAMBAH">PENYESUAIAN TAMBAH (+ Tambah Saldo)</option>
                    <option value="PENYESUAIAN_KURANG">PENYESUAIAN KURANG (- Kurangi Saldo)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nominal Koreksi (Rp)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={nominalKoreksi}
                    onChange={(e) => setNominalKoreksi(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-purple-600 focus:outline-none min-h-[42px]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Alasan Koreksi (Wajib Dicatat untuk Audit Log Pesantren)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={alasanKoreksi}
                    onChange={(e) => setAlasanKoreksi(e.target.value)}
                    placeholder="Tuliskan keterangan dan alasan koreksi ledger secara detail..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-purple-600 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-700 py-3 font-bold text-white hover:bg-purple-800 transition min-h-[44px] cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Simpan Jurnal Koreksi &amp; Rekam Audit</span>
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB: REKENING RESMI PESANTREN (TAMPILAN BACA SAJA / READ-ONLY BENDAHARA)
          Sesuai Bagian B.3 & D: Bendahara dapat melihat rekening untuk verifikasi
          pembayaran, tetapi tidak dapat mengubahnya.
         ===================================================================== */}
      {activeTab === "rekening_info" && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
                <Landmark className="h-3.5 w-3.5" />
                <span>Referensi Rekening Resmi Pesantren</span>
              </div>
              <h3 className="mt-2 text-base font-extrabold text-slate-900">
                Rekening Resmi Tujuan Pembayaran &amp; Uang Saku
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gunakan informasi rekening resmi tunggal ini untuk mencocokkan mutasi bank saat verifikasi pembayaran transfer wali santri.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 border border-slate-200 shrink-0">
              Tampilan Baca Saja
            </span>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-900 via-emerald-950 to-slate-900 p-6 text-white shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                  Bank Tujuan Resmi
                </span>
                <h4 className="text-xl font-extrabold text-white mt-0.5">
                  {rekeningResmi?.nama_bank || "Bank Syariah Indonesia (BSI)"}
                </h4>
              </div>
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-mono font-bold text-emerald-200 border border-white/15">
                Kode: {rekeningResmi?.kode_bank || "451"}
              </span>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                Nomor Rekening
              </span>
              <p className="text-2xl font-mono font-extrabold tracking-wider text-emerald-100 mt-0.5">
                {rekeningResmi?.nomor_rekening || "-"}
              </p>
            </div>

            <div className="border-t border-white/10 pt-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-[11px] text-emerald-300">Atas Nama:</span>
                <p className="font-bold text-white text-sm">{rekeningResmi?.atas_nama || "-"}</p>
              </div>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                1 Rekening Tunggal Aktif
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          FITUR ASATIDZ TERINTEGRASI UNTUK BENDAHARA
          Sesuai PRD Bagian F: Bendahara memiliki akses ke seluruh fitur Asatidz
         ===================================================================== */}
      {(activeTab === "mengaji" ||
        activeTab === "tahfidz" ||
        activeTab === "prestasi" ||
        activeTab === "kedisiplinan" ||
        activeTab === "master_kategori_pelanggaran") && (
        <div className="space-y-4">
          <AsatidzPortal activeTab={activeTab} onTabChange={onTabChange} />
        </div>
      )}

      <MediaPreviewModal
        isOpen={previewModal.open}
        onClose={() => setPreviewModal((prev) => ({ ...prev, open: false }))}
        title={previewModal.title}
        subtitle={previewModal.subtitle}
        imageUrl={previewModal.url}
      />
    </div>
  );
}

