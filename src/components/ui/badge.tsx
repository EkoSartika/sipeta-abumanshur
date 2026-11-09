import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "emerald" | "amber" | "rose" | "slate" | "blue" | "indigo";
  size?: "sm" | "md";
}

export function Badge({
  className = "",
  variant = "emerald",
  size = "md",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
  };

  const sizeStyles = {
    sm: "text-[10px] px-2 py-0.5 font-bold",
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

