import type { NextConfig } from "next";

// Static-export mode for public deployments (Vercel root import, GitHub
// Pages, any static host). The dashboard is fully client-side, so
// `output: 'export'` yields a self-contained `out/` directory served as
// pure static files. Triggered by `npm run build:static` (sets NEXT_STATIC_EXPORT=1).
// Docker/CI use plain `next build` and get the standard server build.
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const } : {}),
  // The demo login stores a session in localStorage; static export prerenders
  // every route without a server. Trailing-slash file URLs (/login.html)
  // keep links working on every static host.
  ...(isStaticExport ? { trailingSlash: true } : {}),
};

export default nextConfig;
