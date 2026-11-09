import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Pengelola Kepesantrenan — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Bagian Pengasuhan dan Kepesantrenan Pondok Pesantren Modern Abu Manshur.",
};

export default function PengelolaLoginPage() {
  return (
    <RoleLoginView
      expectedRole="pengelola"
      roleBadge="Portal Pengelola Kepesantrenan"
      title="Portal Masuk Pengelola"
      subtitle="Pencatatan mutaba'ah mengaji, setoran tahfidz Al-Qur'an, prestasi santri, dan pembinaan kedisiplinan"
      identifierLabel="Username Akun Pengelola"
      identifierPlaceholder="contoh: pengelola01"
      identifierHelp="Gunakan username akun internal Anda (tidak menggunakan email pribadi)."
    />
  );
}

