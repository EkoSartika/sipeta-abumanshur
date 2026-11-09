"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  Download,
  Edit2,
  FileSpreadsheet,
  FileUp,
  History,
  Info,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatTanggal,
  formatWaktuLengkap,
  getStatusSantriBadge,
} from "@/lib/utils/format";
import { exportSantriToExcel } from "@/lib/utils/excel-export";
import {
  downloadSantriImportTemplate,
  parseSantriExcel,
  validateSantriImportRows,
  downloadImportReportExcel,
} from "@/lib/utils/excel-import";
import {
  isValidUsername,
  normalizeUsername,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import type {
  ImportBatchReport,
  ImportSantriRow,
  ImportValidationSummary,
  Kamar,
  Kelas,
  RiwayatPenempatanSantri,
  Santri,
  StatusSantri,
} from "@/types/database";

export type TuTab =
  | "dashboard"
  | "tambah_santri"
  | "santri_wali"
  | "kelas_kamar"
  | "riwayat_penempatan"
  | "pengumuman";

export interface TuPortalProps {
  activeTab?: TuTab | string;
  onTabChange?: (tab: string) => void;
}

export function TuPortal({
  activeTab: controlledTab,
  onTabChange,
}: TuPortalProps = {}) {
  const {
    currentUser,
    santriList,
    waliList,
    kelasList,
    kamarList,
    riwayatPenempatan,
    pengumumanList,
    createSantriWithWali,
    importSantriBatch,
    moveSantriPlacement,
    updateStatusSantri,
    createKelas,
    updateKelas,
    createKamar,
    updateKamar,
    createPengumuman,
  } = useSipeta();

  const [internalTab, setInternalTab] = useState<TuTab>("dashboard");
  const activeTab = (controlledTab as TuTab) || internalTab;
  const setActiveTab = (tab: TuTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Subtab internal untuk "Tambah Data Santri" (Formulir Registrasi vs Import Excel)
  const [tambahSantriSubTab, setTambahSantriSubTab] = useState<"registrasi" | "import">("registrasi");

  // Subtab internal untuk "Kelas, Kamar & Penempatan"
  const [kelasKamarSubTab, setKelasKamarSubTab] = useState<"kelas" | "kamar" | "pindah" | "riwayat">("kelas");

  // State Import Data Santri Excel
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRawRows, setImportRawRows] = useState<Record<string, string>[]>([]);
  const [importValidation, setImportValidation] = useState<ImportValidationSummary | null>(null);
  const [importStep, setImportStep] = useState<"UPLOAD" | "PREVIEW" | "PROCESSING" | "RESULT">("UPLOAD");
  const [importParsing, setImportParsing] = useState(false);
  const [importExecuting, setImportExecuting] = useState(false);
  const [importReport, setImportReport] = useState<ImportBatchReport | null>(null);
  const [importFilterErrorOnly, setImportFilterErrorOnly] = useState(false);

  // Filter & Search Santri
  const [santriSearch, setSantriSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("all");
  const [filterKamar, setFilterKamar] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Form Registrasi Santri Baru + Akun Wali
  const [nis, setNis] = useState("202607101");
  const [namaSantri, setNamaSantri] = useState("");
  const [tempatLahir, setTempatLahir] = useState("Cirebon");
  const [tanggalLahir, setTanggalLahir] = useState("2013-06-15");
  const [jenisKelamin, setJenisKelamin] = useState<"L" | "P">("L");
  const [alamatSantri, setAlamatSantri] = useState("");
  const [kelasIdSantri, setKelasIdSantri] = useState(kelasList[0]?.id ?? "");
  const [kamarIdSantri, setKamarIdSantri] = useState(kamarList[0]?.id ?? "");
  const [namaWali, setNamaWali] = useState("");
  const [hubunganWali, setHubunganWali] = useState<"Ayah" | "Ibu" | "Wali">("Ayah");
  const [teleponWali, setTeleponWali] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  // State Pemindahan Kelas & Kamar Santri
  const [moveSantriId, setMoveSantriId] = useState("");
  const [moveNewKelasId, setMoveNewKelasId] = useState("");
  const [moveNewKamarId, setMoveNewKamarId] = useState("");
  const [moveAlasan, setMoveAlasan] = useState("");
  const [moveSubmitting, setMoveSubmitting] = useState(false);

  // State Modal Tambah/Edit Kelas & Kamar
  const [modalKelasOpen, setModalKelasOpen] = useState(false);
  const [editingKelas, setEditingKelas] = useState<Kelas | null>(null);
  const [namaKelasInput, setNamaKelasInput] = useState("");
  const [tingkatKelasInput, setTingkatKelasInput] = useState("7");
  const [kodeKelasInput, setKodeKelasInput] = useState("");

  const [modalKamarOpen, setModalKamarOpen] = useState(false);
  const [editingKamar, setEditingKamar] = useState<Kamar | null>(null);
  const [namaKamarInput, setNamaKamarInput] = useState("");
  const [kodeKamarInput, setKodeKamarInput] = useState("");
  const [kapasitasKamarInput, setKapasitasKamarInput] = useState(20);

  // Detail Santri Modal
  const [detailSantri, setDetailSantri] = useState<Santri | null>(null);

  // Filtered Santri List
  const filteredSantri = useMemo(() => {
    return santriList.filter((s) => {
      const matchQuery =
        s.nama_lengkap.toLowerCase().includes(santriSearch.toLowerCase()) ||
        s.nis.includes(santriSearch);
      const matchKelas = filterKelas === "all" || s.kelas_id === filterKelas;
      const matchKamar = filterKamar === "all" || s.kamar_id === filterKamar;
      const matchStatus = filterStatus === "all" || s.status === filterStatus;
      return matchQuery && matchKelas && matchKamar && matchStatus;
    });
  }, [santriList, santriSearch, filterKelas, filterKamar, filterStatus]);

  // Handle Pemindahan Santri (Pindah Kelas & Kamar)
  const handleMovePlacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveSantriId) {
      setFeedback({ ok: false, text: "Silakan pilih santri yang akan dipindahkan." });
      return;
    }
    const currentSantri = santriList.find((s) => s.id === moveSantriId);
    if (!currentSantri) return;

    const targetKelas = moveNewKelasId || currentSantri.kelas_id;
    const targetKamar = moveNewKamarId || currentSantri.kamar_id;

    if (targetKelas === currentSantri.kelas_id && targetKamar === currentSantri.kamar_id) {
      setFeedback({
        ok: false,
        text: "Kelas dan kamar tujuan tidak boleh sama dengan penempatan saat ini.",
      });
      return;
    }

    setMoveSubmitting(true);
    try {
      const res = await moveSantriPlacement({
        santri_id: moveSantriId,
        kelas_baru_id: targetKelas,
        kamar_baru_id: targetKamar,
        keterangan: moveAlasan.trim() || "Pemindahan santri oleh Tata Usaha (TU)",
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setMoveSantriId("");
        setMoveAlasan("");
      }
    } finally {
      setMoveSubmitting(false);
    }
  };

  // Handle Submit Registrasi Santri Baru
  const handleRegisterSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nis.trim() || !namaSantri.trim() || !namaWali.trim() || !teleponWali.trim()) {
      setFeedback({ ok: false, text: "Harap lengkapi semua kolom wajib bertanda bintang (*)." });
      return;
    }

    setRegisterSubmitting(true);
    try {
      const res = await createSantriWithWali({
        nis: nis.trim(),
        nama_lengkap: namaSantri.trim(),
        tempat_lahir: tempatLahir.trim(),
        tanggal_lahir: tanggalLahir,
        jenis_kelamin: jenisKelamin,
        alamat: alamatSantri.trim() || "Pondok Pesantren Modern Abu Manshur",
        tahun_masuk: 2026,
        kelas_id: kelasIdSantri || kelasList[0]?.id || "",
        kamar_id: kamarIdSantri || kamarList[0]?.id || "",
        nama_wali: namaWali.trim(),
        hubungan_wali: hubunganWali,
        telepon_wali: teleponWali.trim(),
        username_wali: nis.trim(),
        password_wali: nis.trim(),
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setNamaSantri("");
        setNamaWali("");
        setTeleponWali("");
        setAlamatSantri("");
        const nextNum = parseInt(nis.slice(-3) || "100") + 1;
        setNis(`202607${nextNum.toString().padStart(3, "0")}`);
      }
    } finally {
      setRegisterSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Portal Tata Usaha (TU) */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-950 via-indigo-900 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-500/20 px-2.5 py-0.5 text-xs font-bold text-blue-200 border border-blue-400/30">
                Administrasi Pesantren
              </span>
              <span className="text-xs text-blue-200">• Tahun Ajaran 2026/2027</span>
            </div>
            <h2 className="text-xl font-extrabold mt-1 tracking-tight">
              Portal Tata Usaha (TU)
            </h2>
            <p className="mt-0.5 text-xs text-blue-100/90 leading-relaxed">
              Pengelolaan master data santri, akun wali santri (1:1), master kelas, master kamar asrama,
              serta pencatatan mutasi/perpindahan kelas dan asrama santri.
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

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-700" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-bold underline ml-4 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* =====================================================================
          TAB 0: DASHBOARD TATA USAHA (TU)
         ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="block text-xs font-semibold text-slate-500">Total Santri Terdaftar</span>
              <span className="text-2xl font-black text-slate-900">{santriList.length}</span>
              <span className="block text-[11px] text-emerald-600 font-bold mt-1">
                {santriList.filter((s) => s.status === "AKTIF").length} Santri Aktif
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="block text-xs font-semibold text-slate-500">Kelas Pendidikan</span>
              <span className="text-2xl font-black text-blue-900">{kelasList.length}</span>
              <span className="block text-[11px] text-slate-500 font-medium mt-1">Ruang Kelas Aktif</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="block text-xs font-semibold text-slate-500">Kamar Asrama</span>
              <span className="text-2xl font-black text-indigo-900">{kamarList.length}</span>
              <span className="block text-[11px] text-slate-500 font-medium mt-1">Asrama Putra &amp; Putri</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="block text-xs font-semibold text-slate-500">Riwayat Penempatan</span>
              <span className="text-2xl font-black text-amber-900">{riwayatPenempatan.length}</span>
              <span className="block text-[11px] text-amber-700 font-bold mt-1">Mutasi Tercatat</span>
            </div>
          </div>

          {/* Quick Actions & Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Tambah Data Santri</h3>
                  <p className="text-xs text-slate-500">Pendaftaran baru &amp; Import Excel</p>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Daftarkan santri baru lengkap dengan akun wali mandiri (1:1) tanpa memerlukan email publik.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("tambah_santri")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Buka Menu Registrasi</span>
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Kelas &amp; Kamar</h3>
                  <p className="text-xs text-slate-500">Master &amp; Pemindahan Santri</p>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Pindahkan santri antar-kelas atau antar-kamar dengan pencatatan audit log riwayat mutasi otomatis.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("kelas_kamar");
                  setKelasKamarSubTab("pindah");
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Pindah Kelas &amp; Kamar</span>
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Database Santri &amp; Wali</h3>
                  <p className="text-xs text-slate-500">Pencarian &amp; Ekspor Data</p>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Lihat daftar seluruh santri, informasi kontak wali, unduh rekapitulasi data Excel/CSV resmi.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("santri_wali")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Kelola Data Santri</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: TAMBAH DATA SANTRI (FORMULIR REGISTRASI & IMPORT EXCEL)
         ===================================================================== */}
      {activeTab === "tambah_santri" && (
        <div className="space-y-5">
          {/* Internal Subtabs */}
          <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2">
            <button
              type="button"
              onClick={() => setTambahSantriSubTab("registrasi")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                tambahSantriSubTab === "registrasi"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span>(A) Formulir Registrasi Santri Baru</span>
            </button>
            <button
              type="button"
              onClick={() => setTambahSantriSubTab("import")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                tambahSantriSubTab === "import"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>(B) Import Data Santri Massal (Excel)</span>
            </button>
          </div>

          {tambahSantriSubTab === "registrasi" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Registrasi Santri Baru &amp; Akun Wali Mandiri
                  </h3>
                  <p className="text-xs text-slate-500">
                    Akun wali santri akan dibuat secara otomatis menggunakan nomor <strong>NIS</strong> sebagai username dan kata sandi awal (bebas email).
                  </p>
                </div>
              </div>

              <form onSubmit={handleRegisterSantri} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Data Santri */}
                  <div className="space-y-4">
                    <h4 className="font-extrabold text-xs text-blue-900 uppercase tracking-wider">
                      1. Identitas Santri
                    </h4>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nomor Induk Santri (NIS) *
                      </label>
                      <input
                        type="text"
                        required
                        value={nis}
                        onChange={(e) => setNis(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none min-h-[42px]"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        NIS digunakan sebagai identitas login utama akun wali santri.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nama Lengkap Santri *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="contoh: Muhammad Rayhan Al-Fatih"
                        value={namaSantri}
                        onChange={(e) => setNamaSantri(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[42px]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Tempat Lahir *
                        </label>
                        <input
                          type="text"
                          required
                          value={tempatLahir}
                          onChange={(e) => setTempatLahir(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 min-h-[42px]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Tanggal Lahir *
                        </label>
                        <input
                          type="date"
                          required
                          value={tanggalLahir}
                          onChange={(e) => setTanggalLahir(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 min-h-[42px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Jenis Kelamin *
                        </label>
                        <select
                          value={jenisKelamin}
                          onChange={(e) => setJenisKelamin(e.target.value as "L" | "P")}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                        >
                          <option value="L">Laki-laki (Ikhwan)</option>
                          <option value="P">Perempuan (Akhwat)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Alamat Asal Santri
                        </label>
                        <input
                          type="text"
                          placeholder="Kota / Kabupaten asal"
                          value={alamatSantri}
                          onChange={(e) => setAlamatSantri(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 min-h-[42px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Kelas Awal *
                        </label>
                        <select
                          value={kelasIdSantri}
                          onChange={(e) => setKelasIdSantri(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                        >
                          {kelasList.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nama_kelas} ({k.kode_kelas})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Kamar Asrama *
                        </label>
                        <select
                          value={kamarIdSantri}
                          onChange={(e) => setKamarIdSantri(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                        >
                          {kamarList.map((km) => (
                            <option key={km.id} value={km.id}>
                              {km.nama_kamar} ({km.kode_kamar})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Data Wali */}
                  <div className="space-y-4">
                    <h4 className="font-extrabold text-xs text-blue-900 uppercase tracking-wider">
                      2. Identitas Orang Tua / Wali
                    </h4>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nama Lengkap Orang Tua / Wali *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="contoh: H. Syarif Hidayatullah"
                        value={namaWali}
                        onChange={(e) => setNamaWali(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[42px]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Hubungan Wali *
                        </label>
                        <select
                          value={hubunganWali}
                          onChange={(e) => setHubunganWali(e.target.value as "Ayah" | "Ibu" | "Wali")}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                        >
                          <option value="Ayah">Ayah Kandung</option>
                          <option value="Ibu">Ibu Kandung</option>
                          <option value="Wali">Wali / Keluarga</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nomor Telepon / WhatsApp *
                        </label>
                        <input
                          type="tel"
                          required
                          placeholder="contoh: 081234567890"
                          value={teleponWali}
                          onChange={(e) => setTeleponWali(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 min-h-[42px]"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 mt-2">
                      <span className="block text-xs font-bold text-slate-800">
                        Kredensial Login Wali Otomatis:
                      </span>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Username:</span>
                        <strong className="font-mono text-blue-900">{nis || "Sesuai NIS"}</strong>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Kata Sandi Awal:</span>
                        <strong className="font-mono text-blue-900">{nis || "Sesuai NIS"}</strong>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        * Wali santri wajib mengganti kata sandi awal saat login pertama kali.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={registerSubmitting}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[44px] cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {registerSubmitting ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    <span>Simpan &amp; Terbitkan Akun Santri</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Import Excel View */
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Import Data Santri Massal dari Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gunakan template resmi untuk mengunggah ratusan santri dan menerbitkan akun wali secara atomik.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadSantriImportTemplate}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition min-h-[40px] cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Unduh Template Excel (.xlsx)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-500 transition bg-slate-50/50">
                <UploadCloud className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">
                  Pilih berkas Excel (.xlsx / .xls) untuk diunggah
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Maksimal ukuran file 5MB. Format kolom wajib sesuai template resmi.
                </p>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImportFile(file);
                    setImportParsing(true);
                    try {
                      const buffer = await file.arrayBuffer();
                      const rows = parseSantriExcel(buffer);
                      setImportRawRows(rows);
                      const existingNis = new Set(santriList.map((s) => s.nis));
                      const existingUsernames = new Set(santriList.map((s) => s.nis));
                      const validation = validateSantriImportRows(rows, kelasList, kamarList, existingNis, existingUsernames);
                      setImportValidation(validation);
                      setImportStep("PREVIEW");
                    } catch (err: any) {
                      setFeedback({ ok: false, text: `Gagal membaca file Excel: ${err.message}` });
                    } finally {
                      setImportParsing(false);
                    }
                  }}
                  className="mt-4 inline-block text-xs text-slate-500 cursor-pointer"
                />
              </div>

              {importParsing && (
                <div className="flex items-center justify-center gap-2 text-xs text-blue-700 py-3">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Memvalidasi baris data Excel...</span>
                </div>
              )}

              {importStep === "PREVIEW" && importValidation && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-slate-100 p-4">
                    <div className="text-xs space-y-1">
                      <span className="font-bold text-slate-800">Hasil Validasi Berkas:</span>
                      <div className="flex gap-4">
                        <span className="text-emerald-700 font-bold">
                          ✓ {importValidation.valid_count} Baris Siap Import
                        </span>
                        {importValidation.error_count > 0 && (
                          <span className="text-rose-700 font-bold">
                            ✕ {importValidation.error_count} Baris Ada Kesalahan
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={importExecuting || importValidation.valid_count === 0}
                      onClick={async () => {
                        setImportExecuting(true);
                        try {
                          const res = await importSantriBatch(importValidation.valid_rows);
                          if (res.ok && res.report) {
                            setImportReport(res.report);
                            setImportStep("RESULT");
                            setFeedback({ ok: true, text: res.message });
                          } else {
                            setFeedback({ ok: false, text: res.message });
                          }
                        } finally {
                          setImportExecuting(false);
                        }
                      }}
                      className="rounded-xl bg-blue-700 px-5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition disabled:opacity-50 min-h-[40px] cursor-pointer"
                    >
                      {importExecuting ? "Memproses Import..." : `Mulai Import (${importValidation.valid_count} Santri)`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: DATA SANTRI & AKUN WALI
         ===================================================================== */}
      {activeTab === "santri_wali" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1">
                <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama santri atau NIS..."
                  value={santriSearch}
                  onChange={(e) => setSantriSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 min-h-[40px] focus:outline-none focus:border-blue-600"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportSantriToExcel(filteredSantri, kelasList, kamarList, waliList)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 min-h-[40px] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor Excel</span>
              </button>
            </div>
          </div>

          {/* Tabel Santri */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                    <th className="py-3 px-3">NIS</th>
                    <th className="py-3 px-3">Nama Santri</th>
                    <th className="py-3 px-3">Kelas &amp; Kamar</th>
                    <th className="py-3 px-3">Wali Santri</th>
                    <th className="py-3 px-3">Kontak Wali</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSantri.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Tidak ada data santri yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredSantri.map((s) => {
                      const k = kelasList.find((x) => x.id === s.kelas_id);
                      const km = kamarList.find((x) => x.id === s.kamar_id);
                      const w = waliList.find((x) => x.santri_id === s.id);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{s.nis}</td>
                          <td className="py-3 px-3 font-bold text-slate-900">{s.nama_lengkap}</td>
                          <td className="py-3 px-3 text-slate-600">
                            <div>{k?.nama_kelas || "-"}</div>
                            <div className="text-[10px] text-slate-400">{km?.nama_kamar || "-"}</div>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-800">
                            {w?.nama_lengkap || <span className="text-amber-700 italic">Belum ada</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                            {w?.no_telepon || "-"}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                getStatusSantriBadge(s.status).className
                              }`}
                            >
                              {getStatusSantriBadge(s.status).label}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setDetailSantri(s)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50 cursor-pointer"
                            >
                              Detail
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
      )}

      {/* =====================================================================
          TAB 3: KELAS, KAMAR & PENEMPATAN SANTRI
         ===================================================================== */}
      {activeTab === "kelas_kamar" && (
        <div className="space-y-5">
          {/* Subtabs Kelas/Kamar */}
          <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2">
            <button
              type="button"
              onClick={() => setKelasKamarSubTab("kelas")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                kelasKamarSubTab === "kelas"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Master Kelas ({kelasList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setKelasKamarSubTab("kamar")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                kelasKamarSubTab === "kamar"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Master Kamar Asrama ({kamarList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setKelasKamarSubTab("pindah")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                kelasKamarSubTab === "pindah"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span>Pemindahan Santri</span>
            </button>
            <button
              type="button"
              onClick={() => setKelasKamarSubTab("riwayat")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                kelasKamarSubTab === "riwayat"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <History className="h-4 w-4" />
              <span>Riwayat Perpindahan ({riwayatPenempatan.length})</span>
            </button>
          </div>

          {/* Subtab Pindah Kelas/Kamar */}
          {kelasKamarSubTab === "pindah" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Formulir Pemindahan Kelas &amp; Kamar Santri
                </h3>
                <p className="text-xs text-slate-500">
                  Perpindahan kelas atau asrama akan memperbarui data santri secara konsisten dan otomatis dicatat pada riwayat penempatan santri dengan jejak audit.
                </p>
              </div>

              <form onSubmit={handleMovePlacement} className="max-w-2xl space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pilih Santri yang Dipindahkan *
                  </label>
                  <select
                    required
                    value={moveSantriId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setMoveSantriId(id);
                      const s = santriList.find((x) => x.id === id);
                      if (s) {
                        setMoveNewKelasId(s.kelas_id);
                        setMoveNewKamarId(s.kamar_id);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                  >
                    <option value="">-- Pilih Santri --</option>
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_lengkap} (NIS: {s.nis})
                      </option>
                    ))}
                  </select>
                </div>

                {moveSantriId && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-2">
                    <span className="font-bold text-slate-700">Penempatan Saat Ini:</span>
                    {(() => {
                      const s = santriList.find((x) => x.id === moveSantriId);
                      const k = kelasList.find((x) => x.id === s?.kelas_id);
                      const km = kamarList.find((x) => x.id === s?.kamar_id);
                      return (
                        <div className="grid grid-cols-2 gap-2 text-slate-600">
                          <div>
                            Kelas: <strong>{k?.nama_kelas || "-"}</strong>
                          </div>
                          <div>
                            Kamar: <strong>{km?.nama_kamar || "-"}</strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kelas Tujuan Baru *
                    </label>
                    <select
                      value={moveNewKelasId}
                      onChange={(e) => setMoveNewKelasId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                    >
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Kamar Asrama Baru *
                    </label>
                    <select
                      value={moveNewKamarId}
                      onChange={(e) => setMoveNewKamarId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[42px]"
                    >
                      {kamarList.map((km) => (
                        <option key={km.id} value={km.id}>
                          {km.nama_kamar}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alasan / Keterangan Perpindahan *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="contoh: Kenaikan tingkat kelas atau rotasi kamar asrama semester baru"
                    value={moveAlasan}
                    onChange={(e) => setMoveAlasan(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-900 min-h-[42px]"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={moveSubmitting || !moveSantriId}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[44px] cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {moveSubmitting ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-4 w-4" />
                    )}
                    <span>Proses Pemindahan Santri</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Subtab Riwayat Perpindahan */}
          {kelasKamarSubTab === "riwayat" && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Log Riwayat Perpindahan Kelas &amp; Kamar Santri
                  </h3>
                  <p className="text-xs text-slate-500">
                    Daftar seluruh rekam mutasi santri sejak penempatan awal hingga perpindahan terakhir.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                      <th className="py-3 px-4">Tanggal Efektif</th>
                      <th className="py-3 px-4">Santri</th>
                      <th className="py-3 px-4">Perpindahan Kelas</th>
                      <th className="py-3 px-4">Perpindahan Kamar</th>
                      <th className="py-3 px-4">Keterangan / Alasan</th>
                      <th className="py-3 px-4">Petugas Pencatat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {riwayatPenempatan.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada riwayat perpindahan santri yang tercatat.
                        </td>
                      </tr>
                    ) : (
                      riwayatPenempatan.map((r) => {
                        const s = santriList.find((x) => x.id === r.santri_id);
                        const kLama = kelasList.find((x) => x.id === r.kelas_lama_id);
                        const kBaru = kelasList.find((x) => x.id === r.kelas_baru_id);
                        const kmLama = kamarList.find((x) => x.id === r.kamar_lama_id);
                        const kmBaru = kamarList.find((x) => x.id === r.kamar_baru_id);

                        return (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 text-slate-600 font-mono">
                              {formatTanggal(r.tanggal_efektif || r.created_at)}
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {s?.nama_lengkap || "Santri"}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {kLama?.nama_kelas || "Penempatan Awal"} → <strong>{kBaru?.nama_kelas || "-"}</strong>
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {kmLama?.nama_kamar || "Penempatan Awal"} → <strong>{kmBaru?.nama_kamar || "-"}</strong>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{r.keterangan}</td>
                            <td className="py-3 px-4 text-slate-500 font-medium">{r.petugas_nama || "Petugas TU"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subtab Master Kelas */}
          {kelasKamarSubTab === "kelas" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Daftar Master Kelas</h3>
                  <p className="text-xs text-slate-500">Kelola ruang dan tingkat kelas santri</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingKelas(null);
                    setNamaKelasInput("");
                    setKodeKelasInput("");
                    setModalKelasOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[38px] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Kelas</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {kelasList.map((k) => {
                  const studentCount = santriList.filter((s) => s.kelas_id === k.id && s.status === "AKTIF").length;
                  return (
                    <div key={k.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                          {k.kode_kelas}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">{studentCount} Santri Aktif</span>
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-900">{k.nama_kelas}</h4>
                      <p className="text-[11px] text-slate-500">Tingkat {k.tingkat}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtab Master Kamar */}
          {kelasKamarSubTab === "kamar" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Daftar Master Kamar Asrama</h3>
                  <p className="text-xs text-slate-500">Kelola kamar asrama santri putra dan putri</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingKamar(null);
                    setNamaKamarInput("");
                    setKodeKamarInput("");
                    setModalKamarOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[38px] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Kamar</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {kamarList.map((km) => {
                  const occupants = santriList.filter((s) => s.kamar_id === km.id && s.status === "AKTIF").length;
                  return (
                    <div key={km.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded">
                          {km.kode_kamar}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">
                          {occupants} / {km.kapasitas} Santri
                        </span>
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-900">{km.nama_kamar}</h4>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className="bg-indigo-600 h-full rounded-full"
                          style={{ width: `${Math.min(100, (occupants / km.kapasitas) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: PENGUMUMAN PESANTREN
         ===================================================================== */}
      {activeTab === "pengumuman" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Pengumuman &amp; Agenda Santri</h3>
            <p className="text-xs text-slate-500">
              Daftar pengumuman yang diterbitkan untuk santri dan wali santri.
            </p>
          </div>
          <div className="space-y-3">
            {pengumumanList.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-4 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-bold text-blue-900 uppercase">Kategori: {p.kategori}</span>
                  <span>{formatTanggal(p.tanggal_publikasi)}</span>
                </div>
                <h4 className="font-extrabold text-sm text-slate-900">{p.judul}</h4>
                <p className="text-xs text-slate-600 leading-relaxed">{p.isi}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal Santri */}
    </div>
  );
}
