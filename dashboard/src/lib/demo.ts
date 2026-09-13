/**
 * DEMO MODE — self-contained live-data simulation for public deployments
 * (e.g. Vercel) where the Go/Python backend stack isn't running.
 *
 * When `NEXT_PUBLIC_API_URL` is unset AND the browser can't reach a gateway,
 * the dashboard engages demo mode: a deterministic, seeded generator streams
 * realistic fraud-decision events so every visualization (map, gauges, feed,
 * charts, toasts) runs with plausible data. All components consume it through
 * the same `AnalyticsEvent` shape as production data — zero special-casing
 * downstream.
 *
 * Design notes:
 * - Seeded PRNG (mulberry32): same sequence every load → stable screenshots,
 *   no hydration mismatches between server/client.
 * - Event timestamps are relative to *now*, generated on an interval, so the
 *   feed, map, and charts update live just like the real stream.
 * - Country/IP/user vocabularies and score distributions are modeled on the
 *   real seeded analytics data (see analytics-service/cmd/seed).
 */

export type DemoEvent = {
  id: string;
  event_id: string;
  event_type: string;
  user_id?: string;
  ip_address?: string;
  timestamp: string;
  action?: string;
  risk_score?: number;
  country_code?: string;
  country?: string;
};

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Vocabularies (modeled on the real seed data)
// ---------------------------------------------------------------------------

const COUNTRY_POOL: { code: string; name: string; weight: number }[] = [
  { code: "US", name: "United States", weight: 24 },
  { code: "GB", name: "United Kingdom", weight: 10 },
  { code: "IN", name: "India", weight: 9 },
  { code: "DE", name: "Germany", weight: 7 },
  { code: "BR", name: "Brazil", weight: 7 },
  { code: "CN", name: "China", weight: 6 },
  { code: "RU", name: "Russia", weight: 6 },
  { code: "NL", name: "Netherlands", weight: 5 },
  { code: "FR", name: "France", weight: 5 },
  { code: "SG", name: "Singapore", weight: 4 },
  { code: "JP", name: "Japan", weight: 4 },
  { code: "NG", name: "Nigeria", weight: 3 },
  { code: "VN", name: "Vietnam", weight: 3 },
  { code: "TR", name: "Turkey", weight: 2 },
  { code: "ID", name: "Indonesia", weight: 2 },
  { code: "AU", name: "Australia", weight: 2 },
  { code: "KR", name: "South Korea", weight: 2 },
  { code: "ZA", name: "South Africa", weight: 1 },
  { code: "MX", name: "Mexico", weight: 2 },
  { code: "CA", name: "Canada", weight: 3 },
];

const EVENT_TYPES: { type: string; weight: number }[] = [
  { type: "user.login", weight: 34 },
  { type: "payment.attempt", weight: 26 },
  { type: "user.register", weight: 12 },
  { type: "password.change", weight: 8 },
  { type: "card.linking", weight: 10 },
  { type: "profile.update", weight: 6 },
  { type: "withdrawal.request", weight: 4 },
];

const SUSPICIOUS_IP_PREFIX = ["45.132", "185.220", "91.219", "194.26", "62.171", "159.223", "51.15", "103.4"];
const NORMAL_IP_PREFIX = ["73.12", "82.44", "24.16", "98.211", "106.77", "119.42", "203.15", "58.6"];

