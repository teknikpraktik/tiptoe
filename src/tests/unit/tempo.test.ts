import { describe, expect, it } from "vitest";
import { currentTempo, StepDetector, tempoFromCadence, tempoFromSpeed } from "@/sensors/tempo";
import { noiseGen } from "@/sim/tracks";

/** Syntetisk accelerometer: ett steg = en topp på ~3 m/s² över 9,81, med brus. */
function feed(d: StepDetector, hz: number, secs: number, t0 = 0, noise = 0.3) {
  const n = noiseGen(3);
  let t = t0;
  for (let i = 0; i < secs * 50; i++) {
    t = t0 + i * 20;
    const phase = hz > 0 ? ((t / 1000) * hz) % 1 : 0.5;
    const bump = hz > 0 ? 3 * Math.exp(-((phase - 0.5) ** 2) / 0.01) : 0;
    d.push(9.81 + bump + n(noise), t);
  }
  return t;
}

describe("tempo ur steg", () => {
  it("räknar kadensen och klassar stilla/smyg/gång/spring", () => {
    for (const [hz, want] of [[1.1, "sneak"], [1.8, "walk"], [2.9, "run"]] as const) {
      const d = new StepDetector();
      const t = feed(d, hz, 8);
      expect(d.cadenceAt(t)).toBeCloseTo(hz, 0);
      expect(currentTempo(d, t, null).tempo, `${hz} Hz`).toBe(want);
    }
    const still = new StepDetector();
    const t = feed(still, 0, 5);
    expect(currentTempo(still, t, 0.8).tempo).toBe("still"); // GPS-brus (0,8 m/s) skrämmer inte: sensorn säger stilla
  });
  it("utan sensor: GPS-fart som reserv", () => {
    expect(currentTempo(null, 0, 1.3)).toEqual({ tempo: "walk", source: "gps" });
    expect(tempoFromSpeed(null)).toBe("still");
    expect(tempoFromSpeed(0.6)).toBe("sneak");
    expect(tempoFromSpeed(3)).toBe("run");
    expect(tempoFromCadence(0)).toBe("still");
  });
});
