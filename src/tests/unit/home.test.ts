import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { HOME_BACKGROUNDS, homeBackground } from "@/app/_client/Home";

describe("startsidans bakgrund", () => {
  it("alla bakgrunder finns som filer", () => {
    for (const list of Object.values(HOME_BACKGROUNDS)) for (const n of list) expect(existsSync(`public/backgrounds/${n}.webp`), n).toBe(true);
  });
  it("följer dygnets fas och är densamma hela dagen", () => {
    const noon = Date.UTC(2026, 5, 15, 11, 0), night = Date.UTC(2026, 11, 15, 23, 0);
    expect(HOME_BACKGROUNDS.day.map((n) => `/backgrounds/${n}.webp`)).toContain(homeBackground(noon));
    expect(homeBackground(night)).toBe("/backgrounds/night.webp");
    expect(homeBackground(noon + 3_600_000)).toBe(homeBackground(noon));
    // Olika dagar ger olika bilder inom fasen.
    const days = new Set([0, 1, 2].map((d) => homeBackground(noon + d * 86_400_000)));
    expect(days.size).toBe(3);
  });
});
