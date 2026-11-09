import React from "react";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: "emerald" | "amber" | "rose" | "slate" | "blue";
  variant?: "default" | "emerald" | "amber";
}

export function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  badge,
  badgeVariant = "emerald",
  variant = "default",
}: StatCardProps) {
  const badgeClasses = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
  };

  const containerClasses = {
    default: "bg-white border-slate-200/90 text-slate-900",
    emerald: "bg-gradient-to-br from-emerald-900 to-emerald-950 text-white border-emerald-800 shadow-md",
    amber: "bg-gradient-to-br from-amber-900 to-amber-950 text-white border-amber-800 shadow-md",
  };

  const isDark = variant !== "default";

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-xs transition duration-150 ${containerClasses[variant]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p
            className={`text-xs font-semibold ${
              isDark ? "text-emerald-200/90 uppercase tracking-wider" : "text-slate-500"
            }`}
          >
            {title}
          </p>
          <p
            className={`text-xl sm:text-2xl font-extrabold tracking-tight ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            {value}
          </p>
          {subtext && (
            <p
              className={`text-[11px] leading-relaxed ${
                isDark ? "text-emerald-100/80" : "text-slate-500"
              }`}
            >
              {subtext}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {Icon && (
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                isDark
                  ? "bg-white/10 border-white/20 text-emerald-200"
                  : "bg-emerald-50 border-emerald-100 text-emerald-800"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${badgeClasses[badgeVariant]}`}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
