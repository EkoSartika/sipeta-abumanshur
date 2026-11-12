import type { Metadata } from "next";
import "./globals.css";
import { SipetaProvider } from "@/lib/store/sipeta-context";

export const preferredRegion = "sin1";

export const metadata: Metadata = {
  metadataBase: new URL("https://sipetaabumanshur.vercel.app"),
  title: "SIPETA — Sistem Informasi Pelayanan Terpadu | PP Modern Abu Manshur",
  description:
    "Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur: Administrasi, Pembayaran & Cicilan, Transparansi Uang Saku (+Foto Penyerahan), Mengaji, Tahfidz, Prestasi, dan Kedisiplinan Santri.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "SIPETA — PP Modern Abu Manshur",
    description: "Sistem Informasi Pelayanan Terpadu Pondok Pesantren Modern Abu Manshur Cirebon",
    url: "https://sipetaabumanshur.vercel.app",
    siteName: "SIPETA",
    locale: "id_ID",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <SipetaProvider>{children}</SipetaProvider>
      </body>
    </html>
  );
}

