"use client";

import React, { useState } from "react";
import {
  FileText,
  Info,
  Landmark,
  Lock,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatWaktuLengkap, getRoleLabel } from "@/lib/utils/format";
import type { UserRole } from "@/types/database";

type SuperadminTab = "users" | "rekening" | "audit_log";

export function SuperadminPortal() {
  const {
    users,
    santriList,
    rekeningResmi,
    auditLogs,
    createUserAccount,
    toggleUserActive,
    updateRekeningResmi,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<SuperadminTab>("users");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // State buat akun baru
  const [namaUser, setNamaUser] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [teleponUser, setTeleponUser] = useState("");
  const [roleUser, setRoleUser] = useState<UserRole>("admin");
  const [santriIdWali, setSantriIdWali] = useState(santriList[0]?.id ?? "snt-001");

  // State rekening resmi
  const [namaBank, setNamaBank] = useState(rekeningResmi.nama_bank);
  const [kodeBank, setKodeBank] = useState(rekeningResmi.kode_bank);
  const [nomorRekening, setNomorRekening] = useState(rekeningResmi.nomor_rekening);
  const [atasNama, setAtasNama] = useState(rekeningResmi.atas_nama);
  const [catatanInstruksi, setCatatanInstruksi] = useState(rekeningResmi.catatan_instruksi);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-3 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-400/30">
              <ShieldCheck className="h-3.5 w-3.5" />
              Otoritas Tertinggi Konfigurasi & Pengawasan Sistem
            </div>
            <h2 className="mt-1.5 text-xl font-bold">
              Portal Superadmin — Pondok Pesantren Modern Abu Manshur
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Sesuai Bab 3.1 PRD: Superadmin mengelola akun, role, rekening resmi tunggal pesantren,
              dan audit log. Riwayat transaksi keuangan yang sudah disahkan tidak dapat dihapus/diubah
              tanpa jurnal koreksi tercatat.
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
            { id: "users", label: `Manajemen Pengguna & Role (${users.length})`, icon: Users },
            { id: "rekening", label: "Rekening Resmi Tunggal Pesantren", icon: Landmark },
            {
              id: "audit_log",
              label: `Jejak Audit / Audit Log (${auditLogs.length})`,
              icon: FileText,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as SuperadminTab);
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

      {/* TAB 1: MANAJEMEN PENGGUNA & ROLE */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">
              Daftar Seluruh Akun Pengguna & Hak Akses Role
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 uppercase text-slate-500">
                    <th className="py-2 pr-3">Nama & Email</th>
                    <th className="py-2 px-3">Role</th>
                    <th className="py-2 px-3">Relasi Santri (Khusus Wali)</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 pl-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => {
                    const s = santriList.find((x) => x.id === u.santri_id);
                    return (
                      <tr key={u.id}>
                        <td className="py-3 pr-3">
                          <div className="font-bold text-slate-900">{u.nama_lengkap}</div>
                          <div className="text-slate-500">
                            {u.email} • {u.no_telepon}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                            {getRoleLabel(u.role)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {u.role === "wali"
                            ? s
                              ? `${s.nama_lengkap} (${s.nis})`
                              : "-"
                            : "Akses Petugas Internal"}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              u.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {u.is_active ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const res = toggleUserActive(u.id);
                              setFeedback({ ok: res.ok, text: res.message });
                            }}
                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-50"
                          >
                            {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <UserPlus className="h-5 w-5 text-emerald-700" />
              <h3 className="text-base font-bold text-slate-900">Buat Akun Pengguna Baru</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const res = createUserAccount({
                  nama_lengkap: namaUser,
                  email: emailUser,
                  no_telepon: teleponUser,
                  role: roleUser,
                  santri_id: roleUser === "wali" ? santriIdWali : undefined,
                });
                setFeedback({ ok: res.ok, text: res.message });
                if (res.ok) {
                  setNamaUser("");
                  setEmailUser("");
                  setTeleponUser("");
                }
              }}
              className="mt-3 space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={namaUser}
                  onChange={(e) => setNamaUser(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Email Login</label>
                <input
                  type="email"
                  required
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Nomor Telepon</label>
                <input
                  type="text"
                  required
                  value={teleponUser}
                  onChange={(e) => setTeleponUser(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Role Pengguna</label>
                <select
                  value={roleUser}
                  onChange={(e) => setRoleUser(e.target.value as UserRole)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 font-semibold"
                >
                  <option value="admin">Admin Administrasi</option>
                  <option value="bendahara">Bendahara Pesantren</option>
                  <option value="pengelola">Pengelola Kepesantrenan</option>
                  <option value="wali">Orang Tua / Wali Santri (1:1)</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>
              {roleUser === "wali" && (
                <div>
                  <label className="font-semibold text-slate-700">
                    Hubungkan ke Santri (1 Akun = 1 Santri)
                  </label>
                  <select
                    value={santriIdWali}
                    onChange={(e) => setSantriIdWali(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                  >
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nis} — {s.nama_lengkap}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800"
              >
                Simpan Akun Pengguna
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: REKENING RESMI TUNGGAL PESANTREN */}
      {activeTab === "rekening" && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">
            Pengaturan Rekening Resmi Tunggal Pesantren (Bab 2 & Bab 3.1 PRD)
          </h3>
          <p className="text-xs text-slate-500">
            Seluruh pembayaran tagihan dan pengisian uang saku santri diarahkan ke satu rekening
            resmi ini.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const res = updateRekeningResmi({
                nama_bank: namaBank,
                kode_bank: kodeBank,
                nomor_rekening: nomorRekening,
                atas_nama: atasNama,
                catatan_instruksi: catatanInstruksi,
              });
              setFeedback({ ok: res.ok, text: res.message });
            }}
            className="mt-4 space-y-3 text-xs"
          >
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="font-semibold text-slate-700">Nama Bank</label>
                <input
                  type="text"
                  required
                  value={namaBank}
                  onChange={(e) => setNamaBank(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700">Kode Bank</label>
                <input
                  type="text"
                  required
                  value={kodeBank}
                  onChange={(e) => setKodeBank(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-700">Nomor Rekening Resmi</label>
              <input
                type="text"
                required
                value={nomorRekening}
                onChange={(e) => setNomorRekening(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm font-bold"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Atas Nama Pemilik Rekening</label>
              <input
                type="text"
                required
                value={atasNama}
                onChange={(e) => setAtasNama(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700">Instruksi Pembayaran</label>
              <textarea
                rows={3}
                required
                value={catatanInstruksi}
                onChange={(e) => setCatatanInstruksi(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800"
            >
              Simpan Rekening Resmi Pesantren
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: AUDIT LOG APPEND-ONLY (BAB 13 PRD) */}
      {activeTab === "audit_log" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Audit Log & Riwayat Aktivitas Sistem (Append-Only)
              </h3>
              <p className="text-xs text-slate-500">
                Sesuai Bab 13 PRD: Mencatat pengguna, role, aktivitas, objek, waktu, data
                sebelum/sesudah perubahan, dan alasan. Tidak dapat diubah oleh pengguna biasa.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              <Lock className="h-3.5 w-3.5 text-emerald-700" />
              Immutable Log
            </span>
          </div>

          <div className="space-y-2.5">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      {log.aktivitas}
                    </span>
                    <span className="font-bold text-slate-900">{log.user_nama}</span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      {log.user_role}
                    </span>
                  </div>
                  <span className="text-slate-500">{formatWaktuLengkap(log.waktu)}</span>
                </div>
                <div className="text-slate-600">
                  Objek: <code className="font-mono font-semibold">{log.jenis_objek}</code> (ID:{" "}
                  <code className="font-mono">{log.objek_id}</code>)
                  {log.alasan_perubahan && (
                    <span>
                      {" "}
                      • <strong>Alasan:</strong> {log.alasan_perubahan}
                    </span>
                  )}
                </div>
                {(log.data_sebelum || log.data_sesudah) && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                    {log.data_sebelum && (
                      <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] text-slate-600 border border-slate-200">
                        Sebelum: {JSON.stringify(log.data_sebelum)}
                      </pre>
                    )}
                    {log.data_sesudah && (
                      <pre className="overflow-x-auto rounded bg-white p-2 text-[11px] text-emerald-900 border border-emerald-200">
                        Sesudah: {JSON.stringify(log.data_sesudah)}
                      </pre>
                    )}
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

