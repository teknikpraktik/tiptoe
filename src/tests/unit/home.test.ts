import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { HOME_BACKGROUNDS, homeBackground } from "@/app/_client/Home";

describe("startsidans bakgrund", () => {
  it("alla bakgrunder finns som filer", () => {
    for (const n of HOME_BACKGROUNDS) expect(existsSync(`public/backgrounds/${n}.webp`), n).toBe(true);
  });
  it("samma bild hela dagen, olika bilder olika dagar", () => {
    const noon = Date.UTC(2026, 5, 15, 11, 0);
    expect(homeBackground(noon + 3_600_000)).toBe(homeBackground(noon));
    expect(new Set([0, 1, 2, 3, 4, 5].map((d) => homeBackground(noon + d * 86_400_000))).size).toBe(HOME_BACKGROUNDS.length);
  });
});
