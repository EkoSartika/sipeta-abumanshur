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
  },
};

export default nextConfig;
