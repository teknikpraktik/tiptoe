import { describe, expect, it } from "vitest";
import { mapHeadingFromOrientation } from "@/sensors/compass";

const h = (alpha: number, beta: number, gamma = 0) => mapHeadingFromOrientation({ alpha, beta, gamma, absolute: true });
const near = (x: number | null, want: number) => { expect(x).not.toBeNull(); expect(Math.abs(((x! - want + 540) % 360) - 180)).toBeLessThan(1.5); };

describe("kartans kompasskurs", () => {
  it("plant: överkanten, alpha räknas moturs (alpha 90 = väster)", () => {
    near(h(0, 0), 0);
    near(h(90, 0), 270);
    near(h(270, 0), 90);
    near(h(90, 0, 30), 270); // sidolutning ändrar inte överkantens riktning
  });
  it("upprätt och däremellan: samma kurs utan hopp när telefonen lutas", () => {
    for (const beta of [0, 20, 45, 70, 90]) near(h(60, beta), 300);
  });
  it("iOS: webkitCompassHeading används, dålig noggrannhet ger null", () => {
    expect(mapHeadingFromOrientation({ alpha: 0, beta: 0, gamma: 0, webkitCompassHeading: 123 })).toBe(123);
    expect(mapHeadingFromOrientation({ alpha: 0, beta: 0, gamma: 0, webkitCompassHeading: 123, webkitCompassAccuracy: -1 })).toBeNull();
  });
  it("relativ orientering (inte mot norr) ger ingen kurs", () => {
    expect(mapHeadingFromOrientation({ alpha: 10, beta: 0, gamma: 0 })).toBeNull();
  });
});
