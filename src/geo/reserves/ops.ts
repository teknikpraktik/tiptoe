/**
 * Polygonoperationer som reservatsgeometrin behöver, oberoende av bibliotek (spik 2 jämför Clipper2 och JSTS bakom samma gränssnitt).
 * Allt i lokala metriska koordinater (x = öster, y = norr, meter).
 */
export interface Pt { x: number; y: number }
/** En polygon: yttre ring och hål. Ringarna är inte slutna (första punkten upprepas inte). */
export interface Poly { outer: Pt[]; holes: Pt[][] }
export type MultiPoly = Poly[];

export interface PolygonOps {
  name: string;
  /** Buffra öppna linjer (runda ändar och hörn). */
  bufferLines(lines: Pt[][], r: number): MultiPoly;
  /**
   * Buffra polygoner utåt (r > 0) eller inåt (r < 0). `miter` ger spetsiga hörn (begränsat till 2 × r): ett hål i en korridor har spetsiga
   * hörn, och när det buffras tillbaka ska hörnen bli spetsiga igen, annars tappas r²(1 − π/4) per hörn.
   */
  bufferPolys(p: MultiPoly, r: number, join?: "round" | "miter"): MultiPoly;
  union(a: MultiPoly, b: MultiPoly): MultiPoly;
  intersect(a: MultiPoly, b: MultiPoly): MultiPoly;
}

export function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x + r[i].x) * (r[j].y - r[i].y);
  return Math.abs(a) / 2;
}

export const polyArea = (p: Poly): number => ringArea(p.outer) - p.holes.reduce((s, h) => s + ringArea(h), 0);
export const multiArea = (m: MultiPoly): number => m.reduce((s, p) => s + polyArea(p), 0);

/** Signerad area: positiv moturs (y uppåt). */
export function signedArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y;
  return a / 2;
}

/** Yttre ring moturs, hål medurs (det bibliotekens NonZero-regel förutsätter). */
export function normalize(p: Poly): Poly {
  const ccw = (r: Pt[], want: boolean) => ((signedArea(r) > 0) === want ? r : [...r].reverse());
  return { outer: ccw(p.outer, true), holes: p.holes.map((h) => ccw(h, false)) };
}
