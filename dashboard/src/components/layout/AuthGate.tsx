"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("sentinel_access_token");
    if (!token && pathname !== "/login") {
      router.replace("/login");
      return;
    }
    queueMicrotask(() => setReady(true));
  }, [pathname, router]);

  if (!ready && pathname !== "/login") {
    return <div className="flex min-h-screen items-center justify-center bg-[#020617] text-slate-400">Checking session...</div>;
  }
  return <>{children}</>;
}
