import { wrap180, wrap360 } from "./heading";

/**
 * Kamerans riktning ur telefonens orientering, för kameravyn (spik 1). Ren logik, testbar utan webbläsare.
 *
 * Bakre kameran pekar längs telefonens negativa z-axel. Med W3C:s Euler-vinklar (alpha kring jordens lodlinje, beta kring x, gamma kring y)
 * blir den axeln i världskoordinater
 *   v = (−sinγ·cosα − cosγ·sinβ·sinα,  −sinγ·sinα + cosγ·sinβ·cosα,  −cosγ·cosβ)
 * Kursen (yaw) räknas som i `compass.ts` (samma formel), och höjdvinkeln (pitch) är asin(v.z): 0 när telefonen hålls upprätt,
 * positiv när kameran pekar uppåt.
 */
export interface Euler { alpha: number; beta: number; gamma: number }

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function cameraAxis(e: Euler): { x: number; y: number; z: number } {
  const a = rad(e.alpha), b = rad(e.beta), g = rad(e.gamma);
  return {
    x: -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(b) * Math.sin(a),
    y: -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(b) * Math.cos(a),
    z: -Math.cos(g) * Math.cos(b),
  };
}

/** Kamerans kurs (0 = alpha-nollriktningen, medsols) och höjdvinkel i grader. Kursen är null när kameran pekar rakt upp eller ner. */
export function cameraYawPitch(e: Euler): { yawDeg: number | null; pitchDeg: number } {
  const v = cameraAxis(e);
  const pitchDeg = deg(Math.asin(Math.max(-1, Math.min(1, v.z))));
  const h = Math.hypot(v.x, v.y);
  // Samma tecken som compass.ts: alpha räknas moturs, kursen medsols.
  const yawDeg = h < 1e-3 ? null : wrap360(deg(Math.atan2(v.x, v.y)));
  return { yawDeg, pitchDeg };
}

/**
 * Gyroförankring: gyrots relativa kurs är jämn men driver och saknar norr; kompassen har norr men darrar. Kursen som visas är
 * gyrokursen plus en förskjutning som långsamt (tidskonstant `tauS`) dras mot kompassen. Ett kompasshopp syns därför inte som ett ryck,
 * och drift rättas inom några sekunder. Saknas kompass behålls förskjutningen (djuret står kvar relativt där kameran öppnades).
 */
export class AnchoredYaw {
  private offset: number | null = null;
  private lastMs = 0;
  constructor(private readonly tauS = 2.5) {}

  /** Gyrokurs (relativ eller absolut) och kompasskurs (absolut, eller null). Returnerar förankrad kurs 0–360, eller null innan första kompassvärdet. */
  push(gyroYawDeg: number, compassDeg: number | null, tMs: number): number | null {
    if (compassDeg != null) {
      const want = wrap180(compassDeg - gyroYawDeg);
      if (this.offset == null) this.offset = want;
      else {
        const dt = Math.max(0, Math.min(1, (tMs - this.lastMs) / 1000));
        this.offset += wrap180(want - this.offset) * (1 - Math.exp(-dt / this.tauS));
      }
    }
    this.lastMs = tMs;
    return this.offset == null ? null : wrap360(gyroYawDeg + this.offset);
  }

  /** Utan kompass: förankra så att `gyroYawDeg` motsvarar `yawDeg` (t.ex. djurets bäring när vyn öppnas). */
  anchor(gyroYawDeg: number, yawDeg: number): void { this.offset = wrap180(yawDeg - gyroYawDeg); }

  get anchored(): boolean { return this.offset != null; }
  reset(): void { this.offset = null; }
}
