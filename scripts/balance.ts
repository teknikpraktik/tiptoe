// Balanssimulatorn: minuter per möte i natur, blandad miljö och bebyggelse. Kör: npx tsx scripts/balance.ts
import { balanceReport } from "../src/sim/balance";

const r = balanceReport(8, 60);
for (const [route, x] of Object.entries(r)) console.log(`${route.padEnd(7)} ${x.minPerEncounter} min/möte  (körningar: ${x.runs.join(", ")})  arter: ${JSON.stringify(x.species)}`);
