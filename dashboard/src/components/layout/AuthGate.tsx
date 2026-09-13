"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "../brand/BrandMark";

/**
 * Client-side session gate.
 * - Redirects to /login (via the router, in an effect) when no token exists.
 * - Readiness is event-driven: it flips only after the redirect *succeeds*,
 *   which avoids both a flash of protected content and effect-setState.
 * - Token validity itself is enforced by the API layer (401 → refresh →
 *   login); this gate only checks presence to avoid a redirect loop.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("sentinel_access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, [pathname, router]);

  if (!ready && pathname !== "/login") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#020617]">
        <BrandMark size={56} />
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Restoring session…
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
