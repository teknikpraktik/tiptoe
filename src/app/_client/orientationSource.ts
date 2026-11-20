"use client";

import { headingFromOrientation } from "@/sensors/compass";
import { cameraYawPitch } from "@/sensors/orientation";

interface IosOrientationEvent extends DeviceOrientationEvent { webkitCompassHeading?: number; webkitCompassAccuracy?: number }

export interface OrientationSample {
  /** Gyrots kurs för kameran (relativ på iOS/Android-Chrome, absolut om bara den absoluta händelsen finns). Null när kameran pekar rakt upp/ner. */
  gyroYawDeg: number | null;
  pitchDeg: number;
  /** Kompasskurs (absolut), eller null. */
  compassDeg: number | null;
  tMs: number;
}

export type OrientationStatus = "granted" | "denied" | "unsupported";

/**
 * Telefonens orientering för kameravyn. Behörigheten på iOS hanteras som i Outbreaks `compass.ts`: `DeviceOrientationEvent.requestPermission`
 * måste anropas från en användargest. Android ger relativ orientering i `deviceorientation` och absolut i `deviceorientationabsolute`.
 */
export function createOrientationSource() {
  let handlers: [string, (e: Event) => void][] = [];
  const stop = () => { for (const [n, h] of handlers) window.removeEventListener(n, h, true); handlers = []; };
  return {
    /** Anropas direkt i en klickhanterare (iOS). */
    async requestPermission(): Promise<OrientationStatus> {
      if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return "unsupported";
      const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof DOE.requestPermission === "function") {
        try { return (await DOE.requestPermission()) === "granted" ? "granted" : "denied"; } catch { return "denied"; }
      }
      return "granted";
    },
    start(onSample: (s: OrientationSample) => void): void {
      stop();
      let compass: number | null = null;
      let hasRelative = false;
      const rel = (ev: Event) => {
        const e = ev as IosOrientationEvent;
        if (e.alpha == null || e.beta == null || e.gamma == null) return;
        // iOS: kompassen kommer i samma händelse.
        if (e.webkitCompassHeading != null) compass = headingFromOrientation({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, webkitCompassHeading: e.webkitCompassHeading, webkitCompassAccuracy: e.webkitCompassAccuracy }).headingDeg;
        if (e.absolute) { abs(ev); return; }
        hasRelative = true;
        const { yawDeg, pitchDeg } = cameraYawPitch({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
        onSample({ gyroYawDeg: yawDeg, pitchDeg, compassDeg: compass, tMs: performance.now() });
      };
      const abs = (ev: Event) => {
        const e = ev as DeviceOrientationEvent;
        if (e.alpha == null || e.beta == null || e.gamma == null) return;
        const { yawDeg, pitchDeg } = cameraYawPitch({ alpha: e.alpha, beta: e.beta, gamma: e.gamma });
        compass = yawDeg;
        if (!hasRelative) onSample({ gyroYawDeg: yawDeg, pitchDeg, compassDeg: compass, tMs: performance.now() });
      };
      handlers = [["deviceorientation", rel]];
      if ("ondeviceorientationabsolute" in window) handlers.push(["deviceorientationabsolute", abs]);
      for (const [n, h] of handlers) window.addEventListener(n, h, true);
    },
    stop,
  };
}
