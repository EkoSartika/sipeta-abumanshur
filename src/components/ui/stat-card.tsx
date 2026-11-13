import React from "react";
import { LucideIcon } from "lucide-react";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: "emerald" | "amber" | "rose" | "slate" | "blue" | "mint";
  variant?: "default" | "emerald" | "amber" | "deep";
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
    mint: "bg-[#E8F2EC] text-[#123C35] border-[#1D6B59]/20",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    amber: "bg-amber-50 text-amber-800 border-amber-200/80",
    rose: "bg-rose-50 text-rose-800 border-rose-200/80",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200/80",
  };

  const containerClasses = {
    default: "bg-white border-[#E5E7EB] text-[#1F2937] hover:border-[#1D6B59]/20 shadow-soft",
    deep: "bg-[#123C35] text-white border-[#123C35] shadow-card",
    emerald: "bg-[#1D6B59] text-white border-[#1D6B59] shadow-card",
    amber: "bg-[#78350F] text-white border-[#78350F] shadow-card",
  };

  const isDark = variant !== "default";

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-all duration-150 ${containerClasses[variant]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p
            className={`text-xs font-semibold truncate ${
              isDark ? "text-emerald-100/90" : "text-[#6B7280]"
            }`}
          >
            {title}
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold tracking-tight truncate ${
              isDark ? "text-white" : "text-[#1F2937]"
            }`}
          >
            {value}
          </p>
          {subtext && (
            <p
              className={`text-[11px] leading-relaxed truncate ${
                isDark ? "text-emerald-100/75" : "text-[#6B7280]"
              }`}
            >
              {subtext}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {Icon && (
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                isDark
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-[#E8F2EC] border-[#1D6B59]/15 text-[#123C35]"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${badgeClasses[badgeVariant]}`}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
