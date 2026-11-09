import type { Metadata } from "next";
import { RoleLoginView } from "@/components/auth/role-login-view";

export const metadata: Metadata = {
  title: "Portal Masuk Orang Tua / Wali Santri — SIPETA PP Modern Abu Manshur",
  description: "Pintu masuk resmi Orang Tua / Wali Santri Pondok Pesantren Modern Abu Manshur.",
};

export default function WaliLoginPage() {
  return (
    <RoleLoginView
      expectedRole="wali"
      roleBadge="Portal Orang Tua / Wali Santri"
      title="Portal Masuk Wali Santri"
      subtitle="Akses informasi tagihan, pembayaran SPP, transparansi uang saku, dan perkembangan santri"
      identifierLabel="Nomor Induk Santri (NIS)"
      identifierPlaceholder="contoh: 202401001"
      identifierHelp="Gunakan NIS santri sebagai username dan kata sandi yang telah dibagikan."
      isNis={true}
    />
  );
}

