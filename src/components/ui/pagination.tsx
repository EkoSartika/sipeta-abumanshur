import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const endItem =
    totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-xs text-[#6B7280] ${className}`}
    >
      <div>
        {startItem && endItem && totalItems ? (
          <span>
            Menampilkan <strong className="text-[#1F2937]">{startItem}</strong>-
            <strong className="text-[#1F2937]">{endItem}</strong> dari{" "}
            <strong className="text-[#1F2937]">{totalItems}</strong> data
          </span>
        ) : (
          <span>
            Halaman <strong className="text-[#1F2937]">{currentPage}</strong> dari{" "}
            <strong className="text-[#1F2937]">{totalPages}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
          Sebelumnya
        </Button>

        <span className="px-2 py-1 font-semibold text-[#123C35] bg-[#E8F2EC] rounded-lg border border-[#1D6B59]/20 text-[11px]">
          {currentPage} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="xs"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Halaman berikutnya"
        >
          Berikutnya
          <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}
