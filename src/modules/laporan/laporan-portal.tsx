"use client";

import React, { useMemo, useState } from "react";
import { BarChart3, BookOpen, CreditCard, Filter, Printer, Wallet } from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import {
  formatRupiah,
  formatTanggal,
  getStatusTagihanBadge,
} from "@/lib/utils/format";
import { canRoleViewFinancialDetails } from "@/lib/validations/schemas";

type JenisLaporan = "pembayaran" | "uang_saku" | "kepesantrenan";

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
    getSaldoSantri,
  } = useSipeta();

  const canSeeFinance = currentUser ? canRoleViewFinancialDetails(currentUser.role) : false;
  const [jenisLaporan, setJenisLaporan] = useState<JenisLaporan>(
    canSeeFinance ? "pembayaran" : "kepesantrenan"
  );

  // Filter sesuai Bab 14 PRD: Tanggal, Kelas, Kamar, dan Santri
  const [filterKelasId, setFilterKelasId] = useState<string>("ALL");
  const [filterKamarId, setFilterKamarId] = useState<string>("ALL");
  const [filterSantriId, setFilterSantriId] = useState<string>("ALL");
  const [filterStatusTagihan, setFilterStatusTagihan] = useState<string>("ALL");

  const filteredSantri = useMemo(() => {
    return santriList.filter((s) => {
      if (currentUser?.role === "wali" && s.id !== currentUser.santri_id) return false;
      if (filterKelasId !== "ALL" && s.kelas_id !== filterKelasId) return false;
      if (filterKamarId !== "ALL" && s.kamar_id !== filterKamarId) return false;
      if (filterSantriId !== "ALL" && s.id !== filterSantriId) return false;
      return true;
    });
  }, [santriList, currentUser, filterKelasId, filterKamarId, filterSantriId]);

  const filteredSantriIds = useMemo(
    () => new Set(filteredSantri.map((s) => s.id)),
    [filteredSantri]
  );

  const filteredTagihan = useMemo(() => {
    return tagihanList.filter((t) => {
      if (!filteredSantriIds.has(t.santri_id)) return false;
      if (filterStatusTagihan !== "ALL" && t.status !== filterStatusTagihan) return false;
      return true;
    });
  }, [tagihanList, filteredSantriIds, filterStatusTagihan]);

  const totalTagihanNominal = filteredTagihan.reduce((s, t) => s + t.nominal_tagihan, 0);
  const totalTerbayarNominal = filteredTagihan.reduce((s, t) => s + t.total_terbayar, 0);
  const totalTunggakanNominal = filteredTagihan.reduce((s, t) => s + t.sisa_tagihan, 0);
  const pendingVerifikasiCount = transaksiPembayaranList.filter(
    (t) => filteredSantriIds.has(t.santri_id) && t.status === "MENUNGGU_VERIFIKASI"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header & Filter Laporan (Bab 14 PRD) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <img
              src="/images/logo-abu-manshur.png"
              alt="Logo PP Modern Abu Manshur"
              className="h-12 w-12 object-contain shrink-0"
            />
            <div>
              <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase">
                <BarChart3 className="h-4 w-4" />
                <span>Pusat Laporan & Rekapitulasi Akuntabilitas SIPETA</span>
              </div>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900">
                Laporan Pembayaran, Uang Saku, dan Perkembangan Kepesantrenan
              </h2>
              <p className="text-xs text-slate-500">Pondok Pesantren Modern Abu Manshur • Plered - Cirebon</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Cetak / Ekspor PDF
          </button>
        </div>

        {/* Pilihan Kategori Laporan sesuai Hak Akses Role */}
        <div className="mt-4 flex flex-wrap gap-2">
          {canSeeFinance && (
            <>
              <button
                type="button"
                onClick={() => setJenisLaporan("pembayaran")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  jenisLaporan === "pembayaran"
                    ? "bg-emerald-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                14.1 Laporan Pembayaran & Tagihan
              </button>
              <button
                type="button"
                onClick={() => setJenisLaporan("uang_saku")}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  jenisLaporan === "uang_saku"
                    ? "bg-emerald-800 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                <Wallet className="h-4 w-4" />
                14.2 Laporan Uang Saku Santri
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setJenisLaporan("kepesantrenan")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              jenisLaporan === "kepesantrenan"
                ? "bg-emerald-800 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            14.3 Laporan Kepesantrenan
          </button>
        </div>

        {/* Baris Filter Kelas, Kamar, Santri, Status */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3.5 sm:grid-cols-4 text-xs border border-slate-200/80">
          <div>
            <label className="font-semibold text-slate-600 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter Kelas
            </label>
            <select
              value={filterKelasId}
              onChange={(e) => setFilterKelasId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Semua Kelas</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_kelas}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-semibold text-slate-600">Filter Kamar Asrama</label>
            <select
              value={filterKamarId}
              onChange={(e) => setFilterKamarId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Semua Kamar</option>
              {kamarList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama_kamar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-semibold text-slate-600">Filter Santri</label>
            <select
              value={filterSantriId}
              onChange={(e) => setFilterSantriId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            >
              <option value="ALL">Seluruh Santri Terfilter</option>
              {santriList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nis} — {s.nama_lengkap}
                </option>
              ))}
            </select>
          </div>
          {jenisLaporan === "pembayaran" && (
            <div>
              <label className="font-semibold text-slate-600">Status Tagihan</label>
              <select
                value={filterStatusTagihan}
                onChange={(e) => setFilterStatusTagihan(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
              >
                <option value="ALL">Semua Status</option>
                <option value="LUNAS">Pembayaran Lunas</option>
                <option value="DIBAYAR_SEBAGIAN">Pembayaran Sebagian (Cicilan)</option>
                <option value="BELUM_BAYAR">Tunggakan (Belum Dibayar)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 14.1 LAPORAN PEMBAYARAN */}
      {jenisLaporan === "pembayaran" && canSeeFinance && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs text-slate-500">Total Tagihan Diterbitkan</span>
              <p className="mt-1 text-lg font-extrabold text-slate-900">
                {formatRupiah(totalTagihanNominal)}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <span className="text-xs text-emerald-800">Total Pembayaran Diterima</span>
              <p className="mt-1 text-lg font-extrabold text-emerald-900">
                {formatRupiah(totalTerbayarNominal)}
              </p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <span className="text-xs text-rose-800">Total Tunggakan / Sisa Kewajiban</span>
              <p className="mt-1 text-lg font-extrabold text-rose-900">
                {formatRupiah(totalTunggakanNominal)}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <span className="text-xs text-amber-800">Transaksi Menunggu Verifikasi</span>
              <p className="mt-1 text-lg font-extrabold text-amber-900">
                {pendingVerifikasiCount} Transaksi
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              Rincian Tagihan & Status Kewajiban ({filteredTagihan.length} Baris)
            </h3>
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 uppercase text-slate-500">
                  <th className="py-2 pr-3">No. Tagihan</th>
                  <th className="py-2 px-3">Santri & Kelas</th>
                  <th className="py-2 px-3">Nama Tagihan & Periode</th>
                  <th className="py-2 px-3 text-right">Nominal</th>
                  <th className="py-2 px-3 text-right">Terbayar</th>
                  <th className="py-2 px-3 text-right">Tunggakan</th>
                  <th className="py-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTagihan.map((t) => {
                  const s = santriList.find((x) => x.id === t.santri_id);
                  const kls = kelasList.find((x) => x.id === s?.kelas_id);
                  const b = getStatusTagihanBadge(t.status);
                  return (
                    <tr key={t.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold">{t.nomor_tagihan}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{s?.nama_lengkap}</div>
                        <div className="text-[11px] text-slate-500">{kls?.nama_kelas}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800">{t.judul_tagihan}</div>
                        <div className="text-[11px] text-slate-500">{t.periode_label}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatRupiah(t.nominal_tagihan)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                        {formatRupiah(t.total_terbayar)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700 font-bold">
                        {formatRupiah(t.sisa_tagihan)}
                      </td>
                      <td className="py-2.5 pl-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${b.className}`}
                        >
                          {b.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 14.2 LAPORAN UANG SAKU */}
      {jenisLaporan === "uang_saku" && canSeeFinance && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
          <h3 className="text-base font-bold text-slate-900 mb-3">
            Rekapitulasi Uang Saku per Santri & Kelas
          </h3>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 uppercase text-slate-500">
                <th className="py-2 pr-3">NIS & Nama Santri</th>
                <th className="py-2 px-3">Kelas & Kamar</th>
                <th className="py-2 px-3 text-right">Total Uang Masuk</th>
                <th className="py-2 px-3 text-right">Total Uang Keluar</th>
                <th className="py-2 px-3 text-right">Penyesuaian</th>
                <th className="py-2 pl-3 text-right">Saldo Saat Ini</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSantri.map((s) => {
                const ldg = getSaldoSantri(s.id);
                const kls = kelasList.find((k) => k.id === s.kelas_id);
                const kmr = kamarList.find((k) => k.id === s.kamar_id);
                return (
                  <tr key={s.id}>
                    <td className="py-3 pr-3 font-bold text-slate-900">
                      {s.nis} — {s.nama_lengkap}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {kls?.nama_kelas} • {kmr?.nama_kamar}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-700 font-semibold">
                      {formatRupiah(ldg.total_masuk)}
                    </td>
                    <td className="py-3 px-3 text-right text-rose-700 font-semibold">
                      {formatRupiah(ldg.total_keluar)}
                    </td>
                    <td className="py-3 px-3 text-right text-purple-700">
                      {formatRupiah(ldg.total_penyesuaian)}
                    </td>
                    <td className="py-3 pl-3 text-right font-extrabold text-slate-900">
                      {formatRupiah(ldg.saldo_saat_ini)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 14.3 LAPORAN KEPESANTRENAN */}
      {jenisLaporan === "kepesantrenan" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
          <h3 className="text-base font-bold text-slate-900 mb-3">
            Rekapitulasi Perkembangan Mengaji, Tahfidz, Prestasi, & Kedisiplinan Santri
          </h3>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 uppercase text-slate-500">
                <th className="py-2 pr-3">Santri</th>
                <th className="py-2 px-3">Mengaji Terakhir</th>
                <th className="py-2 px-3">Total Setoran Tahfidz</th>
                <th className="py-2 px-3">Prestasi</th>
                <th className="py-2 pl-3">Catatan Kedisiplinan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSantri.map((s) => {
                const ngj = mengajiList.find((m) => m.santri_id === s.id);
                const thf = tahfidzList.filter((t) => t.santri_id === s.id);
                const totalAyat = thf.reduce((acc, x) => acc + x.jumlah_ayat, 0);
                const prs = prestasiList.filter((p) => p.santri_id === s.id);
                const dis = kedisiplinanList.filter((d) => d.santri_id === s.id);
                return (
                  <tr key={s.id}>
                    <td className="py-3 pr-3 font-bold text-slate-900">
                      {s.nis} — {s.nama_lengkap}
                    </td>
                    <td className="py-3 px-3">
                      {ngj ? `${ngj.tingkat_jilid} (${ngj.materi_terakhir})` : "-"}
                    </td>
                    <td className="py-3 px-3 font-semibold text-emerald-800">
                      {thf.length} Setoran ({totalAyat} Ayat)
                    </td>
                    <td className="py-3 px-3">{prs.length} Prestasi</td>
                    <td className="py-3 pl-3">{dis.length} Catatan Pembinaan</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

