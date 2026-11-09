import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Superadmin — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk pimpinan dan penanggung jawab sistem terpadu SIPETA.",
};

export default function SuperadminLoginPage() {
  return (
    <RoleLoginView
      expectedRole="superadmin"
      roleBadge="Portal Superadmin (Pimpinan)"
      title="Portal Masuk Superadmin"
      subtitle="Tata kelola akun pengguna internal, rekening resmi pesantren, dan jejak audit sistem"
      identifierLabel="Email atau Username Superadmin"
      identifierPlaceholder="sipetaabumanshur@gmail.com"
      identifierHelp="Khusus akun Superadmin resmi pimpinan Pondok Pesantren Modern Abu Manshur."
    />
  );
}