function weightedPick<T extends { weight?: number; w?: number }>(items: T[], r: number): T {
  const wt = (item: T) => (item.w ?? item.weight ?? 1) as number;
  const total = items.reduce((s, i) => s + wt(i), 0);
  let acc = r * total;
  for (const item of items) {
    acc -= wt(item);
    if (acc <= 0) return item;
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

let seq = 0;

function generateEvent(rand: () => number): DemoEvent {
  const country = weightedPick(COUNTRY_POOL, rand());
  const eventType = weightedPick(EVENT_TYPES, rand());

  // Risk score: bimodal — most traffic is clean, a realistic tail is risky.
  const roll = rand();
  let score: number;
  if (roll < 0.62) score = 5 + rand() * 25;        // clean
  else if (roll < 0.86) score = 30 + rand() * 25;  // review band
  else if (roll < 0.97) score = 55 + rand() * 25;  // challenge band
  else score = 80 + rand() * 19;                    // block band

  const action =
    score >= 80 ? "BLOCK" : score >= 55 ? "CHALLENGE" : score >= 35 ? "REVIEW" : "ALLOW";

  // Risky events get datacenter/VPS-style IPs; clean ones residential.
  const prefix = score > 55
    ? SUSPICIOUS_IP_PREFIX[Math.floor(rand() * SUSPICIOUS_IP_PREFIX.length)]
    : NORMAL_IP_PREFIX[Math.floor(rand() * NORMAL_IP_PREFIX.length)];
  const ip = `${prefix}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}`;

  seq += 1;
  const id = `demo-${Date.now().toString(36)}-${seq}`;

  return {
    id,
    event_id: id,
    event_type: eventType.type,
    user_id: `usr_${Math.floor(rand() * 900_000 + 100_000).toString(36)}`,
    ip_address: ip,
    timestamp: new Date().toISOString(),
    action,
    risk_score: Math.round(score * 10) / 10,
    country_code: country.code,
    country: country.name,
  };
}

/**
 * Generates a realistic backfill of `count` events spread over the past
 * `minutes` — used to populate charts/feed instantly on first paint.
 */
export function demoBackfill(count: number, minutes = 30, seed = 42): DemoEvent[] {
  const rand = mulberry32(seed);
  const now = Date.now();
  const events: DemoEvent[] = [];
  for (let i = count; i > 0; i--) {
    const e = generateEvent(rand);
    // Spread oldest → newest so the chart reads left-to-right.
    e.timestamp = new Date(now - (i / count) * minutes * 60_000).toISOString();
    events.push(e);
  }
  return events;
}

/**
 * Live stream: call on an interval (~1.2s) for a fresh event. Keeps its own
 * PRNG state so the sequence is continuous.
 */
const liveRand = mulberry32(1337);
export function demoTick(): DemoEvent {
  return generateEvent(liveRand);
}

/**
 * Demo-mode rules (mirror of the seeded rule set).
 */
export const DEMO_RULES = [
  {
    id: "demo-r1",
    rule_id: "RULE_VPN_BURST",
    name: "VPN + Transaction Burst",
    description: "Datacenter/VPN IP making 5+ payment attempts within 1 minute.",
    expression: "ip_is_vpn and v_payment_attempts_1m >= 5",
    score_contribution: 35,
    action: "CHALLENGE",
    is_enabled: true,
    priority: 80,
    hit_count: 1284,
    last_triggered_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: "demo-r2",
    rule_id: "RULE_VELOCITY_LOGIN",
    name: "Impossible Travel",
    description: "Successful logins from two countries > 8000 km apart within 10 minutes.",
    expression: "geo_distance_from_home_km > 8000 and v_country_hops_10m >= 2",
    score_contribution: 45,
    action: "BLOCK",
    is_enabled: true,
    priority: 95,
    hit_count: 317,
    last_triggered_at: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
  },
  {
    id: "demo-r3",
    rule_id: "RULE_NEWDEVICE_HIGHVALUE",
    name: "New Device + High Value",
    description: "Unseen device fingerprint attempting a transaction above 2× user average.",
    expression: "device_age_days < 1 and amount_vs_user_avg > 2",
    score_contribution: 30,
    action: "REVIEW",
    is_enabled: true,
    priority: 60,
    hit_count: 892,
    last_triggered_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: "demo-r4",
    rule_id: "RULE_TOR_LOGIN",
    name: "Tor Exit Node Login",
    description: "Any authentication attempt from a known Tor exit node.",
    expression: "ip_is_tor",
    score_contribution: 50,
    action: "BLOCK",
    is_enabled: true,
    priority: 99,
    hit_count: 56,
    last_triggered_at: new Date(Date.now() - 1000 * 60 * 27).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
  },
  {
    id: "demo-r5",
    rule_id: "RULE_CARD_TESTING",
    name: "Card Testing Pattern",
    description: "3+ distinct cards from one fingerprint within 5 minutes.",
    expression: "v_distinct_cards_5m >= 3",
    score_contribution: 40,
    action: "BLOCK",
    is_enabled: true,
    hit_count: 145,
    priority: 85,
    last_triggered_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
] as const;

/**
 * Demo geo rollup (top countries by volume) — mirrors the ClickHouse shape.
 */
export function demoGeo(): { country: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const c of COUNTRY_POOL) totals.set(c.code, Math.round(c.weight * 37 * (0.8 + mulberry32(c.code.charCodeAt(0) + c.code.charCodeAt(1))() * 0.4)));
  return [...totals.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count);
}
