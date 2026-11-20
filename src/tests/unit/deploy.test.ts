import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..", "..", "..");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));

describe("Vercel-konfiguration", () => {
  it("Next.js-presetet läser byggmappen (.next) själv: outputDirectory får inte peka på exportmappen out/", () => {
    // Med "framework": "nextjs" tolkar Vercel outputDirectory som Nexts distDir och letar efter routes-manifest.json där.
    // Den statiska exporten i out/ hittas automatiskt (NEXT_NO_ROUTES_MANIFEST om out/ anges).
    expect(vercel.framework).toBe("nextjs");
    expect(vercel.outputDirectory).toBeUndefined();
  });
  it("huvudena för kamera, sensorer och service worker finns kvar", () => {
    const all = JSON.stringify(vercel.headers);
    expect(all).toContain("camera=(self)");
    expect(all).toContain("gyroscope=(self)");
    expect(all).toContain("Service-Worker-Allowed");
  });
});
