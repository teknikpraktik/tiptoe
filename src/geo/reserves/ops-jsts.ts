// Bara för jämförelsen i spik 2 (dev-beroende). Se docs/SPIKE-2-GEOMETRI.md.
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import BufferParameters from "jsts/org/locationtech/jts/operation/buffer/BufferParameters.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import type { MultiPoly, PolygonOps, Pt } from "./ops";

/** JSTS (JTS-port; samma motor som Turfs `buffer`). Ingen typdefinition för 2.x: minsta möjliga typning här. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;
const gf: G = new (GeometryFactory as any)();
const QUADSEGS = 16;

const coords = (r: Pt[]) => { const c = r.map((p) => new (Coordinate as any)(p.x, p.y)); c.push(c[0]); return c; };
const toGeom = (m: MultiPoly): G => gf.createMultiPolygon(m.filter((p) => p.outer.length >= 3).map((p) => gf.createPolygon(gf.createLinearRing(coords(p.outer)), p.holes.filter((h) => h.length >= 3).map((h) => gf.createLinearRing(coords(h))))));
const ring = (lr: G): Pt[] => { const cs = lr.getCoordinates(); return cs.slice(0, -1).map((c: G) => ({ x: c.x, y: c.y })); };
function fromGeom(g: G): MultiPoly {
  const out: MultiPoly = [];
  for (let i = 0; i < g.getNumGeometries(); i++) {
    const p = g.getGeometryN(i);
    if (p.getGeometryType() !== "Polygon" || p.isEmpty()) continue;
    const holes: Pt[][] = [];
    for (let k = 0; k < p.getNumInteriorRing(); k++) holes.push(ring(p.getInteriorRingN(k)));
    out.push({ outer: ring(p.getExteriorRing()), holes });
  }
  return out;
}
const buffer = (g: G, r: number, join: "round" | "miter" = "round") => (BufferOp as any).bufferOp(g, r, new (BufferParameters as any)(QUADSEGS, (BufferParameters as any).CAP_ROUND, join === "miter" ? (BufferParameters as any).JOIN_MITRE : (BufferParameters as any).JOIN_ROUND, 2));

export const jsts: PolygonOps = {
  name: "jsts",
  bufferLines: (lines, r) => fromGeom(buffer(gf.createMultiLineString(lines.filter((l) => l.length >= 2).map((l) => gf.createLineString(l.map((p) => new (Coordinate as any)(p.x, p.y))))), r)),
  bufferPolys: (m, r, join) => fromGeom(buffer(toGeom(m), r, join)),
  union: (a, b) => fromGeom((OverlayOp as any).overlayOp(buffer(toGeom(a), 0), buffer(toGeom(b), 0), (OverlayOp as any).UNION)),
  intersect: (a, b) => fromGeom((OverlayOp as any).overlayOp(buffer(toGeom(a), 0), buffer(toGeom(b), 0), (OverlayOp as any).INTERSECTION)),
};
