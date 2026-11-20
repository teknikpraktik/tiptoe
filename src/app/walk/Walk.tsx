"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { CloseButton } from "../_client/Modal";
import { useT } from "../_client/i18n";
import { usePosition } from "../_client/usePosition";

const GameMap = dynamic(() => import("../_client/GameMap"), { ssr: false });

/** Kartsidan: spelarens position på kartan. Spelloopen byggs ovanpå i steg 5. */
export function Walk() {
  const t = useT();
  const p = usePosition();
  const [follow, setFollow] = useState(true);
  const [trackUp, setTrackUp] = useState(false);
  return (
    <main className="mapshell">
      <GameMap player={p.pos} accuracyM={p.accuracyM} heading={p.headingDeg} trackUp={trackUp} follow={follow} onUserMove={() => setFollow(false)} scale />
      <div className="statusbar" data-testid="status">
        <CloseButton href="/" />
        <span className={`gps q-${p.quality}`}>{t(`gps.quality.${p.quality}`)}{p.accuracyM != null && p.quality !== "unavailable" ? ` ${t("gps.accuracy", { m: Math.round(p.accuracyM) })}` : ""}</span>
      </div>
      {p.error && <div className="toast" role="alert">{t(`gps.error.${p.error}`)}</div>}
      {!p.pos && !p.error && <div className="toast">{t("map.locating")}</div>}
      <div className="controls">
        <button className="btn small" onClick={() => setTrackUp((v) => !v)}>{trackUp ? t("map.trackUp") : t("map.northUp")}</button>
        {!follow && <button className="btn small" onClick={() => setFollow(true)}>{t("map.follow")}</button>}
      </div>
    </main>
  );
}
