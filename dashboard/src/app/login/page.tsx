"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Loader2, Eye, EyeOff, AlertCircle, Globe2, Zap, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "../../components/ui/Toast";
import { BrandMark } from "../../components/brand/BrandMark";

const configuredAPIURL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

function getAPIURL(): string {
  if (configuredAPIURL && configuredAPIURL !== "http://localhost:8080") return configuredAPIURL;
  if (typeof window === "undefined") return configuredAPIURL || "http://localhost:8080";
  const { protocol, hostname } = window.location;
  if (hostname.includes("-3000.")) return `${protocol}//${hostname.replace("-3000.", "-8080.")}`;
  return `${protocol}//${hostname}:8080`;
}

const FEATURES = [
  {
    icon: Zap,
    title: "Sub-100ms decisions",
    text: "Deterministic rules, velocity features and gradient-boosted ML scored in parallel.",
  },
  {
    icon: Globe2,
    title: "Global telemetry",
    text: "Every auth event streams through Kafka into ClickHouse for live analytics.",
  },
  {
    icon: Lock,
    title: "Zero-trust identity",
    text: "RS256-verified JWTs, refresh-token rotation with reuse detection, session families.",
  },
];

/** Subtle starfield behind the auth form — shared canvas particles. */
function LoginStarfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let running = true;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      canvas.width = (rect?.width ?? window.innerWidth / 2) * DPR;
      canvas.height = (rect?.height ?? window.innerHeight) * DPR;
    };
    resize();
    const stars = Array.from({ length: 46 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.1 * DPR + 0.3,
      tw: Math.random() * Math.PI * 2,
      sp: 0.008 + Math.random() * 0.02,
    }));
    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.tw += s.sp;
        const a = 0.22 + Math.abs(Math.sin(s.tw)) * 0.5;
        ctx.fillStyle = `rgba(125, 211, 252, ${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onVis = () => {
      running = document.visibilityState === "visible";
      if (running) raf = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-50"
      aria-hidden="true"
    />
  );
}

export default function LoginPage() {
  const { toast } = useToast();
  // True when no backend is reachable (e.g. public demo deploy): any
  // credentials are accepted so the full experience is explorable.
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const api = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
      const base = api && api !== "http://localhost:8080"
        ? api
        : typeof window !== "undefined"
          ? `${window.location.protocol}//${window.location.hostname}:8080`
          : "http://localhost:8080";
      try {
        const controller = new AbortController();
        const t = window.setTimeout(() => controller.abort(), 2500);
        await fetch(`${base}/api/v1/auth/public-key`, { signal: controller.signal, cache: "no-store" });
        window.clearTimeout(t);
        if (!cancelled) setDemoMode(false); // any response = real auth present
      } catch {
        if (!cancelled) setDemoMode(true);
      }
    };
    void probe();
    return () => { cancelled = true; };
  }, []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live password-policy meter (register mode only) — feedback BEFORE submit,
  // so users see exactly what's missing instead of a generic 400.
  const policy = useMemo(() => ({
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':",.<>/?~`|\\]/.test(password),
  }), [password]);
  const policyMet = Object.values(policy).filter(Boolean).length;
  const canSubmit = mode === "login" || policyMet === 5;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (demoMode) {
        // Demo deploy: mint a local session so the full product is explorable.
        const demoEmail = email || "demo@sentinel.io";
        window.localStorage.setItem("sentinel_access_token", `demo-${Date.now()}`);
        window.localStorage.setItem("sentinel_refresh_token", `demo-${Date.now()}`);
        window.localStorage.setItem("sentinel_demo_user", demoEmail);
        toast({ kind: "info", title: "Demo mode", message: "Backend offline — exploring with simulated live telemetry." });
        // Hard navigation: static hosts serve the next page as a fresh HTML
        // document — no client-router RSC fetches that can silently fail.
        window.location.replace("/");
        return;
      }
      if (mode === "register") {
        const reg = await fetch(`${getAPIURL()}/api/v1/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, full_name: fullName }),
        });
        if (!reg.ok) {
          const text = await reg.text().catch(() => "");
          throw new Error(text || "Registration failed — password must be 12+ chars with upper/lower/digit/special");
        }
      }
      const response = await fetch(`${getAPIURL()}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("Invalid credentials or unavailable auth service");
      const pair = await response.json() as { access_token: string; refresh_token: string };
      window.localStorage.setItem("sentinel_access_token", pair.access_token);
      window.localStorage.setItem("sentinel_refresh_token", pair.refresh_token);
      toast({ kind: "success", title: mode === "login" ? "Welcome back" : "Account created", message: "Establishing secure telemetry uplink…" });
      window.location.replace("/");
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Authentication failed";
      setError(msg);
      toast({ kind: "danger", title: "Authentication failed", message: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen bg-[#020617] text-slate-50">
      {/* Ambient background */}
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[50%] w-[50%] animate-[aurora_14s_ease-in-out_infinite_alternate] rounded-full bg-indigo-600/20 blur-[80px] will-change-transform" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] animate-[aurora_18s_ease-in-out_infinite_alternate-reverse] rounded-full bg-cyan-600/15 blur-[80px] will-change-transform" />

      {/* Left panel: brand story */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/5 p-12 lg:flex">
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10">
          <div className="relative">
            {/* Expanding reticle rings behind the brand mark */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="reticle-ring absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/25"
                  style={{ animationDelay: `${i * 1.13}s` }}
                />
              ))}
            </div>
            <div className="relative flex items-center gap-3">
              <BrandMark size={44} />
              <div>
                <h1
                  className="glitch text-2xl font-bold tracking-wide"
                  data-text="SENTINEL"
                >
                  <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent">SENTINEL</span>
                </h1>
                <p className="text-xs text-slate-500">Fraud Intelligence Command Center</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
            className="max-w-md text-4xl font-bold leading-tight tracking-tight"
          >
            Stop fraud{" "}
            <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent">
              before it happens.
            </span>
          </motion.h2>

          {/* HUD tick ruler under the headline — instrument-panel flavor */}
          <div className="hud-ticks-x w-64 opacity-80" aria-hidden="true" />

          <div className="space-y-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.12, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                whileHover={{ x: 6 }}
                className="group/feat flex items-start gap-4"
              >
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 transition-all duration-300 group-hover/feat:border-cyan-500/40 group-hover/feat:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                  <f.icon className="h-5 w-5 text-cyan-400 transition-transform duration-300 group-hover/feat:scale-110" />
                </div>
                <div>
                  <p className="font-semibold text-slate-100">{f.title}</p>
                  <p className="mt-0.5 max-w-sm text-sm text-slate-400">{f.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="relative z-10 font-mono text-[11px] text-slate-600">
          gateway · auth-service · risk-engine · analytics-service · alert-service
        </p>
      </div>

      {/* Login-side constellation canvas — subtle starfield behind the form */}
      <LoginStarfield />

      {/* Right panel: auth form */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={40} />
            <div>
              <h1 className="text-xl font-bold tracking-wide">
                <span className="bg-gradient-to-r from-cyan-300 to-indigo-400 bg-clip-text text-transparent">SENTINEL</span>
              </h1>
              <p className="text-xs text-slate-500">Fraud Intelligence Command Center</p>
            </div>
          </div>

          <div className="glass-panel-premium boot-flicker rounded-2xl p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">
                {mode === "login" ? "Welcome back" : "Create your account"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === "login"
                  ? "Sign in to the command center"
                  : "The first account created becomes the platform admin"}
              </p>
            </div>

            <div className="mb-5 flex rounded-lg border border-white/10 bg-black/20 p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                    mode === m ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "login" ? "Sign in" : "Register"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-5">
              {mode === "register" && (
                <label className="block text-sm text-slate-300">
                  Full name
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none transition-colors focus:ring-2 focus:ring-cyan-500/60"
                  />
                </label>
              )}
              <label className="block text-sm text-slate-300">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 outline-none transition-colors ring-indigo-500/50 focus:ring-2 focus:ring-cyan-500/60"
                />
              </label>

              <label className="block text-sm text-slate-300">
                Password
                <div className="relative mt-2">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 pr-10 outline-none transition-colors focus:ring-2 focus:ring-cyan-500/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-300"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {mode === "register" && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {([
                      ["12+ chars", policy.length],
                      ["Uppercase", policy.upper],
                      ["Lowercase", policy.lower],
                      ["Digit", policy.digit],
                      ["Special", policy.special],
                    ] as const).map(([label, ok], i) => (
                      <motion.span
                        key={label}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + i * 0.05 }}
                        className={`flex-1 rounded-md border px-1.5 py-1 text-center text-[10px] font-medium transition-all duration-300 ${
                          ok
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-white/10 bg-white/5 text-slate-500"
                        }`}
                      >
                        {ok ? "✓ " : ""}{label}
                      </motion.span>
                    ))}
                  </div>
                  {/* Strength bar — fills as requirements are met */}
                  <div className="h-1 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      className={`h-full rounded-full transition-colors duration-500 ${
                        policyMet === 5 ? "bg-gradient-to-r from-emerald-500 to-cyan-400"
                        : policyMet >= 3 ? "bg-gradient-to-r from-amber-500 to-orange-400"
                        : "bg-gradient-to-r from-rose-500 to-rose-400"
                      }`}
                      initial={{ width: "0%" }}
                      animate={{ width: `${(policyMet / 5) * 100}%` }}
                      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </motion.p>
              )}

              <button
                disabled={loading || !canSubmit}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-3 font-semibold text-white transition-all hover:from-cyan-400 hover:to-indigo-400 disabled:opacity-60"
              >
                {/* sheen sweep */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? mode === "login" ? "Authenticating…" : "Creating account…"
                  : mode === "login" ? "Sign in" : "Create account & sign in"}
                {!loading && <ShieldCheck className="h-4 w-4" />}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center font-mono text-[11px] text-slate-600">
            RS256 · rotating refresh tokens · session revocation
          </p>
        </motion.div>
      </div>
    </main>
  );
}
