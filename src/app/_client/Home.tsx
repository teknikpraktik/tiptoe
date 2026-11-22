"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ALL_SPECIES } from "@/engine/species";
import { titleFor } from "@/engine/progress";
import { Repo } from "@/storage/repo";
import { exportReminder } from "@/storage/reminder";
import { audio } from "./audio";
import { mapCompass } from "./mapCompass";
import { useLang, useT } from "./i18n";
import { installPrompt, isIos, isStandalone } from "./install";
import { Modal } from "./Modal";
import { useSession, useWalkView } from "./SessionProvider";

/** Startsidans bakgrunder: bara ljusa, glada bilder (sol, grönska, gyllene ljus). En per dag, samma hela dagen. */
export const HOME_BACKGROUNDS = ["day-birch", "day", "dawn-lake", "dusk-boardwalk", "day-moss", "dawn"] as const;

/** Startsidans bakgrund för dagens datum. */
export function homeBackground(tMs: number): string {
  const day = Math.floor(tMs / 86_400_000);
  return `/backgrounds/${HOME_BACKGROUNDS[day % HOME_BACKGROUNDS.length]}.webp`;
}

/** Startskärmen: namnet, Starta promenad, (senare) fältdagbok och inställningar, och uppmaningen att installera före första promenaden. */
export function Home() {
  const t = useT();
  const router = useRouter();
  const ctx = useSession();
  const v = useWalkView();
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [warn, setWarn] = useState(false);
  const [picker, setPicker] = useState(false);
  const { setLang } = useLang();
  const [remind, setRemind] = useState(false);
  const [bg, setBg] = useState<string | null>(null);
  // Bakgrund efter solens läge (mitt i Sverige; platsen är okänd på startsidan). Sätts efter hydreringen så att serverns HTML är densamma.
  useEffect(() => { setBg(homeBackground(Date.now())); }, []);
  useEffect(() => {
    const pid = v?.profile?.id, db = ctx?.db;
    if (!pid || !db) return;
    void (async () => {
      const repo = new Repo(db);
      const [walks, last] = await Promise.all([repo.walks(pid), repo.lastExport(pid)]);
      setRemind(exportReminder(walks.filter((w) => w.endedAt !== null).map((w) => w.endedAt!), last, Date.now()));
    })();
  }, [ctx?.db, v?.profile?.id, v?.stage]);
  const canInstall = useSyncExternalStore(installPrompt.subscribe, installPrompt.available, () => false);
  useEffect(() => { setStandalone(isStandalone()); setIos(isIos()); }, []);

  const go = async () => {
    setWarn(false);
    audio.unlock();
    // Kompassen (kartans rotation) och rörelsesensorn kräver en användargest på iOS: båda frågas här i klicket.
    void mapCompass.requestPermission();
    // Promenaden startas i klicket, sedan kartan.
    if (ctx && v?.stage === "idle") await ctx.session.start();
    router.push("/walk");
  };
  const going = v?.stage === "walking" || v?.stage === "paused";
  // I webbläsarläge varnas en gång per sidvisning innan en ny promenad (spec: varnar i Safari-läge).
  const start = () => (!standalone && !going ? setWarn(true) : void go());

  return (
    <main className="home" style={bg ? { backgroundImage: `linear-gradient(rgba(20,24,18,.45), rgba(20,24,18,.12) 30%, rgba(20,24,18,.1) 48%, rgba(20,24,18,.82) 72%), url(${bg})` } : undefined}>
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
        {v?.profile && (
          <button className="profilechip" onClick={() => setPicker(true)} data-testid="profile-chip">{t("home.profile", { name: v.profile.name })}</button>
        )}
        {v && v.storage === "ok" && (
          <p className="muted center" data-testid="stats"><b>{t(`title.${titleFor(v.score.species.length)}`)}</b> · {t("home.stats", { points: v.score.total, species: v.score.species.length, total: ALL_SPECIES.length, ha: (v.totalAreaM2 / 10_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) })}</p>
        )}
        {remind && !going && (
          <div className="card" data-testid="export-reminder"><p className="warn-text">{t("backup.reminder")}</p><Link className="btn small" href="/settings">{t("backup.reminderAction")}</Link></div>
        )}
        <button className="btn primary" onClick={start} disabled={!ctx} data-testid="home-start">{going ? t("walk.resume") : t("home.startWalk")}</button>
        <Link className="btn ghost" href="/fieldbook" data-testid="home-fieldbook">{t("home.fieldbook")}</Link>
        <Link className="btn ghost" href="/settings" data-testid="home-settings">{t("home.settings")}</Link>
        <div className="tests">
          <span className="muted">{t("home.tests")}</span>
          <Link className="btn small" href="/field">{t("home.field")}</Link>
        </div>
      </nav>
      {picker && v && (
        <Modal title={t("home.switchProfile")} onClose={() => setPicker(false)} actions={<Link className="btn" href="/settings">{t("home.settings")}</Link>}>
          {v.profiles.map((x) => (
            <button key={x.id} className={`btn wide ${x.id === v.profile?.id ? "on" : ""}`} style={{ marginBottom: 8 }}
              onClick={async () => {
                // Under en promenad: den pausas och sparas (och fortsätter när man byter tillbaka).
                if (ctx && x.id !== v.profile?.id && (v.stage !== "walking" || confirm(t("settings.switchWhileWalking")))) { if (await ctx.session.switchProfile(x.id)) setLang(x.lang); }
                setPicker(false);
              }}>{x.name}</button>
          ))}
        </Modal>
      )}
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
