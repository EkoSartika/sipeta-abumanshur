"use client";

import React, { useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Lock, LogOut, ShieldAlert } from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { validatePasswordStrength } from "@/lib/utils/auth-mapping";
import { Button } from "./button";

export function MustChangePasswordModal() {
  const { currentUser, changePassword, logout } = useSipeta();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Jika bukan role wali atau tidak memiliki kewajiban ganti password, jangan render
  if (!currentUser || currentUser.role !== "wali" || !currentUser.must_change_password) {
    return null;
  }

  const nisOrUsername = currentUser.username || "";

  // Real-time checks
  const isDifferentFromNis =
    newPassword.length > 0 && newPassword.trim() !== nisOrUsername.trim();
  const pwdValidation = validatePasswordStrength(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isDifferentFromNis) {
      setErrorMsg("Kata sandi baru tidak boleh sama dengan NIS Anda.");
      return;
    }

    if (!pwdValidation.valid) {
      setErrorMsg(
        pwdValidation.message ||
          "Kata sandi minimal 8 karakter dan mengandung kombinasi huruf serta angka."
      );
      return;
    }

    if (!isMatch) {
      setErrorMsg("Konfirmasi kata sandi tidak cocok dengan kata sandi baru.");
      return;
    }

    setLoading(true);
    try {
      const res = await changePassword(newPassword);
      if (!res.ok) {
        setErrorMsg(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memperbarui kata sandi.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-emerald-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Banner Header Keamanan */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-emerald-950 p-6 text-white relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur border border-white/20 text-emerald-300 shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Aktivasi Akun Resmi Wali
              </span>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                Wajib Ganti Kata Sandi Pertama Kali
              </h2>
            </div>
          </div>
          <p className="text-xs text-emerald-100/90 leading-relaxed mt-2">
            Selamat datang di SIPETA, <strong>{currentUser.nama_lengkap}</strong>. Anda saat ini
            menggunakan kata sandi awal yang sama dengan NIS (<code>{nisOrUsername}</code>). Demi
            menjaga privasi data santri dan transaksi keuangan pesantren, Anda wajib membuat kata
            sandi baru sebelum mengakses portal.
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-7 space-y-5">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label
                htmlFor="new-password-input"
                className="block font-bold text-slate-800 mb-1"
              >
                Kata Sandi Baru
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="new-password-input"
                  type="password"
                  required
                  placeholder="Masukkan kata sandi baru"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="confirm-password-input"
                className="block font-bold text-slate-800 mb-1"
              >
                Ulangi Kata Sandi Baru
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  id="confirm-password-input"
                  type="password"
                  required
                  placeholder="Ketik ulang kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 focus:outline-none min-h-[44px]"
                />
              </div>
            </div>

            {/* Syarat Kata Sandi */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-[11px]">
              <p className="font-bold text-slate-700">Persyaratan Kata Sandi:</p>
              <div className="space-y-1">
                <div
                  className={`flex items-center gap-1.5 ${
                    isDifferentFromNis ? "text-emerald-700 font-bold" : "text-slate-500"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Tidak boleh sama dengan NIS ({nisOrUsername})</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    pwdValidation.valid ? "text-emerald-700 font-bold" : "text-slate-500"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Minimal 8 karakter alfanumerik (huruf dan angka)</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    isMatch ? "text-emerald-700 font-bold" : "text-slate-500"
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Konfirmasi kata sandi cocok</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                disabled={!isDifferentFromNis || !pwdValidation.valid || !isMatch}
                className="w-full sm:flex-1"
              >
                Simpan Kata Sandi &amp; Masuk Portal
              </Button>
              <button
                type="button"
                onClick={logout}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition min-h-[42px]"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-600" />
                <span>Keluar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

