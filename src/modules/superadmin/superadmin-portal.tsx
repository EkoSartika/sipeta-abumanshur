"use client";

import React, { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
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
  isValidUsername,
  normalizeUsername,
  validatePasswordStrength,
} from "@/lib/utils/auth-mapping";
import type { UserProfile, UserRole } from "@/types/database";

type SuperadminTab = "users" | "rekening" | "audit_log";

export function SuperadminPortal() {
  const {
    currentUser,
    users,
    santriList,
    rekeningResmi,
    auditLogs,
    createUserAccount,
    toggleUserActive,
    resetUserPassword,
    updateUserProfile,
    deleteUserAccount,
    updateRekeningResmi,
  } = useSipeta();

  const [activeTab, setActiveTab] = useState<SuperadminTab>("users");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Filter & Search Pengguna
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // State Modal Buat Akun Baru
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [namaUser, setNamaUser] = useState("");
  const [usernameUser, setUsernameUser] = useState("");
  const [emailUser, setEmailUser] = useState("");
  const [teleponUser, setTeleponUser] = useState("");
  const [roleUser, setRoleUser] = useState<UserRole>("admin");
  const [passwordUser, setPasswordUser] = useState("");
  const [passwordConfirmUser, setPasswordConfirmUser] = useState("");
  const [santriIdWali, setSantriIdWali] = useState(santriList[0]?.id ?? "");
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // State Modal Reset Password
  const [resetModalUser, setResetModalUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // State Modal Edit Profil
  const [editModalUser, setEditModalUser] = useState<UserProfile | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editTelepon, setEditTelepon] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("admin");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // State Modal Hapus Akun
  const [deleteModalUser, setDeleteModalUser] = useState<UserProfile | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // State Rekening Resmi Pesantren
  const [namaBank, setNamaBank] = useState(rekeningResmi.nama_bank);
  const [kodeBank, setKodeBank] = useState(rekeningResmi.kode_bank);
  const [nomorRekening, setNomorRekening] = useState(rekeningResmi.nomor_rekening);
  const [atasNama, setAtasNama] = useState(rekeningResmi.atas_nama);
  const [catatanInstruksi, setCatatanInstruksi] = useState(rekeningResmi.catatan_instruksi);

  // Filtered Pengguna
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.nama_lengkap.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q);

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
    return {
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      wali: users.filter((u) => u.role === "wali").length,
      internal: users.filter((u) => u.role !== "wali").length,
    };
  }, [users]);

  const handleOpenCreateModal = () => {
    setNamaUser("");
    setUsernameUser("");
    setEmailUser("");
    setTeleponUser("");
    setRoleUser("admin");
    setPasswordUser("");
    setPasswordConfirmUser("");
    setSantriIdWali(santriList[0]?.id ?? "");
    setFeedback(null);
    setIsCreateModalOpen(true);
  };

  // Handle Form Buat Akun Baru
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (passwordUser !== passwordConfirmUser) {
      setFeedback({ ok: false, text: "Konfirmasi kata sandi tidak cocok." });
      return;
    }

    const pwdCheck = validatePasswordStrength(passwordUser);
    if (!pwdCheck.valid) {
      setFeedback({ ok: false, text: pwdCheck.message ?? "Kata sandi tidak valid." });
      return;
    }

    if (roleUser !== "superadmin") {
      const cleanUser = normalizeUsername(usernameUser);
      if (!isValidUsername(cleanUser)) {
        setFeedback({
          ok: false,
          text: "Username harus 3-30 karakter alfanumerik (huruf kecil, angka, titik, strip, atau garis bawah).",
        });
        return;
      }

      if (users.some((u) => u.username?.toLowerCase() === cleanUser)) {
        setFeedback({
          ok: false,
          text: `Username '@${cleanUser}' sudah digunakan oleh pengguna lain. Silakan pilih username yang berbeda.`,
        });
        return;
      }
    }

    setCreateSubmitting(true);
    try {
      const res = await createUserAccount({
        nama_lengkap: namaUser.trim(),
        username: roleUser !== "superadmin" ? normalizeUsername(usernameUser) : undefined,
        email: roleUser === "superadmin" ? emailUser.trim() : undefined,
        password: passwordUser,
        no_telepon: teleponUser.trim() || "-",
        role: roleUser,
        santri_id: roleUser === "wali" ? santriIdWali : undefined,
      });

      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setIsCreateModalOpen(false);
        setNamaUser("");
        setUsernameUser("");
        setEmailUser("");
        setTeleponUser("");
        setPasswordUser("");
        setPasswordConfirmUser("");
      }
    } finally {
      setCreateSubmitting(false);
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

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser) return;
    setFeedback(null);

    if (newPassword !== confirmNewPassword) {
      setFeedback({ ok: false, text: "Konfirmasi kata sandi baru tidak cocok." });
      return;
    }

    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      setFeedback({ ok: false, text: pwdCheck.message ?? "Kata sandi tidak valid." });
      return;
    }

    setResetSubmitting(true);
    try {
      const res = await resetUserPassword(resetModalUser.id, newPassword);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setResetModalUser(null);
        setNewPassword("");
        setConfirmNewPassword("");
      }
    } finally {
      setResetSubmitting(false);
    }
  };

  // Handle Edit Profil
  const handleEditProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalUser) return;
    setFeedback(null);

    setEditSubmitting(true);
    try {
      const res = await updateUserProfile(editModalUser.id, {
        nama_lengkap: editNama.trim(),
        no_telepon: editTelepon.trim(),
        role: editRole,
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setEditModalUser(null);
      }
    } finally {
      setEditSubmitting(false);
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
    <div className="space-y-6">
      {/* Banner Utama Portal Superadmin */}
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
            <p className="mt-0.5 text-xs text-slate-300 max-w-2xl leading-relaxed">
              Sesuai Kebijakan Identitas PRD: Superadmin mengelola seluruh akun pengguna internal
              berbasis <strong>Username</strong> tanpa email pribadi, rekening tunggal pesantren,
              dan audit log append-only yang terlindungi.
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

        {/* Tab Navigation */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/15 pt-4">
          {[
            { id: "users", label: `Manajemen Akun & Role (${users.length})`, icon: Users },
            { id: "rekening", label: "Rekening Resmi Pesantren", icon: Landmark },
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
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition min-h-[44px] touch-manipulation cursor-pointer ${
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
                <option value="admin">Admin Administrasi</option>
                <option value="bendahara">Bendahara Pesantren</option>
                <option value="pengelola">Pengelola Kepesantrenan</option>
                <option value="wali">Orang Tua / Wali Santri</option>
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

                    <div className="rounded-xl bg-slate-50 p-2.5 text-xs space-y-1 text-slate-600">
                      <div>
                        <strong>Username:</strong>{" "}
                        <span className="font-mono text-emerald-800 font-bold">
                          {u.username ? `@${u.username}` : u.email}
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

                    {/* Tombol Aksi Mobile Touch Targets (min 44px) */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setEditModalUser(u);
                          setEditNama(u.nama_lengkap);
                          setEditTelepon(u.no_telepon || "");
                          setEditRole(u.role);
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-1.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 min-h-[44px] touch-manipulation cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setResetModalUser(u);
                          setNewPassword("");
                          setConfirmNewPassword("");
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-1.5 py-2 text-[11px] font-bold text-amber-900 hover:bg-amber-100 min-h-[44px] touch-manipulation cursor-pointer"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        <span>Sandi</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSuperadminSelf}
                        onClick={() => handleToggleActive(u)}
                        className={`inline-flex items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition min-h-[44px] touch-manipulation cursor-pointer ${
                          isSuperadminSelf
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
                        disabled={isSuperadminSelf || isLastSuperadmin}
                        title={
                          isSuperadminSelf
                            ? "Tidak dapat menghapus akun sendiri"
                            : isLastSuperadmin
                            ? "Akun Superadmin terakhir tidak dapat dihapus"
                            : "Hapus akun"
                        }
                        onClick={() => setDeleteModalUser(u)}
                        className={`inline-flex items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition min-h-[44px] touch-manipulation cursor-pointer ${
                          isSuperadminSelf || isLastSuperadmin
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
                    <th className="py-3 px-4">Nama Lengkap & Username</th>
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
                      <td colSpan={6} className="py-8 text-center text-slate-400">
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
                          <td className="py-3.5 px-4">
                            <div className="font-extrabold text-slate-900">{u.nama_lengkap}</div>
                            <div className="font-mono text-[11px] text-emerald-800 font-bold">
                              {u.username ? `@${u.username}` : u.email}
                            </div>
                            <div className="text-[10px] text-slate-400">{u.email}</div>
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
                              {/* Edit Profil Button */}
                              <button
                                type="button"
                                title="Ubah data profil pengguna"
                                onClick={() => {
                                  setEditModalUser(u);
                                  setEditNama(u.nama_lengkap);
                                  setEditTelepon(u.no_telepon || "");
                                  setEditRole(u.role);
                                }}
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[36px]"
                              >
                                Edit
                              </button>

                              {/* Reset Password Button */}
                              <button
                                type="button"
                                title="Atur ulang kata sandi pengguna"
                                onClick={() => {
                                  setResetModalUser(u);
                                  setNewPassword("");
                                  setConfirmNewPassword("");
                                }}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 min-h-[36px]"
                              >
                                Sandi
                              </button>

                              {/* Toggle Active Button */}
                              <button
                                type="button"
                                disabled={isSuperadminSelf}
                                title={
                                  isSuperadminSelf
                                    ? "Tidak dapat menonaktifkan akun sendiri"
                                    : u.is_active
                                    ? "Nonaktifkan akun"
                                    : "Aktifkan akun"
                                }
                                onClick={() => handleToggleActive(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold min-h-[36px] ${
                                  isSuperadminSelf
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
                                disabled={isSuperadminSelf || isLastSuperadmin}
                                title={
                                  isSuperadminSelf
                                    ? "Tidak dapat menghapus akun sendiri"
                                    : isLastSuperadmin
                                    ? "Akun Superadmin terakhir tidak dapat dihapus"
                                    : "Hapus akun pengguna"
                                }
                                onClick={() => setDeleteModalUser(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold min-h-[36px] ${
                                  isSuperadminSelf || isLastSuperadmin
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
                    if (nextRole === "superadmin") {
                      setUsernameUser("");
                    } else {
                      setEmailUser("");
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                >
                  <option value="admin">Admin Administrasi Pesantren</option>
                  <option value="bendahara">Bendahara Pesantren</option>
                  <option value="pengelola">Pengelola Kepesantrenan &amp; Asrama</option>
                  <option value="wali">Orang Tua / Wali Santri (Relasi 1:1)</option>
                  <option value="superadmin">Superadmin (Khusus Email Resmi)</option>
                </select>
              </div>

              {roleUser === "superadmin" ? (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Email Resmi Superadmin
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sipetaabumanshur@gmail.com"
                    value={emailUser}
                    onChange={(e) => setEmailUser(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Akun Superadmin menggunakan email resmi terdaftar di Supabase Auth.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Username Akun Internal
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
                      placeholder="Masukkan username"
                      value={usernameUser}
                      onChange={(e) => {
                        const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
                        setUsernameUser(clean);
                      }}
                      className="w-full rounded-xl border border-slate-300 pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                    />
                  </div>
                  {usernameUser.length > 0 &&
                    users.some((u) => u.username?.toLowerCase() === usernameUser.toLowerCase()) && (
                      <p className="mt-1 text-[11px] font-bold text-rose-600">
                        ⚠️ Username &apos;@{usernameUser}&apos; sudah digunakan oleh akun lain. Silakan pilih username berbeda.
                      </p>
                    )}
                  {usernameUser.length > 0 && !isValidUsername(usernameUser) && (
                    <p className="mt-1 text-[11px] text-amber-700 font-medium">
                      Username harus 3–30 karakter (huruf kecil, angka, titik, strip, garis bawah). Contoh: admin01, bendahara01, pengelola01, wali2026001.
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg border border-emerald-200 leading-normal">
                    ✓ Kebijakan SIPETA: Akun internal masuk dengan <strong>username</strong>. Tidak
                    menggunakan Gmail atau email pribadi. Domain sintetis internal otomatis
                    diterapkan.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kata Sandi</label>
                  <input
                    type="password"
                    required
                    placeholder="Min. 8 karakter"
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
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  required
                  placeholder="contoh: 081234567890"
                  value={teleponUser}
                  onChange={(e) => setTeleponUser(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              {roleUser === "wali" && (
                <div className="rounded-xl bg-blue-50/70 p-3.5 border border-blue-200 space-y-2">
                  <label className="block font-bold text-blue-950">
                    Hubungkan ke Santri Asuhan (Relasi 1:1 Wajib)
                  </label>
                  <select
                    value={santriIdWali}
                    onChange={(e) => setSantriIdWali(e.target.value)}
                    className="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:outline-none min-h-[44px]"
                  >
                    {santriList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_lengkap} (NIS: {s.nis})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-blue-800 leading-normal">
                    Sesuai Bab 2 PRD: 1 Santri hanya memiliki 1 akun Orang Tua/Wali resmi.
                  </p>
                </div>
              )}

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
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white shadow hover:bg-emerald-900 disabled:opacity-50 min-h-[44px]"
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
      {/* MODAL 2: RESET PASSWORD PENGGUNA */}
      {/* ===================================================================== */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-slate-900">Atur Ulang Kata Sandi</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs border border-slate-200">
              <p className="font-bold text-slate-900">{resetModalUser.nama_lengkap}</p>
              <p className="text-slate-600">
                Username / Email:{" "}
                <span className="font-mono font-bold text-emerald-800">
                  {resetModalUser.username ? `@${resetModalUser.username}` : resetModalUser.email}
                </span>{" "}
                • Role: <strong>{getRoleLabel(resetModalUser.role)}</strong>
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kata Sandi Baru</label>
                <input
                  type="password"
                  required
                  placeholder="Minimal 8 karakter alfanumerik"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  placeholder="Ulangi kata sandi baru"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900 border border-amber-200">
                <p className="font-bold">Ketentuan Kata Sandi Aman:</p>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-800">
                  <li>Minimal 8 karakter panjangnya</li>
                  <li>Memuat kombinasi huruf dan angka</li>
                  <li>Kata sandi tidak dicatat pada audit log untuk menjaga kerahasiaan</li>
                </ul>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white shadow hover:bg-amber-700 disabled:opacity-50 min-h-[44px]"
                >
                  {resetSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <span>Perbarui Kata Sandi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: UBAH PROFIL PENGGUNA */}
      {/* ===================================================================== */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-emerald-700" />
                <h3 className="text-base font-extrabold text-slate-900">Ubah Profil Pengguna</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalUser(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditProfile} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  required
                  value={editTelepon}
                  onChange={(e) => setEditTelepon(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Role Pengguna</label>
                <select
                  value={editRole}
                  disabled={editModalUser.id === currentUser?.id}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-emerald-600 focus:outline-none min-h-[44px] disabled:opacity-50"
                >
                  <option value="admin">Admin Administrasi</option>
                  <option value="bendahara">Bendahara Pesantren</option>
                  <option value="pengelola">Pengelola Kepesantrenan</option>
                  <option value="wali">Orang Tua / Wali Santri</option>
                  <option value="superadmin">Superadmin</option>
                </select>
                {editModalUser.id === currentUser?.id && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Anda tidak dapat mengubah role akun Superadmin Anda sendiri.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 font-bold text-white shadow hover:bg-emerald-900 disabled:opacity-50 min-h-[44px]"
                >
                  {editSubmitting ? (
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
                  {deleteModalUser.username ? `@${deleteModalUser.username}` : deleteModalUser.email}
                </div>
                <div className="text-slate-500">
                  Role: <span className="font-bold text-slate-800">{getRoleLabel(deleteModalUser.role)}</span>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                <strong>Kebijakan Integritas &amp; Audit SIPETA:</strong>
                <p>
                  Jika akun ini memiliki riwayat transaksi keuangan atau catatan audit kepesantrenan, sistem akan menonaktifkan akun secara aman (Soft Delete) tanpa menghilangkan rekaman historis.
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
