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

  // Security headers to prevent common web vulnerabilities
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: [
          {
            // Prevent clickjacking attacks
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            // Prevent MIME type sniffing
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Control referrer information sent with requests
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Enable XSS filtering in older browsers
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            // Restrict browser features/APIs
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
          {
            // Enforce HTTPS for 1 year
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            // Content Security Policy
            // Note: 'unsafe-inline' and 'unsafe-eval' are needed for Next.js
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://vercel.live https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.hyperliquid.xyz https://api.coinbase.com https://api.pro.coinbase.com https://api.exchange.coinbase.com https://advanced-trade-ws.coinbase.com https://api.stripe.com https://api.openai.com https://api.anthropic.com https://api.deepseek.com https://generativelanguage.googleapis.com https://api.x.ai https://dashscope.aliyuncs.com wss://*.supabase.co",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
