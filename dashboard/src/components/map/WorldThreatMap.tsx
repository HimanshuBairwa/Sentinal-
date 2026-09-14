"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { GeoProjection, GeoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";

export type MapThreat = {
  id: string;
  lat: number;
  lon: number;
  score: number;
  action: string;
  label?: string;
};

type CountryFeature = Feature<Geometry, { name: string }>;

/**
 * GLOBE — real-geometry world map (Natural Earth projection, 110m atlas).
 *
 * PERFORMANCE ARCHITECTURE (this map renders inside a 1.4s live-tick app):
 * - Country geometry is fetched ONCE, then each country's SVG path string
 *   is computed ONCE and cached. Ticks re-render markers only — the 177
 *   landmass paths are memoized stable strings (the #1 lag source before).
 * - The map is wrapped in React.memo with a custom comparator that ignores
 *   parent re-renders unless the threat set actually changed (identity
 *   changes every tick; content rarely does).
 * - Threat markers are sorted+cached; projection is applied once per marker.
 * - All continuous animation (halos, radar, arcs) is SVG-native SMIL —
 *   zero JS per frame, composited off the main thread.
 */

// ---------------------------------------------------------------------------
// Module-level caches (shared across instances, computed once per session)
// ---------------------------------------------------------------------------

let atlasCache: CountryFeature[] | null = null;
let atlasPromise: Promise<CountryFeature[]> | null = null;

const projection: GeoProjection = geoNaturalEarth1();
const geoPathFactory: GeoPath = geoPath(projection);

const countryPathCache = new Map<CountryFeature, string>();
function countryPath(c: CountryFeature): string {
  let d = countryPathCache.get(c);
  if (d === undefined) {
    d = geoPathFactory(c) ?? "";
    countryPathCache.set(c, d);
  }
  return d;
}

const spherePath = geoPathFactory({ type: "Sphere" } as never) ?? "";
const graticulePath = geoPathFactory(geoGraticule10()) ?? "";

function loadAtlas(): Promise<CountryFeature[]> {
  if (atlasCache) return Promise.resolve(atlasCache);
  if (!atlasPromise) {
    atlasPromise = fetch("/geo/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as {
          features: CountryFeature[];
        };
        atlasCache = fc.features;
        return fc.features;
      })
      .catch(() => {
        atlasPromise = null; // allow retry on transient failure
        return [] as CountryFeature[];
      });
  }
  return atlasPromise;
}

// ---------------------------------------------------------------------------
// Map component
// ---------------------------------------------------------------------------

function projectPoint(lat: number, lon: number): [number, number] {
  return (projection([lon, lat]) ?? [0, 0]) as [number, number];
}

const size = (() => {
  const bounds = geoPathFactory.bounds({ type: "Sphere" } as never);
  const w = bounds[1][0] - bounds[0][0];
  const h = bounds[1][1] - bounds[0][1];
  return { w, h, x: bounds[0][0], y: bounds[0][1] };
})();

const radarCenter = { x: size.x + size.w / 2, y: size.y + size.h / 2 };

