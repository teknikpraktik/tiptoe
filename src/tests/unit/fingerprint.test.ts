import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { worldFingerprint } from "@/sim/fingerprint";
import { simulateWalk } from "@/sim/balance";

const REF = path.join(import.meta.dirname, "..", "fixtures", "world-fingerprint.txt");

describe("världens fingeravtryck", () => {
  it("samma rutor och fönster ger samma individer som referensfilen", () => {
    const now = worldFingerprint();
    if (process.env.UPDATE_FINGERPRINT === "1" || !existsSync(REF)) writeFileSync(REF, now);
    expect(now).toBe(readFileSync(REF, "utf8"));
  });
});

describe("balans", () => {
  it("blandad miljö: ett möte per 2,5–6 minuter (tätare efter fälttest 1)", () => {
    const r = simulateWalk("mixed", { minutes: 45 });
    expect(r.minPerEncounter).toBeGreaterThanOrEqual(2.5);
    expect(r.minPerEncounter).toBeLessThanOrEqual(6);
  });
  it("natur oftare än bebyggelse", () => {
    expect(simulateWalk("nature", { minutes: 40 }).minPerEncounter).toBeLessThan(simulateWalk("urban", { minutes: 40 }).minPerEncounter);
  });
});
