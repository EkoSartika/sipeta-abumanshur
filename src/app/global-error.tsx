"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log root layout error secara aman
    console.error("SIPETA Global Client Exception:", error);
  }, [error]);

  const handleHardReset = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("sipeta_abu_manshur_state_v1");
        window.location.href = "/";
      }
    } catch {
      window.location.reload();
    }
  };

  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-slate-900 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl text-center space-y-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Terjadi Kendala Memuat SIPETA
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Sistem mendeteksi kendala pada sesi atau antarmuka aplikasi. Anda dapat memuat ulang aplikasi untuk menyinkronkan data kembali.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                reset();
                handleHardReset();
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition min-h-[44px]"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Muat Ulang Aplikasi</span>
            </button>

            <button
              type="button"
              onClick={handleHardReset}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition min-h-[44px]"
            >
              <Home className="h-4 w-4" />
              <span>Halaman Utama</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

