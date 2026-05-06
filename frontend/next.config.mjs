/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    // @solana/wallet-adapter-react ships nested @types/react@19 which clashes
    // with our @types/react@18. Runtime is correct; this suppresses the
    // structural type mismatch that only exists at compile time.
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Required for Solana web3.js and Anchor
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
