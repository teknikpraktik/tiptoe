import type { Tempo } from "@/engine/species";

/**
 * Spelarens tempo ur telefonens rörelsesensor (spec: tempot mäts med rörelsesensorn – steg – inte med GPS-fart). GPS-fart används bara som
 * reserv när sensorn saknas eller är nekad. Ren logik: matas med accelerationens belopp (m/s², inklusive tyngdkraft) och tid.
 */
export const TEMPO = {
  /** Kadens (steg/s): under smyg = smyg, över spring = spring. Vanlig gång ~1,7–2,0 steg/s. */
  sneakBelowHz: 1.45,
  runAboveHz: 2.5,
  /** Inga steg på så här länge = stilla. */
  stillAfterMs: 1500,
  /** Fönster för kadensen. */
  windowMs: 4000,
  /** Toppar: minsta höjd över medelnivån (m/s²) och minsta tid mellan steg. */
  peakMin: 1.2,
  minStepMs: 250,
  /** Reserv utan sensor: GPS-fart (m/s). */
  gps: { stillBelow: 0.3, sneakBelow: 0.9, runAbove: 2.4 },
} as const;

export class StepDetector {
  private mean = 9.81;
  private prev = 0;
  private rising = false;
  private lastStep = -Infinity;
  private steps: number[] = [];
  private lastSampleMs = -Infinity;

  /** Ett prov: accelerationens belopp. Returnerar true när ett steg upptäcktes. */
  push(mag: number, tMs: number): boolean {
    this.lastSampleMs = tMs;
    // Långsamt medelvärde (tyngdkraften + bias), snabb topp-detektion över det.
    this.mean += (mag - this.mean) * 0.02;
    const v = mag - this.mean;
    let step = false;
    if (v < this.prev && this.rising && this.prev > TEMPO.peakMin && tMs - this.lastStep >= TEMPO.minStepMs) {
      this.lastStep = tMs;
      this.steps.push(tMs);
      step = true;
    }
    this.rising = v > this.prev;
    this.prev = v;
    while (this.steps.length && tMs - this.steps[0] > TEMPO.windowMs) this.steps.shift();
    return step;
  }

  /** Steg per sekund i fönstret, eller 0 om senaste steget var för länge sedan. */
  cadenceAt(tMs: number): number {
    if (tMs - this.lastStep > TEMPO.stillAfterMs) return 0;
    const recent = this.steps.filter((t) => tMs - t <= TEMPO.windowMs);
    if (recent.length < 2) return 0.5;
    return (recent.length - 1) / ((recent[recent.length - 1] - recent[0]) / 1000);
  }

  /** Sensorn har levererat prov nyligen. */
  alive(tMs: number): boolean { return tMs - this.lastSampleMs < 1500; }
}

export function tempoFromCadence(hz: number): Tempo {
  if (hz <= 0) return "still";
  if (hz < TEMPO.sneakBelowHz) return "sneak";
  if (hz > TEMPO.runAboveHz) return "run";
  return "walk";
}

export function tempoFromSpeed(mps: number | null): Tempo {
  if (mps == null || mps < TEMPO.gps.stillBelow) return "still";
  if (mps < TEMPO.gps.sneakBelow) return "sneak";
  if (mps > TEMPO.gps.runAbove) return "run";
  return "walk";
}

/** Tempo: sensorn om den lever, annars GPS-farten. Springer GPS:en tydligt (cykel, bil) räknas det som spring oavsett steg. */
export function currentTempo(d: StepDetector | null, tMs: number, gpsSpeedMps: number | null): { tempo: Tempo; source: "motion" | "gps" } {
  if (d && d.alive(tMs)) {
    const t = tempoFromCadence(d.cadenceAt(tMs));
    if (gpsSpeedMps != null && gpsSpeedMps > 4) return { tempo: "run", source: "motion" };
    return { tempo: t, source: "motion" };
  }
  return { tempo: tempoFromSpeed(gpsSpeedMps), source: "gps" };
}
