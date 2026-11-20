"use client";

/** Bakre kameran via getUserMedia. Ingen ljudupptagning. */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("getUserMedia unsupported"), { name: "NotSupportedError" });
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
}

export function stopStream(s: MediaStream | null | undefined): void {
  s?.getTracks().forEach((t) => t.stop());
}

/** Strömmen är död eller svart (iOS efter bakgrund): spåret avslutat eller tystat, eller videon har ingen storlek. */
export function streamLooksDead(s: MediaStream | null, video: HTMLVideoElement | null): boolean {
  if (!s || !video) return true;
  const t = s.getVideoTracks()[0];
  return !t || t.readyState === "ended" || t.muted || video.videoWidth === 0;
}

export type CameraErrorKind = "denied" | "notfound" | "unsupported" | "insecure" | "other";
export function cameraErrorKind(e: unknown): CameraErrorKind {
  const name = (e as { name?: string })?.name ?? "";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "notfound";
  if (name === "NotSupportedError") return "unsupported";
  return "other";
}
