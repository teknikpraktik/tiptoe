// Bara för jämförelsen i spik 2 (dev-beroende). Se docs/SPIKE-2-GEOMETRI.md.
import { ClipType, Clipper64, ClipperOffset, EndType, FillRule, JoinType, type Path64, type Paths64 } from "clipper2-js";
import { normalize, ringArea, signedArea, type MultiPoly, type PolygonOps, type Pt } from "./ops";

/** Clipper2 (`clipper2-js`, heltals-API: koordinater i centimeter). */
const S = 100;
const ARC_TOL = 0.25 * S;

const path = (r: Pt[]): Path64 => r.map((p) => ({ x: Math.round(p.x * S), y: Math.round(p.y * S) })) as Path64;
const toPaths = (m: MultiPoly): Paths64 => m.map(normalize).flatMap((p) => [p.outer, ...p.holes]).map(path) as Paths64;
const ring = (p?: Path64): Pt[] => (p ?? []).map((q) => ({ x: q.x / S, y: q.y / S }));

/**
 * `Clipper64.executePolyTree` i clipper2-js 1.2.4 returnerar `false` och ett tomt träd (bugg). Därför platt resultat och egen nästning:
 * positiv area = yttre ring, negativ = hål, som läggs i den minsta yttre ring som innehåller hålets första punkt.
 */
function nest(paths: Paths64): MultiPoly {
  const rings = paths.map((p) => ring(p)).filter((r) => r.length >= 3);
  const outers = rings.filter((r) => signedArea(r) > 0).map((r) => ({ outer: r, holes: [] as Pt[][], a: ringArea(r) })).sort((a, b) => a.a - b.a);
  for (const h of rings.filter((r) => signedArea(r) < 0)) {
    const host = outers.find((o) => inside(h[0], o.outer));
    host?.holes.push(h);
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }));
}
function inside(p: Pt, r: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > p.y) !== (r[j].y > p.y) && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c;
  return c;
}

function op(type: ClipType, a: Paths64, b: Paths64 | null): MultiPoly {
  const c = new Clipper64();
  c.addSubjectPaths(a);
  if (b) c.addClipPaths(b);
  const sol = [] as unknown as Paths64;
  c.execute(type, FillRule.NonZero, sol);
  return nest(sol);
}

function inflate(paths: Paths64, delta: number, end: EndType, join = JoinType.Round): Paths64 {
  const o = new ClipperOffset(2, ARC_TOL);
  o.addPaths(paths, join, end);
  const out = [] as unknown as Paths64;
  o.execute(delta * S, out);
  return out;
}

export const clipper2Js: PolygonOps = {
  name: "clipper2-js",
  bufferLines: (lines, r) => op(ClipType.Union, inflate(lines.map(path) as Paths64, r, EndType.Round), null),
  bufferPolys: (m, r, join = "round") => op(ClipType.Union, inflate(toPaths(m), r, EndType.Polygon, join === "miter" ? JoinType.Miter : JoinType.Round), null),
  union: (a, b) => op(ClipType.Union, toPaths(a), toPaths(b)),
  intersect: (a, b) => op(ClipType.Intersection, toPaths(a), toPaths(b)),
};
