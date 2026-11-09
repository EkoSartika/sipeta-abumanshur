"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Info,
  KeyRound,
  Lock,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal, getRoleLabel } from "@/lib/utils/format";
import { validatePasswordStrength } from "@/lib/utils/auth-mapping";

export function UserProfileView() {
  const { currentUser, santriList, kelasList, kamarList, updateMyProfile } = useSipeta();

  // State Ubah Data Pribadi
  const [namaLengkap, setNamaLengkap] = useState(currentUser?.nama_lengkap ?? "");
  const [noTelepon, setNoTelepon] = useState(
    currentUser?.no_telepon && currentUser.no_telepon !== "-" ? currentUser.no_telepon : ""
  );
  const [profileSaving, setProfileSaving] = useState(false);

  // State Ubah Kata Sandi
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Feedback Notification
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  if (!currentUser) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Silakan login terlebih dahulu untuk mengakses profil Anda.
      </div>
    );
  }

  // Khusus Wali: Cari santri terkait
  const linkedSantri = currentUser.santri_id
    ? santriList.find((s) => s.id === currentUser.santri_id)
    : null;
  const linkedKelas = linkedSantri
    ? kelasList.find((k) => k.id === linkedSantri.kelas_id)
    : null;
  const linkedKamar = linkedSantri
    ? kamarList.find((km) => km.id === linkedSantri.kamar_id)
    : null;

  // 1. Simpan Perubahan Data Diri (Nama & Telepon)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanNama = namaLengkap.trim();
    if (cleanNama.length < 2) {
      setFeedback({ ok: false, message: "Nama lengkap minimal 2 karakter." });
      return;
    }

    setProfileSaving(true);
    try {
      const res = await updateMyProfile({
        nama_lengkap: cleanNama,
        no_telepon: noTelepon.trim() || "-",
      });
      setFeedback({ ok: res.ok, message: res.message });
    } finally {
      setProfileSaving(false);
    }
  };

  // 2. Simpan Perubahan Kata Sandi
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!oldPassword) {
      setFeedback({ ok: false, message: "Kata sandi lama wajib diisi." });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ ok: false, message: "Konfirmasi kata sandi baru tidak cocok." });
      return;
    }

    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      setFeedback({
        ok: false,
        message: pwdCheck.message || "Kata sandi baru tidak memenuhi syarat keamanan (minimal 8 karakter).",
      });
      return;
    }

    if (
      currentUser.username &&
      newPassword.trim().toLowerCase() === currentUser.username.trim().toLowerCase()
    ) {
      setFeedback({
        ok: false,
        message: "Kata sandi baru tidak boleh sama dengan username/NIS Anda.",
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await updateMyProfile({
        nama_lengkap: currentUser.nama_lengkap,
        no_telepon: currentUser.no_telepon,
        old_password: oldPassword,
        new_password: newPassword,
      });

      setFeedback({ ok: res.ok, message: res.message });
      if (res.ok) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start justify-between rounded-2xl border p-4 text-xs font-semibold shadow-sm transition ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.ok ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-700 mt-0.5" />
            )}
            <div>
              <p className="font-extrabold">{feedback.ok ? "Berhasil" : "Gagal Memperbarui"}</p>
              <p className="mt-0.5 font-medium leading-relaxed">{feedback.message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded-lg p-1 text-slate-500 hover:bg-black/5 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Profile Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Kolom Kiri: Kartu Identitas Akun (Read-Only) */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center text-center pb-5 border-b border-slate-100">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 text-white font-extrabold text-2xl shadow-md border-2 border-emerald-100">
                {(currentUser.nama_lengkap || currentUser.username || "U").charAt(0).toUpperCase()}
              </div>
              <h3 className="mt-3.5 text-base font-extrabold text-slate-900 leading-tight">
                {currentUser.nama_lengkap}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
                <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                  {getRoleLabel(currentUser.role)}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    currentUser.is_active
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {currentUser.is_active ? "Akun Aktif" : "Akun Nonaktif"}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Username Akun
                </span>
                <p className="mt-0.5 font-bold text-slate-800 font-mono bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                  @{currentUser.username || currentUser.email?.split("@")[0]}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Username resmi diatur oleh sistem &amp; Superadmin.
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Role Sistem
                </span>
                <p className="mt-0.5 font-bold text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                  {getRoleLabel(currentUser.role)}
                </p>
              </div>

              {currentUser.email && currentUser.role === "superadmin" && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Email Resmi
                  </span>
                  <p className="mt-0.5 font-bold text-slate-800 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    {currentUser.email}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Tanggal Terdaftar
                </span>
                <p className="mt-0.5 font-medium text-slate-700">
                  {currentUser.created_at ? formatTanggal(currentUser.created_at) : "Sistem SIPETA"}
                </p>
              </div>
            </div>
          </div>

          {/* Khusus Wali: Kartu Santri Terkait */}
          {currentUser.role === "wali" && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-emerald-200/60">
                <GraduationCap className="h-4 w-4 text-emerald-800" />
                <h4 className="text-xs font-bold text-emerald-950">
                  Data Santri Terhubung (Relasi 1:1)
                </h4>
              </div>
              {linkedSantri ? (
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] text-emerald-800 font-medium">Nama Santri:</span>
                    <p className="font-bold text-emerald-950 text-sm">{linkedSantri.nama_lengkap}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-emerald-800 font-medium">NIS:</span>
                      <p className="font-bold text-emerald-900 font-mono">{linkedSantri.nis}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-800 font-medium">Jenis Kelamin:</span>
                      <p className="font-bold text-emerald-900">
                        {linkedSantri.jenis_kelamin === "L" ? "Laki-laki" : "Perempuan"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-800 font-medium">Kelas:</span>
                      <p className="font-bold text-emerald-900">
                        {linkedKelas ? linkedKelas.nama_kelas : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-800 font-medium">Kamar / Asrama:</span>
                      <p className="font-bold text-emerald-900">
                        {linkedKamar ? linkedKamar.nama_kamar : "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-emerald-800 italic">
                  Belum ada santri yang ditautkan ke akun ini.
                </p>
              )}
            </div>
          )}

          {/* Card Aturan Keamanan */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <h4 className="text-xs font-bold text-slate-900">Perlindungan Akun</h4>
            </div>
            <ul className="mt-3 space-y-2 text-[11px] text-slate-600 list-disc pl-4 leading-relaxed">
              <li>Role dan hak akses akun dikelola penuh oleh Superadmin / Bagian Administrasi.</li>
              <li>Akun internal tidak dapat mengubah username sendiri guna menjaga integritas data.</li>
              <li>Perubahan kata sandi memerlukan verifikasi kata sandi lama Anda.</li>
            </ul>
          </div>
        </div>

        {/* Kolom Kanan: Form Ubah Profil & Ubah Password */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Ubah Data Pribadi */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Informasi Data Pribadi
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Perbarui nama lengkap dan nomor telepon/WhatsApp Anda
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="profile-input-nama"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Nama Lengkap <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="profile-input-nama"
                    type="text"
                    required
                    value={namaLengkap}
                    onChange={(e) => setNamaLengkap(e.target.value)}
                    placeholder="Nama lengkap Anda"
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="profile-input-telepon"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Nomor Telepon / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="profile-input-telepon"
                    type="tel"
                    value={noTelepon}
                    onChange={(e) => setNoTelepon(e.target.value)}
                    placeholder="contoh: 081234567890"
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Digunakan untuk pemberitahuan tagihan, uang saku, dan informasi pesantren.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition disabled:opacity-50 min-h-[42px]"
                >
                  {profileSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Simpan Perubahan Profil</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Ubah Kata Sandi */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Ubah Kata Sandi Akun
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pastikan kata sandi baru kuat dan minimal 8 karakter
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="profile-input-old-password"
                  className="block text-xs font-bold text-slate-700 mb-1"
                >
                  Kata Sandi Lama <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="profile-input-old-password"
                    type={showOldPassword ? "text" : "password"}
                    required
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Masukkan kata sandi lama Anda"
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-10 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-input-new-password"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Kata Sandi Baru <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      id="profile-input-new-password"
                      type={showNewPassword ? "text" : "password"}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 8 karakter"
                      className="w-full rounded-xl border border-slate-300 pl-9 pr-10 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="profile-input-confirm-password"
                    className="block text-xs font-bold text-slate-700 mb-1"
                  >
                    Konfirmasi Kata Sandi Baru <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      id="profile-input-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi kata sandi baru"
                      className="w-full rounded-xl border border-slate-300 pl-9 pr-10 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[42px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-emerald-700" />
                  Ketentuan Keamanan Kata Sandi:
                </p>
                <p>• Minimal 8 karakter, mengandung perpaduan huruf dan angka.</p>
                <p>• Tidak boleh sama persis dengan username atau NIS akun Anda.</p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition disabled:opacity-50 min-h-[42px]"
                >
                  {passwordSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Memperbarui Sandi...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      <span>Perbarui Kata Sandi</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

