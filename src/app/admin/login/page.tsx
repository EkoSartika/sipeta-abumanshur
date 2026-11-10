import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Pengasuh Pondok — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Pengasuh Pondok Pesantren Modern Abu Manshur untuk pengawasan terpadu.",
};

export default function AdminLoginPage() {
  return (
    <RoleLoginView
      expectedRole="admin"
      title="Portal Masuk Pengasuh Pondok"
      identifierLabel="Username Pengasuh Pondok"
      identifierPlaceholder="contoh: pengasuh"
    />
  );
}
