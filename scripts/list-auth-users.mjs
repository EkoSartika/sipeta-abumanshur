import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error("Error listing auth users:", error);
    return;
  }
  console.log(`Found ${data.users.length} auth users:`);
  for (const u of data.users) {
    console.log(`- ID: ${u.id} | Email: ${u.email} | Created: ${u.created_at} | Confirmed: ${u.email_confirmed_at}`);
  }
}

main().catch(console.error);
