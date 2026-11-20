import { readFileSync } from "node:fs";
import path from "node:path";
import { ENV_LAYERS, makeEnvironment } from "@/geo/environment";
import { decodeFeatures } from "@/geo/mvt";
import { WORLD } from "@/engine/config";
import { candidates, cellsAround, idlePose } from "@/engine/world";
import { simEnvironment, simPoint } from "./env";

/**
 * Världens regressionsfingeravtryck: samma rutor och fönster ska ge samma individer (id, art, plats) och samma tomgångsrörelser. En avsiktlig
 * ändring av världen uppdaterar referensfilen i samma PR: `UPDATE_FINGERPRINT=1 npx vitest run fingerprint`.
 */
export function worldFingerprint(): string {
  const lines: string[] = [];
  const w0 = 245_000; // ett fast fönster (år 2025)
  const dump = (label: string, env: ReturnType<typeof simEnvironment>, center: { lat: number; lon: number }) => {
    for (const w of [w0, w0 + 1]) for (const c of cellsAround(center, 400)) for (const k of candidates(c, w, env)) {
      const p = idlePose(k, w * WORLD.windowMs + 3_600_000, env);
      lines.push(`${label} ${w} ${c.row},${c.col} #${k.n} ${k.id} ${k.species} ${k.home.lat.toFixed(6)},${k.home.lon.toFixed(6)} 1h:${p.state}@${p.pos.lat.toFixed(6)},${p.pos.lon.toFixed(6)}`);
    }
  };
  dump("sim", simEnvironment(), simPoint(0, 0));
  const FIX = path.join(import.meta.dirname, "..", "tests", "fixtures", "mvt");
  const feats = [[8804, 4811], [8805, 4811]].flatMap(([x, y]) => decodeFeatures(new Uint8Array(readFileSync(path.join(FIX, `14-${x}-${y}.pbf`))), 14, x, y, ENV_LAYERS));
  dump("karlstad", makeEnvironment(feats), { lat: 59.40731, lon: 13.46753 });
  return lines.join("\n") + "\n";
}
