import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/barn/[slug]/guide': ['./USER_GUIDE_*.md'],
    '/terms': ['./TERMS_OF_SERVICE.md'],
    '/privacy': ['./PRIVACY_POLICY.md'],
    '/about': ['./CHANGELOG.md'],
    '/changelog': ['./CHANGELOG.md'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
  },
};

export default nextConfig;
