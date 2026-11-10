"use client";

import React, { useState } from "react";
import {
  Calendar,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Clock,
  ShieldCheck,
  Info,
  X,
  Sparkles,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal } from "@/lib/utils/format";
import type { TahunAjaran } from "@/types/database";

export function MasterTahunAjaranView() {
  const {
    tahunAjaranList,
    profilPesantren,
    currentUser,
    createTahunAjaran,
    deleteTahunAjaran,
    setActiveTahunAjaran,
  } = useSipeta();

  // State Form Input Manual
  const [showModal, setShowModal] = useState(false);
  const [namaTahun, setNamaTahun] = useState("2026/2027");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");

  // State Modal Konfirmasi Simpan
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);

  // State Modal Konfirmasi Aktivasi
  const [targetAktivasi, setTargetAktivasi] = useState<TahunAjaran | null>(null);

  // Feedback State
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Validasi Form
  const isDuplicate = tahunAjaranList.some(
    (t) => t.nama.trim().toLowerCase() === namaTahun.trim().toLowerCase()
  );
  const isDateInvalid =
    Boolean(tanggalMulai && tanggalSelesai && new Date(tanggalSelesai) <= new Date(tanggalMulai));
  const isFormComplete =
    Boolean(namaTahun.trim() && tanggalMulai && tanggalSelesai && !isDateInvalid && !isDuplicate);

  const handleOpenAddModal = () => {
    setNamaTahun("2026/2027");
    // Tanggal sengaja dibiarkan KOSONG sesuai aturan: tidak mengisi perkiraan secara otomatis
    setTanggalMulai("");
    setTanggalSelesai("");
    setShowModal(true);
  };

  const handleTriggerConfirmSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormComplete) return;
    setShowConfirmSaveModal(true);
  };

  const handleExecuteSave = async () => {
    setLoading(true);
    setToast(null);

    const res = await createTahunAjaran({
      nama: namaTahun.trim(),
      tanggal_mulai: tanggalMulai,
      tanggal_selesai: tanggalSelesai,
    });

    setLoading(false);
    setShowConfirmSaveModal(false);

    if (res.ok) {
      setShowModal(false);
      setToast({ type: "success", message: res.message });
    } else {
      setToast({ type: "error", message: res.message });
    }
  };

  const handleExecuteAktivasi = async () => {
    if (!targetAktivasi) return;
    setLoading(true);
    setToast(null);

    const res = await setActiveTahunAjaran(targetAktivasi.id);
    setLoading(false);
    setTargetAktivasi(null);

    if (res.ok) {
      setToast({
        type: "success",
        message: `Tahun pelajaran ${targetAktivasi.nama} berhasil diaktifkan melalui RPC resmi. Profil pesantren otomatis tersinkronisasi.`,
      });
    } else {
      setToast({ type: "error", message: res.message });
    }
  };

  const handleDelete = async (id: string, nama: string) => {
    if (!confirm(`Hapus tahun pelajaran "${nama}" dari database?`)) return;
    setLoading(true);
    setToast(null);

    const res = await deleteTahunAjaran(id);
    setLoading(false);

    if (res.ok) {
      setToast({ type: "success", message: res.message });
    } else {
      setToast({ type: "error", message: res.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-300"
              : "bg-rose-50 text-rose-900 border-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === "success" ? (
              <CheckCircle className="h-4 w-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-500 hover:text-slate-800 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header & Status Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-800 text-white shadow-sm shrink-0">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">
                  Master Data Tahun Pelajaran
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                  Resmi SIPETA
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pondok Pesantren Modern Abu Manshur • Pengaturan kalender akademik dan tahun pelajaran aktif.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition shrink-0 min-h-[42px]"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Tahun Pelajaran</span>
          </button>
        </div>

        {/* Ringkasan Status Aktif Saat Ini */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="rounded-xl bg-emerald-50/70 p-3.5 border border-emerald-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                Tahun Pelajaran Aktif (Profil Lembaga)
              </p>
              <p className="text-base font-extrabold text-emerald-950 mt-0.5">
                {profilPesantren?.tahun_pelajaran_aktif || "2024/2025"}
              </p>
            </div>
            <span className="rounded-lg bg-emerald-200/80 px-2.5 py-1 text-[11px] font-bold text-emerald-950">
              Semester {profilPesantren?.semester_aktif || "Ganjil"}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 flex items-start gap-2.5 text-slate-600">
            <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong className="text-slate-900">Ketentuan Otoritas:</strong> Tahun pelajaran baru dapat ditambahkan oleh Admin/Superadmin. Pengaktifan tunggal dilakukan melalui RPC resmi untuk menjamin konsistensi di seluruh portal.
            </div>
          </div>
        </div>
      </div>

      {/* Daftar Tabel Master Tahun Pelajaran */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900">
            Daftar Tahun Pelajaran Terdaftar ({tahunAjaranList.length})
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Tersimpan Permanen di Supabase Cloud
          </span>
        </div>

        {tahunAjaranList.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 space-y-3">
            <Calendar className="mx-auto h-10 w-10 text-slate-400" />
            <div>
              <p className="text-sm font-bold text-slate-800">
                Belum Ada Master Tahun Pelajaran di Database
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Tabel master tahun ajaran di database Cloud saat ini masih kosong. Silakan tambahkan tahun pelajaran resmi (misalnya: <strong>2026/2027</strong>) untuk memulai operasional pondok.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Input Data Tahun Pelajaran 2026/2027</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Tahun Pelajaran</th>
                  <th className="py-3 px-3">Tanggal Mulai</th>
                  <th className="py-3 px-3">Tanggal Selesai</th>
                  <th className="py-3 px-3">Status Operasional</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tahunAjaranList.map((ta) => (
                  <tr key={ta.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm">
                          {ta.nama}
                        </span>
                        {ta.is_active && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-900 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Aktif
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 font-medium">
                      {formatTanggal(ta.tanggal_mulai)}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700 font-medium">
                      {formatTanggal(ta.tanggal_selesai)}
                    </td>
                    <td className="py-3.5 px-3">
                      {ta.is_active ? (
                        <span className="text-emerald-800 font-bold text-xs">
                          ● Sedang Berjalan
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium text-xs">
                          ○ Tidak Aktif
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!ta.is_active && (
                          <button
                            type="button"
                            onClick={() => setTargetAktivasi(ta)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition min-h-[36px]"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                            <span>Jadikan Aktif</span>
                          </button>
                        )}

                        {!ta.is_active && currentUser?.role === "superadmin" && (
                          <button
                            type="button"
                            onClick={() => handleDelete(ta.id, ta.nama)}
                            className="p-1.5 text-slate-400 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition"
                            title="Hapus Tahun Pelajaran (Hanya Superadmin, khusus master kosong tanpa relasi)"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: FORMULIR INPUT MANUAL MASTER TAHUN PELAJARAN               */}
      {/* =================================================================== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-xs">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Input Master Tahun Pelajaran
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Wajib diisi berdasarkan kalender resmi pesantren
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleTriggerConfirmSave} className="space-y-4">
              {/* Field Nama Tahun Pelajaran */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Nama Tahun Pelajaran *
                </label>
                <input
                  type="text"
                  required
                  value={namaTahun}
                  onChange={(e) => setNamaTahun(e.target.value)}
                  placeholder="contoh: 2026/2027"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                />
                <p className="text-[10px] text-slate-500">
                  Format resmi penamaan tahun pelajaran: <code>YYYY/YYYY</code>.
                </p>
                {isDuplicate && (
                  <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Tahun pelajaran &quot;{namaTahun}&quot; sudah terdaftar di database.
                  </p>
                )}
              </div>

              {/* Field Tanggal Mulai */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Tanggal Mulai (Kalender Resmi Pesantren) *
                </label>
                <input
                  type="date"
                  required
                  value={tanggalMulai}
                  onChange={(e) => setTanggalMulai(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                />
                <p className="text-[10px] text-slate-500">
                  Wajib dipilih manual sesuai dokumen kalender resmi Pondok Pesantren Modern Abu Manshur.
                </p>
              </div>

              {/* Field Tanggal Selesai */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Tanggal Selesai (Kalender Resmi Pesantren) *
                </label>
                <input
                  type="date"
                  required
                  value={tanggalSelesai}
                  onChange={(e) => setTanggalSelesai(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                />
                <p className="text-[10px] text-slate-500">
                  Wajib lebih besar daripada tanggal mulai tahun pelajaran.
                </p>
              </div>

              {/* Validation Warning */}
              {isDateInvalid && (
                <div className="rounded-xl bg-rose-50 p-3 border border-rose-200 text-xs font-semibold text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    Validasi Gagal: Tanggal selesai harus lebih besar daripada tanggal mulai.
                  </span>
                </div>
              )}

              {/* Catatan Kebijakan */}
              <div className="rounded-xl bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <Clock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Semester Awal:</strong> Tahun pelajaran ini akan menggunakan semester <strong>Ganjil</strong> sebagai semester aktif awal sesuai konfigurasi profil pesantren. Status awal adalah <em>Non-Aktif</em> hingga diaktifkan secara resmi.
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition min-h-[42px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!isFormComplete || loading}
                  className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition min-h-[42px]"
                >
                  Lanjutkan Konfirmasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: KONFIRMASI SIMPAN KE DATABASE                              */}
      {/* =================================================================== */}
      {showConfirmSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Konfirmasi Simpan Data Master
                </h3>
                <p className="text-[11px] text-slate-500">
                  Periksa kembali kesesuaian data kalender resmi
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Nama Tahun Pelajaran:</span>
                <strong className="text-slate-900">{namaTahun}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Tanggal Mulai:</span>
                <strong className="text-slate-900">{formatTanggal(tanggalMulai)}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Tanggal Selesai:</span>
                <strong className="text-slate-900">{formatTanggal(tanggalSelesai)}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Semester Awal:</span>
                <strong className="text-emerald-800">Ganjil (diatur via Profil)</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Status Awal:</span>
                <span className="text-slate-700 font-bold">Non-Aktif (Siap Diaktifkan)</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menyimpan master data tahun pelajaran ini ke Supabase Cloud? Data ini akan menjadi acuan resmi kegiatan kepesantrenan.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSaveModal(false)}
                disabled={loading}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition min-h-[42px]"
              >
                Kembali Edit
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                disabled={loading}
                className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition min-h-[42px]"
              >
                {loading ? "Menyimpan..." : "Ya, Simpan ke Database"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: KONFIRMASI AKTIVASI VIA RPC                                */}
      {/* =================================================================== */}
      {targetAktivasi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Konfirmasi Pengaktifan Tahun Pelajaran
                </h3>
                <p className="text-[11px] text-slate-500">
                  Aktivasi aman via RPC rpc_set_active_tahun_ajaran
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50/70 p-4 border border-emerald-200 text-xs space-y-1.5 text-emerald-950">
              <p>
                Tahun Pelajaran yang akan diaktifkan:
              </p>
              <p className="text-lg font-extrabold text-emerald-950">
                Tahun Pelajaran {targetAktivasi.nama}
              </p>
              <p className="text-[11px] text-emerald-800">
                Periode: {formatTanggal(targetAktivasi.tanggal_mulai)} s.d. {formatTanggal(targetAktivasi.tanggal_selesai)}
              </p>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-1.5">
              <p>
                Pengaktifan tahun pelajaran ini akan:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-slate-800 font-medium">
                <li>Menonaktifkan tahun pelajaran lain secara atomik.</li>
                <li>Menetapkan status <code>is_active = true</code> tunggal.</li>
                <li>Otomatis menyinkronkan <code>profil_pesantren.tahun_pelajaran_aktif</code> ke <strong>{targetAktivasi.nama}</strong>.</li>
                <li>Mencatat entri resmi di <code>public.audit_logs</code>.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTargetAktivasi(null)}
                disabled={loading}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition min-h-[42px]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteAktivasi}
                disabled={loading}
                className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 disabled:opacity-50 transition min-h-[42px]"
              >
                {loading ? "Mengaktifkan..." : "Ya, Aktifkan Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

