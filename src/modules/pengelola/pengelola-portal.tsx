"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Edit2,
  Eye,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal, formatWaktuLengkap } from "@/lib/utils/format";
import type {
  JenisSetoranTahfidz,
  MasterKategoriPelanggaran,
  StatusTindakLanjut,
  TingkatPrestasi,
} from "@/types/database";

export type PengelolaTab =
  | "dashboard"
  | "mengaji"
  | "tahfidz"
  | "prestasi"
  | "kedisiplinan"
  | "master_kategori_pelanggaran";

export interface PengelolaPortalProps {
  activeTab?: PengelolaTab | string;
  onTabChange?: (tab: string) => void;
}

export function PengelolaPortal({
  activeTab: controlledTab,
  onTabChange,
}: PengelolaPortalProps = {}) {
  const {
    currentUser,
    kelasList,
    santriList,
    mengajiList,
    tahfidzList,
    prestasiList,
    masterPelanggaranList,
    kedisiplinanList,
    profilPesantren,
    recordPerkembanganMengaji,
    recordSetoranTahfidz,
    recordPrestasiSantri,
    recordCatatanKedisiplinan,
    updateTindakLanjutKedisiplinan,
    createMasterKategoriPelanggaran,
    updateMasterKategoriPelanggaran,
    deleteMasterKategoriPelanggaranBatch,
  } = useSipeta();

  const [internalTab, setInternalTab] = useState<PengelolaTab>("dashboard");
  const activeTab = ((controlledTab as PengelolaTab) || internalTab);
  const setActiveTab = (tab: PengelolaTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State Kelas & Santri Form Selection (Alur: Pilih Kelas -> Pilih Santri)
  const [kelasMengaji, setKelasMengaji] = useState<string>("");
  const [santriMengaji, setSantriMengaji] = useState<string>("");

  const [kelasTahfidz, setKelasTahfidz] = useState<string>("");
  const [santriTahfidz, setSantriTahfidz] = useState<string>("");

  const [kelasPrestasi, setKelasPrestasi] = useState<string>("");
  const [santriPrestasi, setSantriPrestasi] = useState<string>("");

  const [kelasDisiplin, setKelasDisiplin] = useState<string>("");
  const [santriDisiplin, setSantriDisiplin] = useState<string>("");

  // State Mengaji Form (Bab 2 PRD: Evaluasi Mengaji A-D & Tanggal & Petugas)
  const [tanggalPenilaianMengaji, setTanggalPenilaianMengaji] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [pembimbingMengaji, setPembimbingMengaji] = useState(
    currentUser?.nama_lengkap ?? "Ustadz H. Fauzan Azima, Lc."
  );
  const [metodeMengaji, setMetodeMengaji] = useState("Al-Qur'an Bin-Nadzor & Tahsin");
  const [tingkatJilid, setTingkatJilid] = useState("Tahsin Al-Qur'an Juz 15");
  const [materiTerakhir, setMateriTerakhir] = useState("QS. Al-Isra Ayat 1 - 35");
  const [kelancaran, setKelancaran] = useState("Sangat Lancar (A)");
  const [makharij, setMakharij] = useState("Fasih & Tepat (A)");
  const [tajwid, setTajwid] = useState("Sangat Baik (A)");
  const [catatanMengaji, setCatatanMengaji] = useState(
    "Bacaan tartil dan makharijul huruf stabil, siap melanjutkan ke materi berikutnya."
  );

  // State Filter & Modal Rekapitulasi Mengaji
  const [filterKelasMengaji, setFilterKelasMengaji] = useState("all");
  const [searchSantriMengaji, setSearchSantriMengaji] = useState("");
  const [filterPeriodeMengaji, setFilterPeriodeMengaji] = useState("all");
  const [modalRiwayatSantriId, setModalRiwayatSantriId] = useState<string | null>(null);

  // State Tahfidz
  const [jenisSetoran, setJenisSetoran] = useState<JenisSetoranTahfidz>("HAFALAN_BARU");
  const [namaSurah, setNamaSurah] = useState("QS. Al-Qalam");
  const [juz, setJuz] = useState("29");
  const [ayatAwal, setAyatAwal] = useState("26");
  const [ayatAkhir, setAyatAkhir] = useState("52");
  const [kualitasHafalan, setKualitasHafalan] = useState("Mumtaz (Istimewa)");
  const [catatanTahfidz, setCatatanTahfidz] = useState(
    "Alhamdulillah khatam Surah Al-Qalam dengan lancar."
  );

  // State Prestasi
  const [namaKegiatan, setNamaKegiatan] = useState(
    "Olimpiade Bahasa Arab & Nahwu Shorof Tingkat Provinsi"
  );
  const [kategoriPrestasi, setKategoriPrestasi] = useState("Bahasa Arab & Turats");
  const [tingkatPrestasi, setTingkatPrestasi] = useState<TingkatPrestasi>("PROVINSI");
  const [peringkatPrestasi, setPeringkatPrestasi] = useState("Juara 1");
  const [deskripsiPrestasi, setDeskripsiPrestasi] = useState(
    "Meraih medali emas bidang Nahwu & Qiraatul Kutub."
  );

  // State Kedisiplinan
  const [kategoriDisiplinId, setKategoriDisiplinId] = useState(
    masterPelanggaranList.find((k) => k.is_active !== false)?.id ?? masterPelanggaranList[0]?.id ?? "kat-dis-01"
  );
  const [deskripsiDisiplin, setDeskripsiDisiplin] = useState("");
  const [tindakLanjutDisiplin, setTindakLanjutDisiplin] = useState(
    "Murojaah tambahan 2 halaman & dzikir pagi bersama Musyrif"
  );
  const [catatanPembinaanDisiplin, setCatatanPembinaanDisiplin] = useState(
    "Santri berjanji tidak mengulangi dan disiplin waktu sholat berjamaah."
  );

  // Subtab Navigasi Kedisiplinan: Catatan & Pembinaan vs Master Kategori Pelanggaran
  const [disiplinSubTab, setDisiplinSubTab] = useState<"catatan" | "master">(
    controlledTab === "master_kategori_pelanggaran" ? "master" : "catatan"
  );

  // Pilihan santri mengikuti pemilihan kelas secara eksplisit (Alur: Pilih Kelas -> Pilih Nama Santri)

  useEffect(() => {
    if (masterPelanggaranList.length > 0) {
      const activeKat = masterPelanggaranList.find((k) => k.is_active !== false) || masterPelanggaranList[0];
      if (activeKat && !masterPelanggaranList.some((k) => k.id === kategoriDisiplinId)) {
        setKategoriDisiplinId(activeKat.id);
      }
    }
  }, [masterPelanggaranList]);

  // State Update Riwayat Kedisiplinan
  const [selectedDisiplinId, setSelectedDisiplinId] = useState(
    kedisiplinanList[0]?.id ?? "dis-001"
  );
  const [statusTindakBaru, setStatusTindakBaru] = useState<StatusTindakLanjut>("SELESAI");
  const [catatanPembinaanUpdate, setCatatanPembinaanUpdate] = useState(
    "Evaluasi pembinaan lanjutan selesai dengan hasil sangat baik."
  );
  const [alasanUpdateDisiplin, setAlasanUpdateDisiplin] = useState(
    "Verifikasi akhir pembinaan oleh Asatidz / Pembina Asrama"
  );

  // State Manajemen Master Kategori Pelanggaran
  const [selectedKatIds, setSelectedKatIds] = useState<string[]>([]);
  const [modalTambahKatOpen, setModalTambahKatOpen] = useState(false);
  const [submittingKat, setSubmittingKat] = useState(false);
  const [newKodeKat, setNewKodeKat] = useState("");
  const [newNamaKat, setNewNamaKat] = useState("");
  const [newTingkatKat, setNewTingkatKat] = useState<"RINGAN" | "SEDANG" | "BERAT">("RINGAN");
  const [newPoinKat, setNewPoinKat] = useState(5);
  const [newStandarTindakKat, setNewStandarTindakKat] = useState("");

  // Modal Edit Kategori
  const [editKatModal, setEditKatModal] = useState<MasterKategoriPelanggaran | null>(null);
  const [editNamaKat, setEditNamaKat] = useState("");
  const [editTingkatKat, setEditTingkatKat] = useState<"RINGAN" | "SEDANG" | "BERAT">("RINGAN");
  const [editPoinKat, setEditPoinKat] = useState(5);
  const [editStandarTindakKat, setEditStandarTindakKat] = useState("");
  const [editIsActiveKat, setEditIsActiveKat] = useState(true);

  // Modal Bulk Delete Kategori
  const [bulkDeleteKatModalOpen, setBulkDeleteKatModalOpen] = useState(false);
  const [bulkDeleteKatSubmitting, setBulkDeleteKatSubmitting] = useState(false);

  // Kategori aktif untuk dropdown form
  const activeKategoriList = useMemo(() => {
    return masterPelanggaranList.filter((k) => k.is_active !== false);
  }, [masterPelanggaranList]);

  const handleOpenTambahKatModal = () => {
    setNewKodeKat(`KAT-${Date.now().toString().slice(-4)}`);
    setNewNamaKat("");
    setNewTingkatKat("RINGAN");
    setNewPoinKat(5);
    setNewStandarTindakKat("");
    setModalTambahKatOpen(true);
  };

  const handleCreateKategoriSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKodeKat.trim() || !newNamaKat.trim()) return;
    setSubmittingKat(true);
    try {
      const res = await createMasterKategoriPelanggaran({
        kode_kategori: newKodeKat.trim().toUpperCase(),
        nama_kategori: newNamaKat.trim(),
        tingkat_pelanggaran: newTingkatKat,
        poin_pembinaan: Number(newPoinKat),
        standar_tindak_lanjut: newStandarTindakKat.trim() || "Pembinaan musyrif kamar",
        is_active: true,
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setModalTambahKatOpen(false);
      }
    } finally {
      setSubmittingKat(false);
    }
  };

  const handleOpenEditKat = (k: MasterKategoriPelanggaran) => {
    setEditKatModal(k);
    setEditNamaKat(k.nama_kategori);
    setEditTingkatKat(k.tingkat_pelanggaran);
    setEditPoinKat(k.poin_pembinaan);
    setEditStandarTindakKat(k.standar_tindak_lanjut);
    setEditIsActiveKat(k.is_active !== false);
  };

  const handleEditKategoriSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKatModal) return;
    setSubmittingKat(true);
    try {
      const res = await updateMasterKategoriPelanggaran(editKatModal.id, {
        nama_kategori: editNamaKat.trim(),
        tingkat_pelanggaran: editTingkatKat,
        poin_pembinaan: Number(editPoinKat),
        standar_tindak_lanjut: editStandarTindakKat.trim(),
        is_active: editIsActiveKat,
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setEditKatModal(null);
      }
    } finally {
      setSubmittingKat(false);
    }
  };

  const isAllKatSelected =
    masterPelanggaranList.length > 0 &&
    masterPelanggaranList.every((k) => selectedKatIds.includes(k.id));

  const handleToggleSelectAllKat = () => {
    if (isAllKatSelected) {
      setSelectedKatIds([]);
    } else {
      setSelectedKatIds(masterPelanggaranList.map((k) => k.id));
    }
  };

  const handleToggleSelectOneKat = (id: string) => {
    setSelectedKatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteKat = async () => {
    if (selectedKatIds.length === 0) return;
    setBulkDeleteKatSubmitting(true);
    try {
      const res = await deleteMasterKategoriPelanggaranBatch(selectedKatIds);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setSelectedKatIds([]);
        setBulkDeleteKatModalOpen(false);
      }
    } finally {
      setBulkDeleteKatSubmitting(false);
    }
  };

  // Filter Santri Berdasarkan Kelas yang Dipilih
  const getSantriByKelas = (kelasId: string) => {
    if (!kelasId) return [];
    return santriList.filter((s) => s.kelas_id === kelasId);
  };

  const getSantriName = (id: string) => {
    const s = santriList.find((x) => x.id === id);
    return s ? `${s.nama_lengkap} (${s.nis})` : id;
  };

  const getSantriKelas = (id: string) => {
    const s = santriList.find((x) => x.id === id);
    if (!s || !s.kelas_id) return "-";
    const k = kelasList.find((kls) => kls.id === s.kelas_id);
    return k?.nama_kelas || "-";
  };

  const getGradeBadge = (gradeStr: string) => {
    if (gradeStr.includes("(A)")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
          {gradeStr}
        </span>
      );
    }
    if (gradeStr.includes("(B)")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          {gradeStr}
        </span>
      );
    }
    if (gradeStr.includes("(C)")) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          {gradeStr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
        {gradeStr}
      </span>
    );
  };

  const filteredMengajiList = useMemo(() => {
    return mengajiList.filter((m) => {
      const s = santriList.find((x) => x.id === m.santri_id);
      if (filterKelasMengaji !== "all" && s?.kelas_id !== filterKelasMengaji) {
        return false;
      }
      if (searchSantriMengaji.trim()) {
        const q = searchSantriMengaji.toLowerCase();
        const matchName = s?.nama_lengkap.toLowerCase().includes(q);
        const matchNis = s?.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      if (filterPeriodeMengaji !== "all") {
        if (!m.tanggal_penilaian.startsWith(filterPeriodeMengaji)) return false;
      }
      return true;
    });
  }, [mengajiList, santriList, filterKelasMengaji, searchSantriMengaji, filterPeriodeMengaji]);

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-[#123C35]"
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
          TAB 0: DASHBOARD PENGELOLA KEPESANTRENAN
         ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Mutaba&apos;ah Mengaji
              </span>
              <p className="mt-1 text-2xl font-extrabold text-[#123C35]">
                {mengajiList.length}
              </p>
              <span className="text-[11px] text-emerald-700">Catatan perkembangan</span>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                Setoran Tahfidz
              </span>
              <p className="mt-1 text-2xl font-extrabold text-blue-950">
                {tahfidzList.length}
              </p>
              <span className="text-[11px] text-blue-700">Setoran Al-Qur&apos;an</span>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Prestasi Santri
              </span>
              <p className="mt-1 text-2xl font-extrabold text-amber-950">
                {prestasiList.length}
              </p>
              <span className="text-[11px] text-amber-700">Penghargaan tercatat</span>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
                Catatan Kedisiplinan
              </span>
              <p className="mt-1 text-2xl font-extrabold text-purple-950">
                {kedisiplinanList.length}
              </p>
              <span className="text-[11px] text-purple-700">Riwayat pembinaan</span>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("mengaji")}
              className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 group-hover:bg-[#123C35] group-hover:text-white transition shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#123C35] transition">
                  Perkembangan Mengaji
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                  Input mutaba&apos;ah harian dan jilid bacaan.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tahfidz")}
              className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm hover:border-blue-300 hover:shadow-md transition group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-800 border border-blue-200 group-hover:bg-blue-800 group-hover:text-white transition shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-900 transition">
                  Setoran Tahfidz
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                  Catat hafalan baru, muroja&apos;ah, dan juz.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("prestasi")}
              className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm hover:border-amber-300 hover:shadow-md transition group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-800 border border-amber-200 group-hover:bg-amber-800 group-hover:text-white transition shrink-0">
                <Award className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-900 transition">
                  Prestasi Santri
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                  Catat kejuaraan, lomba, dan sertifikat.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("kedisiplinan")}
              className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left shadow-sm hover:border-purple-300 hover:shadow-md transition group"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-800 border border-purple-200 group-hover:bg-purple-800 group-hover:text-white transition shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-900 transition">
                  Kedisiplinan &amp; Pembinaan
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                  Kelola poin pelanggaran &amp; tindak lanjut.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: MENGAJI */}
      {activeTab === "mengaji" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Form Evaluasi Mengaji (Bab 2 PRD: Dropdown Nilai A-D Wajib, Tanggal & Petugas) */}
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <BookOpen className="h-5 w-5 text-emerald-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Formulir Evaluasi Mengaji
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Penilaian tajwid, makharijul huruf, &amp; kelancaran (A-D)
                  </p>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!kelasMengaji || !santriMengaji) {
                    setFeedback({ ok: false, text: "Harap pilih kelas dan nama santri terlebih dahulu." });
                    return;
                  }
                  const res = recordPerkembanganMengaji({
                    santri_id: santriMengaji,
                    tanggal_penilaian: tanggalPenilaianMengaji,
                    pembimbing_name: pembimbingMengaji.trim() || (currentUser?.nama_lengkap ?? "Asatidz"),
                    metode_pembelajaran: metodeMengaji.trim(),
                    tingkat_jilid: tingkatJilid.trim(),
                    materi_terakhir: materiTerakhir.trim(),
                    kelancaran_bacaan: kelancaran,
                    makharijul_huruf: makharij,
                    tajwid,
                    catatan_perkembangan: catatanMengaji.trim(),
                  });
                  setFeedback({ ok: res.ok, text: res.message });
                }}
                className="mt-4 space-y-3.5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="select-kelas-mengaji" className="block font-semibold text-slate-700 mb-1">
                      Kelas <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id="select-kelas-mengaji"
                      required
                      value={kelasMengaji}
                      onChange={(e) => {
                        setKelasMengaji(e.target.value);
                        setSantriMengaji("");
                      }}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 focus:border-[#1D6B59] focus:outline-none"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas} ({k.tingkat})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="select-santri-mengaji" className="block font-semibold text-slate-700 mb-1">
                      Nama Santri <span className="text-rose-600">*</span>
                    </label>
                    <select
                      id="select-santri-mengaji"
                      required
                      disabled={!kelasMengaji}
                      value={santriMengaji}
                      onChange={(e) => setSantriMengaji(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-[#1D6B59] focus:outline-none"
                    >
                      {!kelasMengaji ? (
                        <option value="">Pilih kelas terlebih dahulu</option>
                      ) : getSantriByKelas(kelasMengaji).length === 0 ? (
                        <option value="">Belum ada santri pada kelas ini</option>
                      ) : (
                        <>
                          <option value="">-- Pilih Santri --</option>
                          {getSantriByKelas(kelasMengaji).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nis} — {s.nama_lengkap}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Tanggal Penilaian *</label>
                    <input
                      type="date"
                      required
                      value={tanggalPenilaianMengaji}
                      onChange={(e) => setTanggalPenilaianMengaji(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Nama Pembimbing *</label>
                    <input
                      type="text"
                      required
                      value={pembimbingMengaji}
                      onChange={(e) => setPembimbingMengaji(e.target.value)}
                      placeholder="Nama Asatidz / Penguji"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Metode Pembelajaran *</label>
                  <input
                    type="text"
                    required
                    value={metodeMengaji}
                    onChange={(e) => setMetodeMengaji(e.target.value)}
                    placeholder="Contoh: Yanbu'a, Qiroati, Tahsin Al-Qur'an"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Tingkat / Jilid *</label>
                    <input
                      type="text"
                      required
                      value={tingkatJilid}
                      onChange={(e) => setTingkatJilid(e.target.value)}
                      placeholder="Jilid 4 / Juz 15"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Materi Terakhir *</label>
                    <input
                      type="text"
                      required
                      value={materiTerakhir}
                      onChange={(e) => setMateriTerakhir(e.target.value)}
                      placeholder="Halaman 20 / QS. Al-Isra 1-10"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                {/* Dropdown Wajib Nilai A-D (BUKAN Teks Bebas) */}
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2.5">
                  <div className="text-[11px] font-bold text-[#123C35] uppercase tracking-wide">
                    Predikat Evaluasi (Wajib Pilihan A–D)
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">1. Kelancaran Bacaan *</label>
                    <select
                      value={kelancaran}
                      onChange={(e) => setKelancaran(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800"
                    >
                      <option value="Sangat Lancar (A)">Sangat Lancar (A)</option>
                      <option value="Lancar (B)">Lancar (B)</option>
                      <option value="Cukup Lancar (C)">Cukup Lancar (C)</option>
                      <option value="Perlu Bimbingan (D)">Perlu Bimbingan (D)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">2. Makharijul Huruf *</label>
                    <select
                      value={makharij}
                      onChange={(e) => setMakharij(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800"
                    >
                      <option value="Fasih & Tepat (A)">Fasih & Tepat (A)</option>
                      <option value="Baik (B)">Baik (B)</option>
                      <option value="Cukup (C)">Cukup (C)</option>
                      <option value="Perlu Bimbingan (D)">Perlu Bimbingan (D)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">3. Kaidah Tajwid *</label>
                    <select
                      value={tajwid}
                      onChange={(e) => setTajwid(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800"
                    >
                      <option value="Sangat Baik (A)">Sangat Baik (A)</option>
                      <option value="Baik (B)">Baik (B)</option>
                      <option value="Cukup (C)">Cukup (C)</option>
                      <option value="Perlu Bimbingan (D)">Perlu Bimbingan (D)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Catatan Pembimbing *</label>
                  <textarea
                    rows={2}
                    required
                    value={catatanMengaji}
                    onChange={(e) => setCatatanMengaji(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    placeholder="Tuliskan catatan perkembangan dan bimbingan untuk santri..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#1D6B59] py-2.5 font-bold text-white hover:bg-[#123C35] transition min-h-[42px] cursor-pointer shadow-sm"
                >
                  Simpan Catatan Perkembangan Mengaji
                </button>
              </form>
            </div>

            {/* Rekapitulasi Perkembangan Mengaji Seluruh Santri */}
            <div className="lg:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Rekapitulasi Perkembangan Mengaji Santri
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Data riil evaluasi mutaba&apos;ah seluruh santri ({filteredMengajiList.length} dari {mengajiList.length} catatan)
                  </p>
                </div>
              </div>

              {/* Filter Bar: Kelas, Santri, Periode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama santri / NIS..."
                    value={searchSantriMengaji}
                    onChange={(e) => setSearchSantriMengaji(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 min-h-[38px] focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <select
                  value={filterKelasMengaji}
                  onChange={(e) => setFilterKelasMengaji(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                >
                  <option value="all">Semua Kelas</option>
                  {kelasList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama_kelas}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPeriodeMengaji}
                  onChange={(e) => setFilterPeriodeMengaji(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                >
                  <option value="all">Semua Periode</option>
                  <option value="2026-11">November 2026</option>
                  <option value="2026-10">Oktober 2026</option>
                  <option value="2026-09">September 2026</option>
                </select>
              </div>

              {/* Table Rekapitulasi Mengaji */}
              <div className="overflow-x-auto rounded-xl border border-[#E5E7EB]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-[#E5E7EB] font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-3.5 py-2.5">Santri</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Tingkat &amp; Materi</th>
                      <th className="px-2.5 py-2.5">Kelancaran</th>
                      <th className="px-2.5 py-2.5">Makharij</th>
                      <th className="px-2.5 py-2.5">Tajwid</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMengajiList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                          Tidak ditemukan catatan perkembangan mengaji yang sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredMengajiList.map((m) => {
                        const s = santriList.find((x) => x.id === m.santri_id);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              <div>{s?.nama_lengkap || m.santri_id}</div>
                              <div className="text-[10px] text-slate-400 font-mono font-normal">
                                {s?.nis}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 font-medium">
                              {getSantriKelas(m.santri_id)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-[#123C35] block">
                                {m.tingkat_jilid}
                              </span>
                              <span className="text-[11px] text-slate-500 line-clamp-1">
                                {m.materi_terakhir}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5">
                              {getGradeBadge(m.kelancaran_bacaan)}
                            </td>
                            <td className="px-2.5 py-2.5">
                              {getGradeBadge(m.makharijul_huruf)}
                            </td>
                            <td className="px-2.5 py-2.5">
                              {getGradeBadge(m.tajwid)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">
                              {formatTanggal(m.tanggal_penilaian)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setModalRiwayatSantriId(m.santri_id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
                                title="Buka Riwayat Lengkap"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Riwayat</span>
                              </button>
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

          {/* Modal Riwayat Lengkap Mengaji Per Santri */}
          {modalRiwayatSantriId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Riwayat Lengkap Evaluasi Mengaji
                    </h3>
                    <p className="text-xs text-slate-500">
                      Santri: <strong>{getSantriName(modalRiwayatSantriId)}</strong> • Kelas:{" "}
                      {getSantriKelas(modalRiwayatSantriId)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalRiwayatSantriId(null)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {mengajiList
                    .filter((m) => m.santri_id === modalRiwayatSantriId)
                    .map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="rounded-xl border border-[#E5E7EB] p-4 bg-slate-50/50 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-sm">
                            {item.tingkat_jilid} — {item.materi_terakhir}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-[#E5E7EB]">
                            {formatTanggal(item.tanggal_penilaian)}
                          </span>
                        </div>
                        <div className="text-slate-600">
                          Metode: <strong className="text-slate-800">{item.metode_pembelajaran}</strong> • Pembimbing:{" "}
                          <strong className="text-slate-800">{item.pembimbing_name}</strong>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Kelancaran:</span>
                            {getGradeBadge(item.kelancaran_bacaan)}
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Makharijul Huruf:</span>
                            {getGradeBadge(item.makharijul_huruf)}
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Kaidah Tajwid:</span>
                            {getGradeBadge(item.tajwid)}
                          </div>
                        </div>
                        {item.catatan_perkembangan && (
                          <div className="bg-white p-2.5 rounded-lg border border-[#E5E7EB] text-slate-700 mt-2 text-[11px]">
                            <strong>Catatan Pembimbing:</strong> {item.catatan_perkembangan}
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalRiwayatSantriId(null)}
                    className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TAHFIDZ */}
      {activeTab === "tahfidz" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Catat Setoran Tahfidz Baru</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!kelasTahfidz || !santriTahfidz) {
                  setFeedback({ ok: false, text: "Harap pilih kelas dan nama santri terlebih dahulu." });
                  return;
                }
                const res = recordSetoranTahfidz({
                  santri_id: santriTahfidz,
                  tanggal_setoran: new Date().toISOString().slice(0, 10),
                  pembimbing_name: pembimbingMengaji,
                  nama_surah: namaSurah,
                  juz: Number(juz),
                  ayat_awal: Number(ayatAwal),
                  ayat_akhir: Number(ayatAkhir),
                  jenis_setoran: jenisSetoran,
                  kualitas_hafalan: kualitasHafalan,
                  catatan_pembimbing: catatanTahfidz,
                });
                setFeedback({ ok: res.ok, text: res.message });
              }}
              className="mt-3 space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="select-kelas-tahfidz" className="block font-semibold text-slate-700 mb-1">
                    Kelas <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="select-kelas-tahfidz"
                    required
                    value={kelasTahfidz}
                    onChange={(e) => {
                      setKelasTahfidz(e.target.value);
                      setSantriTahfidz("");
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 focus:border-[#1D6B59] focus:outline-none"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama_kelas} ({k.tingkat})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="select-santri-tahfidz" className="block font-semibold text-slate-700 mb-1">
                    Nama Santri <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="select-santri-tahfidz"
                    required
                    disabled={!kelasTahfidz}
                    value={santriTahfidz}
                    onChange={(e) => setSantriTahfidz(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-[#1D6B59] focus:outline-none"
                  >
                    {!kelasTahfidz ? (
                      <option value="">Pilih kelas terlebih dahulu</option>
                    ) : getSantriByKelas(kelasTahfidz).length === 0 ? (
                      <option value="">Belum ada santri pada kelas ini</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Santri --</option>
                        {getSantriByKelas(kelasTahfidz).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nis} — {s.nama_lengkap}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Jenis Setoran</label>
                  <select
                    value={jenisSetoran}
                    onChange={(e) => setJenisSetoran(e.target.value as JenisSetoranTahfidz)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                  >
                    <option value="HAFALAN_BARU">Hafalan Baru</option>
                    <option value="MUROJAAH">Murojaah</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Juz (1-30)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={juz}
                    onChange={(e) => setJuz(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Nama Surah</label>
                <input
                  type="text"
                  required
                  value={namaSurah}
                  onChange={(e) => setNamaSurah(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Ayat Awal</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={ayatAwal}
                    onChange={(e) => setAyatAwal(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Ayat Akhir</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={ayatAkhir}
                    onChange={(e) => setAyatAkhir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Kualitas / Nilai Hafalan</label>
                <select
                  value={kualitasHafalan}
                  onChange={(e) => setKualitasHafalan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                >
                  <option value="Mumtaz (Istimewa)">Mumtaz (Istimewa)</option>
                  <option value="Jayyid Jiddan (Sangat Baik)">Jayyid Jiddan (Sangat Baik)</option>
                  <option value="Jayyid (Baik)">Jayyid (Baik)</option>
                  <option value="Maqbul (Cukup)">Maqbul (Cukup)</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Catatan Pembimbing</label>
                <textarea
                  rows={2}
                  value={catatanTahfidz}
                  onChange={(e) => setCatatanTahfidz(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#1D6B59] py-2 font-bold text-white hover:bg-[#123C35]"
              >
                Simpan Setoran Tahfidz
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Setoran Tahfidz ({tahfidzList.length})
            </h3>
            {tahfidzList.map((t) => (
              <div key={t.id} className="rounded-xl border border-[#E5E7EB] p-3.5 text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{getSantriName(t.santri_id)}</span>
                  <span className="text-slate-500">{formatTanggal(t.tanggal_setoran)}</span>
                </div>
                <p className="text-emerald-800 font-semibold">
                  [{t.jenis_setoran}] {t.nama_surah} (Juz {t.juz}) • Ayat {t.ayat_awal}–
                  {t.ayat_akhir} ({t.jumlah_ayat} Ayat) — {t.kualitas_hafalan}
                </p>
                <p className="text-slate-600">{t.catatan_pembimbing}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PRESTASI */}
      {activeTab === "prestasi" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Catat Prestasi Santri</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!kelasPrestasi || !santriPrestasi) {
                  setFeedback({ ok: false, text: "Harap pilih kelas dan nama santri terlebih dahulu." });
                  return;
                }
                const res = recordPrestasiSantri({
                  santri_id: santriPrestasi,
                  tanggal_prestasi: new Date().toISOString().slice(0, 10),
                  nama_kegiatan: namaKegiatan,
                  kategori: kategoriPrestasi,
                  tingkat_prestasi: tingkatPrestasi,
                  peringkat: peringkatPrestasi,
                  deskripsi: deskripsiPrestasi,
                });
                setFeedback({ ok: res.ok, text: res.message });
              }}
              className="mt-3 space-y-3 text-xs"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="select-kelas-prestasi" className="block font-semibold text-slate-700 mb-1">
                    Kelas <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="select-kelas-prestasi"
                    required
                    value={kelasPrestasi}
                    onChange={(e) => {
                      setKelasPrestasi(e.target.value);
                      setSantriPrestasi("");
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 focus:border-[#1D6B59] focus:outline-none"
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama_kelas} ({k.tingkat})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="select-santri-prestasi" className="block font-semibold text-slate-700 mb-1">
                    Nama Santri <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="select-santri-prestasi"
                    required
                    disabled={!kelasPrestasi}
                    value={santriPrestasi}
                    onChange={(e) => setSantriPrestasi(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-[#1D6B59] focus:outline-none"
                  >
                    {!kelasPrestasi ? (
                      <option value="">Pilih kelas terlebih dahulu</option>
                    ) : getSantriByKelas(kelasPrestasi).length === 0 ? (
                      <option value="">Belum ada santri pada kelas ini</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Santri --</option>
                        {getSantriByKelas(kelasPrestasi).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nis} — {s.nama_lengkap}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Nama Kegiatan / Lomba</label>
                <input
                  type="text"
                  required
                  value={namaKegiatan}
                  onChange={(e) => setNamaKegiatan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Tingkat Prestasi</label>
                  <select
                    value={tingkatPrestasi}
                    onChange={(e) => setTingkatPrestasi(e.target.value as TingkatPrestasi)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                  >
                    <option value="INTERNAL">Internal Pesantren</option>
                    <option value="KECAMATAN">Kecamatan</option>
                    <option value="KABUPATEN">Kabupaten</option>
                    <option value="PROVINSI">Provinsi</option>
                    <option value="NASIONAL">Nasional</option>
                    <option value="INTERNASIONAL">Internasional</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Peringkat</label>
                  <input
                    type="text"
                    required
                    value={peringkatPrestasi}
                    onChange={(e) => setPeringkatPrestasi(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Deskripsi</label>
                <textarea
                  rows={3}
                  required
                  value={deskripsiPrestasi}
                  onChange={(e) => setDeskripsiPrestasi(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-[#1D6B59] py-2 font-bold text-white hover:bg-[#123C35]"
              >
                Simpan Prestasi Santri
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Prestasi Santri ({prestasiList.length})
            </h3>
            {prestasiList.map((p) => (
              <div key={p.id} className="rounded-xl border border-[#E5E7EB] p-3.5 text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{getSantriName(p.santri_id)}</span>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                    {p.peringkat} • Tingkat {p.tingkat_prestasi}
                  </span>
                </div>
                <p className="font-semibold text-slate-800">{p.nama_kegiatan}</p>
                <p className="text-slate-600">{p.deskripsi}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: KEDISIPLINAN & MASTER KATEGORI PELANGGARAN */}
      {(activeTab === "kedisiplinan" || activeTab === "master_kategori_pelanggaran") && (
        <div className="w-full space-y-6">
          {/* Subtab Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Kedisiplinan &amp; Pembinaan Santri</h3>
              <p className="text-xs text-slate-500">
                Pencatatan pelanggaran, evaluasi pembinaan, serta manajemen master kategori pelanggaran pesantren.
              </p>
            </div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-[#E5E7EB]">
              <button
                type="button"
                onClick={() => setDisiplinSubTab("catatan")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition min-h-[38px] ${
                  disiplinSubTab === "catatan"
                    ? "bg-white text-[#123C35] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ShieldAlert className="h-4 w-4" />
                <span>Catatan &amp; Pembinaan</span>
              </button>
              <button
                type="button"
                onClick={() => setDisiplinSubTab("master")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition min-h-[38px] ${
                  disiplinSubTab === "master"
                    ? "bg-white text-[#123C35] shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Master Kategori Pelanggaran</span>
              </button>
            </div>
          </div>

          {/* SUBTAB A: CATATAN & PEMBINAAN KEDISIPLINAN */}
          {disiplinSubTab === "catatan" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6">
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900">
                    Catat Pelanggaran &amp; Pembinaan Baru
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!kelasDisiplin || !santriDisiplin) {
                        setFeedback({ ok: false, text: "Harap pilih kelas dan nama santri terlebih dahulu." });
                        return;
                      }
                      const res = recordCatatanKedisiplinan({
                        santri_id: santriDisiplin,
                        tanggal_kejadian: new Date().toISOString().slice(0, 10),
                        waktu_kejadian: "06:30",
                        kategori_id: kategoriDisiplinId,
                        deskripsi: deskripsiDisiplin,
                        tindak_lanjut: tindakLanjutDisiplin,
                        catatan_pembinaan: catatanPembinaanDisiplin,
                        status_tindak_lanjut: "DALAM_PEMBINAAN",
                      });
                      setFeedback({ ok: res.ok, text: res.message });
                      if (res.ok) setDeskripsiDisiplin("");
                    }}
                    className="mt-3 space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="select-kelas-disiplin" className="block font-semibold text-slate-700 mb-1">
                          Kelas <span className="text-rose-600">*</span>
                        </label>
                        <select
                          id="select-kelas-disiplin"
                          required
                          value={kelasDisiplin}
                          onChange={(e) => {
                            setKelasDisiplin(e.target.value);
                            setSantriDisiplin("");
                          }}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 focus:border-[#1D6B59] focus:outline-none"
                        >
                          <option value="">-- Pilih Kelas --</option>
                          {kelasList.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nama_kelas} ({k.tingkat})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="select-santri-disiplin" className="block font-semibold text-slate-700 mb-1">
                          Nama Santri <span className="text-rose-600">*</span>
                        </label>
                        <select
                          id="select-santri-disiplin"
                          required
                          disabled={!kelasDisiplin}
                          value={santriDisiplin}
                          onChange={(e) => setSantriDisiplin(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-[#1D6B59] focus:outline-none"
                        >
                          {!kelasDisiplin ? (
                            <option value="">Pilih kelas terlebih dahulu</option>
                          ) : getSantriByKelas(kelasDisiplin).length === 0 ? (
                            <option value="">Belum ada santri pada kelas ini</option>
                          ) : (
                            <>
                              <option value="">-- Pilih Santri --</option>
                              {getSantriByKelas(kelasDisiplin).map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nis} — {s.nama_lengkap}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">
                        Kategori Pelanggaran (Hanya Kategori Aktif)
                      </label>
                      <select
                        value={kategoriDisiplinId}
                        onChange={(e) => setKategoriDisiplinId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-medium"
                      >
                        {activeKategoriList.length === 0 ? (
                          <option value="">Tidak ada kategori aktif</option>
                        ) : (
                          activeKategoriList.map((k) => (
                            <option key={k.id} value={k.id}>
                              [{k.tingkat_pelanggaran}] {k.nama_kategori} ({k.poin_pembinaan} Poin)
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Deskripsi Kejadian</label>
                      <textarea
                        rows={2}
                        required
                        value={deskripsiDisiplin}
                        onChange={(e) => setDeskripsiDisiplin(e.target.value)}
                        placeholder="Uraikan waktu dan kronologi singkat kejadian..."
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Tindak Lanjut Standar</label>
                      <input
                        type="text"
                        required
                        value={tindakLanjutDisiplin}
                        onChange={(e) => setTindakLanjutDisiplin(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Catatan Pembinaan</label>
                      <input
                        type="text"
                        required
                        value={catatanPembinaanDisiplin}
                        onChange={(e) => setCatatanPembinaanDisiplin(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-[#1D6B59] py-2.5 font-bold text-white hover:bg-[#123C35] transition shadow-sm min-h-[44px] cursor-pointer"
                    >
                      Simpan Catatan Kedisiplinan
                    </button>
                  </form>
                </div>

                {/* Form Update Status Tindak Lanjut dengan Riwayat */}
                <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <History className="h-4 w-4 text-indigo-700" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Perbarui Tindak Lanjut (Simpan Riwayat Sebelumnya)
                    </h3>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const target = kedisiplinanList.find((c) => c.id === selectedDisiplinId);
                      const res = updateTindakLanjutKedisiplinan({
                        catatan_id: selectedDisiplinId,
                        tindak_lanjut_baru: target?.tindak_lanjut ?? tindakLanjutDisiplin,
                        catatan_pembinaan_baru: catatanPembinaanUpdate,
                        status_baru: statusTindakBaru,
                        alasan_perubahan: alasanUpdateDisiplin,
                      });
                      setFeedback({ ok: res.ok, text: res.message });
                    }}
                    className="mt-3 space-y-2.5 text-xs"
                  >
                    <div>
                      <label className="font-semibold text-slate-700">Pilih Catatan Santri</label>
                      <select
                        value={selectedDisiplinId}
                        onChange={(e) => setSelectedDisiplinId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      >
                        {kedisiplinanList.map((d) => (
                          <option key={d.id} value={d.id}>
                            {getSantriName(d.santri_id)} — {d.nama_kategori}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Status Pembinaan Baru</label>
                      <select
                        value={statusTindakBaru}
                        onChange={(e) => setStatusTindakBaru(e.target.value as StatusTindakLanjut)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-2 font-bold"
                      >
                        <option value="TERCATAT">TERCATAT</option>
                        <option value="DALAM_PEMBINAAN">DALAM_PEMBINAAN</option>
                        <option value="SELESAI">SELESAI</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Catatan Pembinaan Terbaru</label>
                      <input
                        type="text"
                        required
                        value={catatanPembinaanUpdate}
                        onChange={(e) => setCatatanPembinaanUpdate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Alasan Perubahan Status</label>
                      <input
                        type="text"
                        required
                        value={alasanUpdateDisiplin}
                        onChange={(e) => setAlasanUpdateDisiplin(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-2.5 py-2"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-indigo-700 py-2.5 font-bold text-white hover:bg-indigo-800 transition min-h-[44px] cursor-pointer"
                    >
                      Perbarui Status &amp; Arsipkan Catatan Lama
                    </button>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Daftar Catatan Kedisiplinan &amp; Jejak Pembinaan
                    </h3>
                    <p className="text-xs text-slate-500">
                      Riwayat perubahan status dan evaluasi tersimpan lengkap tanpa menimpa catatan lama.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {kedisiplinanList.length} Catatan
                  </span>
                </div>

                <div className="space-y-3">
                  {kedisiplinanList.map((d) => (
                    <div key={d.id} className="rounded-xl border border-[#E5E7EB] p-4 text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {getSantriName(d.santri_id)} — {d.nama_kategori}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            d.status_tindak_lanjut === "SELESAI"
                              ? "bg-emerald-100 text-emerald-800"
                              : d.status_tindak_lanjut === "DALAM_PEMBINAAN"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {d.status_tindak_lanjut}
                        </span>
                      </div>
                      <p className="text-slate-600">{d.deskripsi}</p>
                      <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <strong>Pembinaan Saat Ini:</strong> {d.catatan_pembinaan}
                      </p>
                      {d.riwayat_perubahan && d.riwayat_perubahan.length > 0 && (
                        <div className="border-t border-slate-100 pt-2 space-y-1">
                          <span className="font-bold text-slate-500 text-[11px]">
                            Riwayat Catatan Sebelumnya ({d.riwayat_perubahan.length}):
                          </span>
                          {d.riwayat_perubahan.map((r) => (
                            <div
                              key={r.id}
                              className="rounded bg-slate-50 p-2 text-[11px] text-slate-600 border border-[#E5E7EB]/60"
                            >
                              <div className="font-medium text-slate-800">
                                [{formatWaktuLengkap(r.created_at)}] {r.status_sebelum} → {r.status_sesudah} (Oleh: {r.diubah_oleh_nama})
                              </div>
                              <div>Catatan sebelumnya: &ldquo;{r.catatan_pembinaan_sebelum}&rdquo;</div>
                              <div className="text-[10px] text-slate-400 italic">Alasan: {r.alasan_perubahan}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB B: MASTER KATEGORI PELANGGARAN */}
          {disiplinSubTab === "master" && (
            <div className="w-full space-y-4">
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      Master Data Kategori Pelanggaran Pesantren
                    </h4>
                    <p className="text-xs text-slate-500">
                      Standar rujukan tingkat pelanggaran, poin pembinaan, dan pedoman tindak lanjut resmi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenTambahKatModal}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#123C35] px-4 py-2 text-xs font-bold text-white hover:bg-[#1D6B59] shadow-sm transition min-h-[40px] cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Kategori Baru</span>
                  </button>
                </div>

                {/* Bulk Action Bar Kategori */}
                {selectedKatIds.length > 0 && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <span className="text-xs font-bold text-rose-950">
                      Terpilih {selectedKatIds.length} kategori pelanggaran
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedKatIds([])}
                        className="rounded-lg bg-white border border-rose-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkDeleteKatModalOpen(true)}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus Terpilih</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tabel Master Kategori */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] bg-slate-50 uppercase text-slate-500 font-bold">
                        <th className="py-3 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isAllKatSelected}
                            onChange={handleToggleSelectAllKat}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3">Kode</th>
                        <th className="py-3 px-3">Nama Kategori</th>
                        <th className="py-3 px-3">Tingkat</th>
                        <th className="py-3 px-3 text-center">Poin</th>
                        <th className="py-3 px-3">Standar Tindak Lanjut</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {masterPelanggaranList.map((k) => {
                        const isSelected = selectedKatIds.includes(k.id);
                        return (
                          <tr key={k.id} className={`hover:bg-slate-50/70 transition ${isSelected ? "bg-rose-50/40" : ""}`}>
                            <td className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectOneKat(k.id)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                              />
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-800">
                              {k.kode_kategori}
                            </td>
                            <td className="py-3 px-3 font-bold text-slate-900">
                              {k.nama_kategori}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                  k.tingkat_pelanggaran === "RINGAN"
                                    ? "bg-blue-100 text-blue-800"
                                    : k.tingkat_pelanggaran === "SEDANG"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {k.tingkat_pelanggaran}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-800">
                              {k.poin_pembinaan}
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                              {k.standar_tindak_lanjut}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  k.is_active !== false
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {k.is_active !== false ? "Aktif" : "Nonaktif"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleOpenEditKat(k)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Edit2 className="h-3 w-3" />
                                <span>Edit</span>
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

          {/* MODAL TAMBAH KATEGORI */}
          {modalTambahKatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-extrabold text-slate-900">Tambah Kategori Pelanggaran</h4>
                  <button
                    type="button"
                    onClick={() => setModalTambahKatOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleCreateKategoriSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Kode Kategori</label>
                    <input
                      type="text"
                      required
                      value={newKodeKat}
                      onChange={(e) => setNewKodeKat(e.target.value.toUpperCase())}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nama Kategori</label>
                    <input
                      type="text"
                      required
                      value={newNamaKat}
                      onChange={(e) => setNewNamaKat(e.target.value)}
                      placeholder="Contoh: Terlambat Mengikuti Shalat Berjamaah"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tingkat</label>
                      <select
                        value={newTingkatKat}
                        onChange={(e) => setNewTingkatKat(e.target.value as "RINGAN" | "SEDANG" | "BERAT")}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                      >
                        <option value="RINGAN">RINGAN</option>
                        <option value="SEDANG">SEDANG</option>
                        <option value="BERAT">BERAT</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Poin Pembinaan</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={newPoinKat}
                        onChange={(e) => setNewPoinKat(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Standar Tindak Lanjut</label>
                    <textarea
                      rows={2}
                      required
                      value={newStandarTindakKat}
                      onChange={(e) => setNewStandarTindakKat(e.target.value)}
                      placeholder="Pedoman tindakan pembinaan standar..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setModalTambahKatOpen(false)}
                      className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingKat}
                      className="rounded-xl bg-[#123C35] px-5 py-2 font-bold text-white hover:bg-[#1D6B59] disabled:opacity-50 min-h-[42px] cursor-pointer"
                    >
                      {submittingKat ? "Menyimpan..." : "Simpan Kategori"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL EDIT KATEGORI */}
          {editKatModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-extrabold text-slate-900">Edit Kategori Pelanggaran</h4>
                  <button
                    type="button"
                    onClick={() => setEditKatModal(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleEditKategoriSubmit} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Kode Kategori</label>
                    <input
                      type="text"
                      disabled
                      value={editKatModal.kode_kategori}
                      className="w-full rounded-xl border border-[#E5E7EB] bg-slate-100 px-3 py-2 font-mono font-bold text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nama Kategori</label>
                    <input
                      type="text"
                      required
                      value={editNamaKat}
                      onChange={(e) => setEditNamaKat(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-medium"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tingkat</label>
                      <select
                        value={editTingkatKat}
                        onChange={(e) => setEditTingkatKat(e.target.value as "RINGAN" | "SEDANG" | "BERAT")}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                      >
                        <option value="RINGAN">RINGAN</option>
                        <option value="SEDANG">SEDANG</option>
                        <option value="BERAT">BERAT</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Poin Pembinaan</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={editPoinKat}
                        onChange={(e) => setEditPoinKat(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Standar Tindak Lanjut</label>
                    <textarea
                      rows={2}
                      required
                      value={editStandarTindakKat}
                      onChange={(e) => setEditStandarTindakKat(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Status Keaktifan</label>
                    <select
                      value={editIsActiveKat ? "active" : "inactive"}
                      onChange={(e) => setEditIsActiveKat(e.target.value === "active")}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold"
                    >
                      <option value="active">Aktif (Dapat Dipilih)</option>
                      <option value="inactive">Nonaktif (Diarsipkan)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEditKatModal(null)}
                      className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={submittingKat}
                      className="rounded-xl bg-[#123C35] px-5 py-2 font-bold text-white hover:bg-[#1D6B59] disabled:opacity-50 min-h-[42px] cursor-pointer"
                    >
                      {submittingKat ? "Menyimpan..." : "Simpan Perubahan"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL BULK DELETE KATEGORI */}
          {bulkDeleteKatModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl space-y-4">
                <div className="flex items-center gap-2 text-rose-700 border-b border-rose-100 pb-3">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <h4 className="text-base font-extrabold text-slate-900">
                    Hapus {selectedKatIds.length} Kategori Terpilih?
                  </h4>
                </div>
                <div className="text-xs text-slate-600 space-y-2">
                  <p>
                    Kategori yang <strong>belum pernah digunakan</strong> pada riwayat pembinaan santri akan <em>dihapus permanen</em>.
                  </p>
                  <p className="text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                    Kategori yang <strong>sudah memiliki riwayat pembinaan santri</strong> otomatis <em>dinonaktifkan secara aman (Soft Delete)</em> agar integritas rekam jejak santri tidak hilang.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setBulkDeleteKatModalOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 min-h-[42px]"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={bulkDeleteKatSubmitting}
                    onClick={handleBulkDeleteKat}
                    className="rounded-xl bg-rose-700 px-5 py-2 font-bold text-white hover:bg-rose-800 disabled:opacity-50 min-h-[42px] cursor-pointer"
                  >
                    {bulkDeleteKatSubmitting ? "Memproses..." : "Ya, Hapus/Nonaktifkan"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const AsatidzPortal = PengelolaPortal;
export type AsatidzTab = PengelolaTab;

