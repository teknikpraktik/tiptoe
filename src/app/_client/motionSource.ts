"use client";

import type { MotionSource } from "@/play/session";

/** Accelerometern (inklusive tyngdkraft) för stegräkningen. iOS kräver `DeviceMotionEvent.requestPermission` i en användargest. */
export function createMotionSource(): MotionSource | undefined {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return undefined;
  let h: ((e: DeviceMotionEvent) => void) | null = null;
  return {
    async requestPermission() {
      const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
      if (typeof DME.requestPermission === "function") {
        try { return (await DME.requestPermission()) === "granted" ? "granted" : "denied"; } catch { return "denied"; }
      }
      return "granted";
    },
    start(onSample) {
      if (h) window.removeEventListener("devicemotion", h);
      h = (e) => {
        const a = e.accelerationIncludingGravity;
        if (!a || a.x == null || a.y == null || a.z == null) return;
        onSample(Math.hypot(a.x, a.y, a.z), performance.timeOrigin + e.timeStamp);
      };
      window.addEventListener("devicemotion", h);
    },
    stop() { if (h) window.removeEventListener("devicemotion", h); h = null; },
  };
}
