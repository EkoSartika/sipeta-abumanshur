// ============================================================================
// SIPETA - Formatting & UI Helper Utilities
// ============================================================================

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  KebijakanCicilan,
  StatusSantri,
  StatusTagihan,
  StatusTransaksi,
  UserRole,
} from "@/types/database";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(nominal);
}

export function formatTanggal(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatWaktuLengkap(dateStr: string): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    superadmin: "Superadmin",
    admin: "Pengasuh Pondok",
    tu: "Tata Usaha (TU)",
    pengelola: "Asatidz",
    asatidz: "Asatidz",
    bendahara: "Bendahara Pesantren",
    wali: "Orang Tua / Wali Santri",
  };
  return labels[role] ?? "Pengguna";
}

export function getRoleLoginUrl(role: UserRole): string {
  const routes: Record<UserRole, string> = {
    superadmin: "/superadmin/login",
    admin: "/admin/login",
    tu: "/tu/login",
    pengelola: "/asatidz/login",
    asatidz: "/asatidz/login",
    bendahara: "/bendahara/login",
    wali: "/login",
  };
  return routes[role] ?? "/login";
}

export function getKebijakanCicilanLabel(
  kebijakan: KebijakanCicilan,
  minimalNominal: number | null
): string {
  if (kebijakan === "TIDAK_BOLEH") {
    return "Wajib Bayar Penuh (Tidak Dicicil)";
  }
  if (kebijakan === "MINIMAL_NOMINAL" && minimalNominal) {
    return `Dapat Dicicil (Min. ${formatRupiah(minimalNominal)})`;
  }
  return "Cicilan Fleksibel (Tanpa Minimum Khusus)";
}

export function getStatusTagihanBadge(status: StatusTagihan): {
  label: string;
  className: string;
} {
  switch (status) {
    case "LUNAS":
      return {
        label: "Lunas",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    case "DIBAYAR_SEBAGIAN":
      return {
        label: "Dibayar Sebagian",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
    case "BELUM_BAYAR":
      return {
        label: "Belum Dibayar",
        className: "bg-rose-100 text-rose-800 border-rose-200",
      };
    case "DIBATALKAN":
      return {
        label: "Dibatalkan",
        className: "bg-slate-100 text-slate-600 border-slate-200",
      };
  }
}

export function getStatusTransaksiBadge(status: StatusTransaksi): {
  label: string;
  className: string;
} {
  switch (status) {
    case "DISETUJUI":
      return {
        label: "Disetujui Bendahara",
        className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    case "MENUNGGU_VERIFIKASI":
      return {
        label: "Menunggu Verifikasi",
        className: "bg-amber-100 text-amber-800 border-amber-200",
      };
    case "MENUNGGU_TRANSFER":
      return {
        label: "Menunggu Transfer",
        className: "bg-blue-100 text-blue-800 border-blue-200",
      };
    case "DITOLAK":
      return {
        label: "Ditolak",
        className: "bg-rose-100 text-rose-800 border-rose-200",
      };
    case "KEDALUWARSA":
      return {
        label: "Kedaluwarsa",
        className: "bg-slate-100 text-slate-600 border-slate-200",
      };
    case "DIBATALKAN":
      return {
        label: "Dibatalkan",
        className: "bg-slate-100 text-slate-600 border-slate-200",
      };
  }
}

export function getStatusSantriBadge(status: StatusSantri): {
  label: string;
  className: string;
} {
  switch (status) {
    case "AKTIF":
      return { label: "Aktif", className: "bg-emerald-100 text-emerald-800" };
    case "CUTI":
      return { label: "Cuti", className: "bg-amber-100 text-amber-800" };
    case "LULUS":
      return { label: "Lulus", className: "bg-blue-100 text-blue-800" };
    case "PINDAH":
      return { label: "Pindah", className: "bg-purple-100 text-purple-800" };
    case "TIDAK_AKTIF":
      return { label: "Tidak Aktif", className: "bg-slate-200 text-slate-700" };
  }
}

