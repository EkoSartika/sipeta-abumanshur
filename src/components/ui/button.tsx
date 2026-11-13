import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "mint";
  size?: "xs" | "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none touch-manipulation cursor-pointer";

    const variantStyles = {
      primary:
        "bg-[#123C35] text-white hover:bg-[#1D6B59] active:bg-[#0E2E28] focus:ring-[#1D6B59]/40 shadow-xs border border-[#123C35]/20",
      secondary:
        "bg-slate-100 text-[#1F2937] hover:bg-slate-200 active:bg-slate-300 focus:ring-slate-300 border border-slate-200/80",
      outline:
        "bg-white text-[#1F2937] hover:bg-[#F7F8F6] hover:text-[#123C35] hover:border-[#1D6B59]/30 border border-[#E5E7EB] focus:ring-[#1D6B59]/20 shadow-xs",
      mint:
        "bg-[#E8F2EC] text-[#123C35] hover:bg-[#D7EAE0] active:bg-[#C5DFD2] border border-[#1D6B59]/20 font-bold",
      danger:
        "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 focus:ring-rose-500/40 shadow-xs border border-rose-700/20",
      ghost:
        "bg-transparent text-[#6B7280] hover:bg-slate-100 hover:text-[#1F2937] focus:ring-slate-200",
    };

    const sizeStyles = {
      xs: "text-[11px] px-2 py-1 min-h-[30px] gap-1 rounded-lg",
      sm: "text-xs px-2.5 py-1.5 min-h-[34px] gap-1.5",
      md: "text-xs sm:text-sm px-3.5 py-2 min-h-[40px] gap-2",
      lg: "text-sm sm:text-base px-5 py-2.5 min-h-[46px] gap-2.5",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 shrink-0 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
