"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2 } from "lucide-react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("Invalid credentials or unavailable auth service");
      const pair = await response.json() as { access_token: string; refresh_token: string };
      window.localStorage.setItem("sentinel_access_token", pair.access_token);
      window.localStorage.setItem("sentinel_refresh_token", pair.refresh_token);
      router.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-slate-50"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/80 p-8 shadow-2xl shadow-indigo-950/40 backdrop-blur-xl"><div className="mb-8 flex items-center gap-3"><ShieldCheck className="h-9 w-9 text-indigo-400" /><div><h1 className="text-2xl font-bold">Sentinel</h1><p className="text-sm text-slate-400">Fraud intelligence command center</p></div></div><form onSubmit={submit} className="space-y-5"><label className="block text-sm text-slate-300">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none ring-indigo-500 focus:ring-2" /></label><label className="block text-sm text-slate-300">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none ring-indigo-500 focus:ring-2" /></label>{error && <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}<button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-3 font-semibold transition hover:bg-indigo-400 disabled:opacity-60">{loading && <Loader2 className="h-4 w-4 animate-spin" />}Sign in</button></form></div></main>;
}
