import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Bendahara Pesantren — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk Bagian Kebendaharaan dan Keuangan Pondok Pesantren Modern Abu Manshur.",
};

export default function BendaharaLoginPage() {
  return (
    <RoleLoginView
      expectedRole="bendahara"
      title="Portal Masuk Bendahara"
      identifierLabel="Username Akun Bendahara"
      identifierPlaceholder="contoh: bendahara01"
    />
  );
}

