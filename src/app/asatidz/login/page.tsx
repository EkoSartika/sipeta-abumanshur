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
      roleBadge="Portal Asatidz & Pembina"
      title="Portal Masuk Asatidz"
      subtitle="Pencatatan perkembangan mengaji, setoran tahfidz Al-Qur'an, pembinaan kedisiplinan, dan prestasi santri"
      identifierLabel="Username Asatidz / Pembina"
      identifierPlaceholder="contoh: asatidz01"
      identifierHelp="Gunakan username akun asatidz/musyrif Anda (tanpa email)."
    />
  );
}
