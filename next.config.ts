import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.CLUB_E2E === "1" ? ".next-e2e" : ".next",
  devIndicators: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "nodemailer"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
