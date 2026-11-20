"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ALL_SPECIES } from "@/engine/species";
import { useT } from "./i18n";
import { installPrompt, isIos, isStandalone } from "./install";
import { Modal } from "./Modal";
import { useSession, useWalkView } from "./SessionProvider";

/** Startskärmen: namnet, Starta promenad, (senare) fältdagbok och inställningar, och uppmaningen att installera före första promenaden. */
export function Home() {
  const t = useT();
  const router = useRouter();
  const ctx = useSession();
  const v = useWalkView();
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [warn, setWarn] = useState(false);
  const canInstall = useSyncExternalStore(installPrompt.subscribe, installPrompt.available, () => false);
  useEffect(() => { setStandalone(isStandalone()); setIos(isIos()); }, []);

  const go = async () => {
    setWarn(false);
    // Promenaden startas i klicket (iOS: rörelsesensorn kräver en användargest), sedan kartan.
    if (ctx && v?.stage === "idle") await ctx.session.start();
    router.push("/walk");
  };
  const going = v?.stage === "walking" || v?.stage === "paused";
  // I webbläsarläge varnas en gång per sidvisning innan en ny promenad (spec: varnar i Safari-läge).
  const start = () => (!standalone && !going ? setWarn(true) : void go());

  return (
    <main className="home">
      <header className="homehead">
        <h1 className="title">{t("app.name")}</h1>
        <p className="sub">{t("app.subtitle")}</p>
        <p className="tagline">{t("app.tagline")}</p>
      </header>
      <nav className="homenav">
        {!standalone && (
          <div className="card install" data-testid="install">
            <h3>{t("install.title")}</h3>
            <p className="muted">{t("install.why")}</p>
            <p className="muted">{ios ? t("install.ios") : t("install.android")}</p>
            {canInstall && <button className="btn primary wide" onClick={() => void installPrompt.show()}>{t("install.button")}</button>}
          </div>
        )}
        {v && v.storage === "ok" && (
          <p className="muted center" data-testid="stats">{t("home.stats", { points: v.score.total, species: v.score.species.length, total: ALL_SPECIES.length, ha: (v.totalAreaM2 / 10_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) })}</p>
        )}
        <button className="btn primary" onClick={start} disabled={!ctx} data-testid="home-start">{going ? t("walk.resume") : t("home.startWalk")}</button>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.fieldbook")}</button>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.settings")}</button>
        <div className="tests">
          <span className="muted">{t("home.tests")}</span>
          <Link className="btn small" href="/field">{t("home.field")}</Link>
        </div>
      </nav>
      {warn && (
        <Modal title={t("install.browserTitle")} onClose={() => setWarn(false)} actions={<>
          <button className="btn" onClick={() => void go()} data-testid="play-anyway">{t("install.playAnyway")}</button>
          {canInstall ? <button className="btn primary" onClick={() => { setWarn(false); void installPrompt.show(); }}>{t("install.button")}</button>
            : <button className="btn primary" onClick={() => setWarn(false)}>{t("install.how")}</button>}
        </>}><p>{t("install.browserBody")}</p><p className="muted">{ios ? t("install.ios") : t("install.android")}</p></Modal>
      )}
    </main>
  );
}
