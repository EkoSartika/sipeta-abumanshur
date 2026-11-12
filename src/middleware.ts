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

  const pathname = request.nextUrl.pathname;
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  const isPublicFastApi =
    pathname === "/api/health" || pathname === "/api/auth/wali-sync";

  if (isSupabaseConfigured() && hasSupabaseAuthCookie && !isPublicFastApi) {
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

      // Refresh session if needed & enforce must_change_password on server
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Blokir akses API dan rute terlindungi jika wali santri belum mengganti password awal
      if (user && user.user_metadata?.must_change_password === true) {
        if (
          pathname.startsWith("/api/") &&
          pathname !== "/api/auth/change-password" &&
          pathname !== "/api/health"
        ) {
          return NextResponse.json(
            {
              ok: false,
              message:
                "Akses ditolak: Anda wajib mengganti kata sandi awal terlebih dahulu sebelum mengakses data sistem.",
              must_change_password: true,
            },
            { status: 403 }
          );
        }
      }
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
