import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BRAND } from "@/config/brand";
import { sv } from "@/i18n/sv";
import { en } from "@/i18n/en";
import { DB_NAME } from "@/storage/idb";
import { EXPORT_FORMAT } from "@/storage/transfer";
import { WORLD } from "@/engine/config";

const OLD = /tiptoe|wild encounters/i;
const BAD = /\b(SPAR|Spar|Spor|SPOOR)\b/;

describe("varumärket SPÅR", () => {
  it("heter SPÅR i båda språken, med Å i korrekt Unicode (NFC)", () => {
    expect(sv["app.name"]).toBe("SPÅR");
    expect(en["app.name"]).toBe("SPÅR");
    expect(BRAND.name).toBe("SPÅR");
    expect(BRAND.name.normalize("NFC")).toBe(BRAND.name);
  });
  it("inga synliga texter nämner det gamla namnet eller felstavningar", () => {
    for (const dict of [sv, en]) for (const [k, v] of Object.entries(dict)) {
      expect(OLD.test(v), `${k}: ${v}`).toBe(false);
      expect(BAD.test(v), `${k}: ${v}`).toBe(false);
    }
  });
  it("PWA-manifestet och sidans metadata", () => {
    const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(m.name).toBe("SPÅR");
    expect(m.short_name).toBe("SPÅR");
    expect(OLD.test(JSON.stringify(m))).toBe(false);
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toMatch(/title: BRAND\.title/);
    expect(layout).toMatch(/appleWebApp: \{ capable: true, title: BRAND\.name/);
    expect(layout).toMatch(/openGraph:/);
    expect(BRAND.title).toBe("SPÅR – Wildlife Adventure");
  });
});

describe("persistenta identifierare är oförändrade (spelarnas data och den delade världen)", () => {
  it("databas, exportformat och världsnyckel heter som före namnbytet", () => {
    expect(DB_NAME).toBe("tiptoe");
    expect(EXPORT_FORMAT).toBe("tiptoe-profile");
    expect(WORLD.key).toBe("tiptoe-world-v1");
  });
  it("lagringsnycklarna för språk, ljud, felsökning och tips", () => {
    expect(readFileSync("src/app/_client/i18n.tsx", "utf8")).toContain('"tiptoe.lang"');
    expect(readFileSync("src/app/_client/audio.ts", "utf8")).toContain('"tiptoe.sound"');
    expect(readFileSync("src/app/_client/SessionProvider.tsx", "utf8")).toContain('"tiptoe.debug"');
    expect(readFileSync("src/app/walk/Walk.tsx", "utf8")).toContain("`tiptoe.hint.${key}`");
  });
});

describe("filnamn vid delning och export", () => {
  it("bara ASCII (annars sparar webbläsaren filen som download)", async () => {
    const { asciiFileName } = await import("@/config/brand");
    expect(asciiFileName("export-Åsa Öberg-2026-11-22.zip")).toBe("export-Asa_Oberg-2026-11-22.zip");
    expect(asciiFileName("djurfoto-ph1.jpg")).toBe("djurfoto-ph1.jpg");
  });
});
