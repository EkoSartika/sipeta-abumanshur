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
};

export default nextConfig;
