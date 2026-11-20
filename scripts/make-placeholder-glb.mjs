// Bygger en statisk glTF-modell (GLB) av ett rådjur av lådor, för 3D-jämförelsen i spik 1. Platshållare, inte slutmodell.
// Enheter i meter. Modellen står på y = 0 och tittar längs +z (framåt).
import { writeFileSync, mkdirSync } from "node:fs";

const BODY = [0.54, 0.35, 0.21, 1], DARK = [0.37, 0.23, 0.13, 1], RUMP = [0.94, 0.89, 0.82, 1];
// [cx, cy, cz, sx, sy, sz, rotX(rad), material]
const boxes = [
  [0, 0.68, 0, 0.32, 0.3, 0.95, 0, BODY],            // bål
  [0, 0.72, -0.5, 0.2, 0.2, 0.08, 0, RUMP],          // spegel
  ...[[-0.11, 0.32], [0.11, 0.32], [-0.11, -0.32], [0.11, -0.32]].map(([x, z]) => [x, 0.27, z, 0.07, 0.54, 0.07, 0, DARK]), // ben
  [0, 0.93, 0.5, 0.13, 0.42, 0.13, -0.5, BODY],      // hals
  [0, 1.12, 0.66, 0.15, 0.15, 0.3, 0.15, BODY],      // huvud
  [0, 1.08, 0.83, 0.09, 0.09, 0.08, 0.15, DARK],     // nos
  [-0.08, 1.24, 0.6, 0.04, 0.14, 0.06, 0, DARK],     // öron
  [0.08, 1.24, 0.6, 0.04, 0.14, 0.06, 0, DARK],
];

function box([cx, cy, cz, sx, sy, sz, rx]) {
  const P = [], N = [], I = [];
  const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, 1], [-1, 0, 0]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const rot = ([x, y, z]) => [x, y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  for (const [n, u, v] of faces) {
    const base = P.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map((k) => (n[k] + a * u[k] + b * v[k]) * [sx, sy, sz][k] / 2);
      const q = rot(p);
      P.push(q[0] + cx, q[1] + cy, q[2] + cz);
      N.push(...rot(n));
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { P, N, I };
}

const byMat = new Map();
for (const b of boxes) {
  const key = JSON.stringify(b[7]);
  const g = byMat.get(key) ?? { P: [], N: [], I: [], color: b[7] };
  const { P, N, I } = box(b);
  const off = g.P.length / 3;
  g.P.push(...P); g.N.push(...N); g.I.push(...I.map((i) => i + off));
  byMat.set(key, g);
}

const chunks = [], bufferViews = [], accessors = [], primitives = [], materials = [];
let offset = 0;
const pushView = (arr, target) => {
  const buf = Buffer.from(arr.buffer);
  const pad = (4 - (buf.length % 4)) % 4;
  chunks.push(buf, Buffer.alloc(pad));
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  offset += buf.length + pad;
  return bufferViews.length - 1;
};
for (const g of byMat.values()) {
  const pos = new Float32Array(g.P), nor = new Float32Array(g.N), idx = new Uint16Array(g.I);
  const min = [0, 1, 2].map((k) => Math.min(...g.P.filter((_, i) => i % 3 === k)));
  const max = [0, 1, 2].map((k) => Math.max(...g.P.filter((_, i) => i % 3 === k)));
  accessors.push({ bufferView: pushView(pos, 34962), componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
  accessors.push({ bufferView: pushView(nor, 34962), componentType: 5126, count: nor.length / 3, type: "VEC3" });
  accessors.push({ bufferView: pushView(idx, 34963), componentType: 5123, count: idx.length, type: "SCALAR" });
  materials.push({ pbrMetallicRoughness: { baseColorFactor: g.color, metallicFactor: 0, roughnessFactor: 0.9 } });
  const a = accessors.length;
  primitives.push({ attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: materials.length - 1 });
}
const bin = Buffer.concat(chunks);
const json = { asset: { version: "2.0", generator: "tiptoe placeholder" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "roe" }], meshes: [{ primitives }], materials, accessors, bufferViews, buffers: [{ byteLength: bin.length }] };
let js = Buffer.from(JSON.stringify(json));
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
mkdirSync("public/animals/placeholder", { recursive: true });
writeFileSync("public/animals/placeholder/roe.glb", Buffer.concat([header, jh, js, bh, bin]));
console.log("roe.glb", 12 + 8 + js.length + 8 + bin.length, "bytes");
