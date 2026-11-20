"use client";

/** Installerad PWA (fristående läge). På iOS har en installerad app en egen lagringsbehållare, skild från Safari (spec: Installation före spel). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Chrome/Android: installationsdialogen sparas när webbläsaren erbjuder den, så att knappen kan visa den senare. */
interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: BeforeInstallPromptEvent | null = null;
const subs = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; subs.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; subs.forEach((f) => f()); });
}
export const installPrompt = {
  available: () => !!deferred,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  async show(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const r = await deferred.userChoice;
    deferred = null;
    subs.forEach((f) => f());
    return r.outcome === "accepted";
  },
};
