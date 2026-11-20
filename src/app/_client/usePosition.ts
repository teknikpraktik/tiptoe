"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PLAUSIBLE_SPEED_MPS } from "@/config/gps";
import type { LatLon } from "@/geo/geometry";
import { GpsFilter } from "@/gps/filters/filter";
import { GpsProvider, type GpsErrorCode } from "@/gps/provider/provider";
import type { GPSFix, GpsQuality } from "@/gps/types";
import { HeadingTracker } from "@/sensors/heading";
import { SpeedTracker } from "@/sensors/speed";

export interface PositionView {
  /** Filtrerad position (aldrig rå GPS). */
  pos: LatLon | null;
  accuracyM: number | null;
  quality: GpsQuality;
  headingDeg: number | null;
  speedMps: number | null;
  error: GpsErrorCode | null;
  /** Senaste råa fix (för fältdiagnostik). */
  raw: GPSFix | null;
}

const EMPTY: PositionView = { pos: null, accuracyM: null, quality: "unavailable", headingDeg: null, speedMps: null, error: null, raw: null };

/**
 * GPS → filter → position, kurs och fart, så länge komponenten är monterad och `enabled`. GPS-bevakningen stängs när sidan döljs
 * (batteri) och startas igen när den syns.
 */
export function usePosition(enabled = true): PositionView {
  const [view, setView] = useState<PositionView>(EMPTY);
  const parts = useRef({ filter: new GpsFilter({ maxPlausibleSpeedMps: MAX_PLAUSIBLE_SPEED_MPS }), heading: new HeadingTracker(), speed: new SpeedTracker() });
  useEffect(() => {
    if (!enabled) return;
    const provider = new GpsProvider(typeof navigator !== "undefined" ? navigator.geolocation : undefined);
    const { filter, heading, speed } = parts.current;
    const start = () => provider.start((e) => {
      if (e.type === "error") { setView((v) => ({ ...v, error: e.code, quality: filter.qualityAt(Date.now()) })); return; }
      const out = filter.push(e.fix, e.receivedAtMs);
      if (out.verdict === "reacquired") heading.rebase();
      if (out.position && (out.verdict === "accepted" || out.verdict === "reacquired")) {
        speed.push(out.position, e.fix.timestampMs, e.fix.speedMps);
        heading.update({ pos: out.position, accuracyM: e.fix.accuracyM, gpsHeadingDeg: e.fix.headingDeg, gpsSpeedMps: e.fix.speedMps, tMs: e.fix.timestampMs });
      }
      setView({ pos: out.position, accuracyM: e.fix.accuracyM, quality: out.quality, headingDeg: heading.heading, speedMps: speed.speedAt(e.fix.timestampMs), error: null, raw: e.fix });
    });
    const vis = () => { if (document.hidden) provider.stop(); else start(); };
    start();
    // Utan ny fix blir kvaliteten "unavailable" efter en stund.
    const tick = setInterval(() => setView((v) => { const q = filter.qualityAt(Date.now()); return q === v.quality ? v : { ...v, quality: q }; }), 2000);
    document.addEventListener("visibilitychange", vis);
    return () => { provider.stop(); clearInterval(tick); document.removeEventListener("visibilitychange", vis); };
  }, [enabled]);
  return view;
}
