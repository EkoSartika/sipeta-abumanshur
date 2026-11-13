"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  ShieldCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { storageService, type SipetaBucket } from "@/lib/services/storage.service";

interface MediaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  imageUrl: string | null | undefined;
  bucket?: SipetaBucket;
  badgeText?: string;
}

export function MediaPreviewModal({
  isOpen,
  onClose,
  title,
  subtitle,
  imageUrl,
  bucket,
  badgeText,
}: MediaPreviewModalProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Resolusi URL: Jika merupakan path storage privat, buat signed URL otomatis
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      setResolvedUrl(null);
      setIsLoading(false);
      setErrorMsg(null);
      setIsZoomed(false);
      return;
    }

    // Jika sudah berupa data URI (base64) atau URL absolut eksternal, gunakan langsung
    if (
      imageUrl.startsWith("data:") ||
      imageUrl.startsWith("http://") ||
      imageUrl.startsWith("https://") ||
      imageUrl.startsWith("/images/")
    ) {
      setResolvedUrl(imageUrl);
      setIsLoading(false);
      setErrorMsg(null);
      return;
    }

    // Jika berupa relative storage path (contoh: "santriId/123-bukti-bayar.jpg")
    let isCancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    // Tebak bucket jika tidak disediakan secara eksplisit
    const effectiveBucket: SipetaBucket =
      bucket ||
      (imageUrl.includes("bukti-bayar")
        ? "bukti-pembayaran"
        : imageUrl.includes("bukti-topup")
        ? "bukti-uang-saku"
        : imageUrl.includes("penyerahan")
        ? "foto-penyerahan-saku"
        : "bukti-pembayaran");

    storageService
      .getSignedUrl(effectiveBucket, imageUrl, 900)
      .then((signed) => {
        if (isCancelled) return;
        if (signed) {
          setResolvedUrl(signed);
          setErrorMsg(null);
        } else {
          setErrorMsg(
            "Berkas bukti transfer tidak ditemukan pada storage atau izin akses ditolak. Harap hubungi administrator jika berkas seharusnya tersedia."
          );
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setErrorMsg(`Gagal memuat dokumen: ${err?.message || "Kesalahan jaringan"}`);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, imageUrl, bucket, retryCount]);

  if (!isOpen) return null;

  const effectiveBadge =
    badgeText ||
    (resolvedUrl?.startsWith("data:")
      ? "Pratinjau Data Gambar Lokal"
      : "Signed URL Private Storage (Berlaku 15 Menit)");

  const handleOpenExternal = () => {
    if (resolvedUrl) {
      window.open(resolvedUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-3 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex flex-col w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-emerald-900 bg-emerald-950 px-5 py-3.5 text-white">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-emerald-300 truncate">
                {effectiveBadge}
              </span>
            </div>
            <h3 className="mt-0.5 text-base font-bold text-white truncate">{title}</h3>
            {subtitle && <p className="text-xs text-emerald-200/80 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 transition shrink-0"
            aria-label="Tutup pratinjau"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Konten Gambar / Status */}
        <div className="relative flex-1 bg-slate-100 p-4 flex items-center justify-center min-h-[300px] overflow-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-xs font-medium">Memverifikasi & memuat bukti transfer dari Secure Storage...</p>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center gap-3 max-w-md p-6 text-center bg-white rounded-xl border border-rose-200 shadow-sm">
              <div className="rounded-full bg-rose-50 p-3 text-rose-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900">Gagal Memuat Bukti Transfer</h4>
              <p className="text-xs text-slate-600">{errorMsg}</p>
              {imageUrl && (
                <p className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 break-all">
                  Path: {imageUrl}
                </p>
              )}
              <button
                type="button"
                onClick={() => setRetryCount((c) => c + 1)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Coba Muat Ulang
              </button>
            </div>
          ) : resolvedUrl ? (
            <div className="relative flex items-center justify-center w-full h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt={title}
                className={`transition-all duration-200 rounded-xl border border-slate-300 shadow-sm bg-white ${
                  isZoomed
                    ? "max-h-none w-full object-contain cursor-zoom-out"
                    : "max-h-[62vh] w-auto object-contain cursor-zoom-in"
                }`}
                onClick={() => setIsZoomed((prev) => !prev)}
                onError={() => {
                  setErrorMsg(
                    "Format berkas tidak dapat ditampilkan sebagai gambar pratinjau di browser atau tautan telah kedaluwarsa."
                  );
                }}
              />
            </div>
          ) : (
            <div className="text-xs text-slate-400">Tidak ada gambar untuk ditampilkan.</div>
          )}
        </div>

        {/* Footer Modal dengan Kontrol Aksi */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span className="text-[11px] text-slate-500">
            {isZoomed ? "Klik gambar untuk memperkecil" : "Klik gambar untuk memperbesar"}
          </span>

          <div className="flex items-center gap-2">
            {resolvedUrl && !errorMsg && !isLoading && (
              <>
                <button
                  type="button"
                  onClick={() => setIsZoomed((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isZoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
                  {isZoomed ? "Kecilkan" : "Perbesar"}
                </button>

                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                  title="Buka dokumen di tab browser baru"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Buka Tab Baru
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-1.5 font-semibold text-white hover:bg-slate-800"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
