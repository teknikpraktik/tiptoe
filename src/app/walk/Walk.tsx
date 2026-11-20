"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { SPECIES } from "@/engine/species";
import type { PhotoResult } from "@/play/session";
import { CameraView, prepareCameraView, type AnimalImages, type CameraTarget, type ShotResult } from "../_client/CameraView";
import { CloseButton, Modal } from "../_client/Modal";
import { useT } from "../_client/i18n";
import type { OrientationStatus } from "../_client/orientationSource";
import { useSession, useWalkView } from "../_client/SessionProvider";
import { shareOrDownload } from "../_client/share";

const GameMap = dynamic(() => import("../_client/GameMap"), { ssr: false });

/** Fas 1: platshållarutklipp (rådjurets form) för alla fem arter; fas 2 har riktiga bilder per art. */
const PLACEHOLDER: AnimalImages = {
  side: { calm: "/animals/placeholder/roe-side-calm.png", alert: "/animals/placeholder/roe-side-alert.png" },
  front: { calm: "/animals/placeholder/roe-front-calm.png", alert: "/animals/placeholder/roe-front-alert.png" },
  back: { calm: "/animals/placeholder/roe-back-calm.png", alert: "/animals/placeholder/roe-back-alert.png" },
  aspect: 1.5,
};

const fmtHa = (m2: number) => (m2 / 10_000).toLocaleString("sv-SE", { maximumFractionDigits: 1, minimumFractionDigits: m2 < 100_000 ? 1 : 0 });

/** Promenaden: kartan är spelet, allt annat ett tryck bort (spec: UX). */
export function Walk() {
  const t = useT();
  const ctx = useSession();
  const v = useWalkView();
  const [follow, setFollow] = useState(true);
  const [trackUp, setTrackUp] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [camera, setCamera] = useState<{ id: string; orientation: OrientationStatus } | null>(null);
  const [target, setTarget] = useState<CameraTarget | null>(null);
  const [result, setResult] = useState<{ r: PhotoResult | null; url: string; blob: Blob; missed: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const lastClosure = useRef<number | null>(null);

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
      setTarget({ bearingDeg: c.bearingDeg, distM: c.distM, headingDeg: c.headingDeg, heightM: sp.heightM, photoDistM: sp.photoM, pose: c.state === "alert" ? "alert" : "calm", images: PLACEHOLDER });
    };
    upd();
    const h = setInterval(upd, 250);
    return () => clearInterval(h);
  }, [camera, ctx]);
  useEffect(() => { if (camera && (v?.tempo === "walk" || v?.tempo === "run")) setCamera(null); }, [camera, v?.tempo]);

  const animals = useMemo(() => (v?.animals ?? []).map((a) => ({ id: a.id, lat: a.lat, lon: a.lon, state: a.state, rarity: SPECIES[a.species].rarity, label: t("walk.animalNear", { species: t(`species.${a.species}`), m: Math.round(a.distM) }) })), [v?.animals, t]);
  const reserves = useMemo(() => (v?.reserves ?? []).map((r) => r.rings), [v?.reserves]);
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
    const id = camera?.id;
    setCamera(null);
    if (!id) return;
    const r = await s.photo(id, shot);
    setResult({ r, url: URL.createObjectURL(shot.blob), blob: shot.blob, missed: !r || r.stars === 0 });
  };
  const near = v.photoTarget ? v.animals.find((a) => a.id === v.photoTarget!.id) : null;

  return (
    <main className="mapshell">
      <GameMap player={v.pos} accuracyM={v.accuracyM} heading={v.headingDeg} trackUp={trackUp} follow={follow} onUserMove={() => setFollow(false)} scale track={v.track} reserves={reserves} closure={closure} animals={animals} />
      <div className="statusbar" data-testid="status">
        <CloseButton href="/" />
        <span className={`gps q-${v.quality}`}>{t(`gps.quality.${v.quality}`)}{v.accuracyM != null && v.quality !== "unavailable" ? ` ${t("gps.accuracy", { m: Math.round(v.accuracyM) })}` : ""}</span>
        {v.stage === "walking" && <span className={`chip tempo t-${v.tempo}`} data-testid="tempo">{t(`tempo.${v.tempo}`)}</span>}
        <span className="chip" data-testid="score">{t("walk.points", { n: v.score.total })} · {t("walk.area", { ha: fmtHa(v.totalAreaM2) })}</span>
      </div>
      {v.gpsError && <div className="toast" role="alert">{t(`gps.error.${v.gpsError}`)}</div>}
      {!v.gpsError && v.stage === "walking" && !v.pos && <div className="toast">{t("map.locating")}</div>}
      {v.stage === "walking" && v.env === "loading" && v.pos && <div className="toast subtle">{t("walk.envLoading")}</div>}
      {v.stage === "walking" && v.env === "missing" && <div className="toast" role="alert">{t("walk.envMissing")}</div>}
      {v.storage === "none" && <div className="toast" role="alert">{t("walk.noStorage")}</div>}
      {toast && <div className="toast good" role="status" data-testid="reserve-toast">{toast}</div>}

      <div className="controls">
        {v.stage === "idle" && <button className="btn primary" onClick={() => void s.start()} data-testid="start">{t("walk.start")}</button>}
        {v.stage === "walking" && (
          <>
            <button className="btn small" onClick={() => setTrackUp((x) => !x)}>{trackUp ? t("map.trackUp") : t("map.northUp")}</button>
            {!follow && <button className="btn small" onClick={() => setFollow(true)}>{t("map.follow")}</button>}
            {v.photoTarget && (
              <button className="btn primary camera" onClick={openCamera} disabled={!v.photoTarget.ready} data-testid="camera-btn">
                {v.photoTarget.ready ? `${t("walk.camera")} · ${near ? t(`species.${near.species}`) : ""}` : v.photoTarget.why === "move" ? t("walk.standStill") : t("walk.gpsTooWeak")}
              </button>
            )}
            <button className="btn small" onClick={() => setConfirmEnd(true)} data-testid="end">{t("walk.end")}</button>
          </>
        )}
      </div>

      {v.stage === "paused" && (
        <Modal title={t("walk.pausedTitle")} actions={<>
          <button className="btn primary" onClick={() => void s.start()} data-testid="resume">{t("walk.resume")}</button>
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
              <span>{result.r.points ? t("result.points", { n: result.r.points }) : t("result.noPoints")}</span>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}
