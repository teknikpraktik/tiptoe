"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { levelForArea } from "@/engine/levels";
import { SPECIES, type SpeciesId } from "@/engine/species";
import type { PhotoResult, WalkSummary } from "@/play/session";
import { useRouter } from "next/navigation";
import { CameraView, prepareCameraView, type CameraTarget, type ShotResult } from "../_client/CameraView";
import { animalManifest, type AnimalManifest } from "../_client/animalImages";
import { Modal } from "../_client/Modal";
import { useLang, useT } from "../_client/i18n";
import type { OrientationStatus } from "../_client/orientationSource";
import { mapCompass } from "../_client/mapCompass";
import { useSession, useWalkView } from "../_client/SessionProvider";
import { shareOrDownload } from "../_client/share";
import { audio } from "../_client/audio";


const GameMap = dynamic(() => import("../_client/GameMap"), { ssr: false });


/** Artnamn mitt i en mening ("Reservatet räcker nu för lodjur"): gemen begynnelsebokstav. Först i meningen: versal. */
const sentenceName = (name: string, first: boolean) => (first ? name : name.charAt(0).toLocaleLowerCase("sv") + name.slice(1));

const fmtHa = (m2: number) => (m2 / 10_000).toLocaleString("sv-SE", { maximumFractionDigits: 1, minimumFractionDigits: m2 < 100_000 ? 1 : 0 });

/** Storleksklass för ett okänt djur (en ledtråd utan att avslöja arten). */
const sizeOf = (sp: SpeciesId): "small" | "medium" | "large" => (SPECIES[sp].heightM < 0.45 ? "small" : SPECIES[sp].heightM < 1 ? "medium" : "large");
/** Vad djuret gör, för kortet. */
const stateOf = (a: { state: string; look?: string }): "calm" | "alert" | "look" | "flee" => (a.state === "flee" ? "flee" : a.look === "look" || a.state === "look" ? "look" : a.state === "alert" || a.look === "warn" ? "alert" : "calm");

