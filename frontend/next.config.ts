import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const hrmsRouteBases = [
  "login",
  "accept-invite",
  "change-password",
  "attendance",
  "calendar",
  "history",
  "invites",
  "leave",
  "notifications",
  "people",
  "performance",
  "platform",
  "projects",
  "ratings",
  "requests",
  "settings",
  "tasks",
  "workload",
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/", destination: "/hrms" },
      ...hrmsRouteBases.flatMap((base) => [
        { source: "/" + base, destination: "/hrms/" + base },
        { source: "/" + base + "/:path*", destination: "/hrms/" + base + "/:path*" },
      ]),
    ];
  },
};

export default nextConfig;
