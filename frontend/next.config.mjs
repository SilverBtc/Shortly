/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["remotion", "@remotion/player"],
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }, { protocol: "http", hostname: "127.0.0.1" }],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
