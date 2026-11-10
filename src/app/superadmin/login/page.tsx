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
      title="Portal Masuk Superadmin"
      identifierLabel="Email atau Username Superadmin"
      identifierPlaceholder="sipetaabumanshur@gmail.com"
    />
  );
}