function WorldThreatMapImpl({
  threats,
  selectedId,
  onSelect,
  className,
}: {
  threats: MapThreat[];
  selectedId?: string | null;
  onSelect?: (t: MapThreat) => void;
  className?: string;
}) {
  const [countries, setCountries] = useState<CountryFeature[] | null>(atlasCache);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    if (atlasCache) return;
    let cancelled = false;
    void loadAtlas().then((features) => {
      if (!cancelled) setCountries(features);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sort by score so highest threats paint on top; stable via useMemo.
  const sorted = useMemo(
    () => [...threats].sort((a, b) => a.score - b.score),
    [threats]
  );

  // Arcs: top threats converge on the highest-scoring target. Cached with
  // a cheap key so marker re-renders don't rebuild Béziers unless needed.
  const arcs = useMemo(() => {
    if (sorted.length < 2) return [];
    const target = sorted[sorted.length - 1];
    const [tx, ty] = projectPoint(target.lat, target.lon);
    return sorted.slice(-4, -1).reverse().map((t, i) => {
      const [sx, sy] = projectPoint(t.lat, t.lon);
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2 - Math.hypot(tx - sx, ty - sy) * 0.22 - 4;
      return {
        id: `arc-${t.id}`,
        d: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
        delay: i * 0.45,
        critical: t.score >= 60,
      };
    });
  }, [sorted]);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <svg
        viewBox={`${size.x} ${size.y} ${size.w} ${size.h}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-label="World threat map"
      >
        <defs>
          <radialGradient id="oceanGrad" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="60%" stopColor="#060b16" />
            <stop offset="100%" stopColor="#030712" />
          </radialGradient>
          <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#12233c" />
            <stop offset="100%" stopColor="#0d1a2e" />
          </linearGradient>
          <linearGradient id="radarBeam" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,211,238,0)" stopOpacity="0" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.35)" />
          </linearGradient>
          <filter id="arcGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Ocean + graticule: static paths computed once module-wide */}
        <path d={spherePath} fill="url(#oceanGrad)" />
        <path d={graticulePath} fill="none" stroke="rgba(56,189,248,0.10)" strokeWidth={0.35} />

        {/* Landmasses: paths cached per-country (computed once per session) */}
        {countries &&
          countries.map((c) => {
            const isHover = hovered === c.properties?.name;
            return (
              <path
                key={c.id}
                d={countryPath(c)}
                fill={isHover ? "#1e3a5f" : "url(#landGrad)"}
                stroke={isHover ? "rgba(56,189,248,0.45)" : "rgba(56,189,248,0.22)"}
                strokeWidth={isHover ? 0.5 : 0.3}
                onMouseEnter={() => setHovered(c.properties?.name)}
                onMouseLeave={() => setHovered(null)}
                style={{ transition: "fill 300ms, stroke 300ms" }}
              />
            );
          })}

        {/* Radar sweep — pure SMIL rotation, zero JS per frame */}
        <g opacity="0.5">
          <g>
            <path
              d={`M ${radarCenter.x} ${radarCenter.y} L ${size.x + size.w} ${radarCenter.y} A ${size.w / 2} ${size.h / 2} 0 0 0 ${radarCenter.x} ${size.y}`}
              fill="url(#radarBeam)"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${radarCenter.x} ${radarCenter.y}`}
                to={`360 ${radarCenter.x} ${radarCenter.y}`}
                dur="9s"
                repeatCount="indefinite"
              />
            </path>
          </g>
        </g>

        {/* Attack arcs — SMIL dash flow */}
        {arcs.map((a) => (
          <g key={a.id} filter="url(#arcGlow)">
            <path d={a.d} fill="none" stroke={a.critical ? "#f43f5e" : "#818cf8"} strokeWidth={0.7} opacity="0.5" />
            <path
              d={a.d}
              fill="none"
              stroke={a.critical ? "#fb7185" : "#a5b4fc"}
              strokeWidth={1.6}
              strokeDasharray="2 14"
              opacity="0.9"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="32"
                to="0"
                dur="2.2s"
                begin={`${a.delay}s`}
                repeatCount="indefinite"
              />
            </path>
          </g>
        ))}

        {/* Threat markers — the ONLY per-tick work, ~20 SVG nodes */}
        {sorted.map((t) => {
          const [x, y] = projectPoint(t.lat, t.lon);
          const critical = t.action === "BLOCK" || t.score >= 80;
          const high = t.score >= 60;
          const color = critical ? "#f43f5e" : high ? "#f97316" : "#eab308";
          const isSel = selectedId === t.id;
          return (
            <g
              key={t.id}
              onClick={() => onSelect?.(t)}
              className="cursor-pointer"
              filter="url(#softGlow)"
            >
              <circle cx={x} cy={y} r={2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.7}>
                <animate attributeName="r" values="2.5;12" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={x} cy={y} r={2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.7}>
                <animate attributeName="r" values="2.5;12" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
              </circle>
              {isSel && (
                <circle cx={x} cy={y} r={6} fill="none" stroke="#22d3ee" strokeWidth={1} strokeDasharray="2 2">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${x} ${y}`}
                    to={`360 ${x} ${y}`}
                    dur="6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle cx={x} cy={y} r={critical ? 1.6 : 1.2} fill={color} opacity={0.95}>
                <animate
                  attributeName="r"
                  values={critical ? "1.3;1.9;1.3" : "1.0;1.4;1.0"}
                  dur={critical ? "1.3s" : "2.6s"}
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx={x} cy={y} r={7} fill="transparent" />
              <title>{`${t.label ?? t.id} · ${t.action} · score ${t.score.toFixed(1)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Memoized export: skips re-render when the parent ticks unless the threat
 * SET changed (same-length, same-ids, same-scores = same render result).
 */
export const WorldThreatMap = memo(
  WorldThreatMapImpl,
  (prev, next) => {
    if (prev.selectedId !== next.selectedId) return false;
    if (prev.onSelect !== next.onSelect) return false;
    if (prev.className !== next.className) return false;
    if (prev.threats.length !== next.threats.length) return false;
    // Content-compare by identity of items (stable ids/scores).
    for (let i = 0; i < prev.threats.length; i++) {
      const a = prev.threats[i];
      const b = next.threats[i];
      if (a.id !== b.id || a.score !== b.score || a.action !== b.action) return false;
    }
    return true;
  }
);
