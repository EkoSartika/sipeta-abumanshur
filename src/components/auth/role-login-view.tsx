"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import type { UserRole } from "@/types/database";

interface RoleLoginViewProps {
  expectedRole: UserRole;
  title: string;
  subtitle?: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  identifierHelp?: string;
  roleBadge?: string;
  isNis?: boolean;
}

export function RoleLoginView({
  expectedRole,
  title,
  subtitle,
  identifierLabel,
  identifierPlaceholder,
  identifierHelp,
  roleBadge,
  isNis = false,
}: RoleLoginViewProps) {
  const router = useRouter();
  const { loginWithSupabase, isAuthenticated, currentUser, authLoading, profilPesantren } = useSipeta();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Jika sudah login, langsung arahkan ke root workspace
  useEffect(() => {
    if (!authLoading && isAuthenticated && currentUser) {
      router.push("/");
    }
  }, [authLoading, isAuthenticated, currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await loginWithSupabase(identifier.trim(), password, expectedRole);
      if (res.ok) {
        router.push("/");
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menghubungi server autentikasi.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header Bersih & Profesional */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-0.5 shadow-xs border border-emerald-100 group-hover:border-emerald-300 transition">
              <img
                src="/images/logo-abu-manshur.png"
                alt="Logo Abu Manshur"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-emerald-950">
                  SIPETA
                </span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                Pondok Pesantren Modern Abu Manshur • Cirebon
              </p>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 transition flex items-center gap-1"
          >
            <span>Halaman Utama</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Konten Utama Form Login */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-md">
            {/* Header Portal Role */}
            <div className="text-center pb-5 border-b border-slate-100">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-950 text-white shadow-md border-2 border-emerald-100 mb-3">
                <Lock className="h-6 w-6" />
              </div>
              {roleBadge && (
                <span className="inline-block rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                  {roleBadge}
                </span>
              )}
              <h2 className="mt-2 text-xl font-extrabold text-slate-900 tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="leading-relaxed">
                  <p className="font-bold">Akses Tidak Diizinkan</p>
                  <p className="mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Form Input */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="input-identifier"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  {identifierLabel} <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  {isNis ? (
                    <Users className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  ) : expectedRole === "superadmin" ? (
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  ) : (
                    <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  )}
                  <input
                    id="input-identifier"
                    type="text"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={identifierPlaceholder}
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                </div>
                {identifierHelp && (
                  <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                    {identifierHelp}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="input-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Kata Sandi <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="input-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 pl-9 pr-10 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-800 py-3 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-900 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Memverifikasi Akun...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" />
                    <span>Masuk ke {roleBadge || title}</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>Sesi terenkripsi &amp; terlindungi hak akses role resmi</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Bersih & Dinamis Berdasarkan Profil Pesantren */}
      <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500 text-center">
        <div className="mx-auto max-w-7xl px-4">
          <p className="font-semibold text-slate-700">
            SIPETA — {profilPesantren?.nama_resmi || "Pondok Pesantren Modern Abu Manshur"}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {profilPesantren?.alamat || "Jl. Nyi Ageng Serang, Sindangmekar, Dukupuntang / Plered, Cirebon, Jawa Barat"} • Tahun Pelajaran {profilPesantren?.tahun_pelajaran_aktif || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})
          </p>
        </div>
      </footer>
    </div>
  );
}

