"use client";

import { useEffect, useState } from "react";
import { ALL_SPECIES, SPECIES, type SpeciesId } from "@/engine/species";
import { listPhotos, photoId, savePhoto } from "@/storage/photos";
import { CameraView, prepareCameraView, type CameraMetrics, type Pose, type ShotResult } from "../../_client/CameraView";
import { animalManifest, type AnimalManifest } from "../../_client/animalImages";
import { PageHeader } from "../../_client/Modal";
import { appDb } from "../../_client/db";
import { useT } from "../../_client/i18n";
import { createOrientationSource, type OrientationStatus } from "../../_client/orientationSource";
import { shareOrDownload } from "../../_client/share";


interface LogLine { t: number; event: string; data?: Record<string, unknown> }

/**
 * Kameratest för fälttestet (från spik 1, 2D): ett platshållarrådjur placeras rakt fram i den riktning kameran pekar när vyn öppnas (efter
 * kompassen, om den finns). Mätvärden kan kopieras till fältprotokollet.
 */
export function CameraTest() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<OrientationStatus>("unsupported");
  const [dist, setDist] = useState(20);
  const [pose, setPose] = useState<Pose>("calm");
  const [species, setSpecies] = useState<SpeciesId>("roe_deer");
  const [animalHeading, setAnimalHeading] = useState(90);
  const [bearing, setBearing] = useState(0);
  const [shot, setShot] = useState<{ url: string; blob: Blob; r: ShotResult } | null>(null);
  const [count, setCount] = useState(0);
  const [metrics, setMetrics] = useState<CameraMetrics | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [copied, setCopied] = useState(false);
  const [manifest, setManifest] = useState<AnimalManifest | null>(null);
  useEffect(() => { void animalManifest().then(setManifest); }, []);
  const add = (event: string, data?: Record<string, unknown>) => setLog((l) => [...l.slice(-199), { t: Date.now(), event, data }]);

  useEffect(() => { void appDb().then(async (db) => { if (db) setCount((await listPhotos(db)).length); }); }, []);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const openCamera = async () => {
    // Gesten: behörighet för rörelsesensorerna (iOS) måste begäras här, innan något await som inte är behörigheten.
    const st = await prepareCameraView();
    setOrientation(st);
    add("orientation_permission", { status: st });
    // Djuret rakt fram: läs en kurs under en kort stund (kompass om den finns).
    let b = 0;
    if (st === "granted") {
      const src = createOrientationSource();
      b = await new Promise<number>((ok) => {
        const timer = setTimeout(() => { src.stop(); ok(0); }, 800);
        src.start((s) => { if (s.compassDeg != null) { clearTimeout(timer); src.stop(); ok(s.compassDeg); } });
      });
    }
    setBearing(b);
    setShot(null);
    setOpen(true);
  };

  const onShot = async (r: ShotResult) => {
    setOpen(false);
    setShot({ url: URL.createObjectURL(r.blob), blob: r.blob, r });
    const db = await appDb();
    if (db) {
      await savePhoto(db, { id: photoId(Date.now()), createdAt: Date.now(), blob: r.blob, width: r.width, height: r.height, meta: { zoom: r.zoom, distM: dist, inFrame: r.placement.inFrame } });
      setCount((await listPhotos(db)).length);
      add("photo_saved", { bytes: r.blob.size });
    } else add("photo_not_saved", { reason: "no IndexedDB" });
  };

  const report = () => JSON.stringify({ ua: navigator.userAgent, standalone: matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true, screen: `${screen.width}×${screen.height}@${devicePixelRatio}`, metrics, log }, null, 1);

  return (
    <main className="page">
      <PageHeader title={t("spike.title")} href="/field" />
      <div className="pagebody">
        <p>{t("spike.intro")}</p>
        <label className="field">{t("spike.distance", { m: dist })}<input type="range" min={5} max={60} value={dist} onChange={(e) => setDist(Number(e.target.value))} /></label>
        <label className="field">{t("spike.view", { deg: animalHeading })}<input type="range" min={0} max={359} step={15} value={animalHeading} onChange={(e) => setAnimalHeading(Number(e.target.value))} /></label>
        <label className="field">{t("spike.species")}
          <select value={species} onChange={(e) => setSpecies(e.target.value as SpeciesId)} data-testid="species">
            {ALL_SPECIES.map((id) => <option key={id} value={id}>{t(`species.${id}`)}{manifest?.species[id]?.placeholder === false ? "" : " *"}</option>)}
          </select>
        </label>
        <div className="seg">
          <span>{t("spike.pose")}</span>
          <button className={`btn small ${pose === "calm" ? "on" : ""}`} onClick={() => setPose("calm")}>{t("spike.poseCalm")}</button>
          <button className={`btn small ${pose === "alert" ? "on" : ""}`} onClick={() => setPose("alert")}>{t("spike.poseAlert")}</button>
          <button className={`btn small ${pose === "rest" ? "on" : ""}`} onClick={() => setPose("rest")}>{t("spike.poseRest")}</button>
        </div>
        <button className="btn primary wide" onClick={openCamera} data-testid="open-camera">{t("camera.open")}</button>
        <p className="muted">{t("spike.photos", { n: count })}</p>
        {shot && (
          <div className="card result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.url} alt="" className="photo" data-testid="photo" />
            <p className="muted">{t("camera.saved")} {shot.r.width}×{shot.r.height}, {Math.round(shot.blob.size / 1024)} kB</p>
            <div className="row">
              <button className="btn" onClick={async () => add("share", { result: await shareOrDownload(shot.blob, `tiptoe-${Date.now()}.jpg`, t("camera.photoTitle")) })}>{t("camera.share")}</button>
              <button className="btn ghost" onClick={openCamera}>{t("camera.again")}</button>
            </div>
          </div>
        )}
        <details className="card">
          <summary>{t("spike.metrics")}</summary>
          <pre className="mono" data-testid="metrics">{JSON.stringify(metrics, null, 1)}</pre>
          <button className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(report()); setCopied(true); } catch { add("clipboard_failed"); } }}>{copied ? t("spike.copied") : t("spike.copyReport")}</button>
          <pre className="mono">{log.slice(-20).map((l) => `${new Date(l.t).toISOString().slice(11, 19)} ${l.event} ${l.data ? JSON.stringify(l.data) : ""}`).join("\n")}</pre>
        </details>
      </div>
      {open && manifest && (
        <CameraView
          target={{ bearingDeg: bearing, distM: dist, headingDeg: (bearing + animalHeading) % 360, heightM: SPECIES[species].heightM, photoDistM: SPECIES[species].photoM, pose, images: manifest.species[species].views }}
          canShoot
          orientation={orientation}
          onClose={() => setOpen(false)}
          onShot={onShot}
          onLog={add}
          onMetrics={setMetrics}
        />
      )}
    </main>
  );
}
