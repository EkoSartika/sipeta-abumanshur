import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Asatidz & Pembina — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Asatidz dan Pembina Asrama Pondok Pesantren Modern Abu Manshur.",
};

export default function AsatidzLoginPage() {
  return (
    <RoleLoginView
      expectedRole="pengelola"
      title="Portal Masuk Asatidz"
      identifierLabel="Username Asatidz"
      identifierPlaceholder="contoh: asatidz01"
    />
  );
}

