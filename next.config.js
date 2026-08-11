import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(process.cwd()),
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
