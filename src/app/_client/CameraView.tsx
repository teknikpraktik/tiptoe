"use client";

import { useEffect, useRef, useState } from "react";
import { drawComposite, lookFor, outputSize, visibleCrop } from "@/camera/composite";
import { distanceQuality, placeAnimal, teleZoom, viewFor, type Placement, type View } from "@/camera/projection";
import { AnchoredYaw } from "@/sensors/orientation";
import { cameraErrorKind, openRearCamera, stopStream, streamLooksDead, type CameraErrorKind } from "./camera";
import { useT } from "./i18n";
import { createOrientationSource, type OrientationSample, type OrientationStatus } from "./orientationSource";

export type Pose = "calm" | "alert";
export interface AnimalImages {
  /** Utklipp per vinkel och pose (vänster sida; höger speglas). */
  side: Record<Pose, string>;
  front: Record<Pose, string>;
  back: Record<Pose, string>;
  /** Utklippens bredd/höjd. */
  aspect: number;
}

export interface CameraTarget {
  bearingDeg: number;
  distM: number;
  /** Djurets egen kurs (för vilken vinkel som visas). */
  headingDeg: number;
  heightM: number;
  photoDistM: number;
  pose: Pose;
  images: AnimalImages;
}

export interface ShotResult {
  blob: Blob;
  width: number;
  height: number;
  placement: Placement;
  zoom: number;
  quality: number;
}

export interface CameraMetrics {
  firstFrameMs: number | null;
  fps: number | null;
  heapMB: number | null;
  restarts: number;
  orientation: OrientationStatus | "pending";
  compass: boolean;
  video: string;
}

/**
 * Kameravyn som ett överlägg på samma route (spec: aldrig via navigering; iOS återkallar kameran vid routebyte i fristående PWA).
 * Behörigheten för rörelsesensorerna måste begäras i en användargest innan vyn monteras: se `prepareCameraView`.
 */
