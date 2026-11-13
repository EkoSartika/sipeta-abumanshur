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

  // Jika sudah login dengan role yang sesuai, arahkan langsung ke root workspace
  useEffect(() => {
    if (!authLoading && isAuthenticated && currentUser) {
      const isSameRole =
        currentUser.role === expectedRole ||
        ((expectedRole === "asatidz" || expectedRole === "pengelola") &&
          (currentUser.role === "asatidz" || currentUser.role === "pengelola"));
      if (isSameRole) {
        router.push("/");
      }
    }
  }, [authLoading, isAuthenticated, currentUser, expectedRole, router]);

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
    <div className="min-h-screen flex flex-col bg-[#F7F8F6] text-[#1F2937]">
      {/* Header Bersih & Modern Minimalis */}
      <header className="border-b border-[#E5E7EB] bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-white p-0.5 shadow-xs border border-[#1D6B59]/20 group-hover:border-[#1D6B59]/50 transition-colors">
              <img
                src="/images/logo-abu-manshur.png"
                alt="Logo Abu Manshur"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-[#123C35]">
                  SIPETA
                </span>
                <span className="rounded bg-[#E8F2EC] px-1.5 py-0.5 text-[10px] font-semibold text-[#123C35] border border-[#1D6B59]/20">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#6B7280]">
                Pondok Pesantren Modern Abu Manshur • Cirebon
              </p>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-[#123C35] hover:text-[#1D6B59] transition-colors flex items-center gap-1.5 py-1.5 px-3 rounded-lg hover:bg-[#E8F2EC]/60"
          >
            <span>Halaman Utama</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Konten Utama Form Login */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 sm:p-8 shadow-card">
            {/* Header Portal Role */}
            <div className="text-center pb-5 border-b border-[#E5E7EB]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#123C35] text-white shadow-soft border border-[#1D6B59]/30 mb-3.5">
                <Lock className="h-6 w-6 text-emerald-200" />
              </div>
              {roleBadge && (
                <span className="inline-block rounded-full bg-[#E8F2EC] px-3 py-1 text-[11px] font-bold text-[#123C35] border border-[#1D6B59]/20">
                  {roleBadge}
                </span>
              )}
              <h2 className="mt-2.5 text-xl font-bold text-[#1F2937] tracking-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-xs text-[#6B7280] leading-relaxed max-w-xs mx-auto">
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
                  <p className="mt-0.5 text-rose-700">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Form Input */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="input-identifier"
                  className="block text-xs font-semibold text-[#1F2937] mb-1.5"
                >
                  {identifierLabel} <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  {isNis ? (
                    <Users className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
                  ) : expectedRole === "superadmin" ? (
                    <Mail className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
                  ) : (
                    <User className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
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
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-3 py-2.5 text-xs font-medium text-[#1F2937] placeholder:text-[#6B7280]/60 hover:border-slate-300 focus:border-[#1D6B59] focus:ring-2 focus:ring-[#1D6B59]/15 focus:outline-none min-h-[42px] transition-all"
                  />
                </div>
                {identifierHelp && (
                  <p className="mt-1 text-[11px] text-[#6B7280] leading-normal">
                    {identifierHelp}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="input-password"
                  className="block text-xs font-semibold text-[#1F2937] mb-1.5"
                >
                  Kata Sandi <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-[#6B7280]" />
                  <input
                    id="input-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white pl-10 pr-10 py-2.5 text-xs font-medium text-[#1F2937] placeholder:text-[#6B7280]/60 hover:border-slate-300 focus:border-[#1D6B59] focus:ring-2 focus:ring-[#1D6B59]/15 focus:outline-none min-h-[42px] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-[#6B7280] hover:text-[#1F2937] transition-colors"
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[#6B7280]">
                  Gunakan kata sandi resmi yang telah diberikan oleh pihak pesantren.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#123C35] px-4 py-2.5 text-xs font-bold text-white shadow-soft hover:bg-[#1D6B59] active:bg-[#0E2E28] focus:outline-none focus:ring-2 focus:ring-[#1D6B59]/30 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Memverifikasi Akun...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      <span>Masuk ke Portal</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Footer Card Informasi Keamanan */}
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F7F8F6]/80 p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#123C35]">
              <ShieldCheck className="h-4 w-4 text-[#1D6B59]" />
              <span>Sistem Informasi Pelayanan Terpadu Terverifikasi</span>
            </div>
            <p className="mt-1 text-[11px] text-[#6B7280]">
              {profilPesantren?.nama_resmi || "Pondok Pesantren Modern Abu Manshur"} • Seluruh hak cipta dilindungi.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
