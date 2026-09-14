"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "../brand/BrandMark";

/**
 * Client-side session gate.
 *
 * Static-export hardened: uses a HARD navigation (window.location.replace)
 * instead of the Next client router. On static hosts (Vercel static, GitHub
 * Pages), client-router navigations fetch RSC payload files — anything in
 * front of the deployment that interferes with those fetches (Vercel
 * Authentication, proxies, CDNs) silently breaks the redirect and leaves the
 * user stuck on the loading screen. A full page load always works.
 *
 * - No token → immediate hard redirect to /login/ (trailing slash matches
 *   the static export's file layout).
 * - Safety net: if we're still here after 3s, force the navigation again.
 * - Token present → children render after one microtask frame.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("sentinel_access_token");
    if (!token) {
      // Hard navigation — works on every static host, no RSC fetch involved.
      window.location.replace("/login/");
      return;
    }
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // Safety net: if the hard redirect hasn't unloaded this page yet (slow
  // network, blocked navigation), force it again rather than spinning forever.
  useEffect(() => {
    const token = window.localStorage.getItem("sentinel_access_token");
    if (!token) {
      const t = setTimeout(() => window.location.replace("/login/"), 3_000);
      return () => clearTimeout(t);
    }
  }, []);

  if (!ready && pathname !== "/login" && pathname !== "/login/") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#020617]">
        <BrandMark size={56} />
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Redirecting to sign-in…
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
