"use client";

import { mapHeadingFromOrientation } from "@/sensors/compass";
import { wrap180, wrap360 } from "@/sensors/heading";

interface IosOrientationEvent extends DeviceOrientationEvent { webkitCompassHeading?: number; webkitCompassAccuracy?: number }

/** Kursen räknas som för gammal efter så här lång tid utan mätning (sensorn tystnade, sidan i bakgrunden). */
const STALE_MS = 1500;
/** Utjämning av kompassbruset (s): kort, så att kartan svarar snabbt när man vänder sig. */
const TAU_S = 0.12;

let heading: number | null = null;
let at = 0;
let started = false;

const onEvent = (ev: Event) => {
  const e = ev as IosOrientationEvent;
  const angle = typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
  const h = mapHeadingFromOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: ev.type === "deviceorientationabsolute" || e.absolute, webkitCompassHeading: e.webkitCompassHeading, webkitCompassAccuracy: e.webkitCompassAccuracy }, angle);
  if (h == null) return;
  const now = performance.now();
  if (heading == null || now - at > STALE_MS) heading = h;
  else heading = wrap360(heading + wrap180(h - heading) * (1 - Math.exp(-(now - at) / 1000 / TAU_S)));
  at = now;
};

/**
 * Kompassen för kartans rotation (kompass upp). Android: `deviceorientationabsolute`; iOS: `webkitCompassHeading` i `deviceorientation`,
 * efter `requestPermission` i en användargest. Utan kompass ger `heading()` null och kartan använder färdriktningen från GPS.
 */
export const mapCompass = {
  /** Anropas direkt i en klickhanterare (iOS). Startar lyssnarna när behörigheten finns. */
  async requestPermission(): Promise<"granted" | "denied" | "unsupported"> {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return "unsupported";
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    let r: "granted" | "denied" = "granted";
    if (typeof DOE.requestPermission === "function") { try { r = (await DOE.requestPermission()) === "granted" ? "granted" : "denied"; } catch { r = "denied"; } }
    if (r === "granted") mapCompass.start();
    return r;
  },
  /** Lyssnar (utan att fråga om behörighet). På iOS kommer händelser bara om behörigheten redan getts. */
  start(): void {
    if (started || typeof window === "undefined") return;
    started = true;
    window.addEventListener("ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", onEvent, true);
  },
  /** Utjämnad kompasskurs 0–360, eller null om ingen färsk mätning finns. */
  heading(now = performance.now()): number | null {
    return heading != null && now - at < STALE_MS ? heading : null;
  },
};
