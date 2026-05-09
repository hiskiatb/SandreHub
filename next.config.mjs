/** @type {import('next').Next.jsConfig} */
const nextConfig = {
  // Turbopack alias support
  experimental: {
    turbo: {
      resolveAlias: {
        '@/lib/supabase': './lib/supabase.js',
      },
    },
  },
};

export default nextConfig;