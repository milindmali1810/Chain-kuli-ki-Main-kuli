import type { NextConfig } from "next";

// Standard browser protections, applied to every page. (No Content-Security-Policy: Next.js uses inline scripts.)
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // the app cannot be put inside another site's frame (clickjacking)
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
