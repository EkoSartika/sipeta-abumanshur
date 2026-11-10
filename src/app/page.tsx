"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  KeyRound,
  Landmark,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatTanggal, getRoleLabel } from "@/lib/utils/format";
import type { UserRole } from "@/types/database";
import { WaliPortal } from "@/modules/wali/wali-portal";
import { BendaharaPortal } from "@/modules/bendahara/bendahara-portal";
import { AdminPortal } from "@/modules/admin/admin-portal";
import { TuPortal } from "@/modules/tu/tu-portal";
import { PengelolaPortal } from "@/modules/pengelola/pengelola-portal";
import { SuperadminPortal, type SuperadminTab } from "@/modules/superadmin/superadmin-portal";
import { LaporanPortal } from "@/modules/laporan/laporan-portal";
import { UserProfileView } from "@/components/profile/user-profile-view";
import { MustChangePasswordModal } from "@/components/ui/must-change-password-modal";

interface NavMenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
}

export default function SipetaHomePage() {
  const {
    currentUser,
    isAuthenticated,
    authMode,
    authLoading,
    users,
    auditLogs,
    switchActiveUser,
    resetDemoData,
    isLiveSupabase,
    refreshFromSupabase,
    loginWithSupabase,
    logout,
    enterDemoMode,
    jenisPembayaranList,
    pengumumanList,
    tagihanList,
    transaksiPembayaranList,
    mutasiUangSakuList,
    santriList,
    profilPesantren,
    tahunAjaranAktif,
  } = useSipeta();

  // Navigation State
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Public Login State
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Action State
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [selectedDemoRole, setSelectedDemoRole] = useState<UserRole>("wali");

  // Simulasi hanya boleh muncul jika di development DAN bukan Live Supabase
  const isDemoAllowed = process.env.NODE_ENV !== "production" && !isLiveSupabase;

  const handlePublicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await loginWithSupabase(loginIdentifier.trim(), loginPassword);
      if (res.ok) {
        setLoginIdentifier("");
        setLoginPassword("");
        setActiveTab("dashboard");
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
      setActiveTab("dashboard");
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
  // DAFTAR MENU SIDEBAR BERDASARKAN ROLE
  // Sesuai Bagian A Petunjuk Redesain Navigasi SIPETA
  // ==========================================================================
  const getRoleMenuItems = (role: UserRole): NavMenuItem[] => {
    switch (role) {
      case "superadmin":
        return [
          { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
          { id: "users", label: "Manajemen Akun Staf", icon: Users, badge: users.length },
          { id: "rekening", label: "Rekening Resmi Pesantren", icon: Landmark },
          { id: "audit_log", label: "Jejak Audit / Audit Log", icon: FileText, badge: auditLogs.length },
          { id: "laporan", label: "Pusat Laporan & Analitik", icon: BarChart3 },
          { id: "profile", label: "Profil Saya", icon: UserCheck },
        ];

      case "admin":
        const pendingAdminFeeCount = jenisPembayaranList.filter((j) => j.status_persetujuan === "MENUNGGU_PERSETUJUAN").length;
        return [
          { id: "dashboard", label: "Dashboard Pengawasan", icon: LayoutGrid },
          { id: "santri_asrama", label: "Pengawasan Santri & Asrama", icon: Users, badge: santriList.length },
          { id: "keuangan", label: "Pengawasan & Persetujuan Keuangan", icon: Wallet, badge: pendingAdminFeeCount || undefined },
          { id: "laporan_tahfidz", label: "Laporan Tahfidz", icon: Sparkles },
          { id: "laporan_kedisiplinan", label: "Laporan Kedisiplinan", icon: ShieldAlert },
          { id: "pengumuman", label: "Pengumuman Pondok", icon: Megaphone },
          { id: "audit_log", label: "Jejak Aktivitas Staf", icon: FileText, badge: auditLogs.length },
          { id: "laporan", label: "Pusat Laporan & Analitik", icon: BarChart3 },
          { id: "profile", label: "Profil Saya", icon: UserCheck },
        ];

      case "tu":
        const pendingTuFeeCount = jenisPembayaranList.filter((j) => j.status_persetujuan === "MENUNGGU_PERSETUJUAN").length;
        return [
          { id: "dashboard", label: "Dashboard TU", icon: LayoutGrid },
          { id: "profil_pesantren", label: "Profil Pesantren", icon: Building2 },
          {
            id: "pembiayaan",
            label: "Manajemen Pembiayaan Santri",
            icon: Receipt,
            badge: pendingTuFeeCount || undefined,
          },
          { id: "pelanggaran", label: "Manajemen Pelanggaran Santri", icon: ShieldAlert },
          { id: "pengumuman", label: "Pengumuman Wali Santri", icon: Megaphone },
          { id: "rekapitulasi", label: "Rekapitulasi & Laporan", icon: BarChart3 },
          { id: "santri_wali", label: "Data Santri & Akun Wali", icon: Users, badge: santriList.length },
          { id: "tambah_santri", label: "Tambah Data Santri", icon: UserPlus },
          { id: "kelas_kamar", label: "Kelas, Kamar & Penempatan", icon: Landmark },
          { id: "profile", label: "Profil Saya", icon: UserCheck },
        ];

      case "bendahara":
        return [
          { id: "dashboard", label: "Dashboard Bendahara", icon: LayoutGrid },
          {
            id: "verifikasi_pembayaran",
            label: "Verifikasi Pembayaran",
            icon: CheckCircle2,
            badge: transaksiPembayaranList.filter((t) => t.status === "MENUNGGU_VERIFIKASI").length || undefined,
          },
          {
            id: "verifikasi_saku",
            label: "Verifikasi Top-Up Uang Saku",
            icon: ArrowRightLeft,
          },
          { id: "penyerahan_saku", label: "Penyerahan Uang Saku", icon: Camera },
          { id: "keuangan_saldo_santri", label: "Keuangan & Saldo Santri", icon: Wallet },
          { id: "rekening_info", label: "Rekening Resmi Pesantren", icon: Landmark },
          { id: "mengaji", label: "Perkembangan Mengaji (Asatidz)", icon: BookOpen },
          { id: "tahfidz", label: "Setoran Tahfidz (Asatidz)", icon: Sparkles },
          { id: "prestasi", label: "Prestasi Santri (Asatidz)", icon: Trophy },
          { id: "kedisiplinan", label: "Kedisiplinan (Asatidz)", icon: ShieldAlert },
          { id: "laporan", label: "Pusat Laporan & Analitik", icon: BarChart3 },
          { id: "profile", label: "Profil Saya", icon: UserCheck },
        ];

      case "pengelola":
      case "asatidz":
        return [
          { id: "dashboard", label: "Dashboard Asatidz", icon: LayoutGrid },
          { id: "mengaji", label: "Perkembangan Mengaji", icon: BookOpen },
          { id: "tahfidz", label: "Setoran Tahfidz Al-Qur'an", icon: Sparkles },
          { id: "prestasi", label: "Prestasi Santri", icon: Trophy },
          { id: "kedisiplinan", label: "Kedisiplinan & Pembinaan", icon: ShieldAlert },
          { id: "laporan", label: "Pusat Laporan & Analitik", icon: BarChart3 },
          { id: "profile", label: "Profil Saya", icon: UserCheck },
        ];

      case "wali":
      default:
        return [
          { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
          { id: "profil_santri", label: "Profil Santri", icon: UserCheck },
          { id: "informasi_tagihan", label: "Informasi Tagihan", icon: Receipt },
          { id: "pembayaran", label: "Pembayaran SPP & Cicilan", icon: CreditCard },
          { id: "riwayat_pembayaran", label: "Riwayat Pembayaran", icon: Clock },
          { id: "uang_saku", label: "Uang Saku Santri", icon: Wallet },
          { id: "riwayat_mutasi", label: "Riwayat Mutasi & Foto", icon: ArrowRightLeft },
          { id: "mengaji", label: "Perkembangan Mengaji", icon: BookOpen },
          { id: "tahfidz", label: "Setoran Tahfidz", icon: Sparkles },
          { id: "prestasi", label: "Prestasi Santri", icon: Trophy },
          { id: "kedisiplinan", label: "Kedisiplinan", icon: ShieldCheck },
          { id: "pengumuman", label: "Pengumuman Pesantren", icon: Megaphone },
          { id: "dokumen", label: "Dokumen & Unduhan", icon: Download },
          { id: "profile", label: "Profil Saya", icon: User },
        ];
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
  // Bersih, Profesional, Bebas Status Supabase Cloud
  // ==========================================================================
  if (!isAuthenticated || !currentUser) {
    const publishedAnnouncements = pengumumanList.filter((p) => p.is_published);

    const portalsList: {
      role: UserRole;
      title: string;
      url: string;
      badge: string;
      identifier: string;
      desc: string;
      icon: React.ElementType;
    }[] = [
      {
        role: "superadmin",
        title: "Superadmin (Pembuat SIPETA)",
        url: "/superadmin/login",
        badge: "Pembuat Sistem",
        identifier: "Masuk dengan Akun Resmi",
        desc: "Pemilik dan pembuat aplikasi: pengelolaan akun staf, penetapan rekening resmi tunggal BSI, dan jejak audit sistem.",
        icon: Shield,
      },
      {
        role: "admin",
        title: "Pengasuh Pondok",
        url: "/admin/login",
        badge: "Pimpinan & Pengasuh",
        identifier: "Masuk dengan Username",
        desc: "Dashboard pengawasan terpadu seluruh santri, kelas, asrama, keuangan SPP, uang saku, capaian tahfidz, dan rekapitulasi operasional pondok.",
        icon: UserCheck,
      },
      {
        role: "tu",
        title: "Tata Usaha (TU)",
        url: "/tu/login",
        badge: "Administrasi Santri",
        identifier: "Masuk dengan Username",
        desc: "Administrasi master santri, pembuatan akun wali mandiri (1:1), master kelas, asrama, import/export Excel, dan pemindahan penempatan.",
        icon: Building2,
      },
      {
        role: "pengelola",
        title: "Asatidz & Pembina",
        url: "/asatidz/login",
        badge: "Kepesantrenan",
        identifier: "Masuk dengan Username",
        desc: "Pencatatan mutaba'ah mengaji harian, setoran tahfidz Al-Qur'an, rekam prestasi santri, dan pembinaan kedisiplinan asrama.",
        icon: BookOpen,
      },
      {
        role: "bendahara",
        title: "Bendahara Pesantren",
        url: "/bendahara/login",
        badge: "Keuangan & Asatidz",
        identifier: "Masuk dengan Username",
        desc: "Verifikasi setoran SPP bank BSI, persetujuan uang saku, penyerahan fisik, pembukuan ledger immutable, dan integrasi fitur asatidz.",
        icon: Wallet,
      },
      {
        role: "wali",
        title: "Orang Tua / Wali Santri",
        url: "/login",
        badge: "Wali Santri",
        identifier: "Masuk dengan NIS Santri",
        desc: "Layanan informasi tagihan SPP, cicilan biaya, saldo & mutasi uang saku, serta mutaba'ah tahfidz santri asuhan.",
        icon: Users,
      },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        {/* Header Publik */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-xs">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-0.5 shadow-xs border border-emerald-100 shrink-0">
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
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition"
              >
                <LogIn className="h-4 w-4" />
                <span>Masuk Portal</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Hero & Konten Utama Publik */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 space-y-8">
          {/* Welcome Card Banner */}
          <div className="rounded-2xl border border-emerald-800 bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 sm:p-8 text-white shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <span className="rounded-full bg-emerald-800/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-200 border border-emerald-700">
                Gerbang Pelayanan Resmi
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              Selamat Datang di Portal Terpadu SIPETA
            </h2>
            <p className="mt-3 text-sm text-emerald-100/90 leading-relaxed max-w-3xl">
              Layanan digital terpadu bagi Orang Tua/Wali Santri, Asatidz, Bendahara, Pengelola Kepesantrenan, dan Pimpinan Pondok Pesantren Modern Abu Manshur Cirebon.
            </p>
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur border border-white/10">
                <Wallet className="h-5 w-5 text-emerald-300 mb-1.5" />
                <p className="font-bold">Keuangan &amp; SPP</p>
                <p className="text-[11px] text-emerald-200">Cicilan &amp; 1 Rekening BSI</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur border border-white/10">
                <BookOpen className="h-5 w-5 text-emerald-300 mb-1.5" />
                <p className="font-bold">Tahfidz &amp; Mengaji</p>
                <p className="text-[11px] text-emerald-200">Mutaba&apos;ah Harian</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur border border-white/10">
                <Award className="h-5 w-5 text-emerald-300 mb-1.5" />
                <p className="font-bold">Prestasi &amp; Disiplin</p>
                <p className="text-[11px] text-emerald-200">Catatan Pembinaan</p>
              </div>
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur border border-white/10">
                <Calendar className="h-5 w-5 text-emerald-300 mb-1.5" />
                <p className="font-bold">Uang Saku Ledger</p>
                <p className="text-[11px] text-emerald-200">Wajib Foto Penyerahan</p>
              </div>
            </div>
          </div>

          {/* Bagian Utama: LOGIN (Pusat Pilihan Akses Sesuai Kewenangan) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <LogIn className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                    Login — Gerbang Akses Layanan Terpadu
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Silakan pilih pintu masuk portal pelayanan sesuai dengan peran dan kewenangan resmi Anda:
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {portalsList.map((portal) => {
                const Icon = portal.icon;
                return (
                  <Link
                    key={portal.role}
                    href={portal.url}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-5 hover:bg-emerald-50/60 hover:border-emerald-300 hover:shadow-md transition-all group relative overflow-hidden"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-sm group-hover:scale-105 transition">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 shadow-2xs">
                          {portal.badge}
                        </span>
                      </div>

                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-emerald-950 transition">
                        {portal.title}
                      </h4>
                      <p className="mt-1 text-[11px] font-semibold text-emerald-800">
                        {portal.identifier}
                      </p>
                      <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                        {portal.desc}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-xs font-bold text-emerald-800 group-hover:text-emerald-950">
                      <span>Buka Halaman Masuk</span>
                      <ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition text-emerald-700" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Simulasi Dev Only jika diizinkan */}
            {isDemoAllowed && (
              <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-xs mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-amber-900 flex items-center gap-1.5">
                      <KeyRound className="h-4 w-4 text-amber-700" />
                      Mode Simulasi Pengujian (Development Standalone):
                    </p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Pilih role untuk mencoba simulasi alur kerja lokal tanpa autentikasi Supabase.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Pilih Role Demo"
                      value={selectedDemoRole}
                      onChange={(e) => setSelectedDemoRole(e.target.value as UserRole)}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      <option value="wali">Wali Santri (Hafidz)</option>
                      <option value="bendahara">Bendahara (Hj. Siti Aminah)</option>
                      <option value="admin">Admin (H. Ahmad Dahlan)</option>
                      <option value="tu">Tata Usaha (Ust. Lukman)</option>
                      <option value="pengelola">Pengelola (Ust. Abdullah)</option>
                      <option value="superadmin">Superadmin (Kyai Abu Manshur)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => enterDemoMode(selectedDemoRole)}
                      className="rounded-lg bg-amber-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-900 transition shrink-0"
                    >
                      Buka Simulasi
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Papan Pengumuman Resmi Pesantren */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Pengumuman Resmi Pesantren
                  </h3>
                  <p className="text-xs text-slate-500">
                    Informasi, agenda, dan maklumat terbaru Pondok Pesantren Modern Abu Manshur
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {publishedAnnouncements.length} Informasi Publik
              </span>
            </div>

            <div className="space-y-3">
              {publishedAnnouncements.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">
                  Belum ada pengumuman publik saat ini.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {publishedAnnouncements.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-4 transition flex flex-col justify-between ${
                        item.is_penting
                          ? "border-amber-300 bg-amber-50/60"
                          : "border-slate-200 bg-slate-50/60"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
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
                        <h4 className="text-sm font-bold text-slate-900">
                          {item.judul}
                        </h4>
                        <p className="mt-1.5 text-xs text-slate-600 line-clamp-3 leading-relaxed">
                          {item.isi}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Footer Bersih */}
        <footer className="border-t border-slate-200 bg-white py-6 text-xs text-slate-500 text-center">
          <div className="mx-auto max-w-7xl px-4 space-y-1">
            <p className="font-semibold text-slate-800">
              SIPETA — Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur
            </p>
            <p className="text-[11px] text-slate-500">
              Jl. Nyi Ageng Serang, Sindangmekar, Dukupuntang / Plered, Cirebon, Jawa Barat
            </p>
          </div>
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // 3. AUTHENTICATED WORKSPACE (SINGLE UNIFIED LEFT SIDEBAR)
  // Menyatukan seluruh navigasi ke panel kiri
  // ==========================================================================
  const menuItems = getRoleMenuItems(currentUser.role);
  const activeMenuItem = menuItems.find((m) => m.id === activeTab) ?? menuItems[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Modal Wajib Ganti Password (Khusus Wali Pertama Kali Login) */}
      <MustChangePasswordModal />

      {/* Inactive Account Banner */}
      {!currentUser.is_active && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-center text-xs font-bold flex items-center justify-center gap-2 shadow-sm z-50">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            AKUN DINONAKTIFKAN: Akun pengguna ({currentUser.nama_lengkap}) telah dinonaktifkan oleh
            Administrator. Seluruh hak akses dan modifikasi data dibatasi.
          </span>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile Drawer Panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-emerald-950 text-white p-5 flex flex-col justify-between shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="space-y-5 overflow-y-auto max-h-[calc(100vh-140px)] no-scrollbar">
          {/* Header Mobile Drawer */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-xs shrink-0">
                <img
                  src="/images/logo-abu-manshur.png"
                  alt="Logo Abu Manshur"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-white">SIPETA</h2>
                <p className="text-[10px] text-emerald-300">PP Modern Abu Manshur</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-1.5 text-emerald-300 hover:bg-white/10 hover:text-white"
              aria-label="Tutup Menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User Profile Card Mobile (Bersih dari status Supabase) */}
          <div className="rounded-xl bg-white/10 p-3.5 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white font-bold text-sm shadow-inner shrink-0">
                {(currentUser.nama_lengkap || currentUser.username || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{currentUser.nama_lengkap}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                    {getRoleLabel(currentUser.role)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items Mobile */}
          <nav className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-2">
              Menu Navigasi
            </p>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition min-h-[44px] ${
                    isActive
                      ? "bg-white text-emerald-950 shadow-md font-extrabold"
                      : "text-emerald-100 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-900" : "text-emerald-300"}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isActive ? "bg-emerald-100 text-emerald-950" : "bg-white/15 text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Role Switcher Demo Mobile (Hanya muncul jika mode demo diizinkan) */}
          {isDemoAllowed && authMode === "demo" && (
            <div className="rounded-xl bg-amber-500/15 p-3 border border-amber-400/20 text-xs">
              <p className="font-bold text-amber-200 mb-1.5 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Simulasi Ganti Role (Dev):
              </p>
              <select
                aria-label="Pilih Role Demo Mobile"
                value={currentUser.id}
                onChange={(e) => {
                  switchActiveUser(e.target.value);
                  setActiveTab("dashboard");
                  setMobileNavOpen(false);
                }}
                className="w-full rounded-lg border border-amber-300/40 bg-emerald-950 px-2.5 py-2 text-xs font-semibold text-white focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    [{getRoleLabel(u.role)}] {u.nama_lengkap}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================================
          MODERN DESKTOP PERMANENT & COLLAPSIBLE SIDEBAR
         ====================================================================== */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 z-40 bg-emerald-950 text-white border-r border-emerald-900/60 shadow-xl justify-between p-4 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "lg:w-20" : "lg:w-72"
        }`}
      >
        <div className="space-y-5 overflow-y-auto no-scrollbar">
          {/* Brand Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className={`flex items-center gap-3 overflow-hidden ${sidebarCollapsed ? "justify-center w-full" : ""}`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-md shrink-0">
                <img
                  src="/images/logo-abu-manshur.png"
                  alt="Logo Abu Manshur"
                  className="h-full w-full object-contain"
                />
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-lg font-extrabold tracking-tight text-white">SIPETA</h1>
                    <span className="rounded bg-emerald-800 px-1.5 py-0.2 text-[9px] font-bold text-emerald-200">
                      v1.0
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-emerald-300 leading-tight truncate">
                    PP Modern Abu Manshur
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* User Profile Card Desktop (Bersih dari status Supabase Cloud) */}
          <div
            onClick={() => setActiveTab("profile")}
            className={`rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-3 shadow-inner cursor-pointer hover:bg-white/15 transition ${
              sidebarCollapsed ? "flex justify-center" : ""
            }`}
            title="Klik untuk membuka Profil Saya"
          >
            <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white font-extrabold text-sm shadow-md shrink-0">
                {(currentUser.nama_lengkap || currentUser.username || "U").charAt(0).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate" title={currentUser.nama_lengkap}>
                    {currentUser.nama_lengkap}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 border border-emerald-700 truncate">
                      {getRoleLabel(currentUser.role)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Navigation Menu */}
          <div className="space-y-1">
            {!sidebarCollapsed && (
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-2">
                Navigasi {getRoleLabel(currentUser.role)}
              </p>
            )}

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`w-full flex items-center rounded-xl px-3 py-2.5 text-xs font-bold transition min-h-[42px] ${
                    sidebarCollapsed ? "justify-center" : "justify-between"
                  } ${
                    isActive
                      ? "bg-white text-emerald-950 shadow-md font-extrabold"
                      : "text-emerald-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`}>
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-emerald-950" : "text-emerald-300"
                      }`}
                    />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {!sidebarCollapsed && item.badge !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        isActive ? "bg-emerald-100 text-emerald-950" : "bg-white/15 text-white"
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Demo Role Switcher Desktop (Dev Only) */}
          {isDemoAllowed && authMode === "demo" && !sidebarCollapsed && (
            <div className="rounded-xl bg-amber-500/15 p-3 border border-amber-400/20 text-xs space-y-1.5">
              <p className="font-bold text-amber-200 flex items-center gap-1.5 text-[11px]">
                <KeyRound className="h-3.5 w-3.5" />
                Simulasi Ganti Role (Dev):
              </p>
              <select
                aria-label="Pilih Role Demo Desktop"
                value={currentUser.id}
                onChange={(e) => {
                  switchActiveUser(e.target.value);
                  setActiveTab("dashboard");
                }}
                className="w-full rounded-lg border border-amber-300/40 bg-emerald-950 px-2 py-1.5 text-xs font-semibold text-white focus:outline-none"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    [{getRoleLabel(u.role)}] {u.nama_lengkap}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Toggle Expand/Collapse Sidebar Desktop Footer */}
        <div className="pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold text-emerald-300 hover:bg-white/10 transition"
            title={sidebarCollapsed ? "Perluas Sidebar" : "Ciutkan Sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Ciutkan Panel</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ======================================================================
          MAIN CONTENT AREA (RESPONSIVE OFFSET BERDASARKAN STATUS COLLAPSE)
         ====================================================================== */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"
        }`}
      >
        {/* Modern Top Header (Bersih dari status Supabase Cloud) */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur shadow-xs">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              {/* Hamburger Button for Mobile */}
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition"
                aria-label="Buka Menu Navigasi"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Breadcrumb Title */}
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>{activeMenuItem?.label ?? "Ruang Kerja"}</span>
                </h2>
                <p className="text-[11px] text-slate-500 hidden sm:block">
                  {profilPesantren?.nama_resmi || "Pondok Pesantren Modern Abu Manshur"} • Tahun Ajaran {profilPesantren?.tahun_pelajaran_aktif || tahunAjaranAktif?.nama || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})
                </p>
              </div>
            </div>

            {/* Right Header Actions */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Refresh Data Button */}
              {isLiveSupabase && (
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-xs disabled:opacity-50"
                  title="Muat ulang data terbaru"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-emerald-700 ${isRefreshing ? "animate-spin" : ""}`}
                  />
                  <span className="hidden sm:inline">Perbarui Data</span>
                </button>
              )}

              {/* User Avatar Pill */}
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 hover:bg-slate-100 transition"
                title="Buka Profil Saya"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-800 text-white font-bold text-xs">
                  {(currentUser.nama_lengkap || currentUser.username || "U").charAt(0).toUpperCase()}
                </div>
                <div className="text-left text-xs hidden sm:block">
                  <p className="font-bold text-slate-900 leading-tight truncate max-w-[120px]">
                    {currentUser.nama_lengkap}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                    {getRoleLabel(currentUser.role)}
                  </p>
                </div>
              </button>

              {/* Logout Button Header */}
              <button
                type="button"
                onClick={handleLogout}
                disabled={logoutLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition"
                title="Keluar dari akun"
              >
                {logoutLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Body Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {activeTab === "profile" ? (
            <UserProfileView />
          ) : activeTab === "laporan" ? (
            <LaporanPortal />
          ) : (
            <>
              {currentUser.role === "wali" && (
                <WaliPortal
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
              {currentUser.role === "bendahara" && (
                <BendaharaPortal
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
              {currentUser.role === "tu" && (
                <TuPortal
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
              {currentUser.role === "admin" && (
                <AdminPortal
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
              {(currentUser.role === "pengelola" || (currentUser.role as string) === "asatidz") && (
                <PengelolaPortal
                  activeTab={activeTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
              {currentUser.role === "superadmin" && (
                <SuperadminPortal
                  activeTab={activeTab as SuperadminTab}
                  onTabChange={(tab) => setActiveTab(tab)}
                />
              )}
            </>
          )}
        </main>

        {/* Footer Bersih */}
        <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500 no-print">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2.5">
              <img
                src="/images/logo-abu-manshur.png"
                alt="Logo PP Modern Abu Manshur"
                className="h-6 w-6 object-contain shrink-0"
              />
              <span>
                <strong>SIPETA — {profilPesantren?.nama_resmi || "Pondok Pesantren Modern Abu Manshur"}</strong> • {profilPesantren?.alamat ? profilPesantren.alamat.split(",")[0] : "Plered - Cirebon"}
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              <span>Tahun Ajaran {profilPesantren?.tahun_pelajaran_aktif || tahunAjaranAktif?.nama || "2024/2025"} ({profilPesantren?.semester_aktif || "Ganjil"})</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
