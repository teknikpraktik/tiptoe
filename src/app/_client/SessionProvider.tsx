// Origin: teknikpraktik/solosurvival@033a121 src/app/_client/SessionProvider.tsx (kategori B: bara mönstren – en session för hela appen,
// visibilitychange, pagehide, felsökningshaken). Innehållet är nytt.
"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { openFreeMap } from "@/geo/blockers";
import { loadEnvironment } from "@/geo/environment";
import { cachedFetcher } from "@/play/tile-cache";
import { WalkSession, type WalkView } from "@/play/session";
import { Repo } from "@/storage/repo";
import type { Db } from "@/storage/idb";
import { BUILD_ID } from "./build";
import { appDb } from "./db";
import { isStandalone } from "./install";
import { useLang } from "./i18n";
import { createMotionSource } from "./motionSource";
import { walkStatus } from "./walkStatus";

interface Ctx { session: WalkSession; db: Db | null }
const C = createContext<Ctx | null>(null);

const DEBUG_KEY = "tiptoe.debug";
export const debugEnabled = () => { try { return localStorage.getItem(DEBUG_KEY) === "on"; } catch { return false; } };

/** En promenadsession för hela appen, så att GPS och promenad överlever sidbyten. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const { lang } = useLang();
  useEffect(() => {
    let cancelled = false;
    let session: WalkSession | null = null;
    (async () => {
      const db = await appDb();
      const ofm = openFreeMap();
      const tile = cachedFetcher(db, ofm.tile, ofm.version);
      session = new WalkSession({
        geo: typeof navigator !== "undefined" ? navigator.geolocation : undefined,
        repo: db ? new Repo(db) : null,
        loadEnv: (c, r) => loadEnvironment(c, r, tile),
        motion: createMotionSource(),
        wakeLock: "wakeLock" in navigator ? { request: () => (navigator as Navigator & { wakeLock: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock.request("screen") } : undefined,
        build: BUILD_ID,
        userAgent: navigator.userAgent,
        standalone: isStandalone(),
        persist: () => navigator.storage?.persist?.() ?? Promise.resolve(false),
      });
      await session.init(lang);
      if (cancelled) return;
      session.subscribe(() => walkStatus.set(session!.getView().stage === "walking"));
      // Felsökningshak för fälttest och e2e: localStorage "tiptoe.debug" = "on" ger window.__tiptoe.
      if (debugEnabled()) (window as unknown as { __tiptoe?: WalkSession }).__tiptoe = session;
      setCtx({ session, db });
    })();
    const vis = () => session?.onVisibility(document.hidden);
    const hide = () => session?.onPageHide();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", hide);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", hide); };
    // Språket läses bara när profilen skapas första gången.
  }, []);
  return <C.Provider value={ctx}>{children}</C.Provider>;
}

export const useSession = () => useContext(C);

const noop = () => () => undefined;
export function useWalkView(): WalkView | null {
  const s = useContext(C)?.session;
  return useSyncExternalStore(s ? s.subscribe : noop, s ? s.getView : () => null, () => null);
}
