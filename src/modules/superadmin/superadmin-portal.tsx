"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Edit2,
  FileText,
  Info,
  KeyRound,
  Landmark,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Trash2,
  X,
} from "lucide-react";
import { useSipeta } from "@/lib/store/sipeta-context";
import { formatWaktuLengkap, getRoleLabel } from "@/lib/utils/format";
import {
  extractUsername,
  isValidUsername,
  normalizeUsername,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import type { UserProfile, UserRole } from "@/types/database";

export type SuperadminTab = "dashboard" | "users" | "rekening" | "audit_log";

export interface SuperadminPortalProps {
  activeTab?: SuperadminTab;
  onTabChange?: (tab: SuperadminTab) => void;
}

export function SuperadminPortal({
  activeTab: controlledTab,
  onTabChange,
}: SuperadminPortalProps = {}) {
  const {
    currentUser,
    users,
    santriList,
    rekeningResmi,
    auditLogs,
    refreshFromSupabase,
    createUserAccount,
    manageUserAccount,
    toggleUserActive,
    deleteUserAccount,
    deleteUserAccountBatch,
    updateRekeningResmi,
  } = useSipeta();

  useEffect(() => {
    refreshFromSupabase();
  }, []);

  const [internalTab, setInternalTab] = useState<SuperadminTab>("dashboard");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: SuperadminTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Filter & Search Pengguna
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // State Modal Buat Akun Baru (Hanya Admin, Bendahara, Pengelola)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [namaUser, setNamaUser] = useState("");
  const [usernameUser, setUsernameUser] = useState("");
  const [teleponUser, setTeleponUser] = useState("");
  const [roleUser, setRoleUser] = useState<UserRole>("admin");
  const [santriUser, setSantriUser] = useState("");
  const [passwordUser, setPasswordUser] = useState("");
  const [passwordConfirmUser, setPasswordConfirmUser] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // State Modal Terpadu: Kelola Akun (Username, Password Baru Opsional, Profil, Role, Status)
  const [manageModalUser, setManageModalUser] = useState<UserProfile | null>(null);
  const [manageNama, setManageNama] = useState("");
  const [manageUsername, setManageUsername] = useState("");
  const [managePassword, setManagePassword] = useState("");
  const [manageConfirmPassword, setManageConfirmPassword] = useState("");
  const [manageTelepon, setManageTelepon] = useState("");
  const [manageRole, setManageRole] = useState<UserRole>("admin");
  const [manageIsActive, setManageIsActive] = useState(true);
  const [manageMustChangePassword, setManageMustChangePassword] = useState(false);
  const [manageSubmitting, setManageSubmitting] = useState(false);

  // State Modal Hapus Akun Single
  const [deleteModalUser, setDeleteModalUser] = useState<UserProfile | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // State Bulk Selection & Bulk Delete Akun
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);
  const [bulkDeleteResult, setBulkDeleteResult] = useState<{
    total: number;
    deleted: number;
    deactivated: number;
    skipped: number;
    failed: number;
    items?: Array<{ id: string; nama_lengkap?: string; status: string; actionTaken?: string; message: string }>;
  } | null>(null);

  // State Rekening Resmi Pesantren (Aman dari null/undefined)
  const [namaBank, setNamaBank] = useState(rekeningResmi?.nama_bank || "Bank Syariah Indonesia (BSI)");
  const [kodeBank, setKodeBank] = useState(rekeningResmi?.kode_bank || "451");
  const [nomorRekening, setNomorRekening] = useState(rekeningResmi?.nomor_rekening || "");
  const [atasNama, setAtasNama] = useState(rekeningResmi?.atas_nama || "");
  const [catatanInstruksi, setCatatanInstruksi] = useState(rekeningResmi?.catatan_instruksi || "");

  // Filtered Pengguna
  const filteredUsers = useMemo(() => {
    return (users || []).filter((u) => {
      if (!u) return false;
      const q = (searchQuery ?? "").toLowerCase().trim();
      const matchSearch =
        !q ||
        (u.nama_lengkap ? u.nama_lengkap.toLowerCase().includes(q) : false) ||
        (u.username ? u.username.toLowerCase().includes(q) : false) ||
        (u.email ? u.email.toLowerCase().includes(q) : false);

      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && u.is_active) ||
        (statusFilter === "inactive" && !u.is_active);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Statistik Pengguna
  const stats = useMemo(() => {
    const list = (users || []).filter(Boolean);
    return {
      total: list.length,
      active: list.filter((u) => u && u.is_active).length,
      wali: list.filter((u) => u && u.role === "wali").length,
      internal: list.filter((u) => u && u.role !== "wali").length,
    };
  }, [users]);

  const handleOpenCreateModal = () => {
    setNamaUser("");
    setUsernameUser("");
    setTeleponUser("");
    setRoleUser("admin");
    setSantriUser("");
    setPasswordUser("");
    setPasswordConfirmUser("");
    setFeedback(null);
    setIsCreateModalOpen(true);
  };

  // Handle Form Buat Akun Baru (Superadmin dapat membuat Admin, TU, Bendahara, Asatidz, Wali Santri)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if ((roleUser as string) === "superadmin") {
      setFeedback({
        ok: false,
        text: "Pembuatan akun Superadmin tambahan tidak diizinkan oleh sistem.",
      });
      return;
    }

    if (passwordUser !== passwordConfirmUser) {
      setFeedback({ ok: false, text: "Konfirmasi kata sandi tidak cocok." });
      setPasswordUser("");
      setPasswordConfirmUser("");
      return;
    }

    const pwdCheck = validatePasswordStrength(passwordUser);
    if (!pwdCheck.valid) {
      setFeedback({ ok: false, text: pwdCheck.message ?? "Kata sandi tidak valid." });
      setPasswordUser("");
      setPasswordConfirmUser("");
      return;
    }

    const cleanUser = normalizeUsername(usernameUser);
    if (!isValidUsername(cleanUser)) {
      setFeedback({
        ok: false,
        text: "Username harus 3-30 karakter alfanumerik (huruf kecil, angka, titik, strip, atau garis bawah).",
      });
      return;
    }

    if (users.some((u) => u.username && u.username.toLowerCase() === cleanUser.toLowerCase())) {
      setFeedback({
        ok: false,
        text: `Username '@${cleanUser}' sudah digunakan oleh pengguna lain. Silakan pilih username yang berbeda.`,
      });
      return;
    }

    setCreateSubmitting(true);
    try {
      const res = await createUserAccount({
        nama_lengkap: namaUser.trim(),
        username: cleanUser,
        password: passwordUser,
        no_telepon: teleponUser.trim() || "-",
        role: roleUser,
        santri_id: roleUser === "wali" && santriUser ? santriUser : undefined,
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setIsCreateModalOpen(false);
        setNamaUser("");
        setUsernameUser("");
        setTeleponUser("");
        setSantriUser("");
        setPasswordUser("");
        setPasswordConfirmUser("");
      } else {
        // Pada kegagalan: modal tetap terbuka, nama & username & telepon tetap dipertahankan, kosongkan kata sandi
        setPasswordUser("");
        setPasswordConfirmUser("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: `Gagal membuat akun: ${msg}` });
      setPasswordUser("");
      setPasswordConfirmUser("");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Buka Modal Kelola Akun Terpadu (Username, Password Baru Opsional, Profil, Role, Status)
  const handleOpenManageModal = (user: UserProfile) => {
    setManageModalUser(user);
    setManageNama(user.nama_lengkap);
    setManageUsername(user.username || "");
    setManagePassword("");
    setManageConfirmPassword("");
    setManageTelepon(user.no_telepon && user.no_telepon !== "-" ? user.no_telepon : "");
    setManageRole(user.role);
    setManageIsActive(user.is_active);
    setManageMustChangePassword(user.must_change_password ?? false);
    setFeedback(null);
  };

  // Handle Submit Kelola Akun Terpadu
  const handleManageAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageModalUser) return;
    setFeedback(null);

    // 1. Validasi Password Baru (Opsional)
    if (managePassword.trim() !== "") {
      if (managePassword !== manageConfirmPassword) {
        setFeedback({ ok: false, text: "Konfirmasi kata sandi baru tidak cocok." });
        return;
      }
      const pwdCheck = validatePasswordStrength(managePassword);
      if (!pwdCheck.valid) {
        setFeedback({ ok: false, text: pwdCheck.message ?? "Kata sandi tidak valid." });
        return;
      }
    }

    // 2. Validasi Username (Khusus Akun Non-Superadmin Resmi)
    if (manageModalUser.role !== "superadmin" && manageUsername.trim() !== "") {
      const cleanUser = normalizeUsername(manageUsername);
      if (!isValidUsername(cleanUser)) {
        setFeedback({
          ok: false,
          text: "Username harus 3-30 karakter alfanumerik (huruf kecil, angka, titik, strip, garis bawah).",
        });
        return;
      }
      const isDuplicate = users.some(
        (u) => u.id !== manageModalUser.id && u.username && u.username.toLowerCase() === cleanUser.toLowerCase()
      );
      if (isDuplicate) {
        setFeedback({
          ok: false,
          text: `Username '@${cleanUser}' sudah digunakan oleh pengguna lain. Silakan pilih username berbeda.`,
        });
        return;
      }
    }

    setManageSubmitting(true);
    try {
      const res = await manageUserAccount(manageModalUser.id, {
        nama_lengkap: manageNama.trim(),
        username:
          manageModalUser.role !== "superadmin" && manageUsername.trim()
            ? normalizeUsername(manageUsername)
            : undefined,
        new_password: managePassword.trim() !== "" ? managePassword : undefined,
        no_telepon: manageTelepon.trim() || "-",
        role: manageRole,
        is_active: manageIsActive,
        must_change_password: manageMustChangePassword,
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setManageModalUser(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: `Gagal memperbarui akun: ${msg}` });
    } finally {
      setManageSubmitting(false);
    }
  };

  // Helper Bulk Selection Akun
  const selectableUsers = useMemo(() => {
    return filteredUsers.filter(
      (u) => u.id !== currentUser?.id && u.role !== "superadmin"
    );
  }, [filteredUsers, currentUser]);

  const isAllSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((u) => selectedUserIds.includes(u.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectableUsers.map((u) => u.id));
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleExecuteBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    setBulkDeleteSubmitting(true);
    try {
      const res = await deleteUserAccountBatch(selectedUserIds);
      if (res.ok && res.summary) {
        setBulkDeleteResult({
          ...res.summary,
          items: res.results,
        });
        setSelectedUserIds([]);
        setFeedback({
          ok: true,
          text: `Eksekusi selesai: ${res.summary.deleted} akun dihapus bersih, ${res.summary.deactivated} dinonaktifkan secara aman, ${res.summary.skipped} dilewati, ${res.summary.failed} gagal.`,
        });
      } else {
        setFeedback({ ok: false, text: res.message || "Gagal menjalankan penghapusan massal akun." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: `Terjadi kesalahan saat hapus massal: ${msg}` });
    } finally {
      setBulkDeleteSubmitting(false);
      setBulkDeleteModalOpen(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    setDeleteSubmitting(true);
    try {
      const res = await deleteUserAccount(deleteModalUser.id);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDeleteModalUser(null);
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (user: UserProfile) => {
    if (user.id === currentUser?.id) {
      setFeedback({ ok: false, text: "Anda tidak dapat menonaktifkan akun Superadmin sendiri." });
      return;
    }

    const confirmMsg = user.is_active
      ? `Apakah Anda yakin ingin menonaktifkan akun ${user.nama_lengkap}? Pengguna tidak akan dapat login.`
      : `Aktifkan kembali akun ${user.nama_lengkap}?`;

    if (!window.confirm(confirmMsg)) return;

    const res = await toggleUserActive(user.id);
    setFeedback({ ok: res.ok, text: res.message });
  };

  return (
    <div className="w-full space-y-6">
      {/* Alert Feedback Banner */}
          {feedback && (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm shadow-sm transition ${
                feedback.ok
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-rose-300 bg-rose-50 text-rose-950"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {feedback.ok ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-rose-700" />
                )}
                <span className="font-semibold">{feedback.text}</span>
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

      {/* ===================================================================== */}
      {/* TAB 0: DASHBOARD SUPERADMIN */}
      {/* ===================================================================== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Welcome Card Superadmin */}
          <div className="rounded-2xl border border-emerald-800 bg-gradient-to-br from-emerald-900 to-emerald-950 p-5 sm:p-6 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                  Selamat Datang, {currentUser?.nama_lengkap}
                </h3>
              </div>
              <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-950 shadow-md hover:bg-emerald-50 transition"
                >
                  <UserPlus className="h-4 w-4 text-emerald-800" />
                  <span>Buat Akun Petugas</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Akun Terdaftar
              </span>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.total}</p>
              <span className="text-[11px] text-slate-500">Seluruh pengguna</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Akun Aktif
              </span>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">{stats.active}</p>
              <span className="text-[11px] text-emerald-700">Dapat login &amp; bertransaksi</span>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Wali Santri (1:1)
              </span>
              <p className="mt-1 text-2xl font-extrabold text-blue-900">{stats.wali}</p>
              <span className="text-[11px] text-blue-700">Relasi santri terdaftar</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Petugas Internal
              </span>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.internal}</p>
              <span className="text-[11px] text-slate-500">Admin, Bendahara, Pengelola</span>
            </div>
          </div>

          {/* Navigasi Cepat Antar Fitur */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 group-hover:bg-emerald-800 group-hover:text-white transition shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-900 transition">
                  Manajemen Akun &amp; Role
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Atur seluruh akun petugas internal (Admin, Bendahara, Pengelola), ubah role, dan kelola status.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rekening")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800 border border-blue-200 group-hover:bg-blue-800 group-hover:text-white transition shrink-0">
                <Landmark className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-900 transition">
                  Rekening Resmi Pesantren
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Konfigurasi rekening BSI resmi {rekeningResmi?.nomor_rekening || "-"} a.n. {rekeningResmi?.atas_nama || "-"}.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("audit_log")}
              className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-800 border border-purple-200 group-hover:bg-purple-800 group-hover:text-white transition shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-purple-900 transition">
                  Jejak Audit / Audit Log
                </h4>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  Pantau catatan riwayat aktivitas mutasi dan perubahan akun ({auditLogs.length} entri terekam).
                </p>
              </div>
            </button>
          </div>

          {/* Ringkasan Jejak Audit Terkini */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-800" />
                <h4 className="text-sm font-bold text-slate-900">
                  Aktivitas Audit Terbaru
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("audit_log")}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 transition flex items-center gap-1"
              >
                <span>Lihat Seluruh Log</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {auditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 truncate">{log.aktivitas} - {log.user_nama}</p>
                    <p className="text-[11px] text-slate-500">
                      Objek: <span className="font-mono">{log.jenis_objek}</span> • Role:{" "}
                      <span className="font-semibold text-slate-700">{log.user_role}</span>
                    </p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                    {formatWaktuLengkap(log.waktu)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: MANAJEMEN AKUN PENGGUNA & ROLE */}
      {/* ===================================================================== */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* Quick Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Akun Terdaftar
              </span>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.total}</p>
              <span className="text-[11px] text-slate-500">Seluruh pengguna</span>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Akun Aktif
              </span>
              <p className="mt-1 text-2xl font-extrabold text-emerald-900">{stats.active}</p>
              <span className="text-[11px] text-emerald-700">Dapat login & bertransaksi</span>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Wali Santri (1:1)
              </span>
              <p className="mt-1 text-2xl font-extrabold text-blue-900">{stats.wali}</p>
              <span className="text-[11px] text-blue-700">Relasi santri terdaftar</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Petugas Internal
              </span>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{stats.internal}</p>
              <span className="text-[11px] text-slate-500">Admin, Bendahara, Pengelola</span>
            </div>
          </div>

          {/* Baris Filter & Tombol Buat Akun Baru */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari nama, username, atau email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              {/* Filter Role */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none min-h-[44px]"
              >
                <option value="all">Semua Role</option>
                <option value="superadmin">Superadmin</option>
                <option value="admin">Pengasuh Pondok (Admin)</option>
                <option value="tu">Tata Usaha (TU)</option>
                <option value="pengelola">Asatidz</option>
                <option value="bendahara">Bendahara Pesantren</option>
                <option value="wali">Wali Santri</option>
              </select>

              {/* Filter Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none min-h-[44px]"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif Saja</option>
                <option value="inactive">Nonaktif Saja</option>
              </select>
            </div>

            {/* Tombol Buat Akun Baru */}
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-900 transition min-h-[44px] touch-manipulation cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Buat Akun Baru</span>
            </button>
          </div>

          {/* ================================================================= */}
          {/* FLOATING / TOP BULK ACTION BAR UNTUK HAPUS MASSAL AKUN */}
          {/* ================================================================= */}
          {selectedUserIds.length > 0 && (
            <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/95 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5 text-rose-950 font-bold text-xs sm:text-sm">
                <CheckCircle2 className="h-5 w-5 text-rose-700 shrink-0" />
                <span>Terpilih {selectedUserIds.length} akun pengguna</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="flex-1 sm:flex-none rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 min-h-[40px]"
                >
                  Batal Pilihan
                </button>
                <button
                  type="button"
                  onClick={() => setBulkDeleteModalOpen(true)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 shadow-sm min-h-[40px] cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Hapus Akun Terpilih</span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAMPILAN RESPONSIVE 1: KARTU MOBILE (< 768px) */}
          {/* ================================================================= */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                Tidak ada akun pengguna yang sesuai dengan filter pencarian.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const s = santriList.find((x) => x.id === u.santri_id);
                const isSuperadminSelf = u.id === currentUser?.id;
                const isLastSuperadmin =
                  u.role === "superadmin" &&
                  users.filter((x) => x.role === "superadmin").length <= 1;

                return (
                  <div
                    key={u.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          disabled={isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"}
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => handleToggleSelectUser(u.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">{u.nama_lengkap}</h4>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                              {getRoleLabel(u.role)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                u.is_active
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {u.is_active ? "Aktif" : "Nonaktif"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1 text-slate-600">
                      <div>
                        <strong>Username:</strong>{" "}
                        <span className="font-mono text-emerald-800 font-bold">
                          {u.role === "superadmin"
                            ? u.email
                            : `@${u.username || extractUsername(u.email)}`}
                        </span>
                      </div>
                      <div>
                        <strong>No. Telepon:</strong> {u.no_telepon || "-"}
                      </div>
                      {u.role === "wali" && (
                        <div>
                          <strong>Santri Asuhan:</strong>{" "}
                          {s ? (
                            <span className="font-semibold text-slate-900">
                              {s.nama_lengkap} (NIS: {s.nis})
                            </span>
                          ) : (
                            <span className="text-amber-700 italic">Belum terhubung santri</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tombol Aksi Mobile Touch Targets (min 44px) - Hanya 3 Aksi Sesuai Bagian E.1 */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenManageModal(u)}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-1.5 py-2 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 min-h-[44px] touch-manipulation cursor-pointer"
                      >
                        <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Kelola Akun</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSuperadminSelf || u.role === "superadmin"}
                        onClick={() => handleToggleActive(u)}
                        className={`inline-flex items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition min-h-[44px] touch-manipulation cursor-pointer ${
                          isSuperadminSelf || u.role === "superadmin"
                            ? "opacity-50 cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : u.is_active
                            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {u.is_active ? (
                          <>
                            <UserX className="h-3.5 w-3.5" />
                            <span>Nonaktif</span>
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>Aktif</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"}
                        title={
                          u.role === "superadmin"
                            ? "Akun Superadmin dilindungi sistem dan tidak dapat dihapus"
                            : isSuperadminSelf
                            ? "Tidak dapat menghapus akun sendiri"
                            : isLastSuperadmin
                            ? "Akun Superadmin terakhir tidak dapat dihapus"
                            : "Hapus akun"
                        }
                        onClick={() => setDeleteModalUser(u)}
                        className={`inline-flex items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition min-h-[44px] touch-manipulation cursor-pointer ${
                          isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"
                            ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        }`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ================================================================= */}
          {/* TAMPILAN RESPONSIVE 2: TABEL DESKTOP (>= 768px) */}
          {/* ================================================================= */}
          <div className="hidden md:block rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500 font-bold">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        title="Pilih Semua Akun"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Nama Lengkap &amp; Username</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">No. Telepon</th>
                    <th className="py-3 px-3">Relasi Santri (Khusus Wali)</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Aksi Manajemen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Tidak ada pengguna yang sesuai dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const s = santriList.find((x) => x.id === u.santri_id);
                      const isSuperadminSelf = u.id === currentUser?.id;
                      const isLastSuperadmin =
                        u.role === "superadmin" &&
                        users.filter((x) => x.role === "superadmin").length <= 1;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-3 text-center">
                            <input
                              type="checkbox"
                              disabled={isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"}
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => handleToggleSelectUser(u.id)}
                              className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-slate-900">{u.nama_lengkap}</div>
                            <div className="font-mono text-[11px] text-emerald-800 font-bold">
                              {u.role === "superadmin"
                                ? u.email
                                : `@${u.username || extractUsername(u.email)}`}
                            </div>
                            {u.role === "superadmin" && (
                              <div className="text-[10px] text-slate-500 font-medium">
                                Email Resmi: {u.email}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-800">
                              {getRoleLabel(u.role)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-slate-600 font-mono">
                            {u.no_telepon || "-"}
                          </td>
                          <td className="py-3.5 px-3 text-slate-600">
                            {u.role === "wali" ? (
                              s ? (
                                <span className="font-semibold text-slate-900">
                                  {s.nama_lengkap} (NIS: {s.nis})
                                </span>
                              ) : (
                                <span className="text-amber-700 italic">Belum terhubung</span>
                              )
                            ) : (
                              <span className="text-slate-400">Petugas Internal</span>
                            )}
                          </td>
                          <td className="py-3.5 px-3">
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
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Kelola Akun Button (Terpadu: Profil, Username, Password, Role, Status) */}
                              <button
                                type="button"
                                title="Kelola data profil, username, password, role, dan status akun"
                                onClick={() => handleOpenManageModal(u)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900 hover:bg-emerald-100 min-h-[36px] transition cursor-pointer"
                              >
                                <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                                <span>Kelola Akun</span>
                              </button>

                              {/* Toggle Active Button */}
                              <button
                                type="button"
                                disabled={isSuperadminSelf || u.role === "superadmin"}
                                title={
                                  u.role === "superadmin"
                                    ? "Akun Superadmin tidak dapat dinonaktifkan"
                                    : isSuperadminSelf
                                    ? "Tidak dapat menonaktifkan akun sendiri"
                                    : u.is_active
                                    ? "Nonaktifkan akun"
                                    : "Aktifkan akun"
                                }
                                onClick={() => handleToggleActive(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold min-h-[36px] ${
                                  isSuperadminSelf || u.role === "superadmin"
                                    ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                    : u.is_active
                                    ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                }`}
                              >
                                {u.is_active ? "Nonaktifkan" : "Aktifkan"}
                              </button>

                              {/* Hapus Akun Button */}
                              <button
                                type="button"
                                disabled={isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"}
                                title={
                                  u.role === "superadmin"
                                    ? "Akun Superadmin dilindungi sistem dan tidak dapat dihapus"
                                    : isSuperadminSelf
                                    ? "Tidak dapat menghapus akun sendiri"
                                    : isLastSuperadmin
                                    ? "Akun Superadmin terakhir tidak dapat dihapus"
                                    : "Hapus akun pengguna"
                                }
                                onClick={() => setDeleteModalUser(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold min-h-[36px] ${
                                  isSuperadminSelf || isLastSuperadmin || u.role === "superadmin"
                                    ? "opacity-40 cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                    : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                                }`}
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: BUAT AKUN PENGGUNA BARU */}
      {/* ===================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-extrabold text-slate-900">Buat Akun Pengguna Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {feedback && !feedback.ok && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{feedback.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} autoComplete="off" className="mt-4 space-y-4 text-xs">
              {/* Decoy inputs untuk mengelabui browser password autofill */}
              <input type="text" style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />
              <input type="password" style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  placeholder="contoh: Muhammad Rizqi Pratama"
                  value={namaUser}
                  onChange={(e) => setNamaUser(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Role Akun Pengguna</label>
                <select
                  value={roleUser}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    setRoleUser(nextRole);
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                >
                  <option value="admin">Pengasuh Pondok (Admin)</option>
                  <option value="tu">Tata Usaha (TU)</option>
                  <option value="pengelola">Asatidz (Kepesantrenan &amp; Pembina)</option>
                  <option value="bendahara">Bendahara Pesantren</option>
                  <option value="wali">Wali Santri (Orang Tua / Wali)</option>
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Pilih peran pengguna: Pengasuh Pondok (Admin), Tata Usaha (TU), Asatidz, Bendahara, atau Wali Santri. Akun Superadmin tambahan tidak diizinkan.
                </p>
              </div>

              {roleUser === "wali" && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Hubungkan ke Santri <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <select
                    value={santriUser}
                    onChange={(e) => setSantriUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  >
                    <option value="">-- Pilih Santri (Opsional) --</option>
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_lengkap} (NIS: {s.nis})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Username Akun Pengguna
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 font-mono text-xs text-slate-400 font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    name="sipeta_new_user_username"
                    id="sipeta_new_user_username"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Masukkan username (contoh: admin01, bendahara01)"
                    value={usernameUser}
                    onChange={(e) => {
                      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
                      setUsernameUser(clean);
                    }}
                    className="w-full rounded-xl border border-slate-300 pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                </div>
                {usernameUser.length > 0 &&
                  users.some((u) => u.username && u.username.toLowerCase() === usernameUser.trim().toLowerCase()) && (
                    <p className="mt-1 text-[11px] font-bold text-rose-600">
                      ⚠️ Username &apos;@{usernameUser}&apos; sudah digunakan oleh akun lain. Silakan pilih username berbeda.
                    </p>
                  )}
                {usernameUser.length > 0 && !isValidUsername(usernameUser) && (
                  <p className="mt-1 text-[11px] text-amber-700 font-medium">
                    Username harus 3–30 karakter (huruf kecil, angka, titik, strip, garis bawah). Contoh: admin01, bendahara01, pengelola01.
                  </p>
                )}
                <p className="mt-1 text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200 leading-normal">
                  ✓ Kebijakan SIPETA: Akun internal masuk dengan <strong>username</strong>. Tidak
                  menggunakan Gmail atau email pribadi.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kata Sandi</label>
                  <input
                    type="password"
                    required
                    placeholder="Min. 8 karakter alfanumerik"
                    value={passwordUser}
                    onChange={(e) => setPasswordUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Konfirmasi Kata Sandi
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Ulangi kata sandi"
                    value={passwordConfirmUser}
                    onChange={(e) => setPasswordConfirmUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp <span className="font-normal text-slate-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="contoh: 081234567890 (opsional)"
                  value={teleponUser}
                  onChange={(e) => setTeleponUser(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white shadow hover:bg-emerald-900 disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  {createSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Menyimpan Akun...</span>
                    </>
                  ) : (
                    <span>Simpan &amp; Daftarkan Akun</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL TERPADU: KELOLA AKUN PENGGUNA (SATU MODAL SESUAI BAGIAN A & E.2) */}
      {/* ===================================================================== */}
      {manageModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-extrabold text-slate-900">Kelola Akun Pengguna</h3>
              </div>
              <button
                type="button"
                onClick={() => setManageModalUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-xs border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">{manageModalUser.nama_lengkap}</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  ID: <span className="font-mono">{manageModalUser.role === "superadmin" ? manageModalUser.email : `@${manageModalUser.username || extractUsername(manageModalUser.email)}`}</span> • Peran: <strong>{getRoleLabel(manageModalUser.role)}</strong>
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  manageModalUser.is_active
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {manageModalUser.is_active ? "Akun Aktif" : "Akun Nonaktif"}
              </span>
            </div>

            {feedback && !feedback.ok && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{feedback.text}</span>
              </div>
            )}

            <form onSubmit={handleManageAccountSubmit} className="space-y-3.5 text-xs">
              {/* Nama Lengkap */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={manageNama}
                  onChange={(e) => setManageNama(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username Akun</label>
                <div className="relative">
                  <span className="absolute left-3 top-3 font-mono text-xs text-slate-400 font-bold">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    disabled={manageModalUser.role === "superadmin"}
                    value={manageUsername}
                    onChange={(e) => {
                      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
                      setManageUsername(clean);
                    }}
                    className={`w-full rounded-xl border pl-7 pr-3 py-2 text-xs font-mono font-bold min-h-[44px] ${
                      manageModalUser.role === "superadmin"
                        ? "bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed"
                        : "border-slate-300 text-slate-900 focus:border-emerald-600 focus:outline-none"
                    }`}
                  />
                </div>
                {manageModalUser.role === "superadmin" ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Akun Superadmin menggunakan identitas email resmi terdaftar (
                    <strong className="font-mono">sipetaabumanshur@gmail.com</strong>).
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Username dapat diedit (3-30 karakter). Keunikan divalidasi oleh sistem.
                  </p>
                )}
              </div>

              {/* Kata Sandi Baru (Opsional Sesuai Bagian A & E.2) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Kata Sandi Baru</label>
                    <span className="text-[10px] font-semibold text-slate-400">
                      (Opsional - Kosongkan jika tidak ingin diubah)
                    </span>
                  </div>
                  <input
                    type="password"
                    placeholder="Kosongkan jika kata sandi tidak ingin diubah"
                    value={managePassword}
                    onChange={(e) => setManagePassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                </div>

                {/* Konfirmasi Kata Sandi Baru (Hanya Muncul Jika Password Diisi) */}
                {managePassword.trim() !== "" && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Konfirmasi Kata Sandi Baru <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Ulangi kata sandi baru"
                      value={manageConfirmPassword}
                      onChange={(e) => setManageConfirmPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                    />
                    {managePassword !== manageConfirmPassword &&
                      manageConfirmPassword.length > 0 && (
                        <p className="mt-1 text-[11px] font-bold text-rose-600">
                          ⚠️ Konfirmasi kata sandi baru tidak cocok.
                        </p>
                      )}
                  </div>
                )}

                {/* Checkbox Wajibkan Ganti Kata Sandi */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manageMustChangePassword}
                      onChange={(e) => setManageMustChangePassword(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-slate-900 block">Wajibkan Ganti Kata Sandi Saat Login</span>
                      <span className="text-[11px] text-slate-500">
                        Pengguna akan langsung diarahkan ke form ubah kata sandi saat pertama kali login.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Nomor Telepon / WhatsApp */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  required
                  value={manageTelepon}
                  onChange={(e) => setManageTelepon(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              {/* Role & Status Akun */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role Pengguna</label>
                  <select
                    disabled={
                      manageModalUser.id === currentUser?.id ||
                      (manageModalUser.role === "wali" && !!manageModalUser.santri_id) ||
                      manageModalUser.role === "superadmin"
                    }
                    value={manageRole}
                    onChange={(e) => setManageRole(e.target.value as UserRole)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {manageModalUser.role === "superadmin" && (
                      <option value="superadmin">Superadmin (Terkunci &amp; Permanen)</option>
                    )}
                    <option value="admin">Pengasuh Pondok (Admin)</option>
                    <option value="tu">Tata Usaha (TU)</option>
                    <option value="bendahara">Bendahara Pesantren</option>
                    <option value="pengelola">Asatidz</option>
                    <option value="wali">Wali Santri</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status Keaktifan</label>
                  <select
                    disabled={
                      manageModalUser.id === currentUser?.id || manageModalUser.role === "superadmin"
                    }
                    value={manageIsActive ? "active" : "inactive"}
                    onChange={(e) => setManageIsActive(e.target.value === "active")}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px] disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="active">Aktif (Dapat Login)</option>
                    <option value="inactive">Nonaktif (Diblokir)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setManageModalUser(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={manageSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white shadow hover:bg-emerald-900 disabled:opacity-50 min-h-[44px] cursor-pointer"
                >
                  {manageSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Perubahan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: KONFIRMASI HAPUS AKUN PENGGUNA (BAB 3 PRD) */}
      {/* ===================================================================== */}
      {deleteModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-800 border-b border-rose-100 pb-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <h3 className="text-base font-extrabold text-slate-900">Konfirmasi Hapus Akun</h3>
            </div>

            <div className="text-xs text-slate-700 space-y-2.5 leading-relaxed">
              <p>Apakah Anda yakin ingin menghapus akun pengguna berikut?</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
                <div>
                  <strong className="text-slate-900">{deleteModalUser.nama_lengkap}</strong>
                </div>
                <div className="font-mono text-emerald-800 font-bold">
                  {deleteModalUser.role === "superadmin"
                    ? deleteModalUser.email
                    : `@${deleteModalUser.username || extractUsername(deleteModalUser.email)}`}
                </div>
                <div className="text-slate-500">
                  Role: <span className="font-bold text-slate-800">{getRoleLabel(deleteModalUser.role)}</span>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <strong>Kebijakan Integritas &amp; Audit SIPETA:</strong>
                <p>
                  {deleteModalUser.role === "wali"
                    ? "Jika akun Wali Santri ini dihapus, data santri, kamar, kelas, dan riwayat akademik tetap aman tersimpan. Jika akun memiliki riwayat transaksi keuangan aktif, akun akan dinonaktifkan secara aman (Soft Delete) untuk menjaga integritas pembukuan."
                    : "Jika akun ini memiliki riwayat transaksi keuangan aktif atau catatan audit, sistem akan menonaktifkan akun secara aman (Soft Delete) tanpa merusak rekaman pembukuan."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleDeleteUser}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50 min-h-[44px]"
              >
                {deleteSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Ya, Hapus Akun</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: KONFIRMASI HAPUS MASSAL AKUN PENGGUNA (BULK DELETE) */}
      {/* ===================================================================== */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-800 border-b border-rose-100 pb-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <h3 className="text-base font-extrabold text-slate-900">
                Konfirmasi Hapus {selectedUserIds.length} Akun Terpilih
              </h3>
            </div>

            <div className="text-xs text-slate-700 space-y-3 leading-relaxed">
              <p>
                Anda akan memproses penghapusan massal untuk <strong>{selectedUserIds.length}</strong> akun pengguna berikut:
              </p>

              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 divide-y divide-slate-200/60 text-xs">
                {users
                  .filter((u) => selectedUserIds.includes(u.id))
                  .map((u) => (
                    <div key={u.id} className="py-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900">{u.nama_lengkap}</span>
                        <span className="font-mono text-[11px] text-emerald-800 ml-1.5">
                          @{u.username || extractUsername(u.email)}
                        </span>
                      </div>
                      <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {getRoleLabel(u.role)}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-950 text-[11px] space-y-1.5">
                <strong className="block font-bold">Kebijakan Perlindungan Data &amp; Integritas Finansial:</strong>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Akun tanpa transaksi keuangan</strong> akan <em>dihapus permanen (Hard Delete)</em> dari sistem dan Supabase Auth. Untuk akun Wali, data santri dan riwayat akademik tetap aman tersimpan.
                  </li>
                  <li>
                    <strong>Akun yang memiliki riwayat transaksi keuangan aktif</strong> akan <em>dinonaktifkan secara aman (Soft Deactivate)</em> demi menjaga integritas pembukuan dan audit trail pesantren.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={bulkDeleteSubmitting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={bulkDeleteSubmitting}
                onClick={handleExecuteBulkDelete}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50 min-h-[44px] cursor-pointer"
              >
                {bulkDeleteSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Memproses Penghapusan...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    <span>Ya, Proses Hapus Terpilih</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: REKAPITULASI HASIL HAPUS MASSAL AKUN */}
      {/* ===================================================================== */}
      {bulkDeleteResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">Hasil Pemrosesan Akun</h3>
              </div>
              <button
                type="button"
                onClick={() => setBulkDeleteResult(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                <div className="text-slate-500 font-semibold">Total</div>
                <div className="text-lg font-black text-slate-900">{bulkDeleteResult.total}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
                <div className="text-emerald-700 font-semibold">Dihapus</div>
                <div className="text-lg font-black text-emerald-900">{bulkDeleteResult.deleted}</div>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5">
                <div className="text-amber-700 font-semibold">Dinonaktifkan</div>
                <div className="text-lg font-black text-amber-900">{bulkDeleteResult.deactivated}</div>
              </div>
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5">
                <div className="text-rose-700 font-semibold">Gagal/Skip</div>
                <div className="text-lg font-black text-rose-900">{bulkDeleteResult.skipped + bulkDeleteResult.failed}</div>
              </div>
            </div>

            {bulkDeleteResult.items && bulkDeleteResult.items.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5 divide-y divide-slate-200/60 text-xs">
                {bulkDeleteResult.items.map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-bold text-slate-900 block truncate">{item.nama_lengkap || item.id}</span>
                      <span className="text-[11px] text-slate-500">{item.message}</span>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                        item.status === "DELETED"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "DEACTIVATED"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {item.status === "DELETED" ? "Dihapus Bersih" : item.status === "DEACTIVATED" ? "Dinonaktifkan" : "Dilewati"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkDeleteResult(null)}
                className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-900 min-h-[44px]"
              >
                Tutup Laporan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: REKENING RESMI TUNGGAL PESANTREN */}
      {/* ===================================================================== */}
      {activeTab === "rekening" && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">
            Pengaturan Rekening Resmi Tunggal Pesantren (Bab 2 &amp; Bab 3.1 PRD)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
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
            className="mt-4 space-y-3.5 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Nama Bank</label>
                <input
                  type="text"
                  required
                  value={namaBank}
                  onChange={(e) => setNamaBank(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kode Bank</label>
                <input
                  type="text"
                  required
                  value={kodeBank}
                  onChange={(e) => setKodeBank(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px]"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nomor Rekening Resmi</label>
              <input
                type="text"
                required
                value={nomorRekening}
                onChange={(e) => setNomorRekening(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm font-bold min-h-[44px]"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Atas Nama Pemilik Rekening
              </label>
              <input
                type="text"
                required
                value={atasNama}
                onChange={(e) => setAtasNama(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Instruksi Pembayaran</label>
              <textarea
                rows={3}
                required
                value={catatanInstruksi}
                onChange={(e) => setCatatanInstruksi(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white hover:bg-emerald-900 shadow min-h-[44px] touch-manipulation cursor-pointer"
            >
              Simpan Rekening Resmi Pesantren
            </button>
          </form>

          {/* Riwayat Audit Pengawasan Perubahan Rekening Sesuai Bagian D PRD */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span>Riwayat Audit Pengawasan Rekening Resmi</span>
            </h4>
            {auditLogs.filter(
              (l) =>
                l &&
                (l.jenis_objek === "rekening_pesantren" ||
                  (l.aktivitas || "").includes("REKENING"))
            ).length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Belum ada rekaman perubahan konfigurasi rekening resmi.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {auditLogs
                  .filter(
                    (l) =>
                      l &&
                      (l.jenis_objek === "rekening_pesantren" ||
                        (l.aktivitas || "").includes("REKENING"))
                  )
                  .map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-900">{log.aktivitas}</span>
                        <span className="text-[11px] text-slate-400">
                          {formatWaktuLengkap(log.waktu)}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        Oleh: <strong>{log.user_role}</strong> ({log.user_id}) • Alasan:{" "}
                        {log.alasan_perubahan || "Pembaruan rekening"}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: AUDIT LOG APPEND-ONLY (BAB 13 PRD) */}
      {/* ===================================================================== */}
      {activeTab === "audit_log" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Audit Log &amp; Riwayat Aktivitas Sistem (Append-Only)
              </h3>
              <p className="text-xs text-slate-500">
                Sesuai Bab 13 PRD: Mencatat pengguna, role, aktivitas, objek, waktu, dan data
                perubahan. Tidak dapat diubah oleh pengguna biasa.
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
