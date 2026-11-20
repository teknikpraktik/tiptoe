// Origin: teknikpraktik/solosurvival@033a121 src/app/_client/GameMap.tsx
// Kategori B: kartinitieringen, track-up-kameran, DOM-markören, den enda requestAnimationFrame-loopen och pausen vid visibilitychange är
// kvar. Lagren net, routes och zone, zombier, mål och kantpilar är borttagna; spår, reservat och djur läggs till i Tiptoe.
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, Marker, ScaleControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { haversineM, type LatLon } from "@/geo/geometry";
import { wrap180 } from "@/sensors/heading";
import { MAP_ATTRIBUTION, MAP_STYLE } from "./mapStyle";

const fc = (features: GeoJSON.Feature[] = []): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
const line = (pts: LatLon[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lon, p.lat]) } });

function circle(c: LatLon, rM: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  const dLat = rM / 111_320;
  const dLon = rM / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * 2 * Math.PI;
    pts.push([c.lon + Math.cos(a) * dLon, c.lat + Math.sin(a) * dLat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

/** Spelarens pil (pekar uppåt = färdriktningen) och en neutral prick när riktningen är okänd. */
const ARROW_SVG = `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M20 4 L31 33 L20 26 L9 33 Z" fill="#f4e9cf" stroke="#2b2f27" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
const DOT_SVG = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7.5" fill="#f4e9cf" stroke="#2b2f27" stroke-width="3"/></svg>`;

export interface GameMapProps {
  player?: LatLon | null;
  accuracyM?: number | null;
  /** Färdriktning (0–360) eller null. Läses varje bildruta via `getHeading` om den finns. */
  heading?: number | null;
  getHeading?: () => number | null;
  /** Track Up: kartan vrids så att färdriktningen pekar uppåt. Annars norr upp. */
  trackUp?: boolean;
  /** Följ spelaren. Rör spelaren kartan tar hen över den (`onUserMove`) tills `follow` slås på igen. */
  follow?: boolean;
  onUserMove?: () => void;
  /** Spelarens eget spår under promenaden. */
  track?: LatLon[];
  zoom?: number;
  scale?: boolean;
  onError?: (what: string) => void;
}

/** Den ritade positionen når en ny fix med denna tidskonstant (s); längre hopp tas direkt. */
const PLAYER_GLIDE_S = 0.45;
const PLAYER_SNAP_M = 120;
/** Kartans rotation följer riktningen med denna tidskonstant (s). */
const BEARING_TAU_S = 0.35;

export default function GameMap(props: GameMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  // Spelaren har tagit kartan (rört den medan den följde): ingen kod flyttar kameran förrän `follow` slås på igen.
  const manual = useRef(false);
  const shown = useRef<LatLon | null>(null);
  const bearing = useRef(0);

  useEffect(() => {
    if (!el.current) return;
    setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const c = propsRef.current.player ?? { lat: 59.33, lon: 18.07 };
    const map = new MapLibreMap({ container: el.current, style: MAP_STYLE, center: [c.lon, c.lat], zoom: propsRef.current.zoom ?? 16, minZoom: 10, maxZoom: 19, attributionControl: false, dragRotate: false, pitchWithRotate: false, fadeDuration: 0, maxTileCacheSize: 40, pixelRatio: Math.min(window.devicePixelRatio || 1, 2) });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    if (propsRef.current.scale) map.addControl(new ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
    const takeOver = () => {
      if (!propsRef.current.follow || manual.current) return;
      manual.current = true;
      propsRef.current.onUserMove?.();
    };
    const canvas = map.getCanvasContainer();
    for (const ev of ["wheel", "touchstart", "pointerdown", "mousedown", "dblclick", "keydown"]) canvas.addEventListener(ev, takeOver, { passive: true, capture: true });
    let tileErrors = 0;
    map.on("error", (e) => {
      // Kartbilden är en bonus: tappas tiles fortsätter spelet. Logga bara de första felen.
      if (tileErrors++ < 3) propsRef.current.onError?.(String((e as unknown as { error?: { message?: string } }).error?.message ?? "map error"));
    });
    map.on("load", () => {
      map.addSource("acc", { type: "geojson", data: fc() });
      map.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#f4e9cf", "fill-opacity": 0.12 } });
      map.addSource("track", { type: "geojson", data: fc() });
      map.addLayer({ id: "track", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f2b35b", "line-width": 3, "line-opacity": 0.85 } });
      setLoaded(true);
    });
    // Svart karta: iOS kan tappa ritytan efter bakgrund. Rita om vid återkomst och vid storleksändring, och läs in stilen igen om den inte
    // kommit inom 8 s.
    const repaint = () => { if (!document.hidden) { map.resize(); map.triggerRepaint(); } };
    document.addEventListener("visibilitychange", repaint);
    const ro = typeof ResizeObserver !== "undefined" && el.current ? new ResizeObserver(() => map.resize()) : null;
    if (ro && el.current) ro.observe(el.current);
    let retries = 0;
    const watchdog = setInterval(() => {
      if (map.isStyleLoaded() || retries >= 2) { clearInterval(watchdog); return; }
      retries++;
      propsRef.current.onError?.("map style timeout, retrying");
      map.setStyle(MAP_STYLE);
    }, 8000);
    map.on("load", () => clearInterval(watchdog));
    return () => { clearInterval(watchdog); ro?.disconnect(); document.removeEventListener("visibilitychange", repaint); map.remove(); mapRef.current = null; setLoaded(false); };
  }, []);

  const src = (id: string, data: GeoJSON.FeatureCollection) => (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  const { player, accuracyM, follow, track } = props;

  useEffect(() => { if (loaded) src("track", fc(track && track.length > 1 ? [line(track)] : [])); }, [loaded, track]);

  // --- Spelarmarkör ---
  const playerEl = useRef<HTMLDivElement | null>(null);
  const playerMarker = useRef<Marker | null>(null);
  const followProp = useRef(follow);
  useEffect(() => {
    if (follow && !followProp.current) manual.current = false;
    followProp.current = follow;
  }, [follow]);
  useEffect(() => {
    if (!loaded) return;
    const d = document.createElement("div");
    d.className = "pmark";
    d.style.zIndex = "2";
    d.setAttribute("data-testid", "player");
    d.innerHTML = `<div class="arrow">${ARROW_SVG}</div><div class="dot">${DOT_SVG}</div>`;
    playerEl.current = d;
    playerMarker.current = new Marker({ element: d, rotationAlignment: "viewport", pitchAlignment: "viewport" });
    return () => { playerMarker.current?.remove(); playerMarker.current = null; };
  }, [loaded]);
  useEffect(() => {
    const map = mapRef.current;
    const m = playerMarker.current;
    if (!loaded || !map) return;
    src("acc", fc(player && accuracyM ? [circle(player, accuracyM)] : []));
    if (!m) return;
    if (!player) { m.remove(); shown.current = null; return; }
    if (!shown.current || haversineM(shown.current, player) > PLAYER_SNAP_M) shown.current = { lat: player.lat, lon: player.lon };
    m.setLngLat([shown.current.lon, shown.current.lat]);
    if (!m.getElement().isConnected) m.addTo(map);
    if (follow && !manual.current && !map.isMoving()) map.jumpTo({ center: [shown.current.lon, shown.current.lat] });
  }, [loaded, player, accuracyM, follow]);

  // En enda bildrutesloop (högst ~30 Hz): glider spelarens position, vrider kartan (Track Up) och pilen. Vilar när sidan är dold.
  useEffect(() => {
    if (!loaded) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      if (now - last < 33) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const P = propsRef.current;
      const map = mapRef.current;
      if (!map) return;
      const target = P.player, at = shown.current;
      let moved = false;
      if (target && at && (Math.abs(target.lat - at.lat) > 2e-7 || Math.abs(target.lon - at.lon) > 4e-7)) {
        const k = 1 - Math.exp(-dt / PLAYER_GLIDE_S);
        at.lat += (target.lat - at.lat) * k;
        at.lon += (target.lon - at.lon) * k;
        playerMarker.current?.setLngLat([at.lon, at.lat]);
        moved = true;
      }
      const h = P.getHeading ? P.getHeading() : P.heading ?? null;
      let turned = false;
      if (P.follow && !manual.current) {
        const goal = P.trackUp && h != null ? h : P.trackUp ? bearing.current : 0;
        const diff = wrap180(goal - bearing.current);
        if (Math.abs(diff) > 0.2) { bearing.current += diff * (1 - Math.exp(-dt / BEARING_TAU_S)); turned = true; }
        if ((turned || moved) && !map.isMoving()) {
          const c = shown.current;
          map.jumpTo(c ? { bearing: bearing.current, center: [c.lon, c.lat] } : { bearing: bearing.current });
        }
      } else bearing.current = map.getBearing();
      const pe = playerEl.current;
      if (pe) {
        pe.classList.toggle("has-heading", h != null);
        if (h != null) (pe.querySelector(".arrow") as HTMLElement).style.transform = `rotate(${wrap180(h - bearing.current).toFixed(1)}deg)`;
      }
      if (el.current) el.current.dataset.bearing = String(Math.round(bearing.current));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [loaded]);

  return (
    <>
      <div ref={el} className="map-canvas" data-testid="map" data-loaded={loaded} />
      <a className="attrib" href={MAP_ATTRIBUTION.href} target="_blank" rel="noreferrer">{MAP_ATTRIBUTION.text}</a>
    </>
  );
}
