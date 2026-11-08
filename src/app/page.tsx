"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal, getRoleLabel } from "@/lib/utils/format";
import type { UserRole } from "@/types/database";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { BendaharaPortal } from "@/modules/bendahara/bendahara-portal";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { PengelolaPortal } from "@/modules/pengelola/pengelola-portal";
import { SuperadminPortal } from "@/modules/superadmin/superadmin-portal";
import { LaporanPortal } from "@/modules/laporan/laporan-portal";

export default function SipetaHomePage() {
  const {
    currentUser,
    isAuthenticated,
    authMode,
    authLoading,
    users,
    switchActiveUser,
    resetDemoData,
    connectionStatus,
    isLiveSupabase,
    dataSource,
    healthStatus,
    refreshFromSupabase,
    loginWithSupabase,
    logout,
    enterDemoMode,
    pengumumanList,
  } = useSipeta();

  const [viewMode, setViewMode] = useState<"portal" | "laporan">("portal");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<UserRole>("wali");

  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await loginWithSupabase(loginEmail.trim(), loginPassword);
      if (res.ok) {
        setLoginEmail("");
        setLoginPassword("");
      } else {
        setLoginError(res.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
      setLoginError(message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      setViewMode("portal");
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshFromSupabase();
    } finally {
      setIsRefreshing(false);
    }
  };

  // ==========================================================================
  // 1. SPLASH SCREEN SAAT MEMERIKSA STATUS AUTENTIKASI
  // ==========================================================================
  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-md border border-emerald-100">
            <img
              src="/images/logo-abu-manshur.png"
              alt="Logo Pondok Pesantren Modern Abu Manshur"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-emerald-950">
              SIPETA
            </h1>
            <p className="text-xs font-semibold text-slate-600 mt-1">
              Pondok Pesantren Modern Abu Manshur • Plered - Cirebon
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-800 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 mt-2">
            <RefreshCw className="h-4 w-4 animate-spin text-emerald-700" />
            <span>Memeriksa status autentikasi...</span>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // 2. PUBLIC PORTAL & LOGIN GATE (KETIKA BELUM LOGIN)
  // ==========================================================================
  if (!isAuthenticated || !currentUser) {
    const publishedAnnouncements = pengumumanList.filter((p) => p.is_published);

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Header Publik */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm border border-emerald-100 shrink-0">
                <img
                  src="/images/logo-abu-manshur.png"
                  alt="Logo Pondok Pesantren Modern Abu Manshur"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold tracking-tight text-emerald-950">
                    SIPETA
                  </h1>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                    v1.0
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-600">
                  Sistem Informasi Pelayanan Terpadu • PP Modern Abu Manshur
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                  isLiveSupabase
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-amber-50 text-amber-800 border-amber-300"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isLiveSupabase ? "bg-emerald-600 animate-pulse" : "bg-amber-500"
                  }`}
                />
                {isLiveSupabase ? "Supabase Cloud Aktif" : "Mode Simulasi Demo"}
              </span>
            </div>
          </div>
        </header>

        {/* Hero & Konten Utama Publik */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Kolom Kiri: Informasi Pesantren & Pengumuman */}
            <div className="lg:col-span-7 space-y-6">
              {/* Welcome Card */}
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 sm:p-8 text-white shadow-lg">
                <div className="flex items-center gap-3 mb-3">
                  <span className="rounded-full bg-emerald-800/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-200 border border-emerald-700">
                    Gerbang Pelayanan Resmi
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                  Selamat Datang di Portal Terpadu SIPETA
                </h2>
                <p className="mt-3 text-sm text-emerald-100/90 leading-relaxed">
                  Layanan terintegrasi bagi Orang Tua/Wali Santri, Asatidz, Bendahara, Pengelola Kepesantrenan, dan Pimpinan Pondok Pesantren Modern Abu Manshur Cirebon.
                </p>
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur border border-white/10">
                    <Wallet className="h-5 w-5 text-emerald-300 mb-1" />
                    <p className="font-bold">Keuangan & SPP</p>
                    <p className="text-[11px] text-emerald-200">Cicilan & 1 Rekening BSI</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur border border-white/10">
                    <BookOpen className="h-5 w-5 text-emerald-300 mb-1" />
                    <p className="font-bold">Tahfidz & Mengaji</p>
                    <p className="text-[11px] text-emerald-200">Mutaba&apos;ah Harian</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur border border-white/10">
                    <Award className="h-5 w-5 text-emerald-300 mb-1" />
                    <p className="font-bold">Prestasi & Disiplin</p>
                    <p className="text-[11px] text-emerald-200">Catatan Pembinaan</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur border border-white/10">
                    <Calendar className="h-5 w-5 text-emerald-300 mb-1" />
                    <p className="font-bold">Uang Saku Ledger</p>
                    <p className="text-[11px] text-emerald-200">Wajib Foto Penyerahan</p>
                  </div>
                </div>
              </div>

              {/* Papan Pengumuman Resmi */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-emerald-800" />
                    <h3 className="text-base font-extrabold text-slate-900">
                      Pengumuman Resmi Pesantren
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {publishedAnnouncements.length} Informasi
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {publishedAnnouncements.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-4 text-center">
                      Belum ada pengumuman publik saat ini.
                    </p>
                  ) : (
                    publishedAnnouncements.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-4 transition ${
                          item.is_penting
                            ? "border-amber-300 bg-amber-50/60"
                            : "border-slate-200 bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              item.is_penting
                                ? "bg-amber-200 text-amber-900"
                                : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {item.kategori}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {formatTanggal(item.tanggal_publikasi)}
                          </span>
                        </div>
                        <h4 className="mt-2 text-sm font-bold text-slate-900">
                          {item.judul}
                        </h4>
                        <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {item.isi}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Kolom Kanan: Card Login Masuk ke Sistem */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-md">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 shrink-0">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">
                      Masuk ke Sistem
                    </h3>
                    <p className="text-xs text-slate-500">
                      Gunakan akun terdaftar Anda untuk mengakses ruang kerja
                    </p>
                  </div>
                </div>

                {loginError && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                    <div className="leading-relaxed">
                      <p className="font-bold">Gagal Masuk</p>
                      <p>{loginError}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSupabaseLogin} className="mt-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="input-identifier-login"
                        className="block text-xs font-bold text-slate-700"
                      >
                        Username atau Email Superadmin
                      </label>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Akun Internal
                      </span>
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        id="input-identifier-login"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        placeholder="contoh: bendahara01 atau email Superadmin"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none min-h-[44px]"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                      Petugas internal &amp; Wali masuk dengan <strong>username</strong>. Tidak menggunakan Gmail / email pribadi.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="input-password-login"
                      className="block text-xs font-bold text-slate-700 mb-1.5"
                    >
                      Kata Sandi
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        id="input-password-login"
                        type="password"
                        required
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none min-h-[44px]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full rounded-xl bg-emerald-800 py-3 px-4 text-xs font-bold text-white shadow hover:bg-emerald-900 transition flex items-center justify-center gap-2 disabled:opacity-50 min-h-[44px] touch-manipulation cursor-pointer"
                  >
                    {loginLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Memverifikasi Akun...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        <span>Masuk ke SIPETA</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-100">
                  <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
                    <p className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                      Atau Coba Mode Simulasi (Demo):
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Pilih Role Demo"
                        value={selectedDemoRole}
                        onChange={(e) => setSelectedDemoRole(e.target.value as UserRole)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
                      >
                        <option value="wali">Wali Santri (Hafidz)</option>
                        <option value="bendahara">Bendahara (Hj. Siti Aminah)</option>
                        <option value="admin">Admin (H. Ahmad Dahlan)</option>
                        <option value="pengelola">Pengelola (Ust. Abdullah)</option>
                        <option value="superadmin">Superadmin (Kyai Abu Manshur)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => enterDemoMode(selectedDemoRole)}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 transition shrink-0"
                      >
                        Buka Demo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500 justify-center">
                  <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span>Sesi terenkripsi &amp; dilindungi Row-Level Security Supabase</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer Publik */}
        <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2.5">
              <img
                src="/images/logo-abu-manshur.png"
                alt="Logo PP Modern Abu Manshur"
                className="h-6 w-6 object-contain shrink-0"
              />
              <span>
                <strong>SIPETA Pondok Pesantren Modern Abu Manshur</strong> • Plered - Cirebon
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              <span>v1.0 Produksi</span>
              <span>• Hak Cipta Dilindungi Pesantren</span>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // 3. AUTHENTICATED WORKSPACE (PENGGUNA SUDAH TERVERIFIKASI LOGIN)
  // ==========================================================================
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Inactive Account Banner (Bab 3 & 4 PRD) */}
      {!currentUser.is_active && (
        <div className="bg-rose-600 text-white px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          <span>
            AKUN DINONAKTIFKAN: Akun pengguna ({currentUser.nama_lengkap}) telah dinonaktifkan oleh
            Administrator. Seluruh hak akses dan modifikasi data dibatasi.
          </span>
        </div>
      )}

      {/* Top Bar SIPETA — Pondok Pesantren Modern Abu Manshur */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          {/* Brand Identity */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-0.5 shadow-sm border border-emerald-100 shrink-0">
                <img
                  src="/images/logo-abu-manshur.png"
                  alt="Logo Pondok Pesantren Modern Abu Manshur"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-extrabold tracking-tight text-emerald-950">
                    SIPETA
                  </h1>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                    v1.0
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                      connectionStatus === "checking"
                        ? "bg-slate-50 text-slate-700 border-slate-300"
                        : healthStatus?.connectionState === "CONNECTED_EMPTY_SCHEMA"
                        ? "bg-blue-50 text-blue-800 border-blue-300"
                        : isLiveSupabase
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        connectionStatus === "checking"
                          ? "bg-slate-400 animate-pulse"
                          : healthStatus?.connectionState === "CONNECTED_EMPTY_SCHEMA"
                          ? "bg-blue-500 animate-pulse"
                          : isLiveSupabase
                          ? "bg-emerald-600 animate-pulse"
                          : "bg-amber-500"
                      }`}
                    />
                    {connectionStatus === "checking"
                      ? "Memeriksa Koneksi Database..."
                      : healthStatus?.connectionState === "CONNECTED_EMPTY_SCHEMA"
                      ? `Koneksi Aktif (${healthStatus.latencyMs ?? 0}ms) — Skema Kosong (CONNECTED_EMPTY_SCHEMA)`
                      : isLiveSupabase
                      ? "Supabase Project Khusus Terhubung"
                      : "MODE SIMULASI — MENUNGGU PROJECT SUPABASE KHUSUS"}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-600">
                  Sistem Informasi Pelayanan Terpadu • Pondok Pesantren Modern Abu Manshur
                </p>
              </div>
            </div>
          </div>

          {/* User Identity, Role Switcher (Demo Only), & Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* User Identity Badge */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
              <UserCheck className="h-4 w-4 text-emerald-700 shrink-0" />
              <div className="text-xs leading-tight">
                <span className="font-bold text-slate-900 block truncate max-w-[140px] sm:max-w-[180px]">
                  {currentUser.nama_lengkap}
                </span>
                <span className="text-[10px] font-semibold text-emerald-800">
                  [{getRoleLabel(currentUser.role)}] • {authMode === "supabase" ? "Supabase Auth" : "Mode Demo"}
                </span>
              </div>
            </div>

            {/* Role Switcher — Khusus Mode Demo Saja */}
            {authMode === "demo" && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-1.5">
                <KeyRound className="h-3.5 w-3.5 text-amber-800 shrink-0" />
                <label
                  htmlFor="sipeta-role-switcher-demo"
                  className="text-xs font-bold text-amber-950 whitespace-nowrap hidden sm:inline"
                >
                  Ganti Demo:
                </label>
                <select
                  id="sipeta-role-switcher-demo"
                  value={currentUser.id}
                  onChange={(e) => {
                    switchActiveUser(e.target.value);
                    setViewMode("portal");
                  }}
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      [{getRoleLabel(u.role)}] {u.nama_lengkap} {!u.is_active ? "(Nonaktif)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* View Mode */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode("portal")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "portal"
                    ? "bg-white text-emerald-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Ruang Kerja ({getRoleLabel(currentUser.role)})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("laporan")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  viewMode === "laporan"
                    ? "bg-white text-emerald-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Pusat Laporan
              </button>
            </div>

            {/* Refresh Data & Keluar/Logout Actions */}
            <div className="flex items-center gap-2">
              {isLiveSupabase && (
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  title="Perbarui data terbaru dari database Supabase"
                  className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh Data</span>
                </button>
              )}

              {authMode === "demo" && (
                <button
                  type="button"
                  onClick={resetDemoData}
                  title="Reset seluruh data simulasi ke kondisi awal"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}

              {/* Tombol Keluar / Logout */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutLoading}
                title="Keluar dari sesi akun aktif"
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition"
              >
                {logoutLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-600" />
                ) : (
                  <LogOut className="h-3.5 w-3.5 text-rose-600" />
                )}
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {viewMode === "laporan" ? (
          <LaporanPortal />
        ) : (
          <>
            {currentUser.role === "wali" && <WaliPortal />}
            {currentUser.role === "bendahara" && <BendaharaPortal />}
            {currentUser.role === "admin" && <AdminPortal />}
            {currentUser.role === "pengelola" && <PengelolaPortal />}
            {currentUser.role === "superadmin" && <SuperadminPortal />}
          </>
        )}
      </main>

      {/* Footer Standar Keamanan & Akuntabilitas */}
      <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500 no-print">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/logo-abu-manshur.png"
              alt="Logo PP Modern Abu Manshur"
              className="h-6 w-6 object-contain shrink-0"
            />
            <span>
              <strong>SIPETA Pondok Pesantren Modern Abu Manshur</strong> • PostgreSQL + Supabase
              RLS + Atomic RPC Ledger
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span>• 1 Akun Wali : 1 Santri</span>
            <span>• 1 Rekening Resmi BSI</span>
            <span>• Verifikasi Tunggal Bendahara</span>
            <span>• Wajib Foto Penyerahan Uang Saku</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
