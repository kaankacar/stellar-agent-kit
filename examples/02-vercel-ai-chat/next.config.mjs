/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pass workspace packages through Next's transpiler so ESM-only deps work cleanly.
  transpilePackages: [
    "@stellar-agent-kit/core",
    "@stellar-agent-kit/plugin-asset",
    "@stellar-agent-kit/plugin-data",
    "@stellar-agent-kit/plugin-defi",
    "@stellar-agent-kit/plugin-domain",
  ],
  experimental: {
    serverComponentsExternalPackages: ["@stellar/stellar-sdk"],
  },
};
export default nextConfig;
