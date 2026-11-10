import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Tata Usaha (TU) — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Bagian Tata Usaha (TU) Pondok Pesantren Modern Abu Manshur.",
};

export default function TuLoginPage() {
  return (
    <RoleLoginView
      expectedRole="tu"
      roleBadge="Portal Tata Usaha (TU)"
      title="Portal Masuk Tata Usaha (TU)"
      identifierLabel="Username Staf Tata Usaha"
      identifierPlaceholder="contoh: tu01"
    />
  );
}

