// Origin: teknikpraktik/solosurvival@033a121 src/app/_client/mapStyle.ts
import type { StyleSpecification } from "maplibre-gl";

/**
 * Bakgrundskarta från OpenFreeMap (OpenMapTiles-schema, data från OpenStreetMap), i Tiptoes ljusare, filmiska palett (skymning, varma
 * jordtoner). Samma villkor som i Outbreak:
 * - Gratis, ingen nyckel. Villkor: https://openfreemap.org/tos/ (vanlig webbläsaranvändning är tillåten; massnedladdning är det inte, så
 *   appen och service workern förhandshämtar ALDRIG kartrutor).
 * - Attribution visas alltid i kartvyn, se MAP_ATTRIBUTION.
 * - Bara fyllnads- och linjelager, inga etiketter ⇒ inga typsnitt/sprites att hämta.
 * - Natur (skog, äng, park, våtmark) är tydligare än bebyggelse, så att spelaren ser var det lever. Större vägar och järnväg är dämpat
 *   varma (varning), stigar ljusa och streckade: det är där man går.
 */
export const MAP_ATTRIBUTION = { text: "© OpenStreetMap · OpenFreeMap © OpenMapTiles", href: "https://www.openstreetmap.org/copyright" };

const MAJOR = ["motorway", "trunk", "primary", "secondary", "tertiary"];
const w = (...stops: (number | number[])[]) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops.flat()] as unknown as number;

export const PALETTE = {
  bg: "#2b2f27",
  grass: "#3a4530",
  wood: "#2f4a2c",
  wetland: "#33494a",
  park: "#36502f",
  settled: "#363530",
  building: "#4a463e",
  buildingEdge: "#58534a",
  water: "#25425a",
  waterway: "#2f5878",
  path: "#d8c9a3",
  minor: "#6c665a",
  rail: "#8c6f4e",
  major: "#9a8463",
} as const;

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": PALETTE.bg } },
    { id: "settled", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", "class", "residential", "commercial", "industrial", "retail"], paint: { "fill-color": PALETTE.settled } },
    { id: "grass", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", "class", "grass", "farmland"], paint: { "fill-color": PALETTE.grass } },
    { id: "wood", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "wood"], paint: { "fill-color": PALETTE.wood } },
    { id: "wetland", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", "class", "wetland"], paint: { "fill-color": PALETTE.wetland } },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": PALETTE.park, "fill-opacity": 0.7 } },
    { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13, paint: { "fill-color": PALETTE.building, "fill-outline-color": PALETTE.buildingEdge } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": PALETTE.water } },
    { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": PALETTE.waterway, "line-width": w(8, 0.6, 16, 3) } },
    { id: "minor", type: "line", source: "omt", "source-layer": "transportation", filter: ["in", "class", "minor", "service"], paint: { "line-color": PALETTE.minor, "line-width": w(11, 0.5, 18, 5) } },
    { id: "path", type: "line", source: "omt", "source-layer": "transportation", minzoom: 12, filter: ["in", "class", "path", "track"], paint: { "line-color": PALETTE.path, "line-opacity": 0.55, "line-width": w(12, 0.5, 18, 2.5), "line-dasharray": [2, 1.5] } },
    { id: "railway", type: "line", source: "omt", "source-layer": "transportation", filter: ["==", "class", "rail"], paint: { "line-color": PALETTE.rail, "line-width": w(10, 0.8, 18, 3), "line-dasharray": [3, 2] } },
    { id: "major", type: "line", source: "omt", "source-layer": "transportation", filter: ["in", "class", ...MAJOR], paint: { "line-color": PALETTE.major, "line-width": w(6, 0.8, 12, 2, 18, 9) } },
  ],
};
