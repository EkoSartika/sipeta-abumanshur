import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "emerald" | "amber" | "rose" | "slate" | "blue" | "indigo" | "mint" | "deep";
  size?: "xs" | "sm" | "md";
}

export function Badge({
  className = "",
  variant = "emerald",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    deep: "bg-[#123C35] text-white border-[#123C35]",
    mint: "bg-[#E8F2EC] text-[#123C35] border-[#1D6B59]/20 font-semibold",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold",
    amber: "bg-amber-50 text-amber-800 border-amber-200/80 font-semibold",
    rose: "bg-rose-50 text-rose-800 border-rose-200/80 font-semibold",
    slate: "bg-slate-100 text-slate-700 border-slate-200 font-medium",
    blue: "bg-sky-50 text-sky-800 border-sky-200/80 font-semibold",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200/80 font-semibold",
  };

  const sizeStyles = {
    xs: "text-[10px] px-1.5 py-0.5 font-bold tracking-wide",
    sm: "text-[11px] px-2 py-0.5 font-semibold",
    md: "text-xs px-2.5 py-1 font-semibold",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
