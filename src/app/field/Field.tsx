// Origin: teknikpraktik/solosurvival@033a121 src/app/field/Field.tsx (kategori B: fältdiagnostik). Innehållet är nytt.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PLAUSIBLE_SPEED_MPS } from "@/config/gps";
import { GpsFilter } from "@/gps/filters/filter";
import { GpsProvider } from "@/gps/provider/provider";
import type { GpsQuality } from "@/gps/types";
import { deleteLog, listLogs, type FieldLogData } from "@/play/fieldlog";
import { currentTempo, StepDetector } from "@/sensors/tempo";
import { BUILD_ID } from "../_client/build";
import { createMotionSource } from "../_client/motionSource";
import { PageHeader } from "../_client/Modal";
import { createOrientationSource } from "../_client/orientationSource";
import { debugEnabled, useSession, useWalkView } from "../_client/SessionProvider";
import { useT } from "../_client/i18n";
import { isStandalone } from "../_client/install";
import { shareOrDownload } from "../_client/share";
import { Repo } from "@/storage/repo";

/** Diagnostiksidan för fälttestet (spec/prompt steg 6): GPS, lagring, persist(), wake lock, sensorer och exporterbar logg. */
export function Field() {
  const t = useT();
  const ctx = useSession();
  const v = useWalkView();
  const yn = (b: boolean | null | undefined) => (b == null ? t("field.unknown") : b ? t("field.yes") : t("field.no"));
  const [env, setEnv] = useState<{ secure: boolean; standalone: boolean; wakeLock: boolean; storage: string; persisted: boolean | null } | null>(null);
  const [logs, setLogs] = useState<FieldLogData[]>([]);
  const [gps, setGps] = useState<{ q: GpsQuality; acc: number | null; pos: string; err: string | null } | null>(null);
  const [motion, setMotion] = useState<string | null>(null);
  const [compass, setCompass] = useState<string | null>(null);
  const stops = useRef<(() => void)[]>([]);
  const [debug, setDebug] = useState(false);
  useEffect(() => setDebug(debugEnabled()), []);

  const refresh = useCallback(async () => {
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
    setEnv({ secure: window.isSecureContext, standalone: isStandalone(), wakeLock: "wakeLock" in navigator, storage: est ? `${((est.usage ?? 0) / 1e6).toFixed(1)} MB / ${((est.quota ?? 0) / 1e6).toFixed(0)} MB` : t("field.notSupported"), persisted });
    if (ctx?.db) setLogs(await listLogs(ctx.db));
  }, [ctx?.db, t]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => stops.current.forEach((f) => f()), []);

  const testGps = () => {
    const p = new GpsProvider(navigator.geolocation);
    const f = new GpsFilter({ maxPlausibleSpeedMps: MAX_PLAUSIBLE_SPEED_MPS });
    p.start((e) => {
      if (e.type === "error") { setGps((g) => ({ q: "unavailable", acc: null, pos: g?.pos ?? "–", err: t(`gps.error.${e.code}`) })); return; }
      const o = f.push(e.fix, e.receivedAtMs);
      setGps({ q: o.quality, acc: e.fix.accuracyM, pos: o.position ? `${o.position.lat.toFixed(5)}, ${o.position.lon.toFixed(5)}` : "–", err: null });
    });
    stops.current.push(() => p.stop());
  };
  const testMotion = async () => {
    const m = createMotionSource();
    if (!m) { setMotion(t("field.notSupported")); return; }
    if ((await m.requestPermission()) !== "granted") { setMotion(t("field.denied")); return; }
    const d = new StepDetector();
    m.start((mag, tMs) => d.push(mag, tMs));
    const h = setInterval(() => { const now = performance.timeOrigin + performance.now(); const tp = currentTempo(d, now, null); setMotion(t("field.cadence", { hz: d.cadenceAt(now).toFixed(1), tempo: t(`tempo.${tp.tempo}`) })); }, 500);
    stops.current.push(() => { clearInterval(h); m.stop(); });
  };
  const testCompass = async () => {
    const o = createOrientationSource();
    const st = await o.requestPermission();
    if (st !== "granted") { setCompass(st === "denied" ? t("field.denied") : t("field.notSupported")); return; }
    o.start((s) => setCompass(t("field.compassLine", { c: s.compassDeg != null ? `${Math.round(s.compassDeg)}°` : t("field.unknown"), g: s.gyroYawDeg != null ? `${Math.round(s.gyroYawDeg)}°` : t("field.unknown"), p: `${Math.round(s.pitchDeg)}°` })));
    stops.current.push(() => o.stop());
  };
  const exportLog = async (l: FieldLogData) => {
    if (!confirm(t("field.exportWarn"))) return;
    const repo = ctx?.db ? new Repo(ctx.db) : null;
    const profileId = v?.profile?.id ?? "p1";
    const track = repo ? await repo.track(profileId, l.walkId) : [];
    const body = JSON.stringify({ ...l, track: track.map((p) => [p.tMs, Math.round(p.lat * 1e6) / 1e6, Math.round(p.lon * 1e6) / 1e6, Math.round(p.accuracyM)]) }, null, 1);
    await shareOrDownload(new Blob([body], { type: "application/json" }), `tiptoe-log-${l.walkId}.json`, t("field.logTitle"));
  };
  const toggleDebug = () => { try { localStorage.setItem("tiptoe.debug", debugEnabled() ? "off" : "on"); } catch { /* privat läge */ } location.reload(); };
  const current = ctx?.session.currentLog()?.data;

  return (
    <main className="page">
      <PageHeader title={t("field.title")} />
      <div className="pagebody">
        <p className="muted">{t("field.intro")}</p>
        <Link className="btn small" href="/field/camera">{t("spike.title")}</Link>
        <div className="card stats" data-testid="field-env">
          <div className="stat"><span>{t("field.secure")}</span><b>{yn(env?.secure)}</b></div>
          <div className="stat"><span>{t("field.standalone")}</span><b>{yn(env?.standalone)}</b></div>
          <div className="stat"><span>{t("field.wakeLock")}</span><b>{env ? (env.wakeLock ? t("field.yes") : t("field.notSupported")) : "–"}</b></div>
          <div className="stat"><span>{t("field.storage")}</span><b>{env?.storage ?? "–"}</b></div>
          <div className="stat"><span>{t("field.persist")}</span><b data-testid="persisted">{yn(env?.persisted)}</b></div>
          <div className="stat"><span>{t("field.version")}</span><b>{BUILD_ID}</b></div>
          <button className="btn small" onClick={async () => { await navigator.storage?.persist?.(); await refresh(); }}>{t("field.persistAsk")}</button>
        </div>
        <div className="card stats">
          <h3>{t("field.gps")}</h3>
          {v?.stage === "walking" ? (
            <>
              <div className="stat"><span>{t("field.quality")}</span><b>{t(`gps.quality.${v.quality}`)} {v.accuracyM != null ? `±${Math.round(v.accuracyM)} m` : ""}</b></div>
              <div className="stat"><span>{t("field.position")}</span><b>{v.pos ? `${v.pos.lat.toFixed(5)}, ${v.pos.lon.toFixed(5)}` : "–"}</b></div>
            </>
          ) : gps ? (
            <>
              <div className="stat"><span>{t("field.quality")}</span><b>{t(`gps.quality.${gps.q}`)} {gps.acc != null ? `±${Math.round(gps.acc)} m` : ""}</b></div>
              <div className="stat"><span>{t("field.position")}</span><b>{gps.pos}</b></div>
              {gps.err && <p className="muted">{gps.err}</p>}
            </>
          ) : <button className="btn small" onClick={testGps}>{t("field.gpsStart")}</button>}
        </div>
        <div className="card stats">
          <div className="stat"><span>{t("field.motion")}</span><b>{motion ?? (v?.stage === "walking" ? `${t(`tempo.${v.tempo}`)} (${t(`field.source.${v.tempoSource}`)})` : "–")}</b></div>
          {!motion && <button className="btn small" onClick={testMotion}>{t("field.motionTest")}</button>}
          <div className="stat"><span>{t("field.compass")}</span><b>{compass ?? "–"}</b></div>
          {!compass && <button className="btn small" onClick={testCompass}>{t("field.compassTest")}</button>}
          <p className="muted">{t("field.battery")}</p>
        </div>
        {current && (
          <div className="card">
            <h3>{t("field.current")}</h3>
            <pre className="mono">{current.entries.slice(-15).map((e) => `${Math.round(e.t / 1000)}s ${e.k} ${e.d ? JSON.stringify(e.d) : ""}`).join("\n")}</pre>
          </div>
        )}
        <h3>{t("field.logs")}</h3>
        {!logs.length && <p className="muted">{t("field.noLogs")}</p>}
        {logs.map((l) => {
          const n = (k: string) => l.entries.filter((e) => e.k === k).length;
          return (
            <div className="card" key={l.walkId} data-testid="log">
              <p>{t("field.logLine", { date: l.startedAtIso.slice(0, 16).replace("T", " "), events: l.entries.length, encounters: n("animal_appear"), photos: n("photo_rated"), closures: n("reserve_closed") })}</p>
              <div className="row">
                <button className="btn small" onClick={() => void exportLog(l)}>{t("field.export")}</button>
                <button className="btn small ghost" onClick={async () => { if (ctx?.db && confirm(t("field.deleteConfirm"))) { await deleteLog(ctx.db, l.walkId); await refresh(); } }}>{t("field.delete")}</button>
              </div>
            </div>
          );
        })}
        <div className="row"><span className="muted">{t("field.debug")}</span><button className="btn small" onClick={toggleDebug}>{debug ? t("field.debugOff") : t("field.debugOn")}</button></div>
      </div>
    </main>
  );
}
