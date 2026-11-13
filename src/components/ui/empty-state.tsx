import React from "react";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "./button";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F7F8F6]/60 p-8 sm:p-12 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F2EC] text-[#123C35] mb-3.5 border border-[#1D6B59]/15">
        {icon || <FolderOpen className="h-6 w-6" />}
      </div>
      <h3 className="text-sm sm:text-base font-bold text-[#1F2937] tracking-tight">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-[#6B7280] leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="primary" size="sm" onClick={onAction}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