export function CameraView(props: {
  target: CameraTarget;
  canShoot: boolean;
  blockedReason?: string | null;
  orientation: OrientationStatus;
  onClose: () => void;
  onShot: (r: ShotResult) => void;
  onLog?: (event: string, data?: Record<string, unknown>) => void;
  onMetrics?: (m: CameraMetrics) => void;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const shadow = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const sample = useRef<OrientationSample | null>(null);
  const anchor = useRef(new AnchoredYaw());
  const view = useRef<{ yaw: number | null; pitch: number; placement: Placement | null }>({ yaw: null, pitch: 0, placement: null });
  const propsRef = useRef(props);
  propsRef.current = props;
  const [error, setError] = useState<CameraErrorKind | null>(null);
  const [nudge, setNudge] = useState(0);
  const nudgeRef = useRef(0);
  nudgeRef.current = nudge;
  const [hint, setHint] = useState<"searching" | "out" | null>("searching");
  const [hasCompass, setHasCompass] = useState(false);
  const [busy, setBusy] = useState(false);
  const metrics = useRef<CameraMetrics>({ firstFrameMs: null, fps: null, heapMB: null, restarts: 0, orientation: props.orientation, compass: false, video: "" });
  const zoom = teleZoom(props.target.distM);

  // --- Kamerans ström: startas när vyn monteras och när sidan blir synlig igen; stoppas när den döljs eller stängs. ---
  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    const start = async (why: string) => {
      stopStream(stream.current);
      stream.current = null;
      try {
        const s = await openRearCamera();
        if (cancelled) { stopStream(s); return; }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        const settings = s.getVideoTracks()[0]?.getSettings?.();
        metrics.current.video = settings ? `${settings.width}×${settings.height}` : "";
        if (metrics.current.firstFrameMs == null) metrics.current.firstFrameMs = Math.round(performance.now() - t0);
        else metrics.current.restarts++;
        propsRef.current.onLog?.("camera_start", { why, video: metrics.current.video });
        setError(null);
      } catch (e) {
        const kind = cameraErrorKind(e);
        propsRef.current.onLog?.("camera_error", { kind, name: (e as { name?: string })?.name, message: String((e as Error)?.message ?? e) });
        if (!cancelled) setError(kind);
      }
    };
    void start("open");
    const vis = () => {
      if (document.hidden) { stopStream(stream.current); stream.current = null; propsRef.current.onLog?.("camera_hidden"); }
      else void start("visible");
    };
    // Svart ström efter bakgrund (iOS): begär om, högst var tredje sekund.
    const watchdog = setInterval(() => {
      if (!document.hidden && stream.current && streamLooksDead(stream.current, video.current)) void start("dead_stream");
    }, 3000);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelled = true; clearInterval(watchdog); document.removeEventListener("visibilitychange", vis); stopStream(stream.current); stream.current = null; if (video.current) video.current.srcObject = null; };
  }, []);

  // --- Orientering ---
  useEffect(() => {
    if (props.orientation !== "granted") return;
    const src = createOrientationSource();
    const vis = () => { if (document.hidden) src.stop(); else src.start((s) => { sample.current = s; }); };
    src.start((s) => { sample.current = s; });
    document.addEventListener("visibilitychange", vis);
    return () => { src.stop(); document.removeEventListener("visibilitychange", vis); };
  }, [props.orientation]);

  // --- En bildrutesloop: kurs → placering → utklipp. Vilar när sidan är dold. ---
  useEffect(() => {
    let raf = 0;
    const mountedAt = performance.now();
    let frames = 0, since = mountedAt;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      frames++;
      if (now - since >= 1000) {
        metrics.current.fps = Math.round((frames * 1000) / (now - since));
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        metrics.current.heapMB = mem ? Math.round(mem.usedJSHeapSize / 1e6) : null;
        frames = 0; since = now;
        propsRef.current.onMetrics?.({ ...metrics.current });
      }
      const P = propsRef.current;
      const tg = P.target;
      const s = sample.current;
      const a = anchor.current;
      let yaw: number | null = null, pitch = 0;
      if (s && s.gyroYawDeg != null) {
        if (s.compassDeg != null && !metrics.current.compass) { metrics.current.compass = true; setHasCompass(true); }
        // Ingen kompass 1,5 s efter öppning: förankra så att djuret står rakt fram där kameran pekar.
        if (!a.anchored && s.compassDeg == null && now - mountedAt > 1500) a.anchor(s.gyroYawDeg, tg.bearingDeg);
        yaw = a.push(s.gyroYawDeg, s.compassDeg, s.tMs);
        pitch = s.pitchDeg;
      } else if (P.orientation !== "granted") {
        // Inga sensorer: djuret står still rakt fram (ingen gyroförankring).
        yaw = tg.bearingDeg; pitch = 0;
      }
      const box = video.current?.parentElement;
      if (yaw == null || !box) { view.current = { yaw: null, pitch, placement: null }; setHintOnce("searching"); hide(); return; }
      const z = teleZoom(tg.distM);
      const pl = placeAnimal({ bearingDeg: tg.bearingDeg, distM: tg.distM, cameraYawDeg: yaw, cameraPitchDeg: pitch, animalHeightM: tg.heightM, zoom: z, verticalNudge: nudgeRef.current });
      view.current = { yaw, pitch, placement: pl };
      setHintOnce(pl.inFrame ? null : "out");
      const W = box.clientWidth, H = box.clientHeight;
      const el = img.current, sh = shadow.current;
      if (!el || !sh) return;
      const vw = viewFor(tg.headingDeg, tg.bearingDeg);
      const src = imageFor(tg.images, vw, tg.pose);
      if (el.getAttribute("src") !== src) el.setAttribute("src", src);
      const h = pl.heightFrac * H, w = h * tg.images.aspect;
      const x = pl.x * W - w / 2, y = pl.y * H - h;
      const blur = lookFor(distanceQuality(tg.distM, tg.photoDistM)).blurPx;
      el.style.display = "block";
      el.style.width = `${w}px`; el.style.height = `${h}px`;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${vw === "right" ? " scaleX(-1)" : ""}`;
      el.style.filter = blur > 0.3 ? `blur(${(blur * 0.6).toFixed(2)}px)` : "";
      sh.style.display = "block";
      sh.style.width = `${w * 0.84}px`; sh.style.height = `${Math.max(4, h * 0.12)}px`;
      sh.style.transform = `translate(${(pl.x * W - w * 0.42).toFixed(1)}px, ${(pl.y * H - Math.max(2, h * 0.06)).toFixed(1)}px)`;
    };
    let lastHint: string | null = "searching";
    const setHintOnce = (h: "searching" | "out" | null) => { if (h !== lastHint) { lastHint = h; setHint(h); } };
    const hide = () => { if (img.current) img.current.style.display = "none"; if (shadow.current) shadow.current.style.display = "none"; };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const shoot = async () => {
    const v = video.current, box = v?.parentElement;
    const pl = view.current.placement;
    if (!v || !box || !v.videoWidth || busy) return;
    setBusy(true);
    try {
      const tg = props.target;
      const z = teleZoom(tg.distM);
      const aspect = box.clientWidth / box.clientHeight;
      const size = outputSize(visibleCrop(v.videoWidth, v.videoHeight, aspect, z));
      const canvas = document.createElement("canvas");
      canvas.width = size.w; canvas.height = size.h;
      const ctx = canvas.getContext("2d")!;
      const q = distanceQuality(tg.distM, tg.photoDistM);
      const look = lookFor(q);
      const vw = viewFor(tg.headingDeg, tg.bearingDeg);
      let animal: Parameters<typeof drawComposite>[3]["animal"] = null;
      if (pl) animal = { img: await loadImage(imageFor(tg.images, vw, tg.pose)), imgAspect: tg.images.aspect, x: pl.x, y: pl.y, heightFrac: pl.heightFrac, mirror: vw === "right", blurPx: look.blurPx * (size.h / box.clientHeight) * 0.6, shadow: true };
      drawComposite(ctx, size.w, size.h, { video: v, videoW: v.videoWidth, videoH: v.videoHeight, viewAspect: aspect, zoom: z, animal, grain: look.grain, makeCanvas: (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; } });
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
      if (!blob) throw new Error("toBlob failed");
      props.onLog?.("photo", { bytes: blob.size, w: size.w, h: size.h, zoom: z, inFrame: pl?.inFrame ?? false });
      props.onShot({ blob, width: size.w, height: size.h, placement: pl ?? { x: 0.5, y: 0.5, heightFrac: 0, offAxisDeg: 180, inFrame: false }, zoom: z, quality: q });
    } catch (e) {
      props.onLog?.("photo_error", { message: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="camview" role="dialog" aria-modal="true" aria-label={t("camera.shutter")} data-testid="camera">
      <div className="cam-stage">
        <video ref={video} className="cam-video" playsInline muted autoPlay style={{ transform: `scale(${zoom})` }} />
        <div ref={shadow} className="cam-shadow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} className="cam-animal" alt="" data-testid="cam-animal" />
        <div className="cam-look" aria-hidden="true" />
      </div>
      <div className="cam-top">
        <span className="chip">{t("camera.zoom", { z: zoom.toFixed(1) })}</span>
        {!hasCompass && props.orientation === "granted" && <span className="chip warn">{t("camera.noCompass")}</span>}
        {props.orientation === "denied" && <span className="chip warn">{t("camera.orientationDenied")}</span>}
      </div>
      {error && <div className="toast" role="alert">{t(`camera.error.${error}`)}</div>}
      {!error && (props.blockedReason || hint) && <div className="cam-hint" role="status">{props.blockedReason ?? (hint === "out" ? t("camera.outOfFrame") : t("camera.searching"))}</div>}
      <label className="cam-nudge">
        <span className="sr">{t("camera.height")}</span>
        <input type="range" min={-0.3} max={0.3} step={0.01} value={nudge} onChange={(e) => setNudge(Number(e.target.value))} aria-label={t("camera.height")} />
      </label>
      <div className="cam-bottom">
        <button className="xbtn" onClick={props.onClose} aria-label={t("camera.close")}>✕</button>
        <button className="shutter" onClick={shoot} disabled={!props.canShoot || !!error || busy} aria-label={t("camera.shutter")} data-testid="shutter" />
        <span style={{ width: 40 }} />
      </div>
    </div>
  );
}

function imageFor(images: AnimalImages, v: View, pose: Pose): string {
  return v === "front" ? images.front[pose] : v === "back" ? images.back[pose] : images.side[pose];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
}

/** Anropas i klickhanteraren som öppnar kameran (iOS kräver en användargest för rörelsesensorerna). */
export async function prepareCameraView(): Promise<OrientationStatus> {
  return createOrientationSource().requestPermission();
}
