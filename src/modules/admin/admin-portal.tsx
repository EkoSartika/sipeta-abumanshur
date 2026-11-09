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
  Info,
  Landmark,
  Megaphone,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
  formatTanggal,
  formatWaktuLengkap,
  getKebijakanCicilanLabel,
  getStatusSantriBadge,
  getStatusTagihanBadge,
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
  KebijakanCicilan,
  Kelas,
  StatusSantri,
  Tagihan,
} from "@/types/database";

type AdminTab =
  | "santri_wali"
  | "import_santri"
  | "kelas_kamar"
  | "rekening_pesantren"
  | "jenis_dan_tagihan"
  | "pengumuman";

export function AdminPortal() {
  const {
    currentUser,
    users,
    santriList,
    waliList,
    kelasList,
    kamarList,
    riwayatPenempatan,
    jenisPembayaranList,
    tagihanList,
    riwayatPenyesuaianTagihan,
    pengumumanList,
    rekeningResmi,
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
    generateTagihan,
    adjustTagihan,
    createPengumuman,
    updateRekeningResmi,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<AdminTab>("santri_wali");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State Form Rekening Resmi Pesantren (Kewenangan Admin Administrasi Sesuai Bagian D)
  const [namaBankAdmin, setNamaBankAdmin] = useState(rekeningResmi.nama_bank);
  const [kodeBankAdmin, setKodeBankAdmin] = useState(rekeningResmi.kode_bank);
  const [nomorRekeningAdmin, setNomorRekeningAdmin] = useState(rekeningResmi.nomor_rekening);
  const [atasNamaAdmin, setAtasNamaAdmin] = useState(rekeningResmi.atas_nama);
  const [catatanInstruksiAdmin, setCatatanInstruksiAdmin] = useState(rekeningResmi.catatan_instruksi);

  // State Import Data Santri Excel (6 Langkah)
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

  // Selection Santri untuk Aksi Massal (Hapus & Ekspor Terpilih)
  const [selectedSantriIds, setSelectedSantriIds] = useState<string[]>([]);
  const [isDeleteSantriModalOpen, setIsDeleteSantriModalOpen] = useState(false);
  const [deleteSantriSubmitting, setDeleteSantriSubmitting] = useState(false);

  // State Penyesuaian Tagihan (Bab 5.3 PRD)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [targetTagihanAdjust, setTargetTagihanAdjust] = useState<Tagihan | null>(null);
  const [adjustNominalBaru, setAdjustNominalBaru] = useState<number>(0);
  const [adjustAlasan, setAdjustAlasan] = useState<string>("");

  // State form registrasi santri + akun wali 1:1
  const [nis, setNis] = useState("202607099");
  const [namaSantri, setNamaSantri] = useState("");
  const [tempatLahir, setTempatLahir] = useState("Cirebon");
  const [tanggalLahir, setTanggalLahir] = useState("2013-06-15");
  const [jenisKelamin, setJenisKelamin] = useState<"L" | "P">("L");
  const [alamatSantri, setAlamatSantri] = useState("");
  const [kelasIdSantri, setKelasIdSantri] = useState(kelasList[0]?.id ?? "kls-7a");
  const [kamarIdSantri, setKamarIdSantri] = useState(kamarList[0]?.id ?? "kmr-ab-01");
  const [namaWali, setNamaWali] = useState("");
  const [hubunganWali, setHubunganWali] = useState<"Ayah" | "Ibu" | "Wali">("Ayah");
  const [teleponWali, setTeleponWali] = useState("");
  const [usernameWali, setUsernameWali] = useState("");
  const [passwordWali, setPasswordWali] = useState("");
  const [emailKontakWali, setEmailKontakWali] = useState("");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  // Master Kelas & Kamar Modals
  const [editKelasItem, setEditKelasItem] = useState<Kelas | null>(null);
  const [editKelasNama, setEditKelasNama] = useState("");
  const [editKelasKode, setEditKelasKode] = useState("");
  const [editKelasWali, setEditKelasWali] = useState("");
  const [editKelasKapasitas, setEditKelasKapasitas] = useState(30);
  const [deleteKelasConfirm, setDeleteKelasConfirm] = useState<Kelas | null>(null);
  const [masterSubmitting, setMasterSubmitting] = useState(false);

  const [editKamarItem, setEditKamarItem] = useState<Kamar | null>(null);
  const [editKamarNama, setEditKamarNama] = useState("");
  const [editKamarKode, setEditKamarKode] = useState("");
  const [editKamarGedung, setEditKamarGedung] = useState("");
  const [editKamarMusyrif, setEditKamarMusyrif] = useState("");
  const [editKamarKapasitas, setEditKamarKapasitas] = useState(16);
  const [deleteKamarConfirm, setDeleteKamarConfirm] = useState<Kamar | null>(null);

  // State form pindah kelas/kamar santri
  const [moveSantriId, setMoveSantriId] = useState(santriList[0]?.id ?? "snt-001");
  const [moveKelasId, setMoveKelasId] = useState(kelasList[0]?.id ?? "kls-7a");
  const [moveKamarId, setMoveKamarId] = useState(kamarList[1]?.id ?? "kmr-um-02");
  const [moveKeterangan, setMoveKeterangan] = useState(
    "Pemindahan penempatan kamar/kelas evaluasi semester"
  );

  // State form tambah kelas & kamar
  const [kodeKelasBaru, setKodeKelasBaru] = useState("KLS-9A");
  const [namaKelasBaru, setNamaKelasBaru] = useState("Kelas IX-A (MTs Putra)");
  const [waliKelasBaru, setWaliKelasBaru] = useState("Ustadz H. Abdurrahman, M.Pd.");

  const [kodeKamarBaru, setKodeKamarBaru] = useState("ASR-UT-03");
  const [namaKamarBaru, setNamaKamarBaru] = useState("Kamar Utsman bin Affan 03");
  const [gedungKamarBaru, setGedungKamarBaru] = useState("Gedung Putra Al-Faruq");
  const [musyrifBaru, setMusyrifBaru] = useState("Ustadz Bilal Rabbani");

  // State form jenis pembayaran & kebijakan cicilan
  const [kodeBayar, setKodeBayar] = useState("UJN-GANJIL-2026");
  const [namaBayar, setNamaBayar] = useState("Biaya Imtihan & Ujian Semester Ganjil 2026/2027");
  const [kategoriBayar, setKategoriBayar] = useState("Biaya Ujian");
  const [nominalBayar, setNominalBayar] = useState("450000");
  const [kebijakanCicilan, setKebijakanCicilan] =
    useState<KebijakanCicilan>("MINIMAL_NOMINAL");
  const [minimalCicilan, setMinimalCicilan] = useState("200000");

  // State form generate tagihan
  const [genJenisId, setGenJenisId] = useState(jenisPembayaranList[0]?.id ?? "jp-spp-nov");
  const [genPeriodeLabel, setGenPeriodeLabel] = useState("Desember 2026");
  const [genJatuhTempo, setGenJatuhTempo] = useState("2026-12-15");
  const [genTargetMode, setGenTargetMode] = useState<"SEMUA" | "KELAS" | "KAMAR" | "SANTRI">(
    "SEMUA"
  );
  const [genTargetId, setGenTargetId] = useState(kelasList[0]?.id ?? "kls-7a");

  // State form pengumuman
  const [judulPengumuman, setJudulPengumuman] = useState("");
  const [kategoriPengumuman, setKategoriPengumuman] =
    useState<"Umum" | "Akademik" | "Keuangan" | "Kegiatan Pesantren">("Kegiatan Pesantren");
  const [isiPengumuman, setIsiPengumuman] = useState("");

  // Filtered Santri List
  const filteredSantri = useMemo(() => {
    return santriList.filter((s) => {
      const q = santriSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.nama_lengkap.toLowerCase().includes(q) ||
        s.nis.toLowerCase().includes(q) ||
        s.alamat.toLowerCase().includes(q);

      const matchKelas = filterKelas === "all" || s.kelas_id === filterKelas;
      const matchKamar = filterKamar === "all" || s.kamar_id === filterKamar;
      const matchStatus = filterStatus === "all" || s.status === filterStatus;

      return matchSearch && matchKelas && matchKamar && matchStatus;
    });
  }, [santriList, santriSearch, filterKelas, filterKamar, filterStatus]);

  // Handler Pemilihan Santri
  const handleToggleSelectAll = () => {
    if (selectedSantriIds.length === filteredSantri.length && filteredSantri.length > 0) {
      setSelectedSantriIds([]);
    } else {
      setSelectedSantriIds(filteredSantri.map((s) => s.id));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedSantriIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Handler Ekspor Excel (.xlsx)
  const handleExportAll = () => {
    const listToExport = filteredSantri.length > 0 ? filteredSantri : santriList;
    const res = exportSantriToExcel(listToExport, kelasList, kamarList, waliList);
    if (res.ok) {
      setFeedback({
        ok: true,
        text: `Berhasil mengekspor ${res.count} data santri ke file Excel: ${res.filename}`,
      });
    } else {
      setFeedback({ ok: false, text: "Tidak ada data santri yang dapat diekspor." });
    }
  };

  const handleExportSelected = () => {
    if (selectedSantriIds.length === 0) {
      setFeedback({ ok: false, text: "Pilih santri terlebih dahulu untuk diekspor." });
      return;
    }
    const targetSantri = santriList.filter((s) => selectedSantriIds.includes(s.id));
    const res = exportSantriToExcel(targetSantri, kelasList, kamarList, waliList, "Data_Santri_Terpilih");
    if (res.ok) {
      setFeedback({
        ok: true,
        text: `Berhasil mengekspor ${res.count} data santri terpilih ke Excel: ${res.filename}`,
      });
    }
  };

  // Handler Hapus Santri Terpilih
  const handleConfirmDeleteSantri = async () => {
    if (selectedSantriIds.length === 0) return;
    setDeleteSantriSubmitting(true);
    try {
      const res = await deleteSantriBatch(selectedSantriIds);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setSelectedSantriIds([]);
        setIsDeleteSantriModalOpen(false);
      }
    } finally {
      setDeleteSantriSubmitting(false);
    }
  };

  // Handler Form Registrasi Santri Baru + Akun Wali (1:1)
  const handleRegisterSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanNis = nis.trim();
    // Kebijakan: Username Wali = NIS, Password Awal = NIS
    const cleanUser = normalizeUsername(usernameWali || cleanNis);
    const initialPwd = passwordWali || cleanNis;

    if (!isValidUsername(cleanUser)) {
      setFeedback({
        ok: false,
        text: "Username wali harus 3–30 karakter alfanumerik (huruf kecil, angka, titik, strip, atau garis bawah).",
      });
      return;
    }

    setRegisterSubmitting(true);
    try {
      const res = await createSantriWithWali({
        nis: cleanNis,
        nama_lengkap: namaSantri,
        tempat_lahir: tempatLahir,
        tanggal_lahir: tanggalLahir,
        jenis_kelamin: jenisKelamin,
        alamat: alamatSantri,
        tahun_masuk: 2026,
        kelas_id: kelasIdSantri,
        kamar_id: kamarIdSantri,
        nama_wali: namaWali,
        hubungan_wali: hubunganWali,
        telepon_wali: teleponWali,
        username_wali: cleanUser,
        password_wali: initialPwd,
        email_kontak_wali: emailKontakWali,
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setNamaSantri("");
        setNamaWali("");
        setUsernameWali("");
        setPasswordWali("");
        setEmailKontakWali("");
        setNis(`2026${Date.now().toString().slice(-4)}`);
      }
    } finally {
      setRegisterSubmitting(false);
    }
  };

  // Handlers Import Data Santri Excel (6 Langkah)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      setFeedback({ ok: false, text: "Format file harus berekstensi .xlsx atau .xls." });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFeedback({ ok: false, text: "Ukuran file terlalu besar (maksimal 10MB)." });
      return;
    }

    setImportFile(file);
    setImportParsing(true);
    setFeedback(null);
    try {
      const buffer = await file.arrayBuffer();
      const raw = parseSantriExcel(buffer);
      setImportRawRows(raw);

      const existingNisSet = new Set(santriList.map((s) => s.nis.trim()));
      const existingUsernameSet = new Set(
        users.filter((u) => u.username).map((u) => u.username!.toLowerCase().trim())
      );

      const summary = validateSantriImportRows(
        raw,
        kelasList,
        kamarList,
        existingNisSet,
        existingUsernameSet
      );
      setImportValidation(summary);
      setImportStep("PREVIEW");
      setFeedback({
        ok: summary.valid_count > 0,
        text: `File berhasil dibaca: ${summary.valid_count} baris valid, ${summary.error_count} baris bermasalah.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal membaca file Excel.";
      setFeedback({ ok: false, text: msg });
    } finally {
      setImportParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!importValidation || importValidation.valid_rows.length === 0) return;
    setImportExecuting(true);
    setImportStep("PROCESSING");
    try {
      const res = await importSantriBatch(importValidation.valid_rows);
      if (res.report) {
        setImportReport(res.report);
        setImportStep("RESULT");
        setFeedback({ ok: res.ok, text: res.message });
      } else {
        setFeedback({ ok: res.ok, text: res.message });
        setImportStep("PREVIEW");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses import.";
      setFeedback({ ok: false, text: msg });
      setImportStep("PREVIEW");
    } finally {
      setImportExecuting(false);
    }
  };

  const handleResetImport = () => {
    setImportFile(null);
    setImportRawRows([]);
    setImportValidation(null);
    setImportReport(null);
    setImportStep("UPLOAD");
    setImportFilterErrorOnly(false);
  };

  const getSantriCountInKelas = (kelasId: string) =>
    santriList.filter((s) => s.kelas_id === kelasId && s.status === "AKTIF").length;

  const getSantriCountInKamar = (kamarId: string) =>
    santriList.filter((s) => s.kamar_id === kamarId && s.status === "AKTIF").length;

  const handleOpenEditKelas = (k: Kelas) => {
    setEditKelasItem(k);
    setEditKelasNama(k.nama_kelas);
    setEditKelasKode(k.kode_kelas);
    setEditKelasWali(k.wali_kelas);
    setEditKelasKapasitas(k.kapasitas);
  };

  const handleSaveEditKelas = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKelasItem) return;
    setMasterSubmitting(true);
    try {
      const res = updateKelas(editKelasItem.id, {
        nama_kelas: editKelasNama,
        kode_kelas: editKelasKode,
        wali_kelas: editKelasWali,
        kapasitas: Number(editKelasKapasitas),
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setEditKelasItem(null);
      }
    } finally {
      setMasterSubmitting(false);
    }
  };

  const handleDeleteKelasSubmit = () => {
    if (!deleteKelasConfirm) return;
    setMasterSubmitting(true);
    try {
      const res = deleteKelas(deleteKelasConfirm.id);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDeleteKelasConfirm(null);
      }
    } finally {
      setMasterSubmitting(false);
    }
  };

  const handleOpenEditKamar = (km: Kamar) => {
    setEditKamarItem(km);
    setEditKamarNama(km.nama_kamar);
    setEditKamarKode(km.kode_kamar);
    setEditKamarGedung(km.gedung_asrama);
    setEditKamarMusyrif(km.musyrif);
    setEditKamarKapasitas(km.kapasitas);
  };

  const handleSaveEditKamar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKamarItem) return;
    setMasterSubmitting(true);
    try {
      const res = updateKamar(editKamarItem.id, {
        nama_kamar: editKamarNama,
        kode_kamar: editKamarKode,
        gedung_asrama: editKamarGedung,
        musyrif: editKamarMusyrif,
        kapasitas: Number(editKamarKapasitas),
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setEditKamarItem(null);
      }
    } finally {
      setMasterSubmitting(false);
    }
  };

  const handleDeleteKamarSubmit = () => {
    if (!deleteKamarConfirm) return;
    setMasterSubmitting(true);
    try {
      const res = deleteKamar(deleteKamarConfirm.id);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDeleteKamarConfirm(null);
      }
    } finally {
      setMasterSubmitting(false);
    }
  };

  const handleMovePlacement = (e: React.FormEvent) => {
    e.preventDefault();
    const res = moveSantriPlacement({
      santri_id: moveSantriId,
      kelas_baru_id: moveKelasId,
      kamar_baru_id: moveKamarId,
      keterangan: moveKeterangan,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleCreateJenisBayar = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createJenisPembayaran({
      kode_pembayaran: kodeBayar,
      nama_pembayaran: namaBayar,
      deskripsi: namaBayar,
      nominal: Number(nominalBayar),
      kategori: kategoriBayar,
      tahun_ajaran_id: "ta-2026-2027",
      periode_pembayaran: "Semester",
      tanggal_mulai: "2026-11-01",
      tanggal_jatuh_tempo: "2026-12-20",
      sasaran_santri: "SEMUA",
      kebijakan_cicilan: kebijakanCicilan,
      minimal_nominal_cicilan:
        kebijakanCicilan === "MINIMAL_NOMINAL" ? Number(minimalCicilan) : null,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleGenerateBills = (e: React.FormEvent) => {
    e.preventDefault();
    const res = generateTagihan({
      jenis_pembayaran_id: genJenisId,
      periode_label: genPeriodeLabel,
      tanggal_jatuh_tempo: genJatuhTempo,
      target_mode: genTargetMode,
      target_id: genTargetId,
    });
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleAdjustTagihanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetTagihanAdjust) return;
    const res = adjustTagihan({
      tagihan_id: targetTagihanAdjust.id,
      nominal_penyesuaian: Number(adjustNominalBaru),
      alasan_penyesuaian: adjustAlasan,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setAdjustModalOpen(false);
      setTargetTagihanAdjust(null);
    }
  };

  const handleCreatePengumuman = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createPengumuman({
      judul: judulPengumuman,
      kategori: kategoriPengumuman,
      isi: isiPengumuman,
      is_penting: true,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setJudulPengumuman("");
      setIsiPengumuman("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Admin Administrasi */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              Portal Administrasi Pesantren (Data Santri, Kelas/Kamar, & Tagihan)
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Sesuai Bab 3.2 PRD: Admin mengelola data santri, wali (1:1), kelas/kamar, jenis pembayaran,
              kebijakan cicilan, dan tagihan. Admin tidak berwenang mengesahkan pembayaran atau uang
              saku.
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

        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/15 pt-4">
          {[
            { id: "santri_wali", label: "Data Santri & Akun Wali (1:1)", icon: Users },
            { id: "import_santri", label: "Import Data Santri (Excel)", icon: FileSpreadsheet },
            { id: "kelas_kamar", label: "Kelas, Kamar & Riwayat Penempatan", icon: Building2 },
            { id: "rekening_pesantren", label: "Rekening Resmi Pesantren", icon: Landmark },
            {
              id: "jenis_dan_tagihan",
              label: "Jenis Pembayaran, Kebijakan Cicilan & Tagihan",
              icon: Receipt,
            },
            { id: "pengumuman", label: "Pengumuman Pesantren", icon: Megaphone },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as AdminTab);
                  setFeedback(null);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition ${
                  active
                    ? "bg-white text-slate-950 shadow-sm"
                    : "bg-white/10 text-slate-200 hover:bg-white/20"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
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
          TAB 1: DATA SANTRI & ORANG TUA/WALI (RELASI 1:1)
         ===================================================================== */}
      {activeTab === "santri_wali" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Daftar Santri Terdaftar &amp; Relasi 1:1 Akun Wali
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total: {santriList.length} santri ({filteredSantri.length} ditampilkan)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("import_santri");
                      setFeedback(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-sm transition"
                  >
                    <FileUp className="h-4 w-4" />
                    <span>Import Excel Santri</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportAll}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm transition"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Ekspor Data Santri (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* Filter & Pencarian Santri */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4 text-xs">
                <div className="relative sm:col-span-2 md:col-span-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={santriSearch}
                    onChange={(e) => setSantriSearch(e.target.value)}
                    placeholder="Cari NIS / Nama / Alamat..."
                    className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-2 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <select
                    value={filterKelas}
                    onChange={(e) => setFilterKelas(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
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
                  <select
                    value={filterKamar}
                    onChange={(e) => setFilterKamar(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="all">Semua Kamar</option>
                    {kamarList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama_kamar}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="all">Semua Status</option>
                    <option value="AKTIF">AKTIF</option>
                    <option value="CUTI">CUTI</option>
                    <option value="LULUS">LULUS</option>
                    <option value="PINDAH">PINDAH</option>
                    <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                  </select>
                </div>
              </div>

              {/* Action Bar Pemilihan & Aksi Massal */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-200">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="inline-flex items-center gap-1.5 font-bold text-slate-700 hover:text-emerald-700"
                  >
                    {selectedSantriIds.length > 0 &&
                    selectedSantriIds.length === filteredSantri.length ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                    <span>
                      {selectedSantriIds.length > 0 &&
                      selectedSantriIds.length === filteredSantri.length
                        ? "Batal Pilih Semua"
                        : "Pilih Semua Santri"}
                    </span>
                  </button>
                  {selectedSantriIds.length > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 text-[11px]">
                      {selectedSantriIds.length} dipilih
                    </span>
                  )}
                </div>

                {selectedSantriIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportSelected}
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Ekspor Terpilih ({selectedSantriIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDeleteSantriModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Hapus Terpilih</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSantriIds([])}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>

              {filteredSantri.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Tidak ada santri yang sesuai dengan filter pencarian.
                </div>
              ) : (
                <>
                  {/* Tampilan Kartu Khusus Mobile (< 768px) */}
                  <div className="grid grid-cols-1 gap-3 md:hidden">
                    {filteredSantri.map((s) => {
                      const kls = kelasList.find((k) => k.id === s.kelas_id);
                      const kmr = kamarList.find((k) => k.id === s.kamar_id);
                      const wali = waliList.find((w) => w.santri_id === s.id);
                      const badge = getStatusSantriBadge(s.status);
                      const isSelected = selectedSantriIds.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          className={`rounded-2xl border p-4 shadow-sm space-y-2.5 transition ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-50/30 ring-1 ring-emerald-500"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectOne(s.id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <div>
                                <span className="font-mono text-xs font-bold text-emerald-800">
                                  NIS: {s.nis}
                                </span>
                                <h4 className="text-sm font-extrabold text-slate-900">
                                  {s.nama_lengkap}
                                </h4>
                                <p className="text-[11px] text-slate-500">
                                  {s.tempat_lahir}, {formatTanggal(s.tanggal_lahir)}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1 text-slate-600">
                            <div>
                              <strong>Kelas &amp; Kamar:</strong> {kls?.nama_kelas || "-"} •{" "}
                              {kmr?.nama_kamar || "-"}
                            </div>
                            <div>
                              <strong>Orang Tua / Wali:</strong>{" "}
                              {wali ? (
                                <span className="font-semibold text-slate-800">
                                  {wali.nama_lengkap} ({wali.hubungan}) • {wali.no_telepon}
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold">Belum terhubung</span>
                              )}
                            </div>
                            {s.alamat && (
                              <div className="truncate text-[11px] text-slate-500">
                                <strong>Alamat:</strong> {s.alamat}
                              </div>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600">
                              Ubah Status:
                            </span>
                            <select
                              value={s.status}
                              onChange={(e) => {
                                const res = updateStatusSantri(s.id, e.target.value as StatusSantri);
                                setFeedback({ ok: res.ok, text: res.message });
                              }}
                              className={`rounded-xl px-3 py-2 text-xs font-bold min-h-[44px] ${badge.className}`}
                            >
                              <option value="AKTIF">AKTIF</option>
                              <option value="CUTI">CUTI</option>
                              <option value="LULUS">LULUS</option>
                              <option value="PINDAH">PINDAH</option>
                              <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tampilan Tabel Desktop (>= 768px) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                      <thead>
                        <tr className="border-b border-slate-200 uppercase text-slate-500">
                          <th className="py-2.5 px-3 w-8">
                            <input
                              type="checkbox"
                              checked={
                                selectedSantriIds.length > 0 &&
                                selectedSantriIds.length === filteredSantri.length
                              }
                              onChange={handleToggleSelectAll}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                          <th className="py-2.5 pr-3">NIS &amp; Nama Santri</th>
                          <th className="py-2.5 px-3">Kelas &amp; Kamar</th>
                          <th className="py-2.5 px-3">Akun Orang Tua/Wali (1:1)</th>
                          <th className="py-2.5 pl-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSantri.map((s) => {
                          const kls = kelasList.find((k) => k.id === s.kelas_id);
                          const kmr = kamarList.find((k) => k.id === s.kamar_id);
                          const wali = waliList.find((w) => w.santri_id === s.id);
                          const badge = getStatusSantriBadge(s.status);
                          const isSelected = selectedSantriIds.includes(s.id);
                          return (
                            <tr
                              key={s.id}
                              className={`hover:bg-slate-50/70 ${
                                isSelected ? "bg-emerald-50/40" : ""
                              }`}
                            >
                              <td className="py-3 px-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectOne(s.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-3 pr-3">
                                <div className="font-mono font-bold text-emerald-800">{s.nis}</div>
                                <div className="font-bold text-slate-900">{s.nama_lengkap}</div>
                                <div className="text-[11px] text-slate-500">
                                  {s.tempat_lahir}, {formatTanggal(s.tanggal_lahir)}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium text-slate-800">{kls?.nama_kelas}</div>
                                <div className="text-[11px] text-slate-500">{kmr?.nama_kamar}</div>
                              </td>
                              <td className="py-3 px-3">
                                {wali ? (
                                  <>
                                    <div className="font-semibold text-slate-800">
                                      {wali.nama_lengkap} ({wali.hubungan})
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {wali.no_telepon}
                                      {wali.email && ` • ${wali.email}`}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-rose-600 font-semibold">
                                    Belum terhubung
                                  </span>
                                )}
                              </td>
                              <td className="py-3 pl-3">
                                <select
                                  value={s.status}
                                  onChange={(e) => {
                                    const res = updateStatusSantri(
                                      s.id,
                                      e.target.value as StatusSantri
                                    );
                                    setFeedback({ ok: res.ok, text: res.message });
                                  }}
                                  className={`rounded-lg px-2 py-1 text-xs font-bold ${badge.className}`}
                                >
                                  <option value="AKTIF">AKTIF</option>
                                  <option value="CUTI">CUTI</option>
                                  <option value="LULUS">LULUS</option>
                                  <option value="PINDAH">PINDAH</option>
                                  <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form Registrasi Santri Baru + Akun Orang Tua (1:1) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Registrasi Santri Baru + Akun Wali (1:1)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Setiap santri baru otomatis dibuatkan 1 akun wali resmi dengan username dan password
              internal.
            </p>
            <form onSubmit={handleRegisterSantri} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">NIS (Unik)</label>
                  <input
                    type="text"
                    required
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Jenis Kelamin</label>
                  <select
                    value={jenisKelamin}
                    onChange={(e) => setJenisKelamin(e.target.value as "L" | "P")}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="L">Laki-laki (Putra)</option>
                    <option value="P">Perempuan (Putri)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nama Lengkap Santri</label>
                <input
                  type="text"
                  required
                  value={namaSantri}
                  onChange={(e) => setNamaSantri(e.target.value)}
                  placeholder="Contoh: Muhammad Rayyan Al-Fatih"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Tempat Lahir</label>
                  <input
                    type="text"
                    required
                    value={tempatLahir}
                    onChange={(e) => setTempatLahir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Tanggal Lahir</label>
                  <input
                    type="date"
                    required
                    value={tanggalLahir}
                    onChange={(e) => setTanggalLahir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Kelas Awal</label>
                  <select
                    value={kelasIdSantri}
                    onChange={(e) => setKelasIdSantri(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  >
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama_kelas}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Kamar Asrama</label>
                  <select
                    value={kamarIdSantri}
                    onChange={(e) => setKamarIdSantri(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                  >
                    {kamarList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama_kamar}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Alamat Lengkap Santri</label>
                <input
                  type="text"
                  required
                  value={alamatSantri}
                  onChange={(e) => setAlamatSantri(e.target.value)}
                  placeholder="Alamat domisili santri & wali"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {/* Bagian Akun Wali dengan Visual Pembeda */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2.5 mt-3">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-emerald-800" />
                  <p className="font-bold text-emerald-950">
                    Data Akun Orang Tua / Wali (Relasi 1:1)
                  </p>
                </div>
                <p className="text-[11px] text-emerald-800/90 leading-relaxed">
                  Sesuai kebijakan SIPETA: Wali login menggunakan <strong>Username</strong> dan{" "}
                  <strong>Password</strong> internal. Email tidak digunakan untuk login, hanya kontak
                  komunikasi alternatif.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Nama Orang Tua/Wali</label>
                    <input
                      type="text"
                      required
                      value={namaWali}
                      onChange={(e) => setNamaWali(e.target.value)}
                      placeholder="Contoh: H. Ahmad Fauzi"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Hubungan</label>
                    <select
                      value={hubunganWali}
                      onChange={(e) => setHubunganWali(e.target.value as "Ayah" | "Ibu" | "Wali")}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                    >
                      <option value="Ayah">Ayah</option>
                      <option value="Ibu">Ibu</option>
                      <option value="Wali">Wali</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">No. Telepon / WhatsApp</label>
                    <input
                      type="text"
                      required
                      value={teleponWali}
                      onChange={(e) => setTeleponWali(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Email Kontak (Opsional)</label>
                    <input
                      type="email"
                      value={emailKontakWali}
                      onChange={(e) => setEmailKontakWali(e.target.value)}
                      placeholder="wali@contoh.com"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-emerald-950">Username Login Wali</label>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Default = NIS
                      </span>
                    </div>
                    <input
                      type="text"
                      value={usernameWali || nis}
                      onChange={(e) => setUsernameWali(e.target.value.toLowerCase().trim())}
                      placeholder={nis || "Sesuai NIS Santri"}
                      className="mt-1 w-full rounded-lg border border-emerald-400 bg-white px-2.5 py-1.5 font-mono focus:border-emerald-600 focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Otomatis sama dengan NIS Santri ({nis || "-"}).
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-emerald-950">Password Awal Wali</label>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Default = NIS
                      </span>
                    </div>
                    <input
                      type="text"
                      value={passwordWali || nis}
                      onChange={(e) => setPasswordWali(e.target.value)}
                      placeholder={nis || "Sesuai NIS Santri"}
                      className="mt-1 w-full rounded-lg border border-emerald-400 bg-white px-2.5 py-1.5 font-mono focus:border-emerald-600 focus:outline-none"
                    />
                    <p className="mt-0.5 text-[10px] text-emerald-700 font-medium">
                      Wajib diganti saat wali login pertama kali (must_change_password).
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={registerSubmitting}
                className="w-full rounded-xl bg-emerald-700 py-2.5 font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition shadow-sm"
              >
                {registerSubmitting
                  ? "Menyimpan Data Santri & Akun Wali..."
                  : "Simpan Santri & Buat Akun Wali (1:1)"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB KHUSUS: IMPORT DATA SANTRI & OTOMATISASI AKUN WALI (EXCEL)
         ===================================================================== */}
      {activeTab === "import_santri" && (
        <div className="space-y-6">
          {/* Header Kartu Informasi Kebijakan Akun Wali */}
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-900 to-emerald-950 p-5 sm:p-6 text-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Sistem Import Santri &amp; Otomatisasi Akun Wali</span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Import Data Santri Massal (.xlsx / .xls)
                </h3>
                <p className="text-xs sm:text-sm text-emerald-100/80 max-w-2xl">
                  Setiap santri otomatis dibuatkan satu akun wali 1:1. Username dan password awal
                  menggunakan NIS santri (format teks). Wali diwajibkan mengganti password pada
                  saat pertama kali login (<strong>must_change_password</strong>).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={downloadSantriImportTemplate}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-950 shadow-md hover:bg-emerald-50 transition"
                >
                  <Download className="h-4 w-4 text-emerald-700" />
                  <span>Download Template Excel Resmi</span>
                </button>
              </div>
            </div>

            {/* Step Wizard Indicator */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-white/10 text-xs">
              <div
                className={`flex items-center gap-2 rounded-lg p-2 ${
                  importStep === "UPLOAD"
                    ? "bg-white/20 font-bold text-white"
                    : "text-emerald-300/70"
                }`}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  1
                </div>
                <span>Upload File Excel</span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg p-2 ${
                  importStep === "PREVIEW"
                    ? "bg-white/20 font-bold text-white"
                    : "text-emerald-300/70"
                }`}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  2
                </div>
                <span>Preview &amp; Validasi</span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg p-2 ${
                  importStep === "PROCESSING"
                    ? "bg-white/20 font-bold text-white"
                    : "text-emerald-300/70"
                }`}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  3
                </div>
                <span>Proses Pembuatan Akun</span>
              </div>
              <div
                className={`flex items-center gap-2 rounded-lg p-2 ${
                  importStep === "RESULT"
                    ? "bg-white/20 font-bold text-white"
                    : "text-emerald-300/70"
                }`}
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  4
                </div>
                <span>Laporan Hasil Import</span>
              </div>
            </div>
          </div>

          {/* STEP 1: UPLOAD */}
          {importStep === "UPLOAD" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="max-w-xl mx-auto text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">
                    Pilih File Excel Data Santri
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Gunakan template resmi SIPETA. Mendukung file <strong>.xlsx</strong> atau{" "}
                    <strong>.xls</strong> maksimal 10 MB.
                  </p>
                </div>

                <div className="relative mt-4">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileChange}
                    disabled={importParsing}
                    className="absolute inset-0 z-10 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50/70">
                    <FileSpreadsheet className="mx-auto h-10 w-10 text-emerald-600" />
                    <p className="mt-2 text-sm font-semibold text-emerald-950">
                      {importParsing
                        ? "Sedang membaca file & memvalidasi data..."
                        : "Klik untuk memilih file Excel atau seret file ke sini"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Sistem akan memvalidasi NIS, kelas, kamar, format tanggal, dan relasi 1:1 akun
                      wali
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-left space-y-2">
                  <p className="text-xs font-bold text-slate-800">
                    13 Kolom Wajib Pada Template Excel:
                  </p>
                  <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 list-decimal pl-4">
                    <li>NIS (Format Teks, angka 0 awal terjaga)</li>
                    <li>Nama Lengkap Santri</li>
                    <li>Jenis Kelamin (L / P)</li>
                    <li>Tempat Lahir</li>
                    <li>Tanggal Lahir (YYYY-MM-DD)</li>
                    <li>Kelas (Nama atau Kode)</li>
                    <li>Kode Kelas (Opsional pendukung)</li>
                    <li>Kamar Asrama (Nama atau Kode)</li>
                    <li>Nama Orang Tua/Wali</li>
                    <li>Hubungan Wali (Ayah / Ibu / Wali)</li>
                    <li>Nomor Telepon Wali (Min 8 digit)</li>
                    <li>Email Kontak (Opsional komunikasi)</li>
                    <li>Alamat Santri &amp; Wali</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & VALIDASI */}
          {importStep === "PREVIEW" && importValidation && (
            <div className="space-y-6">
              {/* Ringkasan Validasi Kartu Metrik */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-500">Total Baris</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {importValidation.total_rows}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-emerald-800">Data Valid</p>
                  <p className="mt-1 text-xl font-bold text-emerald-950">
                    {importValidation.valid_count}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-rose-800">Data Bermasalah</p>
                  <p className="mt-1 text-xl font-bold text-rose-950">
                    {importValidation.error_count}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-amber-800">NIS Duplikat File</p>
                  <p className="mt-1 text-xl font-bold text-amber-950">
                    {importValidation.duplicate_nis_in_file.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-purple-200 bg-purple-50 p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-purple-800">NIS Sudah Ada DB</p>
                  <p className="mt-1 text-xl font-bold text-purple-950">
                    {importValidation.already_registered_nis.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3.5 shadow-sm">
                  <p className="text-[11px] font-semibold text-sky-800">Kelas/Kamar Salah</p>
                  <p className="mt-1 text-xl font-bold text-sky-950">
                    {importValidation.kelas_not_found.length +
                      importValidation.kamar_not_found.length}
                  </p>
                </div>
              </div>

              {/* Rincian Kesalahan jika ada */}
              {importValidation.errors.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>Daftar Kesalahan Validasi ({importValidation.errors.length} masalah)</span>
                  </div>
                  <p className="text-xs text-rose-800 mt-0.5">
                    Baris dengan kesalahan tidak akan diimpor. Anda dapat memperbaiki file Excel
                    terlebih dahulu atau tetap melanjutkan import hanya untuk baris yang valid.
                  </p>

                  <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-rose-200 bg-white p-3 divide-y divide-rose-100 text-xs">
                    {importValidation.errors.map((err, idx) => (
                      <div key={idx} className="py-1.5 flex items-start gap-2">
                        <span className="font-mono font-bold text-rose-700 shrink-0">
                          Baris {err.row_number}
                        </span>
                        {err.nis && (
                          <span className="font-mono text-slate-500 shrink-0">({err.nis})</span>
                        )}
                        <span className="font-semibold text-slate-700 shrink-0">
                          [{err.column}]:
                        </span>
                        <span className="text-slate-600">{err.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview Tabel Baris */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Preview Data Excel ({importRawRows.length} Baris Terbaca)
                    </h4>
                    <p className="text-xs text-slate-500">
                      File: {importFile?.name} ({(importFile?.size ? importFile.size / 1024 : 0).toFixed(1)} KB)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportFilterErrorOnly(!importFilterErrorOnly)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        importFilterErrorOnly
                          ? "border-rose-400 bg-rose-50 text-rose-800"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>
                        {importFilterErrorOnly
                          ? "Menampilkan Baris Bermasalah"
                          : "Filter: Baris Bermasalah Saja"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">No.</th>
                        <th className="px-3 py-2">Status Validasi</th>
                        <th className="px-3 py-2">NIS</th>
                        <th className="px-3 py-2">Nama Santri</th>
                        <th className="px-3 py-2">L/P</th>
                        <th className="px-3 py-2">Kelas</th>
                        <th className="px-3 py-2">Kamar Asrama</th>
                        <th className="px-3 py-2">Wali (Akun 1:1)</th>
                        <th className="px-3 py-2">No. HP Wali</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {importRawRows
                        .map((row, idx) => {
                          const rowNum = idx + 2;
                          const rowErrors = importValidation.errors.filter(
                            (e) => e.row_number === rowNum
                          );
                          const isValid = rowErrors.length === 0;

                          if (importFilterErrorOnly && isValid) {
                            return null;
                          }

                          return (
                            <tr
                              key={idx}
                              className={isValid ? "hover:bg-slate-50/80" : "bg-rose-50/40"}
                            >
                              <td className="px-3 py-2 text-center font-mono text-slate-500">
                                {rowNum}
                              </td>
                              <td className="px-3 py-2">
                                {isValid ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Valid</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>{rowErrors.length} Kesalahan</span>
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-slate-900">
                                {row["NIS"] || row.nis || "-"}
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {row["Nama Lengkap Santri"] || row.nama_lengkap || "-"}
                              </td>
                              <td className="px-3 py-2">{row["Jenis Kelamin"] || row.jenis_kelamin || "-"}</td>
                              <td className="px-3 py-2">{row["Kelas"] || row.kelas || "-"}</td>
                              <td className="px-3 py-2">{row["Kamar Asrama"] || row.kamar || "-"}</td>
                              <td className="px-3 py-2">{row["Nama Orang Tua/Wali"] || row.nama_wali || "-"}</td>
                              <td className="px-3 py-2">{row["Nomor Telepon Wali"] || row.no_telepon_wali || "-"}</td>
                            </tr>
                          );
                        })
                        .filter(Boolean)}
                    </tbody>
                  </table>
                </div>

                {/* Toolbar Aksi Konfirmasi Batal / Lanjut */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={handleResetImport}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Batal &amp; Upload File Lain
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={importValidation.valid_count === 0 || importExecuting}
                      onClick={handleExecuteImport}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-emerald-800 disabled:opacity-50 transition"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        Lanjutkan &amp; Proses Import ({importValidation.valid_count} Baris Valid)
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {importStep === "PROCESSING" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm text-center space-y-4">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
              <h4 className="text-base font-bold text-slate-900">
                Sedang Memproses Data Santri &amp; Akun Wali...
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Sistem sedang membuat data santri, akun Supabase Auth wali berbasis NIS, relasi 1:1,
                dan mencatat audit log. Mohon jangan menutup browser.
              </p>
            </div>
          )}

          {/* STEP 4: HASIL IMPORT & LAPORAN */}
          {importStep === "RESULT" && importReport && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Proses Import Selesai</span>
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 mt-2">
                      Laporan Hasil Import Data Santri
                    </h3>
                    <p className="text-xs text-slate-500">
                      Waktu Eksekusi: {importReport.imported_at}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => downloadImportReportExcel(importReport)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 shadow-sm transition"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Laporan Hasil (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleResetImport();
                        setActiveTab("santri_wali");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm transition"
                    >
                      <Users className="h-4 w-4" />
                      <span>Selesai &amp; Buka Data Santri</span>
                    </button>
                  </div>
                </div>

                {/* Ringkasan Hasil */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">Total Diproses</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {importReport.total_processed}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-[11px] font-semibold text-emerald-800">Berhasil Dibuat</p>
                    <p className="mt-1 text-xl font-bold text-emerald-950">
                      {importReport.success_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-[11px] font-semibold text-rose-800">Gagal</p>
                    <p className="mt-1 text-xl font-bold text-rose-950">
                      {importReport.failed_count}
                    </p>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                    <p className="text-[11px] font-semibold text-sky-800">Akun Wali Dibuat</p>
                    <p className="mt-1 text-xl font-bold text-sky-950">
                      {importReport.wali_account_created_count}
                    </p>
                  </div>
                </div>

                {/* Tabel Hasil Per Baris */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                      <tr>
                        <th className="px-3 py-2 text-center w-12">Baris</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">NIS</th>
                        <th className="px-3 py-2">Nama Santri</th>
                        <th className="px-3 py-2">Akun Wali</th>
                        <th className="px-3 py-2">Keterangan / Pesan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {importReport.results.map((res, idx) => {
                        const isSuccess = res.status === "SUCCESS";
                        return (
                          <tr
                            key={idx}
                            className={isSuccess ? "hover:bg-slate-50/80" : "bg-rose-50/40"}
                          >
                            <td className="px-3 py-2 text-center font-mono text-slate-500">
                              {res.row_number}
                            </td>
                            <td className="px-3 py-2">
                              {isSuccess ? (
                                <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                  Sukses
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                  Gagal
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-slate-900">
                              {res.nis}
                            </td>
                            <td className="px-3 py-2 font-medium">{res.nama_lengkap}</td>
                            <td className="px-3 py-2">
                              {res.wali_username ? (
                                <span className="inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                                  Username: {res.wali_username}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {res.reason || (isSuccess ? "Berhasil disimpan" : "-")}
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
        </div>
      )}

      {/* =====================================================================
          TAB 2: KELAS, KAMAR, & RIWAYAT PENEMPATAN SANTRI (BAB 4.3 PRD)
         ===================================================================== */}
      {activeTab === "kelas_kamar" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Pindah Kelas / Kamar Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <ArrowRightLeft className="h-5 w-5 text-emerald-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Mutasi / Perpindahan Kelas & Kamar Santri
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sesuai Bab 4.3 PRD: Setiap perubahan penempatan santri tercatat dalam riwayat.
                  </p>
                </div>
              </div>
              <form onSubmit={handleMovePlacement} className="mt-4 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">Pilih Santri</label>
                  <select
                    value={moveSantriId}
                    onChange={(e) => setMoveSantriId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.nama_lengkap}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700">Kelas Baru</label>
                    <select
                      value={moveKelasId}
                      onChange={(e) => setMoveKelasId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Kamar Baru</label>
                    <select
                      value={moveKamarId}
                      onChange={(e) => setMoveKamarId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    >
                      {kamarList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kamar}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Alasan / Keterangan</label>
                  <input
                    type="text"
                    required
                    value={moveKeterangan}
                    onChange={(e) => setMoveKeterangan(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800"
                >
                  Simpan Perpindahan & Catat Riwayat
                </button>
              </form>
            </div>

            {/* Riwayat Penempatan Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Log Riwayat Penempatan Kelas & Kamar Santri ({riwayatPenempatan.length})
              </h3>
              <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto">
                {riwayatPenempatan.map((rw) => {
                  const s = santriList.find((x) => x.id === rw.santri_id);
                  const klsBaru = kelasList.find((x) => x.id === rw.kelas_baru_id);
                  const kmrBaru = kamarList.find((x) => x.id === rw.kamar_baru_id);
                  return (
                    <div
                      key={rw.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                    >
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>{s?.nama_lengkap}</span>
                        <span className="text-slate-500">{formatTanggal(rw.tanggal_efektif)}</span>
                      </div>
                      <p className="mt-1 text-emerald-800 font-medium">
                        Penempatan: {klsBaru?.nama_kelas} • {kmrBaru?.nama_kamar}
                      </p>
                      <p className="text-slate-600">{rw.keterangan}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Master Kelas & Kamar */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Master Data Kelas</h3>
                  <p className="text-xs text-slate-500">
                    Kelola data kelas. Kelas dengan santri aktif tidak dapat dihapus.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {kelasList.length} Kelas
                </span>
              </div>

              <div className="space-y-2.5">
                {kelasList.map((k) => {
                  const activeCount = getSantriCountInKelas(k.id);
                  return (
                    <div
                      key={k.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs transition hover:bg-slate-50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{k.nama_kelas}</span>
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                            {k.kode_kelas}
                          </span>
                        </div>
                        <div className="text-slate-500">Wali Kelas: {k.wali_kelas}</div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              activeCount > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {activeCount} Santri Aktif
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Kapasitas: {k.kapasitas} santri
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEditKelas(k)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-sm"
                        >
                          <Edit2 className="h-3 w-3 text-slate-500" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteKelasConfirm(k)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-sm"
                        >
                          <Trash2 className="h-3 w-3 text-rose-600" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const res = createKelas({
                    kode_kelas: kodeKelasBaru,
                    nama_kelas: namaKelasBaru,
                    tingkat: 9,
                    wali_kelas: waliKelasBaru,
                    kapasitas: 30,
                  });
                  setFeedback({ ok: res.ok, text: res.message });
                  if (res.ok) {
                    setNamaKelasBaru("");
                    setKodeKelasBaru(`KLS-${Date.now().toString().slice(-4)}`);
                  }
                }}
                className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 text-xs"
              >
                <input
                  type="text"
                  required
                  value={kodeKelasBaru}
                  onChange={(e) => setKodeKelasBaru(e.target.value)}
                  placeholder="Kode Kelas"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={namaKelasBaru}
                  onChange={(e) => setNamaKelasBaru(e.target.value)}
                  placeholder="Nama Kelas"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 font-bold text-white hover:bg-slate-800 transition"
                >
                  + Tambah Kelas
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Master Data Kamar Asrama</h3>
                  <p className="text-xs text-slate-500">
                    Kelola kamar asrama. Kamar yang dihuni santri aktif tidak dapat dihapus.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {kamarList.length} Kamar
                </span>
              </div>

              <div className="space-y-2.5">
                {kamarList.map((k) => {
                  const activeCount = getSantriCountInKamar(k.id);
                  return (
                    <div
                      key={k.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs transition hover:bg-slate-50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{k.nama_kamar}</span>
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                            {k.kode_kamar}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          {k.gedung_asrama} • Musyrif: {k.musyrif}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              activeCount > 0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {activeCount} Santri Menempati
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Kapasitas: {k.kapasitas} kasur
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEditKamar(k)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-sm"
                        >
                          <Edit2 className="h-3 w-3 text-slate-500" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteKamarConfirm(k)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-sm"
                        >
                          <Trash2 className="h-3 w-3 text-rose-600" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const res = createKamar({
                    kode_kamar: kodeKamarBaru,
                    nama_kamar: namaKamarBaru,
                    gedung_asrama: gedungKamarBaru,
                    jenis_asrama: "L",
                    musyrif: musyrifBaru,
                    kapasitas: 16,
                  });
                  setFeedback({ ok: res.ok, text: res.message });
                  if (res.ok) {
                    setNamaKamarBaru("");
                    setKodeKamarBaru(`ASR-${Date.now().toString().slice(-4)}`);
                  }
                }}
                className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 text-xs"
              >
                <input
                  type="text"
                  required
                  value={kodeKamarBaru}
                  onChange={(e) => setKodeKamarBaru(e.target.value)}
                  placeholder="Kode Kamar"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={namaKamarBaru}
                  onChange={(e) => setNamaKamarBaru(e.target.value)}
                  placeholder="Nama Kamar"
                  className="rounded-lg border border-slate-300 px-2.5 py-2 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-2 font-bold text-white hover:bg-slate-800 transition"
                >
                  + Tambah Kamar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: JENIS PEMBAYARAN, KEBIJAKAN CICILAN, & GENERATOR TAGIHAN
         ===================================================================== */}
      {activeTab === "jenis_dan_tagihan" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Buat Jenis Pembayaran & Kebijakan Cicilan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Tambah Jenis Pembayaran & Atur Kebijakan Cicilan (Bab 5.1 & 5.2 PRD)
              </h3>
              <form onSubmit={handleCreateJenisBayar} className="mt-3 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700">Kode Pembayaran</label>
                    <input
                      type="text"
                      required
                      value={kodeBayar}
                      onChange={(e) => setKodeBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Kategori</label>
                    <input
                      type="text"
                      required
                      value={kategoriBayar}
                      onChange={(e) => setKategoriBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Nama Pembayaran</label>
                  <input
                    type="text"
                    required
                    value={namaBayar}
                    onChange={(e) => setNamaBayar(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700">Nominal Tagihan (Rp)</label>
                    <input
                      type="number"
                      required
                      value={nominalBayar}
                      onChange={(e) => setNominalBayar(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Kebijakan Cicilan</label>
                    <select
                      value={kebijakanCicilan}
                      onChange={(e) => setKebijakanCicilan(e.target.value as KebijakanCicilan)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                    >
                      <option value="TIDAK_BOLEH">1. Tidak Boleh Dicicil</option>
                      <option value="MINIMAL_NOMINAL">
                        2. Boleh Dicicil dengan Nominal Minimum
                      </option>
                      <option value="BEBAS">3. Boleh Dicicil Tanpa Minimum Khusus</option>
                    </select>
                  </div>
                </div>
                {kebijakanCicilan === "MINIMAL_NOMINAL" && (
                  <div>
                    <label className="font-semibold text-slate-700">
                      Minimal Nominal Cicilan (Rp)
                    </label>
                    <input
                      type="number"
                      required
                      value={minimalCicilan}
                      onChange={(e) => setMinimalCicilan(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-bold"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800"
                >
                  Simpan Jenis Pembayaran
                </button>
              </form>
            </div>

            {/* Generator Tagihan Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Pembuatan Tagihan Santri (Massal / Kelas / Kamar / Individu)
              </h3>
              <p className="text-xs text-slate-500">
                Kebijakan cicilan akan disalin (snapshot) ke tagihan baru sehingga perubahan di
                masa depan tidak mengubah tagihan lama.
              </p>
              <form onSubmit={handleGenerateBills} className="mt-3 space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">Pilih Jenis Pembayaran</label>
                  <select
                    value={genJenisId}
                    onChange={(e) => setGenJenisId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {jenisPembayaranList.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nama_pembayaran} — {formatRupiah(j.nominal)} ({j.kebijakan_cicilan})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700">Periode Tagihan</label>
                    <input
                      type="text"
                      required
                      value={genPeriodeLabel}
                      onChange={(e) => setGenPeriodeLabel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Tanggal Jatuh Tempo</label>
                    <input
                      type="date"
                      required
                      value={genJatuhTempo}
                      onChange={(e) => setGenJatuhTempo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700">Sasaran Tagihan</label>
                    <select
                      value={genTargetMode}
                      onChange={(e) =>
                        setGenTargetMode(
                          e.target.value as "SEMUA" | "KELAS" | "KAMAR" | "SANTRI"
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                    >
                      <option value="SEMUA">Seluruh Santri Aktif</option>
                      <option value="KELAS">Berdasarkan Kelas</option>
                      <option value="KAMAR">Berdasarkan Kamar</option>
                      <option value="SANTRI">Santri Tertentu</option>
                    </select>
                  </div>
                  {genTargetMode !== "SEMUA" && (
                    <div>
                      <label className="font-semibold text-slate-700">Pilih Target</label>
                      <select
                        value={genTargetId}
                        onChange={(e) => setGenTargetId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                      >
                        {genTargetMode === "KELAS" &&
                          kelasList.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nama_kelas}
                            </option>
                          ))}
                        {genTargetMode === "KAMAR" &&
                          kamarList.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.nama_kamar}
                            </option>
                          ))}
                        {genTargetMode === "SANTRI" &&
                          santriList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.nama_lengkap} ({s.nis})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800"
                >
                  Terbitkan Tagihan Sekarang
                </button>
              </form>
            </div>
          </div>

          {/* Tabel Seluruh Tagihan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Tagihan Santri ({tagihanList.length})
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 uppercase text-slate-500">
                    <th className="py-2 pr-3">No. Tagihan</th>
                    <th className="py-2 px-3">Santri</th>
                    <th className="py-2 px-3">Tagihan & Kebijakan Cicilan</th>
                    <th className="py-2 px-3 text-right">Nominal</th>
                    <th className="py-2 px-3 text-right">Terbayar</th>
                    <th className="py-2 px-3 text-right">Sisa</th>
                    <th className="py-2 pl-3">Status</th>
                    <th className="py-2 pl-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tagihanList.map((t) => {
                    const s = santriList.find((x) => x.id === t.santri_id);
                    const b = getStatusTagihanBadge(t.status);
                    return (
                      <tr key={t.id}>
                        <td className="py-2.5 pr-3 font-mono font-bold text-slate-800">
                          {t.nomor_tagihan}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {s?.nama_lengkap}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{t.judul_tagihan}</div>
                          <div className="text-[11px] text-slate-500">
                            {getKebijakanCicilanLabel(
                              t.kebijakan_cicilan_snapshot,
                              t.minimal_cicilan_snapshot
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">{formatRupiah(t.nominal_tagihan)}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                          {formatRupiah(t.total_terbayar)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {formatRupiah(t.sisa_tagihan)}
                        </td>
                        <td className="py-2.5 pl-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.className}`}
                          >
                            {b.label}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {t.status !== "LUNAS" ? (
                            <button
                              type="button"
                              onClick={() => {
                                setTargetTagihanAdjust(t);
                                setAdjustNominalBaru(t.nominal_tagihan);
                                setAdjustAlasan("");
                                setAdjustModalOpen(true);
                              }}
                              className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200 hover:bg-amber-100"
                            >
                              Sesuaikan
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Tuntas</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Riwayat Penyesuaian Tagihan (Bab 5.3 PRD) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Audit Penyesuaian & Pembatalan Tagihan (Bab 5.3 PRD)
            </h3>
            <p className="text-xs text-slate-500">
              Setiap perubahan nilai kewajiban tagihan mencatat nilai sebelum, nilai sesudah,
              alasan perubahan, dan petugas.
            </p>
            {riwayatPenyesuaianTagihan.length === 0 ? (
              <p className="mt-3 text-xs text-slate-400 italic">
                Belum ada riwayat penyesuaian tagihan.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase text-slate-500">
                      <th className="py-2 pr-3">Waktu</th>
                      <th className="py-2 px-3">No. Tagihan</th>
                      <th className="py-2 px-3 text-right">Nominal Sebelum</th>
                      <th className="py-2 px-3 text-right">Nominal Sesudah</th>
                      <th className="py-2 px-3">Alasan Penyesuaian</th>
                      <th className="py-2 pl-3">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {riwayatPenyesuaianTagihan.map((r) => {
                      const tgh = tagihanList.find((t) => t.id === r.tagihan_id);
                      return (
                        <tr key={r.id}>
                          <td className="py-2 pr-3 text-slate-500">
                            {formatWaktuLengkap(r.created_at)}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-800">
                            {tgh?.nomor_tagihan ?? r.tagihan_id}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-700">
                            {formatRupiah(r.nominal_sebelum)}
                          </td>
                          <td className="py-2 px-3 text-right text-emerald-700 font-bold">
                            {formatRupiah(r.nominal_sesudah)}
                          </td>
                          <td className="py-2 px-3 text-slate-700 font-medium">
                            {r.alasan_penyesuaian}
                          </td>
                          <td className="py-2 pl-3 font-semibold text-slate-900">
                            {r.petugas_nama}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: PENGUMUMAN PESANTREN
         ===================================================================== */}
      {activeTab === "pengumuman" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Buat Pengumuman Baru</h3>
            <form onSubmit={handleCreatePengumuman} className="mt-3 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Judul Pengumuman</label>
                <input
                  type="text"
                  required
                  value={judulPengumuman}
                  onChange={(e) => setJudulPengumuman(e.target.value)}
                  placeholder="Contoh: Jadwal Penjemputan Libur Semester Ganjil"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Kategori</label>
                <select
                  value={kategoriPengumuman}
                  onChange={(e) =>
                    setKategoriPengumuman(
                      e.target.value as
                        | "Umum"
                        | "Akademik"
                        | "Keuangan"
                        | "Kegiatan Pesantren"
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="Umum">Umum</option>
                  <option value="Akademik">Akademik</option>
                  <option value="Keuangan">Keuangan</option>
                  <option value="Kegiatan Pesantren">Kegiatan Pesantren</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Isi Pengumuman</label>
                <textarea
                  rows={4}
                  required
                  value={isiPengumuman}
                  onChange={(e) => setIsiPengumuman(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Publikasikan ke Dashboard Orang Tua
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Pengumuman Aktif ({pengumumanList.length})
            </h3>
            {pengumumanList.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-3.5 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-emerald-800">{p.kategori}</span>
                  <span className="text-slate-400">{formatTanggal(p.tanggal_publikasi)}</span>
                </div>
                <h4 className="mt-1 font-bold text-slate-900">{p.judul}</h4>
                <p className="mt-1 text-slate-600">{p.isi}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB: REKENING RESMI TUNGGAL PESANTREN (KEWENANGAN ADMIN ADMINISTRASI)
         ===================================================================== */}
      {activeTab === "rekening_pesantren" && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
              <Landmark className="h-3.5 w-3.5" />
              <span>Pengelolaan Rekening Resmi Pesantren</span>
            </div>
            <h3 className="mt-2 text-base font-extrabold text-slate-900">
              Pengaturan Rekening Resmi Tunggal Pesantren
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin Administrasi berwenang mengelola rekening resmi pesantren. Seluruh pembayaran tagihan dan pengisian uang saku santri diarahkan ke rekening resmi ini.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const res = updateRekeningResmi({
                nama_bank: namaBankAdmin,
                kode_bank: kodeBankAdmin,
                nomor_rekening: nomorRekeningAdmin,
                atas_nama: atasNamaAdmin,
                catatan_instruksi: catatanInstruksiAdmin,
              });
              setFeedback({ ok: res.ok, text: res.message });
            }}
            className="space-y-3.5 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nama Bank</label>
                <input
                  type="text"
                  required
                  value={namaBankAdmin}
                  onChange={(e) => setNamaBankAdmin(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px] text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kode Bank</label>
                <input
                  type="text"
                  required
                  value={kodeBankAdmin}
                  onChange={(e) => setKodeBankAdmin(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px] text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Nomor Rekening Resmi</label>
              <input
                type="text"
                required
                value={nomorRekeningAdmin}
                onChange={(e) => setNomorRekeningAdmin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm font-bold min-h-[44px] text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Nomor rekening tunggal resmi pesantren (minimal 8 digit).
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Atas Nama Pemilik Rekening
              </label>
              <input
                type="text"
                required
                value={atasNamaAdmin}
                onChange={(e) => setAtasNamaAdmin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px] text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Instruksi Pembayaran</label>
              <textarea
                rows={3}
                required
                value={catatanInstruksiAdmin}
                onChange={(e) => setCatatanInstruksiAdmin(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white hover:bg-emerald-900 shadow min-h-[44px] touch-manipulation cursor-pointer inline-flex items-center gap-2"
              >
                <Landmark className="h-4 w-4" />
                <span>Simpan Rekening Resmi Pesantren</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL PENYESUAIAN / PEMBATALAN TAGIHAN (BAB 5.3 PRD) */}
      {adjustModalOpen && targetTagihanAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Penyesuaian / Pembatalan Tagihan Santri
              </h3>
              <p className="text-xs text-slate-500">
                Sesuai Bab 5.3 PRD: Penyesuaian mencatat nilai sebelum, nilai sesudah, alasan, dan
                petugas secara terperinci.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Tagihan:</span>
                <span className="font-mono font-bold text-slate-800">
                  {targetTagihanAdjust.nomor_tagihan}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deskripsi:</span>
                <span className="font-medium text-slate-900">
                  {targetTagihanAdjust.judul_tagihan}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nominal Saat Ini:</span>
                <span className="font-bold text-slate-800">
                  {formatRupiah(targetTagihanAdjust.nominal_tagihan)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Terbayar:</span>
                <span className="font-bold text-emerald-700">
                  {formatRupiah(targetTagihanAdjust.total_terbayar)}
                </span>
              </div>
            </div>

            <form onSubmit={handleAdjustTagihanSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">
                  Nominal Baru yang Disesuaikan (Rp)
                </label>
                <input
                  type="number"
                  min={targetTagihanAdjust.total_terbayar}
                  required
                  value={adjustNominalBaru}
                  onChange={(e) => setAdjustNominalBaru(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Nominal baru tidak boleh lebih kecil dari total yang sudah terbayar (
                  {formatRupiah(targetTagihanAdjust.total_terbayar)}). Masukkan 0 jika tagihan belum
                  pernah dicicil dan ingin dibatalkan.
                </p>
              </div>

              <div>
                <label className="font-semibold text-slate-700">
                  Alasan Penyesuaian / Pembatalan (Wajib diisi untuk Audit Log)
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  value={adjustAlasan}
                  onChange={(e) => setAdjustAlasan(e.target.value)}
                  placeholder="Contoh: Keringanan beasiswa tahfidz / Koreksi kesalahan input periode"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustModalOpen(false);
                    setTargetTagihanAdjust(null);
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800"
                >
                  Simpan Penyesuaian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: KONFIRMASI HAPUS SANTRI TERPILIH (SAFE DELETE POLICY)
         ===================================================================== */}
      {isDeleteSantriModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="rounded-xl bg-rose-100 p-2.5">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Penghapusan Data Santri
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSantriIds.length} data santri dipilih untuk dihapus
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 space-y-1.5 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 text-amber-950">
                <Info className="h-4 w-4 shrink-0" />
                Kebijakan Integritas Data &amp; Riwayat Keuangan SIPETA:
              </p>
              <p>
                Sistem secara otomatis memeriksa seluruh relasi data (tagihan, pembayaran cicilan,
                uang saku, dan tahfidz).
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  Santri yang <strong>sudah memiliki riwayat transaksi/catatan</strong> akan dialihkan
                  ke status <strong>TIDAK AKTIF (Soft Delete)</strong> agar catatan keuangan dan
                  audit log tetap valid dan tidak merusak laporan pembukuan.
                </li>
                <li>
                  Santri baru yang <strong>belum memiliki riwayat apa pun</strong> akan dihapus
                  permanen dari database.
                </li>
              </ul>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p className="font-bold text-slate-700 mb-1">Daftar Santri yang Dipilih:</p>
              {santriList
                .filter((s) => selectedSantriIds.includes(s.id))
                .slice(0, 6)
                .map((s) => (
                  <div key={s.id} className="text-slate-600">
                    • <strong>{s.nis}</strong> — {s.nama_lengkap}
                  </div>
                ))}
              {selectedSantriIds.length > 6 && (
                <div className="text-slate-500 italic">
                  ...dan {selectedSantriIds.length - 6} santri lainnya.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={deleteSantriSubmitting}
                onClick={() => setIsDeleteSantriModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteSantriSubmitting}
                onClick={handleConfirmDeleteSantri}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition shadow-sm"
              >
                {deleteSantriSubmitting ? "Memproses Penghapusan..." : "Ya, Hapus Data Terpilih"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: EDIT MASTER DATA KELAS
         ===================================================================== */}
      {editKelasItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-bold text-slate-900">Edit Data Kelas</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditKelasItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditKelas} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Kode Kelas</label>
                <input
                  type="text"
                  required
                  value={editKelasKode}
                  onChange={(e) => setEditKelasKode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nama Kelas</label>
                <input
                  type="text"
                  required
                  value={editKelasNama}
                  onChange={(e) => setEditKelasNama(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Wali Kelas</label>
                <input
                  type="text"
                  required
                  value={editKelasWali}
                  onChange={(e) => setEditKelasWali(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Kapasitas (Santri)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={editKelasKapasitas}
                  onChange={(e) => setEditKelasKapasitas(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={masterSubmitting}
                  onClick={() => setEditKelasItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={masterSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {masterSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: HAPUS MASTER DATA KELAS (PROTEKSI RELASI SANTRI AKTIF)
         ===================================================================== */}
      {deleteKelasConfirm && (() => {
        const activeCount = getSantriCountInKelas(deleteKelasConfirm.id);
        const isBlocked = activeCount > 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${isBlocked ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}`}>
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isBlocked ? "Kelas Tidak Dapat Dihapus" : "Konfirmasi Hapus Kelas"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {deleteKelasConfirm.nama_kelas} ({deleteKelasConfirm.kode_kelas})
                  </p>
                </div>
              </div>

              {isBlocked ? (
                <div className="rounded-xl bg-rose-50 p-3.5 text-xs text-rose-900 border border-rose-200 space-y-2 leading-relaxed">
                  <p className="font-bold">Penghapusan Diblokir demi Integritas Data:</p>
                  <p>
                    Saat ini masih ada <strong>{activeCount} santri aktif</strong> yang terdaftar di kelas
                    ini.
                  </p>
                  <p className="text-slate-600">
                    Silakan pindahkan santri ke kelas lain terlebih dahulu melalui menu{" "}
                    <strong>Mutasi / Perpindahan Penempatan</strong> sebelum menghapus kelas ini.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-600 space-y-2">
                  <p>
                    Apakah Anda yakin ingin menghapus kelas <strong>{deleteKelasConfirm.nama_kelas}</strong>?
                  </p>
                  <p className="text-slate-500">
                    Kelas ini tidak memiliki santri aktif dan aman untuk dihapus. Tindakan penghapusan
                    akan dicatat dalam audit log.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteKelasConfirm(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {isBlocked ? "Tutup" : "Batal"}
                </button>
                {!isBlocked && (
                  <button
                    type="button"
                    disabled={masterSubmitting}
                    onClick={handleDeleteKelasSubmit}
                    className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {masterSubmitting ? "Menghapus..." : "Ya, Hapus Kelas"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          MODAL: EDIT MASTER DATA KAMAR ASRAMA
         ===================================================================== */}
      {editKamarItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-bold text-slate-900">Edit Data Kamar Asrama</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditKamarItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditKamar} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Kode Kamar</label>
                <input
                  type="text"
                  required
                  value={editKamarKode}
                  onChange={(e) => setEditKamarKode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nama Kamar</label>
                <input
                  type="text"
                  required
                  value={editKamarNama}
                  onChange={(e) => setEditKamarNama(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Gedung Asrama</label>
                <input
                  type="text"
                  required
                  value={editKamarGedung}
                  onChange={(e) => setEditKamarGedung(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Musyrif / Pembina Kamar</label>
                <input
                  type="text"
                  required
                  value={editKamarMusyrif}
                  onChange={(e) => setEditKamarMusyrif(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Kapasitas (Kasur / Santri)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={editKamarKapasitas}
                  onChange={(e) => setEditKamarKapasitas(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={masterSubmitting}
                  onClick={() => setEditKamarItem(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={masterSubmitting}
                  className="rounded-xl bg-emerald-700 px-5 py-2 font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {masterSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: HAPUS MASTER DATA KAMAR (PROTEKSI RELASI SANTRI AKTIF)
         ===================================================================== */}
      {deleteKamarConfirm && (() => {
        const activeCount = getSantriCountInKamar(deleteKamarConfirm.id);
        const isBlocked = activeCount > 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${isBlocked ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}`}>
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isBlocked ? "Kamar Tidak Dapat Dihapus" : "Konfirmasi Hapus Kamar"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {deleteKamarConfirm.nama_kamar} ({deleteKamarConfirm.kode_kamar})
                  </p>
                </div>
              </div>

              {isBlocked ? (
                <div className="rounded-xl bg-rose-50 p-3.5 text-xs text-rose-900 border border-rose-200 space-y-2 leading-relaxed">
                  <p className="font-bold">Penghapusan Diblokir demi Integritas Data:</p>
                  <p>
                    Saat ini masih ada <strong>{activeCount} santri aktif</strong> yang menempati kamar
                    ini.
                  </p>
                  <p className="text-slate-600">
                    Silakan pindahkan santri ke kamar lain terlebih dahulu melalui menu{" "}
                    <strong>Mutasi / Perpindahan Penempatan</strong> sebelum menghapus kamar asrama ini.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-600 space-y-2">
                  <p>
                    Apakah Anda yakin ingin menghapus kamar <strong>{deleteKamarConfirm.nama_kamar}</strong>?
                  </p>
                  <p className="text-slate-500">
                    Kamar ini tidak sedang dihuni santri aktif dan aman untuk dihapus. Tindakan penghapusan
                    akan dicatat dalam audit log.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteKamarConfirm(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {isBlocked ? "Tutup" : "Batal"}
                </button>
                {!isBlocked && (
                  <button
                    type="button"
                    disabled={masterSubmitting}
                    onClick={handleDeleteKamarSubmit}
                    className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {masterSubmitting ? "Menghapus..." : "Ya, Hapus Kamar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

