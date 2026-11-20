"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PHASE1_SPECIES } from "@/engine/species";
import { useT } from "./i18n";
import { useSession, useWalkView } from "./SessionProvider";

/** Startskärmen: namnet, Starta promenad och (senare) fältdagbok och inställningar. Minimal text. */
export function Home() {
  const t = useT();
  const router = useRouter();
  const ctx = useSession();
  const v = useWalkView();
  const start = async () => {
    // Promenaden startas i klicket (iOS: rörelsesensorn kräver en användargest), sedan kartan.
    if (ctx && v?.stage === "idle") await ctx.session.start();
    router.push("/walk");
  };
  const going = v?.stage === "walking" || v?.stage === "paused";
  return (
    <main className="home">
      <header className="homehead">
        <h1 className="title">{t("app.name")}</h1>
        <p className="sub">{t("app.subtitle")}</p>
        <p className="tagline">{t("app.tagline")}</p>
      </header>
      <nav className="homenav">
        {v && v.storage === "ok" && (
          <p className="muted center" data-testid="stats">{t("home.stats", { points: v.score.total, species: v.score.species.length, total: PHASE1_SPECIES.length, ha: (v.totalAreaM2 / 10_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) })}</p>
        )}
        <button className="btn primary" onClick={start} disabled={!ctx} data-testid="home-start">{going ? t("walk.resume") : t("home.startWalk")}</button>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.fieldbook")}</button>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.settings")}</button>
        <div className="tests">
          <span className="muted">{t("home.tests")}</span>
          <Link className="btn small" href="/spike/camera">{t("spike.title")}</Link>
          <Link className="btn small" href="/spike/geometry">{t("spike2.title")}</Link>
        </div>
      </nav>
    </main>
  );
}
