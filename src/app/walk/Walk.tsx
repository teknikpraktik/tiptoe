"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { levelForArea } from "@/engine/levels";
import { SPECIES, type SpeciesId } from "@/engine/species";
import type { PhotoResult } from "@/play/session";
import { CameraView, prepareCameraView, type CameraTarget, type ShotResult } from "../_client/CameraView";
import { animalManifest, type AnimalManifest } from "../_client/animalImages";
import { CloseButton, Modal } from "../_client/Modal";
import { useT } from "../_client/i18n";
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
    <main className="mapshell" onPointerDown={() => audio.unlock()}>
      <GameMap player={v.pos} accuracyM={v.accuracyM} heading={v.headingDeg} getHeading={getHeading} trackUp={trackUp} follow={follow} onUserMove={() => setFollow(false)} scale track={v.track} reserves={reserves} reserveLevels={reserveLevels} closure={closure} animals={animals} sightings={sightings} trails={v.trails} onAnimalTap={setPicked} needle={needle} homeArea={v.profile?.home && v.profile.homeRadiusM ? { center: v.profile.home, radiusM: v.profile.homeRadiusM } : null} />
      <div className="statusbar" data-testid="status">
        <CloseButton href="/" />
        {/* GPS-status visas bara när den är för dålig för att spela. */}
        {v.stage === "walking" && (v.quality === "poor" || v.quality === "unavailable") && <span className={`gps q-${v.quality}`} data-testid="gps-warn">{t(`gps.quality.${v.quality}`)}</span>}
        <span className="spacer" />
        {v.totalAreaM2 > 0 && <span className="chip" data-testid="area">{t("walk.area", { ha: fmtHa(v.totalAreaM2) })}</span>}
        <button className="iconbtn" onClick={() => setMenu(true)} aria-label={t("walk.menu")} data-testid="menu"><span className="burger" /></button>
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
            <button className="btn small" onClick={() => setConfirmEnd(true)} data-testid="end">{t("walk.end")}</button>
          </>
        )}
      </div>

      {menu && (
        <Modal title={t("walk.menu")} onClose={() => setMenu(false)} actions={<button className="btn" onClick={() => setMenu(false)}>{t("common.close")}</button>}>
          <div className="menulist">
            <button className="btn wide" onClick={() => audio.setEnabled(!soundOn)} aria-pressed={soundOn} data-testid="sound">{soundOn ? t("walk.soundOn") : t("walk.soundOff")}</button>
            <button className="btn wide" onClick={() => { if (!trackUp) void mapCompass.requestPermission(); setTrackUp((x) => !x); }} data-testid="map-orient">{trackUp ? t("map.trackUp") : t("map.northUp")}</button>
            <Link className="btn wide" href="/fieldbook">{t("home.fieldbook")}</Link>
            <Link className="btn wide" href="/settings">{t("home.settings")}</Link>
          </div>
        </Modal>
      )}
      {v.stage === "paused" && (
        <Modal title={t("walk.pausedTitle")} actions={<>
          <button className="btn primary" onClick={() => { audio.unlock(); void s.start(); }} data-testid="resume">{t("walk.resume")}</button>
          <button className="btn" onClick={() => void s.end()}>{t("walk.end")}</button>
        </>}><p>{t("walk.pausedBody")}</p></Modal>
      )}
      {confirmEnd && (
        <Modal title={t("walk.endConfirm")} onClose={() => setConfirmEnd(false)} actions={<>
          <button className="btn primary" onClick={() => { setConfirmEnd(false); void s.end(); }} data-testid="end-confirm">{t("walk.end")}</button>
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
          <button className="btn" onClick={() => void shareOrDownload(result.blob, `tiptoe-${Date.now()}.jpg`, t("camera.photoTitle"))}>{t("camera.share")}</button>
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
