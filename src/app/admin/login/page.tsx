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
      roleBadge="Portal Pengasuh Pondok"
      title="Portal Masuk Pengasuh Pondok"
      subtitle="Pengawasan menyeluruh terhadap aktivitas santri, asrama, keuangan SPP, uang saku, capaian tahfidz, dan operasional staf"
      identifierLabel="Username Pengasuh Pondok"
      identifierPlaceholder="contoh: pengasuh"
      identifierHelp="Gunakan username akun resmi pimpinan / pengasuh pondok pesantren."
    />
  );
}
