// Origin: teknikpraktik/solosurvival@033a121 src/app/_client/GameMap.tsx
// Kategori B: kartinitieringen, track-up-kameran, DOM-markörerna, den enda requestAnimationFrame-loopen och pausen vid visibilitychange är
// kvar. Lagren net, routes och zone, zombier, mål och kantpilar är borttagna; spår, reservat och djur är nya. Djurens mjuka rörelse mellan
// motorns steg ersätter Outbreaks zombie-anim.ts (fri 2D i stället för längs en graf).
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, Marker, ScaleControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { haversineM, type LatLon } from "@/geo/geometry";
import { wrap180 } from "@/sensors/heading";
import { MAP_ATTRIBUTION, MAP_STYLE, MARSH_PATTERN, PAW_IMAGE, marshPattern, pawImage } from "./mapStyle";
import { bearingDeg } from "@/geo/geometry";
import { MAP_TEXTURES } from "./mapTextures";

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
/** Ett djur på kartan: ett tassavtryck (färg efter sällsynthet via CSS), vridet åt djurets färdriktning. */
const PAW_SVG = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><g class="paw" stroke="#fbf9f3" stroke-width="1.6"><ellipse cx="16" cy="21" rx="7" ry="6"/><ellipse cx="8.5" cy="11.5" rx="2.8" ry="3.6"/><ellipse cx="13.5" cy="7.5" rx="2.8" ry="3.8"/><ellipse cx="18.5" cy="7.5" rx="2.8" ry="3.8"/><ellipse cx="23.5" cy="11.5" rx="2.8" ry="3.6"/></g></svg>`;
/** Tassavtryck som ett djur lämnar efter sig tonar bort på så här många sekunder (3 min efter fälttest 1: lätt att följa, också för barn). */
const PRINT_FADE_S = 180;
/** Ett nytt avtryck för varje så här många meter djuret flyttar sig. */
const PRINT_STEP_M = 6;
const DOT_SVG = `<svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7.5" fill="#f4e9cf" stroke="#2b2f27" stroke-width="3"/></svg>`;

export interface MapAnimal { id: string; lat: number; lon: number; state: string; label: string; rarity: string; escape?: string; look?: string; headingDeg?: number }

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
  /** Spåret: gångna delar (heldragna) och ifyllda glapp (streckade raka linjer). */
  track?: { solid: LatLon[][]; bridged: [LatLon, LatLon][] };
  /** Reservat som GeoJSON-ringar [lon, lat], med nivå (färgen blir varmare med nivån). */
  reserves?: [number, number][][][];
  reserveLevels?: number[];
  /** Spår mot djur som inte syns än (prickar). */
  trails?: { id: string; points: LatLon[] }[];
  /** Observationer: ungefärlig plats och etikett. */
  sightings?: { id: string; lat: number; lon: number; label: string }[];
  /** Nyss tillagd yta (växer fram); byt `id` för att spela animationen igen. */
  closure?: { id: number; pieces: [number, number][][][] } | null;
  /** Synliga djur (motorns positioner; kartan glider mellan dem). */
  animals?: MapAnimal[];
  onAnimalTap?: (id: string) => void;
  zoom?: number;
  /** Element som vrids så att det pekar mot norr på kartan (kompassknappens nål). */
  needle?: { current: HTMLElement | null };
  scale?: boolean;
  onError?: (what: string) => void;
}

