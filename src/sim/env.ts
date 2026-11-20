import { fromLocal, type LatLon } from "@/geo/geometry";
import { makeEnvironment, type Environment } from "@/geo/environment";
import type { MvtFeature } from "@/geo/mvt";

/**
 * Syntetisk miljö för tester och balanssimulatorn: fyra zoner à 1 × 1 km runt ORIGIN (lokala meter, x = öster, y = norr), ett stignät var
 * 80:e meter, en sjö, kvarter med hus och en större väg.
 *
 *   y 1000 ┌────────────┬────────────┐
 *          │  park      │  bebyggelse│  (hus 20 × 20 m i rutnät, gator)
 *   y 0    ├────────────┼────────────┤
 *          │  skog      │  åker      │  (sjö 200 × 200 m i skogen)
 *   y -1000└────────────┴────────────┘
 *        x -1000        0          1000      större väg längs y = −20 (x 0 … 1000)
 */
export const SIM_ORIGIN: LatLon = { lat: 59.38, lon: 13.5 };
const L = (x: number, y: number) => fromLocal(SIM_ORIGIN, { x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): LatLon[] => [L(x0, y0), L(x1, y0), L(x1, y1), L(x0, y1)];
const poly = (layer: string, cls: string, ring: LatLon[], holes: LatLon[][] = []): MvtFeature => ({ layer, type: 3, props: cls ? { class: cls } : {}, polygons: [[ring, ...holes]] });
const line = (cls: string, pts: [number, number][]): MvtFeature => ({ layer: "transportation", type: 2, props: { class: cls }, lines: [pts.map(([x, y]) => L(x, y))] });

export function simFeatures(): MvtFeature[] {
  const f: MvtFeature[] = [
    poly("landcover", "wood", rect(-1000, -1000, 0, 0)),
    poly("landcover", "farmland", rect(0, -1000, 1000, 0)),
    poly("park", "", rect(-1000, 0, 0, 1000)),
    poly("landcover", "grass", rect(-900, 100, -100, 900)),
    poly("landuse", "residential", rect(0, 0, 1000, 1000)),
    poly("water", "lake", rect(-700, -700, -500, -500)),
  ];
  // Stignät: stigar i skog och park, gator i bebyggelse, traktorvägar på åkern.
  for (let k = -960; k <= 960; k += 80) {
    f.push(line(k < 0 ? "path" : "minor", [[k, 0], [k, 1000]]));
    f.push(line(k < 0 ? "path" : "track", [[k, -1000], [k, 0]]));
    f.push(line(k < 0 ? "path" : "minor", [[-1000, k], [0, k]].map(([x, y]) => [x, y]) as [number, number][]));
    f.push(line(k < 0 ? "track" : "minor", [[0, k], [1000, k]]));
  }
  // Hus mellan gatorna.
  for (let x = 20; x < 1000; x += 80) for (let y = 20; y < 1000; y += 80) f.push(poly("building", "", rect(x + 10, y + 10, x + 30, y + 30)));
  f.push(line("primary", [[0, -20], [1000, -20]]));
  return f;
}

let cached: Environment | null = null;
export const simEnvironment = (): Environment => (cached ??= makeEnvironment(simFeatures()));
export const simPoint = L;
