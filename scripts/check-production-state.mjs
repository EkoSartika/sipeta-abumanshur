import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(url, key);

async function main() {
  console.log("=== CHECKING PRODUCTION STATE READ-ONLY ===");
  
  // 1. Profiles
  const { data: profiles, error: errProf } = await supabase
    .from("profiles")
    .select("id, email, username, role, nama_lengkap, is_active")
    .order("role");
  console.log("Profiles count:", profiles?.length, "error:", errProf?.message);
  if (profiles) {
    profiles.forEach(p => console.log(`- [${p.role}] username: ${p.username} | email: ${p.email} | nama: ${p.nama_lengkap} | active: ${p.is_active}`));
  }

  // 2. Santri
  const { count: santriCount, error: errSantri } = await supabase
    .from("santri")
    .select("*", { count: "exact", head: true });
  console.log("Santri count:", santriCount, "error:", errSantri?.message);

  // 3. Tahun Ajaran
  const { data: tahunAjaran, error: errTa } = await supabase
    .from("tahun_ajaran")
    .select("*");
  console.log("Tahun Ajaran count:", tahunAjaran?.length, "error:", errTa?.message);
  if (tahunAjaran && tahunAjaran.length > 0) {
    console.log(tahunAjaran);
  }

  // 4. Profil Pesantren
  const { data: profil, error: errProfil } = await supabase
    .from("profil_pesantren")
    .select("*");
  console.log("Profil Pesantren count:", profil?.length, "error:", errProfil?.message);
  if (profil && profil.length > 0) {
    console.log("Profil row:", profil[0]);
  }

  // 5. Transaksi / Tagihan
  const { count: txCount, error: errTx } = await supabase
    .from("transaksi")
    .select("*", { count: "exact", head: true });
  console.log("Transaksi count:", txCount, "error:", errTx?.message);

  // 6. Agenda & Pengumuman
  const { count: agendaCount, error: errAgenda } = await supabase
    .from("agenda")
    .select("*", { count: "exact", head: true });
  console.log("Agenda count:", agendaCount, "error:", errAgenda?.message);

  const { count: pengumumanCount, error: errPengumuman } = await supabase
    .from("pengumuman")
    .select("*", { count: "exact", head: true });
  console.log("Pengumuman count:", pengumumanCount, "error:", errPengumuman?.message);
}

main().catch(console.error);
