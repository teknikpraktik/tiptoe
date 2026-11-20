// Kör alla e2e/*.e2e.mjs i tur och ordning mot `out/` (kräver `npm run build`).
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const only = process.argv[2];
let failed = 0;
for (const f of readdirSync("e2e").filter((f) => f.endsWith(".e2e.mjs")).sort()) {
  if (only && !f.includes(only)) continue;
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [`e2e/${f}`], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
if (failed) { console.error(`\n${failed} e2e file(s) failed`); process.exit(1); }
