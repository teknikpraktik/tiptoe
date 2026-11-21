import { describe, expect, it } from "vitest";
import { AnchoredYaw, cameraYawPitch } from "@/sensors/orientation";
import { headingFromOrientation } from "@/sensors/compass";
import { distanceQuality, placeAnimal, teleZoom, viewFor } from "@/camera/projection";
import { wrap180 } from "@/sensors/heading";

describe("kamerans riktning ur orienteringen", () => {
  it("upprätt telefon: höjdvinkel 0, kursen som kompassformeln", () => {
    for (const alpha of [0, 45, 90, 200, 300]) {
      const r = cameraYawPitch({ alpha, beta: 90, gamma: 0 });
      expect(r.pitchDeg).toBeCloseTo(0, 5);
      const c = headingFromOrientation({ alpha, beta: 90, gamma: 0, absolute: true }).headingDeg!;
      expect(Math.abs(wrap180(r.yawDeg! - c))).toBeLessThan(1e-6);
    }
  });
  it("lutad bakåt pekar kameran uppåt, framåt nedåt", () => {
    expect(cameraYawPitch({ alpha: 0, beta: 110, gamma: 0 }).pitchDeg).toBeCloseTo(20, 5);
    expect(cameraYawPitch({ alpha: 0, beta: 70, gamma: 0 }).pitchDeg).toBeCloseTo(-20, 5);
  });
  it("platt telefon: kameran pekar rakt ner och har ingen kurs", () => {
    const r = cameraYawPitch({ alpha: 10, beta: 0, gamma: 0 });
    expect(r.pitchDeg).toBeCloseTo(-90, 5);
    expect(r.yawDeg).toBeNull();
  });
});

describe("gyroförankring", () => {
  it("följer gyrot direkt och drar sig långsamt mot kompassen", () => {
    const a = new AnchoredYaw(2);
    expect(a.push(10, 100, 0)).toBeCloseTo(100, 6); // förskjutning 90
    // Gyrot vrids 30°: kursen följer genast.
    expect(a.push(40, 130, 50)).toBeCloseTo(130, 6);
    // Ett enstaka kompasshopp på 40° flyttar nästan inte bilden.
    const j = a.push(40, 170, 100)!;
    expect(Math.abs(wrap180(j - 130))).toBeLessThan(2);
    // Gyrodrift på 10° rättas efter några sekunder av en stadig kompass.
    let y = 0;
    for (let t = 150; t <= 12_000; t += 50) y = a.push(50, 130, t)!; // gyro säger 50 men kompassen 130
    expect(Math.abs(wrap180(y - 130))).toBeLessThan(1);
  });
  it("utan kompass: förankras vid öppning och står kvar", () => {
    const a = new AnchoredYaw();
    expect(a.push(5, null, 0)).toBeNull();
    a.anchor(5, 270);
    expect(a.push(5, null, 100)).toBeCloseTo(270, 6);
    expect(a.push(-40, null, 200)).toBeCloseTo(225, 6);
  });
  it("runt norr: ingen vändning åt fel håll", () => {
    const a = new AnchoredYaw(0.1);
    a.push(0, 355, 0);
    const y = a.push(0, 5, 2000)!;
    expect(Math.abs(wrap180(y - 5))).toBeLessThan(1);
  });
});

describe("placering i bilden", () => {
  const base = { distM: 25, cameraPitchDeg: 0, animalHeightM: 0.8, zoom: 1 };
  it("djur rakt fram hamnar i mitten (horisontellt) och under horisonten", () => {
    const p = placeAnimal({ ...base, bearingDeg: 90, cameraYawDeg: 90 });
    expect(p.x).toBeCloseTo(0.5, 6);
    expect(p.y).toBeGreaterThan(0.5);
    expect(p.inFrame).toBe(true);
  });
  it("panorering ±45° (synfält 50°): djuret lämnar bilden åt rätt håll och kommer tillbaka", () => {
    const left = placeAnimal({ ...base, bearingDeg: 90, cameraYawDeg: 135 });
    const right = placeAnimal({ ...base, bearingDeg: 90, cameraYawDeg: 45 });
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(1);
    expect(placeAnimal({ ...base, bearingDeg: 90, cameraYawDeg: 100 }).x).toBeLessThan(0.5);
    expect(placeAnimal({ ...base, bearingDeg: 90, cameraYawDeg: 80 }).x).toBeGreaterThan(0.5);
  });
  it("djur bakom spelaren ritas aldrig i bild", () => {
    expect(placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 180 }).inFrame).toBe(false);
  });
  it("zoom förstorar djuret och snävar synfältet", () => {
    const a = placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 5 });
    const b = placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 5, zoom: 3 });
    expect(b.heightFrac).toBeCloseTo(a.heightFrac * 3, 1);
    expect(Math.abs(b.x - 0.5)).toBeGreaterThan(Math.abs(a.x - 0.5) * 2.5);
  });
  it("kamerans höjdvinkel och spelarens justering flyttar djuret vertikalt", () => {
    const flat = placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 0 });
    const up = placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 0, cameraPitchDeg: 10 });
    expect(up.y).toBeGreaterThan(flat.y);
    expect(placeAnimal({ ...base, bearingDeg: 0, cameraYawDeg: 0, verticalNudge: -0.1 }).y).toBeCloseTo(flat.y - 0.1, 6);
  });
  it("zoom och kvalitet ur avståndet", () => {
    expect(teleZoom(5)).toBe(1);
    expect(teleZoom(24)).toBe(3);
    expect(teleZoom(100)).toBe(4);
    expect(distanceQuality(10, 30)).toBe(1);
    expect(distanceQuality(30, 30)).toBe(0);
    expect(distanceQuality(22.5, 30)).toBeCloseTo(0.5, 6);
  });
  it("utklippets vinkel ur djurets kurs", () => {
    expect(viewFor(0, 0)).toBe("back");
    expect(viewFor(180, 0)).toBe("front");
    expect(viewFor(90, 0)).toBe("right");
    expect(viewFor(270, 0)).toBe("left");
    expect(viewFor(135, 0)).toBe("quarter_right");
    expect(viewFor(225, 0)).toBe("quarter_left");
  });
});
