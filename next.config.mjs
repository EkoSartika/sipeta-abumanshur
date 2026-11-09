/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jvhzrhfzkjqzlhsvvbgy.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  async redirects() {
    // Redirect permanen domain lama ke domain baru sipetaabumanshur.vercel.app.
    // Diatur aktif saat ENABLE_DOMAIN_REDIRECT === "true".
    // Proteksi zero-downtime: domain lama tetap melayani traffic operasional (200 OK)
    // sampai domain baru diverifikasi dan terhubung di dashboard Vercel.
    if (process.env.ENABLE_DOMAIN_REDIRECT === "true") {
      return [
        {
          source: "/:path*",
          has: [
            {
              type: "host",
              value: "sipeta-abumanshur.vercel.app",
            },
          ],
          destination: "https://sipetaabumanshur.vercel.app/:path*",
          permanent: true,
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
