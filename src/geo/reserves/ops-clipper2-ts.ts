import { ClipType, EndType, FillRule, JoinType, PolyTreeD, booleanOpDWithPolyTree, inflatePathsD, type PathD, type PathsD, type PolyPathD } from "clipper2-ts";
import { normalize, type MultiPoly, type PolygonOps, type Pt } from "./ops";

/** Clipper2 (TypeScript-port `clipper2-ts`, inga beroenden). Precision 2 decimaler = centimeter. */
const PREC = 2;
const ARC_TOL = 0.25;

const toPaths = (m: MultiPoly): PathsD => m.map(normalize).flatMap((p) => [p.outer, ...p.holes]).map((r) => r.map((q) => ({ x: q.x, y: q.y })));
const ring = (p: PathD | null): Pt[] => (p ?? []).map((q) => ({ x: q.x, y: q.y }));

function fromTree(tree: PolyTreeD): MultiPoly {
  const out: MultiPoly = [];
  const walkOuter = (node: PolyPathD) => {
    const holes: Pt[][] = [];
    for (let i = 0; i < node.count; i++) {
      const h = node.child(i);
      holes.push(ring(h.poly));
      for (let k = 0; k < h.count; k++) walkOuter(h.child(k)); // öar i hålen
    }
    out.push({ outer: ring(node.poly), holes });
  };
  for (let i = 0; i < tree.count; i++) walkOuter(tree.child(i));
  return out;
}

function op(type: ClipType, a: PathsD, b: PathsD | null): MultiPoly {
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(type, a, b, tree, FillRule.NonZero, PREC);
  return fromTree(tree);
}

export const clipper2Ts: PolygonOps = {
  name: "clipper2-ts",
  bufferLines(lines, r) {
    const paths = inflatePathsD(lines.map((l) => l.map((q) => ({ x: q.x, y: q.y }))), r, JoinType.Round, EndType.Round, 2, PREC, ARC_TOL);
    return op(ClipType.Union, paths, null);
  },
  bufferPolys(m, r, join = "round") {
    const paths = inflatePathsD(toPaths(m), r, join === "miter" ? JoinType.Miter : JoinType.Round, EndType.Polygon, 2, PREC, ARC_TOL);
    return op(ClipType.Union, paths, null);
  },
  union: (a, b) => op(ClipType.Union, toPaths(a), toPaths(b)),
  intersect: (a, b) => op(ClipType.Intersection, toPaths(a), toPaths(b)),
};
