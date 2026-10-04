import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 手相画像 (最大 5MB) を Server Action で受け取るため
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
