"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  KeyRound,
  Landmark,
  LayoutGrid,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { getRoleLabel } from "@/lib/utils/format";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { BendaharaPortal } from "@/modules/bendahara/bendahara-portal";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { PengelolaPortal } from "@/modules/pengelola/pengelola-portal";
import { SuperadminPortal } from "@/modules/superadmin/superadmin-portal";
import { LaporanPortal } from "@/modules/laporan/laporan-portal";

export default function SipetaHomePage() {
  const {
    currentUser,
    users,
    switchActiveUser,
    resetDemoData,
    connectionStatus,
    isLiveSupabase,
    dataSource,
    healthStatus,
    refreshFromSupabase,
    loginWithSupabase,
    logoutSupabase,
  } = useSipeta();

  const [viewMode, setViewMode] = useState<"portal" | "laporan">("portal");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await loginWithSupabase(loginEmail, loginPassword);
      if (res.ok) {
        setShowLoginModal(false);
        setLoginEmail("");
        setLoginPassword("");
      } else {
        setLoginError(res.message);
      }
    } catch (err: any) {
      setLoginError(err.message ?? "Terjadi kesalahan saat masuk.");
    } finally {
      setLoginLoading(false);
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

          {/* Role Switcher & View Toggle */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Role Switcher */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5">
              <KeyRound className="h-4 w-4 text-emerald-800 shrink-0" />
              <label
                htmlFor="sipeta-role-switcher"
                className="text-xs font-bold text-emerald-950 whitespace-nowrap"
              >
                Role Aktif:
              </label>
              <select
                id="sipeta-role-switcher"
                value={currentUser.id}
                onChange={(e) => {
                  switchActiveUser(e.target.value);
                  setViewMode("portal");
                }}
                className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    [{getRoleLabel(u.role)}] {u.nama_lengkap} {!u.is_active ? "(Nonaktif)" : ""}
                  </option>
                ))}
              </select>
            </div>

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

            {/* Supabase Actions & Auth Buttons */}
            {isLiveSupabase ? (
              <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  onClick={logoutSupabase}
                  title="Keluar dari sesi Supabase Auth"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5 text-rose-600" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Login Supabase</span>
                </button>
                <button
                  type="button"
                  onClick={resetDemoData}
                  title="Reset seluruh data simulasi ke kondisi awal"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
            )}
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

      {/* Login Supabase Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <img
                  src="/images/logo-abu-manshur.png"
                  alt="Logo PP Modern Abu Manshur"
                  className="h-9 w-9 object-contain shrink-0"
                />
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Login Supabase Auth
                  </h3>
                  <p className="text-[11px] text-slate-500">Pondok Pesantren Modern Abu Manshur</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loginError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleSupabaseLogin} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Akun SIPETA
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@pesantren-abumanshur.id"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500 space-y-1 border border-slate-100">
                <p className="font-semibold text-slate-700">Akun Pengujian Database:</p>
                <p>• Superadmin: sipetaabumanshur@gmail.com</p>
                <p>• Bendahara: bendahara@abumanshur.id</p>
                <p>• Wali: wali.hafidz@abumanshur.id</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  {loginLoading ? "Memverifikasi..." : "Masuk ke Sistem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
