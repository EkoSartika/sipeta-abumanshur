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
      subtitle="Pengelolaan administrasi data santri, akun wali mandiri, master kelas, asrama, dan perpindahan penempatan"
      identifierLabel="Username Staf Tata Usaha"
      identifierPlaceholder="contoh: tu01"
      identifierHelp="Gunakan username internal resmi staf Tata Usaha Anda."
    />
  );
}
