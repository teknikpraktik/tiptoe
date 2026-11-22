// Origin: teknikpraktik/solosurvival@033a121 src/app/_client/mapStyle.ts (omskriven: ljus friluftsstil med terrängskuggning)
import type { StyleSpecification } from "maplibre-gl";

/**
 * Ljus friluftskarta för dagsljus. Data från OpenFreeMap (OpenMapTiles-schema, OpenStreetMap), samma tiles som spelets miljö läser, så att
 * stigar, vatten och skog på kartan är exakt det som djuren förhåller sig till. Terrängskuggning ur öppna höjddata (Terrain Tiles på AWS,
 * för Sverige EU-DEM).
 * - Gratis, ingen nyckel. Villkor: https://openfreemap.org/tos/ (vanlig webbläsaranvändning är tillåten; massnedladdning är det inte, så
 *   appen och service workern förhandshämtar ALDRIG kartrutor). Höjddata: https://registry.opendata.aws/terrain-tiles/
 * - Attribution visas alltid i kartvyn, se MAP_ATTRIBUTION.
 * - Naturtyper som tydliga ytor (skog, öppen mark, åker, myr med streck, berg, sand), naturreservat med grön kant, vatten och vattendrag
 *   i blått, stigar rödbruna och streckade, traktorvägar bruna, vägar med kant. Etiketter för orter, sjöar, vattendrag, toppar och reservat.
 */
export const MAP_ATTRIBUTION = { text: "© OpenStreetMap · OpenFreeMap © OpenMapTiles · Höjd: EU-DEM (Copernicus)", href: "https://www.openstreetmap.org/copyright" };

/** Tiles och typsnitt kommer från samma värd. */
export const OMT_TILEJSON = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
/** Terrain Tiles (terrarium-kodade PNG, 256 px, CORS öppet). */
export const DEM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/** Myrens streckmönster ritas i koden (inga sprites att hämta), se `marshPattern`. */
export const MARSH_PATTERN = "marsh";

const w = (...stops: (number | number[])[]) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops.flat()] as unknown as number;
const lin = (...stops: (number | number[])[]) => ["interpolate", ["linear"], ["zoom"], ...stops.flat()] as unknown as number;

export const PALETTE = {
  bg: "#f4f1e8",
  wood: "#c4e0a6",
  woodEdge: "#a9cd8a",
  grass: "#ecf3d6",
  scrub: "#dde8c4",
  farmland: "#f5efd5",
  wetland: "#e1ece6",
  marsh: "#6f9fb3",
  rock: "#e3e0da",
  ice: "#f3f8fb",
  sand: "#f2e7c4",
  settled: "#ece7df",
  industrial: "#e7e1e8",
  leisure: "#dcecc9",
  reserve: "#4f9a3c",
  building: "#dcd3c5",
  buildingEdge: "#c3b8a6",
  water: "#aad3ef",
  waterEdge: "#86bde3",
  waterway: "#6aaee0",
  path: "#b8462a",
  walkway: "#c99a8a",
  track: "#8a6436",
  minor: "#ffffff",
  minorCase: "#bdb5a7",
  major: "#fbd28a",
  majorCase: "#c9913f",
  motorway: "#f5a85e",
  rail: "#8c8a85",
  label: "#3c3d35",
  halo: "#fbf9f3",
  waterLabel: "#2e6f9e",
  reserveLabel: "#3b7a2c",
} as const;

