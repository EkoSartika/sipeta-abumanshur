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
      roleBadge="Portal Bendahara Pesantren"
      title="Portal Masuk Bendahara"
      subtitle="Verifikasi pembayaran tagihan SPP, verifikasi top-up uang saku, pencatatan penyerahan, dan ledger"
      identifierLabel="Username Akun Bendahara"
      identifierPlaceholder="contoh: bendahara01"
      identifierHelp="Gunakan username akun internal Anda (tidak menggunakan email pribadi)."
    />
  );
}