/** Promenaden: kartan är spelet, allt annat ett tryck bort (spec: UX). */
export function Walk() {
  const t = useT();
  const ctx = useSession();
  const v = useWalkView();
  const [follow, setFollow] = useState(true);
  // Kompass upp är standard (kartan vrider sig när man vänder sig); utan kompass används färdriktningen från GPS.
  const [trackUp, setTrackUp] = useState(true);
  const gpsHeading = useRef<number | null>(null);
  gpsHeading.current = v?.headingDeg ?? null;
  const getHeading = useCallback(() => mapCompass.heading() ?? gpsHeading.current, []);
  useEffect(() => { mapCompass.start(); }, []);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [menu, setMenu] = useState(false);
  const [summary, setSummary] = useState<WalkSummary | null>(null);
  const router = useRouter();
  const { lang } = useLang();
  // En promenad är igång eller avslutad: en sparad (t.ex. efter omstart eller profilbyte) fortsätter direkt när kartan visas.
  const resumed = useRef(false);
  useEffect(() => {
    if (ctx && v?.stage === "paused" && !resumed.current) { resumed.current = true; void ctx.session.start(); }
    if (v?.stage === "walking") resumed.current = false;
  }, [ctx, v?.stage]);
  const needle = useRef<HTMLSpanElement>(null);
  const [camera, setCamera] = useState<{ id: string; orientation: OrientationStatus } | null>(null);
  const [target, setTarget] = useState<CameraTarget | null>(null);
  const [result, setResult] = useState<{ r: PhotoResult | null; url: string; blob: Blob; missed: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastClosure = useRef<number | null>(null);
  const [manifest, setManifest] = useState<AnimalManifest | null>(null);
  const soundOn = useSyncExternalStore(audio.subscribe, () => audio.enabled, () => true);
  useEffect(() => { void animalManifest().then(setManifest); }, []);

  // Ny yta: kort meddelande med hektartal.
  useEffect(() => {
    const c = v?.lastClosure;
    if (!c || c.id === lastClosure.current) return;
    const first = lastClosure.current === null && Date.now() - c.atMs > 5000;
    lastClosure.current = c.id;
    if (first) return;
    setToast(t(c.kind === "grew" ? "walk.reserveGrew" : "walk.reserveNew", { ha: c.ha.toLocaleString("sv-SE", { maximumFractionDigits: 1 }) }));
    const h = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(h);
  }, [v?.lastClosure, t]);

  // Kamerans mål följer djuret; kameran stängs om spelaren börjar gå (spec: Säkerhet för barn).
  useEffect(() => {
    if (!camera || !ctx) return;
    const upd = () => {
      const c = ctx.session.cameraTarget(camera.id);
      if (!c || c.state === "gone") { setCamera(null); return; }
      const sp = SPECIES[c.species];
      const images = manifest?.species[c.species]?.views;
      if (!images) return;
      setTarget({ bearingDeg: c.bearingDeg, distM: c.distM, headingDeg: c.headingDeg, heightM: sp.heightM, photoDistM: sp.photoM, pose: c.state === "alert" || c.state === "look" ? "alert" : c.state === "rest" ? "rest" : "calm", images });
    };
    upd();
    const h = setInterval(upd, 250);
    return () => clearInterval(h);
  }, [camera, ctx, manifest]);
  useEffect(() => { if (camera && (v?.tempo === "walk" || v?.tempo === "run")) setCamera(null); }, [camera, v?.tempo]);

  // Arter man redan fotograferat visas med namn; andra är "okänt djur" (upptäckten är en del av spelet).
  const known = useMemo(() => new Set(v?.score.species ?? []), [v?.score.species]);
  const nameOf = useCallback((sp: SpeciesId) => (known.has(sp) ? t(`species.${sp}`) : t("animal.unknown")), [known, t]);
  const animals = useMemo(() => (v?.animals ?? []).map((a) => ({ id: a.id, lat: a.lat, lon: a.lon, state: a.state, rarity: SPECIES[a.species].rarity, escape: SPECIES[a.species].escape, look: a.look, label: t("walk.animalNear", { species: nameOf(a.species), m: Math.round(a.distM) }) })), [v?.animals, t, nameOf]);
  // Tryck på ett djur: ett kort med vad det är, hur långt bort och vad det gör. Stängs efter 6 s, vid tryck eller när djuret är borta.
  const [picked, setPicked] = useState<string | null>(null);
  const pickedAnimal = picked ? v?.animals.find((a) => a.id === picked && a.state !== "gone") ?? null : null;
  useEffect(() => { if (!picked) return; const h = setTimeout(() => setPicked(null), 6000); return () => clearTimeout(h); }, [picked]);
  // Tips första gången spår och djur syns (en gång per telefon).
  const [hint, setHint] = useState<string | null>(null);
  const hasTrail = (v?.trails.length ?? 0) > 0, hasAnimal = (v?.animals.length ?? 0) > 0;
  useEffect(() => {
    const key = hasAnimal ? "animal" : hasTrail ? "trail" : null;
    if (!key || hint) return;
    try { if (localStorage.getItem(`tiptoe.hint.${key}`)) return; localStorage.setItem(`tiptoe.hint.${key}`, "1"); } catch { return; }
    setHint(t(`hint.${key}`));
  }, [hasTrail, hasAnimal, hint, t]);
  useEffect(() => { if (!hint) return; const h = setTimeout(() => setHint(null), 7000); return () => clearTimeout(h); }, [hint]);
  const reserves = useMemo(() => (v?.reserves ?? []).map((r) => r.rings), [v?.reserves]);
  const reserveLevels = useMemo(() => (v?.reserves ?? []).map((r) => levelForArea(r.areaM2)), [v?.reserves]);
  const sightings = useMemo(() => (v?.sightings ?? []).map((x) => ({ id: x.id, lat: x.lat, lon: x.lon, label: t(`species.${x.species}`) })), [v?.sightings, t]);
  // Meddelanden från sessionen (inflyttning, ny nivå, observation).
  const lastNotice = useRef<number | null>(null);
  useEffect(() => {
    const n = v?.notice;
    if (!n || n.id === lastNotice.current) return;
    lastNotice.current = n.id;
    const vars: Record<string, string | number> = { ...n.vars };
    if (typeof vars.species === "string") vars.species = sentenceName(t(`species.${vars.species as SpeciesId}`), t(n.key).startsWith("{species}"));
    if (typeof vars.dir === "string") vars.dir = t(`dir.${vars.dir as "N"}`);
    setToast(t(n.key, vars));
    const h = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(h);
  }, [v?.notice, t]);
  const closure = useMemo(() => (v?.lastClosure ? { id: v.lastClosure.id, pieces: v.lastClosure.pieces } : null), [v?.lastClosure]);

  if (!ctx || !v || v.stage === "loading") return <main className="mapshell"><div className="toast">{t("map.locating")}</div></main>;
  const s = ctx.session;

  const openCamera = async () => {
    if (!v.photoTarget) return;
    const id = v.photoTarget.id;
    const orientation = await prepareCameraView();
    setCamera({ id, orientation });
  };
  const onShot = async (shot: ShotResult) => {
    audio.play({ kind: "shutter", pan: 0, gain: 0.7 });
    const id = camera?.id;
    setCamera(null);
    if (!id) return;
    const r = await s.photo(id, shot);
    setResult({ r, url: URL.createObjectURL(shot.blob), blob: shot.blob, missed: !r || r.stars === 0 });
  };
  const near = v.photoTarget ? v.animals.find((a) => a.id === v.photoTarget!.id) : null;

  return (
    <main className="mapshell" onPointerDown={() => { audio.unlock(); void s.enableMotion(); }}>
      <GameMap player={v.pos} accuracyM={v.accuracyM} heading={v.headingDeg} getHeading={getHeading} trackUp={trackUp} follow={follow} onUserMove={() => setFollow(false)} scale track={v.trackMap} reserves={reserves} reserveLevels={reserveLevels} closure={closure} animals={animals} sightings={sightings} trails={v.trails} onAnimalTap={setPicked} needle={needle} />
      <div className="statusbar" data-testid="status">
        {/* GPS-status visas bara när den är för dålig för att spela. */}
        {v.stage === "walking" && (v.quality === "poor" || v.quality === "unavailable") && <span className={`gps q-${v.quality}`} data-testid="gps-warn">{t(`gps.quality.${v.quality}`)}</span>}
        <span className="spacer" />
        {v.totalAreaM2 > 0 && <span className="chip" data-testid="area">{t("walk.area", { ha: fmtHa(v.totalAreaM2) })}</span>}
        <button className={`iconbtn ${menu ? "open" : ""}`} onClick={() => setMenu((x) => !x)} aria-label={t("walk.menu")} aria-expanded={menu} aria-haspopup="menu" data-testid="menu"><span className="burger" /></button>
      </div>
      {v.gpsError && <div className="toast" role="alert">{t(`gps.error.${v.gpsError}`)}</div>}
      {!v.gpsError && v.stage === "walking" && !v.pos && <div className="toast">{t("map.locating")}</div>}
      {v.stage === "walking" && v.env === "loading" && v.pos && <div className="toast subtle">{t("walk.envLoading")}</div>}
      {v.stage === "walking" && v.env === "missing" && <div className="toast" role="alert">{t("walk.envMissing")}</div>}
      {v.storage === "none" && <div className="toast" role="alert">{t("walk.noStorage")}</div>}
      {toast && <div className="toast good" role="status" data-testid="reserve-toast">{toast}</div>}
      {hint && !toast && !pickedAnimal && <button className="toast hint" onClick={() => setHint(null)} data-testid="hint">{hint}</button>}
      {pickedAnimal && (
        <button className="animalcard" onClick={() => setPicked(null)} data-testid="animal-card">
          <b>{known.has(pickedAnimal.species) ? t(`species.${pickedAnimal.species}`) : t(`animal.unknownSize.${sizeOf(pickedAnimal.species)}`)}</b>
          <span>{t("animal.distance", { m: Math.round(pickedAnimal.distM) })} · {t(`animal.state.${stateOf(pickedAnimal)}`)}</span>
          <span className="muted">{t(`animal.tip.${stateOf(pickedAnimal)}`)}</span>
        </button>
      )}
      {v.stage === "walking" && v.freeze && <div className={`freeze ${v.freeze}`} role="alert" data-testid="freeze">{v.freeze === "look" ? t("walk.freeze") : t("walk.freezeWarn")}</div>}
      {v.stage === "walking" && v.levelInfo && (
        <div className="levelbar" data-testid="level">
          <b>{t("walk.level", { level: v.levelInfo.level, ha: fmtHa(v.levelInfo.areaM2) })}</b>
          {v.levelInfo.level > 0 && <span> · {t(`walk.levelHint.${v.levelInfo.level as 1 | 2 | 3}`)}</span>}
          <span className="muted"> · {v.levelInfo.toNextM2 == null ? t("walk.levelMax") : t("walk.toNext", { ha: fmtHa(v.levelInfo.toNextM2), level: v.levelInfo.level + 1 })}</span>
        </div>
      )}

      {v.stage === "walking" && (
        <button className={`compassbtn ${follow ? "on" : ""}`} onClick={() => { if (trackUp) void mapCompass.requestPermission(); setFollow(true); }} aria-pressed={follow} aria-label={t("map.follow")} data-testid="follow">
          <span ref={needle} className="needle"><span className="n" /><span className="s" /></span>
        </button>
      )}
      <div className="controls">
        {v.stage === "idle" && <button className="btn primary" onClick={() => { audio.unlock(); void mapCompass.requestPermission(); void s.start(); }} data-testid="start">{t("walk.start")}</button>}
        {v.stage === "walking" && (
          <>
            {v.photoTarget && (
              <button className="btn primary camera" onClick={openCamera} disabled={!v.photoTarget.ready} data-testid="camera-btn">
                {v.photoTarget.ready ? `${t("walk.camera")} · ${near ? t(`species.${near.species}`) : ""}` : v.photoTarget.why === "move" ? t("walk.standStill") : t("walk.gpsTooWeak")}
              </button>
            )}
          </>
        )}
      </div>

      {menu && (
        <>
          {/* Rullgardinsmeny under menyknappen; ett tryck utanför stänger den. */}
          <div className="dropdown-scrim" onClick={() => setMenu(false)} />
          <div className="dropdown" role="menu" aria-label={t("walk.menu")} data-testid="menu-panel">
            <div className="dd-section">
              <div className="dd-label">{t("menu.mapDirection")}</div>
              <div className="segmented small" role="radiogroup" aria-label={t("menu.mapDirection")}>
                <button role="radio" aria-checked={trackUp} className={trackUp ? "on" : ""} onClick={() => { void mapCompass.requestPermission(); setTrackUp(true); }} data-testid="orient-compass">{t("menu.compassUp")}</button>
                <button role="radio" aria-checked={!trackUp} className={!trackUp ? "on" : ""} onClick={() => setTrackUp(false)} data-testid="orient-north">{t("menu.northUp")}</button>
              </div>
            </div>
            <button className="dd-row" role="switch" aria-checked={soundOn} onClick={() => audio.setEnabled(!soundOn)} data-testid="sound">
              <span>{t("menu.sound")}</span><span className={`switch ${soundOn ? "on" : ""}`} aria-hidden="true"><span /></span>
            </button>
            <div className="dd-sep" />
            <Link className="dd-row" role="menuitem" href="/fieldbook">{t("home.fieldbook")}<span className="chev" aria-hidden="true">›</span></Link>
            <Link className="dd-row" role="menuitem" href="/settings">{t("home.settings")}<span className="chev" aria-hidden="true">›</span></Link>
            <Link className="dd-row" role="menuitem" href="/" data-testid="menu-home"><span>{t("menu.home")}<small>{t("menu.homeHint")}</small></span><span className="chev" aria-hidden="true">›</span></Link>
            {v.stage === "walking" && (
              <>
                <div className="dd-sep" />
                <button className="dd-row danger" role="menuitem" onClick={() => { setMenu(false); setConfirmEnd(true); }} data-testid="end">{t("menu.endWalk")}</button>
              </>
            )}
          </div>
        </>
      )}
      {summary && (
        <Modal title={t("summary.title")} actions={<button className="btn primary" onClick={() => { setSummary(null); router.push("/"); }} data-testid="summary-ok">{t("summary.ok")}</button>}>
          <div className="summary" data-testid="summary">
            <div><b>{(summary.distanceM / 1000).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB", { maximumFractionDigits: 1 })} km</b><span>{t("summary.distance")}</span></div>
            <div><b>{Math.round(summary.durationS / 60)} min</b><span>{t("summary.time")}</span></div>
            <div><b>{summary.photos}</b><span>{t("summary.photos")}</span></div>
            <div><b>{summary.newSpecies}</b><span>{t("summary.newSpecies")}</span></div>
            <div><b>{fmtHa(summary.addedM2)} ha</b><span>{t("summary.area")}</span></div>
            <div><b>{summary.points}</b><span>{t("summary.points")}</span></div>
          </div>
        </Modal>
      )}
      {confirmEnd && (
        <Modal title={t("walk.endConfirm")} onClose={() => setConfirmEnd(false)} actions={<>
          <button className="btn primary" onClick={async () => { setConfirmEnd(false); setSummary(await s.end()); }} data-testid="end-confirm">{t("walk.end")}</button>
          <button className="btn" onClick={() => setConfirmEnd(false)}>{t("common.cancel")}</button>
        </>}><p>{t("walk.endBody")}</p></Modal>
      )}
      {camera && target && (
        <CameraView target={target} orientation={camera.orientation} canShoot={!!v.photoTarget?.ready && v.photoTarget.id === camera.id}
          blockedReason={v.photoTarget?.id === camera.id && v.photoTarget.ready ? null : t("camera.standStill")}
          onClose={() => setCamera(null)} onShot={onShot} onLog={(e, d) => s.logEvent(e, d)} />
      )}
      {result && (
        <Modal title={result.r && !result.missed ? t(`species.${result.r.species}`) : t("result.title")} onClose={() => { URL.revokeObjectURL(result.url); setResult(null); }} actions={<>
          <button className="btn primary" onClick={() => { URL.revokeObjectURL(result.url); setResult(null); }} data-testid="result-ok">{t("result.continue")}</button>
          <button className="btn" onClick={() => void shareOrDownload(result.blob, `djurfoto-${Date.now()}.jpg`, t("camera.photoTitle"))}>{t("camera.share")}</button>
        </>}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt="" className="photo" />
          {result.missed || !result.r ? <p>{t("result.missed")}</p> : (
            <div className="result-line" data-testid="result">
              <span className="stars" aria-label={t("result.stars", { n: result.r.stars })}>{"★".repeat(result.r.stars)}{"☆".repeat(3 - result.r.stars)}</span>
              {result.r.newSpecies && <span className="chip good">{t("result.newSpecies")}</span>}
              {result.r.variant && <span className="chip rare">{t("result.variant", { variant: t(`variant.${result.r.variant}` as "variant.dark") })}</span>}
              {result.r.newTitle && <span className="chip good" data-testid="new-title">{t("result.newTitle", { title: t(`title.${result.r.newTitle}`) })}</span>}
              <span>{result.r.points ? t("result.points", { n: result.r.points }) : t("result.noPoints")}</span>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