/** Den ritade positionen når en ny fix med denna tidskonstant (s); längre hopp tas direkt. */
const PLAYER_GLIDE_S = 0.45;
const PLAYER_SNAP_M = 120;
/** Kartans rotation följer riktningen med denna tidskonstant (s). */
const BEARING_TAU_S = 0.18;

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
    const takeOver = (e: Event) => {
      // Ett tryck på ett djur är inte att ta över kartan.
      if ((e.target as Element | null)?.closest?.(".amark")) return;
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
    // Kartans mönster och tassar ritas i koden (inga sprites). Läggs till direkt när stilen finns, innan rutorna ritas (annars kan en ruta
    // ritas utan mönster), och vid behov om stilen laddas om.
    const addImage = (id: string) => {
      if (map.hasImage(id)) return;
      if (id === MARSH_PATTERN) map.addImage(id, marshPattern());
      else if (id === PAW_IMAGE) map.addImage(id, pawImage(), { pixelRatio: 2 });
      else if (MAP_TEXTURES[id]) map.addImage(id, MAP_TEXTURES[id](), { pixelRatio: 2 });
    };
    map.on("styledata", () => { for (const id of [MARSH_PATTERN, PAW_IMAGE, ...Object.keys(MAP_TEXTURES)]) addImage(id); });
    map.on("styleimagemissing", (e) => addImage(e.id));
    map.on("load", () => {
      map.addSource("acc", { type: "geojson", data: fc() });
      map.addLayer({ id: "acc", type: "fill", source: "acc", paint: { "fill-color": "#2f7fd8", "fill-opacity": 0.1 } });
      map.addSource("reserves", { type: "geojson", data: fc() });
      map.addLayer({ id: "reserves", type: "fill", source: "reserves", paint: { "fill-color": ["match", ["get", "level"], 3, "#e0a91b", 2, "#4f9a2e", 1, "#5fae3a", "#6dbb46"], "fill-opacity": ["match", ["get", "level"], 3, 0.28, 2, 0.26, 1, 0.22, 0.18] } });
      map.addLayer({ id: "reserves-edge", type: "line", source: "reserves", paint: { "line-color": ["match", ["get", "level"], 3, "#b8860b", "#2f7a22"], "line-width": ["match", ["get", "level"], 3, 3, 2, 2.5, 2], "line-opacity": 0.85 } });
      map.addSource("closure", { type: "geojson", data: fc() });
      map.addLayer({ id: "closure", type: "fill", source: "closure", paint: { "fill-color": "#e0a91b", "fill-opacity": 0 } });
      map.addSource("animal-prints", { type: "geojson", data: fc() });
      map.addLayer({ id: "animal-prints", type: "symbol", source: "animal-prints", layout: { "icon-image": PAW_IMAGE, "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.55, 18, 1], "icon-rotate": ["get", "r"], "icon-rotation-alignment": "map", "icon-offset": ["get", "off"], "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["get", "o"] } });
      map.addSource("trails", { type: "geojson", data: fc() });
      // Djurspår: tassavtryck vridna längs spåret mot djuret, omväxlande vänster och höger fot.
      map.addLayer({ id: "trails", type: "symbol", source: "trails", layout: { "icon-image": PAW_IMAGE, "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1.1], "icon-rotate": ["get", "r"], "icon-rotation-alignment": "map", "icon-offset": ["get", "off"], "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["get", "o"] } });
      map.addSource("track", { type: "geojson", data: fc() });
      // Spåret där man gått: ljus kant under och en tydlig orange linje, som på en friluftsapp.
      map.addLayer({ id: "walked-case", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 9], "line-opacity": 0.9 } });
      map.addSource("track-gaps", { type: "geojson", data: fc() });
      map.addLayer({ id: "walked-gaps", type: "line", source: "track-gaps", layout: { "line-cap": "round" }, paint: { "line-color": "#e8611a", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2, 18, 4.5], "line-dasharray": [1, 1.6], "line-opacity": 0.8 } });
      map.addLayer({ id: "walked", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#e8611a", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.2, 18, 5.5] } });
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
  const { player, accuracyM, follow, track, reserves, closure } = props;

  // Spåret går ända fram till spelaren (den sparade spårpunkten kan ligga upp till några meter bakom). Ifyllda glapp ritas streckade.
  useEffect(() => {
    if (!loaded) return;
    const parts = (track?.solid ?? []).map((p, i, all) => (i === all.length - 1 && player ? [...p, player] : p));
    src("track", fc(parts.filter((p) => p.length > 1).map((p) => line(p))));
    src("track-gaps", fc((track?.bridged ?? []).map(([a, b]) => line([a, b]))));
  }, [loaded, track, player]);
  const polys = (rs: [number, number][][][], levels?: number[]): GeoJSON.Feature[] => rs.map((rings, i) => ({ type: "Feature", properties: { level: levels?.[i] ?? 0 }, geometry: { type: "Polygon", coordinates: rings.map((r) => [...r, r[0]]) } }));
  useEffect(() => { if (loaded) src("reserves", fc(polys(reserves ?? [], props.reserveLevels))); }, [loaded, reserves, props.reserveLevels]);
  useEffect(() => {
    if (!loaded) return;
    // Tassarna tonar fram mot djuret (spåren blir färskare). Sista punkten ligger närmast djuret; riktningen är mot nästa punkt.
    src("trails", fc((props.trails ?? []).flatMap((tr) => tr.points.map((p, i) => {
      const a = tr.points[Math.min(i, tr.points.length - 2)], b = tr.points[Math.min(i + 1, tr.points.length - 1)];
      const r = tr.points.length > 1 ? bearingDeg(a, b) : 0;
      return { type: "Feature", properties: { o: 0.4 + (0.6 * (i + 1)) / tr.points.length, r, off: [i % 2 ? 5 : -5, 0] }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } } as GeoJSON.Feature;
    }))));
  }, [loaded, props.trails]);
  // Observationer: en pulserande ring där arten sågs (ungefärligt).
  const sightingMarkers = useRef(new Map<string, Marker>());
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const live = new Set((props.sightings ?? []).map((x) => x.id));
    for (const [id, m] of sightingMarkers.current) if (!live.has(id)) { m.remove(); sightingMarkers.current.delete(id); }
    for (const x of props.sightings ?? []) {
      if (sightingMarkers.current.has(x.id)) continue;
      const el = document.createElement("div");
      el.className = "sighting";
      el.setAttribute("data-testid", "sighting");
      el.innerHTML = `<span class="ring"></span><span class="slabel"></span>`;
      (el.querySelector(".slabel") as HTMLElement).textContent = x.label;
      sightingMarkers.current.set(x.id, new Marker({ element: el }).setLngLat([x.lon, x.lat]).addTo(map));
    }
  }, [loaded, props.sightings]);
  // Ytan växer fram: en gul fyllning som tonar in och sedan ut över reservatet (spec: Direkt återkoppling).
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !closure) return;
    src("closure", fc(polys(closure.pieces)));
    let raf = 0;
    const t0 = performance.now();
    const anim = (now: number) => {
      const k = (now - t0) / 2600;
      if (k >= 1) { map.setPaintProperty("closure", "fill-opacity", 0); return; }
      map.setPaintProperty("closure", "fill-opacity", Math.sin(Math.min(1, k) * Math.PI) * 0.55);
      raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);
    return () => cancelAnimationFrame(raf);
  }, [loaded, closure?.id]);

  // --- Djur: DOM-markörer; positionen glider mot motorns i bildrutesloopen nedan. ---
  const animalMarkers = useRef(new Map<string, { m: Marker; el: HTMLDivElement; at: LatLon; target: LatLon; lastPrint: LatLon }>());
  /** Avtryck som djuren lämnat efter sig (tonar bort efter PRINT_FADE_S). */
  const prints = useRef<{ lat: number; lon: number; r: number; t: number; i: number }[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map) return;
    const live = new Set<string>();
    for (const a of props.animals ?? []) {
      live.add(a.id);
      let x = animalMarkers.current.get(a.id);
      if (!x) {
        const el = document.createElement("div");
        el.className = "amark";
        el.setAttribute("role", "button");
        el.setAttribute("data-testid", "animal");
        el.dataset.id = a.id;
        el.innerHTML = `<span class="adot">${PAW_SVG}</span>`;
        el.addEventListener("click", (e) => { e.stopPropagation(); propsRef.current.onAnimalTap?.(a.id); });
        x = { m: new Marker({ element: el, rotationAlignment: "map" }).setLngLat([a.lon, a.lat]).addTo(map), el, at: { lat: a.lat, lon: a.lon }, target: { lat: a.lat, lon: a.lon }, lastPrint: { lat: a.lat, lon: a.lon } };
        animalMarkers.current.set(a.id, x);
      }
      x.target = { lat: a.lat, lon: a.lon };
      if (a.headingDeg != null) x.m.setRotation(a.headingDeg);
      x.el.dataset.state = a.state;
      x.el.dataset.rarity = a.rarity;
      x.el.dataset.escape = a.escape ?? "run";
      if (a.look) x.el.dataset.look = a.look; else delete x.el.dataset.look;
      x.el.setAttribute("aria-label", a.label);
    }
    for (const [id, x] of animalMarkers.current) if (!live.has(id)) { x.m.remove(); animalMarkers.current.delete(id); }
  }, [loaded, props.animals]);
  useEffect(() => () => { animalMarkers.current.forEach((x) => x.m.remove()); animalMarkers.current.clear(); }, []);

  // --- Spelarmarkör ---
  const playerEl = useRef<HTMLDivElement | null>(null);
  const playerMarker = useRef<Marker | null>(null);
  const followProp = useRef(follow);
  useEffect(() => {
    // Följ slås på igen: tillbaka till promenadens zoomnivå (autozoom).
    if (follow && !followProp.current) { manual.current = false; const m = mapRef.current; if (m) m.easeTo({ zoom: props.zoom ?? 16, duration: 400 }); }
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
    let lastPrintDraw = 0;
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
      for (const x of animalMarkers.current.values()) {
        if (Math.abs(x.target.lat - x.at.lat) < 2e-8 && Math.abs(x.target.lon - x.at.lon) < 4e-8) continue;
        const k = 1 - Math.exp(-dt / 0.6);
        x.at.lat += (x.target.lat - x.at.lat) * k;
        x.at.lon += (x.target.lon - x.at.lon) * k;
        x.m.setLngLat([x.at.lon, x.at.lat]);
        // Ett avtryck bakom djuret när det flyttat sig en bit: djuret syns som sitt eget spår, som tonar bort.
        if (haversineM(x.lastPrint, x.at) >= PRINT_STEP_M) {
          prints.current.push({ lat: x.lastPrint.lat, lon: x.lastPrint.lon, r: bearingDeg(x.lastPrint, x.at), t: now, i: prints.current.length });
          x.lastPrint = { lat: x.at.lat, lon: x.at.lon };
        }
      }
      if (now - lastPrintDraw > 250) {
        lastPrintDraw = now;
        prints.current = prints.current.filter((p) => now - p.t < PRINT_FADE_S * 1000);
        const ps = map.getSource("animal-prints") as GeoJSONSource | undefined;
        ps?.setData(fc(prints.current.map((p, k) => ({ type: "Feature", properties: { r: p.r, o: 0.85 * (1 - (now - p.t) / (PRINT_FADE_S * 1000)), off: [k % 2 ? 4 : -4, 0] }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }) as GeoJSON.Feature)));
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
      const nd = P.needle?.current;
      if (nd) nd.style.transform = `rotate(${(-map.getBearing()).toFixed(1)}deg)`;
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
