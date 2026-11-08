"use client";

import React, { useState } from "react";
import { Award, BookOpen, History, Info, ShieldAlert, Sparkles } from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal, formatWaktuLengkap } from "@/lib/utils/format";
import type {
  JenisSetoranTahfidz,
  StatusTindakLanjut,
  TingkatPrestasi,
} from "@/types/database";

type PengelolaTab = "mengaji" | "tahfidz" | "prestasi" | "kedisiplinan";

export function PengelolaPortal() {
  const {
    santriList,
    mengajiList,
    tahfidzList,
    prestasiList,
    masterPelanggaranList,
    kedisiplinanList,
    recordPerkembanganMengaji,
    recordSetoranTahfidz,
    recordPrestasiSantri,
    recordCatatanKedisiplinan,
    updateTindakLanjutKedisiplinan,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<PengelolaTab>("mengaji");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State Mengaji
  const [santriMengaji, setSantriMengaji] = useState(santriList[0]?.id ?? "snt-001");
  const [pembimbingMengaji, setPembimbingMengaji] = useState("Ustadz H. Fauzan Azima, Lc.");
  const [metodeMengaji, setMetodeMengaji] = useState("Al-Qur'an Bin-Nadzor & Tahsin");
  const [tingkatJilid, setTingkatJilid] = useState("Tahsin Al-Qur'an Juz 15");
  const [materiTerakhir, setMateriTerakhir] = useState("QS. Al-Isra Ayat 1 - 35");
  const [kelancaran, setKelancaran] = useState("Sangat Lancar (A)");
  const [makharij, setMakharij] = useState("Fasih & Tepat (A)");
  const [tajwid, setTajwid] = useState("Sangat Baik (A)");
  const [catatanMengaji, setCatatanMengaji] = useState(
    "Bacaan tartil dan makharijul huruf stabil, siap melanjutkan ke halaman berikutnya."
  );

  // State Tahfidz
  const [santriTahfidz, setSantriTahfidz] = useState(santriList[0]?.id ?? "snt-001");
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
  const [santriPrestasi, setSantriPrestasi] = useState(santriList[0]?.id ?? "snt-001");
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
  const [santriDisiplin, setSantriDisiplin] = useState(santriList[0]?.id ?? "snt-001");
  const [kategoriDisiplinId, setKategoriDisiplinId] = useState(
    masterPelanggaranList[0]?.id ?? "kat-dis-01"
  );
  const [deskripsiDisiplin, setDeskripsiDisiplin] = useState("");
  const [tindakLanjutDisiplin, setTindakLanjutDisiplin] = useState(
    "Murojaah tambahan 2 halaman & dzikir pagi bersama Musyrif"
  );
  const [catatanPembinaanDisiplin, setCatatanPembinaanDisiplin] = useState(
    "Santri menyadari kekhilafan dan berkomitmen hadir 10 menit sebelum adzan."
  );

  // State Update Riwayat Kedisiplinan
  const [selectedDisiplinId, setSelectedDisiplinId] = useState(
    kedisiplinanList[0]?.id ?? "dis-001"
  );
  const [statusTindakBaru, setStatusTindakBaru] = useState<StatusTindakLanjut>("SELESAI");
  const [catatanPembinaanUpdate, setCatatanPembinaanUpdate] = useState(
    "Evaluasi pembinaan lanjutan selesai dengan hasil sangat baik."
  );
  const [alasanUpdateDisiplin, setAlasanUpdateDisiplin] = useState(
    "Verifikasi akhir pembinaan oleh Pengelola Kepesantrenan"
  );

  const getSantriName = (id: string) => {
    const s = santriList.find((x) => x.id === id);
    return s ? `${s.nama_lengkap} (${s.nis})` : id;
  };

  return (
    <div className="space-y-6">
      {/* Header Pengelola Kepesantrenan (Bab 3.4 PRD) */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-950 via-emerald-900 to-teal-950 p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              Portal Pengelola Kepesantrenan (Mengaji, Tahfidz, Prestasi, & Kedisiplinan)
            </h2>
            <p className="mt-0.5 text-xs text-emerald-100/90">
              Sesuai Bab 3.4 PRD: Pengelola mencatat perkembangan ibadah, tahfidz, prestasi, serta
              pembinaan santri, dan tidak memiliki akses ke rincian transaksi keuangan.
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
            { id: "mengaji", label: "Perkembangan Mengaji", icon: BookOpen },
            { id: "tahfidz", label: "Setoran Tahfidz Al-Qur'an", icon: Sparkles },
            { id: "prestasi", label: "Prestasi Santri", icon: Award },
            {
              id: "kedisiplinan",
              label: "Kedisiplinan & Riwayat Pembinaan",
              icon: ShieldAlert,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as PengelolaTab);
                  setFeedback(null);
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition ${
                  active
                    ? "bg-white text-emerald-950 shadow-sm"
                    : "bg-white/10 text-emerald-100 hover:bg-white/20"
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

      {/* TAB 1: MENGAJI */}
      {activeTab === "mengaji" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Catat Evaluasi Perkembangan Mengaji
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const res = recordPerkembanganMengaji({
                  santri_id: santriMengaji,
                  tanggal_penilaian: new Date().toISOString().slice(0, 10),
                  pembimbing_name: pembimbingMengaji,
                  metode_pembelajaran: metodeMengaji,
                  tingkat_jilid: tingkatJilid,
                  materi_terakhir: materiTerakhir,
                  kelancaran_bacaan: kelancaran,
                  makharijul_huruf: makharij,
                  tajwid,
                  catatan_perkembangan: catatanMengaji,
                });
                setFeedback({ ok: res.ok, text: res.message });
              }}
              className="mt-3 space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700">Santri</label>
                <select
                  value={santriMengaji}
                  onChange={(e) => setSantriMengaji(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {santriList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nis} — {s.nama_lengkap}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Metode Pembelajaran</label>
                <input
                  type="text"
                  required
                  value={metodeMengaji}
                  onChange={(e) => setMetodeMengaji(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Tingkat / Jilid</label>
                  <input
                    type="text"
                    required
                    value={tingkatJilid}
                    onChange={(e) => setTingkatJilid(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Materi Terakhir</label>
                  <input
                    type="text"
                    required
                    value={materiTerakhir}
                    onChange={(e) => setMateriTerakhir(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700">Kelancaran</label>
                  <input
                    type="text"
                    required
                    value={kelancaran}
                    onChange={(e) => setKelancaran(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Makharij</label>
                  <input
                    type="text"
                    required
                    value={makharij}
                    onChange={(e) => setMakharij(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Tajwid</label>
                  <input
                    type="text"
                    required
                    value={tajwid}
                    onChange={(e) => setTajwid(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-700">Catatan Pembimbing</label>
                <textarea
                  rows={3}
                  required
                  value={catatanMengaji}
                  onChange={(e) => setCatatanMengaji(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Simpan Perkembangan Mengaji
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Rekapitulasi Perkembangan Mengaji Seluruh Santri ({mengajiList.length})
            </h3>
            {mengajiList.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{getSantriName(m.santri_id)}</span>
                  <span className="text-slate-500">{formatTanggal(m.tanggal_penilaian)}</span>
                </div>
                <p className="text-emerald-800 font-semibold">
                  {m.metode_pembelajaran} • {m.tingkat_jilid} • Materi: {m.materi_terakhir}
                </p>
                <p className="text-slate-600">
                  Kelancaran: {m.kelancaran_bacaan} | Makharij: {m.makharijul_huruf} | Tajwid:{" "}
                  {m.tajwid}
                </p>
                <p className="text-slate-700 bg-slate-50 p-2 rounded">
                  <strong>Catatan ({m.pembimbing_name}):</strong> {m.catatan_perkembangan}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: TAHFIDZ */}
      {activeTab === "tahfidz" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Catat Setoran Tahfidz Baru</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
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
              <div>
                <label className="font-semibold text-slate-700">Santri</label>
                <select
                  value={santriTahfidz}
                  onChange={(e) => setSantriTahfidz(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {santriList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nis} — {s.nama_lengkap}
                    </option>
                  ))}
                </select>
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
                className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Simpan Setoran Tahfidz
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Riwayat Setoran Tahfidz ({tahfidzList.length})
            </h3>
            {tahfidzList.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-1">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Catat Prestasi Santri</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
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
              <div>
                <label className="font-semibold text-slate-700">Santri</label>
                <select
                  value={santriPrestasi}
                  onChange={(e) => setSantriPrestasi(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {santriList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nis} — {s.nama_lengkap}
                    </option>
                  ))}
                </select>
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
                className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Simpan Prestasi Santri
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Prestasi Santri ({prestasiList.length})
            </h3>
            {prestasiList.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-1">
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

      {/* TAB 4: KEDISIPLINAN & RIWAYAT PERUBAHAN PEMBINAAN */}
      {activeTab === "kedisiplinan" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">
                Catat Pelanggaran & Pembinaan Baru
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
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
                <div>
                  <label className="font-semibold text-slate-700">Santri</label>
                  <select
                    value={santriDisiplin}
                    onChange={(e) => setSantriDisiplin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.nama_lengkap}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">
                    Kategori Pelanggaran (Master Data)
                  </label>
                  <select
                    value={kategoriDisiplinId}
                    onChange={(e) => setKategoriDisiplinId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  >
                    {masterPelanggaranList.map((k) => (
                      <option key={k.id} value={k.id}>
                        [{k.tingkat_pelanggaran}] {k.nama_kategori}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Deskripsi Kejadian</label>
                  <textarea
                    rows={2}
                    required
                    value={deskripsiDisiplin}
                    onChange={(e) => setDeskripsiDisiplin(e.target.value)}
                    placeholder="Uraikan waktu dan kronologi singkat..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Tindak Lanjut</label>
                  <input
                    type="text"
                    required
                    value={tindakLanjutDisiplin}
                    onChange={(e) => setTindakLanjutDisiplin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Catatan Pembinaan</label>
                  <input
                    type="text"
                    required
                    value={catatanPembinaanDisiplin}
                    onChange={(e) => setCatatanPembinaanDisiplin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
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
                  <label className="font-semibold text-slate-700">Pilih Catatan</label>
                  <select
                    value={selectedDisiplinId}
                    onChange={(e) => setSelectedDisiplinId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  >
                    {kedisiplinanList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getSantriName(d.santri_id)} — {d.nama_kategori}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Status Baru</label>
                  <select
                    value={statusTindakBaru}
                    onChange={(e) => setStatusTindakBaru(e.target.value as StatusTindakLanjut)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold"
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
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Alasan Perubahan</label>
                  <input
                    type="text"
                    required
                    value={alasanUpdateDisiplin}
                    onChange={(e) => setAlasanUpdateDisiplin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-indigo-700 py-2 font-bold text-white hover:bg-indigo-800"
                >
                  Perbarui & Arsipkan Catatan Lama
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Catatan Kedisiplinan & Jejak Riwayat Pembinaan
            </h3>
            {kedisiplinanList.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-900">
                    {getSantriName(d.santri_id)} — {d.nama_kategori}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-800">
                    {d.status_tindak_lanjut}
                  </span>
                </div>
                <p className="text-slate-600">{d.deskripsi}</p>
                <p className="text-slate-800">
                  <strong>Pembinaan Saat Ini:</strong> {d.catatan_pembinaan}
                </p>
                {d.riwayat_perubahan.length > 0 && (
                  <div className="border-t border-slate-100 pt-2">
                    <span className="font-bold text-slate-500">
                      Riwayat Catatan Sebelumnya ({d.riwayat_perubahan.length}):
                    </span>
                    {d.riwayat_perubahan.map((r) => (
                      <div
                        key={r.id}
                        className="mt-1 rounded bg-slate-50 p-2 text-[11px] text-slate-600"
                      >
                        [{formatWaktuLengkap(r.created_at)}] {r.status_sebelum} →{" "}
                        {r.status_sesudah} | Catatan lama: &ldquo;{r.catatan_pembinaan_sebelum}
                        &rdquo;
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

