const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // fallbacks.document não é compatível com Next.js 15 App Router no next-pwa v5
  runtimeCaching: [
    // Static assets — cache first, never expire during session
    {
      urlPattern: /^\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    // Next.js image optimization
    {
      urlPattern: /^\/_next\/image\?.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-image',
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: 60 * 60 * 24, // 24 hours
        },
      },
    },
    // Read-only API endpoints — serve stale data while background-refreshing
    // Covers: /api/members, /api/meetings, /api/engagement, /api/members/absent, etc.
    {
      urlPattern: /^\/api\/(members|meetings|engagement|groups|health|member-tags).*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'api-data-cache',
        expiration: {
          maxEntries: 80,
          maxAgeSeconds: 60 * 60 * 6, // 6 hours
        },
      },
    },
    // Cron, auth, notifications, sync — always hit the network (no cache)
    {
      urlPattern: /^\/api\/(cron|auth|notifications|sync|attendance|webhooks).*/i,
      handler: 'NetworkOnly',
    },
    // Dashboard pages — NetworkFirst with generous offline fallback
    {
      urlPattern: /^\/(dashboard|pessoas|agenda|chamada|engajamento|configuracoes|conta|alertas)(\/.*)?$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 8,
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 8, // 8 hours
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  }
};

module.exports = withPWA(nextConfig);
