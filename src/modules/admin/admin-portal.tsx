"use client";

import React, { useState } from "react";
import {
  ArrowRightLeft,
  Building2,
  CreditCard,
  Info,
  Megaphone,
  Plus,
  Receipt,
  Users,
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
import type { KebijakanCicilan, StatusSantri, Tagihan } from "@/types/database";

type AdminTab =
  | "santri_wali"
  | "kelas_kamar"
  | "jenis_dan_tagihan"
  | "pengumuman";

export function AdminPortal() {
  const {
    santriList,
    waliList,
    kelasList,
    kamarList,
    riwayatPenempatan,
    jenisPembayaranList,
    tagihanList,
    riwayatPenyesuaianTagihan,
    pengumumanList,
    createSantriWithWali,
    moveSantriPlacement,
    updateStatusSantri,
    createKelas,
    createKamar,
    createJenisPembayaran,
    generateTagihan,
    adjustTagihan,
    createPengumuman,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<AdminTab>("santri_wali");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State Penyesuaian Tagihan (Bab 5.3 PRD)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [targetTagihanAdjust, setTargetTagihanAdjust] = useState<Tagihan | null>(null);
  const [adjustNominalBaru, setAdjustNominalBaru] = useState<number>(0);
  const [adjustAlasan, setAdjustAlasan] = useState<string>("");

  // State form registrasi santri + wali 1:1
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
  const [emailWali, setEmailWali] = useState("");

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

  const handleRegisterSantri = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createSantriWithWali({
      nis,
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
      email_wali: emailWali,
    });
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setNamaSantri("");
      setNamaWali("");
      setEmailWali("");
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
            { id: "kelas_kamar", label: "Kelas, Kamar & Riwayat Penempatan", icon: Building2 },
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
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Santri Terdaftar & Relasi 1:1 Akun Orang Tua/Wali ({santriList.length})
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 uppercase text-slate-500">
                    <th className="py-2 pr-3">NIS & Nama Santri</th>
                    <th className="py-2 px-3">Kelas & Kamar</th>
                    <th className="py-2 px-3">Akun Orang Tua/Wali (1:1)</th>
                    <th className="py-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {santriList.map((s) => {
                    const kls = kelasList.find((k) => k.id === s.kelas_id);
                    const kmr = kamarList.find((k) => k.id === s.kamar_id);
                    const wali = waliList.find((w) => w.santri_id === s.id);
                    const badge = getStatusSantriBadge(s.status);
                    return (
                      <tr key={s.id}>
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
                                {wali.email} • {wali.no_telepon}
                              </div>
                            </>
                          ) : (
                            <span className="text-rose-600">Belum terhubung</span>
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Registrasi Santri Baru + Akun Orang Tua (1:1)
            </h3>
            <form onSubmit={handleRegisterSantri} className="mt-3 space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">NIS (Unik)</label>
                  <input
                    type="text"
                    required
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Jenis Kelamin</label>
                  <select
                    value={jenisKelamin}
                    onChange={(e) => setJenisKelamin(e.target.value as "L" | "P")}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
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
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Tempat Lahir</label>
                  <input
                    type="text"
                    required
                    value={tempatLahir}
                    onChange={(e) => setTempatLahir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Tanggal Lahir</label>
                  <input
                    type="date"
                    required
                    value={tanggalLahir}
                    onChange={(e) => setTanggalLahir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Kelas</label>
                  <select
                    value={kelasIdSantri}
                    onChange={(e) => setKelasIdSantri(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
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
                <label className="font-semibold text-slate-700">Alamat Lengkap</label>
                <input
                  type="text"
                  required
                  value={alamatSantri}
                  onChange={(e) => setAlamatSantri(e.target.value)}
                  placeholder="Alamat domisili santri & wali"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>

              <div className="border-t border-slate-200 pt-2">
                <p className="font-bold text-emerald-900">Data Akun Orang Tua / Wali (1:1)</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Nama Orang Tua/Wali</label>
                  <input
                    type="text"
                    required
                    value={namaWali}
                    onChange={(e) => setNamaWali(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Hubungan</label>
                  <select
                    value={hubunganWali}
                    onChange={(e) => setHubunganWali(e.target.value as "Ayah" | "Ibu" | "Wali")}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  >
                    <option value="Ayah">Ayah</option>
                    <option value="Ibu">Ibu</option>
                    <option value="Wali">Wali</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">No. Telepon / WA</label>
                  <input
                    type="text"
                    required
                    value={teleponWali}
                    onChange={(e) => setTeleponWali(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Email Login Wali</label>
                  <input
                    type="email"
                    required
                    value={emailWali}
                    onChange={(e) => setEmailWali(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Simpan Santri & Buat Akun Wali (1:1)
              </button>
            </form>
          </div>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Master Data Kelas</h3>
              <div className="mt-3 space-y-2">
                {kelasList.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{k.nama_kelas}</span> ({k.kode_kelas}
                      )
                      <div className="text-slate-500">Wali Kelas: {k.wali_kelas}</div>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">
                      Kapasitas {k.kapasitas}
                    </span>
                  </div>
                ))}
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
                }}
                className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 text-xs"
              >
                <input
                  type="text"
                  required
                  value={kodeKelasBaru}
                  onChange={(e) => setKodeKelasBaru(e.target.value)}
                  placeholder="Kode Kelas"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <input
                  type="text"
                  required
                  value={namaKelasBaru}
                  onChange={(e) => setNamaKelasBaru(e.target.value)}
                  placeholder="Nama Kelas"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white"
                >
                  + Tambah Kelas
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Master Data Kamar Asrama</h3>
              <div className="mt-3 space-y-2">
                {kamarList.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{k.nama_kamar}</span> ({k.gedung_asrama}
                      )
                      <div className="text-slate-500">Musyrif/ah: {k.musyrif}</div>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">
                      Kapasitas {k.kapasitas}
                    </span>
                  </div>
                ))}
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
                }}
                className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3 text-xs"
              >
                <input
                  type="text"
                  required
                  value={kodeKamarBaru}
                  onChange={(e) => setKodeKamarBaru(e.target.value)}
                  placeholder="Kode Kamar"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <input
                  type="text"
                  required
                  value={namaKamarBaru}
                  onChange={(e) => setNamaKamarBaru(e.target.value)}
                  placeholder="Nama Kamar"
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 font-bold text-white"
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
    </div>
  );
}

