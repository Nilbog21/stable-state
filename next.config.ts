import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/barn/[slug]/guide': ['./USER_GUIDE_*.md'],
  },
};

export default nextConfig;
