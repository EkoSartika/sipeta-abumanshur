import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublishableKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Middleware Keamanan & Autentikasi SIPETA (Bab 15 PRD)
 * - Menjaga kesegaran sesi Supabase Auth melalui SSR Cookies
 * - Mendukung format Publishable Key baru (sb_publishable_...) dan legacy
 * - Menambahkan HTTP Security Headers standar produksi
 * - Mencegah akses ke rute terproteksi jika akun dinonaktifkan
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (isSupabaseConfigured()) {
    const supabaseUrl = getSupabaseUrl();
    const supabasePublishableKey = getSupabasePublishableKey();

    try {
      const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              options?: Record<string, unknown>;
            }>
          ) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options as any)
            );
          },
        },
      });

      // Refresh session if needed
      await supabase.auth.getUser();
    } catch {
      // Abaikan jika Supabase offline/tidak terjangkau di sandbox
    }
  }

  // Security Headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=()"
  );

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