const MAJOR = ["primary", "secondary", "tertiary"];
/** Stigar i naturen (kraftiga) och gångvägar, trottoarer och cykelbanor (tunna och ljusa), så att stigarna syns i tätorten också. */
const TRAILS = ["path", "bridleway"];
const WALKWAYS = ["footway", "cycleway", "pedestrian", "steps"];
const halo = { "text-halo-color": PALETTE.halo, "text-halo-width": 1.4, "text-halo-blur": 0.5 };
const NAME = ["coalesce", ["get", "name:sv"], ["get", "name"]] as unknown as string;

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: GLYPHS,
  sources: {
    omt: { type: "vector", url: OMT_TILEJSON, attribution: "OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors" },
    dem: { type: "raster-dem", tiles: [DEM_TILES], tileSize: 256, maxzoom: 12, encoding: "terrarium", attribution: "Terrain Tiles (Mapzen, AWS), EU-DEM: Copernicus" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": PALETTE.bg } },
    // --- Markanvändning och naturtyper ---
    { id: "settled", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", "class", "residential", "suburb", "neighbourhood", "commercial", "retail", "school", "kindergarten", "university", "college", "hospital"], paint: { "fill-color": PALETTE.settled } },
    { id: "industrial", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", "class", "industrial", "railway", "quarry", "garages"], paint: { "fill-color": PALETTE.industrial } },
    { id: "farmland", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "farmland"], paint: { "fill-color": PALETTE.farmland } },
    { id: "grass", type: "fill", source: "omt", "source-layer": "landcover", filter: ["all", ["==", "class", "grass"], ["!=", "subclass", "scrub"]], paint: { "fill-color": PALETTE.grass } },
    { id: "scrub", type: "fill", source: "omt", "source-layer": "landcover", filter: ["all", ["==", "class", "grass"], ["==", "subclass", "scrub"]], paint: { "fill-color": PALETTE.scrub } },
    { id: "leisure", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", "class", "cemetery", "playground", "pitch", "stadium", "garden"], paint: { "fill-color": PALETTE.leisure } },
    { id: "wood", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "wood"], paint: { "fill-color": PALETTE.wood, "fill-outline-color": PALETTE.woodEdge } },
    { id: "rock", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "rock"], paint: { "fill-color": PALETTE.rock } },
    { id: "sand", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "sand"], paint: { "fill-color": PALETTE.sand } },
    { id: "ice", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "ice"], paint: { "fill-color": PALETTE.ice } },
    { id: "wetland", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "wetland"], paint: { "fill-color": PALETTE.wetland } },
    { id: "wetland-marsh", type: "fill", source: "omt", "source-layer": "landcover", minzoom: 12, filter: ["==", "class", "wetland"], paint: { "fill-pattern": MARSH_PATTERN, "fill-opacity": 0.8 } },
    // --- Terräng ---
    { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": lin(10, 0.4, 13, 0.2, 16, 0.08), "hillshade-shadow-color": "rgba(61, 74, 52, 0.85)", "hillshade-highlight-color": "rgba(255, 255, 255, 0.3)", "hillshade-accent-color": "#6b705f", "hillshade-illumination-direction": 315 } },
    // --- Naturreservat och nationalparker ---
    { id: "reserve-fill", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": PALETTE.reserve, "fill-opacity": 0.06 } },
    { id: "reserve-edge", type: "line", source: "omt", "source-layer": "park", paint: { "line-color": PALETTE.reserve, "line-opacity": 0.6, "line-width": w(10, 1, 16, 3), "line-dasharray": [3, 1.5] } },
    // --- Vatten ---
    { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", "class", "swimming_pool"], paint: { "fill-color": PALETTE.water, "fill-outline-color": PALETTE.waterEdge } },
    { id: "waterway-small", type: "line", source: "omt", "source-layer": "waterway", minzoom: 13, filter: ["in", "class", "ditch", "drain"], paint: { "line-color": PALETTE.waterway, "line-opacity": 0.55, "line-width": w(13, 0.5, 18, 1.5) } },
    { id: "waterway-stream", type: "line", source: "omt", "source-layer": "waterway", filter: ["in", "class", "stream", "canal"], layout: { "line-cap": "round" }, paint: { "line-color": PALETTE.waterway, "line-width": w(10, 0.6, 14, 1.4, 18, 3.5) } },
    { id: "waterway-river", type: "line", source: "omt", "source-layer": "waterway", filter: ["==", "class", "river"], layout: { "line-cap": "round" }, paint: { "line-color": PALETTE.waterway, "line-width": w(8, 0.8, 14, 2.5, 18, 8) } },
    // --- Byggnader ---
    { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13, paint: { "fill-color": PALETTE.building, "fill-outline-color": PALETTE.buildingEdge } },
    // --- Vägar och stigar (kant under, fyllnad över) ---
    { id: "minor-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["all", ["in", "class", "minor", "service"], ["!=", "brunnel", "tunnel"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PALETTE.minorCase, "line-width": w(12, 1.2, 18, 11) } },
    { id: "major-case", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", ["in", "class", "motorway", "trunk", ...MAJOR], ["!=", "brunnel", "tunnel"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PALETTE.majorCase, "line-width": w(8, 1.2, 12, 3.5, 18, 18) } },
    { id: "track", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["==", "class", "track"], paint: { "line-color": PALETTE.track, "line-width": w(12, 0.8, 18, 3.2), "line-dasharray": [4, 1.5] } },
    { id: "walkway", type: "line", source: "omt", "source-layer": "transportation", minzoom: 14, filter: ["all", ["==", "class", "path"], ["in", "subclass", ...WALKWAYS], ["!=", "brunnel", "tunnel"]], paint: { "line-color": PALETTE.walkway, "line-width": w(14, 0.6, 18, 1.8), "line-dasharray": [2, 1.5] } },
    { id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["all", ["==", "class", "path"], ["in", "subclass", ...TRAILS], ["!=", "brunnel", "tunnel"]], paint: { "line-color": PALETTE.path, "line-width": w(12, 0.8, 15, 1.8, 18, 3.2), "line-dasharray": [2.5, 1.2] } },
    { id: "minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["all", ["in", "class", "minor", "service"], ["!=", "brunnel", "tunnel"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PALETTE.minor, "line-width": w(12, 0.6, 18, 8.5) } },
    { id: "railway", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", ["==", "class", "rail"], ["!=", "brunnel", "tunnel"]], paint: { "line-color": PALETTE.rail, "line-width": w(10, 1, 18, 3.5), "line-dasharray": [3, 2] } },
    { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", ["in", "class", ...MAJOR], ["!=", "brunnel", "tunnel"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PALETTE.major, "line-width": w(8, 0.8, 12, 2.4, 18, 15) } },
    { id: "motorway", type: "line", source: "omt", "source-layer": "transportation", filter: ["all", ["in", "class", "motorway", "trunk"], ["!=", "brunnel", "tunnel"]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": PALETTE.motorway, "line-width": w(8, 0.8, 12, 2.4, 18, 15) } },
    // --- Etiketter ---
    { id: "label-waterway", type: "symbol", source: "omt", "source-layer": "waterway", minzoom: 13, filter: ["in", "class", "river", "stream", "canal"], layout: { "symbol-placement": "line", "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-letter-spacing": 0.05 }, paint: { "text-color": PALETTE.waterLabel, ...halo } },
    { id: "label-water", type: "symbol", source: "omt", "source-layer": "water_name", layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": lin(10, 11, 16, 15), "text-max-width": 8 }, paint: { "text-color": PALETTE.waterLabel, ...halo } },
    { id: "label-reserve", type: "symbol", source: "omt", "source-layer": "park", minzoom: 11, filter: ["has", "name"], layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-max-width": 9 }, paint: { "text-color": PALETTE.reserveLabel, ...halo } },
    { id: "label-peak", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 11, filter: ["==", "class", "peak"], layout: { "text-field": ["case", ["has", "ele"], ["concat", "▲ ", NAME, "\n", ["to-string", ["get", "ele"]], " m"], ["concat", "▲ ", NAME]], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-anchor": "top" }, paint: { "text-color": "#5b4a36", ...halo } },
    { id: "label-place", type: "symbol", source: "omt", "source-layer": "place", filter: ["in", "class", "city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood", "isolated_dwelling", "locality"], layout: { "text-field": NAME, "text-font": ["match", ["get", "class"], ["city", "town"], ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]], "text-size": ["match", ["get", "class"], "city", 17, "town", 15, "village", 13, 11.5], "text-max-width": 8 }, paint: { "text-color": PALETTE.label, ...halo } },
  ],
};

/** Spårens tassavtryck (32 × 32 px, pixelRatio 2): trampdyna och fyra tår i mörkbrunt med ljus kant, pekar uppåt (framåt). */
export const PAW_IMAGE = "paw";
export function pawImage(): { width: number; height: number; data: Uint8Array } {
  const n = 32, data = new Uint8Array(n * n * 4);
  const blobs: [number, number, number, number][] = [[16, 21, 7, 6], [8.5, 11.5, 2.8, 3.6], [13.5, 7.5, 2.8, 3.8], [18.5, 7.5, 2.8, 3.8], [23.5, 11.5, 2.8, 3.6]];
  const inside = (x: number, y: number, grow: number) => blobs.some(([cx, cy, rx, ry]) => ((x - cx) / (rx + grow)) ** 2 + ((y - cy) / (ry + grow)) ** 2 <= 1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, px = x + 0.5, py = y + 0.5;
    if (inside(px, py, 0)) { data[i] = 0x5a; data[i + 1] = 0x34; data[i + 2] = 0x18; data[i + 3] = 255; }
    else if (inside(px, py, 1.6)) { data[i] = 0xfb; data[i + 1] = 0xf9; data[i + 2] = 0xf3; data[i + 3] = 210; }
  }
  return { width: n, height: n, data };
}

/** Myrens mönster: korta blå streck på genomskinlig botten (16 × 16 px), som på friluftskartor. */
export function marshPattern(): { width: number; height: number; data: Uint8Array } {
  const n = 16, data = new Uint8Array(n * n * 4);
  const dash = (y: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) { const i = (y * n + x) * 4; data[i] = 0x6f; data[i + 1] = 0x9f; data[i + 2] = 0xb3; data[i + 3] = 220; } };
  dash(4, 1, 6); dash(12, 9, 14);
  return { width: n, height: n, data };
}
