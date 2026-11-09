"use client";

import React, { useMemo, useState } from "react";
import {
  Award,
  Bell,
  BookOpen,
  Camera,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  History,
  Info,
  Landmark,
  LayoutDashboard,
  Plus,
  Receipt,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Wallet,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
  formatTanggal,
  formatWaktuLengkap,
  getKebijakanCicilanLabel,
  getStatusSantriBadge,
  getStatusTagihanBadge,
  getStatusTransaksiBadge,
} from "@/lib/utils/format";
import { SAMPLE_TRANSFER_PROOF_1 } from "@/lib/store/initial-data";
import { validateUploadedFile } from "@/lib/supabase/storage";
import { MediaPreviewModal } from "@/components/ui/media-modal";
import type { TransaksiPembayaran } from "@/types/database";

type WaliTab =
  | "dashboard"
  | "pembayaran"
  | "uang_saku"
  | "kepesantrenan"
  | "notifikasi";

export function WaliPortal() {
  const {
    currentUser,
    santriList,
    kelasList,
    kamarList,
    rekeningResmi,
    tagihanList,
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
    getSaldoSantri,
    addOrUpdateKeranjang,
    removeFromKeranjang,
    submitCheckoutPembayaran,
    uploadBuktiTransferPembayaran,
    submitTopupUangSaku,
    markNotifikasiRead,
    markAllNotifikasiRead,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<WaliTab>("dashboard");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State input nominal cicilan per tagihan
  const [customNominalMap, setCustomNominalMap] = useState<Record<string, string>>({});

  // State form checkout pembayaran
  const [tanggalTransferBayar, setTanggalTransferBayar] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [namaPengirimBayar, setNamaPengirimBayar] = useState(
    currentUser?.nama_lengkap ? currentUser.nama_lengkap.replace(/\s*\(Wali.*\)/, "") : ""
  );
  const [bankPengirimBayar, setBankPengirimBayar] = useState("Bank Syariah Indonesia (BSI)");
  const [buktiBayarUrl, setBuktiBayarUrl] = useState(SAMPLE_TRANSFER_PROOF_1);
  const [buktiBayarFilename, setBuktiBayarFilename] = useState(
    "bukti-transfer-bsi-terlampir.jpg"
  );

  // State form top-up uang saku
  const [nominalTopup, setNominalTopup] = useState("250000");
  const [tanggalTopup, setTanggalTopup] = useState(new Date().toISOString().slice(0, 10));
  const [namaPengirimTopup, setNamaPengirimTopup] = useState(
    currentUser?.nama_lengkap ? currentUser.nama_lengkap.replace(/\s*\(Wali.*\)/, "") : ""
  );
  const [bankPengirimTopup, setBankPengirimTopup] = useState("BSI Mobile");
  const [keteranganTopup, setKeteranganTopup] = useState(
    "Pengisian uang saku santri bulanan"
  );
  const [buktiTopupUrl, setBuktiTopupUrl] = useState(SAMPLE_TRANSFER_PROOF_1);
  const [buktiTopupFilename, setBuktiTopupFilename] = useState(
    "bukti-transfer-uang-saku.jpg"
  );

  // State sub-tab kepesantrenan
  const [subTabPesantren, setSubTabPesantren] = useState<
    "mengaji" | "tahfidz" | "prestasi" | "kedisiplinan"
  >("mengaji");

  // Modal Pratinjau Foto Penyerahan / Bukti Transfer
  const [previewModal, setPreviewModal] = useState<{
    open: boolean;
    title: string;
    subtitle: string;
    url: string | null;
  }>({ open: false, title: "", subtitle: "", url: null });

  // Modal Unggah Bukti Susulan (Bab 5.3 PRD / rpc_unggah_bukti_transfer_pembayaran)
  const [uploadTrxModalOpen, setUploadTrxModalOpen] = useState(false);
  const [selectedTrxForUpload, setSelectedTrxForUpload] = useState<TransaksiPembayaran | null>(null);
  const [uploadTanggalTransfer, setUploadTanggalTransfer] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [uploadNamaPengirim, setUploadNamaPengirim] = useState(
    currentUser?.nama_lengkap ? currentUser.nama_lengkap.replace(/\s*\(Wali.*\)/, "") : ""
  );
  const [uploadBankPengirim, setUploadBankPengirim] = useState("Bank Syariah Indonesia (BSI)");
  const [uploadBuktiUrl, setUploadBuktiUrl] = useState(SAMPLE_TRANSFER_PROOF_1);
  const [uploadFilename, setUploadFilename] = useState("bukti-transfer-susulan.jpg");

  // Relasi 1:1 Akun Orang Tua -> Hanya melihat 1 santri yang terhubung
  const santri = useMemo(() => {
    const targetId = currentUser?.santri_id ?? "snt-001";
    return santriList.find((s) => s.id === targetId) ?? santriList[0]!;
  }, [currentUser?.santri_id, santriList]);

  const kelas = kelasList.find((k) => k.id === santri.kelas_id);
  const kamar = kamarList.find((k) => k.id === santri.kamar_id);
  const saldoSaku = getSaldoSantri(santri.id);

  // Filter seluruh data eksklusif untuk santri yang terhubung (Isolasi Data Lintas Santri)
  const myTagihan = useMemo(
    () => tagihanList.filter((t) => t.santri_id === santri.id && t.is_active),
    [tagihanList, santri.id]
  );
  const unpaidTagihan = useMemo(
    () => myTagihan.filter((t) => t.sisa_tagihan > 0 && t.status !== "DIBATALKAN"),
    [myTagihan]
  );
  const totalTunggakan = useMemo(
    () => unpaidTagihan.reduce((acc, item) => acc + item.sisa_tagihan, 0),
    [unpaidTagihan]
  );

  const myTransaksiPembayaran = useMemo(
    () => transaksiPembayaranList.filter((t) => t.santri_id === santri.id),
    [transaksiPembayaranList, santri.id]
  );
  const myPengajuanSaku = useMemo(
    () => pengajuanUangSakuList.filter((p) => p.santri_id === santri.id),
    [pengajuanUangSakuList, santri.id]
  );
  const myMutasiSaku = useMemo(
    () => mutasiUangSakuList.filter((m) => m.santri_id === santri.id),
    [mutasiUangSakuList, santri.id]
  );
  const myMengaji = useMemo(
    () => mengajiList.filter((m) => m.santri_id === santri.id),
    [mengajiList, santri.id]
  );
  const myTahfidz = useMemo(
    () => tahfidzList.filter((t) => t.santri_id === santri.id),
    [tahfidzList, santri.id]
  );
  const myPrestasi = useMemo(
    () => prestasiList.filter((p) => p.santri_id === santri.id),
    [prestasiList, santri.id]
  );
  const myKedisiplinan = useMemo(
    () => kedisiplinanList.filter((d) => d.santri_id === santri.id),
    [kedisiplinanList, santri.id]
  );
  const myNotifikasi = useMemo(
    () => notifikasiList.filter((n) => (currentUser ? n.user_id === currentUser.id : false) || n.santri_id === santri.id),
    [notifikasiList, currentUser?.id, santri.id]
  );
  const unreadNotifCount = myNotifikasi.filter((n) => !n.is_read).length;

  const totalKeranjang = useMemo(
    () => keranjang.reduce((sum, item) => sum + item.nominal_bayar, 0),
    [keranjang]
  );

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "bayar" | "saku"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateUploadedFile(file, "image_or_pdf");
    if (!check.valid) {
      setFeedback({ ok: false, text: check.error ?? "File tidak valid." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : SAMPLE_TRANSFER_PROOF_1;
      if (target === "bayar") {
        setBuktiBayarUrl(dataUrl);
        setBuktiBayarFilename(file.name);
      } else {
        setBuktiTopupUrl(dataUrl);
        setBuktiTopupFilename(file.name);
      }
      setFeedback({ ok: true, text: `File "${file.name}" siap diunggah.` });
    };
    reader.readAsDataURL(file);
  };

  const handleAddBillToCart = (tagihanId: string, defaultAmount: number) => {
    const rawStr = customNominalMap[tagihanId];
    const amount = rawStr !== undefined ? Number(rawStr) : defaultAmount;
    const res = addOrUpdateKeranjang(tagihanId, amount);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = submitCheckoutPembayaran({
      tanggal_transfer: tanggalTransferBayar,
      nama_pengirim: namaPengirimBayar,
      bank_pengirim: bankPengirimBayar,
      bukti_transfer_url: buktiBayarUrl,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleTopupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = submitTopupUangSaku({
      nominal: Number(nominalTopup),
      tanggal_transfer: tanggalTopup,
      nama_pengirim: namaPengirimTopup,
      bank_pengirim: bankPengirimTopup,
      bukti_transfer_url: buktiTopupUrl,
      keterangan: keteranganTopup,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleUploadSusulanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrxForUpload) return;
    const res = uploadBuktiTransferPembayaran({
      transaksi_id: selectedTrxForUpload.id,
      tanggal_transfer: uploadTanggalTransfer,
      nama_pengirim: uploadNamaPengirim,
      bank_pengirim: uploadBankPengirim,
      bukti_transfer_url: uploadBuktiUrl,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setUploadTrxModalOpen(false);
      setSelectedTrxForUpload(null);
    }
  };

  const santriBadge = getStatusSantriBadge(santri.status);

  return (
    <div className="space-y-6">
      {/* Header Identitas Santri (1 Akun Orang Tua = 1 Santri) */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-5 sm:p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1 border border-white/20 shadow-md">
              <img
                src="/images/logo-abu-manshur.png"
                alt="Logo PP Modern Abu Manshur"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-xs font-medium text-emerald-200 border border-emerald-400/30">
                  NIS: {santri.nis}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${santriBadge.className}`}
                >
                  Status: {santriBadge.label}
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-emerald-100">
                  Relasi 1:1 Akun Wali Terverifikasi
                </span>
              </div>
              <h2 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight">
                {santri.nama_lengkap}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-emerald-100/90">
                {kelas?.nama_kelas ?? "-"} • {kamar?.nama_kamar ?? "-"} ({kamar?.gedung_asrama})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
            <div className="rounded-xl bg-white/10 px-4 py-2.5 backdrop-blur-sm border border-white/15">
              <p className="text-[11px] uppercase tracking-wider text-emerald-200">
                Sisa Kewajiban Tagihan
              </p>
              <p className="text-base sm:text-lg font-bold text-white">
                {formatRupiah(totalTunggakan)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-400/20 px-4 py-2.5 backdrop-blur-sm border border-amber-300/30">
              <p className="text-[11px] uppercase tracking-wider text-amber-200">
                Saldo Uang Saku
              </p>
              <p className="text-base sm:text-lg font-bold text-amber-100">
                {formatRupiah(saldoSaku.saldo_saat_ini)}
              </p>
            </div>
          </div>
        </div>

        {/* Navigasi Mobile-Friendly Portal Orang Tua */}
        <div className="mt-5 flex overflow-x-auto no-scrollbar gap-1.5 border-t border-white/15 pt-4 pb-1 -mx-2 px-2 sm:mx-0 sm:px-0 sm:flex-wrap">
          {[
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            {
              id: "kepesantrenan",
              label: "Mengaji, Tahfidz & Prestasi",
              icon: BookOpen,
            },
            {
              id: "pembayaran",
              label: `Pembayaran & Cicilan (${unpaidTagihan.length})`,
              icon: CreditCard,
            },
            { id: "uang_saku", label: "Uang Saku & Foto Bukti", icon: Wallet },
            {
              id: "notifikasi",
              label: `Notifikasi & Pengumuman (${unreadNotifCount})`,
              icon: Bell,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as WaliTab);
                  setFeedback(null);
                }}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition whitespace-nowrap min-h-[44px] ${
                  active
                    ? "bg-white text-emerald-950 shadow-md font-bold"
                    : "bg-white/10 text-emerald-100 hover:bg-white/20"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
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
          TAB 1: DASHBOARD ORANG TUA (BAB 11 PRD - MOBILE FIRST)
         ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Pengumuman Terbaru */}
          {pengumumanList.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Pengumuman Resmi Pesantren Terbaru
                </span>
                <span className="text-xs text-amber-700">
                  {formatTanggal(pengumumanList[0]!.tanggal_publikasi)}
                </span>
              </div>
              <h3 className="mt-1 text-base font-bold text-slate-900">
                {pengumumanList[0]!.judul}
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-slate-700 leading-relaxed">
                {pengumumanList[0]!.isi}
              </p>
            </div>
          )}

          {/* Ringkasan 4 Pilar Utama */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Tagihan Belum Lunas</span>
                <Receipt className="h-5 w-5 text-rose-600" />
              </div>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {formatRupiah(totalTunggakan)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {unpaidTagihan.length} tagihan aktif menunggu pelunasan
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("pembayaran")}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Kelola & Cicil Tagihan →
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Saldo Uang Saku</span>
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {formatRupiah(saldoSaku.saldo_saat_ini)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Masuk: {formatRupiah(saldoSaku.total_masuk)} • Keluar:{" "}
                {formatRupiah(saldoSaku.total_keluar)}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("uang_saku")}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Lihat Bukti Foto Penyerahan →
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Perkembangan Mengaji</span>
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 truncate">
                {myMengaji[0]?.tingkat_jilid ?? "Belum Ada Data"}
              </p>
              <p className="mt-1 text-xs text-slate-500 truncate">
                Materi: {myMengaji[0]?.materi_terakhir ?? "-"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubTabPesantren("mengaji");
                  setActiveTab("kepesantrenan");
                }}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Lihat Catatan Pembimbing →
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Setoran Tahfidz Terakhir</span>
                <Award className="h-5 w-5 text-amber-600" />
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 truncate">
                {myTahfidz[0]
                  ? `${myTahfidz[0].nama_surah} (${myTahfidz[0].jumlah_ayat} Ayat)`
                  : "Belum Ada Setoran"}
              </p>
              <p className="mt-1 text-xs text-slate-500 truncate">
                Predikat: {myTahfidz[0]?.kualitas_hafalan ?? "-"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubTabPesantren("tahfidz");
                  setActiveTab("kepesantrenan");
                }}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:underline"
              >
                Lihat Rekap Hafalan →
              </button>
            </div>
          </div>

          {/* Grid Ringkasan Mutasi Uang Saku & Perkembangan Santri */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Riwayat Uang Masuk & Keluar Terbaru */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Transparansi Uang Saku Terbaru
                  </h3>
                  <p className="text-xs text-slate-500">
                    Setiap pengeluaran uang saku dilengkapi foto penyerahan wajib
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("uang_saku")}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Semua Mutasi
                </button>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {myMutasiSaku.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {m.jenis_mutasi}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatWaktuLengkap(m.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs sm:text-sm font-medium text-slate-800 truncate">
                        {m.keterangan}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Saldo: {formatRupiah(m.saldo_sebelum)} →{" "}
                        <strong className="text-slate-700">{formatRupiah(m.saldo_sesudah)}</strong>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold ${
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
                      {m.foto_penyerahan_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewModal({
                              open: true,
                              title: `Bukti Penyerahan Uang Saku (${m.nomor_transaksi})`,
                              subtitle: `${m.keterangan} • Petugas: ${m.petugas_nama}`,
                              url: m.foto_penyerahan_url ?? null,
                            })
                          }
                          className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                        >
                          <Camera className="h-3 w-3" />
                          Foto Bukti
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ringkasan Prestasi & Kedisiplinan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  Prestasi & Catatan Pembinaan Kedisiplinan
                </h3>
                <p className="text-xs text-slate-500">
                  Pemantauan capaian positif dan pembinaan karakter santri
                </p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  Prestasi Terbaru ({myPrestasi.length})
                </h4>
                {myPrestasi.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Belum ada catatan prestasi.</p>
                ) : (
                  myPrestasi.slice(0, 2).map((p) => (
                    <div
                      key={p.id}
                      className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-900">{p.peringkat}</span>
                        <span className="rounded bg-emerald-200/70 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                          Tingkat {p.tingkat_prestasi}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-900">
                        {p.nama_kegiatan}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">{p.deskripsi}</p>
                    </div>
                  ))
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Catatan Kedisiplinan & Pembinaan ({myKedisiplinan.length})
                </h4>
                {myKedisiplinan.length === 0 ? (
                  <p className="mt-1 text-xs text-emerald-700 font-medium">
                    Alhamdulillah, tidak ada catatan pelanggaran kedisiplinan.
                  </p>
                ) : (
                  myKedisiplinan.map((d) => (
                    <div
                      key={d.id}
                      className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900">{d.nama_kategori}</span>
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                          Status: {d.status_tindak_lanjut}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        <strong>Pembinaan:</strong> {d.catatan_pembinaan}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: MODUL PEMBAYARAN & KERANJANG CICILAN (BAB 5.4 & 5.5 PRD)
         ===================================================================== */}
      {activeTab === "pembayaran" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Kolom Kiri (2/3): Daftar Tagihan & Pemilihan Cicilan */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900">
                  Daftar Kewajiban & Tagihan Santri
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih satu atau beberapa tagihan untuk dimasukkan ke keranjang pembayaran. Aturan
                  cicilan mengikuti kebijakan masing-masing tagihan.
                </p>
              </div>

              <div className="mt-4 space-y-4">
                {myTagihan.map((tgh) => {
                  const statusBadge = getStatusTagihanBadge(tgh.status);
                  const inCart = keranjang.find((k) => k.tagihan_id === tgh.id);
                  const isPaid = tgh.sisa_tagihan <= 0 || tgh.status === "LUNAS";
                  const currentInput =
                    customNominalMap[tgh.id] ??
                    (inCart ? String(inCart.nominal_bayar) : String(tgh.sisa_tagihan));

                  return (
                    <div
                      key={tgh.id}
                      className={`rounded-xl border p-4 transition ${
                        inCart
                          ? "border-emerald-500 bg-emerald-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">
                              {tgh.nomor_tagihan}
                            </span>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge.className}`}
                            >
                              {statusBadge.label}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {getKebijakanCicilanLabel(
                                tgh.kebijakan_cicilan_snapshot,
                                tgh.minimal_cicilan_snapshot
                              )}
                            </span>
                          </div>
                          <h4 className="mt-1.5 text-base font-bold text-slate-900">
                            {tgh.judul_tagihan}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Periode: {tgh.periode_label} • Jatuh Tempo:{" "}
                            {formatTanggal(tgh.tanggal_jatuh_tempo)}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-xs text-slate-500">
                            Total: {formatRupiah(tgh.nominal_tagihan)} • Terbayar:{" "}
                            {formatRupiah(tgh.total_terbayar)}
                          </p>
                          <p className="text-base font-bold text-slate-900">
                            Sisa: {formatRupiah(tgh.sisa_tagihan)}
                          </p>
                        </div>
                      </div>

                      {!isPaid && (
                        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-700">
                              Nominal Dibayar (Rp):
                            </label>
                            <input
                              type="number"
                              disabled={tgh.kebijakan_cicilan_snapshot === "TIDAK_BOLEH"}
                              value={
                                tgh.kebijakan_cicilan_snapshot === "TIDAK_BOLEH"
                                  ? tgh.sisa_tagihan
                                  : currentInput
                              }
                              onChange={(e) =>
                                setCustomNominalMap((prev) => ({
                                  ...prev,
                                  [tgh.id]: e.target.value,
                                }))
                              }
                              className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:bg-slate-100"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            {inCart ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleAddBillToCart(tgh.id, tgh.sisa_tagihan)}
                                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                                >
                                  Perbarui Nominal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeFromKeranjang(tgh.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Hapus dari Keranjang
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddBillToCart(tgh.id, tgh.sisa_tagihan)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                              >
                                <Plus className="h-4 w-4" />
                                Masukkan ke Keranjang
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Riwayat Pengajuan & Alokasi Pembayaran */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Riwayat Transaksi & Status Verifikasi Pembayaran
              </h3>
              <p className="text-xs text-slate-500">
                Tagihan hanya berubah menjadi Lunas / Dibayar Sebagian setelah diverifikasi oleh
                Bendahara Pesantren.
              </p>

              <div className="mt-4 space-y-3">
                {myTransaksiPembayaran.map((trx) => {
                  const badge = getStatusTransaksiBadge(trx.status);
                  return (
                    <div
                      key={trx.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {trx.nomor_transaksi}
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            Transfer: {formatTanggal(trx.tanggal_transfer)} ({trx.bank_pengirim} -{" "}
                            {trx.nama_pengirim})
                          </span>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-2 space-y-1 border-t border-slate-200/80 pt-2 text-xs text-slate-700">
                        <p className="font-semibold text-slate-600">Rincian Alokasi Tagihan:</p>
                        {trx.alokasi.map((alk) => (
                          <div key={alk.id} className="flex justify-between">
                            <span>• {alk.judul_tagihan}</span>
                            <span className="font-semibold">
                              {formatRupiah(alk.nominal_alokasi)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900">
                          <span>Total Nominal Transfer</span>
                          <span className="text-emerald-700">
                            {formatRupiah(trx.total_nominal)}
                          </span>
                        </div>
                      </div>

                      {trx.catatan_verifikasi && (
                        <p className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs text-slate-600 border border-slate-200">
                          <strong>Catatan Bendahara:</strong> {trx.catatan_verifikasi}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2">
                        {trx.bukti_transfer_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                open: true,
                                title: `Bukti Transfer Pembayaran (${trx.nomor_transaksi})`,
                                subtitle: `Pengirim: ${trx.nama_pengirim} (${trx.bank_pengirim}) • Total: ${formatRupiah(trx.total_nominal)}`,
                                url: trx.bukti_transfer_url ?? null,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Lihat Bukti Transfer
                          </button>
                        ) : (
                          <span className="text-[11px] text-amber-700 italic">
                            Belum ada bukti transfer
                          </span>
                        )}

                        {trx.status === "MENUNGGU_TRANSFER" && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTrxForUpload(trx);
                              setUploadTrxModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Unggah Bukti Sekarang
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Kolom Kanan (1/3): Keranjang Pembayaran & Form Konfirmasi Bukti Transfer */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sticky top-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ShoppingCart className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-bold text-slate-900">
                  Keranjang Pembayaran ({keranjang.length})
                </h3>
              </div>

              {/* Informasi Rekening Resmi Tunggal Pesantren */}
              <div className="mt-3 rounded-xl bg-emerald-950 p-3.5 text-white">
                <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold">
                  <Landmark className="h-4 w-4" />
                  <span>Rekening Resmi Pesantren</span>
                </div>
                <p className="mt-1 text-sm font-bold">{rekeningResmi.nama_bank}</p>
                <p className="font-mono text-lg font-extrabold tracking-wider text-amber-300">
                  {rekeningResmi.nomor_rekening}
                </p>
                <p className="text-xs text-emerald-100">a.n. {rekeningResmi.atas_nama}</p>
              </div>

              {keranjang.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Belum ada tagihan di keranjang. Pilih tagihan di samping untuk mulai membayar.
                </div>
              ) : (
                <form onSubmit={handleCheckoutSubmit} className="mt-4 space-y-3">
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {keranjang.map((item) => {
                      const t = myTagihan.find((x) => x.id === item.tagihan_id);
                      return (
                        <div
                          key={item.tagihan_id}
                          className="flex items-center justify-between py-2 text-xs"
                        >
                          <span className="font-medium text-slate-800 pr-2">
                            {t?.judul_tagihan}
                          </span>
                          <span className="font-bold text-slate-900 shrink-0">
                            {formatRupiah(item.nominal_bayar)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between pt-2.5 text-sm font-bold text-emerald-800">
                      <span>Total Transfer</span>
                      <span>{formatRupiah(totalKeranjang)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Tanggal Transfer
                    </label>
                    <input
                      type="date"
                      required
                      value={tanggalTransferBayar}
                      onChange={(e) => setTanggalTransferBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nama Pengirim Rekening
                    </label>
                    <input
                      type="text"
                      required
                      value={namaPengirimBayar}
                      onChange={(e) => setNamaPengirimBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Bank Pengirim
                    </label>
                    <input
                      type="text"
                      required
                      value={bankPengirimBayar}
                      onChange={(e) => setBankPengirimBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Unggah Bukti Transfer (Maks 5MB)
                    </label>
                    <label className="mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-emerald-400 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900 hover:bg-emerald-50">
                      <span className="truncate font-medium">{buktiBayarFilename}</span>
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white">
                        <Upload className="h-3 w-3" />
                        Pilih File
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => handleFileUpload(e, "bayar")}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs sm:text-sm font-bold text-white shadow hover:bg-emerald-800 transition"
                  >
                    Konfirmasi & Kirim Pengajuan Pembayaran
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: MODUL UANG SAKU SANTRI (BAB 6 PRD - LEDGER & FOTO PENYERAHAN)
         ===================================================================== */}
      {activeTab === "uang_saku" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Ringkasan Saldo Ledger */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="text-xs font-semibold text-emerald-800">Saldo Saat Ini</span>
                <p className="mt-1 text-2xl font-extrabold text-emerald-950">
                  {formatRupiah(saldoSaku.saldo_saat_ini)}
                </p>
                <span className="text-[11px] text-emerald-700">
                  Sesuai perhitungan Ledger Immutable
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-xs font-medium text-slate-500">Total Uang Masuk</span>
                <p className="mt-1 text-xl font-bold text-emerald-700">
                  +{formatRupiah(saldoSaku.total_masuk)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-xs font-medium text-slate-500">Total Uang Keluar</span>
                <p className="mt-1 text-xl font-bold text-rose-700">
                  -{formatRupiah(saldoSaku.total_keluar)}
                </p>
              </div>
            </div>

            {/* Tabel Riwayat Transaksi Ledger Uang Saku + Bukti Foto Penyerahan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Riwayat Mutasi Uang Masuk & Keluar (Ledger Santri)
              </h3>
              <p className="text-xs text-slate-500">
                Setiap penyerahan uang saku tunai kepada santri wajib disertai foto dokumentasi
                penyerahan oleh petugas.
              </p>

              {/* Tampilan Kartu Khusus Mobile (< 768px) */}
              <div className="mt-4 grid grid-cols-1 gap-3 md:hidden">
                {myMutasiSaku.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-slate-600">
                          {m.nomor_transaksi}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          {formatWaktuLengkap(m.created_at)}
                        </div>
                      </div>
                      <span
                        className={`rounded px-2.5 py-0.5 text-[10px] font-bold ${
                          m.jenis_mutasi === "MASUK"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.jenis_mutasi === "KELUAR"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {m.jenis_mutasi}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1 text-slate-700">
                      <div>
                        <strong>Keterangan:</strong> {m.keterangan}
                      </div>
                      <div>
                        <strong>Petugas:</strong> {m.petugas_nama}
                      </div>
                      <div className="pt-1 flex items-center justify-between border-t border-slate-200">
                        <span className="font-semibold text-slate-600">Nominal:</span>
                        <span
                          className={`font-extrabold text-sm ${
                            m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                            ? "+"
                            : "-"}
                          {formatRupiah(m.nominal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-600">Saldo Akhir:</span>
                        <span className="font-bold text-slate-900">
                          {formatRupiah(m.saldo_sesudah)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      {m.foto_penyerahan_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewModal({
                              open: true,
                              title: `Foto Penyerahan Uang Saku (${m.nomor_transaksi})`,
                              subtitle: `Diserahkan sebesar ${formatRupiah(m.nominal)} • ${
                                m.keterangan
                              }`,
                              url: m.foto_penyerahan_url ?? null,
                            })
                          }
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 min-h-[44px] touch-manipulation cursor-pointer"
                        >
                          <Camera className="h-4 w-4" />
                          <span>Lihat Foto Dokumentasi</span>
                        </button>
                      ) : (
                        <div className="w-full text-center py-2 text-xs text-slate-400 italic">
                          Tidak memerlukan foto
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tampilan Tabel Desktop (>= 768px) */}
              <div className="mt-4 hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[650px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2.5 pr-3">No. Transaksi & Waktu</th>
                      <th className="py-2.5 px-3">Jenis & Keterangan</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                      <th className="py-2.5 px-3 text-right">Saldo Akhir</th>
                      <th className="py-2.5 pl-3 text-center">Bukti Foto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {myMutasiSaku.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80">
                        <td className="py-3 pr-3">
                          <div className="font-mono text-xs font-bold text-slate-800">
                            {m.nomor_transaksi}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatWaktuLengkap(m.created_at)}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                              m.jenis_mutasi === "MASUK"
                                ? "bg-emerald-100 text-emerald-800"
                                : m.jenis_mutasi === "KELUAR"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {m.jenis_mutasi}
                          </span>
                          <div className="mt-1 font-medium text-slate-800">{m.keterangan}</div>
                          <div className="text-[11px] text-slate-500">
                            Petugas: {m.petugas_nama}
                          </div>
                        </td>
                        <td
                          className={`py-3 px-3 text-right font-bold ${
                            m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {m.jenis_mutasi === "MASUK" || m.jenis_mutasi === "PENYESUAIAN_TAMBAH"
                            ? "+"
                            : "-"}
                          {formatRupiah(m.nominal)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-900">
                          {formatRupiah(m.saldo_sesudah)}
                        </td>
                        <td className="py-3 pl-3 text-center">
                          {m.foto_penyerahan_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewModal({
                                  open: true,
                                  title: `Foto Penyerahan Uang Saku (${m.nomor_transaksi})`,
                                  subtitle: `Diserahkan sebesar ${formatRupiah(m.nominal)} • ${
                                    m.keterangan
                                  }`,
                                  url: m.foto_penyerahan_url ?? null,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              Lihat Foto
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Status Pengajuan Top-Up Uang Saku */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Status Pengajuan Pengisian (Top-Up) Uang Saku
              </h3>
              <div className="mt-3 space-y-2.5">
                {myPengajuanSaku.map((p) => {
                  const badge = getStatusTransaksiBadge(p.status);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 p-3.5 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {p.nomor_pengajuan}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-700">{p.keterangan}</p>
                        <p className="text-[11px] text-slate-500">
                          Tanggal Transfer: {formatTanggal(p.tanggal_transfer)} • Pengirim:{" "}
                          {p.nama_pengirim}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-base font-bold text-emerald-700">
                          {formatRupiah(p.nominal)}
                        </p>
                        {p.bukti_transfer_url && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModal({
                                open: true,
                                title: `Bukti Transfer Top-up Uang Saku (${p.nomor_pengajuan})`,
                                subtitle: `Pengirim: ${p.nama_pengirim} (${p.bank_pengirim}) • Nominal: ${formatRupiah(p.nominal)}`,
                                url: p.bukti_transfer_url ?? null,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            <Camera className="h-3 w-3" />
                            Bukti Transfer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form Pengajuan Top-Up Uang Saku */}
          <div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Ajukan Transfer Uang Saku Baru
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Transfer ke rekening resmi pesantren dan unggah bukti transfer untuk diverifikasi
                Bendahara.
              </p>

              <div className="mt-3 rounded-xl bg-emerald-950 p-3 text-white text-xs">
                <p className="text-emerald-300 font-semibold">{rekeningResmi.nama_bank}</p>
                <p className="font-mono text-base font-bold text-amber-300">
                  {rekeningResmi.nomor_rekening}
                </p>
                <p className="text-emerald-100">a.n. {rekeningResmi.atas_nama}</p>
              </div>

              <form onSubmit={handleTopupSubmit} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nominal Pengisian Uang Saku (Rp)
                  </label>
                  <input
                    type="number"
                    min={10000}
                    required
                    value={nominalTopup}
                    onChange={(e) => setNominalTopup(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tanggal Transfer
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalTopup}
                    onChange={(e) => setTanggalTopup(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Pengirim
                  </label>
                  <input
                    type="text"
                    required
                    value={namaPengirimTopup}
                    onChange={(e) => setNamaPengirimTopup(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bank Pengirim
                  </label>
                  <input
                    type="text"
                    required
                    value={bankPengirimTopup}
                    onChange={(e) => setBankPengirimTopup(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Keterangan / Pesan
                  </label>
                  <input
                    type="text"
                    value={keteranganTopup}
                    onChange={(e) => setKeteranganTopup(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bukti Transfer Uang Saku
                  </label>
                  <label className="mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-emerald-400 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900">
                    <span className="truncate font-medium">{buktiTopupFilename}</span>
                    <span className="rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white">
                      Pilih File
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => handleFileUpload(e, "saku")}
                      className="hidden"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-800"
                >
                  Kirim Pengajuan Uang Saku
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PERKEMBANGAN KEPESANTRENAN (MENGAJI, TAHFIDZ, PRESTASI, DISIPLIN)
         ===================================================================== */}
      {activeTab === "kepesantrenan" && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "mengaji", label: `Perkembangan Mengaji (${myMengaji.length})` },
              { id: "tahfidz", label: `Setoran Tahfidz (${myTahfidz.length})` },
              { id: "prestasi", label: `Prestasi Santri (${myPrestasi.length})` },
              { id: "kedisiplinan", label: `Catatan Kedisiplinan (${myKedisiplinan.length})` },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() =>
                  setSubTabPesantren(
                    st.id as "mengaji" | "tahfidz" | "prestasi" | "kedisiplinan"
                  )
                }
                className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                  subTabPesantren === st.id
                    ? "bg-emerald-800 text-white shadow-sm"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {subTabPesantren === "mengaji" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Riwayat Evaluasi & Perkembangan Mengaji
              </h3>
              {myMengaji.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">
                      {m.metode_pembelajaran} • {m.tingkat_jilid}
                    </span>
                    <span className="text-xs text-slate-500">
                      Tanggal Penilaian: {formatTanggal(m.tanggal_penilaian)}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    Materi Terakhir: {m.materi_terakhir}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs bg-slate-50 p-3 rounded-lg">
                    <div>
                      <span className="text-slate-500">Kelancaran Bacaan:</span>{" "}
                      <strong className="text-slate-800">{m.kelancaran_bacaan}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Makharijul Huruf:</span>{" "}
                      <strong className="text-slate-800">{m.makharijul_huruf}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Tajwid:</span>{" "}
                      <strong className="text-slate-800">{m.tajwid}</strong>
                    </div>
                  </div>
                  <p className="text-xs text-slate-700">
                    <strong>Catatan Pembimbing ({m.pembimbing_name}):</strong>{" "}
                    {m.catatan_perkembangan}
                  </p>
                </div>
              ))}
            </div>
          )}

          {subTabPesantren === "tahfidz" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Riwayat Setoran Hafalan Baru & Murojaah Tahfidz
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Ayat Disetorkan:{" "}
                    <strong>
                      {myTahfidz.reduce((s, x) => s + x.jumlah_ayat, 0)} Ayat
                    </strong>
                  </p>
                </div>
              </div>

              {myTahfidz.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                          t.jenis_setoran === "HAFALAN_BARU"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-indigo-100 text-indigo-800"
                        }`}
                      >
                        {t.jenis_setoran === "HAFALAN_BARU" ? "Hafalan Baru" : "Murojaah"}
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        {t.nama_surah} (Juz {t.juz}) • Ayat {t.ayat_awal}–{t.ayat_akhir} (
                        {t.jumlah_ayat} Ayat)
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {formatTanggal(t.tanggal_setoran)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">
                    <strong>Kualitas Hafalan:</strong> {t.kualitas_hafalan} •{" "}
                    <strong>Pembimbing:</strong> {t.pembimbing_name}
                  </p>
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                    {t.catatan_pembimbing}
                  </p>
                </div>
              ))}
            </div>
          )}

          {subTabPesantren === "prestasi" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">Dokumentasi Prestasi Santri</h3>
              {myPrestasi.map((p) => (
                <div key={p.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-emerald-700 px-3 py-0.5 text-xs font-bold text-white">
                      {p.peringkat} • Tingkat {p.tingkat_prestasi}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatTanggal(p.tanggal_prestasi)}
                    </span>
                  </div>
                  <h4 className="mt-2 text-base font-bold text-slate-900">{p.nama_kegiatan}</h4>
                  <p className="text-xs font-medium text-emerald-800">Kategori: {p.kategori}</p>
                  <p className="mt-1 text-xs text-slate-700">{p.deskripsi}</p>
                </div>
              ))}
            </div>
          )}

          {subTabPesantren === "kedisiplinan" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Catatan Kedisiplinan & Riwayat Tindak Lanjut Pembinaan
                </h3>
                <p className="text-xs text-slate-500">
                  Sesuai Bab 10 PRD: Setiap pembaruan status tindak lanjut menyimpan riwayat
                  catatan sebelumnya secara transparan.
                </p>
              </div>
              {myKedisiplinan.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        {d.tingkat_pelanggaran}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{d.nama_kategori}</h4>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      Status: {d.status_tindak_lanjut}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Waktu Kejadian: {formatTanggal(d.tanggal_kejadian)} pukul {d.waktu_kejadian} WIB
                  </p>
                  <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
                    <p>
                      <strong>Deskripsi:</strong> {d.deskripsi}
                    </p>
                    <p>
                      <strong>Tindak Lanjut:</strong> {d.tindak_lanjut}
                    </p>
                    <p>
                      <strong>Catatan Pembinaan:</strong> {d.catatan_pembinaan}
                    </p>
                  </div>

                  {d.riwayat_perubahan.length > 0 && (
                    <div className="border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-bold uppercase text-slate-500">
                        Riwayat Perubahan Catatan Pembinaan:
                      </p>
                      {d.riwayat_perubahan.map((rw) => (
                        <div
                          key={rw.id}
                          className="mt-1.5 rounded border border-slate-200 bg-white p-2.5 text-[11px] text-slate-600"
                        >
                          <div>
                            <strong>{formatWaktuLengkap(rw.created_at)}</strong> — Status diubah
                            dari <strong>{rw.status_sebelum}</strong> ke{" "}
                            <strong>{rw.status_sesudah}</strong> oleh {rw.diubah_oleh_nama}
                          </div>
                          <div>Catatan sebelumnya: &ldquo;{rw.catatan_pembinaan_sebelum}&rdquo;</div>
                          <div>Alasan pembaruan: {rw.alasan_perubahan}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 5: NOTIFIKASI & PENGUMUMAN (BAB 12 PRD)
         ===================================================================== */}
      {activeTab === "notifikasi" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Notifikasi Akun Orang Tua ({unreadNotifCount} Belum Dibaca)
              </h3>
              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotifikasiRead}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Tandai Semua Dibaca
                </button>
              )}
            </div>
            <div className="mt-3 space-y-2.5">
              {myNotifikasi.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markNotifikasiRead(n.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition ${
                    n.is_read
                      ? "border-slate-200 bg-white"
                      : "border-emerald-300 bg-emerald-50/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-900">{n.judul}</span>
                    <span className="text-[11px] text-slate-400">
                      {formatWaktuLengkap(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{n.pesan}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Papan Pengumuman Resmi Pesantren
            </h3>
            <div className="mt-3 space-y-3">
              {pengumumanList.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                      {p.kategori}
                    </span>
                    <span className="text-slate-400">{formatTanggal(p.tanggal_publikasi)}</span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-bold text-slate-900">{p.judul}</h4>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{p.isi}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Unggah Bukti Transfer Susulan (Bab 5.3 PRD) */}
      {uploadTrxModalOpen && selectedTrxForUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Unggah Bukti Transfer Pembayaran
              </h3>
              <p className="text-xs text-slate-500">
                Transaksi: {selectedTrxForUpload.nomor_transaksi} • Total:{" "}
                {formatRupiah(selectedTrxForUpload.total_nominal)}
              </p>
            </div>

            <form onSubmit={handleUploadSusulanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Tanggal Transfer</label>
                <input
                  type="date"
                  required
                  value={uploadTanggalTransfer}
                  onChange={(e) => setUploadTanggalTransfer(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nama Pengirim Rekening</label>
                <input
                  type="text"
                  required
                  value={uploadNamaPengirim}
                  onChange={(e) => setUploadNamaPengirim(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Bank Pengirim</label>
                <input
                  type="text"
                  required
                  value={uploadBankPengirim}
                  onChange={(e) => setUploadBankPengirim(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  File Bukti Transfer (Maks 5MB)
                </label>
                <label className="mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-emerald-400 bg-emerald-50/50 px-3 py-2 text-emerald-900 hover:bg-emerald-50">
                  <span className="truncate font-medium">{uploadFilename}</span>
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white">
                    <Upload className="h-3 w-3" />
                    Pilih File
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const check = validateUploadedFile(file, "image_or_pdf");
                      if (!check.valid) {
                        setFeedback({ ok: false, text: check.error ?? "File tidak valid." });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl =
                          typeof reader.result === "string"
                            ? reader.result
                            : SAMPLE_TRANSFER_PROOF_1;
                        setUploadBuktiUrl(dataUrl);
                        setUploadFilename(file.name);
                        setFeedback({ ok: true, text: `File "${file.name}" siap diunggah.` });
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadTrxModalOpen(false);
                    setSelectedTrxForUpload(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800"
                >
                  Kirim Bukti Transfer
                </button>
              </div>
            </form>
          </div>
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

