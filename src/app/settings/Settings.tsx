"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { LANGS, type Lang } from "@/i18n";
import { audio } from "../_client/audio";
import { Backup } from "./Backup";
import { PageHeader } from "../_client/Modal";
import { useLang, useT } from "../_client/i18n";
import { useSession, useWalkView } from "../_client/SessionProvider";

const RADII = [null, 500, 1000, 2000] as const;

/** Inställningar (spec: Skärmar 5 – språk, ljud, hemområde, profiler; export/import kommer i 2.8). */
export function Settings() {
  const t = useT();
  const { setLang } = useLang();
  const ctx = useSession();
  const v = useWalkView();
  const soundOn = useSyncExternalStore(audio.subscribe, () => audio.enabled, () => true);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"child" | "adult">("child");
  const [adding, setAdding] = useState(false);
  const [locating, setLocating] = useState(false);
  if (!ctx || !v?.profile) return <main className="page"><PageHeader title={t("settings.title")} /></main>;
  const s = ctx.session, p = v.profile;
  const walking = v.stage === "walking";
  const setHere = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLocating(false); void s.updateProfile({ home: { lat: pos.coords.latitude, lon: pos.coords.longitude } }); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
  };
  // Byte under en promenad: promenaden pausas och sparas (den fortsätter när man byter tillbaka).
  const use = async (id: string, lang: Lang) => {
    if (walking && !confirm(t("settings.switchWhileWalking"))) return;
    if (await s.switchProfile(id)) setLang(lang);
  };
  const create = async () => {
    if (walking && !confirm(t("settings.switchWhileWalking"))) return;
    const np = await s.createProfile(newName, newKind, p.lang);
    if (np) { setNewName(""); setAdding(false); }
  };
  return (
    <main className="page">
      <PageHeader title={t("settings.title")} />
      <div className="pagebody">
        {/* 1. Profil: vem som spelar (byte, ny) och den aktiva profilens uppgifter. */}
        <section className="card form" data-testid="settings-profiles">
          <h3>{t("settings.profile")}</h3>
          <div className="profilepick" role="radiogroup" aria-label={t("settings.profile")}>
            {v.profiles.map((x) => (
              <button key={x.id} role="radio" aria-checked={x.id === p.id} className={`btn small ${x.id === p.id ? "on" : ""}`} onClick={() => x.id !== p.id && void use(x.id, x.lang)} data-testid={`profile-${x.name}`}>
                {x.name}{x.id === p.id ? ` · ${t("settings.active")}` : ""}
              </button>
            ))}
            {!adding && <button className="btn small ghost" onClick={() => setAdding(true)} data-testid="add-profile">{t("settings.newProfile")}</button>}
          </div>
          {adding && (
            <div className="subcard form">
              <input placeholder={t("settings.newName")} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} data-testid="new-name" autoFocus />
              <div className="seg">{(["child", "adult"] as const).map((k) => <button key={k} className={`btn small ${newKind === k ? "on" : ""}`} onClick={() => setNewKind(k)}>{t(`settings.kind.${k}`)}</button>)}</div>
              <div className="seg">
                <button className="btn primary small" disabled={!newName.trim()} onClick={() => void create()} data-testid="create-profile">{t("settings.create")}</button>
                <button className="btn small ghost" onClick={() => { setAdding(false); setNewName(""); }}>{t("common.cancel")}</button>
              </div>
            </div>
          )}
          <label className="field">{t("settings.name")}<input defaultValue={p.name} key={p.id} maxLength={30} onBlur={(e) => e.target.value.trim() && void s.updateProfile({ name: e.target.value.trim() })} data-testid="profile-name" /></label>
          <div className="field">{t("settings.kind")}
            <div className="seg">{(["child", "adult"] as const).map((k) => <button key={k} className={`btn small ${p.kind === k ? "on" : ""}`} onClick={() => void s.updateProfile({ kind: k })}>{t(`settings.kind.${k}`)}</button>)}</div>
          </div>
          <div className="field">{t("settings.language")}
            <div className="seg">{LANGS.map((l: Lang) => <button key={l} className={`btn small ${p.lang === l ? "on" : ""}`} onClick={() => { setLang(l); void s.updateProfile({ lang: l }); }} data-testid={`lang-${l}`}>{t(`lang.${l}`)}</button>)}</div>
          </div>
        </section>

        {/* 2. Spelet: hemområde och ljud. */}
        <section className="card form" data-testid="settings-home">
          <h3>{t("settings.home")}</h3>
          <p className="muted">{t("settings.homeHelp")}</p>
          <div className="seg">{RADII.map((r) => <button key={String(r)} className={`btn small ${p.homeRadiusM === r ? "on" : ""}`} onClick={() => void s.updateProfile({ homeRadiusM: r })} data-testid={`home-${r ?? "off"}`}>{r == null ? t("settings.homeOff") : t("settings.homeRadius", { km: (r / 1000).toLocaleString(p.lang === "sv" ? "sv-SE" : "en-GB") })}</button>)}</div>
          {p.homeRadiusM != null && (
            <>
              <p className="muted">{p.home ? t("settings.homeCenterSet", { lat: p.home.lat.toFixed(4), lon: p.home.lon.toFixed(4) }) : t("settings.homeCenterUnset")}</p>
              <button className="btn small" onClick={setHere} disabled={locating}>{locating ? t("settings.homeLocating") : t("settings.homeHere")}</button>
            </>
          )}
        </section>
        <section className="card form">
          <h3>{t("settings.sound")}</h3>
          <div className="seg"><button className={`btn small ${soundOn ? "on" : ""}`} onClick={() => audio.setEnabled(true)}>{t("walk.soundOn")}</button><button className={`btn small ${!soundOn ? "on" : ""}`} onClick={() => audio.setEnabled(false)}>{t("walk.soundOff")}</button></div>
        </section>

        {/* 3. Data: säkerhetskopia. */}
        <Backup />

        {/* 4. Längst ner: radera profilen och diagnostik. */}
        <section className="card form">
          <h3>{t("settings.advanced")}</h3>
          {v.profiles.length > 1 && (
            <button className="btn small ghost danger" onClick={() => { if (confirm(t("settings.deleteConfirm", { name: p.name }))) void s.deleteProfile(p.id); }} data-testid="delete-profile">{t("settings.deleteThis", { name: p.name })}</button>
          )}
          <Link className="btn small ghost" href="/field">{t("settings.diagnostics")}</Link>
        </section>
      </div>
    </main>
  );
}
