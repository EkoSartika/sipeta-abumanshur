import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const preferredRegion = "sin1";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true, message: "Sesi server berhasil dibersihkan." });

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    } catch {
      // Abaikan jika Supabase offline di sandbox
    }
  }

  // 1. Hapus seluruh cookie autentikasi yang terbaca dari request masuk
  // (termasuk chunked cookies sb-*-auth-token.0, sb-*-auth-token.1, dan HttpOnly cookies)
  const reqCookies = request.cookies.getAll();
  for (const c of reqCookies) {
    if (c.name.startsWith("sb-") || c.name.includes("supabase") || c.name.startsWith("sipeta")) {
      response.cookies.set(c.name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      response.cookies.delete(c.name);
    }
  }

  // 2. Periksa juga cookie store Next.js untuk memastikan sinkronisasi SSR
  try {
    const cookieStore = await cookies();
    const storedCookies = cookieStore.getAll();
    for (const c of storedCookies) {
      if (c.name.startsWith("sb-") || c.name.includes("supabase") || c.name.startsWith("sipeta")) {
        response.cookies.set(c.name, "", {
          path: "/",
          maxAge: 0,
          expires: new Date(0),
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
        response.cookies.delete(c.name);
      }
    }
  } catch {
    // Abaikan jika konteks cookieStore tidak tersedia
  }

  // 3. Fallback nama cookie standar
  const standardNames = [
    "sb-access-token",
    "sb-refresh-token",
    "sipeta_session",
    "supabase-auth-token",
  ];
  for (const name of standardNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.delete(name);
  }

  return response;
}
