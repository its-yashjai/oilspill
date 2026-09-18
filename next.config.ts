import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    // Suppress noisy optional native binding warnings from moss-core
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /@moss-dev\/moss-core/ },
      { message: /Can't resolve.*moss-core/ },
    ];
    return config;
  },
};
export default nextConfig;
