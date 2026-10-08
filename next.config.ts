import type { NextConfig } from "next";
import path from "node:path";

/**
 * Static security headers.
 *
 * The content security policy is not set here: it is applied per request by
 * `src/proxy.ts`, which generates a fresh nonce so that the inline bootstrap
 * scripts Next.js emits are authorised individually while every other inline
 * script stays blocked.
 */
const isProduction = process.env.NODE_ENV === "production";

const config: NextConfig = {
  distDir: process.env.CLUB_E2E === "1" ? ".next-e2e" : ".next",
  devIndicators: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "nodemailer"],

  output: "standalone",
  poweredByHeader: false,

  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(process.cwd(), "src"),
    };

    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(isProduction
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default config;
