"use client";

import React from "react";
import { X, ShieldCheck, ExternalLink } from "lucide-react";

interface MediaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  badgeText?: string;
}

export function MediaPreviewModal({
  isOpen,
  onClose,
  title,
  subtitle,
  imageUrl,
  badgeText = "Signed URL Private Storage Terverifikasi",
}: MediaPreviewModalProps) {
  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-950 px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">{badgeText}</span>
            </div>
            <h3 className="mt-0.5 text-base font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-emerald-200/80">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="bg-slate-100 p-4 flex items-center justify-center min-h-[280px] max-h-[70vh] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[60vh] w-auto rounded-xl border border-slate-300 shadow-sm object-contain bg-white"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span>Dokumen disimpan pada Private Bucket dengan akses terbatas sesuai RLS.</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

