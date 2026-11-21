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
  const [locating, setLocating] = useState(false);
  if (!ctx || !v?.profile) return <main className="page"><PageHeader title={t("settings.title")} /></main>;
  const s = ctx.session, p = v.profile;
  const locked = v.stage === "walking";
  const setHere = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setLocating(false); void s.updateProfile({ home: { lat: pos.coords.latitude, lon: pos.coords.longitude } }); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
    );
  };
  return (
    <main className="page">
      <PageHeader title={t("settings.title")} />
      <div className="pagebody">
        {locked && <p className="card warn-text">{t("settings.walking")}</p>}
        <section className="card form" data-testid="settings-profile">
          <h3>{t("settings.profile")}</h3>
          <label className="field">{t("settings.name")}<input defaultValue={p.name} key={p.id} maxLength={30} disabled={locked} onBlur={(e) => e.target.value.trim() && void s.updateProfile({ name: e.target.value.trim() })} /></label>
          <div className="field">{t("settings.kind")}
            <div className="seg">{(["child", "adult"] as const).map((k) => <button key={k} className={`btn small ${p.kind === k ? "on" : ""}`} disabled={locked} onClick={() => void s.updateProfile({ kind: k })}>{t(`settings.kind.${k}`)}</button>)}</div>
          </div>
          <div className="field">{t("settings.language")}
            <div className="seg">{LANGS.map((l: Lang) => <button key={l} className={`btn small ${p.lang === l ? "on" : ""}`} onClick={() => { setLang(l); void s.updateProfile({ lang: l }); }} data-testid={`lang-${l}`}>{t(`lang.${l}`)}</button>)}</div>
          </div>
        </section>
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
        <section className="card form" data-testid="settings-profiles">
          <h3>{t("settings.profiles")}</h3>
          {v.profiles.map((x) => (
            <div className="row profilerow" key={x.id}>
              <span>{x.name} <span className="muted">· {t(`settings.kind.${x.kind}`)}</span></span>
              {x.id === p.id ? <span className="chip good">{t("settings.active")}</span> : (
                <span className="row">
                  <button className="btn small" disabled={locked} onClick={async () => { await s.switchProfile(x.id); setLang(x.lang); }}>{t("settings.use")}</button>
                  <button className="btn small ghost" disabled={locked} onClick={() => { if (confirm(t("settings.deleteConfirm", { name: x.name }))) void s.deleteProfile(x.id); }}>{t("settings.delete")}</button>
                </span>
              )}
            </div>
          ))}
          <h4>{t("settings.newProfile")}</h4>
          <input placeholder={t("settings.newName")} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} disabled={locked} data-testid="new-name" />
          <div className="seg">{(["child", "adult"] as const).map((k) => <button key={k} className={`btn small ${newKind === k ? "on" : ""}`} onClick={() => setNewKind(k)}>{t(`settings.kind.${k}`)}</button>)}</div>
          <button className="btn primary" disabled={locked || !newName.trim()} onClick={async () => { await s.createProfile(newName, newKind, p.lang); setNewName(""); }} data-testid="create-profile">{t("settings.create")}</button>
        </section>
        <Backup />
        <Link className="btn ghost" href="/field">{t("settings.diagnostics")}</Link>
      </div>
    </main>
  );
}
