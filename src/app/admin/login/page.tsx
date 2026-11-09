import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Admin Administrasi — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Bagian Administrasi Pondok Pesantren Modern Abu Manshur.",
};

export default function AdminLoginPage() {
  return (
    <RoleLoginView
      expectedRole="admin"
      roleBadge="Portal Admin Administrasi"
      title="Portal Masuk Administrasi"
      subtitle="Pengelolaan data santri, akun wali, penempatan asrama, kebijakan tagihan, dan pengumuman"
      identifierLabel="Username Akun Administrasi"
      identifierPlaceholder="contoh: admin01"
      identifierHelp="Gunakan username akun internal Anda (tidak menggunakan email pribadi)."
    />
  );
}
