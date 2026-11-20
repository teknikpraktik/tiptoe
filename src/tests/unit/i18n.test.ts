import { describe, expect, it } from "vitest";
import { sv } from "@/i18n/sv";
import { en } from "@/i18n/en";
import { detectLang, t } from "@/i18n";

describe("i18n", () => {
  it("svenska och engelska har exakt samma nycklar och inga tomma texter", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(sv).sort());
    for (const d of [sv, en]) for (const v of Object.values(d)) expect(v.trim().length).toBeGreaterThan(0);
  });
  it("platshållarna är desamma på båda språken", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(sv) as (keyof typeof sv)[]) expect(ph(en[k]), k).toBe(ph(sv[k]));
  });
  it("ersätter platshållare", () => {
    expect(t("sv", "gps.accuracy", { m: 12 })).toBe("±12 m");
  });
  it("väljer språk ur enhetens önskemål", () => {
    expect(detectLang(["sv-SE", "en"])).toBe("sv");
    expect(detectLang(["en-GB"])).toBe("en");
    expect(detectLang(["de-DE"])).toBe("en");
    expect(detectLang([])).toBe("sv");
  });
});
