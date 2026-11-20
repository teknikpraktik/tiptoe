"use client";

import Link from "next/link";
import { useT } from "./i18n";

/** Startskärmen: namnet, Starta promenad och (senare) fältdagbok och inställningar. Minimal text. */
export function Home() {
  const t = useT();
  return (
    <main className="home">
      <header className="homehead">
        <h1 className="title">{t("app.name")}</h1>
        <p className="sub">{t("app.subtitle")}</p>
        <p className="tagline">{t("app.tagline")}</p>
      </header>
      <nav className="homenav">
        <Link className="btn primary" href="/walk">{t("home.startWalk")}</Link>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.fieldbook")}</button>
        <button className="btn ghost" disabled title={t("home.comingSoon")}>{t("home.settings")}</button>
      </nav>
    </main>
  );
}
