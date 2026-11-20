// Spik 2: jämför polygonbiblioteken. Kör: npx tsx scripts/spike2-bench.ts
import { runBench } from "../src/geo/reserves/bench";
import { clipper2Ts } from "../src/geo/reserves/ops-clipper2-ts";
import { clipper2Js } from "../src/geo/reserves/ops-clipper2-js";
import { jsts } from "../src/geo/reserves/ops-jsts";

for (const r of runBench([clipper2Ts, clipper2Js, jsts], 15)) {
  console.log(`\n## ${r.lib}: ${r.passed}/${r.total} fixturer, lång promenad ${r.longWalkPoints} punkter → ${r.longWalkHa} ha på ${r.longWalkMs} ms (median)`);
  for (const [k, v] of Object.entries(r.details)) console.log(`  ${k}: ${v}`);
}
