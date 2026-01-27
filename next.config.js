/** @type {import('next').NextConfig} */
const nextConfig = {
  // Experimental features to improve stability
  experimental: {
    // Reduce memory usage
    optimizePackageImports: ['@supabase/supabase-js'],
    // Enable instrumentation for startup checks
    instrumentationHook: true,
  },
  // Allow production builds to succeed even with ESLint warnings
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Enable sourcemaps in production to reveal real stack traces
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;
