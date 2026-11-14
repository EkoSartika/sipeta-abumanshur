"use client";

import React, { useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
  XCircle,
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
import { canRoleViewFinancialDetails } from "@/lib/validations/schemas";
import type { StatusTagihan } from "@/types/database";
import { generateAndDownloadLaporanPdf } from "@/lib/utils/pdf-report-generator";

export type KategoriLaporanPengasuh =
  | "pembayaran"
  | "uang_saku"
  | "mengaji"
  | "tahfidz"
  | "kedisiplinan"
  | "prestasi";

export function LaporanPortal() {
  const {
    currentUser,
    santriList,
    kelasList,
    kamarList,
    tagihanList,
    transaksiPembayaranList,
    mutasiUangSakuList,
    mengajiList,
    tahfidzList,
    prestasiList,
    kedisiplinanList,
    profilPesantren,
    tahunAjaranAktif,
    getSaldoSantri,
  } = useSipeta();

  const canSeeFinance = currentUser ? canRoleViewFinancialDetails(currentUser.role) : true;

  const [activeKategori, setActiveKategori] = useState<KategoriLaporanPengasuh>("pembayaran");

  // State Filter & Pencarian
  const [filterKelasId, setFilterKelasId] = useState<string>("ALL");
  const [filterKamarId, setFilterKamarId] = useState<string>("ALL");
  const [filterSantriId, setFilterSantriId] = useState<string>("ALL");
  const [filterStatusTagihan, setFilterStatusTagihan] = useState<string>("ALL");
  const [filterRentangMulai, setFilterRentangMulai] = useState<string>("");
  const [filterRentangSelesai, setFilterRentangSelesai] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Map nama kelas & kamar
  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama_kelas])), [kelasList]);
  const kamarMap = useMemo(() => new Map(kamarList.map((k) => [k.id, k.nama_kamar])), [kamarList]);
  const santriMap = useMemo(() => new Map(santriList.map((s) => [s.id, s])), [santriList]);

  // Santri Terfilter
  const filteredSantri = useMemo(() => {
    return santriList.filter((s) => {
      if (filterKelasId !== "ALL" && s.kelas_id !== filterKelasId) return false;
      if (filterKamarId !== "ALL" && s.kamar_id !== filterKamarId) return false;
      if (filterSantriId !== "ALL" && s.id !== filterSantriId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = s.nama_lengkap.toLowerCase().includes(q);
        const matchNis = s.nis.toLowerCase().includes(q);
        if (!matchName && !matchNis) return false;
      }
      return true;
    });
  }, [santriList, filterKelasId, filterKamarId, filterSantriId, searchQuery]);

  const filteredSantriIds = useMemo(() => new Set(filteredSantri.map((s) => s.id)), [filteredSantri]);

  // 1. DATA LAPORAN PEMBAYARAN
  const filteredTagihan = useMemo(() => {
    return tagihanList.filter((t) => {
      if (!filteredSantriIds.has(t.santri_id)) return false;
      if (filterStatusTagihan !== "ALL" && t.status !== filterStatusTagihan) return false;
      if (filterRentangMulai && t.tanggal_jatuh_tempo < filterRentangMulai) return false;
      if (filterRentangSelesai && t.tanggal_jatuh_tempo > filterRentangSelesai) return false;
      return true;
    });
  }, [tagihanList, filteredSantriIds, filterStatusTagihan, filterRentangMulai, filterRentangSelesai]);

  const totalTagihanNominal = filteredTagihan.reduce((s, t) => s + t.nominal_tagihan, 0);
  const totalTerbayarNominal = filteredTagihan.reduce((s, t) => s + t.total_terbayar, 0);
  const totalTunggakanNominal = filteredTagihan.reduce((s, t) => s + t.sisa_tagihan, 0);

  // 2. DATA LAPORAN UANG SAKU
  const filteredMutasiUangSaku = useMemo(() => {
    return mutasiUangSakuList.filter((m) => {
      if (!filteredSantriIds.has(m.santri_id)) return false;
      if (filterRentangMulai && m.created_at.slice(0, 10) < filterRentangMulai) return false;
      if (filterRentangSelesai && m.created_at.slice(0, 10) > filterRentangSelesai) return false;
      return true;
    });
  }, [mutasiUangSakuList, filteredSantriIds, filterRentangMulai, filterRentangSelesai]);

  // 3. DATA LAPORAN MENGAJI
  const filteredMengaji = useMemo(() => {
    return mengajiList.filter((m) => {
      if (!filteredSantriIds.has(m.santri_id)) return false;
      if (filterRentangMulai && m.tanggal_penilaian < filterRentangMulai) return false;
      if (filterRentangSelesai && m.tanggal_penilaian > filterRentangSelesai) return false;
      return true;
    });
  }, [mengajiList, filteredSantriIds, filterRentangMulai, filterRentangSelesai]);

  // 4. DATA LAPORAN TAHFIDZ
  const filteredTahfidz = useMemo(() => {
    return tahfidzList.filter((t) => {
      if (!filteredSantriIds.has(t.santri_id)) return false;
      if (filterRentangMulai && t.tanggal_setoran < filterRentangMulai) return false;
      if (filterRentangSelesai && t.tanggal_setoran > filterRentangSelesai) return false;
      return true;
    });
  }, [tahfidzList, filteredSantriIds, filterRentangMulai, filterRentangSelesai]);

  // 5. DATA LAPORAN KEDISIPLINAN
  const filteredKedisiplinan = useMemo(() => {
    return kedisiplinanList.filter((k) => {
      if (!filteredSantriIds.has(k.santri_id)) return false;
      if (filterRentangMulai && k.tanggal_kejadian < filterRentangMulai) return false;
      if (filterRentangSelesai && k.tanggal_kejadian > filterRentangSelesai) return false;
      return true;
    });
  }, [kedisiplinanList, filteredSantriIds, filterRentangMulai, filterRentangSelesai]);

  // 6. DATA LAPORAN PRESTASI
  const filteredPrestasi = useMemo(() => {
    return prestasiList.filter((p) => {
      if (!filteredSantriIds.has(p.santri_id)) return false;
      if (filterRentangMulai && p.tanggal_prestasi < filterRentangMulai) return false;
      if (filterRentangSelesai && p.tanggal_prestasi > filterRentangSelesai) return false;
      return true;
    });
  }, [prestasiList, filteredSantriIds, filterRentangMulai, filterRentangSelesai]);

  // Judul Kategori Laporan
  const getKategoriMeta = (kat: KategoriLaporanPengasuh) => {
    switch (kat) {
      case "pembayaran":
        return {
          title: "Laporan Pembayaran & Kewajiban Tagihan Santri",
          desc: "Rekapitulasi tagihan, total penerimaan, cicilan, dan sisa tunggakan santri",
          icon: CreditCard,
          filename: `Laporan_Pembayaran_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      case "uang_saku":
        return {
          title: "Laporan Uang Saku & Saldo Keuangan Santri",
          desc: "Rekapitulasi saldo, total top-up masuk, dan penarikan uang saku santri",
          icon: Wallet,
          filename: `Laporan_Uang_Saku_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      case "mengaji":
        return {
          title: "Laporan Perkembangan Pembelajaran Mengaji & Tilawah",
          desc: "Catatan jilid/kitab, materi terakhir, kelancaran, dan evaluasi asatidz pengampu",
          icon: BookOpen,
          filename: `Laporan_Mengaji_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      case "tahfidz":
        return {
          title: "Laporan Capaian & Setoran Tahfidz Al-Qur'an",
          desc: "Rekapitulasi surat, ayat, juz hafalan, dan predikat nilai kelancaran santri",
          icon: GraduationCap,
          filename: `Laporan_Tahfidz_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      case "kedisiplinan":
        return {
          title: "Laporan Catatan Kedisiplinan & Pembinaan Santri",
          desc: "Rekapitulasi poin pelanggaran, kategori indisipliner, dan status tindak lanjut pembinaan",
          icon: ShieldAlert,
          filename: `Laporan_Kedisiplinan_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      case "prestasi":
        return {
          title: "Laporan Prestasi Akademik & Non-Akademik Santri",
          desc: "Dokumentasi kejuaraan, bidang prestasi, tingkat perlombaan, dan penghargaan santri",
          icon: Award,
          filename: `Laporan_Prestasi_Abu_Manshur_${new Date().toISOString().slice(0, 10)}.pdf`,
        };
    }
  };

  const currentMeta = getKategoriMeta(activeKategori);

  const resetFilters = () => {
    setFilterKelasId("ALL");
    setFilterKamarId("ALL");
    setFilterSantriId("ALL");
    setFilterStatusTagihan("ALL");
    setFilterRentangMulai("");
    setFilterRentangSelesai("");
    setSearchQuery("");
  };

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleDownloadDirectPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setDownloadFeedback(null);

    try {
      const taNama = tahunAjaranAktif?.nama || profilPesantren?.tahun_pelajaran_aktif || "2024/2025";
      const semAktif = profilPesantren?.semester_aktif || "Ganjil";
      const petugas = currentUser?.nama_lengkap || "Pengasuh Pondok";

      // Keterangan filter aktif
      const filterParts: string[] = [];
      if (filterKelasId !== "ALL") {
        const k = kelasList.find((kl) => kl.id === filterKelasId);
        if (k) filterParts.push(`Kelas: ${k.nama_kelas}`);
      }
      if (filterKamarId !== "ALL") {
        const km = kamarList.find((k) => k.id === filterKamarId);
        if (km) filterParts.push(`Kamar: ${km.nama_kamar}`);
      }
      if (filterSantriId !== "ALL") {
        const s = santriList.find((st) => st.id === filterSantriId);
        if (s) filterParts.push(`Santri: ${s.nama_lengkap}`);
      }
      if (filterRentangMulai || filterRentangSelesai) {
        filterParts.push(`Rentang: ${filterRentangMulai || "-"} s/d ${filterRentangSelesai || "-"}`);
      }
      const filterDeskripsi = filterParts.length > 0 ? filterParts.join(" • ") : "Semua Data";

      let columns: string[] = [];
      let rows: (string | number)[][] = [];
      let columnStyles: Record<number, { halign?: "left" | "center" | "right"; cellWidth?: number | "auto" | "wrap" }> = {};

      switch (activeKategori) {
        case "pembayaran": {
          columns = ["No", "No Tagihan", "NIS & Nama Santri", "Kelas", "Judul Tagihan", "Jatuh Tempo", "Nominal", "Terbayar", "Sisa", "Status"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { cellWidth: 22 },
            2: { cellWidth: 32 },
            3: { cellWidth: 14 },
            4: { cellWidth: 28 },
            5: { halign: "center", cellWidth: 18 },
            6: { halign: "right", cellWidth: 18 },
            7: { halign: "right", cellWidth: 18 },
            8: { halign: "right", cellWidth: 18 },
            9: { halign: "center", cellWidth: 16 },
          };
          rows = filteredTagihan.map((t, idx) => {
            const snt = santriMap.get(t.santri_id);
            return [
              idx + 1,
              t.nomor_tagihan,
              `${snt?.nama_lengkap || "-"} (${snt?.nis || "-"})`,
              snt?.kelas_id ? kelasMap.get(snt.kelas_id) || "-" : "-",
              t.judul_tagihan,
              formatTanggal(t.tanggal_jatuh_tempo),
              formatRupiah(t.nominal_tagihan),
              formatRupiah(t.total_terbayar),
              formatRupiah(t.sisa_tagihan),
              t.status.replace(/_/g, " "),
            ];
          });
          break;
        }

        case "uang_saku": {
          columns = ["No", "NIS", "Nama Lengkap Santri", "Kelas", "Kamar / Asrama", "Total Masuk", "Total Penarikan", "Penyesuaian", "Saldo Terkini"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "center", cellWidth: 18 },
            2: { cellWidth: 38 },
            3: { cellWidth: 18 },
            4: { cellWidth: 26 },
            5: { halign: "right", cellWidth: 22 },
            6: { halign: "right", cellWidth: 22 },
            7: { halign: "right", cellWidth: 20 },
            8: { halign: "right", cellWidth: 22 },
          };
          rows = filteredSantri.map((s, idx) => {
            const ldg = getSaldoSantri(s.id);
            return [
              idx + 1,
              s.nis,
              s.nama_lengkap,
              s.kelas_id ? kelasMap.get(s.kelas_id) || "-" : "-",
              s.kamar_id ? kamarMap.get(s.kamar_id) || "-" : "-",
              formatRupiah(ldg.total_masuk),
              formatRupiah(ldg.total_keluar),
              formatRupiah(ldg.total_penyesuaian),
              formatRupiah(ldg.saldo_saat_ini),
            ];
          });
          break;
        }

        case "mengaji": {
          columns = ["No", "Tanggal", "NIS & Nama Santri", "Kelas", "Jilid / Kitab", "Materi / Halaman", "Kelancaran", "Catatan Pembimbing"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "center", cellWidth: 20 },
            2: { cellWidth: 36 },
            3: { cellWidth: 16 },
            4: { cellWidth: 22 },
            5: { cellWidth: 26 },
            6: { halign: "center", cellWidth: 18 },
            7: { cellWidth: "wrap" },
          };
          rows = filteredMengaji.map((m, idx) => {
            const snt = santriMap.get(m.santri_id);
            return [
              idx + 1,
              formatTanggal(m.tanggal_penilaian),
              `${snt?.nama_lengkap || "-"} (${snt?.nis || "-"})`,
              snt?.kelas_id ? kelasMap.get(snt.kelas_id) || "-" : "-",
              m.tingkat_jilid,
              m.materi_terakhir,
              m.kelancaran_bacaan || "Lancar",
              m.catatan_perkembangan || "-",
            ];
          });
          break;
        }

        case "tahfidz": {
          columns = ["No", "Tanggal", "NIS & Nama Santri", "Kelas", "Surah & Ayat", "Juz", "Jumlah Ayat", "Kualitas Hafalan"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "center", cellWidth: 22 },
            2: { cellWidth: 42 },
            3: { cellWidth: 18 },
            4: { cellWidth: 38 },
            5: { halign: "center", cellWidth: 14 },
            6: { halign: "center", cellWidth: 18 },
            7: { halign: "center", cellWidth: 24 },
          };
          rows = filteredTahfidz.map((t, idx) => {
            const snt = santriMap.get(t.santri_id);
            return [
              idx + 1,
              formatTanggal(t.tanggal_setoran),
              `${snt?.nama_lengkap || "-"} (${snt?.nis || "-"})`,
              snt?.kelas_id ? kelasMap.get(snt.kelas_id) || "-" : "-",
              `${t.nama_surah} (Ayat ${t.ayat_awal}-${t.ayat_akhir})`,
              t.juz,
              `${t.jumlah_ayat} Ayat`,
              t.kualitas_hafalan,
            ];
          });
          break;
        }

        case "kedisiplinan": {
          columns = ["No", "Tanggal Kejadian", "NIS & Nama Santri", "Kelas", "Kategori Pelanggaran", "Tingkat", "Deskripsi & Tindak Lanjut", "Status"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "center", cellWidth: 22 },
            2: { cellWidth: 36 },
            3: { cellWidth: 16 },
            4: { cellWidth: 26 },
            5: { halign: "center", cellWidth: 16 },
            6: { cellWidth: "wrap" },
            7: { halign: "center", cellWidth: 18 },
          };
          rows = filteredKedisiplinan.map((k, idx) => {
            const snt = santriMap.get(k.santri_id);
            return [
              idx + 1,
              `${formatTanggal(k.tanggal_kejadian)} ${k.waktu_kejadian || ""}`.trim(),
              `${snt?.nama_lengkap || "-"} (${snt?.nis || "-"})`,
              snt?.kelas_id ? kelasMap.get(snt.kelas_id) || "-" : "-",
              k.nama_kategori,
              k.tingkat_pelanggaran,
              `${k.deskripsi} (Tindak Lanjut: ${k.tindak_lanjut || "-"})`,
              k.status_tindak_lanjut,
            ];
          });
          break;
        }

        case "prestasi": {
          columns = ["No", "Tanggal", "NIS & Nama Santri", "Kelas", "Nama Kegiatan / Prestasi", "Kategori", "Tingkat", "Peringkat"];
          columnStyles = {
            0: { halign: "center", cellWidth: 10 },
            1: { halign: "center", cellWidth: 20 },
            2: { cellWidth: 38 },
            3: { cellWidth: 16 },
            4: { cellWidth: 42 },
            5: { cellWidth: 22 },
            6: { halign: "center", cellWidth: 20 },
            7: { halign: "center", cellWidth: 18 },
          };
          rows = filteredPrestasi.map((p, idx) => {
            const snt = santriMap.get(p.santri_id);
            return [
              idx + 1,
              formatTanggal(p.tanggal_prestasi),
              `${snt?.nama_lengkap || "-"} (${snt?.nis || "-"})`,
              snt?.kelas_id ? kelasMap.get(snt.kelas_id) || "-" : "-",
              p.nama_kegiatan,
              p.kategori,
              p.tingkat_prestasi,
              p.peringkat || "Juara",
            ];
          });
          break;
        }
      }

      if (rows.length === 0) {
        setDownloadFeedback({ ok: false, text: "Tidak ada data pada filter aktif untuk dibuatkan dokumen PDF." });
        return;
      }

      const res = await generateAndDownloadLaporanPdf({
        kategori: activeKategori,
        profilPesantren,
        periodeLabel: taNama,
        semesterAktif: semAktif,
        petugasName: petugas,
        filterDeskripsi,
        columns,
        rows,
        columnStyles,
      });

      setDownloadFeedback({ ok: res.ok, text: res.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadFeedback({ ok: false, text: `Gagal memproses dokumen PDF: ${msg}` });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          KOP SURAT RESMI KHUSUS CETAK PDF A4 PORTRAIT
         ========================================================================= */}
      <div className="hidden print:block mb-6 text-black border-b-2 border-black pb-3">
        <div className="flex items-center gap-4">
          <img
            src="/images/logo-abu-manshur.png"
            alt="Logo Pondok Pesantren Modern Abu Manshur"
            className="h-20 w-20 object-contain shrink-0"
          />
          <div className="flex-1 text-center">
            <h3 className="text-xs uppercase tracking-widest font-semibold text-slate-700">
              YAYASAN PONDOK PESANTREN MODERN ABU MANSHUR
            </h3>
            <h1 className="text-lg font-black tracking-tight text-black mt-0.5 uppercase">
              {profilPesantren?.nama_resmi || "PONDOK PESANTREN MODERN ABU MANSHUR"}
            </h1>
            <p className="text-[11px] text-slate-700 mt-0.5">
              {profilPesantren?.alamat || "Jl. Nyi Ageng Serang, Desa Kaliwadas, Kec. Plered, Kab. Cirebon, Jawa Barat 45154"}
            </p>
            <p className="text-[10px] text-slate-600">
              Email: {profilPesantren?.email || "sekretariat@abumanshur.com"} • Telepon: {profilPesantren?.no_telepon || "(0231) 321xxx"} • Website: sipetaabumanshur.vercel.app
            </p>
          </div>
        </div>
        <div className="mt-2 border-t border-black pt-0.5 border-b border-black"></div>

        {/* Header Metadata Laporan Saat Dicetak */}
        <div className="mt-4 flex items-center justify-between text-xs">
          <div>
            <h2 className="text-sm font-extrabold uppercase text-black">{currentMeta.title}</h2>
            <p className="text-[11px] text-slate-700">
              Tahun Ajaran: <strong>{tahunAjaranAktif?.nama || "2024/2025"}</strong> • Semester:{" "}
              <strong>{profilPesantren?.semester_aktif || "Ganjil"}</strong>
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-700">
            <p>Tanggal Cetak: {formatWaktuLengkap(new Date().toISOString())}</p>
            <p>Petugas / Pengasuh: {currentUser?.nama_lengkap || "Pengasuh Pondok"}</p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PANEL UTAMA PUSAT LAPORAN & MONITORING (INTERAKTIF LAYAR)
         ========================================================================= */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm no-print">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/images/logo-abu-manshur.png"
              alt="Logo PP Modern Abu Manshur"
              className="h-12 w-12 object-contain shrink-0"
            />
            <div>
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
                <BarChart3 className="h-4 w-4" />
                <span>Pusat Laporan &amp; Monitoring Terpadu Pengasuh</span>
              </div>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                Laporan Akuntabilitas &amp; Rekapitulasi Data Santri SIPETA
              </h2>
              <p className="text-xs text-slate-500">
                Pondok Pesantren Modern Abu Manshur • Hak Akses Monitoring Read-Only Pengasuh Pondok
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadDirectPdf}
              className="inline-flex items-center gap-2 rounded-xl bg-[#123C35] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#1D6B59] transition disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingPdf ? (
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-300" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>{isGeneratingPdf ? "Menyiapkan Dokumen PDF..." : "Unduh PDF"}</span>
            </button>
          </div>
        </div>

        {/* Notifikasi Status Unduhan Langsung */}
        {downloadFeedback && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 text-xs ${
              downloadFeedback.ok
                ? "border-emerald-200 bg-emerald-50 text-[#123C35]"
                : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2">
              {downloadFeedback.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-700" />
              )}
              <span>{downloadFeedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setDownloadFeedback(null)}
              className="text-xs font-semibold underline ml-4 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* 6 KATEGORI LAPORAN (TABS NAVIGASI UTAMA) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(
            [
              { id: "pembayaran", label: "1. Pembayaran", icon: CreditCard, count: filteredTagihan.length },
              { id: "uang_saku", label: "2. Uang Saku", icon: Wallet, count: filteredSantri.length },
              { id: "mengaji", label: "3. Mengaji", icon: BookOpen, count: filteredMengaji.length },
              { id: "tahfidz", label: "4. Tahfidz", icon: GraduationCap, count: filteredTahfidz.length },
              { id: "kedisiplinan", label: "5. Kedisiplinan", icon: ShieldAlert, count: filteredKedisiplinan.length },
              { id: "prestasi", label: "6. Prestasi", icon: Award, count: filteredPrestasi.length },
            ] as const
          ).map((cat) => {
            const Icon = cat.icon;
            const isActive = activeKategori === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveKategori(cat.id)}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition ${
                  isActive
                    ? "bg-emerald-50 border-[#123C35] shadow-xs text-slate-900 ring-1 ring-[#123C35]/15"
                    : "bg-white border-[#E5E7EB] text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Icon className={`h-4 w-4 ${isActive ? "text-emerald-800" : "text-slate-400"}`} />
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                      isActive ? "bg-emerald-200 text-emerald-900" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {cat.count}
                  </span>
                </div>
                <span className="font-bold text-xs mt-1">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* FORMULIR FILTER & PENCARIAN TERPADU */}
        <div className="mt-4 rounded-xl bg-slate-50 p-4 border border-[#E5E7EB]/80 text-xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-emerald-800" />
              Parameter Filter &amp; Pencarian
            </span>
            {(filterKelasId !== "ALL" ||
              filterKamarId !== "ALL" ||
              filterSantriId !== "ALL" ||
              filterStatusTagihan !== "ALL" ||
              filterRentangMulai ||
              filterRentangSelesai ||
              searchQuery) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline"
              >
                Reset Semua Filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Filter Kelas */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Kelas Santri</label>
              <select
                value={filterKelasId}
                onChange={(e) => setFilterKelasId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="ALL">Semua Kelas</option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kelas}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Kamar */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Kamar Asrama</label>
              <select
                value={filterKamarId}
                onChange={(e) => setFilterKamarId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="ALL">Semua Kamar Asrama</option>
                {kamarList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama_kamar} ({k.gedung_asrama})
                  </option>
                ))}
              </select>
            </div>

            {/* Rentang Tanggal Mulai */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Periode Dari Tanggal</label>
              <input
                type="date"
                value={filterRentangMulai}
                onChange={(e) => setFilterRentangMulai(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>

            {/* Rentang Tanggal Selesai */}
            <div>
              <label className="font-semibold text-slate-600 block mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterRentangSelesai}
                onChange={(e) => setFilterRentangSelesai(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>

            {/* Cari Nama atau NIS */}
            <div className="sm:col-span-2">
              <label className="font-semibold text-slate-600 block mb-1">Cari Nama Santri atau NIS</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Ketik nama lengkap atau nomor induk santri..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800"
                />
              </div>
            </div>

            {/* Filter Khusus Tagihan */}
            {activeKategori === "pembayaran" && (
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-600 block mb-1">Status Pembayaran Tagihan</label>
                <select
                  value={filterStatusTagihan}
                  onChange={(e) => setFilterStatusTagihan(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="ALL">Semua Status Tagihan</option>
                  <option value="LUNAS">Pembayaran Lunas</option>
                  <option value="DIBAYAR_SEBAGIAN">Pembayaran Sebagian (Cicilan)</option>
                  <option value="BELUM_BAYAR">Tunggakan (Belum Dibayar)</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          RINGKASAN METRIK KATEGORI AKTIF
         ========================================================================= */}
      {activeKategori === "pembayaran" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 no-print">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <span className="text-xs text-slate-500 block">Total Tagihan Terbit</span>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{formatRupiah(totalTagihanNominal)}</p>
            <span className="text-[11px] text-slate-400">{filteredTagihan.length} tagihan terdata</span>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
            <span className="text-xs text-emerald-800 block font-semibold">Total Pembayaran Masuk</span>
            <p className="mt-1 text-lg font-extrabold text-[#123C35]">{formatRupiah(totalTerbayarNominal)}</p>
            <span className="text-[11px] text-emerald-700">Telah diterima Bendahara</span>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
            <span className="text-xs text-rose-800 block font-semibold">Total Sisa Tunggakan</span>
            <p className="mt-1 text-lg font-extrabold text-rose-900">{formatRupiah(totalTunggakanNominal)}</p>
            <span className="text-[11px] text-rose-700">Piutang kewajiban santri</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TABEL DATA RESMI (TAMPIL DI LAYAR DAN SESUAI CETAK A4 PORTRAIT)
         ========================================================================= */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm print:border-none print:shadow-none print:p-0">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900">{currentMeta.title}</h3>
            <p className="text-xs text-slate-500">{currentMeta.desc}</p>
          </div>
          <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            Format: A4 Portrait
          </span>
        </div>

        {/* 1. KATEGORI PEMBAYARAN */}
        {activeKategori === "pembayaran" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas / Kamar</th>
                  <th className="py-2.5 px-3">Jenis Tagihan</th>
                  <th className="py-2.5 px-3 text-right">Nominal Tagihan</th>
                  <th className="py-2.5 px-3 text-right">Terbayar</th>
                  <th className="py-2.5 px-3 text-right">Sisa Tunggakan</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTagihan.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Tidak ada data tagihan atau pembayaran yang sesuai filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredTagihan.map((t, idx) => {
                    const snt = santriMap.get(t.santri_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{snt?.nama_lengkap || "-"}</p>
                          <span className="text-[11px] font-mono text-slate-500">{snt?.nis || "-"}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {snt?.kelas_id ? kelasMap.get(snt.kelas_id) : "-"}
                          <span className="text-[10px] text-slate-400 block">
                            {snt?.kamar_id ? kamarMap.get(snt.kamar_id) : "-"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {t.judul_tagihan || "Iuran Pesantren"}
                          <span className="text-[10px] text-slate-500 block">
                            Jatuh Tempo: {formatTanggal(t.tanggal_jatuh_tempo)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                          {formatRupiah(t.nominal_tagihan)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-800">
                          {formatRupiah(t.total_terbayar)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-700">
                          {formatRupiah(t.sisa_tagihan)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.status === "LUNAS"
                                ? "bg-emerald-100 text-emerald-800"
                                : t.status === "DIBAYAR_SEBAGIAN"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {t.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. KATEGORI UANG SAKU */}
        {activeKategori === "uang_saku" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas &amp; Kamar</th>
                  <th className="py-2.5 px-3 text-right">Total Uang Masuk</th>
                  <th className="py-2.5 px-3 text-right">Total Penarikan</th>
                  <th className="py-2.5 px-3 text-right">Penyesuaian</th>
                  <th className="py-2.5 px-3 text-right">Saldo Terkini</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredSantri.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Tidak ada santri yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredSantri.map((s, idx) => {
                    const ldg = getSaldoSantri(s.id);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{s.nama_lengkap}</p>
                          <span className="text-[11px] font-mono text-slate-500">{s.nis}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {s.kelas_id ? kelasMap.get(s.kelas_id) : "-"}
                          <span className="text-[10px] text-slate-400 block">
                            {s.kamar_id ? kamarMap.get(s.kamar_id) : "-"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-emerald-800">
                          {formatRupiah(ldg.total_masuk)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-rose-700">
                          {formatRupiah(ldg.total_keluar)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {formatRupiah(ldg.total_penyesuaian)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          {formatRupiah(ldg.saldo_saat_ini)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. KATEGORI MENGAJI */}
        {activeKategori === "mengaji" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3">Jilid / Kitab</th>
                  <th className="py-2.5 px-3">Materi / Halaman</th>
                  <th className="py-2.5 px-3">Kelancaran</th>
                  <th className="py-2.5 px-3">Catatan Pembimbing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredMengaji.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Tidak ada catatan pembelajaran mengaji yang sesuai filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredMengaji.map((m, idx) => {
                    const snt = santriMap.get(m.santri_id);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {formatTanggal(m.tanggal_penilaian)}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{snt?.nama_lengkap || "-"}</p>
                          <span className="text-[11px] font-mono text-slate-500">{snt?.nis || "-"}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {snt?.kelas_id ? kelasMap.get(snt.kelas_id) : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-900">{m.tingkat_jilid}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{m.materi_terakhir}</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {m.kelancaran_bacaan || "Lancar"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate">
                          {m.catatan_perkembangan || "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. KATEGORI TAHFIDZ */}
        {activeKategori === "tahfidz" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3">Surah &amp; Ayat</th>
                  <th className="py-2.5 px-3 text-center">Juz</th>
                  <th className="py-2.5 px-3 text-center">Jumlah Ayat</th>
                  <th className="py-2.5 px-3 text-center">Kualitas Hafalan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTahfidz.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Tidak ada catatan setoran tahfidz yang sesuai filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredTahfidz.map((t, idx) => {
                    const snt = santriMap.get(t.santri_id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {formatTanggal(t.tanggal_setoran)}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{snt?.nama_lengkap || "-"}</p>
                          <span className="text-[11px] font-mono text-slate-500">{snt?.nis || "-"}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {snt?.kelas_id ? kelasMap.get(snt.kelas_id) : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-900">
                          Surah {t.nama_surah} (Ayat {t.ayat_awal} - {t.ayat_akhir})
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">Juz {t.juz}</td>
                        <td className="py-2.5 px-3 text-center font-semibold text-slate-700">{t.jumlah_ayat}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                            {t.kualitas_hafalan || "Mumtaz"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. KATEGORI KEDISIPLINAN */}
        {activeKategori === "kedisiplinan" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Tanggal &amp; Waktu</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3">Kategori Pelanggaran</th>
                  <th className="py-2.5 px-3 text-center">Tingkat</th>
                  <th className="py-2.5 px-3">Deskripsi &amp; Tindak Lanjut</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredKedisiplinan.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Tidak ada catatan indisipliner santri yang sesuai filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredKedisiplinan.map((k, idx) => {
                    const snt = santriMap.get(k.santri_id);
                    return (
                      <tr key={k.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {formatTanggal(k.tanggal_kejadian)}
                          <span className="text-[10px] text-slate-400 block">{k.waktu_kejadian || ""}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{snt?.nama_lengkap || "-"}</p>
                          <span className="text-[11px] font-mono text-slate-500">{snt?.nis || "-"}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {snt?.kelas_id ? kelasMap.get(snt.kelas_id) : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-rose-800">{k.nama_kategori}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              k.tingkat_pelanggaran === "BERAT"
                                ? "bg-rose-100 text-rose-800"
                                : k.tingkat_pelanggaran === "SEDANG"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {k.tingkat_pelanggaran}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[220px]">
                          <p className="font-medium text-slate-800 truncate">{k.deskripsi}</p>
                          <span className="text-[10px] text-slate-500 block truncate">
                            Tindak Lanjut: {k.tindak_lanjut || "-"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              k.status_tindak_lanjut === "SELESAI"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {k.status_tindak_lanjut}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. KATEGORI PRESTASI */}
        {activeKategori === "prestasi" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-slate-700 font-bold print:bg-transparent">
                  <th className="py-2.5 px-3">No</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">NIS &amp; Nama Santri</th>
                  <th className="py-2.5 px-3">Kelas</th>
                  <th className="py-2.5 px-3">Nama Kegiatan / Prestasi</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3 text-center">Tingkat</th>
                  <th className="py-2.5 px-3 text-center">Peringkat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPrestasi.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Tidak ada catatan prestasi santri yang sesuai filter aktif.
                    </td>
                  </tr>
                ) : (
                  filteredPrestasi.map((p, idx) => {
                    const snt = santriMap.get(p.santri_id);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 print:hover:bg-transparent">
                        <td className="py-2.5 px-3 text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {formatTanggal(p.tanggal_prestasi)}
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{snt?.nama_lengkap || "-"}</p>
                          <span className="text-[11px] font-mono text-slate-500">{snt?.nis || "-"}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {snt?.kelas_id ? kelasMap.get(snt.kelas_id) : "-"}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{p.nama_kegiatan}</td>
                        <td className="py-2.5 px-3 text-slate-700">{p.kategori}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900">
                            {p.tingkat_prestasi}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                          {p.peringkat || "Juara 1"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tanda Tangan Resmi Dokumen Saat Dicetak (Print Only) */}
        <div className="hidden print:block mt-12 page-break-inside-avoid">
          <div className="grid grid-cols-2 text-center text-xs">
            <div>
              <p className="text-slate-600">Mengetahui,</p>
              <p className="font-bold text-black mt-0.5">Pimpinan Pondok Pesantren</p>
              <div className="h-16"></div>
              <p className="font-bold text-black underline">( KH. Pimpinan Pesantren )</p>
              <p className="text-[10px] text-slate-600">NIP / NIY: -</p>
            </div>
            <div>
              <p className="text-slate-600">Cirebon, {formatTanggal(new Date().toISOString().slice(0, 10))}</p>
              <p className="font-bold text-black mt-0.5">Pengasuh / Petugas Pencatat</p>
              <div className="h-16"></div>
              <p className="font-bold text-black underline">
                ( {currentUser?.nama_lengkap || "Pengasuh Pondok Pesantren"} )
              </p>
              <p className="text-[10px] text-slate-600">SIPETA Abu Manshur System</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
