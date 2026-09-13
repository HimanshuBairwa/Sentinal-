"use client";

import { useEffect, useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";
import type { GeoProjection, GeoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { motion } from "framer-motion";

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
 * GLOBE — a real-geometry world map (Natural Earth projection, 110m atlas)
 * with graticule, animated attack arcs, expanding signal halos, breathing
 * threat cores, and a sweeping radar beam. All animation is SVG-native SMIL
 * so it runs independently of React re-renders at 60fps even while the live
 * feed pushes updates.
 */
export function WorldThreatMap({
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
  const [countries, setCountries] = useState<CountryFeature[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    fetch("/geo/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as {
          features: CountryFeature[];
        };
        setCountries(fc.features);
      })
      .catch(() => setCountries([]));
  }, []);

  const projection: GeoProjection = useMemo(() => geoNaturalEarth1(), []);
  const path: GeoPath = useMemo(() => geoPath(projection), [projection]);

  const size = useMemo(() => {
    const bounds = path.bounds({ type: "Sphere" } as never);
    const w = bounds[1][0] - bounds[0][0];
    const h = bounds[1][1] - bounds[0][1];
    return { w, h, x: bounds[0][0], y: bounds[0][1] };
  }, [path]);

  const graticule = useMemo(() => path(geoGraticule10()) ?? "", [path]);
  const sphere = useMemo(() => path({ type: "Sphere" } as never) ?? "", [path]);

  // Sort by score so the highest-threat markers render on top.
  const sorted = useMemo(
    () => [...threats].sort((a, b) => a.score - b.score),
    [threats]
  );

  // Arcs: top threats converge on the single highest-scoring target.
  const arcs = useMemo(() => {
    if (sorted.length < 2) return [];
    const target = sorted[sorted.length - 1];
    const [tx, ty] = projection([target.lon, target.lat]) ?? [0, 0];
    return sorted.slice(-4, -1).reverse().map((t, i) => {
      const [sx, sy] = projection([t.lon, t.lat]) ?? [0, 0];
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2 - Math.hypot(tx - sx, ty - sy) * 0.22 - 4;
      return {
        id: `arc-${t.id}`,
        d: `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`,
        delay: i * 0.45,
        critical: t.score >= 60,
      };
    });
  }, [sorted, projection]);

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <svg
        viewBox={`${size.x} ${size.y} ${size.w} ${size.h}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-label="World threat map"
      >
        <defs>
          {/* Ocean depth gradient */}
          <radialGradient id="oceanGrad" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="60%" stopColor="#060b16" />
            <stop offset="100%" stopColor="#030712" />
          </radialGradient>
          {/* Landmass: subtle cyan sheen */}
          <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#12233c" />
            <stop offset="100%" stopColor="#0d1a2e" />
          </linearGradient>
          {/* Radar sweep beam */}
          <linearGradient id="radarBeam" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34,211,238,0)" stopOpacity="0" />
            <stop offset="100%" stopColor="rgba(34,211,238,0.35)" />
          </linearGradient>
          {/* Attack-arc glow */}
          <filter id="arcGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Threat halo pulse */}
          <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Ocean sphere */}
        <path d={sphere} fill="url(#oceanGrad)" />

        {/* Graticule — the fine lat/lon mesh, slow drifting opacity */}
        <path
          d={graticule}
          fill="none"
          stroke="rgba(56,189,248,0.10)"
          strokeWidth={0.35}
        />
        {countries && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            {/* Landmasses with hover highlighting */}
            {countries.map((c) => {
              const isHover = hovered === c.properties?.name;
              return (
                <path
                  key={c.id}
                  d={path(c) ?? ""}
                  fill={isHover ? "#1e3a5f" : "url(#landGrad)"}
                  stroke={isHover ? "rgba(56,189,248,0.45)" : "rgba(56,189,248,0.22)"}
                  strokeWidth={isHover ? 0.5 : 0.3}
                  onMouseEnter={() => setHovered(c.properties?.name)}
                  onMouseLeave={() => setHovered(null)}
                  className="transition-colors duration-300"
                />
              );
            })}
          </motion.g>
        )}

        {/* Radar sweep — conic beam rotating about the map center */}
        <g style={{ transformOrigin: "center" }} opacity="0.6">
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: `${size.x + size.w / 2}px ${size.y + size.h / 2}px` }}
          >
            <path
              d={`M ${size.x + size.w / 2} ${size.y + size.h / 2} L ${size.x + size.w} ${size.y + size.h / 2} A ${size.w / 2} ${size.h / 2} 0 0 0 ${size.x + size.w / 2} ${size.y}`}
              fill="url(#radarBeam)"
            />
          </motion.g>
        </g>

        {/* Attack arcs */}
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

        {/* Threat markers */}
        {sorted.map((t) => {
          const [x, y] = projection([t.lon, t.lat]) ?? [0, 0];
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
              {/* Double expanding halos */}
              <circle cx={x} cy={y} r={2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.7}>
                <animate attributeName="r" values="2.5;12" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="2.4s" repeatCount="indefinite" /></circle>
              <circle cx={x} cy={y} r={2.5} fill="none" stroke={color} strokeWidth={0.6} opacity={0.7}>
                <animate attributeName="r" values="2.5;12" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0" dur="2.4s" begin="1.2s" repeatCount="indefinite" />
              </circle>
              {/* Selection ring */}
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
              {/* Breathing core */}
              <circle cx={x} cy={y} r={critical ? 1.6 : 1.2} fill={color} opacity={0.95}>
                <animate
                  attributeName="r"
                  values={critical ? "1.3;1.9;1.3" : "1.0;1.4;1.0"}
                  dur={critical ? "1.3s" : "2.6s"}
                  repeatCount="indefinite"
                />
              </circle>
              {/* Generous click target */}
              <circle cx={x} cy={y} r={7} fill="transparent" />
              {/* Tooltip label on hover */}
              <title>{`${t.label ?? t.id} · ${t.action} · score ${t.score.toFixed(1)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
