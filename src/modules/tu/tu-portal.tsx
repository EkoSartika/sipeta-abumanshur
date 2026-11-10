"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  CreditCard,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FileText,
  FileUp,
  Filter,
  History,
  Info,
  MapPin,
  Megaphone,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
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
  CatatanKedisiplinan,
  ImportBatchReport,
  ImportSantriRow,
  ImportValidationSummary,
  JenisPembayaran,
  Kamar,
  KebijakanCicilan,
  Kelas,
  MasterKategoriPelanggaran,
  Pengumuman,
  PerkembanganMengaji,
  RiwayatPenempatanSantri,
  Santri,
  StatusSantri,
  Tagihan,
} from "@/types/database";

export type TuTab =
  | "dashboard"
  | "pembiayaan"
  | "pelanggaran"
  | "pengumuman"
  | "rekapitulasi"
  | "santri_wali"
  | "tambah_santri"
  | "kelas_kamar"
  | "profil_pesantren"
  | "riwayat_penempatan";

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
    jenisPembayaranList,
    createPengajuanPembiayaan,
    updateJenisPembayaran,
    deleteJenisPembayaran,
    masterPelanggaranList,
    kedisiplinanList,
    recordCatatanKedisiplinan,
    updateCatatanKedisiplinan,
    deleteCatatanKedisiplinan,
    createMasterKategoriPelanggaran,
    updateMasterKategoriPelanggaran,
    deleteMasterKategoriPelanggaranBatch,
    createPengumuman,
    updatePengumuman,
    deletePengumuman,
    tagihanList,
    mengajiList,
    tahunAjaranList,
    tahunAjaranAktif,
    profilPesantren,
    updateProfilPesantren,
    setActiveTahunAjaran,
    createSantriWithWali,
    importSantriBatch,
    moveSantriPlacement,
    updateStatusSantri,
    createKelas,
    updateKelas,
    deleteKelas,
    createKamar,
    updateKamar,
    deleteKamar,
    refreshFromSupabase,
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

  // Form Registrasi Santri Baru + Identitas Keluarga (Ayah, Ibu, Wali Opsional, & Penanggung Jawab Akun 1:1)
  const [nis, setNis] = useState("202607101");
  const [namaSantri, setNamaSantri] = useState("");
  const [tempatLahir, setTempatLahir] = useState("Cirebon");
  const [tanggalLahir, setTanggalLahir] = useState("2013-06-15");
  const [jenisKelamin, setJenisKelamin] = useState<"L" | "P">("L");
  const [alamatSantri, setAlamatSantri] = useState("");
  const [kelasIdSantri, setKelasIdSantri] = useState(kelasList[0]?.id ?? "");
  const [kamarIdSantri, setKamarIdSantri] = useState(kamarList[0]?.id ?? "");

  // A. Data Ayah (Nama Lengkap WAJIB, No HP & Pekerjaan Opsional)
  const [namaAyah, setNamaAyah] = useState("");
  const [noHpAyah, setNoHpAyah] = useState("");
  const [pekerjaanAyah, setPekerjaanAyah] = useState("");

  // B. Data Ibu (Nama Lengkap WAJIB, No HP & Pekerjaan Opsional)
  const [namaIbu, setNamaIbu] = useState("");
  const [noHpIbu, setNoHpIbu] = useState("");
  const [pekerjaanIbu, setPekerjaanIbu] = useState("");

  // C. Data Wali (Opsional — boleh dikosongkan jika tidak ada wali terpisah)
  const [namaWaliOpsional, setNamaWaliOpsional] = useState("");
  const [hubunganWaliDetail, setHubunganWaliDetail] = useState("");
  const [noHpWaliOpsional, setNoHpWaliOpsional] = useState("");

  // Pilihan Penanggung Jawab Akun (Ayah, Ibu, atau Wali)
  const [penanggungJawabAkun, setPenanggungJawabAkun] = useState<"Ayah" | "Ibu" | "Wali">("Ayah");
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  const isWaliOpsionalComplete = useMemo(() => {
    return (
      namaWaliOpsional.trim().length >= 3 &&
      hubunganWaliDetail.trim().length >= 2 &&
      noHpWaliOpsional.trim().length >= 6
    );
  }, [namaWaliOpsional, hubunganWaliDetail, noHpWaliOpsional]);

  const isWaliOpsionalPartiallyFilled = useMemo(() => {
    const anyFilled = Boolean(
      namaWaliOpsional.trim() || hubunganWaliDetail.trim() || noHpWaliOpsional.trim()
    );
    return anyFilled && !isWaliOpsionalComplete;
  }, [namaWaliOpsional, hubunganWaliDetail, noHpWaliOpsional, isWaliOpsionalComplete]);

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
  const [waliKelasInput, setWaliKelasInput] = useState("");
  const [kapasitasKelasInput, setKapasitasKelasInput] = useState(30);
  const [kelasSubmitting, setKelasSubmitting] = useState(false);
  const [deleteKelasConfirmModal, setDeleteKelasConfirmModal] = useState<Kelas | null>(null);

  const [modalKamarOpen, setModalKamarOpen] = useState(false);
  const [editingKamar, setEditingKamar] = useState<Kamar | null>(null);
  const [namaKamarInput, setNamaKamarInput] = useState("");
  const [kodeKamarInput, setKodeKamarInput] = useState("");
  const [gedungKamarInput, setGedungKamarInput] = useState("Gedung Putra Al-Faruq");
  const [jenisAsramaInput, setJenisAsramaInput] = useState<"L" | "P">("L");
  const [musyrifKamarInput, setMusyrifKamarInput] = useState("");
  const [kapasitasKamarInput, setKapasitasKamarInput] = useState(20);
  const [kamarSubmitting, setKamarSubmitting] = useState(false);
  const [deleteKamarConfirmModal, setDeleteKamarConfirmModal] = useState<Kamar | null>(null);

  // Detail Santri Modal
  const [detailSantri, setDetailSantri] = useState<Santri | null>(null);

  // ==========================================================================
  // STATE EDIT, HAPUS & BULK SELEKSI SANTRI (TU)
  // ==========================================================================
  const [editSantriModal, setEditSantriModal] = useState<Santri | null>(null);
  const [editSantriLoading, setEditSantriLoading] = useState(false);
  const [editNis, setEditNis] = useState("");
  const [editNama, setEditNama] = useState("");
  const [editTempatLahir, setEditTempatLahir] = useState("");
  const [editTanggalLahir, setEditTanggalLahir] = useState("");
  const [editJenisKelamin, setEditJenisKelamin] = useState<"L" | "P">("L");
  const [editAlamat, setEditAlamat] = useState("");
  const [editTahunMasuk, setEditTahunMasuk] = useState<number>(new Date().getFullYear());
  const [editKelasId, setEditKelasId] = useState("");
  const [editKamarId, setEditKamarId] = useState("");
  const [editStatus, setEditStatus] = useState<StatusSantri>("AKTIF");
  const [editNamaAyah, setEditNamaAyah] = useState("");
  const [editNoHpAyah, setEditNoHpAyah] = useState("");
  const [editPekerjaanAyah, setEditPekerjaanAyah] = useState("");
  const [editNamaIbu, setEditNamaIbu] = useState("");
  const [editNoHpIbu, setEditNoHpIbu] = useState("");
  const [editPekerjaanIbu, setEditPekerjaanIbu] = useState("");
  const [editNamaWali, setEditNamaWali] = useState("");
  const [editNoHpWali, setEditNoHpWali] = useState("");
  const [editHubunganWali, setEditHubunganWali] = useState("Wali");
  const [editPenanggungJawab, setEditPenanggungJawab] = useState<"Ayah" | "Ibu" | "Wali">("Ayah");
  const [editFeedback, setEditFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Hapus Satuan
  const [deleteSantriConfirm, setDeleteSantriConfirm] = useState<Santri | null>(null);
  const [deleteSantriLoading, setDeleteSantriLoading] = useState(false);

  // Bulk Selection & Delete
  const [selectedSantriIds, setSelectedSantriIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // ==========================================================================
  // STATE MANAJEMEN PEMBIAYAAN SANTRI (TU)
  // ==========================================================================
  const [namaPembiayaan, setNamaPembiayaan] = useState("");
  const [deskripsiPembiayaan, setDeskripsiPembiayaan] = useState("");
  const [nominalPembiayaan, setNominalPembiayaan] = useState("350000");
  const [kategoriPembiayaan, setKategoriPembiayaan] = useState("SPP");
  const [periodePembiayaan, setPeriodePembiayaan] = useState<"Bulanan" | "Semester" | "Tahunan" | "Sekali Bayar">("Bulanan");
  const [sasaranPembiayaan, setSasaranPembiayaan] = useState<"SEMUA" | "KELAS_TERTENTU" | "INDIVIDU">("SEMUA");
  const [targetIdPembiayaan, setTargetIdPembiayaan] = useState("");
  const [kebijakanCicilanPembiayaan, setKebijakanCicilanPembiayaan] = useState<KebijakanCicilan>("BEBAS");
  const [minimalCicilanPembiayaan, setMinimalCicilanPembiayaan] = useState("100000");
  const [jatuhTempoPembiayaan, setJatuhTempoPembiayaan] = useState("2026-11-20");
  const [submittingPembiayaan, setSubmittingPembiayaan] = useState(false);

  // Edit Pembiayaan Modal
  const [editPembiayaanModal, setEditPembiayaanModal] = useState<JenisPembayaran | null>(null);
  const [editNamaFee, setEditNamaFee] = useState("");
  const [editNominalFee, setEditNominalFee] = useState(0);
  const [editDeskripsiFee, setEditDeskripsiFee] = useState("");
  const [editJatuhTempoFee, setEditJatuhTempoFee] = useState("");
  const [editKebijakanCicilanFee, setEditKebijakanCicilanFee] = useState<KebijakanCicilan>("BEBAS");
  const [editMinCicilanFee, setEditMinCicilanFee] = useState<number | null>(null);
  const [deleteFeeConfirmModal, setDeleteFeeConfirmModal] = useState<JenisPembayaran | null>(null);

  // ==========================================================================
  // STATE MANAJEMEN PELANGGARAN SANTRI (TU)
  // ==========================================================================
  const [pelanggaranSubTab, setPelanggaranSubTab] = useState<"catatan" | "master">("catatan");
  const [santriPelanggaran, setSantriPelanggaran] = useState(santriList[0]?.id ?? "");
  const [tanggalPelanggaran, setTanggalPelanggaran] = useState(new Date().toISOString().slice(0, 10));
  const [waktuPelanggaran, setWaktuPelanggaran] = useState("14:30");
  const [kategoriPelanggaranId, setKategoriPelanggaranId] = useState(
    masterPelanggaranList.find((k) => k.is_active !== false)?.id ?? masterPelanggaranList[0]?.id ?? "kat-dis-01"
  );
  const [deskripsiPelanggaran, setDeskripsiPelanggaran] = useState("");
  const [tindakLanjutPelanggaran, setTindakLanjutPelanggaran] = useState("Peringatan lisan dan pembinaan musyrif asrama");
  const [catatanPembinaanPelanggaran, setCatatanPembinaanPelanggaran] = useState("Santri menyadari perbuatan dan berkomitmen taat aturan.");
  const [filterSantriPelanggaran, setFilterSantriPelanggaran] = useState("");
  const [filterKelasPelanggaran, setFilterKelasPelanggaran] = useState("all");
  const [filterTingkatPelanggaran, setFilterTingkatPelanggaran] = useState("all");

  // Sinkronisasi dropdown santri & kategori pelanggaran
  useEffect(() => {
    if (santriList.length > 0 && (!santriPelanggaran || !santriList.some((s) => s.id === santriPelanggaran))) {
      const s0 = santriList[0];
      if (s0) setSantriPelanggaran(s0.id);
    }
  }, [santriList, santriPelanggaran]);

  useEffect(() => {
    if (masterPelanggaranList.length > 0) {
      const activeKat = masterPelanggaranList.find((k) => k.is_active !== false) || masterPelanggaranList[0];
      if (activeKat && !masterPelanggaranList.some((k) => k.id === kategoriPelanggaranId)) {
        setKategoriPelanggaranId(activeKat.id);
      }
    }
  }, [masterPelanggaranList, kategoriPelanggaranId]);

  const [editPelanggaranModal, setEditPelanggaranModal] = useState<CatatanKedisiplinan | null>(null);
  const [deletePelanggaranConfirmModal, setDeletePelanggaranConfirmModal] = useState<CatatanKedisiplinan | null>(null);
  const [detailPelanggaranModal, setDetailPelanggaranModal] = useState<CatatanKedisiplinan | null>(null);

  // Master Kategori Pelanggaran (TU)
  const [modalTambahKatOpen, setModalTambahKatOpen] = useState(false);
  const [newKodeKat, setNewKodeKat] = useState("");
  const [newNamaKat, setNewNamaKat] = useState("");
  const [newTingkatKat, setNewTingkatKat] = useState<"RINGAN" | "SEDANG" | "BERAT">("RINGAN");
  const [newPoinKat, setNewPoinKat] = useState(5);
  const [newStandarTindakKat, setNewStandarTindakKat] = useState("");
  const [editKatModal, setEditKatModal] = useState<MasterKategoriPelanggaran | null>(null);
  const [selectedKatIds, setSelectedKatIds] = useState<string[]>([]);
  const [bulkDeleteKatModalOpen, setBulkDeleteKatModalOpen] = useState(false);

  // ==========================================================================
  // STATE MANAJEMEN PENGUMUMAN WALI SANTRI (TU)
  // ==========================================================================
  const [judulPengumuman, setJudulPengumuman] = useState("");
  const [kategoriPengumuman, setKategoriPengumuman] = useState<Pengumuman["kategori"]>("Umum");
  const [isiPengumuman, setIsiPengumuman] = useState("");
  const [masaBerlakuPengumuman, setMasaBerlakuPengumuman] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [sasaranPengumuman, setSasaranPengumuman] = useState<"SEMUA" | "KELAS" | "SANTRI">("SEMUA");
  const [targetIdPengumuman, setTargetIdPengumuman] = useState("");
  const [statusPublikasiPengumuman, setStatusPublikasiPengumuman] = useState<"PUBLIKASI" | "DRAF">("PUBLIKASI");
  const [isPentingPengumuman, setIsPentingPengumuman] = useState(false);

  const [editPengumumanModal, setEditPengumumanModal] = useState<Pengumuman | null>(null);
  const [deletePengumumanConfirmModal, setDeletePengumumanConfirmModal] = useState<Pengumuman | null>(null);

  // ==========================================================================
  // STATE REKAPITULASI & LAPORAN (TU)
  // ==========================================================================
  const [rekapSubTab, setRekapSubTab] = useState<"pembiayaan" | "mengaji" | "pelanggaran" | "santri_lengkap">("pembiayaan");
  const [rekapFeeSantri, setRekapFeeSantri] = useState("");
  const [rekapFeeKelas, setRekapFeeKelas] = useState("all");
  const [rekapFeeStatus, setRekapFeeStatus] = useState("all");

  const [rekapNgjSantri, setRekapNgjSantri] = useState("");
  const [rekapNgjKelas, setRekapNgjKelas] = useState("all");
  const [rekapNgjPeriode, setRekapNgjPeriode] = useState("all");

  const [rekapDslSantri, setRekapDslSantri] = useState("");
  const [rekapDslKelas, setRekapDslKelas] = useState("all");
  const [rekapDslTingkat, setRekapDslTingkat] = useState("all");

  const [selectedSantriDetailId, setSelectedSantriDetailId] = useState(santriList[0]?.id ?? "snt-001");

  // Helper Labels & Filters
  // ==========================================================================
  // STATE PENGATURAN PROFIL PESANTREN (TU)
  // ==========================================================================
  const [selectedTahunAjaranId, setSelectedTahunAjaranId] = useState(
    tahunAjaranList.find((t) => t.is_active)?.id || tahunAjaranList[0]?.id || ""
  );
  const [semesterProfil, setSemesterProfil] = useState<"Ganjil" | "Genap">(
    profilPesantren?.semester_aktif || "Ganjil"
  );
  const [namaResmiProfil, setNamaResmiProfil] = useState(profilPesantren?.nama_resmi || "");
  const [nsppProfil, setNsppProfil] = useState(profilPesantren?.nspp || "");
  const [akreditasiProfil, setAkreditasiProfil] = useState(profilPesantren?.akreditasi || "");
  const [skPendirianProfil, setSkPendirianProfil] = useState(profilPesantren?.sk_pendirian || "");
  const [alamatProfil, setAlamatProfil] = useState(profilPesantren?.alamat || "");
  const [kelurahanProfil, setKelurahanProfil] = useState(profilPesantren?.kelurahan || "");
  const [kecamatanProfil, setKecamatanProfil] = useState(profilPesantren?.kecamatan || "");
  const [kabupatenProfil, setKabupatenProfil] = useState(profilPesantren?.kabupaten_kota || "");
  const [provinsiProfil, setProvinsiProfil] = useState(profilPesantren?.provinsi || "");
  const [kodePosProfil, setKodePosProfil] = useState(profilPesantren?.kode_pos || "");
  const [teleponProfil, setTeleponProfil] = useState(profilPesantren?.no_telepon || "");
  const [emailProfil, setEmailProfil] = useState(profilPesantren?.email || "");
  const [websiteProfil, setWebsiteProfil] = useState(profilPesantren?.website || "");
  const [pengasuhProfil, setPengasuhProfil] = useState(profilPesantren?.nama_pengasuh || "");
  const [informasiUmumProfil, setInformasiUmumProfil] = useState(profilPesantren?.informasi_umum || "");
  const [confirmSaveProfilOpen, setConfirmSaveProfilOpen] = useState(false);
  const [savingProfil, setSavingProfil] = useState(false);

  useEffect(() => {
    if (profilPesantren) {
      setNamaResmiProfil(profilPesantren.nama_resmi || "");
      setNsppProfil(profilPesantren.nspp || "");
      setAkreditasiProfil(profilPesantren.akreditasi || "");
      setSkPendirianProfil(profilPesantren.sk_pendirian || "");
      setAlamatProfil(profilPesantren.alamat || "");
      setKelurahanProfil(profilPesantren.kelurahan || "");
      setKecamatanProfil(profilPesantren.kecamatan || "");
      setKabupatenProfil(profilPesantren.kabupaten_kota || "");
      setProvinsiProfil(profilPesantren.provinsi || "");
      setKodePosProfil(profilPesantren.kode_pos || "");
      setTeleponProfil(profilPesantren.no_telepon || "");
      setEmailProfil(profilPesantren.email || "");
      setWebsiteProfil(profilPesantren.website || "");
      setPengasuhProfil(profilPesantren.nama_pengasuh || "");
      setSemesterProfil(profilPesantren.semester_aktif || "Ganjil");
      setInformasiUmumProfil(profilPesantren.informasi_umum || "");
    }
  }, [profilPesantren]);

  useEffect(() => {
    const active = tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0];
    if (active) setSelectedTahunAjaranId(active.id);
  }, [tahunAjaranList]);

  useEffect(() => {
    if (kelasList.length > 0 && (!kelasIdSantri || !kelasList.some((k) => k.id === kelasIdSantri))) {
      setKelasIdSantri(kelasList[0]?.id ?? "");
    }
  }, [kelasList, kelasIdSantri]);

  useEffect(() => {
    if (kamarList.length > 0 && (!kamarIdSantri || !kamarList.some((km) => km.id === kamarIdSantri))) {
      setKamarIdSantri(kamarList[0]?.id ?? "");
    }
  }, [kamarList, kamarIdSantri]);

  const handleSaveProfil = async () => {
    if (!namaResmiProfil.trim()) {
      setFeedback({ ok: false, text: "Nama resmi pesantren wajib diisi." });
      return;
    }
    if (!alamatProfil.trim()) {
      setFeedback({ ok: false, text: "Alamat pesantren wajib diisi." });
      return;
    }
    setSavingProfil(true);
    const res = await updateProfilPesantren(
      {
        nama_resmi: namaResmiProfil.trim(),
        nspp: nsppProfil.trim(),
        akreditasi: akreditasiProfil.trim(),
        sk_pendirian: skPendirianProfil.trim(),
        alamat: alamatProfil.trim(),
        kelurahan: kelurahanProfil.trim(),
        kecamatan: kecamatanProfil.trim(),
        kabupaten_kota: kabupatenProfil.trim(),
        provinsi: provinsiProfil.trim(),
        kode_pos: kodePosProfil.trim(),
        no_telepon: teleponProfil.trim(),
        email: emailProfil.trim(),
        website: websiteProfil.trim(),
        nama_pengasuh: pengasuhProfil.trim(),
        informasi_umum: informasiUmumProfil.trim(),
      },
      tahunAjaranList.some((t) => t.id === selectedTahunAjaranId) ? selectedTahunAjaranId : undefined
    );
    setSavingProfil(false);
    setConfirmSaveProfilOpen(false);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const activeKategoriList = useMemo(() => {
    return masterPelanggaranList.filter((k) => k.is_active !== false);
  }, [masterPelanggaranList]);

  const getSantriKelasName = (id: string) => {
    const s = santriList.find((x) => x.id === id);
    if (!s || !s.kelas_id) return "-";
    const k = kelasList.find((kls) => kls.id === s.kelas_id);
    return k?.nama_kelas || "-";
  };

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

  // Filtered Santri List
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

  // ==========================================================================
  // HANDLERS EDIT, HAPUS & BULK ACTION SANTRI
  // ==========================================================================
  const openEditSantriModal = (s: Santri) => {
    const w = waliList.find((x) => x.santri_id === s.id);
    setEditSantriModal(s);
    setEditNis(s.nis || "");
    setEditNama(s.nama_lengkap || "");
    setEditTempatLahir(s.tempat_lahir || "");
    setEditTanggalLahir(s.tanggal_lahir ? s.tanggal_lahir.substring(0, 10) : "");
    setEditJenisKelamin(s.jenis_kelamin || "L");
    setEditAlamat(s.alamat || "");
    setEditTahunMasuk(s.tahun_masuk || new Date().getFullYear());
    setEditKelasId(s.kelas_id || "");
    setEditKamarId(s.kamar_id || "");
    setEditStatus(s.status || "AKTIF");

    setEditNamaAyah(w?.nama_ayah || (w?.hubungan === "Ayah" ? w.nama_lengkap : ""));
    setEditNoHpAyah(w?.no_hp_ayah || (w?.hubungan === "Ayah" ? w.no_telepon : ""));
    setEditPekerjaanAyah(w?.pekerjaan_ayah || "");
    setEditNamaIbu(w?.nama_ibu || (w?.hubungan === "Ibu" ? w.nama_lengkap : ""));
    setEditNoHpIbu(w?.no_hp_ibu || (w?.hubungan === "Ibu" ? w.no_telepon : ""));
    setEditPekerjaanIbu(w?.pekerjaan_ibu || "");
    setEditNamaWali(w?.nama_wali || (w?.hubungan === "Wali" ? w.nama_lengkap : ""));
    setEditNoHpWali(w?.no_hp_wali || (w?.hubungan === "Wali" ? w.no_telepon : ""));
    setEditHubunganWali(w?.hubungan_wali_detail || "Wali");
    setEditPenanggungJawab(w?.penanggung_jawab || w?.hubungan || "Ayah");
    setEditFeedback(null);
  };

  const handleSaveEditSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSantriModal) return;
    if (!editNis.trim() || !editNama.trim()) {
      setEditFeedback({ ok: false, text: "NIS dan Nama Lengkap santri wajib diisi." });
      return;
    }

    setEditSantriLoading(true);
    setEditFeedback(null);

    try {
      const namaWaliAktif =
        editPenanggungJawab === "Ayah"
          ? editNamaAyah
          : editPenanggungJawab === "Ibu"
          ? editNamaIbu
          : editNamaWali;
      const noHpWaliAktif =
        editPenanggungJawab === "Ayah"
          ? editNoHpAyah
          : editPenanggungJawab === "Ibu"
          ? editNoHpIbu
          : editNoHpWali;

      const payload = {
        nis: editNis.trim(),
        nama_lengkap: editNama.trim(),
        tempat_lahir: editTempatLahir.trim(),
        tanggal_lahir: editTanggalLahir || "2010-01-01",
        jenis_kelamin: editJenisKelamin,
        alamat: editAlamat.trim(),
        tahun_masuk: editTahunMasuk,
        kelas_id: editKelasId || null,
        kamar_id: editKamarId || null,
        status: editStatus,
        penanggung_jawab: editPenanggungJawab,
        identitas_keluarga: {
          ayah: {
            nama_lengkap: editNamaAyah.trim(),
            no_telepon: editNoHpAyah.trim(),
            pekerjaan: editPekerjaanAyah.trim(),
          },
          ibu: {
            nama_lengkap: editNamaIbu.trim(),
            no_telepon: editNoHpIbu.trim(),
            pekerjaan: editPekerjaanIbu.trim(),
          },
          wali: {
            nama_lengkap: editNamaWali.trim(),
            no_telepon: editNoHpWali.trim(),
            hubungan: editHubunganWali.trim() || "Wali",
          },
        },
        wali: {
          nama_lengkap: namaWaliAktif.trim() || editNama.trim() + " (Wali)",
          no_telepon: noHpWaliAktif.trim() || "-",
          hubungan: editPenanggungJawab,
        },
      };

      const res = await fetch("/api/admin-santri", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editSantriModal.id, payload }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setEditFeedback({ ok: false, text: data.message || "Gagal memperbarui data santri." });
        return;
      }

      await refreshFromSupabase();
      setFeedback({ ok: true, text: data.message || "Data santri berhasil diperbarui." });
      setEditSantriModal(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setEditFeedback({ ok: false, text: `Kesalahan: ${msg}` });
    } finally {
      setEditSantriLoading(false);
    }
  };

  const handleSingleDelete = async () => {
    if (!deleteSantriConfirm) return;
    setDeleteSantriLoading(true);
    try {
      const res = await fetch("/api/admin-santri", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ santri_ids: [deleteSantriConfirm.id] }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback({ ok: false, text: data.message || "Gagal menghapus santri." });
      } else {
        await refreshFromSupabase();
        setFeedback({ ok: true, text: data.message });
        setDeleteSantriConfirm(null);
        setSelectedSantriIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteSantriConfirm.id);
          return next;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: `Kesalahan: ${msg}` });
    } finally {
      setDeleteSantriLoading(false);
    }
  };

  const toggleSelectSantri = (id: string) => {
    setSelectedSantriIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllSantri = () => {
    const allFilteredSelected =
      filteredSantri.length > 0 &&
      filteredSantri.every((s) => selectedSantriIds.has(s.id));

    setSelectedSantriIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredSantri.forEach((s) => next.delete(s.id));
      } else {
        filteredSantri.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedSantriIds.size === 0) return;
    setBulkDeleteLoading(true);
    try {
      const ids = Array.from(selectedSantriIds);
      const res = await fetch("/api/admin-santri", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ santri_ids: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFeedback({ ok: false, text: data.message || "Gagal menghapus santri terpilih." });
      } else {
        await refreshFromSupabase();
        setFeedback({ ok: true, text: data.message });
        setSelectedSantriIds(new Set());
        setBulkDeleteModalOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: `Kesalahan: ${msg}` });
    } finally {
      setBulkDeleteLoading(false);
    }
  };

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

  // Handle Submit Tambah/Edit Master Kelas
  const handleSaveKelasSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKelasInput.trim() || !kodeKelasInput.trim()) {
      setFeedback({ ok: false, text: "Kode kelas dan nama kelas wajib diisi." });
      return;
    }
    const t = parseInt(tingkatKelasInput, 10) || 7;
    const k = kapasitasKelasInput > 0 ? kapasitasKelasInput : 30;

    setKelasSubmitting(true);
    try {
      if (editingKelas) {
        const res = await updateKelas(editingKelas.id, {
          nama_kelas: namaKelasInput.trim(),
          kode_kelas: kodeKelasInput.trim().toUpperCase(),
          tingkat: t,
          wali_kelas: waliKelasInput.trim() || undefined,
          kapasitas: k,
        });
        setFeedback({ ok: res.ok, text: res.message });
        if (res.ok) {
          setModalKelasOpen(false);
          setEditingKelas(null);
        }
      } else {
        const res = await createKelas({
          nama_kelas: namaKelasInput.trim(),
          kode_kelas: kodeKelasInput.trim().toUpperCase(),
          tingkat: t,
          wali_kelas: waliKelasInput.trim(),
          kapasitas: k,
        });
        setFeedback({ ok: res.ok, text: res.message });
        if (res.ok) {
          setModalKelasOpen(false);
          setNamaKelasInput("");
          setKodeKelasInput("");
          setWaliKelasInput("");
        }
      }
    } finally {
      setKelasSubmitting(false);
    }
  };

  const handleConfirmDeleteKelas = async () => {
    if (!deleteKelasConfirmModal) return;
    const res = await deleteKelas(deleteKelasConfirmModal.id);
    setFeedback({ ok: res.ok, text: res.message });
    setDeleteKelasConfirmModal(null);
  };

  // Handle Submit Tambah/Edit Master Kamar
  const handleSaveKamarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaKamarInput.trim() || !kodeKamarInput.trim() || !gedungKamarInput.trim()) {
      setFeedback({ ok: false, text: "Kode kamar, nama kamar, dan nama gedung asrama wajib diisi." });
      return;
    }
    const kap = kapasitasKamarInput > 0 ? kapasitasKamarInput : 20;

    setKamarSubmitting(true);
    try {
      if (editingKamar) {
        const res = await updateKamar(editingKamar.id, {
          nama_kamar: namaKamarInput.trim(),
          kode_kamar: kodeKamarInput.trim().toUpperCase(),
          gedung_asrama: gedungKamarInput.trim(),
          jenis_asrama: jenisAsramaInput,
          musyrif: musyrifKamarInput.trim() || undefined,
          kapasitas: kap,
        });
        setFeedback({ ok: res.ok, text: res.message });
        if (res.ok) {
          setModalKamarOpen(false);
          setEditingKamar(null);
        }
      } else {
        const res = await createKamar({
          nama_kamar: namaKamarInput.trim(),
          kode_kamar: kodeKamarInput.trim().toUpperCase(),
          gedung_asrama: gedungKamarInput.trim(),
          jenis_asrama: jenisAsramaInput,
          musyrif: musyrifKamarInput.trim(),
          kapasitas: kap,
        });
        setFeedback({ ok: res.ok, text: res.message });
        if (res.ok) {
          setModalKamarOpen(false);
          setNamaKamarInput("");
          setKodeKamarInput("");
          setMusyrifKamarInput("");
        }
      }
    } finally {
      setKamarSubmitting(false);
    }
  };

  const handleConfirmDeleteKamar = async () => {
    if (!deleteKamarConfirmModal) return;
    const res = await deleteKamar(deleteKamarConfirmModal.id);
    setFeedback({ ok: res.ok, text: res.message });
    setDeleteKamarConfirmModal(null);
  };

  // Handle Submit Registrasi Santri Baru
  const handleRegisterSantri = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nis.trim() || !namaSantri.trim()) {
      setFeedback({
        ok: false,
        text: "Nomor Induk Santri (NIS) dan Nama Lengkap Santri wajib diisi.",
      });
      return;
    }

    if (namaAyah.trim().length < 3) {
      setFeedback({
        ok: false,
        text: "Nama lengkap ayah wajib diisi (minimal 3 karakter).",
      });
      return;
    }

    if (namaIbu.trim().length < 3) {
      setFeedback({
        ok: false,
        text: "Nama lengkap ibu wajib diisi (minimal 3 karakter).",
      });
      return;
    }

    if (isWaliOpsionalPartiallyFilled) {
      setFeedback({
        ok: false,
        text: "Data Wali belum lengkap: harap isi Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali secara lengkap, atau kosongkan seluruh bagian Data Wali jika wali tidak ada.",
      });
      return;
    }

    if (penanggungJawabAkun === "Wali" && !isWaliOpsionalComplete) {
      setFeedback({
        ok: false,
        text: "Pilihan Penanggung Jawab Akun 'Wali' hanya valid jika Data Wali (Nama Lengkap Wali, Hubungan dengan Santri, dan Nomor HP Wali) diisi lengkap.",
      });
      return;
    }

    const activeTa = tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0];
    if (!activeTa?.id) {
      setFeedback({
        ok: false,
        text: "Registrasi dihentikan: Tahun Pelajaran aktif belum ditemukan. Silakan atur Tahun Pelajaran aktif terlebih dahulu.",
      });
      return;
    }

    const validKelasId = kelasList.some((k) => k.id === kelasIdSantri)
      ? kelasIdSantri
      : kelasList[0]?.id || "";
    const validKamarId = kamarList.some((km) => km.id === kamarIdSantri)
      ? kamarIdSantri
      : kamarList[0]?.id || "";

    if (!validKelasId || !validKamarId) {
      setFeedback({
        ok: false,
        text: "Harap pilih Kelas Awal dan Kamar Asrama yang valid (tambahkan Master Kelas & Kamar terlebih dahulu jika masih kosong).",
      });
      return;
    }

    const namaAkunTerpilih =
      penanggungJawabAkun === "Ayah"
        ? namaAyah.trim()
        : penanggungJawabAkun === "Ibu"
        ? namaIbu.trim()
        : namaWaliOpsional.trim();

    const teleponAkunTerpilih =
      penanggungJawabAkun === "Ayah"
        ? noHpAyah.trim() || noHpIbu.trim() || noHpWaliOpsional.trim() || "-"
        : penanggungJawabAkun === "Ibu"
        ? noHpIbu.trim() || noHpAyah.trim() || noHpWaliOpsional.trim() || "-"
        : noHpWaliOpsional.trim() || "-";

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
        tahun_ajaran_id: activeTa.id,
        kelas_id: validKelasId,
        kamar_id: validKamarId,
        nama_ayah: namaAyah.trim(),
        no_hp_ayah: noHpAyah.trim(),
        pekerjaan_ayah: pekerjaanAyah.trim(),
        nama_ibu: namaIbu.trim(),
        no_hp_ibu: noHpIbu.trim(),
        pekerjaan_ibu: pekerjaanIbu.trim(),
        nama_wali_opsional: isWaliOpsionalComplete ? namaWaliOpsional.trim() : "",
        hubungan_wali_detail: isWaliOpsionalComplete ? hubunganWaliDetail.trim() : "",
        no_hp_wali_opsional: isWaliOpsionalComplete ? noHpWaliOpsional.trim() : "",
        penanggung_jawab: penanggungJawabAkun,
        nama_wali: namaAkunTerpilih,
        hubungan_wali: penanggungJawabAkun,
        telepon_wali: teleponAkunTerpilih,
        username_wali: nis.trim(),
        password_wali: nis.trim(),
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setNamaSantri("");
        setNamaAyah("");
        setNoHpAyah("");
        setPekerjaanAyah("");
        setNamaIbu("");
        setNoHpIbu("");
        setPekerjaanIbu("");
        setNamaWaliOpsional("");
        setHubunganWaliDetail("");
        setNoHpWaliOpsional("");
        setPenanggungJawabAkun("Ayah");
        setAlamatSantri("");
        const nextNum = parseInt(nis.slice(-3) || "100") + 1;
        setNis(`202607${nextNum.toString().padStart(3, "0")}`);
      }
    } finally {
      setRegisterSubmitting(false);
    }
  };

  // ==========================================================================
  // HANDLERS MANAJEMEN PEMBIAYAAN SANTRI (TU)
  // ==========================================================================
  const handleCreatePembiayaanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nom = Number(nominalPembiayaan);
    if (!namaPembiayaan.trim() || isNaN(nom) || nom <= 0) {
      setFeedback({ ok: false, text: "Harap isi nama pembiayaan dan nominal valid (> Rp 0)." });
      return;
    }

    const activeTa = tahunAjaranList.find((t) => t.is_active) || tahunAjaranList[0];

    setSubmittingPembiayaan(true);
    try {
      const res = createPengajuanPembiayaan({
        nama_pembayaran: namaPembiayaan.trim(),
        deskripsi: deskripsiPembiayaan.trim(),
        nominal: nom,
        kategori: kategoriPembiayaan.trim() || "SPP",
        tahun_ajaran_id: activeTa?.id || "",
        periode_pembayaran: periodePembiayaan,
        tanggal_mulai: new Date().toISOString().slice(0, 10),
        tanggal_jatuh_tempo: jatuhTempoPembiayaan || new Date().toISOString().slice(0, 10),
        sasaran_santri: sasaranPembiayaan,
        sasaran_target_id: sasaranPembiayaan === "SEMUA" ? undefined : targetIdPembiayaan,
        kebijakan_cicilan: kebijakanCicilanPembiayaan,
        minimal_nominal_cicilan: kebijakanCicilanPembiayaan === "MINIMAL_NOMINAL" ? Number(minimalCicilanPembiayaan) : null,
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setNamaPembiayaan("");
        setDeskripsiPembiayaan("");
      }
    } finally {
      setSubmittingPembiayaan(false);
    }
  };

  const handleEditPembiayaanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPembiayaanModal) return;
    if (editNominalFee <= 0) {
      setFeedback({ ok: false, text: "Nominal pembiayaan harus lebih dari Rp 0." });
      return;
    }

    const res = updateJenisPembayaran(editPembiayaanModal.id, {
      nama_pembayaran: editNamaFee.trim(),
      nominal: editNominalFee,
      deskripsi: editDeskripsiFee.trim(),
      tanggal_jatuh_tempo: editJatuhTempoFee,
      kebijakan_cicilan: editKebijakanCicilanFee,
      minimal_nominal_cicilan: editKebijakanCicilanFee === "MINIMAL_NOMINAL" ? editMinCicilanFee : null,
    });

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setEditPembiayaanModal(null);
    }
  };

  const handleDeletePembiayaanConfirm = () => {
    if (!deleteFeeConfirmModal) return;
    const res = deleteJenisPembayaran(deleteFeeConfirmModal.id);
    setFeedback({ ok: res.ok, text: res.message });
    setDeleteFeeConfirmModal(null);
  };

  // ==========================================================================
  // HANDLERS MANAJEMEN PELANGGARAN SANTRI (TU)
  // ==========================================================================
  const handleCreatePelanggaranSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!santriPelanggaran || !kategoriPelanggaranId || !deskripsiPelanggaran.trim()) {
      setFeedback({ ok: false, text: "Santri, kategori pelanggaran, dan uraian kejadian wajib diisi." });
      return;
    }

    const res = recordCatatanKedisiplinan({
      santri_id: santriPelanggaran,
      tanggal_kejadian: tanggalPelanggaran,
      waktu_kejadian: waktuPelanggaran,
      kategori_id: kategoriPelanggaranId,
      deskripsi: deskripsiPelanggaran.trim(),
      tindak_lanjut: tindakLanjutPelanggaran.trim(),
      catatan_pembinaan: catatanPembinaanPelanggaran.trim(),
      status_tindak_lanjut: "DALAM_PEMBINAAN",
    });

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setDeskripsiPelanggaran("");
    }
  };

  const handleEditPelanggaranSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPelanggaranModal) return;

    const res = updateCatatanKedisiplinan(editPelanggaranModal.id, {
      deskripsi: editPelanggaranModal.deskripsi.trim(),
      tindak_lanjut: editPelanggaranModal.tindak_lanjut.trim(),
      catatan_pembinaan: editPelanggaranModal.catatan_pembinaan.trim(),
      status_tindak_lanjut: editPelanggaranModal.status_tindak_lanjut,
    });

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setEditPelanggaranModal(null);
    }
  };

  const handleDeletePelanggaranConfirm = () => {
    if (!deletePelanggaranConfirmModal) return;
    const res = deleteCatatanKedisiplinan(deletePelanggaranConfirmModal.id);
    setFeedback({ ok: res.ok, text: res.message });
    setDeletePelanggaranConfirmModal(null);
  };

  // Master Kategori Handlers
  const handleCreateMasterKatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKodeKat.trim() || !newNamaKat.trim()) return;
    const res = await createMasterKategoriPelanggaran({
      kode_kategori: newKodeKat.trim().toUpperCase(),
      nama_kategori: newNamaKat.trim(),
      tingkat_pelanggaran: newTingkatKat,
      poin_pembinaan: Number(newPoinKat),
      standar_tindak_lanjut: newStandarTindakKat.trim() || "Pembinaan musyrif asrama",
      is_active: true,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) setModalTambahKatOpen(false);
  };

  const handleEditMasterKatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editKatModal) return;
    const res = await updateMasterKategoriPelanggaran(editKatModal.id, {
      nama_kategori: editKatModal.nama_kategori.trim(),
      tingkat_pelanggaran: editKatModal.tingkat_pelanggaran,
      poin_pembinaan: Number(editKatModal.poin_pembinaan),
      standar_tindak_lanjut: editKatModal.standar_tindak_lanjut.trim(),
      is_active: editKatModal.is_active,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) setEditKatModal(null);
  };

  const handleBulkDeleteKat = async () => {
    if (selectedKatIds.length === 0) return;
    const res = await deleteMasterKategoriPelanggaranBatch(selectedKatIds);
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setSelectedKatIds([]);
      setBulkDeleteKatModalOpen(false);
    }
  };

  // ==========================================================================
  // HANDLERS MANAJEMEN PENGUMUMAN WALI SANTRI (TU)
  // ==========================================================================
  const handleCreatePengumumanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!judulPengumuman.trim() || !isiPengumuman.trim()) {
      setFeedback({ ok: false, text: "Judul dan isi pengumuman wajib diisi." });
      return;
    }

    const isPub = statusPublikasiPengumuman === "PUBLIKASI";
    const res = createPengumuman({
      judul: judulPengumuman.trim(),
      kategori: kategoriPengumuman,
      isi: isiPengumuman.trim(),
      is_penting: isPentingPengumuman,
      is_published: isPub,
      masa_berlaku: masaBerlakuPengumuman,
      sasaran: sasaranPengumuman,
      target_id: sasaranPengumuman === "SEMUA" ? undefined : targetIdPengumuman,
      status_publikasi: statusPublikasiPengumuman,
    });

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setJudulPengumuman("");
      setIsiPengumuman("");
    }
  };

  const handleEditPengumumanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPengumumanModal) return;

    const res = updatePengumuman(editPengumumanModal.id, {
      judul: editPengumumanModal.judul.trim(),
      kategori: editPengumumanModal.kategori,
      isi: editPengumumanModal.isi.trim(),
      masa_berlaku: editPengumumanModal.masa_berlaku,
      sasaran: editPengumumanModal.sasaran,
      target_id: editPengumumanModal.target_id,
      status_publikasi: editPengumumanModal.status_publikasi,
      is_penting: editPengumumanModal.is_penting,
    });

    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setEditPengumumanModal(null);
    }
  };

  const handleDeletePengumumanConfirm = () => {
    if (!deletePengumumanConfirmModal) return;
    const res = deletePengumuman(deletePengumumanConfirmModal.id);
    setFeedback({ ok: res.ok, text: res.message });
    setDeletePengumumanConfirmModal(null);
  };

  // ==========================================================================
  // FILTERED DATA UNTUK REKAPITULASI & LAPORAN
  // ==========================================================================
  const filteredRekapTagihan = useMemo(() => {
    return tagihanList.filter((t) => {
      const s = santriList.find((x) => x.id === t.santri_id);
      if (rekapFeeKelas !== "all" && s?.kelas_id !== rekapFeeKelas) return false;
      if (rekapFeeStatus !== "all" && t.status !== rekapFeeStatus) return false;
      if (rekapFeeSantri.trim()) {
        const q = rekapFeeSantri.toLowerCase();
        const matchName = s?.nama_lengkap.toLowerCase().includes(q);
        const matchNis = s?.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      return true;
    });
  }, [tagihanList, santriList, rekapFeeKelas, rekapFeeStatus, rekapFeeSantri]);

  const filteredRekapMengaji = useMemo(() => {
    return mengajiList.filter((m) => {
      const s = santriList.find((x) => x.id === m.santri_id);
      if (rekapNgjKelas !== "all" && s?.kelas_id !== rekapNgjKelas) return false;
      if (rekapNgjPeriode !== "all" && !m.tanggal_penilaian.startsWith(rekapNgjPeriode)) return false;
      if (rekapNgjSantri.trim()) {
        const q = rekapNgjSantri.toLowerCase();
        const matchName = s?.nama_lengkap.toLowerCase().includes(q);
        const matchNis = s?.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      return true;
    });
  }, [mengajiList, santriList, rekapNgjKelas, rekapNgjPeriode, rekapNgjSantri]);

  const filteredRekapPelanggaran = useMemo(() => {
    return kedisiplinanList.filter((kd) => {
      const s = santriList.find((x) => x.id === kd.santri_id);
      if (rekapDslKelas !== "all" && s?.kelas_id !== rekapDslKelas) return false;
      if (rekapDslTingkat !== "all" && kd.tingkat_pelanggaran !== rekapDslTingkat) return false;
      if (rekapDslSantri.trim()) {
        const q = rekapDslSantri.toLowerCase();
        const matchName = s?.nama_lengkap.toLowerCase().includes(q);
        const matchNis = s?.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      return true;
    });
  }, [kedisiplinanList, santriList, rekapDslKelas, rekapDslTingkat, rekapDslSantri]);

  // Export Handlers
  const exportRekapPembiayaanToExcel = () => {
    const dataToExport = filteredRekapTagihan.map((t, idx) => {
      const s = santriList.find((x) => x.id === t.santri_id);
      const k = kelasList.find((x) => x.id === s?.kelas_id);
      const jp = jenisPembayaranList.find((x) => x.id === t.jenis_pembayaran_id);
      return {
        No: idx + 1,
        NIS: s?.nis || "-",
        "Nama Santri": s?.nama_lengkap || "-",
        Kelas: k?.nama_kelas || "-",
        "Jenis Tagihan": jp?.nama_pembayaran || "-",
        Periode: t.periode_label,
        "Total Tagihan (Rp)": t.nominal_tagihan,
        "Terbayar (Rp)": t.total_terbayar,
        "Sisa Tagihan (Rp)": t.sisa_tagihan,
        Status: t.status,
        "Jatuh Tempo": formatTanggal(t.tanggal_jatuh_tempo),
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Pembiayaan");
    XLSX.writeFile(wb, `Rekap_Pembiayaan_SIPETA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportRekapMengajiToExcel = () => {
    const dataToExport = filteredRekapMengaji.map((m, idx) => {
      const s = santriList.find((x) => x.id === m.santri_id);
      const k = kelasList.find((x) => x.id === s?.kelas_id);
      return {
        No: idx + 1,
        NIS: s?.nis || "-",
        "Nama Santri": s?.nama_lengkap || "-",
        Kelas: k?.nama_kelas || "-",
        "Tanggal Evaluasi": formatTanggal(m.tanggal_penilaian),
        Metode: m.metode_pembelajaran,
        "Tingkat / Jilid": m.tingkat_jilid,
        "Materi Terakhir": m.materi_terakhir,
        Kelancaran: m.kelancaran_bacaan,
        Makharij: m.makharijul_huruf,
        Tajwid: m.tajwid,
        Pembimbing: m.pembimbing_name,
        "Catatan Evaluasi": m.catatan_perkembangan,
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Mengaji");
    XLSX.writeFile(wb, `Rekap_Mengaji_SIPETA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportRekapPelanggaranToExcel = () => {
    const dataToExport = filteredRekapPelanggaran.map((kd, idx) => {
      const s = santriList.find((x) => x.id === kd.santri_id);
      const k = kelasList.find((x) => x.id === s?.kelas_id);
      return {
        No: idx + 1,
        NIS: s?.nis || "-",
        "Nama Santri": s?.nama_lengkap || "-",
        Kelas: k?.nama_kelas || "-",
        Tanggal: formatTanggal(kd.tanggal_kejadian),
        Waktu: kd.waktu_kejadian,
        Kategori: kd.nama_kategori,
        "Tingkat Keparahan": kd.tingkat_pelanggaran,
        "Uraian Kejadian": kd.deskripsi,
        "Tindak Lanjut": kd.tindak_lanjut,
        "Catatan Pembinaan": kd.catatan_pembinaan,
        Status: kd.status_tindak_lanjut,
        Petugas: kd.petugas_nama,
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap Pelanggaran");
    XLSX.writeFile(wb, `Rekap_Pelanggaran_SIPETA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
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
              <button
                type="button"
                onClick={() => setActiveTab("santri_wali")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Kelola Data Santri</span>
              </button>
            </div>

            {/* Shortcut Manajemen Pembiayaan Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Manajemen Pembiayaan</h3>
                  <p className="text-xs text-slate-500">Ajukan Jenis Pembiayaan Santri</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("pembiayaan")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Kelola Pembiayaan</span>
              </button>
            </div>

            {/* Shortcut Manajemen Pelanggaran Santri */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Pelanggaran Santri</h3>
                  <p className="text-xs text-slate-500">Pencatatan &amp; Master Kategori</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("pelanggaran")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-700 px-4 py-2 text-xs font-bold text-white hover:bg-purple-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Kelola Pelanggaran</span>
              </button>
            </div>

            {/* Shortcut Rekapitulasi & Laporan */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Rekapitulasi &amp; Laporan</h3>
                  <p className="text-xs text-slate-500">Pembiayaan, Mengaji &amp; Santri</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("rekapitulasi")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Buka Rekapitulasi</span>
              </button>
            </div>

            {/* Shortcut Profil Pesantren */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Profil Pesantren</h3>
                  <p className="text-xs text-slate-500">Tahun Pelajaran &amp; Alamat</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("profil_pesantren")}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[40px] cursor-pointer"
              >
                <span>Kelola Profil Pesantren</span>
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
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Registrasi Santri Baru &amp; Akun Wali Mandiri
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-800">
                  {`Tahun Pelajaran: ${tahunAjaranList.find((t) => t.is_active)?.nama || profilPesantren?.tahun_pelajaran_aktif || "2026/2027"}`}
                </span>
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

                  {/* Data Orang Tua / Wali & Penanggung Jawab Akun */}
                  <div className="space-y-4">
                    <h4 className="font-extrabold text-xs text-blue-900 uppercase tracking-wider">
                      2. Identitas Orang Tua / Wali
                    </h4>

                    {/* A. Data Ayah */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                      <span className="block text-xs font-extrabold text-slate-900">
                        A. Data Ayah
                      </span>
                      <div>
                        <label
                          htmlFor="reg-nama-ayah"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nama Lengkap Ayah *
                        </label>
                        <input
                          id="reg-nama-ayah"
                          type="text"
                          required
                          placeholder="contoh: H. Syarif Hidayatullah"
                          value={namaAyah}
                          onChange={(e) => setNamaAyah(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="reg-hp-ayah"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Nomor HP Ayah (Opsional)
                          </label>
                          <input
                            id="reg-hp-ayah"
                            type="tel"
                            placeholder="contoh: 081234567890"
                            value={noHpAyah}
                            onChange={(e) => setNoHpAyah(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="reg-pekerjaan-ayah"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Pekerjaan Ayah (Opsional)
                          </label>
                          <input
                            id="reg-pekerjaan-ayah"
                            type="text"
                            placeholder="contoh: Wiraswasta / ASN"
                            value={pekerjaanAyah}
                            onChange={(e) => setPekerjaanAyah(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* B. Data Ibu */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                      <span className="block text-xs font-extrabold text-slate-900">
                        B. Data Ibu
                      </span>
                      <div>
                        <label
                          htmlFor="reg-nama-ibu"
                          className="block text-xs font-bold text-slate-700 mb-1"
                        >
                          Nama Lengkap Ibu *
                        </label>
                        <input
                          id="reg-nama-ibu"
                          type="text"
                          required
                          placeholder="contoh: Hj. Siti Fatimah"
                          value={namaIbu}
                          onChange={(e) => setNamaIbu(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="reg-hp-ibu"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Nomor HP Ibu (Opsional)
                          </label>
                          <input
                            id="reg-hp-ibu"
                            type="tel"
                            placeholder="contoh: 081398765432"
                            value={noHpIbu}
                            onChange={(e) => setNoHpIbu(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="reg-pekerjaan-ibu"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Pekerjaan Ibu (Opsional)
                          </label>
                          <input
                            id="reg-pekerjaan-ibu"
                            type="text"
                            placeholder="contoh: Ibu Rumah Tangga / Guru"
                            value={pekerjaanIbu}
                            onChange={(e) => setPekerjaanIbu(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* C. Data Wali (Opsional) */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="block text-xs font-extrabold text-slate-900">
                          C. Data Wali (Opsional)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Kosongkan jika tidak ada wali terpisah
                        </span>
                      </div>
                      <div>
                        <label
                          htmlFor="reg-nama-wali"
                          className="block text-xs font-semibold text-slate-700 mb-1"
                        >
                          Nama Lengkap Wali
                        </label>
                        <input
                          id="reg-nama-wali"
                          type="text"
                          placeholder="contoh: H. Ridwan Kamil"
                          value={namaWaliOpsional}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNamaWaliOpsional(val);
                            if (
                              penanggungJawabAkun === "Wali" &&
                              val.trim().length < 3
                            ) {
                              setPenanggungJawabAkun("Ayah");
                            }
                          }}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="reg-hubungan-wali"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Hubungan dengan Santri
                          </label>
                          <input
                            id="reg-hubungan-wali"
                            type="text"
                            placeholder="contoh: Paman / Kakek / Kakak"
                            value={hubunganWaliDetail}
                            onChange={(e) => {
                              const val = e.target.value;
                              setHubunganWaliDetail(val);
                              if (
                                penanggungJawabAkun === "Wali" &&
                                val.trim().length < 2
                              ) {
                                setPenanggungJawabAkun("Ayah");
                              }
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="reg-hp-wali"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Nomor HP Wali
                          </label>
                          <input
                            id="reg-hp-wali"
                            type="tel"
                            placeholder="contoh: 081511223344"
                            value={noHpWaliOpsional}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNoHpWaliOpsional(val);
                              if (
                                penanggungJawabAkun === "Wali" &&
                                val.trim().length < 6
                              ) {
                                setPenanggungJawabAkun("Ayah");
                              }
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 min-h-[40px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Penanggung Jawab Akun Portal Wali (1:1) */}
                    <div className="rounded-xl bg-blue-50/60 border border-blue-200 p-4 space-y-3">
                      <div>
                        <label
                          htmlFor="reg-penanggung-jawab"
                          className="block text-xs font-extrabold text-blue-950 mb-1"
                        >
                          Penanggung Jawab Akun Portal Orang Tua/Wali (1:1) *
                        </label>
                        <select
                          id="reg-penanggung-jawab"
                          value={penanggungJawabAkun}
                          onChange={(e) =>
                            setPenanggungJawabAkun(e.target.value as "Ayah" | "Ibu" | "Wali")
                          }
                          className="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 min-h-[40px]"
                        >
                          <option value="Ayah">
                            Ayah ({namaAyah.trim() || "Nama Ayah"})
                          </option>
                          <option value="Ibu">
                            Ibu ({namaIbu.trim() || "Nama Ibu"})
                          </option>
                          <option value="Wali" disabled={!isWaliOpsionalComplete}>
                            Wali ({isWaliOpsionalComplete ? namaWaliOpsional.trim() : "Isi Data Wali lengkap untuk memilih Wali"})
                          </option>
                        </select>
                      </div>

                      <div className="rounded-lg bg-white border border-blue-100 p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Identitas Santri (Relasi 1:1):</span>
                          <strong className="text-slate-900">
                            {namaSantri.trim() || "-"} ({nis.trim() || "-"})
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Nama Akun Wali ({penanggungJawabAkun}):</span>
                          <strong className="text-blue-900">
                            {penanggungJawabAkun === "Ayah"
                              ? namaAyah.trim() || "-"
                              : penanggungJawabAkun === "Ibu"
                              ? namaIbu.trim() || "-"
                              : namaWaliOpsional.trim() || "-"}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between text-slate-600">
                          <span>Username &amp; Sandi Awal:</span>
                          <strong className="font-mono text-blue-900">{nis || "Sesuai NIS"}</strong>
                        </div>
                        <p className="text-[11px] text-slate-500 pt-1">
                          * Wajib mengganti kata sandi awal saat login pertama. Data Ayah, Ibu, dan Wali tetap tersimpan terpisah.
                        </p>
                      </div>
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

          {/* Toolbar Aksi Massal */}
          {selectedSantriIds.size > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl shadow-sm animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                  {selectedSantriIds.size}
                </span>
                <span className="text-xs font-bold text-emerald-900">
                  {selectedSantriIds.size} santri dipilih
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSantriIds(new Set())}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batalkan Pilihan
                </button>
                <button
                  type="button"
                  onClick={() => setBulkDeleteModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-sm cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Hapus yang Dipilih ({selectedSantriIds.size})</span>
                </button>
              </div>
            </div>
          )}

          {/* Tabel Santri */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredSantri.length > 0 &&
                          filteredSantri.every((s) => selectedSantriIds.has(s.id))
                        }
                        onChange={toggleSelectAllSantri}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        title="Pilih Semua Santri Terfilter"
                      />
                    </th>
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
                      <td colSpan={8} className="py-8 text-center text-slate-400">
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
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedSantriIds.has(s.id)}
                              onChange={() => toggleSelectSantri(s.id)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{s.nis}</td>
                          <td className="py-3 px-3 font-bold text-slate-900">{s.nama_lengkap}</td>
                          <td className="py-3 px-3 text-slate-600">
                            <div>{k?.nama_kelas || "-"}</div>
                            <div className="text-[10px] text-slate-400">{km?.nama_kamar || "-"}</div>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-800">
                            {w ? (
                              <div>
                                <div className="font-bold text-slate-900">
                                  {w.nama_lengkap}{" "}
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                    {w.penanggung_jawab || w.hubungan}
                                  </span>
                                </div>
                                {(w.nama_ayah || w.nama_ibu) && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Ayah: {w.nama_ayah || "-"} • Ibu: {w.nama_ibu || "-"}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-amber-700 italic">Belum ada</span>
                            )}
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
                            <div className="inline-flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => setDetailSantri(s)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                                title="Lihat Detail Santri"
                              >
                                Detail
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditSantriModal(s)}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                title="Edit Data Santri & Wali"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteSantriConfirm(s)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 cursor-pointer"
                                title="Hapus / Nonaktifkan Santri"
                              >
                                Hapus
                              </button>
                            </div>
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
                  <h3 className="font-extrabold text-sm text-slate-900">Daftar Master Kelas ({kelasList.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingKelas(null);
                    setNamaKelasInput("");
                    setKodeKelasInput("");
                    setWaliKelasInput("");
                    setTingkatKelasInput("7");
                    setKapasitasKelasInput(30);
                    setModalKelasOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[38px] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Kelas</span>
                </button>
              </div>

              {kelasList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-3 bg-slate-50/50">
                  <Building2 className="h-10 w-10 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">Belum Ada Master Ruang Kelas</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Tambahkan master kelas pertama (misal: Kelas VII-A, VIII-A, dst.) untuk memulai registrasi dan penempatan santri.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKelas(null);
                      setNamaKelasInput("");
                      setKodeKelasInput("");
                      setWaliKelasInput("");
                      setTingkatKelasInput("7");
                      setKapasitasKelasInput(30);
                      setModalKelasOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition shadow-sm cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Ruang Kelas Sekarang</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {kelasList.map((k) => {
                    const studentCount = santriList.filter((s) => s.kelas_id === k.id && s.status === "AKTIF").length;
                    return (
                      <div key={k.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                              {k.kode_kelas}
                            </span>
                            <span className="text-xs text-slate-500 font-semibold">{studentCount} / {k.kapasitas || 30} Santri</span>
                          </div>
                          <h4 className="font-extrabold text-sm text-slate-900">{k.nama_kelas}</h4>
                          <div className="text-[11px] text-slate-500 space-y-0.5">
                            <p>Tingkat {k.tingkat}</p>
                            {k.wali_kelas && <p className="truncate">Wali: <strong className="text-slate-700">{k.wali_kelas}</strong></p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKelas(k);
                              setNamaKelasInput(k.nama_kelas);
                              setKodeKelasInput(k.kode_kelas);
                              setTingkatKelasInput(String(k.tingkat));
                              setWaliKelasInput(k.wali_kelas || "");
                              setKapasitasKelasInput(k.kapasitas || 30);
                              setModalKelasOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteKelasConfirmModal(k)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Subtab Master Kamar */}
          {kelasKamarSubTab === "kamar" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Daftar Master Kamar Asrama ({kamarList.length})</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingKamar(null);
                    setNamaKamarInput("");
                    setKodeKamarInput("");
                    setGedungKamarInput("Gedung Putra Al-Faruq");
                    setJenisAsramaInput("L");
                    setMusyrifKamarInput("");
                    setKapasitasKamarInput(20);
                    setModalKamarOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 transition min-h-[38px] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Tambah Kamar</span>
                </button>
              </div>

              {kamarList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-3 bg-slate-50/50">
                  <Building2 className="h-10 w-10 text-slate-400 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">Belum Ada Master Kamar Asrama</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Tambahkan kamar asrama pertama untuk santri putra atau putri sebagai penempatan tempat tinggal santri.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKamar(null);
                      setNamaKamarInput("");
                      setKodeKamarInput("");
                      setGedungKamarInput("Gedung Putra Al-Faruq");
                      setJenisAsramaInput("L");
                      setMusyrifKamarInput("");
                      setKapasitasKamarInput(20);
                      setModalKamarOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition shadow-sm cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Kamar Asrama Sekarang</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {kamarList.map((km) => {
                    const occupants = santriList.filter((s) => s.kamar_id === km.id && s.status === "AKTIF").length;
                    return (
                      <div key={km.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded">
                              {km.kode_kamar}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                              km.jenis_asrama === "L" ? "bg-blue-50 text-blue-800 border-blue-200" : "bg-pink-50 text-pink-800 border-pink-200"
                            }`}>
                              {km.jenis_asrama === "L" ? "Asrama Putra" : "Asrama Putri"}
                            </span>
                          </div>
                          <h4 className="font-extrabold text-sm text-slate-900">{km.nama_kamar}</h4>
                          <div className="text-[11px] text-slate-500 space-y-0.5">
                            <p>{km.gedung_asrama}</p>
                            {km.musyrif && <p className="truncate">Musyrif: <strong className="text-slate-700">{km.musyrif}</strong></p>}
                          </div>
                          <div className="pt-1">
                            <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                              <span>Kapasitas</span>
                              <span className="font-semibold text-slate-700">{occupants} / {km.kapasitas} Santri</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  occupants >= km.kapasitas ? "bg-rose-600" : "bg-indigo-600"
                                }`}
                                style={{ width: `${Math.min(100, (occupants / km.kapasitas) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKamar(km);
                              setNamaKamarInput(km.nama_kamar);
                              setKodeKamarInput(km.kode_kamar);
                              setGedungKamarInput(km.gedung_asrama);
                              setJenisAsramaInput(km.jenis_asrama || "L");
                              setMusyrifKamarInput(km.musyrif || "");
                              setKapasitasKamarInput(km.kapasitas || 20);
                              setModalKamarOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-200 cursor-pointer"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteKamarConfirmModal(km)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB: MANAJEMEN PEMBIAYAAN SANTRI (TU)
         ===================================================================== */}
      {activeTab === "pembiayaan" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Pengajuan Jenis Pembiayaan Baru */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-amber-700" />
                  <h3 className="font-extrabold text-base text-slate-900">
                    Ajukan Pembiayaan Baru
                  </h3>
                </div>
              </div>

              <form onSubmit={handleCreatePembiayaanSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">Nama Pembiayaan *</label>
                  <input
                    type="text"
                    required
                    value={namaPembiayaan}
                    onChange={(e) => setNamaPembiayaan(e.target.value)}
                    placeholder="Contoh: SPP Bulanan Syawal 1447H"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Nominal (Rp) *</label>
                    <input
                      type="number"
                      required
                      min={1000}
                      value={nominalPembiayaan}
                      onChange={(e) => setNominalPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Kategori *</label>
                    <select
                      value={kategoriPembiayaan}
                      onChange={(e) => setKategoriPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      <option value="SPP">SPP Bulanan</option>
                      <option value="Pembangunan">Infaq / Pembangunan</option>
                      <option value="Kegiatan">Kegiatan Pesantren</option>
                      <option value="Buku">Buku &amp; Kitab</option>
                      <option value="Ujian">Ujian &amp; Sertifikasi</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Periode *</label>
                    <select
                      value={periodePembiayaan}
                      onChange={(e) => setPeriodePembiayaan(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      <option value="Bulanan">Bulanan</option>
                      <option value="Semester">Semester</option>
                      <option value="Tahunan">Tahunan</option>
                      <option value="Sekali Bayar">Sekali Bayar</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Batas Waktu (Jatuh Tempo) *</label>
                    <input
                      type="date"
                      required
                      value={jatuhTempoPembiayaan}
                      onChange={(e) => setJatuhTempoPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                {/* Sasaran Santri */}
                <div>
                  <label className="font-semibold text-slate-700">Sasaran Pembiayaan *</label>
                  <select
                    value={sasaranPembiayaan}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setSasaranPembiayaan(v);
                      if (v === "KELAS_TERTENTU") setTargetIdPembiayaan(kelasList[0]?.id || "");
                      if (v === "INDIVIDU") setTargetIdPembiayaan(santriList[0]?.id || "");
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium"
                  >
                    <option value="SEMUA">Seluruh Santri Aktif</option>
                    <option value="KELAS_TERTENTU">Kelas Tertentu</option>
                    <option value="INDIVIDU">Santri Tertentu (Individu)</option>
                  </select>
                </div>

                {sasaranPembiayaan === "KELAS_TERTENTU" && (
                  <div>
                    <label className="font-semibold text-slate-700">Pilih Kelas Sasaran *</label>
                    <select
                      value={targetIdPembiayaan}
                      onChange={(e) => setTargetIdPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {sasaranPembiayaan === "INDIVIDU" && (
                  <div>
                    <label className="font-semibold text-slate-700">Pilih Santri Sasaran *</label>
                    <select
                      value={targetIdPembiayaan}
                      onChange={(e) => setTargetIdPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      {santriList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nis} — {s.nama_lengkap}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Metode Pembayaran / Cicilan */}
                <div>
                  <label className="font-semibold text-slate-700">Metode Pembayaran *</label>
                  <select
                    value={kebijakanCicilanPembiayaan}
                    onChange={(e) => setKebijakanCicilanPembiayaan(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium"
                  >
                    <option value="BEBAS">Bisa Dicicil (Nominal Bebas)</option>
                    <option value="MINIMAL_NOMINAL">Bisa Dicicil (Ada Batas Minimal)</option>
                    <option value="TIDAK_BOLEH">Harus Dibayar Lunas Sekaligus</option>
                  </select>
                </div>

                {kebijakanCicilanPembiayaan === "MINIMAL_NOMINAL" && (
                  <div>
                    <label className="font-semibold text-slate-700">Minimal Nominal Cicilan (Rp) *</label>
                    <input
                      type="number"
                      required
                      min={1000}
                      value={minimalCicilanPembiayaan}
                      onChange={(e) => setMinimalCicilanPembiayaan(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-700">Keterangan Tambahan</label>
                  <textarea
                    rows={2}
                    value={deskripsiPembiayaan}
                    onChange={(e) => setDeskripsiPembiayaan(e.target.value)}
                    placeholder="Keterangan rincian pembiayaan..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingPembiayaan}
                  className="w-full rounded-xl bg-amber-700 py-2.5 font-bold text-white hover:bg-amber-800 transition min-h-[42px] cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {submittingPembiayaan ? "Mengajukan..." : "Ajukan Pembiayaan ke Pengasuh"}
                </button>
              </form>
            </div>

            {/* Tabel Daftar Seluruh Pembiayaan */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Daftar Jenis Pembiayaan Santri
                  </h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {jenisPembayaranList.length} Pembiayaan
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Nama &amp; Kode</th>
                      <th className="px-3 py-2.5">Nominal</th>
                      <th className="px-3 py-2.5">Sasaran</th>
                      <th className="px-3 py-2.5">Metode</th>
                      <th className="px-3 py-2.5">Status Persetujuan</th>
                      <th className="px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jenisPembayaranList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                          Belum ada data pembiayaan santri.
                        </td>
                      </tr>
                    ) : (
                      jenisPembayaranList.map((jp) => {
                        const isApproved = jp.status_persetujuan === "DISETUJUI";
                        const isRejected = jp.status_persetujuan === "DITOLAK";
                        const isPending = !jp.status_persetujuan || jp.status_persetujuan === "MENUNGGU_PERSETUJUAN";

                        return (
                          <tr key={jp.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              <div>{jp.nama_pembayaran}</div>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {jp.kode_pembayaran} • {jp.kategori}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-emerald-800">
                              {formatRupiah(jp.nominal)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">{getSasaranLabel(jp)}</td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {jp.kebijakan_cicilan === "TIDAK_BOLEH" ? "Harus Lunas" : "Bisa Dicicil"}
                            </td>
                            <td className="px-3 py-2.5">
                              {isApproved && (
                                <span className="inline-flex rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                                  ✓ DISETUJUI
                                </span>
                              )}
                              {isPending && (
                                <span className="inline-flex rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                                  ⏳ MENUNGGU PERSETUJUAN
                                </span>
                              )}
                              {isRejected && (
                                <div>
                                  <span className="inline-flex rounded-full bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 text-[10px] font-bold">
                                    ✕ DITOLAK
                                  </span>
                                  {jp.catatan_persetujuan && (
                                    <span className="block text-[10px] text-rose-700 mt-0.5 line-clamp-1 italic">
                                      Catatan: {jp.catatan_persetujuan}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Tombol Edit */}
                                <button
                                  type="button"
                                  disabled={isApproved}
                                  onClick={() => {
                                    setEditPembiayaanModal(jp);
                                    setEditNamaFee(jp.nama_pembayaran);
                                    setEditNominalFee(jp.nominal);
                                    setEditDeskripsiFee(jp.deskripsi);
                                    setEditJatuhTempoFee(jp.tanggal_jatuh_tempo);
                                    setEditKebijakanCicilanFee(jp.kebijakan_cicilan);
                                    setEditMinCicilanFee(jp.minimal_nominal_cicilan);
                                  }}
                                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={isApproved ? "Pembiayaan yang telah disetujui tidak dapat diedit" : "Edit Pembiayaan"}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>

                                {/* Tombol Hapus */}
                                <button
                                  type="button"
                                  disabled={isApproved}
                                  onClick={() => setDeleteFeeConfirmModal(jp)}
                                  className="p-1 rounded-lg hover:bg-rose-50 text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title={
                                    isApproved
                                      ? "Pembiayaan yang telah disetujui tidak dapat dihapus demi integritas data keuangan."
                                      : "Hapus Pembiayaan"
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
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
        </div>
      )}

      {/* =====================================================================
          TAB: MANAJEMEN PELANGGARAN SANTRI (TU)
         ===================================================================== */}
      {activeTab === "pelanggaran" && (
        <div className="space-y-6">
          {/* Subtab Catatan Pelanggaran vs Master Kategori */}
          <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2">
            <button
              type="button"
              onClick={() => setPelanggaranSubTab("catatan")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                pelanggaranSubTab === "catatan"
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>(A) Catatan Pelanggaran &amp; Pembinaan Santri</span>
            </button>
            <button
              type="button"
              onClick={() => setPelanggaranSubTab("master")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                pelanggaranSubTab === "master"
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>(B) Master Kategori Pelanggaran ({masterPelanggaranList.length})</span>
            </button>
          </div>

          {/* SUBTAB A: CATATAN PELANGGARAN */}
          {pelanggaranSubTab === "catatan" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form Catat Pelanggaran Baru */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-extrabold text-base text-slate-900">
                    Catat Pelanggaran Santri
                  </h3>
                </div>

                <form onSubmit={handleCreatePelanggaranSubmit} className="space-y-3.5 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700">Pilih Santri *</label>
                    <select
                      value={santriPelanggaran}
                      onChange={(e) => setSantriPelanggaran(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      {santriList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nis} — {s.nama_lengkap} ({getSantriKelasName(s.id)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-semibold text-slate-700">Tanggal Kejadian *</label>
                      <input
                        type="date"
                        required
                        value={tanggalPelanggaran}
                        onChange={(e) => setTanggalPelanggaran(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700">Waktu Kejadian</label>
                      <input
                        type="time"
                        value={waktuPelanggaran}
                        onChange={(e) => setWaktuPelanggaran(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">Kategori Pelanggaran *</label>
                    <select
                      value={kategoriPelanggaranId}
                      onChange={(e) => setKategoriPelanggaranId(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium"
                    >
                      {activeKategoriList.map((k) => (
                        <option key={k.id} value={k.id}>
                          [{k.tingkat_pelanggaran}] {k.nama_kategori} ({k.poin_pembinaan} Poin)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">Uraian Kejadian *</label>
                    <textarea
                      rows={3}
                      required
                      value={deskripsiPelanggaran}
                      onChange={(e) => setDeskripsiPelanggaran(e.target.value)}
                      placeholder="Jelaskan kronologi atau bentuk pelanggaran yang dilakukan santri..."
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">Tindak Lanjut Langsung *</label>
                    <input
                      type="text"
                      required
                      value={tindakLanjutPelanggaran}
                      onChange={(e) => setTindakLanjutPelanggaran(e.target.value)}
                      placeholder="Contoh: Panggilan wali / skorsing / murojaah mandiri"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700">Catatan Pembinaan *</label>
                    <textarea
                      rows={2}
                      required
                      value={catatanPembinaanPelanggaran}
                      onChange={(e) => setCatatanPembinaanPelanggaran(e.target.value)}
                      placeholder="Hasil pembinaan musyrif / asatidz..."
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-purple-700 py-2.5 font-bold text-white hover:bg-purple-800 transition min-h-[42px] cursor-pointer shadow-sm"
                  >
                    Simpan Catatan Pelanggaran
                  </button>
                </form>
              </div>

              {/* Tabel Riwayat Pelanggaran */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">
                      Riwayat Pelanggaran Santri
                    </h3>
                  </div>
                </div>

                {/* Filter Pelanggaran */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Cari nama santri..."
                      value={filterSantriPelanggaran}
                      onChange={(e) => setFilterSantriPelanggaran(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 min-h-[38px]"
                    />
                  </div>
                  <select
                    value={filterKelasPelanggaran}
                    onChange={(e) => setFilterKelasPelanggaran(e.target.value)}
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
                    value={filterTingkatPelanggaran}
                    onChange={(e) => setFilterTingkatPelanggaran(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                  >
                    <option value="all">Semua Tingkat</option>
                    <option value="RINGAN">Ringan</option>
                    <option value="SEDANG">Sedang</option>
                    <option value="BERAT">Berat</option>
                  </select>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Santri</th>
                        <th className="px-3 py-2.5">Tanggal</th>
                        <th className="px-3 py-2.5">Kategori &amp; Tingkat</th>
                        <th className="px-3 py-2.5">Tindak Lanjut</th>
                        <th className="px-3 py-2.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRekapPelanggaran.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                            Tidak ada catatan pelanggaran yang sesuai filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRekapPelanggaran.map((kd) => {
                          const s = santriList.find((x) => x.id === kd.santri_id);
                          return (
                            <tr key={kd.id} className="hover:bg-slate-50/80 transition">
                              <td className="px-3.5 py-2.5 font-bold text-slate-900">
                                <div>{s?.nama_lengkap || kd.santri_id}</div>
                                <span className="text-[10px] text-slate-400 font-mono font-normal">
                                  {s?.nis} • {getSantriKelasName(kd.santri_id)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">
                                {formatTanggal(kd.tanggal_kejadian)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-semibold text-slate-900 block">
                                  {kd.nama_kategori}
                                </span>
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.2 text-[9px] font-bold mt-0.5 ${
                                    kd.tingkat_pelanggaran === "BERAT"
                                      ? "bg-rose-100 text-rose-800 border border-rose-300"
                                      : kd.tingkat_pelanggaran === "SEDANG"
                                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                                      : "bg-blue-100 text-blue-800 border border-blue-300"
                                  }`}
                                >
                                  {kd.tingkat_pelanggaran}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-600 line-clamp-1 max-w-[200px]">
                                {kd.tindak_lanjut}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setDetailPelanggaranModal(kd)}
                                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
                                    title="Lihat Detail Riwayat"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditPelanggaranModal(kd)}
                                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
                                    title="Edit Catatan"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletePelanggaranConfirmModal(kd)}
                                    className="p-1 rounded-lg hover:bg-rose-50 text-rose-600"
                                    title="Hapus Aman"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
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

          {/* SUBTAB B: MASTER KATEGORI PELANGGARAN */}
          {pelanggaranSubTab === "master" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Master Kategori Pelanggaran Santri
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kamus pelanggaran, tingkat keparahan, poin pembinaan, &amp; standar sanksi
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedKatIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteKatModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-800 transition cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Hapus ({selectedKatIds.length}) Kategori</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setNewKodeKat(`KAT-${Date.now().toString().slice(-4)}`);
                      setNewNamaKat("");
                      setNewTingkatKat("RINGAN");
                      setNewPoinKat(5);
                      setNewStandarTindakKat("");
                      setModalTambahKatOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-800 transition cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Tambah Kategori Baru</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={
                            masterPelanggaranList.length > 0 &&
                            masterPelanggaranList.every((k) => selectedKatIds.includes(k.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKatIds(masterPelanggaranList.map((k) => k.id));
                            } else {
                              setSelectedKatIds([]);
                            }
                          }}
                        />
                      </th>
                      <th className="px-3 py-2.5">Kode &amp; Nama Kategori</th>
                      <th className="px-3 py-2.5">Tingkat</th>
                      <th className="px-3 py-2.5">Poin</th>
                      <th className="px-3 py-2.5">Standar Tindak Lanjut</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {masterPelanggaranList.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-3.5 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedKatIds.includes(k.id)}
                            onChange={() => {
                              setSelectedKatIds((prev) =>
                                prev.includes(k.id) ? prev.filter((x) => x !== k.id) : [...prev, k.id]
                              );
                            }}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900">
                          <div>{k.nama_kategori}</div>
                          <span className="text-[10px] text-slate-400 font-mono font-normal">
                            {k.kode_kategori}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${
                              k.tingkat_pelanggaran === "BERAT"
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : k.tingkat_pelanggaran === "SEDANG"
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-blue-100 text-blue-800 border border-blue-300"
                            }`}
                          >
                            {k.tingkat_pelanggaran}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-700">
                          {k.poin_pembinaan} Poin
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 line-clamp-1 max-w-[250px]">
                          {k.standar_tindak_lanjut}
                        </td>
                        <td className="px-3 py-2.5">
                          {k.is_active !== false ? (
                            <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                              Aktif
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                              Nonaktif
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditKatModal(k)}
                              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
                              title="Edit Kategori"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedKatIds([k.id]);
                                setBulkDeleteKatModalOpen(true);
                              }}
                              className="p-1 rounded-lg hover:bg-rose-50 text-rose-600"
                              title="Hapus Aman"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB: PENGUMUMAN WALI SANTRI (TU)
         ===================================================================== */}
      {activeTab === "pengumuman" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form Tambah Pengumuman */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-blue-700" />
                  <h3 className="font-extrabold text-base text-slate-900">
                    Buat Pengumuman Wali Santri
                  </h3>
                </div>
              </div>

              <form onSubmit={handleCreatePengumumanSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">Judul Pengumuman *</label>
                  <input
                    type="text"
                    required
                    value={judulPengumuman}
                    onChange={(e) => setJudulPengumuman(e.target.value)}
                    placeholder="Contoh: Jadwal Libur Awal Ramadhan 1447H"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Kategori *</label>
                    <select
                      value={kategoriPengumuman}
                      onChange={(e) => setKategoriPengumuman(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      <option value="Umum">Umum</option>
                      <option value="Kegiatan Pesantren">Kegiatan Pesantren</option>
                      <option value="Akademik">Akademik</option>
                      <option value="Keuangan">Keuangan</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Masa Berlaku *</label>
                    <input
                      type="date"
                      required
                      value={masaBerlakuPengumuman}
                      onChange={(e) => setMasaBerlakuPengumuman(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700">Sasaran *</label>
                    <select
                      value={sasaranPengumuman}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setSasaranPengumuman(val);
                        if (val === "KELAS") setTargetIdPengumuman(kelasList[0]?.id || "");
                        if (val === "SANTRI") setTargetIdPengumuman(santriList[0]?.id || "");
                      }}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium"
                    >
                      <option value="SEMUA">Semua Wali Santri</option>
                      <option value="KELAS">Kelas Tertentu</option>
                      <option value="SANTRI">Santri Tertentu</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700">Status *</label>
                    <select
                      value={statusPublikasiPengumuman}
                      onChange={(e) => setStatusPublikasiPengumuman(e.target.value as any)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-medium"
                    >
                      <option value="PUBLIKASI">Langsung Publikasi</option>
                      <option value="DRAF">Simpan Sebagai Draf</option>
                    </select>
                  </div>
                </div>

                {sasaranPengumuman === "KELAS" && (
                  <div>
                    <label className="font-semibold text-slate-700">Pilih Kelas *</label>
                    <select
                      value={targetIdPengumuman}
                      onChange={(e) => setTargetIdPengumuman(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {sasaranPengumuman === "SANTRI" && (
                  <div>
                    <label className="font-semibold text-slate-700">Pilih Santri *</label>
                    <select
                      value={targetIdPengumuman}
                      onChange={(e) => setTargetIdPengumuman(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      {santriList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nis} — {s.nama_lengkap}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-700">Isi Pengumuman *</label>
                  <textarea
                    rows={4}
                    required
                    value={isiPengumuman}
                    onChange={(e) => setIsiPengumuman(e.target.value)}
                    placeholder="Tuliskan isi pengumuman lengkap untuk wali santri..."
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pentingCheck"
                    checked={isPentingPengumuman}
                    onChange={(e) => setIsPentingPengumuman(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <label htmlFor="pentingCheck" className="font-semibold text-slate-700 cursor-pointer">
                    Tandai sebagai Pengumuman Penting
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-700 py-2.5 font-bold text-white hover:bg-blue-800 transition min-h-[42px] cursor-pointer shadow-sm"
                >
                  Simpan Pengumuman
                </button>
              </form>
            </div>

            {/* List Pengumuman */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Daftar Pengumuman Pesantren
                  </h3>
                </div>
              </div>

              <div className="space-y-3">
                {pengumumanList.map((p) => {
                  const isDraf = p.status_publikasi === "DRAF" || !p.is_published;
                  const isExpired = p.masa_berlaku && p.masa_berlaku < new Date().toISOString().slice(0, 10);

                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-200 p-4 space-y-2 hover:border-slate-300 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                            {p.kategori}
                          </span>
                          <span className="rounded bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold">
                            Sasaran: {p.sasaran || "SEMUA"}
                          </span>
                          {p.is_penting && (
                            <span className="rounded bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-bold">
                              ★ Penting
                            </span>
                          )}
                          {isDraf ? (
                            <span className="rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                              DRAF
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                              PUBLIKASI
                            </span>
                          )}
                          {isExpired && (
                            <span className="rounded bg-slate-200 text-slate-600 px-2 py-0.5 text-[10px]">
                              Kadaluarsa
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditPengumumanModal(p)}
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
                            title="Edit Pengumuman"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletePengumumanConfirmModal(p)}
                            className="p-1 rounded-lg hover:bg-rose-50 text-rose-600"
                            title="Hapus Pengumuman"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-extrabold text-sm text-slate-900">{p.judul}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                        {p.isi}
                      </p>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                        <span>Diterbitkan: {formatTanggal(p.tanggal_publikasi)}</span>
                        {p.masa_berlaku && (
                          <span>Masa Berlaku s/d: {formatTanggal(p.masa_berlaku)}</span>
                        )}
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
          TAB: REKAPITULASI & LAPORAN LENGKAP (TU)
         ===================================================================== */}
      {activeTab === "rekapitulasi" && (
        <div className="space-y-6">
          {/* Subtabs Rekapitulasi */}
          <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2">
            <button
              type="button"
              onClick={() => setRekapSubTab("pembiayaan")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                rekapSubTab === "pembiayaan"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Receipt className="h-4 w-4" />
              <span>(1) Rekapitulasi Pembiayaan &amp; SPP ({filteredRekapTagihan.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRekapSubTab("mengaji")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                rekapSubTab === "mengaji"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>(2) Rekapitulasi Perkembangan Mengaji ({filteredRekapMengaji.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRekapSubTab("pelanggaran")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                rekapSubTab === "pelanggaran"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>(3) Rekapitulasi Pelanggaran ({filteredRekapPelanggaran.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRekapSubTab("santri_lengkap")}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
                rekapSubTab === "santri_lengkap"
                  ? "border-teal-600 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>(4) Riwayat Lengkap Per Santri</span>
            </button>
          </div>

          {/* 1. REKAP PEMBIAYAAN */}
          {rekapSubTab === "pembiayaan" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Rekapitulasi Pembiayaan &amp; SPP Santri
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={exportRekapPembiayaanToExcel}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari santri / NIS..."
                    value={rekapFeeSantri}
                    onChange={(e) => setRekapFeeSantri(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 min-h-[38px]"
                  />
                </div>
                <select
                  value={rekapFeeKelas}
                  onChange={(e) => setRekapFeeKelas(e.target.value)}
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
                  value={rekapFeeStatus}
                  onChange={(e) => setRekapFeeStatus(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                >
                  <option value="all">Semua Status Tagihan</option>
                  <option value="LUNAS">Lunas</option>
                  <option value="DIBAYAR_SEBAGIAN">Dicicil / Sebagian</option>
                  <option value="BELUM_BAYAR">Belum Bayar</option>
                </select>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Santri</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Tagihan &amp; Periode</th>
                      <th className="px-3 py-2.5">Total Tagihan</th>
                      <th className="px-3 py-2.5">Terbayar</th>
                      <th className="px-3 py-2.5">Sisa Tunggakan</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRekapTagihan.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                          Tidak ditemukan data tagihan sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRekapTagihan.map((t) => {
                        const s = santriList.find((x) => x.id === t.santri_id);
                        const jp = jenisPembayaranList.find((x) => x.id === t.jenis_pembayaran_id);
                        return (
                          <tr key={t.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              <div>{s?.nama_lengkap || t.santri_id}</div>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {s?.nis}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 font-medium">
                              {getSantriKelasName(t.santri_id)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-slate-900 block">
                                {jp?.nama_pembayaran || "Tagihan"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {t.periode_label} • Jatuh Tempo: {formatTanggal(t.tanggal_jatuh_tempo)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {formatRupiah(t.nominal_tagihan)}
                            </td>
                            <td className="px-3 py-2.5 font-bold text-emerald-700">
                              {formatRupiah(t.total_terbayar)}
                            </td>
                            <td className="px-3 py-2.5 font-bold text-rose-700">
                              {formatRupiah(t.sisa_tagihan)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                  t.status === "LUNAS"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : t.status === "DIBAYAR_SEBAGIAN"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {t.status}
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
          )}

          {/* 2. REKAP MENGAJI */}
          {rekapSubTab === "mengaji" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Rekapitulasi Perkembangan Mengaji Santri
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={exportRekapMengajiToExcel}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari santri / NIS..."
                    value={rekapNgjSantri}
                    onChange={(e) => setRekapNgjSantri(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 min-h-[38px]"
                  />
                </div>
                <select
                  value={rekapNgjKelas}
                  onChange={(e) => setRekapNgjKelas(e.target.value)}
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
                  value={rekapNgjPeriode}
                  onChange={(e) => setRekapNgjPeriode(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                >
                  <option value="all">Semua Periode</option>
                  <option value="2026-11">November 2026</option>
                  <option value="2026-10">Oktober 2026</option>
                  <option value="2026-09">September 2026</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Santri</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Tingkat &amp; Materi</th>
                      <th className="px-2.5 py-2.5">Kelancaran</th>
                      <th className="px-2.5 py-2.5">Makharij</th>
                      <th className="px-2.5 py-2.5">Tajwid</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Pembimbing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRekapMengaji.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                          Tidak ditemukan data perkembangan mengaji sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRekapMengaji.map((m) => {
                        const s = santriList.find((x) => x.id === m.santri_id);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              <div>{s?.nama_lengkap || m.santri_id}</div>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {s?.nis}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 font-medium">
                              {getSantriKelasName(m.santri_id)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-slate-900 block">{m.tingkat_jilid}</span>
                              <span className="text-[10px] text-slate-400 line-clamp-1">{m.materi_terakhir}</span>
                            </td>
                            <td className="px-2.5 py-2.5">
                              <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold">
                                {m.kelancaran_bacaan}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5">
                              <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[10px] font-bold">
                                {m.makharijul_huruf}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5">
                              <span className="rounded bg-indigo-100 text-indigo-800 px-1.5 py-0.5 text-[10px] font-bold">
                                {m.tajwid}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                              {formatTanggal(m.tanggal_penilaian)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 font-medium">
                              {m.pembimbing_name}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. REKAP PELANGGARAN */}
          {rekapSubTab === "pelanggaran" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Rekapitulasi Pelanggaran &amp; Pembinaan Santri
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={exportRekapPelanggaranToExcel}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800 transition cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Ekspor Excel (.xlsx)</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari santri / NIS..."
                    value={rekapDslSantri}
                    onChange={(e) => setRekapDslSantri(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 min-h-[38px]"
                  />
                </div>
                <select
                  value={rekapDslKelas}
                  onChange={(e) => setRekapDslKelas(e.target.value)}
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
                  value={rekapDslTingkat}
                  onChange={(e) => setRekapDslTingkat(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 min-h-[38px]"
                >
                  <option value="all">Semua Tingkat</option>
                  <option value="RINGAN">Ringan</option>
                  <option value="SEDANG">Sedang</option>
                  <option value="BERAT">Berat</option>
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Santri</th>
                      <th className="px-3 py-2.5">Kelas</th>
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Kategori Pelanggaran</th>
                      <th className="px-3 py-2.5">Tingkat</th>
                      <th className="px-3 py-2.5">Tindak Lanjut</th>
                      <th className="px-3 py-2.5">Status Pembinaan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRekapPelanggaran.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                          Tidak ditemukan data pelanggaran santri sesuai filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRekapPelanggaran.map((kd) => {
                        const s = santriList.find((x) => x.id === kd.santri_id);
                        return (
                          <tr key={kd.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-3.5 py-2.5 font-bold text-slate-900">
                              <div>{s?.nama_lengkap || kd.santri_id}</div>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {s?.nis}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 font-medium">
                              {getSantriKelasName(kd.santri_id)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                              {formatTanggal(kd.tanggal_kejadian)}
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">
                              {kd.nama_kategori}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
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
                            <td className="px-3 py-2.5 text-slate-600 line-clamp-1 max-w-[200px]">
                              {kd.tindak_lanjut}
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-700">
                              {kd.status_tindak_lanjut}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. RIWAYAT LENGKAP PER SANTRI */}
          {rekapSubTab === "santri_lengkap" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Rekapitulasi Riwayat Lengkap Per Santri
                  </h3>
                </div>

                <div className="w-full sm:w-72">
                  <select
                    value={selectedSantriDetailId}
                    onChange={(e) => setSelectedSantriDetailId(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-900"
                  >
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.nama_lengkap}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rangkuman 4 Dimensi Santri Terpilih */}
              {(() => {
                const s = santriList.find((x) => x.id === selectedSantriDetailId);
                if (!s) return null;
                const k = kelasList.find((x) => x.id === s.kelas_id);
                const km = kamarList.find((x) => x.id === s.kamar_id);
                const w = waliList.find((x) => x.santri_id === s.id);
                const sTagihan = tagihanList.filter((t) => t.santri_id === s.id);
                const sMengaji = mengajiList.filter((m) => m.santri_id === s.id);
                const sPelanggaran = kedisiplinanList.filter((kd) => kd.santri_id === s.id);

                return (
                  <div className="space-y-5 text-xs">
                    {/* Header Profil Singkat */}
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <span className="text-slate-400 block">Nama Lengkap:</span>
                        <strong className="text-slate-900 text-sm">{s.nama_lengkap}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">NIS &amp; Kelas:</span>
                        <strong className="text-slate-800">{s.nis} • {k?.nama_kelas || "-"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Kamar Asrama:</span>
                        <strong className="text-slate-800">{km?.nama_kamar || "-"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Wali Santri:</span>
                        <strong className="text-slate-800">{w?.nama_lengkap || "-"} ({w?.no_telepon || "-"})</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Riwayat Tagihan SPP */}
                      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <strong className="text-slate-900">Tagihan &amp; SPP ({sTagihan.length})</strong>
                          <Receipt className="h-4 w-4 text-emerald-700" />
                        </div>
                        {sTagihan.length === 0 ? (
                          <p className="text-slate-400 italic py-2">Tidak ada tagihan.</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {sTagihan.map((t) => (
                              <div key={t.id} className="p-2 bg-slate-50 rounded border border-slate-100">
                                <div className="font-semibold text-slate-800">{t.periode_label}</div>
                                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                                  <span>Tagihan: {formatRupiah(t.nominal_tagihan)}</span>
                                  <span className="font-bold text-rose-700">Sisa: {formatRupiah(t.sisa_tagihan)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Riwayat Mengaji */}
                      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <strong className="text-slate-900">Evaluasi Mengaji ({sMengaji.length})</strong>
                          <BookOpen className="h-4 w-4 text-blue-700" />
                        </div>
                        {sMengaji.length === 0 ? (
                          <p className="text-slate-400 italic py-2">Belum ada evaluasi mengaji.</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {sMengaji.map((m) => (
                              <div key={m.id} className="p-2 bg-slate-50 rounded border border-slate-100">
                                <div className="font-semibold text-slate-800">{m.tingkat_jilid}</div>
                                <div className="text-[11px] text-slate-500">{m.materi_terakhir}</div>
                                <div className="text-[10px] text-emerald-800 font-bold mt-1">
                                  {m.kelancaran_bacaan} • {m.makharijul_huruf} • {m.tajwid}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Riwayat Pelanggaran */}
                      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <strong className="text-slate-900">Catatan Pelanggaran ({sPelanggaran.length})</strong>
                          <ShieldAlert className="h-4 w-4 text-rose-700" />
                        </div>
                        {sPelanggaran.length === 0 ? (
                          <p className="text-slate-400 italic py-2">Tidak ada catatan pelanggaran.</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {sPelanggaran.map((kd) => (
                              <div key={kd.id} className="p-2 bg-slate-50 rounded border border-slate-100">
                                <div className="font-semibold text-slate-800">{kd.nama_kategori}</div>
                                <div className="text-[11px] text-slate-500">{kd.deskripsi}</div>
                                <div className="text-[10px] text-purple-800 font-bold mt-1">
                                  {kd.tingkat_pelanggaran} • {kd.status_tindak_lanjut}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB: PENGATURAN PROFIL PESANTREN (TU)
         ===================================================================== */}
      {activeTab === "profil_pesantren" && (
        <div className="space-y-6">
          {/* Header Card Profil */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  Profil Pesantren &amp; Tahun Pelajaran Aktif
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 border border-slate-200">
                  Tahun Aktif: <strong className="text-blue-900">{profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})</strong>
                </span>
              </div>
            </div>

            {/* Formulir Pengaturan Profil */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setConfirmSaveProfilOpen(true);
              }}
              className="mt-6 space-y-6 text-xs"
            >
              {/* Bagian 1: Tahun Pelajaran & Semester */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-blue-200/60 pb-2">
                  <Calendar className="h-4 w-4 text-blue-700" />
                  <h4 className="font-extrabold text-xs text-blue-950 uppercase tracking-wider">
                    1. Tahun Pelajaran &amp; Semester Aktif
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Pilih Tahun Pelajaran Aktif <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={selectedTahunAjaranId}
                      onChange={(e) => setSelectedTahunAjaranId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 focus:border-blue-600 focus:outline-none min-h-[42px]"
                    >
                      {tahunAjaranList.length === 0 ? (
                        <option value="">
                          Tahun Pelajaran {profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} (Tahun Aktif Terdaftar di Profil)
                        </option>
                      ) : (
                        tahunAjaranList.map((ta) => (
                          <option key={ta.id} value={ta.id}>
                            Tahun Pelajaran {ta.nama} {ta.is_active ? "(Sedang Aktif Saat Ini)" : ""}
                          </option>
                        ))
                      )}
                    </select>
                    {tahunAjaranList.length === 0 ? (
                      <p className="mt-1.5 rounded-lg bg-amber-50 p-2 text-[11px] font-medium text-amber-900 border border-amber-200">
                        ℹ️ Belum ada data master tahun pelajaran di tabel database. Profil saat ini menggunakan tahun acuan <strong>{profilPesantren?.tahun_pelajaran_aktif || "2024/2025"}</strong>. Admin atau Superadmin dapat menambahkan tahun pelajaran baru melalui menu Master Data.
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Tahun pelajaran yang dipilih akan menjadi acuan aktif pada seluruh modul akademik &amp; tagihan.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Semester Aktif <span className="text-slate-400 font-normal">(Dikelola via Master Data)</span>
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-xs font-bold text-slate-700 min-h-[42px]">
                      <span>Semester {profilPesantren?.semester_aktif || "Ganjil"}</span>
                      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 font-semibold">
                        Sistem Terpusat
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Semester aktif dikelola secara khusus oleh Pengasuh (Admin) atau Superadmin melalui menu <strong>Master Data Tahun Pelajaran</strong> via RPC resmi database.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bagian 2: Identitas Resmi Pesantren */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Building2 className="h-4 w-4 text-emerald-800" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    2. Identitas Lembaga Pesantren
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">
                      Nama Resmi Lembaga Pesantren <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={namaResmiProfil}
                      onChange={(e) => setNamaResmiProfil(e.target.value)}
                      placeholder="contoh: Pondok Pesantren Modern Abu Manshur"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Nama Pengasuh / Pimpinan Pondok
                    </label>
                    <input
                      type="text"
                      value={pengasuhProfil}
                      onChange={(e) => setPengasuhProfil(e.target.value)}
                      placeholder="contoh: Kyai Abu Manshur"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      NSPP (Nomor Statistik Pondok Pesantren)
                    </label>
                    <input
                      type="text"
                      value={nsppProfil}
                      onChange={(e) => setNsppProfil(e.target.value)}
                      placeholder="contoh: 510032090045"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Status Akreditasi
                    </label>
                    <input
                      type="text"
                      value={akreditasiProfil}
                      onChange={(e) => setAkreditasiProfil(e.target.value)}
                      placeholder="contoh: Terakreditasi A"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="font-bold text-slate-700 block mb-1">
                      Nomor SK Izin Operasional / Pendirian
                    </label>
                    <input
                      type="text"
                      value={skPendirianProfil}
                      onChange={(e) => setSkPendirianProfil(e.target.value)}
                      placeholder="contoh: Kd.10.09/4/PP.00.7/1335/2010"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-medium text-slate-900 focus:border-blue-600 focus:outline-none min-h-[40px]"
                    />
                  </div>
                </div>
              </div>

              {/* Bagian 3: Alamat Pesantren */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <MapPin className="h-4 w-4 text-rose-700" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    3. Alamat Lengkap Pesantren
                  </h4>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Alamat Jalan &amp; Kompleks Pesantren <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={alamatProfil}
                      onChange={(e) => setAlamatProfil(e.target.value)}
                      placeholder="contoh: Jl. Nyi Ageng Serang, Sindangmekar, Kec. Dukupuntang, Kabupaten Cirebon, Jawa Barat 45652"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kelurahan / Desa</label>
                      <input
                        type="text"
                        value={kelurahanProfil}
                        onChange={(e) => setKelurahanProfil(e.target.value)}
                        placeholder="Sindangmekar"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kecamatan</label>
                      <input
                        type="text"
                        value={kecamatanProfil}
                        onChange={(e) => setKecamatanProfil(e.target.value)}
                        placeholder="Dukupuntang"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kabupaten / Kota</label>
                      <input
                        type="text"
                        value={kabupatenProfil}
                        onChange={(e) => setKabupatenProfil(e.target.value)}
                        placeholder="Kabupaten Cirebon"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Provinsi</label>
                      <input
                        type="text"
                        value={provinsiProfil}
                        onChange={(e) => setProvinsiProfil(e.target.value)}
                        placeholder="Jawa Barat"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Kode Pos</label>
                      <input
                        type="text"
                        value={kodePosProfil}
                        onChange={(e) => setKodePosProfil(e.target.value)}
                        placeholder="45652"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bagian 4: Kontak & Media Komunikasi */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Phone className="h-4 w-4 text-teal-700" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    4. Kontak Sekretariat &amp; Komunikasi
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Nomor Telepon / Hotline</label>
                    <input
                      type="text"
                      value={teleponProfil}
                      onChange={(e) => setTeleponProfil(e.target.value)}
                      placeholder="(0231) 8303388"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Email Resmi Sekretariat</label>
                    <input
                      type="email"
                      value={emailProfil}
                      onChange={(e) => setEmailProfil(e.target.value)}
                      placeholder="sekretariat@abumanshur.sch.id"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Website Resmi</label>
                    <input
                      type="text"
                      value={websiteProfil}
                      onChange={(e) => setWebsiteProfil(e.target.value)}
                      placeholder="https://abumanshur.sch.id"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Bagian 5: Informasi Umum */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <FileText className="h-4 w-4 text-indigo-700" />
                  <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                    5. Informasi Umum &amp; Komitmen Lembaga
                  </h4>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Deskripsi Ringkas &amp; Informasi Umum Pesantren
                  </label>
                  <textarea
                    rows={3}
                    value={informasiUmumProfil}
                    onChange={(e) => setInformasiUmumProfil(e.target.value)}
                    placeholder="Tuliskan deskripsi ringkas, visi, atau komitmen pondok pesantren..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Tombol Aksi Simpan */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0" />
                  <span>Perubahan profil akan tersimpan permanen dan tersinkronisasi di seluruh portal.</span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (profilPesantren) {
                        setNamaResmiProfil(profilPesantren.nama_resmi || "");
                        setAlamatProfil(profilPesantren.alamat || "");
                        setTeleponProfil(profilPesantren.no_telepon || "");
                        setEmailProfil(profilPesantren.email || "");
                        setWebsiteProfil(profilPesantren.website || "");
                        setNsppProfil(profilPesantren.nspp || "");
                        setAkreditasiProfil(profilPesantren.akreditasi || "");
                        setSkPendirianProfil(profilPesantren.sk_pendirian || "");
                        setInformasiUmumProfil(profilPesantren.informasi_umum || "");
                      }
                      setFeedback({ ok: true, text: "Formulir profil diatur ulang ke data tersimpan." });
                    }}
                    className="flex-1 sm:flex-none rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition min-h-[42px] cursor-pointer"
                  >
                    Batal / Reset
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfil}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-blue-800 transition disabled:opacity-50 min-h-[42px] cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    <span>{savingProfil ? "Menyimpan..." : "Simpan Perubahan Profil"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Modal Konfirmasi Penyimpanan Profil */}
          {confirmSaveProfilOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900">Konfirmasi Simpan Profil Pesantren</h3>
                    <p className="text-xs text-slate-500">Pondok Pesantren Modern Abu Manshur</p>
                  </div>
                </div>

                <div className="space-y-3 text-xs text-slate-600 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <p>
                    Anda akan memperbarui informasi profil pesantren dengan rincian:
                  </p>
                  <ul className="list-disc list-inside space-y-1 font-medium text-slate-800">
                    <li>
                      Tahun Pelajaran: <strong>{tahunAjaranList.find((t) => t.id === selectedTahunAjaranId)?.nama || profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} ({semesterProfil})</strong>
                    </li>
                    <li>
                      Nama Lembaga: <strong>{namaResmiProfil}</strong>
                    </li>
                    <li>
                      Alamat: <span className="text-slate-700">{alamatProfil}</span>
                    </li>
                  </ul>
                  <p className="text-[11px] text-blue-900 font-semibold pt-1">
                    Perubahan ini akan langsung digunakan secara konsisten pada portal TU, Pengasuh, Asatidz, Bendahara, Wali Santri, dan Superadmin.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={savingProfil}
                    onClick={() => setConfirmSaveProfilOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Periksa Kembali
                  </button>
                  <button
                    type="button"
                    disabled={savingProfil}
                    onClick={handleSaveProfil}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition"
                  >
                    {savingProfil ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>{savingProfil ? "Menyimpan..." : "Ya, Simpan Permanen"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL-MODAL INTERAKTIF UNTUK TU
         ===================================================================== */}

      {/* 1. Modal Edit Pembiayaan */}
      {editPembiayaanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Pengajuan Pembiayaan</h3>
              <button
                type="button"
                onClick={() => setEditPembiayaanModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditPembiayaanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Nama Pembiayaan</label>
                <input
                  type="text"
                  required
                  value={editNamaFee}
                  onChange={(e) => setEditNamaFee(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nominal (Rp)</label>
                <input
                  type="number"
                  required
                  min={1000}
                  value={editNominalFee}
                  onChange={(e) => setEditNominalFee(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Batas Waktu (Jatuh Tempo)</label>
                <input
                  type="date"
                  required
                  value={editJatuhTempoFee}
                  onChange={(e) => setEditJatuhTempoFee(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Metode Pembayaran</label>
                <select
                  value={editKebijakanCicilanFee}
                  onChange={(e) => setEditKebijakanCicilanFee(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-medium"
                >
                  <option value="BEBAS">Bisa Dicicil (Nominal Bebas)</option>
                  <option value="MINIMAL_NOMINAL">Bisa Dicicil (Ada Batas Minimal)</option>
                  <option value="TIDAK_BOLEH">Harus Dibayar Lunas Sekaligus</option>
                </select>
              </div>

              {editKebijakanCicilanFee === "MINIMAL_NOMINAL" && (
                <div>
                  <label className="font-semibold text-slate-700">Minimal Nominal Cicilan (Rp)</label>
                  <input
                    type="number"
                    required
                    min={1000}
                    value={editMinCicilanFee || 0}
                    onChange={(e) => setEditMinCicilanFee(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700">Keterangan Tambahan</label>
                <textarea
                  rows={2}
                  value={editDeskripsiFee}
                  onChange={(e) => setEditDeskripsiFee(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditPembiayaanModal(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white hover:bg-amber-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Konfirmasi Hapus Pembiayaan */}
      {deleteFeeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Pembiayaan</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus pengajuan pembiayaan <strong>{deleteFeeConfirmModal.nama_pembayaran}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFeeConfirmModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePembiayaanConfirm}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Edit Pelanggaran */}
      {editPelanggaranModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Catatan Pelanggaran</h3>
              <button
                type="button"
                onClick={() => setEditPelanggaranModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditPelanggaranSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Uraian Kejadian</label>
                <textarea
                  rows={3}
                  required
                  value={editPelanggaranModal.deskripsi}
                  onChange={(e) =>
                    setEditPelanggaranModal({ ...editPelanggaranModal, deskripsi: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Tindak Lanjut</label>
                <input
                  type="text"
                  required
                  value={editPelanggaranModal.tindak_lanjut}
                  onChange={(e) =>
                    setEditPelanggaranModal({ ...editPelanggaranModal, tindak_lanjut: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Catatan Pembinaan</label>
                <textarea
                  rows={2}
                  required
                  value={editPelanggaranModal.catatan_pembinaan}
                  onChange={(e) =>
                    setEditPelanggaranModal({ ...editPelanggaranModal, catatan_pembinaan: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Status Pembinaan</label>
                <select
                  value={editPelanggaranModal.status_tindak_lanjut}
                  onChange={(e) =>
                    setEditPelanggaranModal({
                      ...editPelanggaranModal,
                      status_tindak_lanjut: e.target.value as any,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  <option value="DALAM_PEMBINAAN">DALAM_PEMBINAAN</option>
                  <option value="SELESAI">SELESAI</option>
                  <option value="PERINGATAN_1">PERINGATAN_1</option>
                  <option value="PERINGATAN_2">PERINGATAN_2</option>
                  <option value="SKORSING">SKORSING</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditPelanggaranModal(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-700 px-4 py-2 font-bold text-white hover:bg-purple-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal Konfirmasi Hapus Pelanggaran */}
      {deletePelanggaranConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Catatan Pelanggaran</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan pelanggaran <strong>{deletePelanggaranConfirmModal.nama_kategori}</strong>? Tindakan ini akan menghapus riwayat pembinaan terkait secara bersih dan aman.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletePelanggaranConfirmModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePelanggaranConfirm}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Detail Pelanggaran */}
      {detailPelanggaranModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Detail Catatan Pelanggaran</h3>
              <button
                type="button"
                onClick={() => setDetailPelanggaranModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block">Kategori &amp; Tingkat:</span>
                <strong className="text-slate-900 text-sm">
                  {detailPelanggaranModal.nama_kategori} ({detailPelanggaranModal.tingkat_pelanggaran})
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block">Tanggal &amp; Waktu Kejadian:</span>
                <span className="text-slate-800">
                  {formatTanggal(detailPelanggaranModal.tanggal_kejadian)} • {detailPelanggaranModal.waktu_kejadian} WIB
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-400 block font-semibold">Uraian Kejadian:</span>
                <p className="text-slate-700 leading-relaxed">{detailPelanggaranModal.deskripsi}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-400 block font-semibold">Tindak Lanjut:</span>
                <p className="text-slate-700 leading-relaxed">{detailPelanggaranModal.tindak_lanjut}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-400 block font-semibold">Catatan Pembinaan:</span>
                <p className="text-slate-700 leading-relaxed">{detailPelanggaranModal.catatan_pembinaan}</p>
              </div>
              <div>
                <span className="text-slate-400 block">Petugas Pencatat:</span>
                <span className="text-slate-700 font-medium">{detailPelanggaranModal.petugas_nama}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailPelanggaranModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Tambah Master Kategori */}
      {modalTambahKatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Tambah Master Kategori Pelanggaran</h3>
              <button
                type="button"
                onClick={() => setModalTambahKatOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMasterKatSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Kode Kategori</label>
                  <input
                    type="text"
                    required
                    value={newKodeKat}
                    onChange={(e) => setNewKodeKat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Tingkat</label>
                  <select
                    value={newTingkatKat}
                    onChange={(e) => setNewTingkatKat(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="RINGAN">Ringan</option>
                    <option value="SEDANG">Sedang</option>
                    <option value="BERAT">Berat</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Nama Kategori</label>
                <input
                  type="text"
                  required
                  value={newNamaKat}
                  onChange={(e) => setNewNamaKat(e.target.value)}
                  placeholder="Contoh: Merusak Fasilitas Asrama"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Poin Pembinaan</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newPoinKat}
                  onChange={(e) => setNewPoinKat(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Standar Tindak Lanjut</label>
                <textarea
                  rows={2}
                  required
                  value={newStandarTindakKat}
                  onChange={(e) => setNewStandarTindakKat(e.target.value)}
                  placeholder="Standar penanganan awal..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalTambahKatOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-700 px-4 py-2 font-bold text-white hover:bg-purple-800"
                >
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal Edit Master Kategori */}
      {editKatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Kategori Pelanggaran</h3>
              <button
                type="button"
                onClick={() => setEditKatModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditMasterKatSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Nama Kategori</label>
                <input
                  type="text"
                  required
                  value={editKatModal.nama_kategori}
                  onChange={(e) => setEditKatModal({ ...editKatModal, nama_kategori: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Tingkat</label>
                  <select
                    value={editKatModal.tingkat_pelanggaran}
                    onChange={(e) =>
                      setEditKatModal({ ...editKatModal, tingkat_pelanggaran: e.target.value as any })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="RINGAN">Ringan</option>
                    <option value="SEDANG">Sedang</option>
                    <option value="BERAT">Berat</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Poin</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editKatModal.poin_pembinaan}
                    onChange={(e) =>
                      setEditKatModal({ ...editKatModal, poin_pembinaan: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Standar Tindak Lanjut</label>
                <textarea
                  rows={2}
                  required
                  value={editKatModal.standar_tindak_lanjut}
                  onChange={(e) =>
                    setEditKatModal({ ...editKatModal, standar_tindak_lanjut: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="activeKatCheck"
                  checked={editKatModal.is_active !== false}
                  onChange={(e) =>
                    setEditKatModal({ ...editKatModal, is_active: e.target.checked })
                  }
                  className="rounded text-purple-600"
                />
                <label htmlFor="activeKatCheck" className="font-semibold text-slate-700">
                  Kategori Aktif (Dapat dipilih pada form pelanggaran)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditKatModal(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-purple-700 px-4 py-2 font-bold text-white hover:bg-purple-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal Bulk Delete Kategori */}
      {bulkDeleteKatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Kategori Pelanggaran</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda memilih <strong>{selectedKatIds.length}</strong> kategori pelanggaran. Kategori yang belum pernah digunakan akan dihapus permanen, sedangkan yang memiliki riwayat pembinaan santri akan dinonaktifkan secara aman (soft-deactivate) demi menjaga integritas data.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBulkDeleteKatModalOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteKat}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
              >
                Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal Edit Pengumuman */}
      {editPengumumanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Edit Pengumuman</h3>
              <button
                type="button"
                onClick={() => setEditPengumumanModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditPengumumanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Judul Pengumuman</label>
                <input
                  type="text"
                  required
                  value={editPengumumanModal.judul}
                  onChange={(e) =>
                    setEditPengumumanModal({ ...editPengumumanModal, judul: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Kategori</label>
                  <select
                    value={editPengumumanModal.kategori}
                    onChange={(e) =>
                      setEditPengumumanModal({ ...editPengumumanModal, kategori: e.target.value as any })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="Umum">Umum</option>
                    <option value="Kegiatan Pesantren">Kegiatan Pesantren</option>
                    <option value="Akademik">Akademik</option>
                    <option value="Keuangan">Keuangan</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Masa Berlaku</label>
                  <input
                    type="date"
                    required
                    value={editPengumumanModal.masa_berlaku || ""}
                    onChange={(e) =>
                      setEditPengumumanModal({ ...editPengumumanModal, masa_berlaku: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Sasaran</label>
                  <select
                    value={editPengumumanModal.sasaran || "SEMUA"}
                    onChange={(e) =>
                      setEditPengumumanModal({ ...editPengumumanModal, sasaran: e.target.value as any })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="SEMUA">Semua Wali Santri</option>
                    <option value="KELAS">Kelas Tertentu</option>
                    <option value="SANTRI">Santri Tertentu</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Status</label>
                  <select
                    value={editPengumumanModal.status_publikasi || "PUBLIKASI"}
                    onChange={(e) =>
                      setEditPengumumanModal({
                        ...editPengumumanModal,
                        status_publikasi: e.target.value as any,
                        is_published: e.target.value === "PUBLIKASI",
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="PUBLIKASI">Publikasi</option>
                    <option value="DRAF">Draf</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Isi Pengumuman</label>
                <textarea
                  rows={4}
                  required
                  value={editPengumumanModal.isi}
                  onChange={(e) =>
                    setEditPengumumanModal({ ...editPengumumanModal, isi: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="editPentingCheck"
                  checked={editPengumumanModal.is_penting}
                  onChange={(e) =>
                    setEditPengumumanModal({ ...editPengumumanModal, is_penting: e.target.checked })
                  }
                  className="rounded text-blue-600"
                />
                <label htmlFor="editPentingCheck" className="font-semibold text-slate-700">
                  Tandai sebagai Pengumuman Penting
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditPengumumanModal(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white hover:bg-blue-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. Modal Konfirmasi Hapus Pengumuman */}
      {deletePengumumanConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Pengumuman</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus pengumuman <strong>{deletePengumumanConfirmModal.judul}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletePengumumanConfirmModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePengumumanConfirm}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Modal Tambah/Edit Master Kelas */}
      {modalKelasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingKelas ? "Edit Ruang Kelas" : "Tambah Ruang Kelas Baru"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalKelasOpen(false);
                  setEditingKelas(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKelasSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Kode Kelas *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: KLS-7A, VII-B, X-IPA"
                  value={kodeKelasInput}
                  onChange={(e) => setKodeKelasInput(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 uppercase font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Nama Kelas *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Kelas VII-A (MTs Putra)"
                  value={namaKelasInput}
                  onChange={(e) => setNamaKelasInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700">Tingkat Pendidikan *</label>
                  <select
                    value={tingkatKelasInput}
                    onChange={(e) => setTingkatKelasInput(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="7">Kelas 7 (MTs / SMP)</option>
                    <option value="8">Kelas 8 (MTs / SMP)</option>
                    <option value="9">Kelas 9 (MTs / SMP)</option>
                    <option value="10">Kelas 10 (MA / SMA)</option>
                    <option value="11">Kelas 11 (MA / SMA)</option>
                    <option value="12">Kelas 12 (MA / SMA)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">Kapasitas Maksimal</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={kapasitasKelasInput}
                    onChange={(e) => setKapasitasKelasInput(parseInt(e.target.value, 10) || 30)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Wali Kelas / Pembina</label>
                <input
                  type="text"
                  placeholder="contoh: Ustadz Fauzan Azima, Lc."
                  value={waliKelasInput}
                  onChange={(e) => setWaliKelasInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setModalKelasOpen(false);
                    setEditingKelas(null);
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={kelasSubmitting}
                  className="rounded-xl bg-blue-700 px-5 py-2 font-bold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {kelasSubmitting ? "Menyimpan..." : editingKelas ? "Simpan Perubahan" : "Simpan Kelas"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 12. Modal Konfirmasi Hapus Master Kelas */}
      {deleteKelasConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Master Kelas</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus kelas <strong>{deleteKelasConfirmModal.nama_kelas}</strong> ({deleteKelasConfirmModal.kode_kelas})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteKelasConfirmModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteKelas}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 cursor-pointer"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. Modal Tambah/Edit Master Kamar Asrama */}
      {modalKamarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingKamar ? "Edit Kamar Asrama" : "Tambah Kamar Asrama Baru"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalKamarOpen(false);
                  setEditingKamar(null);
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveKamarSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700">Kode Kamar *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: ASR-AB-01, KMR-01, P-02"
                  value={kodeKamarInput}
                  onChange={(e) => setKodeKamarInput(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 uppercase font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Nama Kamar Asrama *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Kamar Abu Bakar Ash-Shiddiq 01"
                  value={namaKamarInput}
                  onChange={(e) => setNamaKamarInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Gedung Asrama *</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Gedung Putra Al-Faruq / Gedung Putri Khadijah"
                  value={gedungKamarInput}
                  onChange={(e) => setGedungKamarInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700">Penghuni Asrama *</label>
                  <select
                    value={jenisAsramaInput}
                    onChange={(e) => setJenisAsramaInput(e.target.value as "L" | "P")}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="L">Putra (Ikhwan)</option>
                    <option value="P">Putri (Akhwat)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700">Kapasitas Maksimal (Santri)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={kapasitasKamarInput}
                    onChange={(e) => setKapasitasKamarInput(parseInt(e.target.value, 10) || 20)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Musyrif / Pembina Kamar</label>
                <input
                  type="text"
                  placeholder="contoh: Ustadz Rizki Ramadhan"
                  value={musyrifKamarInput}
                  onChange={(e) => setMusyrifKamarInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setModalKamarOpen(false);
                    setEditingKamar(null);
                  }}
                  className="rounded-xl bg-slate-100 px-4 py-2 font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={kamarSubmitting}
                  className="rounded-xl bg-indigo-700 px-5 py-2 font-bold text-white hover:bg-indigo-800 disabled:opacity-50 cursor-pointer"
                >
                  {kamarSubmitting ? "Menyimpan..." : editingKamar ? "Simpan Perubahan" : "Simpan Kamar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 14. Modal Konfirmasi Hapus Master Kamar */}
      {deleteKamarConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-base font-bold">Hapus Master Kamar</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus kamar <strong>{deleteKamarConfirmModal.nama_kamar}</strong> ({deleteKamarConfirmModal.kode_kamar})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteKamarConfirmModal(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteKamar}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 cursor-pointer"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal Santri */}
      {detailSantri && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Detail Data Santri &amp; Identitas Keluarga
                </h3>
                <p className="text-xs text-slate-500">
                  {detailSantri.nama_lengkap} (NIS: {detailSantri.nis})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSantri(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {(() => {
              const k = kelasList.find((x) => x.id === detailSantri.kelas_id);
              const km = kamarList.find((x) => x.id === detailSantri.kamar_id);
              const w = waliList.find((x) => x.santri_id === detailSantri.id);
              return (
                <div className="space-y-4 text-xs">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-slate-400 block">Nama Santri:</span>
                      <strong className="text-slate-900">{detailSantri.nama_lengkap}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">NIS:</span>
                      <strong className="font-mono text-slate-900">{detailSantri.nis}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Kelas &amp; Kamar:</span>
                      <strong className="text-slate-800">
                        {k?.nama_kelas || "-"} • {km?.nama_kamar || "-"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tempat, Tgl Lahir:</span>
                      <strong className="text-slate-800">
                        {detailSantri.tempat_lahir}, {formatTanggal(detailSantri.tanggal_lahir)}
                      </strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Alamat Santri:</span>
                      <strong className="text-slate-800">{detailSantri.alamat || "-"}</strong>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-extrabold text-slate-900">
                        Identitas Orang Tua &amp; Wali
                      </span>
                      {w && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-900">
                          Penanggung Jawab Akun: {w.penanggung_jawab || w.hubungan} ({w.nama_lengkap})
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <span className="font-bold text-slate-700 block">Data Ayah</span>
                        <p className="text-slate-900 font-semibold mt-0.5">
                          {w?.nama_ayah || (w?.hubungan === "Ayah" ? w.nama_lengkap : "-")}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          HP: {w?.no_hp_ayah || (w?.hubungan === "Ayah" ? w.no_telepon : "-")} • Pekerjaan: {w?.pekerjaan_ayah || "-"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <span className="font-bold text-slate-700 block">Data Ibu</span>
                        <p className="text-slate-900 font-semibold mt-0.5">
                          {w?.nama_ibu || (w?.hubungan === "Ibu" ? w.nama_lengkap : "-")}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          HP: {w?.no_hp_ibu || (w?.hubungan === "Ibu" ? w.no_telepon : "-")} • Pekerjaan: {w?.pekerjaan_ibu || "-"}
                        </p>
                      </div>
                      {(w?.nama_wali || w?.hubungan === "Wali") && (
                        <div className="rounded-lg bg-slate-50 p-2.5 sm:col-span-2">
                          <span className="font-bold text-slate-700 block">Data Wali</span>
                          <p className="text-slate-900 font-semibold mt-0.5">
                            {w?.nama_wali || w?.nama_lengkap} ({w?.hubungan_wali_detail || "Wali"})
                          </p>
                          <p className="text-[11px] text-slate-500">
                            HP: {w?.no_hp_wali || w?.no_telepon || "-"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailSantri(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL EDIT SANTRI & AKUN WALI
         ===================================================================== */}
      {editSantriModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Edit Data Santri &amp; Akun Wali
                </h3>
                <p className="text-xs text-slate-500">
                  Perbarui identitas, penempatan kelas/kamar, serta informasi orang tua / wali santri.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditSantriModal(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editFeedback && !editFeedback.ok && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editFeedback.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditSantri} className="space-y-4 text-xs">
              {/* Bagian 1: Identitas Santri */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                  1. Identitas Santri
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      NIS (Nomor Induk Santri) *
                    </label>
                    <input
                      type="text"
                      required
                      value={editNis}
                      onChange={(e) => setEditNis(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Nama Lengkap Santri *
                    </label>
                    <input
                      type="text"
                      required
                      value={editNama}
                      onChange={(e) => setEditNama(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tempat Lahir</label>
                    <input
                      type="text"
                      value={editTempatLahir}
                      onChange={(e) => setEditTempatLahir(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tanggal Lahir</label>
                    <input
                      type="date"
                      value={editTanggalLahir}
                      onChange={(e) => setEditTanggalLahir(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Jenis Kelamin</label>
                    <select
                      value={editJenisKelamin}
                      onChange={(e) => setEditJenisKelamin(e.target.value as "L" | "P")}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="L">Laki-laki (Santri Putra)</option>
                      <option value="P">Perempuan (Santri Putri)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Tahun Masuk</label>
                    <input
                      type="number"
                      value={editTahunMasuk}
                      onChange={(e) => setEditTahunMasuk(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 font-semibold mb-1">Alamat Asal</label>
                    <textarea
                      rows={2}
                      value={editAlamat}
                      onChange={(e) => setEditAlamat(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Bagian 2: Penempatan & Status */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                  2. Penempatan &amp; Status Akademik
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Kelas</label>
                    <select
                      value={editKelasId}
                      onChange={(e) => setEditKelasId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama_kelas}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Kamar Asrama</label>
                    <select
                      value={editKamarId}
                      onChange={(e) => setEditKamarId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="">-- Pilih Kamar --</option>
                      {kamarList.map((km) => (
                        <option key={km.id} value={km.id}>
                          {km.nama_kamar}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Status Santri</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as StatusSantri)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                    >
                      <option value="AKTIF">AKTIF</option>
                      <option value="TIDAK_AKTIF">TIDAK AKTIF</option>
                      <option value="LULUS">LULUS</option>
                      <option value="PINDAH">PINDAH</option>
                      <option value="CUTI">CUTI</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Bagian 3: Identitas Keluarga & Akun Wali */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2 gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">
                    3. Identitas Orang Tua / Wali
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-semibold">Penanggung Jawab:</span>
                    <select
                      value={editPenanggungJawab}
                      onChange={(e) => setEditPenanggungJawab(e.target.value as "Ayah" | "Ibu" | "Wali")}
                      className="rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-bold text-emerald-800"
                    >
                      <option value="Ayah">Ayah</option>
                      <option value="Ibu">Ibu</option>
                      <option value="Wali">Wali Lainnya</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3 space-y-2 border border-slate-200">
                    <span className="font-bold text-slate-800 block">Data Ayah</span>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">Nama Ayah</label>
                      <input
                        type="text"
                        value={editNamaAyah}
                        onChange={(e) => setEditNamaAyah(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">No. HP / WA Ayah</label>
                      <input
                        type="text"
                        value={editNoHpAyah}
                        onChange={(e) => setEditNoHpAyah(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">Pekerjaan Ayah</label>
                      <input
                        type="text"
                        value={editPekerjaanAyah}
                        onChange={(e) => setEditPekerjaanAyah(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 space-y-2 border border-slate-200">
                    <span className="font-bold text-slate-800 block">Data Ibu</span>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">Nama Ibu</label>
                      <input
                        type="text"
                        value={editNamaIbu}
                        onChange={(e) => setEditNamaIbu(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">No. HP / WA Ibu</label>
                      <input
                        type="text"
                        value={editNoHpIbu}
                        onChange={(e) => setEditNoHpIbu(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 font-medium">Pekerjaan Ibu</label>
                      <input
                        type="text"
                        value={editPekerjaanIbu}
                        onChange={(e) => setEditPekerjaanIbu(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                      />
                    </div>
                  </div>

                  {editPenanggungJawab === "Wali" && (
                    <div className="rounded-xl bg-slate-50 p-3 space-y-2 border border-slate-200 sm:col-span-2">
                      <span className="font-bold text-slate-800 block">Data Wali Khusus</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-500 font-medium">Nama Wali</label>
                          <input
                            type="text"
                            value={editNamaWali}
                            onChange={(e) => setEditNamaWali(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 font-medium">No. HP / WA Wali</label>
                          <input
                            type="text"
                            value={editNoHpWali}
                            onChange={(e) => setEditNoHpWali(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 font-medium">Hubungan Kerabat</label>
                          <input
                            type="text"
                            placeholder="Contoh: Paman / Kakek"
                            value={editHubunganWali}
                            onChange={(e) => setEditHubunganWali(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditSantriModal(null)}
                  disabled={editSantriLoading}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editSantriLoading}
                  className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {editSantriLoading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL KONFIRMASI HAPUS SATUAN
         ===================================================================== */}
      {deleteSantriConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Hapus Data Santri
                </h3>
                <p className="text-xs text-slate-500">Konfirmasi tindakan penghapusan</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Nama Santri:</span>
                <strong className="text-slate-900">{deleteSantriConfirm.nama_lengkap}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">NIS:</span>
                <strong className="font-mono text-slate-900">{deleteSantriConfirm.nis}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status Saat Ini:</span>
                <span className="font-bold text-slate-700">{deleteSantriConfirm.status}</span>
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" />
                Perlindungan Data &amp; Riwayat Historis:
              </p>
              <p>
                Jika santri memiliki riwayat keuangan (tagihan, pembayaran, uang saku) atau catatan kepesantrenan (tahfidz, kedisiplinan), santri akan secara aman <strong>dinonaktifkan (Soft Delete)</strong> agar integritas data tetap terjaga.
              </p>
              <p>
                Akun wali santri tidak akan dihapus jika masih terhubung dengan santri lain.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteSantriConfirm(null)}
                disabled={deleteSantriLoading}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSingleDelete}
                disabled={deleteSantriLoading}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleteSantriLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Konfirmasi Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL KONFIRMASI HAPUS MASSAL (BULK DELETE)
         ===================================================================== */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Hapus Massal Santri Terpilih
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedSantriIds.size} santri akan diproses secara individual
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <span className="text-xs font-bold text-slate-700 block">
                Daftar Santri yang Dipilih ({selectedSantriIds.size}):
              </span>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                {Array.from(selectedSantriIds).map((id) => {
                  const s = santriList.find((x) => x.id === id);
                  return (
                    <div key={id} className="py-1.5 flex justify-between items-center">
                      <span className="font-semibold text-slate-900">{s?.nama_lengkap || id}</span>
                      <span className="font-mono text-slate-500 text-[11px]">NIS: {s?.nis || "-"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" />
                Aturan Penghapusan Massal:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Santri dengan riwayat keuangan atau catatan kepesantrenan otomatis <strong>dinonaktifkan (Soft Delete)</strong>.</li>
                <li>Hanya santri tanpa riwayat sama sekali yang dihapus permanen.</li>
                <li>Akun wali yang masih memiliki santri lain tetap aman dan tidak akan dihapus.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(false)}
                disabled={bulkDeleteLoading}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading}
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {bulkDeleteLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Memproses Penghapusan...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Konfirmasi Hapus ({selectedSantriIds.size})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
