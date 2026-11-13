import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, helpText, icon, id, required, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-[#1F2937]">
            {label} {required && <span className="text-rose-600">*</span>}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            required={required}
            className={`w-full rounded-xl border bg-white py-2 text-xs font-medium text-[#1F2937] placeholder:text-[#6B7280]/60 transition-all focus:outline-none focus:ring-2 min-h-[40px] ${
              icon ? "pl-9 pr-3" : "px-3"
            } ${
              error
                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200"
                : "border-[#E5E7EB] hover:border-slate-300 focus:border-[#1D6B59] focus:ring-[#1D6B59]/15"
            } ${className}`}
            {...props}
          />
        </div>
        {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
        {helpText && !error && <p className="text-[11px] text-[#6B7280]">{helpText}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
